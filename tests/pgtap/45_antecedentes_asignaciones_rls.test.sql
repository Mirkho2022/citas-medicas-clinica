-- Historias clínicas (H2, tarea 6.5): políticas de antecedentes y de asignaciones paciente-médico.
-- Spec: aislamiento-por-rol-rls y integridad-historia-clinica («Antecedentes que no se sobrescriben», «Asignaciones solo-agregar»).
select plan(26);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp antecedentes');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B'),
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-AN-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp antecedentes')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  select 'DNI', '7920000' || n, 'Paciente', 'N' || n, '1990-01-01', 'F', 'an' || n || '@demo.invalid' from generate_series(1, 4) n;

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-AN-a'
  union all select 'mb', id from public.medicos where cmp = 'CMP-AN-b'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7920000%';

-- A tiene a cargo P1 (vigente) y P3 (vencida ayer); B tiene P2. P4 sin nadie.
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo) values
  ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, null, 'manual'),
  ((select id from e where clave = 'p3'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, public.hoy_lima() - 1, 'manual: vencida'),
  ((select id from e where clave = 'p2'), (select id from e where clave = 'mb'), public.hoy_lima() - 30, null, 'manual');

-- Antecedentes preexistentes (dueño): uno de P1 (A a cargo), uno de P2 (B a cargo), uno de P3 (A vencido).
insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por) values
  ((select id from e where clave = 'p1'), 'alergico',  'AN-P1 alergia a la penicilina', (select id from e where clave = 'ma')),
  ((select id from e where clave = 'p2'), 'quirurgico', 'AN-P2 apendicectomía',          (select id from e where clave = 'mb')),
  ((select id from e where clave = 'p3'), 'familiar',  'AN-P3 diabetes familiar',        (select id from e where clave = 'ma'));

-- ---- Antecedentes: lectura ----
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.antecedentes where descripcion like 'AN-%'), 1, 'el médico a cargo ve los antecedentes de SU paciente vigente');
select is_empty($q$ select 1 from public.antecedentes where descripcion = 'AN-P2 apendicectomía' $q$, 'el médico NO ve antecedentes de un paciente a cargo de otro médico');
select is_empty($q$ select 1 from public.antecedentes where descripcion = 'AN-P3 diabetes familiar' $q$, 'el médico NO ve antecedentes cuando su asignación venció');
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.antecedentes where descripcion like 'AN-%'), 0, 'el administrativo NO ve antecedentes');
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.antecedentes where descripcion like 'AN-%'), 0, 'el paciente NO ve antecedentes');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.antecedentes where descripcion like 'AN-%'), 0, 'la enfermera NO ve antecedentes');

-- ---- Antecedentes: escritura ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
      values ((select id from e where clave = 'p1'), 'habito_nocivo', 'AN-P1 tabaquismo', (select id from e where clave = 'ma')) $q$,
  'el médico a cargo registra un antecedente a su nombre'
);
select throws_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
      values ((select id from e where clave = 'p1'), 'habito_nocivo', 'AN-P1 a nombre de otro', (select id from e where clave = 'mb')) $q$,
  '42501', null, 'el médico NO registra un antecedente a nombre de otro médico'
);
select throws_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
      values ((select id from e where clave = 'p4'), 'habito_nocivo', 'AN-P4 sin asignación', (select id from e where clave = 'ma')) $q$,
  '42501', null, 'el médico NO registra antecedentes de un paciente que no tiene a cargo'
);
select throws_ok(
  $q$ update public.antecedentes set descripcion = 'Reescrito' where descripcion = 'AN-P1 alergia a la penicilina' $q$,
  '42501', null, 'el médico NO puede actualizar la descripción (solo `vigente`): privilegio por columna'
);
select throws_ok(
  $q$ delete from public.antecedentes where descripcion = 'AN-P1 alergia a la penicilina' $q$,
  '42501', null, 'el médico NO elimina antecedentes'
);
select lives_ok(
  $q$ update public.antecedentes set vigente = false where descripcion = 'AN-P1 alergia a la penicilina' $q$,
  'el médico marca un antecedente como no vigente'
);
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
      values ((select id from e where clave = 'p1'), 'alergico', 'AN-P1 admin', (select id from e where clave = 'ma')) $q$,
  '42501', null, 'el administrativo NO registra antecedentes'
);
select tests.volver_a_dueno();
select ok(
  (select not vigente from public.antecedentes where descripcion = 'AN-P1 alergia a la penicilina')
  and (select descripcion from public.antecedentes where descripcion = 'AN-P1 alergia a la penicilina') is not null,
  'el antecedente resuelto conserva su descripción original y queda no vigente'
);
select throws_ok(
  $q$ update public.antecedentes set descripcion = 'Reescrito por el dueño' where descripcion = 'AN-P1 alergia a la penicilina' $q$,
  '42501', 'Un antecedente no se reescribe: márquelo como no vigente y registre uno nuevo',
  'el disparador impide reescribir un antecedente aun al dueño de la tabla'
);
select throws_ok(
  $q$ update public.antecedentes set tipo = 'familiar' where descripcion = 'AN-P1 alergia a la penicilina' $q$,
  '42501', null, 'tampoco se cambia el tipo'
);
select throws_ok(
  $q$ delete from public.antecedentes where descripcion = 'AN-P1 alergia a la penicilina' $q$,
  '42501', 'Los antecedentes no se eliminan: márquelo como no vigente',
  'ningún antecedente se elimina, ni por el dueño de la tabla'
);

-- ---- Asignaciones ----
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.asignaciones_paciente_medico where paciente_id in (select id from e)), 3, 'el administrativo ve todas las asignaciones');
select lives_ok(
  $q$ insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_hasta, motivo)
      values ((select id from e where clave = 'p4'), (select id from e where clave = 'mb'), public.hoy_lima() + 90, 'interconsulta') $q$,
  'el administrativo registra una asignación manual'
);
select throws_ok(
  $q$ update public.asignaciones_paciente_medico set vigente_hasta = null where motivo = 'interconsulta' $q$,
  '42501', null, 'las asignaciones son solo-agregar: ni el administrativo las edita'
);
select throws_ok(
  $q$ delete from public.asignaciones_paciente_medico where motivo = 'interconsulta' $q$,
  '42501', null, 'ni las elimina'
);
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.asignaciones_paciente_medico where paciente_id in (select id from e)), 2, 'el médico ve solo sus propias asignaciones');
select throws_ok(
  $q$ insert into public.asignaciones_paciente_medico (paciente_id, medico_id, motivo)
      values ((select id from e where clave = 'p4'), (select id from e where clave = 'ma'), 'me asigno solo') $q$,
  '42501', null, 'el médico NO se asigna pacientes a sí mismo'
);
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.asignaciones_paciente_medico where paciente_id in (select id from e)), 0, 'el paciente NO ve asignaciones');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.asignaciones_paciente_medico where paciente_id in (select id from e)), 0, 'la enfermera NO ve asignaciones');

select ok(
  not has_table_privilege('anonymous', 'public.antecedentes', 'SELECT')
  and not has_table_privilege('anonymous', 'public.asignaciones_paciente_medico', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.antecedentes', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.asignaciones_paciente_medico', 'SELECT'),
  'anonymous y sync_identidad no tienen acceso a antecedentes ni asignaciones'
);

select * from finish();
