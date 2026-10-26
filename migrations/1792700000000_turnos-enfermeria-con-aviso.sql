-- Up Migration
-- H7 grupo 2, tarea 2.3 (turnos-y-dashboard): vista public.turnos_enfermeria_con_aviso. Ver design.md, D1 y D8. No crea tablas.
--
-- Qué muestra: los turnos de enfermería de hoy en adelante (día de Lima) cuya situación pide la atención del administrativo:
--   enfermera_de_baja  la enfermera del turno está dada de baja (`enfermeras.activo` falso);
--   medico_de_baja     el médico del turno está dado de baja (`medicos.activo` falso);
--   bloqueo_de_agenda  existe un bloqueo de agenda del médico cuyo rango se solapa con el día de Lima de la `fecha` del turno
--                      (un bloqueo parcial, p. ej. 15:00–17:00, marca todo el día: las franjas no tienen horas; es un aviso para
--                      que el administrativo revise, no una orden).
-- Una fila por turno, con TODAS sus causas en `causas` (arreglo ordenado). Es un aviso, no un efecto: la vista no modifica ni
-- quita turnos, y desaparece sola cuando el administrativo cambia el médico o la enfermera.
--
-- Seguridad: es SECURITY INVOKER (PostgreSQL 15+), así que cada tabla se evalúa con la RLS de quien consulta; una vista normal
-- correría con los privilegios del dueño (BYPASSRLS) y se saltaría la RLS de turnos_enfermeria, bloqueos_agenda y perfiles. Además
-- filtra por rol_actual() = 'administrativo' como segundo cerrojo: aunque alguien concediera por error más acceso a las tablas,
-- los demás roles recibirían cero filas (la enfermera dueña del turno incluida). NO expone `bloqueos_agenda.motivo` (puede ser
-- información personal, p. ej. una licencia médica): solo la causa genérica.

create view public.turnos_enfermeria_con_aviso with (security_invoker = true) as
select
  x.turno_id,
  x.enfermera_id,
  x.enfermera_nombres,
  x.enfermera_apellidos,
  x.fecha,
  x.turno,
  x.medico_id,
  x.medico_nombres,
  x.medico_apellidos,
  x.especialidad_id,
  x.causas
from (
  select
    t.id as turno_id,
    t.enfermera_id,
    pe.nombres as enfermera_nombres,
    pe.apellidos as enfermera_apellidos,
    t.fecha,
    t.turno,
    t.medico_id,
    pm.nombres as medico_nombres,
    pm.apellidos as medico_apellidos,
    t.especialidad_id,
    array_remove(array[
      case when not e.activo then 'enfermera_de_baja' end,
      case when m.id is not null and not m.activo then 'medico_de_baja' end,
      case when exists (
        select 1
        from public.bloqueos_agenda b
        where b.medico_id = t.medico_id
          -- El día de Lima de la fecha: [00:00 Lima, 00:00 Lima del día siguiente). Perú no tiene horario de verano.
          and b.rango && tstzrange(
            t.fecha::timestamp at time zone 'America/Lima',
            (t.fecha + 1)::timestamp at time zone 'America/Lima',
            '[)'
          )
      ) then 'bloqueo_de_agenda' end
    ], null) as causas
  from public.turnos_enfermeria t
  join public.enfermeras e on e.id = t.enfermera_id
  join public.perfiles pe on pe.id = e.perfil_id
  left join public.medicos m on m.id = t.medico_id
  left join public.perfiles pm on pm.id = m.perfil_id
  where (select public.rol_actual()) = 'administrativo'
    and t.fecha >= public.hoy_lima()
) x
where cardinality(x.causas) > 0;

-- Solo authenticated la lee (la política de cada tabla subyacente decide el resto) y nadie la escribe; `anonymous` y `public` nada.
revoke all on public.turnos_enfermeria_con_aviso from public;
grant select on public.turnos_enfermeria_con_aviso to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
