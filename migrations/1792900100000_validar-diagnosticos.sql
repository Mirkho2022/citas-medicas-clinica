-- Up Migration
-- historias-clinicas, tarea 2.3 (design.md, D4): cada diagnóstico de una atención debe existir en el catálogo CIE-10.
-- «La forma exacta se define en H6» (migración de H2 `historias-clinicas-tablas`): el CHECK existente solo exige un
-- arreglo no vacío. Esta es la segunda barrera; la primera es el esquema Zod del servidor.
--
-- Reconstruye el arreglo: cada entrada debe ser un objeto con `cie10` existente; `descripcion` SE SOBRESCRIBE con la
-- del catálogo (instantánea inmune a cambios posteriores del catálogo y a lo que mande el cliente); `tipo`, si viene,
-- debe ser presuntivo, definitivo o repetitivo; se descartan las claves ajenas; un código repetido falla.
-- SQLSTATE propio `HC001` para código inexistente, repetido o entrada que no es un objeto; `23514` para un tipo no
-- permitido. SECURITY DEFINER con search_path vacío: el rol que escribe no necesita ver el catálogo.
--
-- Si `diagnosticos` no es un arreglo o está vacío NO actúa y deja que el CHECK existente lo rechace con `23514`: así
-- las pruebas de H2 (lista vacía, objeto en vez de lista) siguen pasando sin tocarse.
--
-- Orden de disparadores (alfabético): en un UPDATE, `atenciones_inmutables` va antes que este, así que una atención ya
-- firmada se rechaza antes de validar; y el sello de la firma (`atenciones_zz_sello`) va después, porque la huella debe
-- calcularse sobre el valor final reconstruido.
create function public.validar_diagnosticos()
returns trigger
language plpgsql security definer set search_path = ''
as $f$
declare
  v_elemento    jsonb;
  v_codigo      text;
  v_descripcion text;
  v_tipo        jsonb;
  v_vistos      text[] := '{}';
  v_resultado   jsonb  := '[]'::jsonb;
  v_entrada     jsonb;
begin
  if jsonb_typeof(new.diagnosticos) is distinct from 'array' or jsonb_array_length(new.diagnosticos) = 0 then
    return new;
  end if;

  for v_elemento in
    select t.valor from jsonb_array_elements(new.diagnosticos) with ordinality as t(valor, orden) order by t.orden
  loop
    if jsonb_typeof(v_elemento) is distinct from 'object' or jsonb_typeof(v_elemento -> 'cie10') is distinct from 'string' then
      raise exception 'Diagnóstico inválido' using errcode = 'HC001';
    end if;
    v_codigo := v_elemento ->> 'cie10';

    select c.descripcion into v_descripcion from public.cie10 c where c.codigo = v_codigo;
    if not found then
      raise exception 'El código del diagnóstico no existe en el catálogo CIE-10' using errcode = 'HC001';
    end if;
    if v_codigo = any (v_vistos) then
      raise exception 'Diagnóstico repetido' using errcode = 'HC001';
    end if;
    v_vistos := v_vistos || v_codigo;

    v_entrada := jsonb_build_object('cie10', v_codigo, 'descripcion', v_descripcion);
    v_tipo := v_elemento -> 'tipo';
    if v_tipo is not null then
      if jsonb_typeof(v_tipo) is distinct from 'string' or (v_tipo #>> '{}') not in ('presuntivo', 'definitivo', 'repetitivo') then
        raise exception 'Tipo de diagnóstico no permitido' using errcode = '23514';
      end if;
      v_entrada := v_entrada || jsonb_build_object('tipo', v_tipo);
    end if;
    v_resultado := v_resultado || jsonb_build_array(v_entrada);
  end loop;

  new.diagnosticos := v_resultado;
  return new;
end
$f$;

revoke execute on function public.validar_diagnosticos() from public;

create trigger atenciones_validar_diagnosticos
  before insert or update of diagnosticos on public.atenciones
  for each row execute function public.validar_diagnosticos();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
