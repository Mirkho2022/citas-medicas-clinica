-- Historias clínicas (H2, tarea 6.2): la historia se crea al registrar al paciente.
-- Spec: integridad-historia-clinica («Una carpeta de historia por paciente»).
select plan(8);

-- El dueño registra pacientes (el disparador es SECURITY DEFINER).
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '77000001', 'Paciente', 'Uno', '1990-01-01', 'F', 'h1@demo.invalid'),
  ('DNI', '77000002', 'Paciente', 'Dos', '1991-01-01', 'M', 'h2@demo.invalid');

select is(
  (select count(*)::int from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '77000001'), 1,
  'registrar un paciente crea exactamente una historia clínica'
);
select is(
  (select count(*)::int from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento in ('77000001', '77000002')), 2,
  'cada paciente tiene su propia historia'
);
select matches(
  (select h.numero from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '77000001'),
  '^HC-[0-9]{6}$',
  'el número de historia tiene el formato HC-000000'
);
select isnt(
  (select h.numero from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '77000001'),
  (select h.numero from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '77000002'),
  'los números de historia son distintos'
);
select throws_ok(
  $q$ insert into public.historias_clinicas (paciente_id, numero)
      select id, 'HC-OTRA' from public.pacientes where numero_documento = '77000001' $q$,
  '23505', null, 'no se puede crear una segunda historia para el mismo paciente'
);

-- El administrativo registra pacientes y la historia se crea igual (su acceso a historias se prueba en 6.4).
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '77000003', 'Registrado', 'PorAdmin', '1992-02-02', 'F', 'h3@demo.invalid') $q$,
  'el administrativo registra un paciente: el disparador (SECURITY DEFINER) crea la historia por él'
);
select tests.volver_a_dueno();
select is(
  (select count(*)::int from public.historias_clinicas h join public.pacientes p on p.id = h.paciente_id where p.numero_documento = '77000003'), 1,
  'el paciente registrado por el administrativo también tiene su historia'
);
select ok(
  not has_function_privilege('authenticated', 'public.crear_historia_clinica()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.crear_historia_clinica()', 'EXECUTE'),
  'nadie puede llamar directamente a crear_historia_clinica(): solo el disparador'
);

select * from finish();
