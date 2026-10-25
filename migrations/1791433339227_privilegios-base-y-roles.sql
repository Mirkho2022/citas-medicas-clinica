-- Up Migration
-- H2 (esquema-rls-pgtap): privilegios base y roles de servicio. Ver design.md, D4, y docs/03-arquitectura/spike-rls-h2.md.

-- 1) Privilegios por defecto. Neon dejó ALTER DEFAULT PRIVILEGES que dan a `authenticated`
--    INSERT/SELECT/UPDATE/DELETE sobre toda tabla nueva de `public`, USAGE de secuencias y EXECUTE de
--    funciones: una tabla creada sin RLS quedaría abierta. Se revocan: cada tabla recibe su GRANT
--    explícito, alineado con sus políticas. Sin FOR ROLE: afecta al rol que migra (neondb_owner).
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on functions from authenticated;
-- Nota: PostgreSQL concede EXECUTE a PUBLIC en toda función nueva y ese valor global no se puede quitar
-- con la forma IN SCHEMA (la global rompería las funciones de pgTAP en las pruebas). Por eso las
-- funciones sensibles revocan EXECUTE de PUBLIC y lo conceden de forma explícita, una a una.

-- 2) La tabla de control de node-pg-migrate se creó con los privilegios abiertos de arriba: nadie
--    salvo el dueño debe poder leer ni alterar el historial de migraciones.
revoke all on table public.pgmigrations from authenticated, anonymous;
alter table public.pgmigrations enable row level security;

-- 3) Roles. `authenticated` ya existe en Neon (tráfico de usuario); se crea solo si falta, por
--    ejemplo en una base nueva. Los dos roles de servicio nacen NOLOGIN y sin privilegios; el LOGIN y la
--    contraseña se fijan por entorno fuera del repositorio (docs/), nunca en una migración.
do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'cron_notificaciones') then
    create role cron_notificaciones nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'sync_identidad') then
    create role sync_identidad nologin;
  end if;
end
$$;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
