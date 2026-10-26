-- Up Migration
-- historias-clinicas, tarea 8.2 (design.md, D5): firmar una atención como una operación que FALLA si no firma.
-- Firmar es un `UPDATE ... set firmada_en`, y un UPDATE que no encuentra fila (RLS, no es el autor, ya firmada) no es un
-- error en SQL: dentro de la transacción «guardar y firmar» dejaría la atención guardada y sin firmar. Esta función lo
-- convierte en un error (SQLSTATE 42501), de modo que la transacción completa se revierte y «o se guarda y se firma, o no
-- se guarda nada».
--
-- SECURITY INVOKER a propósito: el UPDATE pasa por la RLS del que llama (solo el autor, a cargo del paciente, mientras no
-- esté firmada), por los privilegios de columna y por los disparadores de inmutabilidad y de sello. No concede nada nuevo.
-- La hora de la firma la fija el disparador `atenciones_zz_sello`, no el cliente. Devuelve la hora sellada.
--
-- Mensajes (los reconoce la aplicación por texto, como los de H2): «Atención firmada: ...» cuando la atención existe y ya
-- está firmada; «No tiene acceso a esta atención» en cualquier otro caso (no existe, es de otro paciente, otro autor o la
-- asignación venció), sin distinguirlos.
create function public.firmar_atencion(p_atencion uuid)
returns timestamptz
language plpgsql set search_path = ''
as $f$
declare
  v_firmada timestamptz;
begin
  update public.atenciones set firmada_en = now()
   where id = p_atencion and firmada_en is null
  returning firmada_en into v_firmada;
  if found then
    return v_firmada;
  end if;
  if exists (select 1 from public.atenciones where id = p_atencion and firmada_en is not null) then
    raise exception 'Atención firmada: use una addenda para corregir' using errcode = '42501';
  end if;
  raise exception 'No tiene acceso a esta atención' using errcode = '42501';
end
$f$;

revoke execute on function public.firmar_atencion(uuid) from public;
grant  execute on function public.firmar_atencion(uuid) to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
