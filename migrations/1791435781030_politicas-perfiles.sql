-- Up Migration
-- H2 grupo 4, tarea 4.3 (esquema-rls-pgtap): privilegios y políticas de perfiles. Ver design.md, D3 y D4.
--
-- authenticated puede LEER perfiles (filtrado por las políticas de abajo) y ACTUALIZAR solo estas columnas.
-- No se concede INSERT ni DELETE: los perfiles los crea y actualiza el webhook de sincronización con
-- Clerk (rol sync_identidad, migración posterior) y no se borran. No se concede actualizar
-- clerk_user_id, id ni creado_en: cambiar clerk_user_id permitiría suplantar a otro usuario.
grant select on public.perfiles to authenticated;
grant update (nombres, apellidos, rol, activo) on public.perfiles to authenticated;

-- Cada usuario lee su propio perfil.
create policy perfiles_lee_el_propio on public.perfiles
  for select to authenticated
  using (id = (select public.perfil_actual()));

-- El administrativo lee todos los perfiles (gestiona al personal).
create policy perfiles_lee_el_administrativo on public.perfiles
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

-- Nombre público de los médicos: el paciente elige médico al reservar y la enfermera identifica al
-- suyo. Supuesto de design.md (D3): se exponen las columnas del perfil del médico, no los de otros
-- roles. Exige una sesión con un rol válido; un token sin rol no ve nada.
create policy perfiles_lee_los_medicos on public.perfiles
  for select to authenticated
  using (
    rol = 'medico'
    and (select public.rol_actual()) in ('administrativo', 'medico', 'enfermera', 'paciente')
  );

-- Solo el administrativo actualiza perfiles (cambiar rol o dar de baja). El disparador de la
-- tarea 4.6 impide que cualquier otro rol cambie rol o activo aunque se le concediera actualizar.
create policy perfiles_actualiza_el_administrativo on public.perfiles
  for update to authenticated
  using ((select public.rol_actual()) = 'administrativo')
  with check ((select public.rol_actual()) = 'administrativo');

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
