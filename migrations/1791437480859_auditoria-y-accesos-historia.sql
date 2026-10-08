-- Up Migration
-- H2 grupo 7, tarea 7.3 (esquema-rls-pgtap): auditoría de escritura y de lectura de historias clínicas.
-- Fuente: TECH-DESIGN.md, "Notificaciones y auditoría". Sin el registro de accesos, «un médico no accede a
-- historias de pacientes que no tiene a cargo» no es verificable tras un incidente.

-- Auditoría de escritura, alimentada por disparadores (tarea 7.4).
create table auditoria (
  id            bigserial primary key,
  actor_id      uuid,
  actor_rol     rol_usuario,
  accion        text not null,          -- INSERT | UPDATE | DELETE
  tabla         text not null,
  registro_id   text not null,
  datos_antes   jsonb,
  datos_despues jsonb,
  creado_en     timestamptz not null default now()
);

-- Auditoría de LECTURA de historias clínicas: la escribe la Server Action que abre una historia.
create table accesos_historia (
  id          bigserial primary key,
  actor_id    uuid not null,
  paciente_id uuid not null,
  atencion_id uuid,
  creado_en   timestamptz not null default now()
);

create index accesos_historia_paciente_idx on accesos_historia (paciente_id, creado_en desc);

alter table auditoria        enable row level security;
alter table accesos_historia enable row level security;

-- Solo-agregar para todos, incluido el dueño: un registro de auditoría que se puede editar no sirve.
create function public.proteger_registro_de_auditoria()
returns trigger
language plpgsql set search_path = ''
as $f$
begin
  raise exception 'Los registros de auditoría no se modifican ni se eliminan' using errcode = '42501';
end
$f$;

create trigger auditoria_solo_agregar
  before update or delete on public.auditoria
  for each row execute function public.proteger_registro_de_auditoria();

create trigger accesos_historia_solo_agregar
  before update or delete on public.accesos_historia
  for each row execute function public.proteger_registro_de_auditoria();

-- auditoria: la lee el administrativo (revisión); la escriben solo los disparadores (SECURITY DEFINER).
grant select on public.auditoria to authenticated;

create policy auditoria_lee_el_administrativo on public.auditoria
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

-- accesos_historia: el médico registra sus propios accesos a pacientes que tiene a cargo (no puede inventar
-- accesos a nombre de otro ni de pacientes ajenos); el administrativo los revisa. USAGE de la secuencia: la
-- columna id es bigserial y el INSERT del médico la usa.
grant select, insert on public.accesos_historia to authenticated;
grant usage on sequence public.accesos_historia_id_seq to authenticated;

create policy accesos_registra_el_medico on public.accesos_historia
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'medico'
    and actor_id = (select public.perfil_actual())
    and (select public.medico_tiene_paciente(paciente_id))
  );

create policy accesos_lee_el_administrativo on public.accesos_historia
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
