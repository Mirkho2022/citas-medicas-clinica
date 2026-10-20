-- Up Migration
-- H4 grupo 2, tarea 2.4 (portal-del-paciente): el paciente cancela su propia cita. Ver design.md, D4. No crea tablas ni disparadores.
--
-- Solo una política de UPDATE, no una función que esquive RLS: la autoridad sigue en el motor (el invariante del proyecto) y la
-- prueba negativa «cero filas» es una prueba de la política. Lo que NO se puede expresar con RLS (no tocar ninguna otra columna)
-- ya lo hace `citas_proteger_columnas` (H3, 1792342500000): rechaza con 42501 cualquier UPDATE de un usuario de la aplicación que
-- cambie algo distinto de `estado`. La ventana de 1 hora y el llenado de `cancelada_en` y `cancelada_por` los hace
-- `validar_cancelacion()` (ADR-0012), y `validar_transicion_estado()` ya impide que un paciente ponga cualquier otro estado.
--
-- USING: solo sus citas aún vigentes. WITH CHECK: la fila resultante es suya y está cancelada; un paciente no puede dejar una
-- cita en `confirmada` ni en ningún otro estado por esta vía.
create policy "paciente cancela su cita" on public.citas
  for update to authenticated
  using (
    (select public.rol_actual()) = 'paciente'
    and paciente_id = (select public.paciente_actual())
    and estado in ('reservada', 'confirmada')
  )
  with check (
    (select public.rol_actual()) = 'paciente'
    and paciente_id = (select public.paciente_actual())
    and estado = 'cancelada'
  );

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
