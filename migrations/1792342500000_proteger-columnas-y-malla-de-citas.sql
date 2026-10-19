-- Up Migration
-- H3 grupo 6, hallazgo (1) de la revisión 6.4 (agenda-y-reserva): una cita no se edita, solo cambia de estado, y solo nace dentro
-- de la malla del médico. No crea tablas.
--
-- El problema de partida: `authenticated` tiene UPDATE de tabla completa sobre `citas` y la RLS no filtra por columna. Los
-- disparadores de H2 y H3 miran `estado`, así que un UPDATE que mueve `inicio`/`fin` los esquiva:
--   - mover una cita que empieza en 50 minutos al futuro y luego cancelarla (la ventana se mide contra el `inicio` ya movido);
--   - alargar `fin` y confirmar una cita terminada, lo que concede al médico acceso a la historia clínica de forma
--     retroactiva (D13 quiere evitarlo con `now() < fin`);
--   - un INSERT directo (el paciente tiene política de INSERT) de una cita fuera de la malla, p. ej. 400 días adelante: la RLS
--     solo mira `paciente_id`, `origen` e `inicio > now()`, y el EXCLUDE solo protege contra solapes.
-- Ninguna acción de la aplicación lo hace (solo SQL directo), pero H4 añade la política de UPDATE del paciente y lo volvería
-- alcanzable. Esto subsume `citas_proteger_columnas_paciente` de H4 (D4): vale para todos los roles, no solo para el paciente.
--
-- Igual que `validar_transicion_estado()`, solo actúan cuando `current_user = 'authenticated'`: no actúan sobre el dueño de la
-- base (migraciones, siembra de demostración, carga histórica de H8) ni sobre las funciones SECURITY DEFINER, que corren como
-- dueño y se validan a sí mismas. SECURITY INVOKER: current_user es quien escribe. Las funciones de H3 que escriben citas
-- (`reservar_cita`, `reprogramar_cita`, `reasignar_cita_por_baja`) son INVOKER y solo insertan citas nuevas o cambian `estado`,
-- así que pasan por aquí sin cambios.

-- Una cita no se edita: para un usuario de la aplicación solo cambia `estado`. `cancelada_en` y `cancelada_por` los fija
-- validar_cancelacion() al cancelar, así que solo pueden cambiar en ese mismo UPDATE (también si este disparador corriera
-- después de aquel: el orden alfabético lo deja antes, pero la regla no depende de eso). `rango` es una columna generada
-- de inicio y fin. Reprogramar no edita: cancela la original e inserta otra.
--
-- La comparación es de la fila entera menos una lista corta de excepciones, no una lista de columnas protegidas: una columna
-- que se añada a `citas` en el futuro queda protegida por defecto (falla cerrado) hasta que alguien decida lo contrario.
create function public.proteger_columnas_cita()
returns trigger
language plpgsql set search_path = ''
as $f$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if to_jsonb(new) - array['estado', 'cancelada_en', 'cancelada_por', 'rango']
     is distinct from to_jsonb(old) - array['estado', 'cancelada_en', 'cancelada_por', 'rango'] then
    raise exception 'Una cita no se edita: solo cambia de estado' using errcode = '42501';
  end if;

  if (new.cancelada_en, new.cancelada_por) is distinct from (old.cancelada_en, old.cancelada_por)
     and not (new.estado = 'cancelada' and old.estado <> 'cancelada') then
    raise exception 'Una cita no se edita: solo cambia de estado' using errcode = '42501';
  end if;

  return new;
end
$f$;

revoke execute on function public.proteger_columnas_cita() from public;

-- BEFORE UPDATE de cualquier columna. El nombre ordena antes que citas_validar_cancelacion y citas_validar_transicion
-- (orden alfabético de los disparadores BEFORE), pero ninguno depende de ese orden.
create trigger citas_proteger_columnas
  before update on public.citas
  for each row execute function public.proteger_columnas_cita();

-- Una cita solo nace en una hora futura que sea exactamente un hueco de la agenda del médico (horario_en_agenda), con los
-- mismos criterios y el mismo código que reservar_cita(): UC001. Un horario ocupado NO se valida aquí: lo rechaza el EXCLUDE
-- con 23P01 para que produzca «Registro de cita ya agendado». reservar_cita() y reprogramar_cita() ya lo comprueban antes de
-- insertar para dar el error sin gastar el INSERT; esta es la defensa de fondo para quien inserta sin pasar por ellas.
--
-- Solo el administrativo y el paciente crean citas. horario_en_agenda() devuelve false para cualquier otro rol, y un BEFORE
-- INSERT corre antes que el WITH CHECK de la RLS: sin esta guarda, un médico o una enfermera recibirían «horario no disponible»
-- (UC001) en vez del error de permiso. Se les rechaza aquí con 42501 y el mismo mensaje que reservar_cita(), sin esperar a la RLS.
create function public.validar_horario_cita()
returns trigger
language plpgsql set search_path = ''
as $f$
declare
  v_rol text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  v_rol := public.rol_actual();
  if v_rol is null or v_rol not in ('administrativo', 'paciente') then
    raise exception 'No tiene permiso para reservar citas' using errcode = '42501';
  end if;

  if new.inicio <= now() or not public.horario_en_agenda(new.medico_id, new.inicio, new.fin) then
    raise exception 'El horario elegido no está disponible' using errcode = 'UC001';
  end if;
  return new;
end
$f$;

revoke execute on function public.validar_horario_cita() from public;

create trigger citas_validar_horario
  before insert on public.citas
  for each row execute function public.validar_horario_cita();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
