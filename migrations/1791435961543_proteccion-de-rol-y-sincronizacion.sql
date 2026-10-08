-- Up Migration
-- H2 grupo 4, tarea 4.6 (esquema-rls-pgtap): bloqueo de escalada de privilegios y rol de sincronización.
-- Ver design.md, D4 y D6, y TECH-DESIGN.md, "Escalada de privilegios".

-- RLS no filtra por columna: si algún día se concede a un usuario actualizar su propia fila, podría
-- cambiarse el rol (o reactivarse). Este disparador es la barrera de fondo: solo el administrativo o
-- el rol de sincronización con Clerk cambian `rol` y `activo`.
--
-- SECURITY INVOKER a propósito (TECH-DESIGN lo proponía DEFINER): solo compara OLD y NEW y llama a
-- rol_actual(), que ya es DEFINER y es lo único que toca auth.*. Como INVOKER, current_user es el rol
-- que ejecuta el UPDATE (authenticated en la aplicación, sync_identidad en el webhook); en una función
-- DEFINER sería el dueño y no se podría reconocer al webhook.
create function public.bloquear_cambio_de_rol()
returns trigger
language plpgsql set search_path = ''
as $f$
begin
  if new.rol is distinct from old.rol or new.activo is distinct from old.activo then
    -- El rol de sincronización pasa sin más y NO tiene EXECUTE sobre rol_actual(): PostgreSQL comprueba
    -- ese permiso al inicializar una expresión aunque un AND la saltara, por eso los IF van anidados.
    if current_user <> 'sync_identidad' then
      if coalesce(public.rol_actual(), '') <> 'administrativo' then
        raise exception 'No autorizado para cambiar el rol o el estado de un usuario' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end
$f$;

create trigger perfiles_bloquear_rol
  before update on public.perfiles
  for each row execute function public.bloquear_cambio_de_rol();

-- Rol de sincronización (webhook de Clerk): inserta y actualiza perfiles, nada más. Sin DELETE, sin
-- tocar clerk_user_id y sin privilegios sobre ninguna otra tabla (ni datos clínicos ni de agenda).
grant select, insert on public.perfiles to sync_identidad;
grant update (nombres, apellidos, rol, activo) on public.perfiles to sync_identidad;

-- No es un usuario final: la política le abre perfiles; sus GRANT acotan lo que puede hacer.
create policy perfiles_sincronizacion on public.perfiles
  for all to sync_identidad
  using (true)
  with check (true);

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
