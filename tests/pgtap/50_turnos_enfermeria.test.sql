-- Turnos de enfermería (H2, tarea 7.1): restricciones, enfermera_actual() y políticas.
-- Spec: aislamiento-por-rol-rls («Turnos de enfermería acotados a la enfermera»).
select plan(19);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp turnos 1'), ('Esp turnos 2');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('enfermera'), 'enfermera', 'Elena', 'Uno'),
  ('user_test_tn_e2', 'enfermera', 'Eva', 'Dos'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = tests.sub('medico_a')), 'CMP-TN-0001',
          (select id from public.especialidades where nombre = 'Esp turnos 1'));
insert into public.enfermeras (perfil_id)
  select id from public.perfiles where clerk_user_id in (tests.sub('enfermera'), 'user_test_tn_e2');

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'e1', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = tests.sub('enfermera')
  union all select 'e2', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = 'user_test_tn_e2'
  union all select 'medico', id from public.medicos where cmp = 'CMP-TN-0001'
  union all select 'esp1', id from public.especialidades where nombre = 'Esp turnos 1';

insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id) values
  ((select id from e where clave = 'e1'), '2032-03-01', 'manana', (select id from e where clave = 'medico')),
  ((select id from e where clave = 'e1'), '2032-03-02', 'tarde',  (select id from e where clave = 'medico')),
  ((select id from e where clave = 'e2'), '2032-03-01', 'manana', (select id from e where clave = 'medico'));

-- ---- Restricciones ----
select ok((select relrowsecurity from pg_class where oid = 'public.turnos_enfermeria'::regclass), 'turnos_enfermeria tiene RLS activada');
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e1'), '2032-03-01', 'manana', (select id from e where clave = 'medico')) $q$,
  '23505', null, 'una enfermera no puede tener dos veces el mismo turno el mismo día'
);
select lives_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, especialidad_id)
      values ((select id from e where clave = 'e1'), '2032-03-01', 'tarde', (select id from e where clave = 'esp1')) $q$,
  'otro turno el mismo día se acepta, asignado solo a una especialidad'
);
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno) values ((select id from e where clave = 'e1'), '2032-03-03', 'noche') $q$,
  '23514', null, 'un turno debe indicar un médico o una especialidad'
);

-- ---- enfermera_actual() ----
select tests.autenticar_como('enfermera');
select is(public.enfermera_actual(), (select id from e where clave = 'e1'), 'enfermera_actual() resuelve a la enfermera autenticada');
select tests.autenticar_como('medico_a');
select is(public.enfermera_actual(), null, 'un médico no es enfermera: enfermera_actual() es nulo');
select ok(
  has_function_privilege('authenticated', 'public.enfermera_actual()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.enfermera_actual()', 'EXECUTE')
  and (select prosecdef from pg_proc where oid = 'public.enfermera_actual()'::regprocedure),
  'enfermera_actual() es SECURITY DEFINER y solo la ejecuta authenticated'
);

-- ---- Lectura ----
select tests.autenticar_como('enfermera');
select is(
  (select count(*)::int from public.turnos_enfermeria where enfermera_id in (select id from e)), 3,
  'la enfermera ve sus tres turnos'
);
select is_empty(
  $q$ select 1 from public.turnos_enfermeria where enfermera_id = (select id from e where clave = 'e2') $q$,
  'la enfermera NO ve los turnos de otra enfermera'
);
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.turnos_enfermeria where enfermera_id in (select id from e)), 0, 'el paciente NO ve turnos');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.turnos_enfermeria where enfermera_id in (select id from e)), 0, 'el médico NO ve turnos');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.turnos_enfermeria where enfermera_id in (select id from e)), 0, 'una sesión sin rol NO ve turnos');

-- ---- Escritura ----
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e1'), '2032-04-01', 'manana', (select id from e where clave = 'medico')) $q$,
  '42501', null, 'la enfermera NO crea turnos'
);
select lives_ok(
  $q$ update public.turnos_enfermeria set turno = 'noche' where enfermera_id = (select id from e where clave = 'e1') and fecha = '2032-03-02' $q$,
  'la enfermera puede intentar cambiar su turno (RLS lo deja en cero filas)'
);
select tests.volver_a_dueno();
select is(
  (select turno::text from public.turnos_enfermeria where enfermera_id = (select id from e where clave = 'e1') and fecha = '2032-03-02'), 'tarde',
  'el turno de la enfermera no cambió'
);
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.turnos_enfermeria where enfermera_id in (select id from e)), 4, 'el administrativo ve todos los turnos');
select lives_ok(
  $q$ update public.turnos_enfermeria set turno = 'noche' where enfermera_id = (select id from e where clave = 'e2') $q$,
  'el administrativo reasigna un turno'
);
select lives_ok(
  $q$ delete from public.turnos_enfermeria where enfermera_id = (select id from e where clave = 'e2') $q$,
  'el administrativo elimina un turno'
);

select ok(not has_table_privilege('anonymous', 'public.turnos_enfermeria', 'SELECT'), 'el rol anonymous no tiene acceso a turnos');

select * from finish();
