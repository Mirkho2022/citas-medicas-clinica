-- Up Migration
-- H4 grupo 2, tarea 2.2 (portal-del-paciente): alta y vinculación del paciente que se registra solo. Ver design.md, D3, y
-- ADR-0037. No crea tablas.
--
-- Por qué una función SECURITY DEFINER: el paciente no puede insertar una ficha ni ver una que no tiene cuenta, así que
-- ninguna política de RLS resuelve el alta ni la vinculación. La verificación (correo de la cuenta + fecha de nacimiento) vive
-- dentro de la función; el dueño de la función tiene BYPASSRLS, por eso la función hace solo lo que describe y nada más.
-- search_path vacío y nombres calificados (un usuario no puede secuestrar la resolución de nombres).
--
-- El correo sale del claim `email` del JWT que Neon valida (auth.session()), nunca de un parámetro: requiere añadir el claim a la
-- plantilla del JWT de Clerk (docs/pasos-manuales-h4.md).
--
-- Códigos de error propios (clase PA, reservada por el estándar a la implementación):
--   PA001  la cuenta ya tiene ficha de paciente
--   PA002  no se puede registrar ni vincular ese documento (datos que no coinciden, ficha de otra cuenta o carrera). Siempre el
--          mismo código y, en la aplicación, el mismo texto: no se dice cuál dato falló
--   PA003  la cuenta aún no tiene perfil (el alta de Clerk no terminó de sincronizarse)
--   PA004  la sesión no trae un correo
--   42501  el rol de la sesión no es paciente

create function public.correo_actual()
returns text
language sql stable security definer set search_path = ''
as $$ select nullif(lower(btrim(auth.session() ->> 'email')), '') $$;

revoke execute on function public.correo_actual() from public;
grant  execute on function public.correo_actual() to authenticated;

create function public.registrar_paciente_portal(
  p_tipo             public.tipo_documento,
  p_numero           text,
  p_nombres          text,
  p_apellidos        text,
  p_fecha_nacimiento date,
  p_sexo             text,
  p_telefono         text default null,
  p_direccion        text default null
)
returns table (paciente_id uuid, vinculado boolean)
language plpgsql security definer set search_path = ''
as $f$
declare
  v_perfil uuid;
  v_correo text;
  v_numero text := upper(btrim(p_numero));  -- la unicidad distingue mayúsculas: se guarda siempre normalizado
  v_ficha  record;
  v_id     uuid;
begin
  if public.rol_actual() is distinct from 'paciente' then
    raise exception 'No tiene permiso para registrarse como paciente' using errcode = '42501';
  end if;

  v_perfil := public.perfil_actual();
  if v_perfil is null then
    raise exception 'La cuenta todavía no está lista' using errcode = 'PA003';
  end if;
  if exists (select 1 from public.pacientes p where p.perfil_id = v_perfil) then
    raise exception 'La cuenta ya está registrada' using errcode = 'PA001';
  end if;

  v_correo := public.correo_actual();
  if v_correo is null then
    raise exception 'La sesión no trae un correo' using errcode = 'PA004';
  end if;

  select p.id, p.perfil_id, p.email::text as email, p.fecha_nacimiento
    into v_ficha
    from public.pacientes p
   where p.tipo_documento = p_tipo and p.numero_documento = v_numero
     for update;

  if not found then
    begin
      insert into public.pacientes
        (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, telefono, email, direccion)
      values
        (v_perfil, p_tipo, v_numero, btrim(p_nombres), btrim(p_apellidos), p_fecha_nacimiento, p_sexo,
         nullif(btrim(p_telefono), ''), v_correo, nullif(btrim(p_direccion), ''))
      returning id into v_id;
    exception when unique_violation then
      -- Una carrera: otra transacción registró ese documento (u otra petición de esta misma cuenta) justo antes.
      if exists (select 1 from public.pacientes p where p.perfil_id = v_perfil) then
        raise exception 'La cuenta ya está registrada' using errcode = 'PA001';
      end if;
      raise exception 'No se pudo registrar ese documento' using errcode = 'PA002';
    end;
    return query select v_id, false;
    return;
  end if;

  -- Un doble envío de esta misma cuenta: el primero ya vinculó la ficha mientras el segundo esperaba el bloqueo de la fila. La
  -- ficha es suya, así que decirlo no revela nada.
  if v_ficha.perfil_id = v_perfil then
    raise exception 'La cuenta ya está registrada' using errcode = 'PA001';
  end if;

  -- La ficha existe: solo se vincula si no tiene cuenta y coinciden el correo verificado de la cuenta y la fecha de nacimiento.
  -- Cualquier otro caso es el mismo error, para no revelar cuál dato falló.
  if v_ficha.perfil_id is not null
     or lower(btrim(v_ficha.email)) is distinct from v_correo
     or v_ficha.fecha_nacimiento is distinct from p_fecha_nacimiento then
    raise exception 'No se pudo registrar ese documento' using errcode = 'PA002';
  end if;

  update public.pacientes set perfil_id = v_perfil where id = v_ficha.id;
  return query select v_ficha.id, true;
end
$f$;

revoke execute on function public.registrar_paciente_portal(public.tipo_documento, text, text, text, date, text, text, text) from public;
grant  execute on function public.registrar_paciente_portal(public.tipo_documento, text, text, text, date, text, text, text) to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
