-- Up Migration
-- H4, hallazgo de la revisión de código (tarea 11.2): el paciente solo cancela citas que aún no empiezan.
--
-- La política «paciente cancela su cita» (1792536200000) exigía solo estado reservada o confirmada. `validar_cancelacion()` no
-- aplica la ventana de 1 hora cuando un bloqueo de agenda del médico alcanza la cita (excepción por baja, ADR-0011), y
-- `cerrar_citas_vencidas()` solo cierra las `reservada`: una cita `confirmada` ya atendida y bajo un bloqueo podía quedar
-- `cancelada` por el propio paciente, y `marcar_cita_atendida` ya no la aceptaba. Con `inicio > now()` la política deja de
-- depender de ese disparador para el pasado. El administrativo no cambia: su política es otra.
drop policy "paciente cancela su cita" on public.citas;
create policy "paciente cancela su cita" on public.citas
  for update to authenticated
  using (
    (select public.rol_actual()) = 'paciente'
    and paciente_id = (select public.paciente_actual())
    and estado in ('reservada', 'confirmada')
    and inicio > now()
  )
  with check (
    (select public.rol_actual()) = 'paciente'
    and paciente_id = (select public.paciente_actual())
    and estado = 'cancelada'
  );

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
