-- Up Migration
-- H3 6.5 (agenda-y-reserva): el cierre de las citas `reservada` vencidas se dispara cuando el personal usa el sistema, sin cron.
-- Ver design.md, D13. No crea tablas ni índices.
--
-- Decisión del cliente (2026-10-20): se prefiere no depender de un cron (credencial de servicio, variable de entorno y el único
-- cron diario del plan Hobby, ADR-0028). La regla no cambia: una `reservada` que terminó sin confirmarse pasa a `no_asistio`
-- (`cerrar_citas_vencidas()`, migración 1792344000000). Lo que cambia es QUIÉN la invoca: la aplicación, al abrir la agenda del
-- administrativo (y la jornada del médico, H7).
--
-- 1) `cerrar_citas_vencidas()` sigue sin `EXECUTE` para ningún rol de la aplicación (solo el dueño: siembra, CI, una corrida manual).
--    Se recrea con un predicado redundante, `inicio < now()` (implícito en `fin <= now()` porque la tabla exige `fin > inicio`), para
--    que el planificador use `citas_estado_inicio_idx (estado, inicio)` en vez de recorrer la tabla: con 100 000 citas sintéticas
--    (505 vencidas) pasó de un recorrido completo a un recorrido por índice, y en régimen (sin vencidas) toca solo las filas
--    `reservada` ya empezadas.
--
-- 2) `cerrar_citas_vencidas_como_personal()` es la puerta de la aplicación: exige administrativo o médico (42501 al resto: paciente,
--    enfermera y sesión sin rol) y delega en la función interna. Es SECURITY DEFINER para poder llamarla (el rol que llama no tiene
--    `EXECUTE` sobre la interna) y para que `validar_transicion_estado` no actúe (solo mira `authenticated`): el rol de quien abre
--    la agenda no cambia lo que el cierre puede hacer, que es siempre lo mismo. No recibe parámetros, es idempotente y no revela
--    datos (devuelve solo cuántas cerró). A diferencia de la corrida del dueño, aquí la auditoría sí lleva actor: la persona cuya
--    sesión disparó el cierre.
create or replace function public.cerrar_citas_vencidas()
returns integer
language plpgsql security definer set search_path = ''
as $f$
declare
  v_cerradas integer;
begin
  with cerradas as (
    update public.citas set estado = 'no_asistio'
    where estado = 'reservada' and inicio < now() and fin <= now()
    returning 1
  )
  select count(*) into v_cerradas from cerradas;
  return v_cerradas;
end
$f$;

create function public.cerrar_citas_vencidas_como_personal()
returns integer
language plpgsql security definer set search_path = ''
as $f$
begin
  if public.rol_actual() is distinct from 'administrativo' and public.rol_actual() is distinct from 'medico' then
    raise exception 'No tiene permiso para cerrar citas vencidas' using errcode = '42501';
  end if;
  return public.cerrar_citas_vencidas();
end
$f$;

revoke execute on function public.cerrar_citas_vencidas_como_personal() from public;
grant  execute on function public.cerrar_citas_vencidas_como_personal() to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
