-- Historias clínicas (H2, tarea 6.4): aislamiento por médico a cargo en atenciones, addendas e historias_clinicas.
-- Spec: aislamiento-por-rol-rls («Historias clínicas solo para el médico a cargo», «El acceso expira con la asignación»).
-- Es el riesgo principal del proyecto: cada rol incorrecto tiene su caso negativo.
select plan(31);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp historias rls');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'Uno');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-HR-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp historias rls')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
-- P1 es el paciente del usuario paciente_a (para probar que ni siquiera el titular lee su historia).
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id) values
  ('DNI', '79000001', 'Paula', 'Uno', '1990-01-01', 'F', 'hr1@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '79000002', 'Paciente', 'Dos', '1991-01-01', 'M', 'hr2@demo.invalid'),
  ('DNI', '79000003', 'Paciente', 'Tres', '1992-01-01', 'F', 'hr3@demo.invalid'),
  ('DNI', '79000004', 'Paciente', 'Cuatro', '1993-01-01', 'M', 'hr4@demo.invalid');

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', m.id from public.medicos m where m.cmp = 'CMP-HR-a'
  union all select 'mb', m.id from public.medicos m where m.cmp = 'CMP-HR-b'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7900000%';

-- Asignaciones (como las inserta el administrativo o el disparador de citas): A -> P1 vigente, A -> P4 vencida
-- ayer, B -> P2 vigente. P3 no tiene a nadie a cargo.
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo) values
  ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, null, 'manual'),
  ((select id from e where clave = 'p4'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, public.hoy_lima() - 1, 'manual: vencida'),
  ((select id from e where clave = 'p2'), (select id from e where clave = 'mb'), public.hoy_lima() - 30, null, 'manual');

create function pg_temp.nueva_atencion(p_clave text, p_pac text, p_med text, p_firmada boolean) returns void
language plpgsql as $f$
declare v_id uuid := gen_random_uuid();
begin
  insert into e values (p_clave, v_id);
  insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
  values (v_id, (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = p_pac)),
          (select id from e where clave = p_pac), (select id from e where clave = p_med),
          'Motivo ' || p_clave, 'Anamnesis', 'Examen', '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'Plan',
          case when p_firmada then now() end);
end
$f$;
select pg_temp.nueva_atencion('at1s', 'p1', 'ma', true);   -- P1, autor A, firmada
select pg_temp.nueva_atencion('at1u', 'p1', 'ma', false);  -- P1, autor A, sin firmar
select pg_temp.nueva_atencion('at1b', 'p1', 'mb', false);  -- P1, autor B (A es médico a cargo pero no autor)
select pg_temp.nueva_atencion('at2',  'p2', 'mb', true);   -- P2, a cargo de B, firmada
select pg_temp.nueva_atencion('at3',  'p3', 'ma', false);  -- P3, nadie a cargo
select pg_temp.nueva_atencion('at4',  'p4', 'ma', false);  -- P4, asignación de A vencida

insert into public.addendas (atencion_id, medico_id, texto)
  values ((select id from e where clave = 'at2'), (select id from e where clave = 'mb'), 'Addenda previa en P2');

-- ---- Lectura de atenciones ----
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.atenciones where id in (select id from e)), 3, 'el médico a cargo ve las atenciones de su paciente (de cualquier autor)');
select is_empty($q$ select 1 from public.atenciones where id = (select id from e where clave = 'at2') $q$, 'el médico NO ve las atenciones de un paciente que tiene a cargo OTRO médico');
select is_empty($q$ select 1 from public.atenciones where id = (select id from e where clave = 'at3') $q$, 'el médico NO ve las atenciones de un paciente sin asignación');
select is_empty($q$ select 1 from public.atenciones where id = (select id from e where clave = 'at4') $q$, 'el médico NO ve las atenciones cuando su asignación venció (acceso expirado)');
select tests.autenticar_como('medico_b');
select is((select count(*)::int from public.atenciones where id in (select id from e)), 1, 'el otro médico ve solo la atención de su paciente (no la que él mismo escribió en un paciente ajeno)');
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.atenciones where id in (select id from e)), 0, 'el administrativo NO accede a atenciones');
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.atenciones where id in (select id from e)), 0, 'el paciente NO accede a atenciones, ni siquiera a las de su propia historia');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.atenciones where id in (select id from e)), 0, 'la enfermera NO accede a atenciones');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.atenciones where id in (select id from e)), 0, 'una sesión sin rol NO accede a atenciones');

-- ---- historias_clinicas ----
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.historias_clinicas where paciente_id in (select id from e)), 1, 'el médico ve la historia de su único paciente a cargo vigente');
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.historias_clinicas where paciente_id in (select id from e)), 0, 'el administrativo NO ve historias clínicas');
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.historias_clinicas where paciente_id in (select id from e)), 0, 'el paciente NO ve su historia clínica');

-- ---- Escritura de atenciones ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'Nuevo', 'a', 'b', '[{"cie10": "R51"}]', 'c') $q$,
  'el médico a cargo registra una atención propia sin firmar'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'mb'),
              'A nombre de otro', 'a', 'b', '[{"cie10": "R51"}]', 'c') $q$,
  '42501', null, 'el médico NO registra una atención a nombre de otro médico'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p2')),
              (select id from e where clave = 'p2'), (select id from e where clave = 'ma'),
              'Paciente ajeno', 'a', 'b', '[{"cie10": "R51"}]', 'c') $q$,
  '42501', null, 'el médico NO registra una atención de un paciente que no tiene a cargo'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'Ya firmada', 'a', 'b', '[{"cie10": "R51"}]', 'c', now()) $q$,
  '42501', null, 'una atención no se registra ya firmada: se firma después'
);
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'Admin', 'a', 'b', '[{"cie10": "R51"}]', 'c') $q$,
  '42501', null, 'el administrativo NO registra atenciones'
);
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'Paciente', 'a', 'b', '[{"cie10": "R51"}]', 'c') $q$,
  '42501', null, 'el paciente NO registra atenciones'
);

-- ---- Edición y firma ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ update public.atenciones set anamnesis = 'Corregida' where id = (select id from e where clave = 'at1u') $q$,
  'el autor edita su atención mientras no está firmada'
);
select lives_ok(
  $q$ update public.atenciones set anamnesis = 'Intento ajeno' where id = (select id from e where clave = 'at1b') $q$,
  'un médico a cargo puede intentar editar la atención de otro autor (RLS lo deja en cero filas)'
);
select lives_ok(
  $q$ update public.atenciones set firmada_en = now() where id = (select id from e where clave = 'at1u') $q$,
  'el autor firma su atención'
);
select lives_ok(
  $q$ update public.atenciones set anamnesis = 'Intento sobre firmada' where id = (select id from e where clave = 'at1s') $q$,
  'editar una atención ya firmada deja cero filas (el disparador de 6.5 la protege además)'
);
select tests.volver_a_dueno();
select ok(
  (select anamnesis from public.atenciones where id = (select id from e where clave = 'at1u')) = 'Corregida'
  and (select firmada_en is not null from public.atenciones where id = (select id from e where clave = 'at1u'))
  and (select anamnesis from public.atenciones where id = (select id from e where clave = 'at1b')) = 'Anamnesis'
  and (select anamnesis from public.atenciones where id = (select id from e where clave = 'at1s')) = 'Anamnesis',
  'la edición y la firma del autor se aplicaron; la ajena y la de la firmada no'
);

-- ---- Addendas ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'at1s'), (select id from e where clave = 'ma'), 'Se corrige la dosis') $q$,
  'el médico a cargo registra una addenda sobre una atención firmada'
);
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'at1b'), (select id from e where clave = 'ma'), 'Sobre atención sin firmar') $q$,
  '42501', null, 'no hay addenda sobre una atención sin firmar (se edita directamente)'
);
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'at2'), (select id from e where clave = 'ma'), 'Paciente ajeno') $q$,
  '42501', null, 'el médico NO registra addendas sobre un paciente que no tiene a cargo'
);
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'at1s'), (select id from e where clave = 'mb'), 'A nombre de otro') $q$,
  '42501', null, 'el médico NO firma una addenda a nombre de otro médico'
);
select is((select count(*)::int from public.addendas where atencion_id in (select id from e)), 1, 'el médico a cargo ve las addendas de su paciente (no las de pacientes ajenos)');
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.addendas where atencion_id in (select id from e)), 0, 'el administrativo NO ve addendas');
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.addendas where atencion_id in (select id from e)), 0, 'el paciente NO ve addendas');

select ok(
  not has_table_privilege('anonymous', 'public.atenciones', 'SELECT')
  and not has_table_privilege('anonymous', 'public.addendas', 'SELECT')
  and not has_table_privilege('anonymous', 'public.historias_clinicas', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.atenciones', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.historias_clinicas', 'SELECT'),
  'anonymous y sync_identidad no tienen acceso a datos clínicos'
);

select * from finish();
