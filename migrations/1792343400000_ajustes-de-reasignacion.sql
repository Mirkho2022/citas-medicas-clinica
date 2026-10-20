-- Up Migration
-- H3 6.4, hallazgos (2) y (3) de la revisión del SQL (agenda-y-reserva). No crea tablas ni cambia permisos.
--
-- (2) citas_por_reasignar con un bloqueo sin fecha de fin. `bloqueos_agenda.rango` admite `tstzrange(x, null)` y
-- `validar_cancelacion` ya le aplica la excepción de la ventana de 1 hora (solo mira `rango && cita.rango`), pero la vista
-- filtraba `upper(b.rango) > now()`: con el límite superior infinito `upper()` es nulo, la condición no es verdadera y la
-- vista no devolvía ninguna cita de una baja sin fecha de regreso. Una baja abierta alcanza a toda cita futura del médico,
-- así que se trata como vigente. No se añade un CHECK que prohíba el rango abierto: la base lo permite hoy (la Zod pide el
-- fin en la pantalla) y un CHECK exigiría validar filas existentes y cambiaría lo que la base acepta.
create or replace view public.citas_por_reasignar with (security_invoker = true) as
select
  c.id as cita_id, b.id as bloqueo_id, c.medico_id, m.especialidad_id, c.paciente_id,
  c.inicio, c.fin, c.estado
from public.citas c
join public.bloqueos_agenda b on b.medico_id = c.medico_id and b.rango && c.rango
join public.medicos m on m.id = c.medico_id
where c.estado in ('reservada', 'confirmada')
  and c.fin > now()
  and (upper_inf(b.rango) or upper(b.rango) > now());

-- (3) Orden de propuestas_reasignacion. Dentro de la consulta lateral los candidatos salen ordenados (día, cercanía de la
-- hora, hora de inicio, médico), pero la consulta externa solo ordenaba por cita: SQL no garantiza que el orden de un
-- subselect se conserve a través de un join lateral, así que «el mismo horario primero» dependía del plan. Ahora cada
-- candidato lleva su posición (`row_number() over ()` sobre el flujo ya ordenado y filtrado, antes del límite) y la salida
-- se ordena por cita y por esa posición. El resto de la función es igual a la de 1792340887728.
create or replace function public.propuestas_reasignacion(p_bloqueo uuid, p_dias integer default 7, p_max integer default 3)
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
    -- OFFSET 0 impide que el planificador empuje el NOT EXISTS dentro del orden. `orden` numera ese flujo (el WHERE se
    -- evalúa antes que la ventana y el LIMIT corta después) para que la salida lo conserve.
    select o.medico_id, o.inicio, o.fin, o.mismo_horario, row_number() over () as orden
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
  order by a.inicio, a.cita_id, t.orden;
end
$f$;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
