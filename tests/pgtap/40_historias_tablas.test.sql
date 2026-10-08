-- Historias clínicas (H2, tarea 6.1): restricciones de historias_clinicas, atenciones, addendas, antecedentes y
-- cie10, y RLS activada. Spec: integridad-historia-clinica. Las políticas y los disparadores de inmutabilidad
-- se prueban en 6.4 y 6.5.
select plan(21);

-- Datos de prueba (dueño). La historia se crea con ON CONFLICT: desde 6.2 un disparador ya la crea al
-- registrar al paciente y la prueba debe valer antes y después.
insert into public.especialidades (nombre) values ('Esp historias tablas');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_test_h_m1', 'medico', 'Mario', 'H');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = 'user_test_h_m1'), 'CMP-H-0001',
          (select id from public.especialidades where nombre = 'Esp historias tablas'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '76000001', 'Paciente', 'A', '1990-01-01', 'F', 'ha@demo.invalid'),
  ('DNI', '76000002', 'Paciente', 'B', '1991-01-01', 'M', 'hb@demo.invalid');
insert into public.historias_clinicas (paciente_id, numero)
  select id, 'HC-T-' || right(numero_documento, 1) from public.pacientes where numero_documento in ('76000001', '76000002')
  on conflict (paciente_id) do nothing;

create temp table e (clave text primary key, id uuid);
insert into e
  select 'medico', id from public.medicos where cmp = 'CMP-H-0001'
  union all select 'pa', id from public.pacientes where numero_documento = '76000001'
  union all select 'pb', id from public.pacientes where numero_documento = '76000002'
  union all select 'ha', h.id from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '76000001'
  union all select 'hb', h.id from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '76000002'
  union all select 'atencion_a', gen_random_uuid();

-- RLS activada en las cinco tablas.
select ok((select relrowsecurity from pg_class where oid = 'public.historias_clinicas'::regclass), 'historias_clinicas tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.atenciones'::regclass), 'atenciones tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.addendas'::regclass), 'addendas tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.antecedentes'::regclass), 'antecedentes tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.cie10'::regclass), 'cie10 tiene RLS activada');

-- Una atención completa se guarda.
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'atencion_a'), (select id from e where clave = 'ha'), (select id from e where clave = 'pa'),
              (select id from e where clave = 'medico'), 'Dolor de cabeza', 'Hace 3 días', 'Sin hallazgos',
              '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'Reposo e hidratación') $q$,
  'una atención con todos los campos y un diagnóstico se guarda'
);

-- Campos en blanco.
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'ha'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              '   ', 'x', 'x', '[{"cie10": "R51"}]', 'x') $q$,
  '23514', null, 'el motivo de consulta en blanco (solo espacios) se rechaza'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'ha'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              'x', '', 'x', '[{"cie10": "R51"}]', 'x') $q$,
  '23514', null, 'la anamnesis vacía se rechaza'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'ha'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              'x', 'x', E'\n\t ', '[{"cie10": "R51"}]', 'x') $q$,
  '23514', null, 'el examen físico en blanco se rechaza'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'ha'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              'x', 'x', 'x', '[{"cie10": "R51"}]', '') $q$,
  '23514', null, 'el plan de tratamiento vacío se rechaza'
);

-- Diagnósticos.
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'ha'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              'x', 'x', 'x', '[]', 'x') $q$,
  '23514', null, 'una atención sin diagnósticos (lista vacía) se rechaza'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'ha'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              'x', 'x', 'x', '{"cie10": "R51"}', 'x') $q$,
  '23514', null, 'diagnosticos debe ser una lista, no un objeto'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, plan_tratamiento)
      values ((select id from e where clave = 'ha'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              'x', 'x', 'x', 'x') $q$,
  '23514', null, 'omitir los diagnósticos también se rechaza (el valor por defecto es una lista vacía)'
);

-- Consistencia de la denormalización: la atención debe coincidir con el paciente dueño de la historia.
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'hb'), (select id from e where clave = 'pa'), (select id from e where clave = 'medico'),
              'x', 'x', 'x', '[{"cie10": "R51"}]', 'x') $q$,
  '23503', null, 'una atención no puede apuntar a la historia de un paciente distinto del que declara'
);

-- Addendas.
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'atencion_a'), (select id from e where clave = 'medico'), '  ') $q$,
  '23514', null, 'una addenda en blanco se rechaza'
);
select lives_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'atencion_a'), (select id from e where clave = 'medico'), 'Se corrige la dosis') $q$,
  'una addenda con texto se guarda'
);

-- Antecedentes.
select throws_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
      values ((select id from e where clave = 'pa'), 'alergico', ' ', (select id from e where clave = 'medico')) $q$,
  '23514', null, 'un antecedente en blanco se rechaza'
);
select lives_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
      values ((select id from e where clave = 'pa'), 'alergico', 'Alergia a la penicilina', (select id from e where clave = 'medico')) $q$,
  'un antecedente con descripción se guarda y nace vigente'
);

-- Una historia por paciente, con número único.
select throws_ok(
  $q$ insert into public.historias_clinicas (paciente_id, numero) values ((select id from e where clave = 'pa'), 'HC-T-OTRA') $q$,
  '23505', null, 'un paciente no puede tener dos historias clínicas'
);
select throws_ok(
  $q$ update public.historias_clinicas
         set numero = (select numero from public.historias_clinicas where paciente_id = (select id from e where clave = 'pa'))
       where paciente_id = (select id from e where clave = 'pb') $q$,
  '23505', null, 'el número de historia es único'
);
select throws_ok(
  $q$ insert into public.cie10 (codigo, descripcion) values ('R51', 'Cefalea'), ('R51', 'Cefalea duplicada') $q$,
  '23505', null, 'el código CIE-10 es la clave primaria: no se repite'
);

select * from finish();
