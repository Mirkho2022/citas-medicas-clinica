-- Up Migration
-- H2 grupo 6, tarea 6.3 (esquema-rls-pgtap): «paciente a cargo» (ADR-0016). Es la ÚNICA fuente de acceso del
-- médico a las historias clínicas: riesgo principal del proyecto. Ver design.md, D3 y D6.

-- Fecha de hoy en la zona de la clínica. current_date depende del TimeZone del servidor (UTC en Neon) y a
-- las 19:00 de Lima ya sería «mañana»; CLAUDE.md fija America/Lima para todo lo que ve el negocio.
create function public.hoy_lima()
returns date
language sql stable
as $f$ select (now() at time zone 'America/Lima')::date $f$;

-- Append-only (ADR-0016): un cambio se expresa insertando una fila, no editando una existente.
create table asignaciones_paciente_medico (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references pacientes(id) on delete cascade,
  medico_id     uuid not null references medicos(id) on delete cascade,
  vigente_desde date not null default public.hoy_lima(),
  vigente_hasta date,
  motivo        text
  -- Sin CHECK de orden entre las fechas: una cita pasada ya vencida (datos de demostración o migración
  -- histórica) genera una asignación que nace vencida; no confiere acceso y el disparador no debe fallar.
);

create index asignaciones_paciente_idx on asignaciones_paciente_medico (paciente_id, medico_id);
-- Evita duplicar la asignación generada por una misma cita aunque la cita cambie de estado varias veces.
create unique index asignaciones_motivo_cita_unico on asignaciones_paciente_medico (motivo) where motivo like 'cita:%';

alter table asignaciones_paciente_medico enable row level security;

-- ¿El médico autenticado tiene a este paciente a su cargo? Única fuente: asignaciones vigentes (fechas en
-- Lima). Un médico dado de baja (medicos.activo = false) pierde el acceso aunque su asignación no haya vencido.
-- SECURITY DEFINER con search_path vacío: lee tablas que el médico no puede leer directamente.
create function public.medico_tiene_paciente(p_paciente uuid)
returns boolean
language sql stable security definer set search_path = ''
as $f$
  select exists (
    select 1
    from public.asignaciones_paciente_medico a
    join public.medicos m on m.id = a.medico_id and m.activo
    where a.paciente_id = p_paciente
      and a.medico_id = public.medico_actual()
      and a.vigente_desde <= public.hoy_lima()
      and (a.vigente_hasta is null or a.vigente_hasta >= public.hoy_lima())
  )
$f$;

revoke execute on function public.medico_tiene_paciente(uuid) from public;
grant  execute on function public.medico_tiene_paciente(uuid) to authenticated;

-- Otorga acceso automáticamente cuando una cita llega por primera vez a confirmada o atendida (ADR-0016).
-- SECURITY DEFINER: no depende de que quien confirma la cita tenga permiso de escribir asignaciones.
-- Cambios respecto del SQL de ADR-0016: usa TG_OP en vez de `old is null` (frágil en un disparador de
-- INSERT), calcula las fechas en America/Lima y no duplica la asignación de una misma cita.
create function public.extender_asignacion_por_cita()
returns trigger
language plpgsql security definer set search_path = ''
as $f$
begin
  if new.estado in ('confirmada', 'atendida')
     and (tg_op = 'INSERT' or old.estado not in ('confirmada', 'atendida'))
     and not exists (
       select 1 from public.asignaciones_paciente_medico a where a.motivo = 'cita:' || new.id
     ) then
    insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo)
    values (
      new.paciente_id, new.medico_id, public.hoy_lima(),
      ((new.inicio at time zone 'America/Lima')::date + interval '6 months')::date,
      'cita:' || new.id
    );
  end if;
  return new;
end
$f$;

revoke execute on function public.extender_asignacion_por_cita() from public;

create trigger citas_extender_asignacion
  after insert or update on public.citas
  for each row execute function public.extender_asignacion_por_cita();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
