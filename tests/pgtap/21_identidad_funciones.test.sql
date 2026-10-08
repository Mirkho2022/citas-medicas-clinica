-- Identidad y personas (H2, tarea 4.2): perfil_actual(), paciente_actual() y medico_actual().
select plan(11);

-- Sin sesión inicializada (aún no se llamó a tests.autenticar_como) no resuelven a nadie.
select is(public.perfil_actual(), null, 'sin sesión, perfil_actual() devuelve nulo');

-- Datos de prueba, creados por el dueño con los mismos clerk_user_id que llevan los tokens.
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'Prueba'),
  (tests.sub('medico_a'),   'medico',   'Mario', 'Prueba'),
  (tests.sub('enfermera'),  'enfermera', 'Elena', 'Prueba');
insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  values ((select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')),
          'DNI', '70000001', 'Paula', 'Prueba', '1992-02-02', 'F', 'paula@demo.invalid');
insert into public.especialidades (nombre) values ('Medicina general (prueba)');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = tests.sub('medico_a')), 'CMP-T-0001',
          (select id from public.especialidades where nombre = 'Medicina general (prueba)'));

-- Ids esperados, calculados como dueño: authenticated no puede leer las tablas directamente.
create temp table esperado (clave text primary key, id uuid);
grant select on esperado to public;
insert into esperado
  select 'perfil_paciente_a', id from public.perfiles where clerk_user_id = tests.sub('paciente_a')
  union all select 'paciente_a', id from public.pacientes where numero_documento = '70000001'
  union all select 'perfil_medico_a', id from public.perfiles where clerk_user_id = tests.sub('medico_a')
  union all select 'medico_a', id from public.medicos where cmp = 'CMP-T-0001';

-- Paciente
select tests.autenticar_como('paciente_a');
select is(
  public.perfil_actual(),
  (select id from esperado where clave = 'perfil_paciente_a'),
  'perfil_actual() resuelve el perfil del paciente autenticado'
);
select is(
  public.paciente_actual(),
  (select id from esperado where clave = 'paciente_a'),
  'paciente_actual() resuelve el paciente del usuario autenticado'
);
select is(public.medico_actual(), null, 'un paciente no es médico: medico_actual() es nulo');

-- Médico
select tests.autenticar_como('medico_a');
select is(
  public.medico_actual(),
  (select id from esperado where clave = 'medico_a'),
  'medico_actual() resuelve el médico del usuario autenticado'
);
select is(
  public.perfil_actual(),
  (select id from esperado where clave = 'perfil_medico_a'),
  'perfil_actual() resuelve el perfil del médico autenticado'
);
select is(public.paciente_actual(), null, 'un médico no es paciente: paciente_actual() es nulo');

-- Un usuario con token válido pero sin perfil en la base no resuelve a nadie.
select tests.autenticar_como('medico_b');
select is(public.perfil_actual(), null, 'un usuario sin perfil en la base: perfil_actual() es nulo');

-- Privilegios y definición
select ok(
  has_function_privilege('authenticated', 'public.perfil_actual()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.paciente_actual()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.medico_actual()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.perfil_actual()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.paciente_actual()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.medico_actual()', 'EXECUTE'),
  'las tres funciones las ejecuta authenticated y no PUBLIC'
);
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""'])
     from pg_proc
    where oid in ('public.perfil_actual()'::regprocedure, 'public.paciente_actual()'::regprocedure,
                  'public.medico_actual()'::regprocedure)),
  'las tres son SECURITY DEFINER con search_path vacío'
);

-- Las funciones no abren las tablas más allá de RLS: el perfil de la enfermera no se revela a un médico.
select is_empty(
  $q$ select 1 from public.perfiles where clerk_user_id = tests.sub('enfermera') $q$,
  'perfil_actual() no revela perfiles ajenos: un médico no ve el perfil de la enfermera'
);

select * from finish();
