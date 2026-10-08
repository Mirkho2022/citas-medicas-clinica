-- Up Migration
-- H2 grupo 4 (esquema-rls-pgtap): resuelven el usuario autenticado (id de Clerk, texto) a las filas internas
-- (uuid) que el resto del esquema referencia. Fuente: TECH-DESIGN.md, "Funciones de apoyo", y ADR-0023.
--
-- Las tres son SECURITY DEFINER con search_path vacío: authenticated no tiene USAGE sobre el esquema
-- auth ni privilegios sobre perfiles/pacientes/medicos, y estas funciones no deben abrírselos (solo
-- devuelven el id del propio usuario). Sin search_path vacío, un usuario podría crear objetos en su
-- esquema y secuestrar la resolución de nombres dentro de la función.

create function public.perfil_actual()
returns uuid
language sql stable security definer set search_path = ''
as $$ select pf.id from public.perfiles pf where pf.clerk_user_id = auth.user_id() $$;

create function public.paciente_actual()
returns uuid
language sql stable security definer set search_path = ''
as $$ select p.id from public.pacientes p where p.perfil_id = public.perfil_actual() $$;

create function public.medico_actual()
returns uuid
language sql stable security definer set search_path = ''
as $$ select m.id from public.medicos m where m.perfil_id = public.perfil_actual() $$;

revoke execute on function public.perfil_actual()   from public;
revoke execute on function public.paciente_actual() from public;
revoke execute on function public.medico_actual()   from public;
grant  execute on function public.perfil_actual()   to authenticated;
grant  execute on function public.paciente_actual() to authenticated;
grant  execute on function public.medico_actual()   to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
