-- Up Migration
-- H3 grupo 3, tarea 3.1 (agenda-y-reserva): cálculo de slots en la base. Ver design.md, D3. No crea tablas.
--
-- Tres funciones y una sola definición de «slot»:
--  - slots_agenda: interna. Los slots de la plantilla vigente ese día para un médico activo, sin los que tocan un
--    bloqueo. No mira citas, ni la hora actual, ni el rol. Nadie la ejecuta salvo las otras dos.
--  - slots_disponibles: lo que ofrece la agenda: slots_agenda menos los que se cruzan con una cita reservada o
--    confirmada y menos los que ya empezaron. Solo (inicio, fin).
--  - horario_en_agenda: ¿[inicio, fin) es exactamente un slot de slots_agenda? Ignora las citas a propósito: de la
--    colisión se ocupa el EXCLUDE de citas, para que produzca 23P01 («Registro de cita ya agendado») y no «horario
--    no disponible».
--
-- Las dos públicas son SECURITY DEFINER: el paciente no lee bloqueos_agenda (los motivos de una licencia son datos
-- del personal) ni las citas de otros. Como INVOKER, la RLS le ocultaría las citas ajenas y los horarios ocupados
-- aparecerían libres. Como DEFINER el anti-join ve todas las filas, y lo único que sale es (inicio, fin) de lo que
-- queda libre: ni identificadores, ni pacientes, ni motivos. search_path vacío: sin él, un usuario podría crear
-- objetos en su esquema y secuestrar la resolución de nombres dentro de la función.
--
-- La fecha y el día de la semana salen siempre de la fecha de Lima: p_fecha es un día de calendario de la clínica y
-- las horas de la plantilla (hora_inicio, hora_fin) son hora de pared de Lima. Se convierten a instantes con
-- `at time zone 'America/Lima'`, de modo que la zona de la sesión no cambia el resultado.

create function public.slots_agenda(p_medico uuid, p_fecha date)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = ''
as $f$
  select s.inicio, s.fin
  from public.disponibilidades d
  join public.medicos m on m.id = d.medico_id and m.activo
  cross join lateral (
    select
      (p_fecha + d.hora_inicio + interval '1 minute' * (g.n * d.duracion_slot_min)) at time zone 'America/Lima' as inicio,
      (p_fecha + d.hora_inicio + interval '1 minute' * ((g.n + 1) * d.duracion_slot_min)) at time zone 'America/Lima' as fin
    from generate_series(
      0,
      floor(extract(epoch from (d.hora_fin - d.hora_inicio)) / 60 / d.duracion_slot_min)::int - 1
    ) as g(n)
  ) s
  where d.medico_id = p_medico
    and d.dia_semana = extract(dow from p_fecha)::int
    and d.vigente_desde <= p_fecha
    and (d.vigente_hasta is null or d.vigente_hasta >= p_fecha)
    and not exists (
      select 1 from public.bloqueos_agenda b
      where b.medico_id = p_medico and b.rango && tstzrange(s.inicio, s.fin, '[)')
    )
$f$;

create function public.slots_disponibles(p_medico uuid, p_fecha date)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = ''
as $f$
  select s.inicio, s.fin
  from public.slots_agenda(p_medico, p_fecha) s
  where (select public.rol_actual()) in ('administrativo', 'paciente')
    and s.inicio > now()
    and not exists (
      select 1 from public.citas c
      where c.medico_id = p_medico
        and c.estado in ('reservada', 'confirmada')
        and c.rango && tstzrange(s.inicio, s.fin, '[)')
    )
  order by s.inicio
$f$;

create function public.horario_en_agenda(p_medico uuid, p_inicio timestamptz, p_fin timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $f$
  select coalesce(
    (select public.rol_actual()) in ('administrativo', 'paciente')
    and exists (
      select 1
      from public.slots_agenda(p_medico, (p_inicio at time zone 'America/Lima')::date) s
      where s.inicio = p_inicio and s.fin = p_fin
    ),
    false
  )
$f$;

-- EXECUTE: ni siquiera authenticated puede llamar a la interna; las públicas, solo authenticated.
revoke execute on function public.slots_agenda(uuid, date)                          from public;
revoke execute on function public.slots_disponibles(uuid, date)                     from public;
revoke execute on function public.horario_en_agenda(uuid, timestamptz, timestamptz) from public;
grant  execute on function public.slots_disponibles(uuid, date)                     to authenticated;
grant  execute on function public.horario_en_agenda(uuid, timestamptz, timestamptz) to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
