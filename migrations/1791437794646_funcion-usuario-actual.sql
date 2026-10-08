-- Up Migration
-- H2 grupo 8, tarea 8.2 (esquema-rls-pgtap): public.usuario_actual() devuelve el identificador de Clerk (`sub`) de la
-- sesión que Postgres validó. Sirve para comprobar de extremo a extremo que la base reconoce al usuario que la
-- aplicación dice atender (ruta /api/db-sesion y su prueba E2E). SECURITY DEFINER con search_path vacío, como toda
-- función que lee auth.* (authenticated no tiene USAGE sobre ese esquema): docs/spike-rls-h2.md.
create function public.usuario_actual()
returns text
language sql stable security definer set search_path = ''
as $f$ select auth.user_id() $f$;

revoke execute on function public.usuario_actual() from public;
grant  execute on function public.usuario_actual() to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
