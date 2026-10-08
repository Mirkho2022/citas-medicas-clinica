-- Up Migration
-- H2 grupo 4, tarea 4.4 (esquema-rls-pgtap): privilegios y políticas de pacientes. Ver design.md, D3.
--
-- No se concede DELETE: un paciente con historia no se borra (las claves foráneas lo impiden y el
-- diseño lo prohíbe). La lectura del médico con cita en su agenda o asignación vigente se añade con
-- las tablas que necesita (citas y asignaciones), en la migración del grupo 6.
grant select, insert, update on public.pacientes to authenticated;

-- El paciente lee únicamente su propio registro.
create policy pacientes_lee_el_propio on public.pacientes
  for select to authenticated
  using (id = (select public.paciente_actual()));

-- El administrativo registra, consulta y corrige pacientes (con o sin cuenta de portal).
create policy pacientes_lee_el_administrativo on public.pacientes
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

create policy pacientes_inserta_el_administrativo on public.pacientes
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrativo');

create policy pacientes_actualiza_el_administrativo on public.pacientes
  for update to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
