-- Up Migration
-- H2 (esquema-rls-pgtap): public.rol_actual(), el único lugar donde se lee el rol del token (design.md, D5).

-- El token de sesión de Clerk lleva el rol en publicMetadata.rol (anidado), no como `rol` de primer
-- nivel (docs/03-arquitectura/spike-rls-h2.md). Si esa ruta cambia, se cambia esta función y no cada política.
--
-- SECURITY DEFINER con search_path vacío: `authenticated` no tiene USAGE sobre el esquema `auth`
-- (es de cloud_admin y no se puede conceder), así que una función invoker que lea auth.* falla con
-- «permission denied for schema auth». Toda función que toque auth.* sigue este mismo patrón.
create function public.rol_actual()
returns text
language sql stable security definer set search_path = ''
as $$ select auth.session() -> 'publicMetadata' ->> 'rol' $$;

revoke execute on function public.rol_actual() from public;
grant execute on function public.rol_actual() to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
