-- Up Migration
-- H2 grupo 4, tarea 4.5 (esquema-rls-pgtap): privilegios y políticas de especialidades, médicos y enfermeras.
-- Ver design.md, D3. Supuesto conservador marcado para revisión humana: estos catálogos son legibles por
-- cualquier sesión con rol válido (el paciente elige médico, la enfermera identifica al suyo) y los
-- administra solo el administrativo.

grant select, insert, update, delete on public.especialidades to authenticated;
grant select, insert, update         on public.medicos        to authenticated;   -- se da de baja con `activo`, no se borra
grant select, insert, update         on public.enfermeras     to authenticated;

-- especialidades
create policy especialidades_lee_todo_rol on public.especialidades
  for select to authenticated
  using ((select public.rol_actual()) in ('administrativo', 'medico', 'enfermera', 'paciente'));

create policy especialidades_inserta_el_administrativo on public.especialidades
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrativo');

create policy especialidades_actualiza_el_administrativo on public.especialidades
  for update to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

create policy especialidades_borra_el_administrativo on public.especialidades
  for delete to authenticated
  using ((select public.rol_actual()) = 'administrativo');

-- medicos
create policy medicos_lee_todo_rol on public.medicos
  for select to authenticated
  using ((select public.rol_actual()) in ('administrativo', 'medico', 'enfermera', 'paciente'));

create policy medicos_inserta_el_administrativo on public.medicos
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrativo');

create policy medicos_actualiza_el_administrativo on public.medicos
  for update to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

-- enfermeras: cada una ve su propia fila; el administrativo las gestiona.
create policy enfermeras_lee_la_propia on public.enfermeras
  for select to authenticated
  using (perfil_id = (select public.perfil_actual()));

create policy enfermeras_lee_el_administrativo on public.enfermeras
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

create policy enfermeras_inserta_el_administrativo on public.enfermeras
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrativo');

create policy enfermeras_actualiza_el_administrativo on public.enfermeras
  for update to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
