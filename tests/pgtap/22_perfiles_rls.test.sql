-- Identidad y personas (H2, tarea 4.3): privilegios y políticas de perfiles.
-- Spec: aislamiento-por-rol-rls («Datos de identidad visibles según el rol» y «Bloqueo de escalada»).
select plan(23);

-- Datos de prueba (dueño). Los conteos se limitan a los ids de prueba: la base puede tener otros datos.
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'),       'medico',         'Mario', 'MedicoA'),
  (tests.sub('medico_b'),       'medico',         'Marta', 'MedicoB'),
  (tests.sub('enfermera'),      'enfermera',      'Elena', 'Enfermera'),
  (tests.sub('paciente_a'),     'paciente',       'Paula', 'PacienteA'),
  (tests.sub('paciente_b'),     'paciente',       'Pablo', 'PacienteB');

-- Paciente: su perfil y los nombres de los médicos; nada más (negativos).
select tests.autenticar_como('paciente_a');
select is(
  (select count(*)::int from public.perfiles where clerk_user_id like 'user_test_%'), 3,
  'el paciente ve su perfil y el de los dos médicos'
);
select is_empty(
  $q$ select 1 from public.perfiles where clerk_user_id = tests.sub('paciente_b') $q$,
  'el paciente NO ve el perfil de otro paciente'
);
select is_empty(
  $q$ select 1 from public.perfiles where clerk_user_id in (tests.sub('enfermera'), tests.sub('administrativo')) $q$,
  'el paciente NO ve el perfil de la enfermera ni del administrativo'
);

-- Médico
select tests.autenticar_como('medico_a');
select is(
  (select count(*)::int from public.perfiles where clerk_user_id like 'user_test_%'), 2,
  'el médico ve su perfil y el del otro médico'
);
select is_empty(
  $q$ select 1 from public.perfiles where clerk_user_id = tests.sub('paciente_a') $q$,
  'el médico NO ve el perfil de un paciente'
);

-- Enfermera
select tests.autenticar_como('enfermera');
select is(
  (select count(*)::int from public.perfiles where clerk_user_id like 'user_test_%'), 3,
  'la enfermera ve su perfil y el de los dos médicos'
);
select is_empty(
  $q$ select 1 from public.perfiles where clerk_user_id = tests.sub('administrativo') $q$,
  'la enfermera NO ve el perfil del administrativo'
);

-- Administrativo: todos
select tests.autenticar_como('administrativo');
select is(
  (select count(*)::int from public.perfiles where clerk_user_id like 'user_test_%'), 6,
  'el administrativo ve todos los perfiles'
);

-- Un token válido sin rol no ve ni siquiera los nombres de los médicos.
select tests.autenticar_como('sin_rol');
select is(
  (select count(*)::int from public.perfiles where clerk_user_id like 'user_test_%'), 0,
  'una sesión sin rol no ve ningún perfil'
);

-- Escalada: un paciente, un médico o una enfermera intentan cambiar su propio rol.
select tests.autenticar_como('paciente_a');
select lives_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('paciente_a') $q$,
  'el paciente puede intentar el UPDATE de su rol (RLS lo deja en cero filas)'
);
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('medico_a') $q$,
  'el médico puede intentar el UPDATE de su rol (RLS lo deja en cero filas)'
);
select tests.autenticar_como('enfermera');
select lives_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('enfermera') $q$,
  'la enfermera puede intentar el UPDATE de su rol (RLS lo deja en cero filas)'
);
select tests.volver_a_dueno();
select is_empty(
  $q$ select 1 from public.perfiles
      where (clerk_user_id = tests.sub('paciente_a') and rol <> 'paciente')
         or (clerk_user_id = tests.sub('medico_a') and rol <> 'medico')
         or (clerk_user_id = tests.sub('enfermera') and rol <> 'enfermera') $q$,
  'ninguno logró cambiar su rol (negativo)'
);

-- Un paciente tampoco edita su propio nombre: no hay política de actualización para él.
select tests.autenticar_como('paciente_a');
select lives_ok(
  $q$ update public.perfiles set nombres = 'Hackeado' where clerk_user_id = tests.sub('paciente_a') $q$,
  'el paciente puede intentar editar su nombre (RLS lo deja en cero filas)'
);
select tests.volver_a_dueno();
select is(
  (select nombres from public.perfiles where clerk_user_id = tests.sub('paciente_a')), 'Paula',
  'el nombre del paciente no cambió'
);

-- El administrativo sí cambia el rol y da de baja.
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ update public.perfiles set rol = 'enfermera' where clerk_user_id = tests.sub('paciente_b') $q$,
  'el administrativo actualiza el rol de un perfil'
);
select lives_ok(
  $q$ update public.perfiles set activo = false where clerk_user_id = tests.sub('medico_b') $q$,
  'el administrativo da de baja un perfil'
);
select tests.volver_a_dueno();
select ok(
  (select rol::text from public.perfiles where clerk_user_id = tests.sub('paciente_b')) = 'enfermera'
  and not (select activo from public.perfiles where clerk_user_id = tests.sub('medico_b')),
  'los cambios del administrativo se aplicaron'
);

-- Sin INSERT, sin DELETE y sin poder tocar clerk_user_id, ni siquiera el administrativo.
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ insert into public.perfiles (clerk_user_id, nombres, apellidos) values ('user_test_nuevo', 'N', 'N') $q$,
  '42501', null, 'ni el administrativo inserta perfiles (los crea el webhook de sincronización)'
);
select throws_ok(
  $q$ delete from public.perfiles where clerk_user_id = tests.sub('paciente_a') $q$,
  '42501', null, 'ni el administrativo borra perfiles'
);
select throws_ok(
  $q$ update public.perfiles set clerk_user_id = 'user_suplantado' where clerk_user_id = tests.sub('paciente_a') $q$,
  '42501', null, 'ni el administrativo puede cambiar clerk_user_id (suplantación)'
);
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_test_colado', 'administrativo', 'N', 'N') $q$,
  '42501', null, 'un paciente no puede insertar un perfil con rol administrativo'
);

select ok(
  not has_table_privilege('anonymous', 'public.perfiles', 'SELECT'),
  'el rol anonymous no tiene acceso a perfiles'
);

select * from finish();
