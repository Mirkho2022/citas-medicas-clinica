-- Up Migration
-- H2 grupo 5, tarea 5.5 (esquema-rls-pgtap): privilegios y políticas de disponibilidades y bloqueos_agenda.
-- Ver design.md, D3. Supuestos conservadores marcados para revisión humana:
--  - la disponibilidad semanal es legible por toda sesión con rol válido (el paciente la necesita para
--    ver horarios) y la administra solo el administrativo;
--  - los bloqueos (ausencias, licencias) los ve el administrativo y el médico dueño; el paciente no ve
--    los motivos. El cálculo de slots del portal (H3/H4) tendrá que hacerse con una función
--    SECURITY DEFINER que no exponga esas filas.

grant select, insert, update, delete on public.disponibilidades to authenticated;
grant select, insert, update, delete on public.bloqueos_agenda  to authenticated;

-- disponibilidades
create policy disponibilidades_lee_todo_rol on public.disponibilidades
  for select to authenticated
  using ((select public.rol_actual()) in ('administrativo', 'medico', 'enfermera', 'paciente'));

create policy disponibilidades_inserta_el_administrativo on public.disponibilidades
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrativo');

create policy disponibilidades_actualiza_el_administrativo on public.disponibilidades
  for update to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

create policy disponibilidades_borra_el_administrativo on public.disponibilidades
  for delete to authenticated
  using ((select public.rol_actual()) = 'administrativo');

-- bloqueos_agenda
create policy bloqueos_lee_el_administrativo on public.bloqueos_agenda
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

create policy bloqueos_lee_el_medico_propio on public.bloqueos_agenda
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and medico_id = (select public.medico_actual())
  );

create policy bloqueos_inserta_el_administrativo on public.bloqueos_agenda
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrativo');

create policy bloqueos_actualiza_el_administrativo on public.bloqueos_agenda
  for update to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

create policy bloqueos_borra_el_administrativo on public.bloqueos_agenda
  for delete to authenticated
  using ((select public.rol_actual()) = 'administrativo');

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
