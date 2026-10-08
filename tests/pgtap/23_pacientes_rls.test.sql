-- Identidad y personas (H2, tarea 4.4): privilegios y políticas de pacientes.
-- Spec: aislamiento-por-rol-rls («Datos de identidad visibles según el rol»). La lectura del médico con
-- cita o asignación se prueba en 6.6, cuando existen citas y asignaciones.
select plan(16);

-- Datos de prueba (dueño). Los conteos se limitan a los documentos de prueba (710000xx).
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, telefono) values
  ((select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')), 'DNI', '71000001', 'Paula', 'A', '1990-01-01', 'F', 'a@demo.invalid', '999000001'),
  ((select id from public.perfiles where clerk_user_id = tests.sub('paciente_b')), 'DNI', '71000002', 'Pablo', 'B', '1991-02-02', 'M', 'b@demo.invalid', '999000002'),
  (null,                                                                          'DNI', '71000003', 'Sin',   'Cuenta', '1992-03-03', 'X', 'c@demo.invalid', '999000003');

-- Paciente: solo su registro; no actualiza ni inserta.
select tests.autenticar_como('paciente_a');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '710000%'), 1,
  'el paciente ve un solo registro'
);
select is(
  (select numero_documento from public.pacientes where numero_documento like '710000%'), '71000001',
  'el registro que ve es el suyo'
);
select is_empty(
  $q$ select 1 from public.pacientes where numero_documento in ('71000002', '71000003') $q$,
  'el paciente NO ve a otro paciente ni a uno sin cuenta de portal'
);
select lives_ok(
  $q$ update public.pacientes set telefono = '000000000' where numero_documento = '71000001' $q$,
  'el paciente puede intentar editar su registro (RLS lo deja en cero filas)'
);
select tests.volver_a_dueno();
select is(
  (select telefono from public.pacientes where numero_documento = '71000001'), '999000001',
  'el teléfono del paciente no cambió'
);
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '71000099', 'Colado', 'Colado', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '42501', null, 'un paciente no registra pacientes'
);

-- Enfermera, médico (sin relación todavía) y sesión sin rol: nada.
select tests.autenticar_como('enfermera');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '710000%'), 0,
  'la enfermera NO ve pacientes'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '71000098', 'Colado', 'Colado', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '42501', null, 'la enfermera no registra pacientes'
);
select tests.autenticar_como('medico_a');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '710000%'), 0,
  'un médico sin cita ni asignación NO ve pacientes'
);
select tests.autenticar_como('sin_rol');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '710000%'), 0,
  'una sesión sin rol NO ve pacientes'
);

-- Administrativo: ve todos, registra y corrige; no borra.
select tests.autenticar_como('administrativo');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '710000%'), 3,
  'el administrativo ve a todos los pacientes de prueba'
);
select lives_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('CE', 'B71000004X', 'Nuevo', 'Extranjero', '1980-04-04', 'M', 'd@demo.invalid') $q$,
  'el administrativo registra un paciente (Carné de Extranjería, sin cuenta)'
);
select lives_ok(
  $q$ update public.pacientes set telefono = '911111111' where numero_documento = '71000002' $q$,
  'el administrativo corrige los datos de un paciente'
);
select tests.volver_a_dueno();
select ok(
  (select telefono from public.pacientes where numero_documento = '71000002') = '911111111'
  and exists (select 1 from public.pacientes where numero_documento = 'B71000004X'),
  'el alta y la corrección del administrativo se aplicaron'
);
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ delete from public.pacientes where numero_documento = '71000003' $q$,
  '42501', null, 'ni el administrativo borra pacientes'
);

select ok(
  not has_table_privilege('anonymous', 'public.pacientes', 'SELECT'),
  'el rol anonymous no tiene acceso a pacientes'
);

select * from finish();
