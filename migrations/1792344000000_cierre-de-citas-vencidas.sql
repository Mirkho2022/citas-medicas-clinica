-- Up Migration
-- H3 6.4 (4) (agenda-y-reserva): cierre automático de las citas `reservada` cuya hora terminó. Ver design.md, D13. No crea tablas.
--
-- Decisión del cliente (2026-10-20): una cita `reservada` que nadie confirmó y cuya hora ya pasó se cierra sola como
-- «No asistió». Sin esto no tenía salida (confirmar ya no procede porque terminó, cancelar lo impide la ventana de 1 hora y
-- `reservada → no_asistio` no existe para el usuario), se acumulaba en la agenda como `reservada` vencida y el médico seguía
-- leyendo los datos demográficos del paciente (política pacientes_lee_el_medico_con_relacion: citas `reservada` o `confirmada`).
--
-- La regla es del sistema, no de un usuario: `validar_transicion_estado` sigue rechazando `reservada → no_asistio` a quien
-- escribe con una sesión (administrativo incluido) y esta función es la única vía. Es SECURITY DEFINER: corre como dueño,
-- así que ese disparador (que solo actúa sobre `authenticated`) no interviene, y hace una sola cosa, fijar `estado`.
-- La auditoría deja la fila con `actor_id` nulo (no hay token: el actor es el sistema). Idempotente: una segunda llamada
-- sin citas nuevas vencidas no cambia nada. Devuelve cuántas citas cerró.
--
-- «Terminó» es `fin <= now()`, el mismo límite con que `validar_transicion_estado` rechaza confirmar una cita (`now() >= fin`):
-- una cita en curso todavía puede confirmarse y no se toca. Las `confirmada` vencidas no entran: las cierra la recepción
-- con «No asistió» o el médico con «Atendida», como hasta ahora.
--
-- EXECUTE: nadie de la aplicación (ni public, ni anonymous, ni authenticated). Se invoca sin cron: la aplicación entra por
-- `cerrar_citas_vencidas_como_personal()` (migración 1792344600000), que exige administrativo o médico y delega en esta; así el rol
-- `cron_notificaciones` no gana ningún permiso (H5 y ADR-0020 lo quieren sin privilegios nuevos).
create function public.cerrar_citas_vencidas()
returns integer
language plpgsql security definer set search_path = ''
as $f$
declare
  v_cerradas integer;
begin
  with cerradas as (
    update public.citas set estado = 'no_asistio'
    where estado = 'reservada' and fin <= now()
    returning 1
  )
  select count(*) into v_cerradas from cerradas;
  return v_cerradas;
end
$f$;

revoke execute on function public.cerrar_citas_vencidas() from public;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
