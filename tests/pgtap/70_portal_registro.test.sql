-- Registro del paciente en el portal (H4, tarea 2.3): public.correo_actual() y public.registrar_paciente_portal().
-- Spec: registro-del-paciente. ADR-0037: se vincula una ficha existente solo si coinciden el correo verificado de la cuenta y la
-- fecha de nacimiento; cualquier otro caso es el mismo error PA002. Es una función SECURITY DEFINER (por encima de RLS), así que
-- cada rol y cada dato equivocado tiene su caso negativo.
select plan(32);

-- ---- Datos de prueba (dueño). Documentos 72000001 a 72000003 (los de demostración son 99…). ----
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B'),
  ('user_test_otra_cuenta', 'paciente', 'Otra', 'Cuenta');
insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, telefono, email) values
  -- F1: sin cuenta, con el correo de paciente_a escrito con mayúsculas (la comparación no distingue mayúsculas).
  (null, 'DNI', '72000001', 'Original', 'Uno', '1990-05-05', 'F', '111111111', 'Paciente_A@Pruebas.invalid'),
  -- F2: ya vinculada a otra cuenta, con el correo y la fecha de paciente_b.
  ((select id from public.perfiles where clerk_user_id = 'user_test_otra_cuenta'),
   'DNI', '72000002', 'Dos', 'Vinculada', '1992-02-02', 'M', '222222222', 'paciente_b@pruebas.invalid'),
  -- F3: sin cuenta, con otro correo.
  (null, 'DNI', '72000003', 'Tres', 'Otra Persona', '1991-01-01', 'X', '333333333', 'otra.persona@demo.invalid');

-- ---- El claim email llega a la base (tarea 2.1) ----
select tests.autenticar_como('paciente_a');
select is((select public.correo_actual()), 'paciente_a@pruebas.invalid', 'correo_actual() devuelve el correo del token, en minúsculas');
select tests.volver_a_dueno();
select is((select auth.session() ->> 'email'), 'paciente_a@pruebas.invalid', 'el token de paciente_a lleva el claim email');

-- ---- Rechazos de paciente_a: ninguno deja rastro ----
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000001', 'Paula', 'A', '1990-05-06', 'F') $q$,
  'PA002', null, 'una fecha de nacimiento distinta NO vincula la ficha'
);
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000003', 'Paula', 'A', '1991-01-01', 'X') $q$,
  'PA002', null, 'un correo distinto (con la fecha correcta) NO vincula la ficha'
);
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '7200009', 'Paula', 'A', '1990-05-05', 'F') $q$,
  '23514', null, 'un DNI de 7 dígitos lo rechaza el CHECK de formato de pacientes'
);
select tests.volver_a_dueno();
select is(
  (select perfil_id from public.pacientes where numero_documento = '72000001'), null::uuid,
  'tras los rechazos la ficha F1 sigue sin cuenta'
);
select is_empty(
  $q$ select 1 from public.pacientes where numero_documento in ('7200009') $q$,
  'tras los rechazos no se creó ninguna ficha nueva'
);

-- ---- paciente_a vincula su ficha ----
select tests.autenticar_como('paciente_a');
select is(
  (select vinculado from public.registrar_paciente_portal('DNI', '72000001', 'Cambiado', 'Intento', '1990-05-05', 'M', '999999999', 'Calle Falsa 1')),
  true, 'con el correo y la fecha correctos la ficha existente se vincula (aunque el correo de la ficha tenga mayúsculas)'
);
select tests.volver_a_dueno();
select is(
  (select perfil_id from public.pacientes where numero_documento = '72000001'),
  (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')),
  'la ficha quedó vinculada al perfil de la sesión'
);
select is(
  (select row(nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion)::text from public.pacientes where numero_documento = '72000001'),
  row('Original', 'Uno', '1990-05-05'::date, 'F', '111111111', null::text)::text,
  'vincular NO sobrescribe ningún dato de la ficha (aunque se envíen otros)'
);
select is(
  (select count(*)::int from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '72000001'), 1,
  'la ficha vinculada tiene su única historia clínica'
);
select tests.autenticar_como('paciente_a');
select is(
  (select count(*)::int from public.historias_clinicas), 0,
  'el paciente NO ve ninguna historia clínica, ni la suya'
);
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000001', 'Paula', 'A', '1990-05-05', 'F') $q$,
  'PA001', null, 'una cuenta que ya tiene ficha no vuelve a registrarse'
);

-- ---- paciente_b: rechazos y alta de un documento nuevo ----
select tests.autenticar_como('paciente_b');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000002', 'Pablo', 'B', '1992-02-02', 'M') $q$,
  'PA002', null, 'una ficha vinculada a OTRA cuenta no se reclama, aunque coincidan el correo y la fecha'
);
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000001', 'Pablo', 'B', '1990-05-05', 'F') $q$,
  'PA002', null, 'un documento ya vinculado a paciente_a no se reclama'
);
select is(
  (select vinculado from public.registrar_paciente_portal('CE', 'abc123456', '  Pablo ', ' B ', '1985-03-03', 'M', '', null)),
  false, 'un documento nuevo crea la ficha (no es una vinculación)'
);
select tests.volver_a_dueno();
select is(
  (select numero_documento from public.pacientes where perfil_id = (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b'))),
  'ABC123456', 'el Carné de Extranjería se guarda en mayúsculas'
);
select is(
  (select row(nombres, apellidos, email::text, telefono, direccion)::text from public.pacientes where numero_documento = 'ABC123456'),
  row('Pablo', 'B', 'paciente_b@pruebas.invalid', null::text, null::text)::text,
  'la ficha nueva toma el correo del token (no de un parámetro), recorta los espacios y guarda el teléfono vacío como nulo'
);
select is(
  (select count(*)::int from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = 'ABC123456'), 1,
  'la ficha nueva trae su historia clínica'
);
select tests.autenticar_como('paciente_b');
select is((select count(*)::int from public.historias_clinicas), 0, 'el paciente nuevo NO ve su propia historia clínica');
select is(
  (select count(*)::int from public.pacientes where numero_documento in ('72000001', '72000002', '72000003')), 0,
  'el paciente NO ve la ficha de otro paciente ni las fichas sin cuenta'
);

-- ---- Roles que no son paciente ----
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000003', 'X', 'Y', '1991-01-01', 'X') $q$,
  '42501', null, 'el administrativo no se registra como paciente'
);
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000003', 'X', 'Y', '1991-01-01', 'X') $q$,
  '42501', null, 'el médico no se registra como paciente'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000003', 'X', 'Y', '1991-01-01', 'X') $q$,
  '42501', null, 'la enfermera no se registra como paciente'
);
select tests.autenticar_como('sin_rol');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000003', 'X', 'Y', '1991-01-01', 'X') $q$,
  '42501', null, 'una sesión sin rol no se registra como paciente'
);

-- ---- Cuenta sin perfil todavía y token sin correo ----
select tests.autenticar_como('paciente_sin_correo');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000003', 'X', 'Y', '1991-01-01', 'X') $q$,
  'PA003', null, 'sin perfil (el alta de Clerk no terminó de sincronizarse) se pide reintentar'
);
select tests.volver_a_dueno();
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values (tests.sub('paciente_sin_correo'), 'paciente', 'Sin', 'Correo');
select tests.autenticar_como('paciente_sin_correo');
select throws_ok(
  $q$ select * from public.registrar_paciente_portal('DNI', '72000003', 'X', 'Y', '1991-01-01', 'X') $q$,
  'PA004', null, 'una sesión sin el claim email no registra ni vincula'
);
select is((select public.correo_actual()), null::text, 'sin el claim email correo_actual() es nulo');
select tests.volver_a_dueno();
select is(
  (select perfil_id from public.pacientes where numero_documento = '72000003'), null::uuid,
  'la ficha F3 sigue sin cuenta tras todos los intentos'
);

-- ---- Privilegios de EXECUTE ----
select ok(
  has_function_privilege('authenticated', 'public.registrar_paciente_portal(public.tipo_documento, text, text, text, date, text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.correo_actual()', 'execute'),
  'authenticated puede ejecutar las dos funciones'
);
select ok(
  not has_function_privilege('anonymous', 'public.registrar_paciente_portal(public.tipo_documento, text, text, text, date, text, text, text)', 'execute')
  and not has_function_privilege('anonymous', 'public.correo_actual()', 'execute'),
  'anonymous NO puede ejecutar las funciones'
);
select is(
  (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
    where p.proname in ('registrar_paciente_portal', 'correo_actual') and p.pronamespace = 'public'::regnamespace and a.grantee = 0),
  0, 'EXECUTE no está concedido a PUBLIC'
);

select * from finish();
