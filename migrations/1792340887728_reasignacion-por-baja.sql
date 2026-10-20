-- Up Migration
-- H3 grupo 5, tarea 5.1 (agenda-y-reserva): reasignación por baja médica. Ver design.md, D9. No crea tablas.
--
-- Orden obligatorio del flujo (ADR-0011): primero se registra el bloqueo de la baja, luego se reasignan las citas. La
-- excepción de la ventana de 1 hora la da la condición de datos que validar_cancelacion() ya evalúa (existe un bloqueo
-- del mismo médico que cubre la cita); el disparador no se toca.
--
-- Todo lo de aquí es SECURITY INVOKER: corre con la RLS del rol que llama. El paciente y la enfermera no ven filas de la
-- vista, y las dos funciones exigen administrativo y fallan con 42501 si no. search_path vacío y nombres calificados.
-- Código de error propio nuevo: UC003 = «esta reasignación no corresponde a la baja registrada» (bloqueo que no es del
-- médico de la cita o no la cubre, sustituto de otra especialidad, inactivo o el mismo médico).

-- Citas vigentes y no terminadas del médico que un bloqueo suyo alcanza. Se calcula en cada consulta: no hay estado
-- «por contactar» que pueda quedar desincronizado; la cita sale sola al reprogramarla, cancelarla, acortar el bloqueo o
-- cuando termina. Un médico ve únicamente las suyas (su RLS sobre citas y bloqueos); el paciente no ve bloqueos, así que
-- su unión queda vacía aun para sus propias citas. No une pacientes a propósito (el médico no lee a los pacientes que no
-- tiene a cargo): la pantalla del administrativo trae el nombre, el documento y el contacto con su propia consulta.
create view public.citas_por_reasignar with (security_invoker = true) as
select
  c.id as cita_id, b.id as bloqueo_id, c.medico_id, m.especialidad_id, c.paciente_id,
  c.inicio, c.fin, c.estado
from public.citas c
join public.bloqueos_agenda b on b.medico_id = c.medico_id and b.rango && c.rango
join public.medicos m on m.id = c.medico_id
where c.estado in ('reservada', 'confirmada')
  and c.fin > now()
  and upper(b.rango) > now();

revoke all on public.citas_por_reasignar from public;
grant select on public.citas_por_reasignar to authenticated;

-- Sugerencias de reasignación para cada cita afectada por un bloqueo. Solo propone: no cambia nada. Candidatos: médicos
-- activos de la MISMA especialidad que el de la cita y distintos de él, con un slot libre (slots_disponibles ya descarta
-- citas, bloqueos y pasado) desde la fecha de la cita hasta p_dias después, y que no se cruce con otra cita vigente del
-- propio paciente (la original no cuenta: la nueva la reemplaza). Orden: día (0 = el mismo), cercanía de la hora del día
-- a la original, hora de inicio, médico. `mismo_horario` marca el mismo día y la misma hora. Los slots se calculan una
-- vez por (médico candidato, fecha) y no por cita.
create function public.propuestas_reasignacion(p_bloqueo uuid, p_dias integer default 7, p_max integer default 3)
returns table (cita_id uuid, medico_id uuid, inicio timestamptz, fin timestamptz, mismo_horario boolean)
language plpgsql stable set search_path = ''
as $f$
#variable_conflict use_column
begin
  if public.rol_actual() is distinct from 'administrativo' then
    raise exception 'No tiene permiso para consultar reasignaciones' using errcode = '42501';
  end if;
  p_dias := least(greatest(coalesce(p_dias, 7), 0), 30);
  p_max  := least(greatest(coalesce(p_max, 3), 1), 10);

  return query
  with afectadas as materialized (
    select c.id as cita_id, c.paciente_id, c.medico_id, c.inicio, c.fin, m.especialidad_id,
           (c.inicio at time zone 'America/Lima')::date as fecha,
           (c.inicio at time zone 'America/Lima')::time as hora
    from public.bloqueos_agenda b
    join public.citas c on c.medico_id = b.medico_id and c.rango && b.rango
    join public.medicos m on m.id = c.medico_id
    where b.id = p_bloqueo
      and c.estado in ('reservada', 'confirmada')
      and c.fin > now()
  ),
  fechas as materialized (
    select distinct a.fecha + k as fecha from afectadas a, generate_series(0, p_dias) k
  ),
  sustitutos as materialized (
    select s.id, s.especialidad_id
    from public.medicos s
    where s.activo and s.especialidad_id in (select a.especialidad_id from afectadas a)
  ),
  -- MATERIALIZED: sin esto el planificador integra el CTE en la consulta lateral de abajo y recalcularía los slots
  -- una vez por cita afectada en vez de una vez por (médico candidato, fecha).
  libres as materialized (
    select su.id as medico_id, su.especialidad_id, f.fecha, sl.inicio, sl.fin
    from sustitutos su
    cross join fechas f
    cross join lateral public.slots_disponibles(su.id, f.fecha) sl
  )
  select a.cita_id, t.medico_id, t.inicio, t.fin, t.mismo_horario
  from afectadas a
  cross join lateral (
    -- Se ordenan los candidatos primero y se descartan los que chocan con otra cita del paciente DESPUÉS, sobre el
    -- flujo ya ordenado y hasta reunir p_max: comprobarlo para cada candidato (cientos por cita) sería el costo dominante.
    -- OFFSET 0 impide que el planificador empuje el NOT EXISTS dentro del orden.
    select o.medico_id, o.inicio, o.fin, o.mismo_horario
    from (
      select l.medico_id, l.inicio, l.fin, (l.inicio = a.inicio and l.fin = a.fin) as mismo_horario
      from libres l
      where l.especialidad_id = a.especialidad_id
        and l.medico_id <> a.medico_id
        and l.fecha between a.fecha and a.fecha + p_dias
      order by (l.fecha - a.fecha),
               abs(extract(epoch from ((l.inicio at time zone 'America/Lima')::time - a.hora))),
               l.inicio, l.medico_id
      offset 0
    ) o
    where not exists (
      select 1 from public.citas x
      where x.paciente_id = a.paciente_id
        and x.id <> a.cita_id
        and x.estado in ('reservada', 'confirmada')
        and x.rango && tstzrange(o.inicio, o.fin, '[)')
    )
    limit p_max
  ) t
  order by a.inicio, a.cita_id;
end
$f$;

-- Reasigna UNA cita afectada por una baja a un sustituto, en una transacción (la llamada). Valida en la base, aunque se
-- invoque directamente, que la excepción de la ventana de 1 hora corresponda a una baja real: el bloqueo es del médico de
-- la cita y la cubre, y el destino es un médico activo de la misma especialidad y distinto del original. Delega en
-- reprogramar_cita (cancela antes de insertar; la nueva nace `reservada` y apunta a la original). No toca
-- asignaciones_paciente_medico: el sustituto no obtiene acceso a la historia por recibir la cita (ADR-0016).
create function public.reasignar_cita_por_baja(
  p_cita uuid, p_bloqueo uuid, p_medico uuid, p_inicio timestamptz, p_fin timestamptz
)
returns uuid
language plpgsql set search_path = ''
as $f$
declare
  v_cita public.citas%rowtype;
begin
  if public.rol_actual() is distinct from 'administrativo' then
    raise exception 'No tiene permiso para reasignar citas' using errcode = '42501';
  end if;

  select * into v_cita from public.citas where id = p_cita and estado in ('reservada', 'confirmada');
  if not found then
    raise exception 'La cita ya no está vigente' using errcode = 'UC002';
  end if;

  if not exists (
    select 1 from public.bloqueos_agenda b
    where b.id = p_bloqueo and b.medico_id = v_cita.medico_id and b.rango && v_cita.rango
  ) then
    raise exception 'El bloqueo indicado no corresponde a la cita' using errcode = 'UC003';
  end if;

  if not exists (
    select 1
    from public.medicos original
    join public.medicos sustituto on sustituto.especialidad_id = original.especialidad_id
    where original.id = v_cita.medico_id
      and sustituto.id = p_medico
      and sustituto.id <> original.id
      and sustituto.activo
  ) then
    raise exception 'El médico elegido no puede sustituir al de la cita' using errcode = 'UC003';
  end if;

  return public.reprogramar_cita(p_cita, p_medico, p_inicio, p_fin, null);
end
$f$;

revoke execute on function public.propuestas_reasignacion(uuid, integer, integer)                       from public;
revoke execute on function public.reasignar_cita_por_baja(uuid, uuid, uuid, timestamptz, timestamptz)   from public;
grant  execute on function public.propuestas_reasignacion(uuid, integer, integer)                       to authenticated;
grant  execute on function public.reasignar_cita_por_baja(uuid, uuid, uuid, timestamptz, timestamptz)   to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
