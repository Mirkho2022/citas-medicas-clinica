-- Up Migration
-- H2 grupo 6, tarea 6.4 (esquema-rls-pgtap): acceso a la historia clínica SOLO para el médico a cargo.
-- RIESGO PRINCIPAL DEL PROYECTO (ADR-0003, ADR-0016): cualquier cambio aquí merece revisión explícita.
-- El administrativo, el paciente y la enfermera NO tienen política alguna sobre estas tablas, ni de lectura.

grant select on public.historias_clinicas to authenticated;
-- INSERT de atenciones: el médico las registra sin firmar. UPDATE restringido por columnas: no puede
-- reasignar historia, paciente, médico ni cita de una atención existente.
grant select, insert on public.atenciones to authenticated;
grant update (motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
  on public.atenciones to authenticated;
grant select, insert on public.addendas to authenticated;
-- Sin DELETE en ninguna: una historia clínica no se borra (el disparador de 6.5 lo impide además).

-- historias_clinicas: solo lectura, y solo del médico a cargo. La carpeta la crea el disparador.
create policy historias_lee_el_medico_a_cargo on public.historias_clinicas
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and (select public.medico_tiene_paciente(paciente_id))
  );

-- atenciones
create policy atenciones_lee_el_medico_a_cargo on public.atenciones
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and (select public.medico_tiene_paciente(paciente_id))
  );

-- El médico solo registra atenciones propias, de pacientes a su cargo y sin firmar (se firman después).
create policy atenciones_registra_el_medico on public.atenciones
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'medico'
    and (select public.medico_tiene_paciente(paciente_id))
    and medico_id = (select public.medico_actual())
    and firmada_en is null
  );

-- Solo el autor edita su atención mientras no esté firmada; firmar es poner firmada_en. Una vez firmada,
-- la USING la excluye y el disparador de 6.5 la protege además contra cualquier otro camino.
create policy atenciones_actualiza_el_autor on public.atenciones
  for update to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and medico_id = (select public.medico_actual())
    and firmada_en is null
    and (select public.medico_tiene_paciente(paciente_id))
  )
  with check (
    (select public.rol_actual()) = 'medico'
    and medico_id = (select public.medico_actual())
    and (select public.medico_tiene_paciente(paciente_id))
  );

-- addendas: no tienen paciente_id; se apoyan en la atención (cuya propia RLS ya filtra por médico a cargo).
create policy addendas_lee_el_medico_a_cargo on public.addendas
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and exists (
      select 1 from public.atenciones a
      where a.id = atencion_id and (select public.medico_tiene_paciente(a.paciente_id))
    )
  );

-- Corrección posterior a la firma: solo sobre una atención firmada de un paciente a cargo, y con la autoría
-- del propio médico.
create policy addendas_registra_el_medico on public.addendas
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'medico'
    and medico_id = (select public.medico_actual())
    and exists (
      select 1 from public.atenciones a
      where a.id = atencion_id
        and a.firmada_en is not null
        and (select public.medico_tiene_paciente(a.paciente_id))
    )
  );

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
