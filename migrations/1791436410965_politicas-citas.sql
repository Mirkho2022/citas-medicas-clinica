-- Up Migration
-- H2 grupo 5, tarea 5.4 (esquema-rls-pgtap): privilegios y políticas de citas. Fuente: TECH-DESIGN.md,
-- "Políticas RLS", con la sintaxis de rol_actual() (design.md, D5).
--
-- No se concede DELETE: una cita no se borra, se cancela. El paciente no actualiza citas todavía: el flujo
-- de cancelación del portal (H4) añadirá su política. La enfermera no tiene política: no ve citas.
grant select, insert, update on public.citas to authenticated;

create policy "paciente ve sus citas" on public.citas
  for select to authenticated
  using (
    (select public.rol_actual()) = 'paciente'
    and paciente_id = (select public.paciente_actual())
  );

-- Reserva solo a su nombre, por el portal y hacia el futuro. La doble reserva la impide el EXCLUDE.
create policy "paciente reserva su cita" on public.citas
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'paciente'
    and paciente_id = (select public.paciente_actual())
    and origen = 'portal'
    and inicio > now()
  );

create policy "administrativo gestiona todas las citas" on public.citas
  for all to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

create policy "medico ve su agenda" on public.citas
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and medico_id = (select public.medico_actual())
  );

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
