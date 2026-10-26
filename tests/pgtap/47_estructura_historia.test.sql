-- Historias clínicas (H2, tarea 6.7): los datos del paciente no están en la atención.
-- Spec: integridad-historia-clinica («Datos demográficos fuera de la atención»).
-- La regla del PRD («los datos ya cargados desde el registro del paciente no son editables desde la historia clínica»)
-- se cumple por estructura: la atención no tiene columnas que escribir. Fijar la lista exacta de columnas hace
-- que añadir una nueva exija tocar esta prueba, y por tanto revisarla.
select plan(6);

select is_empty(
  $q$
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('atenciones', 'addendas', 'antecedentes', 'historias_clinicas')
      and column_name in ('nombres', 'apellidos', 'tipo_documento', 'numero_documento', 'fecha_nacimiento',
                          'sexo', 'telefono', 'email', 'direccion')
  $q$,
  'ninguna tabla clínica contiene columnas demográficas del paciente'
);

select columns_are('public', 'atenciones', array[
  'id', 'historia_id', 'paciente_id', 'cita_id', 'medico_id', 'motivo_consulta', 'anamnesis',
  'examen_fisico', 'diagnosticos', 'plan_tratamiento', 'firmada_en', 'creado_en', 'firma_metodo', 'firma_huella'
], 'atenciones: solo referencias por identificador y contenido clínico');

select columns_are('public', 'historias_clinicas', array['id', 'paciente_id', 'numero', 'creado_en'],
  'historias_clinicas: solo la carpeta (referencia al paciente y número)');

select columns_are('public', 'addendas', array['id', 'atencion_id', 'medico_id', 'texto', 'creado_en'],
  'addendas: texto, autor y fecha');

select columns_are('public', 'antecedentes', array[
  'id', 'paciente_id', 'tipo', 'descripcion', 'vigente', 'registrado_por', 'creado_en', 'actualizado_en'
], 'antecedentes: contenido y trazabilidad');

select columns_are('public', 'asignaciones_paciente_medico',
  array['id', 'paciente_id', 'medico_id', 'vigente_desde', 'vigente_hasta', 'motivo'],
  'asignaciones_paciente_medico: la única fuente de acceso del médico');

select * from finish();
