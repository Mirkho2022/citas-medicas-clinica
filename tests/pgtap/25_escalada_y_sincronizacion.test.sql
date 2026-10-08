-- Identidad y personas (H2, tarea 4.6): bloqueo de escalada de privilegios y rol de sincronización.
-- Spec: aislamiento-por-rol-rls («Bloqueo de escalada de privilegios» y «Rol de sincronización acotado»).
select plan(18);

-- Para actuar como el webhook hace falta poder hacer SET ROLE sync_identidad; el dueño creó el rol pero la
-- pertenencia con SET no es automática. Se concede dentro de la transacción de prueba (se revierte).
grant sync_identidad to current_user with set true;

-- ---- Rol de sincronización (sin identidad de usuario: el webhook no lleva token) ----
set local role sync_identidad;
select lives_ok(
  $q$ insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_test_sync_1', 'paciente', 'Sofia', 'Sync') $q$,
  'sync_identidad crea un perfil'
);
select lives_ok(
  $q$ insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_test_sync_1', 'medico', 'Sofia', 'Actualizada')
      on conflict (clerk_user_id) do update set nombres = excluded.nombres, apellidos = excluded.apellidos, rol = excluded.rol $q$,
  'sync_identidad hace upsert idempotente de un perfil, incluido el cambio de rol'
);
select throws_ok($q$ select 1 from public.pacientes $q$, '42501', null, 'sync_identidad NO lee pacientes');
select throws_ok($q$ select 1 from public.medicos $q$, '42501', null, 'sync_identidad NO lee médicos');
select throws_ok(
  $q$ delete from public.perfiles where clerk_user_id = 'user_test_sync_1' $q$,
  '42501', null, 'sync_identidad NO borra perfiles'
);
select throws_ok(
  $q$ update public.perfiles set clerk_user_id = 'user_test_suplantado' where clerk_user_id = 'user_test_sync_1' $q$,
  '42501', null, 'sync_identidad NO cambia clerk_user_id'
);
reset role;
select ok(
  (select rol::text from public.perfiles where clerk_user_id = 'user_test_sync_1') = 'medico'
  and (select apellidos from public.perfiles where clerk_user_id = 'user_test_sync_1') = 'Actualizada',
  'el upsert del rol de sincronización se aplicó, también el cambio de rol (el disparador lo permite)'
);
select ok(
  not has_table_privilege('sync_identidad', 'public.pacientes', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.medicos', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.especialidades', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.enfermeras', 'SELECT'),
  'sync_identidad no tiene privilegios sobre las demás tablas de identidad'
);

-- ---- El disparador es la barrera de fondo: aun si se concede actualizar la propia fila ----
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'),       'medico',         'Mario', 'MedicoA'),
  (tests.sub('enfermera'),      'enfermera',      'Elena', 'Enfermera'),
  (tests.sub('paciente_a'),     'paciente',       'Paula', 'PacienteA');
-- Política temporal que simula un futuro flujo de edición del propio perfil (se revierte con la prueba).
create policy t_actualiza_el_propio on public.perfiles
  for update to authenticated
  using (id = (select public.perfil_actual())) with check (id = (select public.perfil_actual()));

select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('paciente_a') $q$,
  '42501', 'No autorizado para cambiar el rol o el estado de un usuario',
  'un paciente con permiso de actualizar su fila NO puede ascender su rol'
);
select throws_ok(
  $q$ update public.perfiles set activo = false where clerk_user_id = tests.sub('paciente_a') $q$,
  '42501', 'No autorizado para cambiar el rol o el estado de un usuario',
  'ni cambiar su estado activo'
);
select lives_ok(
  $q$ update public.perfiles set nombres = 'Paula Editada' where clerk_user_id = tests.sub('paciente_a') $q$,
  'el disparador no impide editar otras columnas (nombres)'
);
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('medico_a') $q$,
  '42501', 'No autorizado para cambiar el rol o el estado de un usuario',
  'un médico con permiso de actualizar su fila NO puede ascender su rol'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('enfermera') $q$,
  '42501', 'No autorizado para cambiar el rol o el estado de un usuario',
  'una enfermera con permiso de actualizar su fila NO puede ascender su rol'
);

-- ---- El administrativo sí cambia el rol ----
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ update public.perfiles set rol = 'enfermera' where clerk_user_id = tests.sub('paciente_a') $q$,
  'el administrativo cambia el rol de un perfil'
);
select tests.volver_a_dueno();
select is(
  (select rol::text from public.perfiles where clerk_user_id = tests.sub('paciente_a')), 'enfermera',
  'el cambio de rol del administrativo se aplicó'
);

-- ---- Definición ----
select ok(
  not has_function_privilege('sync_identidad', 'public.rol_actual()', 'EXECUTE'),
  'sync_identidad no ejecuta rol_actual(): el disparador no la evalúa para el webhook'
);
select has_trigger('public', 'perfiles', 'perfiles_bloquear_rol', 'perfiles tiene el disparador de bloqueo de rol');
select ok(
  not (select prosecdef from pg_proc where oid = 'public.bloquear_cambio_de_rol()'::regprocedure),
  'bloquear_cambio_de_rol() es SECURITY INVOKER (distingue a sync_identidad por current_user)'
);

select * from finish();
