-- Up Migration
-- H3 grupo 6, tarea 6.1 (agenda-y-reserva): ciclo de estados de la cita. Ver design.md, D13. No crea tablas.
-- Decisión del cliente: la recepción (administrativo) confirma y marca «No asistió»; el médico marca «Atendida».
--
-- El problema de partida: la política del administrativo sobre citas es `for all`, así que hoy podría escribir cualquier
-- `estado` (también `atendida`) con un UPDATE directo, y nada valida las transiciones. Esa regla no puede vivir en la
-- aplicación, y menos aún porque confirmar es el hecho que concede al médico acceso a la historia clínica (ADR-0016:
-- extender_asignacion_por_cita() al pasar a `confirmada`).
--
-- Códigos de error propios (clase UC): UC002 cita inexistente o ajena, UC004 transición o condición no válida.

-- Valida cada cambio de estado hecho por un usuario de la aplicación. Solo actúa cuando `current_user = 'authenticated'`:
-- no actúa sobre el dueño de la base (migraciones, siembra de demostración, la carga histórica de H8) ni sobre las
-- funciones SECURITY DEFINER, que corren como dueño y se validan a sí mismas. SECURITY INVOKER: current_user es quien
-- escribe. Las condiciones de tiempo miran los valores ANTERIORES (old.inicio, old.fin) para que un mismo UPDATE no pueda
-- mover la cita y confirmarla a la vez.
--
--   insertar                      estado = reservada                          si no, UC004
--   reservada -> confirmada       administrativo, now() < fin                 42501 / UC004
--   confirmada -> no_asistio      administrativo, now() >= inicio             42501 / UC004
--   reservada|confirmada -> cancelada   la ventana de 1 hora la valida validar_cancelacion()
--   * -> atendida (UPDATE directo)  nadie                                     42501 (solo marcar_cita_atendida)
--   cualquier otra                                                            UC004
create function public.validar_transicion_estado()
returns trigger
language plpgsql set search_path = ''
as $f$
declare
  v_rol text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estado <> 'reservada' then
      raise exception 'Una cita nueva solo puede crearse como reservada' using errcode = 'UC004';
    end if;
    return new;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if new.estado = 'atendida' then
    raise exception 'Solo el médico puede marcar una cita como atendida' using errcode = '42501';
  end if;

  v_rol := public.rol_actual();

  if old.estado = 'reservada' and new.estado = 'confirmada' then
    if v_rol is distinct from 'administrativo' then
      raise exception 'Solo la recepción puede confirmar una cita' using errcode = '42501';
    end if;
    if now() >= old.fin then
      raise exception 'La cita ya terminó: no se puede confirmar' using errcode = 'UC004';
    end if;
  elsif old.estado = 'confirmada' and new.estado = 'no_asistio' then
    if v_rol is distinct from 'administrativo' then
      raise exception 'Solo la recepción puede marcar «No asistió»' using errcode = '42501';
    end if;
    if now() < old.inicio then
      raise exception 'La cita aún no empieza: no se puede marcar «No asistió»' using errcode = 'UC004';
    end if;
  elsif old.estado in ('reservada', 'confirmada') and new.estado = 'cancelada' then
    null; -- la ventana de 1 hora (y su excepción por bloqueo) la valida validar_cancelacion()
  else
    raise exception 'Esa transición de estado no está permitida' using errcode = 'UC004';
  end if;
  return new;
end
$f$;

revoke execute on function public.validar_transicion_estado() from public;

-- BEFORE INSERT OR UPDATE OF estado. Corre después de citas_validar_cancelacion (orden alfabético de los disparadores
-- BEFORE) y es independiente de él.
create trigger citas_validar_transicion
  before insert or update of estado on public.citas
  for each row execute function public.validar_transicion_estado();

-- «Atendida»: la única función SECURITY DEFINER del ciclo. RLS no filtra por columna: darle UPDATE al médico sobre `citas`
-- le permitiría tocar cualquier dato de su cita aunque un privilegio de columna lo limitara a `estado`, y obligaría a abrir
-- una política de escritura sobre una tabla que hoy solo lee. La función hace una sola cosa: fijar `estado`.
--  - exige rol médico y un médico ACTIVO (42501);
--  - busca la cita solo entre las del médico que llama: una cita ajena y una inexistente dan el mismo UC002 y no
--    revelan de quién es;
--  - exige `confirmada` y que su hora ya haya empezado (UC004);
--  - la auditoría registra al médico como actor porque perfil_actual() lee el token, no el dueño de la función;
--  - como la cita ya estaba confirmada, extender_asignacion_por_cita() no crea una asignación nueva.
create function public.marcar_cita_atendida(p_cita uuid)
returns void
language plpgsql security definer set search_path = ''
as $f$
declare
  v_medico uuid;
  v_estado public.estado_cita;
  v_inicio timestamptz;
begin
  if public.rol_actual() is distinct from 'medico' then
    raise exception 'No tiene permiso para marcar una cita como atendida' using errcode = '42501';
  end if;
  v_medico := public.medico_actual();
  if v_medico is null or not exists (select 1 from public.medicos m where m.id = v_medico and m.activo) then
    raise exception 'No tiene permiso para marcar una cita como atendida' using errcode = '42501';
  end if;

  select c.estado, c.inicio into v_estado, v_inicio
  from public.citas c
  where c.id = p_cita and c.medico_id = v_medico
  for update;
  if not found then
    raise exception 'La cita ya no está vigente' using errcode = 'UC002';
  end if;
  if v_estado <> 'confirmada' or now() < v_inicio then
    raise exception 'Solo se puede marcar «Atendida» una cita confirmada cuya hora ya empezó' using errcode = 'UC004';
  end if;

  update public.citas set estado = 'atendida' where id = p_cita;
end
$f$;

revoke execute on function public.marcar_cita_atendida(uuid) from public;
grant  execute on function public.marcar_cita_atendida(uuid) to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
