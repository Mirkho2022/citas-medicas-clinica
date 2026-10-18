-- Up Migration
-- H3 grupo 4, tarea 4.1 (agenda-y-reserva): reservar y reprogramar en la base de datos. Ver design.md, D4. No crea tablas.
--
-- Por qué funciones: reprogramar necesita leer la original, cancelarla y, solo si eso salió bien, insertar la nueva,
-- todo o nada. El driver HTTP de Neon ejecuta una lista fija de sentencias (sql.transaction) y no puede ramificar
-- según un resultado intermedio; una conexión interactiva está prohibida (D9 de H2) y cancelar y crear en dos
-- llamadas dejaría la cita cancelada si la segunda falla, con la ventana de 1 hora impidiendo deshacerlo.
--
-- SECURITY INVOKER a propósito: el INSERT y el UPDATE corren con la RLS y los disparadores del rol que llama, así
-- que la función no abre nada que ese rol no pudiera hacer ya. Verifica además rol_actual() (defensa en
-- profundidad) y falla con 42501 si no corresponde. search_path vacío y nombres calificados.
--
-- Códigos de error propios (clase UC, reservada por el estándar a la implementación), nunca P0001: P0001 sigue
-- significando únicamente «ventana de cancelación» (ADR-0008, validar_cancelacion()):
--   UC001  horario pasado, fuera de la agenda del médico, dentro de un bloqueo o de un médico dado de baja
--   UC002  la cita no existe o ya no está vigente
-- Un horario ocupado NO es UC001: lo rechaza el EXCLUDE de citas con 23P01, para que produzca el mensaje exacto
-- «Registro de cita ya agendado» y no «horario no disponible».

create function public.reservar_cita(
  p_paciente uuid, p_medico uuid, p_inicio timestamptz, p_fin timestamptz, p_motivo text default null
)
returns uuid
language plpgsql set search_path = ''
as $f$
declare
  v_rol text := public.rol_actual();
  v_id  uuid;
begin
  if v_rol is null or v_rol not in ('administrativo', 'paciente') then
    raise exception 'No tiene permiso para reservar citas' using errcode = '42501';
  end if;
  if p_inicio is null or p_fin is null or p_inicio <= now()
     or not public.horario_en_agenda(p_medico, p_inicio, p_fin) then
    raise exception 'El horario elegido no está disponible' using errcode = 'UC001';
  end if;

  -- Un paciente solo reserva a su nombre: lo impone la política «paciente reserva su cita» (42501), no esta función.
  insert into public.citas (paciente_id, medico_id, inicio, fin, motivo, origen, creada_por)
  values (
    p_paciente, p_medico, p_inicio, p_fin, nullif(btrim(p_motivo), ''),
    case v_rol when 'paciente' then 'portal' else 'administrativo' end,
    public.perfil_actual()
  )
  returning id into v_id;
  return v_id;
end
$f$;

create function public.reprogramar_cita(
  p_cita uuid, p_medico uuid, p_inicio timestamptz, p_fin timestamptz, p_motivo text default null
)
returns uuid
language plpgsql set search_path = ''
as $f$
declare
  v_original public.citas%rowtype;
  v_nueva    uuid;
begin
  if public.rol_actual() is distinct from 'administrativo' then
    raise exception 'No tiene permiso para reprogramar citas' using errcode = '42501';
  end if;
  if p_inicio is null or p_fin is null or p_inicio <= now()
     or not public.horario_en_agenda(p_medico, p_inicio, p_fin) then
    raise exception 'El horario elegido no está disponible' using errcode = 'UC001';
  end if;

  -- Bloquea la original: dos reprogramaciones simultáneas de la misma cita se serializan y la segunda la
  -- encuentra ya cancelada (UC002) en vez de crear una segunda cita nueva.
  select * into v_original from public.citas
   where id = p_cita and estado in ('reservada', 'confirmada')
   for update;
  if not found then
    raise exception 'La cita ya no está vigente' using errcode = 'UC002';
  end if;

  -- Cancelar ANTES de insertar es obligatorio: si se insertara primero, la nueva chocaría con la original en
  -- citas_sin_cruce_paciente (mismo paciente, horarios que se cruzan o médico distinto a la misma hora). El UPDATE
  -- dispara validar_cancelacion(): ventana de 1 hora, o la excepción por bloqueo del médico (ADR-0011/0012).
  update public.citas set estado = 'cancelada' where id = v_original.id;

  -- La nueva nace `reservada` y no hereda `confirmada`: heredarla activaría extender_asignacion_por_cita() y daría
  -- al médico nuevo acceso a la historia clínica por un efecto lateral (ADR-0016). reprogramada_de va en la nueva
  -- y apunta a la original.
  insert into public.citas (paciente_id, medico_id, inicio, fin, motivo, origen, creada_por, reprogramada_de)
  values (
    v_original.paciente_id, p_medico, p_inicio, p_fin,
    coalesce(nullif(btrim(p_motivo), ''), v_original.motivo),
    'administrativo', public.perfil_actual(), v_original.id
  )
  returning id into v_nueva;
  return v_nueva;
end
$f$;

revoke execute on function public.reservar_cita(uuid, uuid, timestamptz, timestamptz, text)   from public;
revoke execute on function public.reprogramar_cita(uuid, uuid, timestamptz, timestamptz, text) from public;
grant  execute on function public.reservar_cita(uuid, uuid, timestamptz, timestamptz, text)   to authenticated;
grant  execute on function public.reprogramar_cita(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
