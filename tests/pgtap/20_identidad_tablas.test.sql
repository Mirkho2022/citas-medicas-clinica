-- Identidad y personas (H2, tarea 4.1): restricciones de perfiles, pacientes, especialidades, médicos y
-- enfermeras, y que las tablas tienen RLS activada.
-- Spec: identidad-de-personas.
select plan(23);

-- RLS activada en cada tabla. Las pruebas negativas de las políticas (qué rol NO ve ni escribe qué) están en
-- 22 a 25; aquí solo las restricciones de datos.
select ok((select relrowsecurity from pg_class where oid = 'public.perfiles'::regclass), 'perfiles tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.pacientes'::regclass), 'pacientes tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.especialidades'::regclass), 'especialidades tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.medicos'::regclass), 'medicos tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.enfermeras'::regclass), 'enfermeras tiene RLS activada');

-- perfiles
insert into public.perfiles (clerk_user_id, nombres, apellidos) values ('user_t1', 'Ana', 'Quispe');
select is(
  (select rol::text from public.perfiles where clerk_user_id = 'user_t1'), 'paciente',
  'el rol por defecto de un perfil es paciente'
);
select throws_ok(
  $q$ insert into public.perfiles (clerk_user_id, nombres, apellidos) values ('user_t1', 'Otra', 'Persona') $q$,
  '23505', null, 'no puede haber dos perfiles con el mismo clerk_user_id'
);

-- pacientes: documento peruano válido
insert into public.perfiles (clerk_user_id, nombres, apellidos) values ('user_t2', 'Luis', 'Rojas');
select lives_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '12345678', 'Ana', 'Quispe', '1990-05-17', 'F', 'Ana@Demo.invalid') $q$,
  'un DNI de 8 dígitos se acepta'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '1234567A', 'X', 'Y', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '23514', null, 'un DNI con letras se rechaza'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '1234567', 'X', 'Y', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '23514', null, 'un DNI de 7 dígitos se rechaza'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '123456789', 'X', 'Y', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '23514', null, 'un DNI de 9 dígitos se rechaza'
);
select lives_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('CE', 'A12345678', 'Maria', 'Gomez', '1985-03-02', 'F', 'maria@demo.invalid') $q$,
  'un Carné de Extranjería alfanumérico de 9 caracteres se acepta'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('CE', 'A1234567', 'X', 'Y', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '23514', null, 'un Carné de Extranjería de 8 caracteres se rechaza'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('CE', 'A123456789012', 'X', 'Y', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '23514', null, 'un Carné de Extranjería de 13 caracteres se rechaza'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('CE', 'A1234-678', 'X', 'Y', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '23514', null, 'un Carné de Extranjería con símbolos se rechaza'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '12345678', 'Otra', 'Persona', '1991-01-01', 'M', 'otra@demo.invalid') $q$,
  '23505', null, 'un mismo (tipo, número) de documento no puede registrarse dos veces'
);
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '87654321', 'X', 'Y', '1990-01-01', 'Q', 'x@demo.invalid') $q$,
  '23514', null, 'el sexo solo admite M, F o X'
);

-- Paciente sin cuenta de portal y vínculo único con un perfil
select lives_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
      values ('DNI', '11112222', 'Sin', 'Cuenta', '1970-01-01', 'M', 'sin@demo.invalid', null) $q$,
  'un paciente puede existir sin perfil (perfil_id nulo)'
);
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '33334444', 'Con', 'Cuenta', '1980-01-01', 'F', 'con@demo.invalid',
          (select id from public.perfiles where clerk_user_id = 'user_t2'));
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
      values ('DNI', '55556666', 'Dos', 'Cuentas', '1980-01-01', 'F', 'dos@demo.invalid',
              (select id from public.perfiles where clerk_user_id = 'user_t2')) $q$,
  '23505', null, 'un perfil no puede asociarse a un segundo paciente'
);

-- Personal: médicos y enfermeras
insert into public.especialidades (nombre) values ('Cardiología (prueba)');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_t3', 'medico', 'Carlos', 'Vega');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = 'user_t3'), 'CMP-0001',
          (select id from public.especialidades where nombre = 'Cardiología (prueba)'));
select throws_ok(
  $q$ insert into public.especialidades (nombre) values ('Cardiología (prueba)') $q$,
  '23505', null, 'no puede haber dos especialidades con el mismo nombre'
);
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_t4', 'medico', 'Otro', 'Medico');
select throws_ok(
  $q$ insert into public.medicos (perfil_id, cmp, especialidad_id)
      values ((select id from public.perfiles where clerk_user_id = 'user_t4'), 'CMP-0001',
              (select id from public.especialidades where nombre = 'Cardiología (prueba)')) $q$,
  '23505', null, 'la colegiatura (CMP) de un médico es única'
);
select throws_ok(
  $q$ insert into public.medicos (perfil_id, cmp, especialidad_id)
      values ((select id from public.perfiles where clerk_user_id = 'user_t3'), 'CMP-0002',
              (select id from public.especialidades where nombre = 'Cardiología (prueba)')) $q$,
  '23505', null, 'un perfil no puede asociarse a un segundo médico'
);
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_t5', 'enfermera', 'Rosa', 'Diaz');
insert into public.enfermeras (perfil_id) values ((select id from public.perfiles where clerk_user_id = 'user_t5'));
select throws_ok(
  $q$ insert into public.enfermeras (perfil_id) values ((select id from public.perfiles where clerk_user_id = 'user_t5')) $q$,
  '23505', null, 'un perfil no puede asociarse a una segunda enfermera'
);

select * from finish();
