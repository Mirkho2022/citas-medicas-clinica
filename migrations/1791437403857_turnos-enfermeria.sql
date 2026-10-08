-- Up Migration
-- H2 grupo 7, tarea 7.1 (esquema-rls-pgtap): turnos de enfermería. Fuente: TECH-DESIGN.md, "Turnos de enfermería".
-- La enfermera consulta su turno y con qué médico o servicio trabaja; nada más (CLAUDE.md, matriz de roles).

create table turnos_enfermeria (
  id              uuid primary key default gen_random_uuid(),
  enfermera_id    uuid not null references enfermeras(id) on delete cascade,
  fecha           date not null,
  turno           tipo_turno not null,
  medico_id       uuid references medicos(id) on delete set null,
  especialidad_id uuid references especialidades(id) on delete set null,
  creado_en       timestamptz not null default now(),
  unique (enfermera_id, fecha, turno),
  check (medico_id is not null or especialidad_id is not null)
);

alter table turnos_enfermeria enable row level security;

-- Enfermera del usuario autenticado (análoga a medico_actual()). SECURITY DEFINER con search_path vacío.
create function public.enfermera_actual()
returns uuid
language sql stable security definer set search_path = ''
as $f$ select e.id from public.enfermeras e where e.perfil_id = public.perfil_actual() $f$;

revoke execute on function public.enfermera_actual() from public;
grant  execute on function public.enfermera_actual() to authenticated;

-- El administrativo gestiona los turnos; cada enfermera ve solo los suyos. Paciente y médico no ven ninguno.
grant select, insert, update, delete on public.turnos_enfermeria to authenticated;

create policy turnos_lee_la_enfermera_propia on public.turnos_enfermeria
  for select to authenticated
  using (
    (select public.rol_actual()) = 'enfermera'
    and enfermera_id = (select public.enfermera_actual())
  );

create policy turnos_gestiona_el_administrativo on public.turnos_enfermeria
  for all to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
