-- Up Migration
-- historias-clinicas, tarea 3.1 (design.md, D5): sello de tiempo del servidor y huella de la firma lógica.
-- Hueco de H2: `firmada_en` y `creado_en` los podía fijar el cliente (el GRANT de columnas incluye `firmada_en` y el
-- INSERT admite `creado_en`), con lo que una firma o una atención podían llevar una fecha falsa.
--
-- Esto NO resuelve P-1 ni P-5: es una firma LÓGICA (el servidor sella la hora y fija una huella del contenido); no se
-- afirma que cumpla la normativa peruana.

-- Método de firma y huella del contenido firmado. Sin GRANT para `authenticated`: solo los disparadores los fijan.
alter table public.atenciones
  add column firma_metodo text,
  add column firma_huella text;

alter table public.atenciones
  add constraint atenciones_firma_metodo_valido check (firma_metodo is null or firma_metodo in ('logica'));

-- «Firmada ⇒ método y huella», solo para filas nuevas: las firmadas antes (p. ej. datos de demostración) no se pueden
-- actualizar para rellenar la huella, porque una atención firmada es inmutable.
alter table public.atenciones
  add constraint atenciones_firmada_con_huella
  check (firmada_en is null or (firma_metodo is not null and firma_huella is not null)) not valid;

-- Huella canónica `v1`: SHA-256 del jsonb canónico de identidad y contenido (el texto de un jsonb es determinista: las
-- claves van en orden fijo). La fecha se escribe en UTC con microsegundos para no depender del TimeZone de la sesión.
-- `plantilla_id` y `datos_especialidad` (plantillas por especialidad, ADR-0029; aún no existen en el esquema) se leen con
-- `to_jsonb(p) -> clave` y, si la columna no existe, valen lo mismo que su valor por defecto (`null` y `{}`): así la
-- huella v1 de una atención firmada hoy sigue siendo verificable el día que esas columnas se añadan, sin una huella v2.
-- SECURITY INVOKER: solo lee su argumento.
create function public.huella_de_atencion(p public.atenciones)
returns text
language sql stable set search_path = ''
as $f$
  select 'v1:' || encode(sha256(convert_to(
    jsonb_build_object(
      'id', p.id,
      'historia_id', p.historia_id,
      'paciente_id', p.paciente_id,
      'cita_id', p.cita_id,
      'medico_id', p.medico_id,
      'motivo_consulta', p.motivo_consulta,
      'anamnesis', p.anamnesis,
      'examen_fisico', p.examen_fisico,
      'diagnosticos', p.diagnosticos,
      'plan_tratamiento', p.plan_tratamiento,
      'plantilla_id', coalesce(to_jsonb(p) -> 'plantilla_id', 'null'::jsonb),
      'datos_especialidad', coalesce(to_jsonb(p) -> 'datos_especialidad', '{}'::jsonb),
      'firmada_en', to_char(p.firmada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )::text, 'UTF8')), 'hex')
$f$;

-- Recalcula la huella de una atención guardada (para verificarla contra `firma_huella`). Bajo RLS: devuelve algo solo si
-- quien llama puede leer la atención.
create function public.huella_atencion(p_atencion uuid)
returns text
language sql stable set search_path = ''
as $f$
  select public.huella_de_atencion(a) from public.atenciones a where a.id = p_atencion
$f$;

revoke execute on function public.huella_de_atencion(public.atenciones) from public;
revoke execute on function public.huella_atencion(uuid) from public;
grant execute on function public.huella_de_atencion(public.atenciones) to authenticated;
grant execute on function public.huella_atencion(uuid) to authenticated;

-- Sello de la atención. Solo si `current_user = 'authenticated'` (mismo criterio que `bloquear_cambio_de_rol()`): el
-- cliente no decide `creado_en` ni `firmada_en`; el dueño (siembra, migraciones) conserva sus valores. Para CUALQUIER rol,
-- cuando la fila nace firmada o pasa a firmada se fijan el método y la huella. SECURITY INVOKER a propósito: como
-- DEFINER, current_user sería el dueño y no se reconocería al usuario.
--
-- Nombre `atenciones_zz_sello` a propósito: los disparadores de una misma operación se ejecutan por orden alfabético y
-- la huella debe calcularse DESPUÉS de los que reescriben el contenido (`atenciones_validar_diagnosticos` y, cuando se
-- añada, la validación de datos de especialidad). `atenciones_inmutables` (que rechaza lo ya firmado) va antes.
create function public.sellar_atencion()
returns trigger
language plpgsql set search_path = ''
as $f$
declare
  v_firma_nueva boolean := new.firmada_en is not null and (tg_op = 'INSERT' or old.firmada_en is null);
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.creado_en := now();
    end if;
    if v_firma_nueva then
      new.firmada_en := now();
    end if;
  end if;
  if v_firma_nueva then
    new.firma_metodo := coalesce(new.firma_metodo, 'logica');
    new.firma_huella := public.huella_de_atencion(new);
  end if;
  return new;
end
$f$;

revoke execute on function public.sellar_atencion() from public;

create trigger atenciones_zz_sello
  before insert or update on public.atenciones
  for each row execute function public.sellar_atencion();

-- `creado_en` de addendas y antecedentes: lo fija el servidor cuando escribe un usuario autenticado.
create function public.sellar_creado_en()
returns trigger
language plpgsql set search_path = ''
as $f$
begin
  if current_user = 'authenticated' then
    new.creado_en := now();
  end if;
  return new;
end
$f$;

revoke execute on function public.sellar_creado_en() from public;

create trigger addendas_sello
  before insert on public.addendas
  for each row execute function public.sellar_creado_en();

create trigger antecedentes_sello
  before insert on public.antecedentes
  for each row execute function public.sellar_creado_en();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
