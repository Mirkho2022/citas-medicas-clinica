-- Up Migration
-- H2 grupo 6, tarea 6.6 (esquema-rls-pgtap): lectura de pacientes por el médico y lectura de cie10.
-- Ver design.md, D3. Supuestos conservadores marcados para revisión humana.

-- El médico necesita el nombre y la identificación de los pacientes con los que trabaja. Los ve si:
--  - los tiene a cargo (asignación vigente, ADR-0016), o
--  - tiene con ellos una cita vigente (reservada o confirmada): el paciente aparece en su agenda antes de que
--    exista asignación, que nace al confirmar. Una cita cancelada o ya atendida y vencida NO da acceso.
-- Son datos demográficos del registro del paciente, de solo lectura para el médico (no hay política de escritura).
create policy pacientes_lee_el_medico_con_relacion on public.pacientes
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and (
      (select public.medico_tiene_paciente(id))
      or exists (
        select 1 from public.citas c
        where c.paciente_id = pacientes.id
          and c.medico_id = (select public.medico_actual())
          and c.estado in ('reservada', 'confirmada')
      )
    )
  );

-- CIE-10: catálogo de consulta para toda sesión con rol válido. Se carga solo por migración de datos (ADR-0014):
-- ningún rol de usuario recibe INSERT, UPDATE ni DELETE.
grant select on public.cie10 to authenticated;

create policy cie10_lee_todo_rol on public.cie10
  for select to authenticated
  using ((select public.rol_actual()) in ('administrativo', 'medico', 'enfermera', 'paciente'));

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
