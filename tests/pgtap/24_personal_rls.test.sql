-- Identidad y personas (H2, tarea 4.5): políticas de especialidades, médicos y enfermeras.
-- Spec: aislamiento-por-rol-rls («Catálogos y personal legibles, solo administrables por el administrativo»).
select plan(24);

-- Datos de prueba (dueño). Se filtra por nombres/CMP/ids de prueba: la base puede tener otros datos.
insert into public.especialidades (nombre) values ('Esp prueba 1'), ('Esp prueba 2');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'),  'medico',    'Mario', 'MedicoA'),
  (tests.sub('enfermera'), 'enfermera', 'Elena', 'Enfermera'),
  ('user_test_enfermera_2', 'enfermera', 'Eva', 'Otra');
insert into public.medicos (perfil_id, cmp, especialidad_id) values
  ((select id from public.perfiles where clerk_user_id = tests.sub('medico_a')), 'CMP-P-0001',
   (select id from public.especialidades where nombre = 'Esp prueba 1'));
insert into public.enfermeras (perfil_id) values
  ((select id from public.perfiles where clerk_user_id = tests.sub('enfermera'))),
  ((select id from public.perfiles where clerk_user_id = 'user_test_enfermera_2'));

-- Ids de prueba calculados como dueño: authenticated no puede leer las tablas directamente.
create temp table esperado (clave text primary key, id uuid);
grant select on esperado to public;
insert into esperado
  select 'perfil_enfermera_1', id from public.perfiles where clerk_user_id = tests.sub('enfermera')
  union all select 'perfil_enfermera_2', id from public.perfiles where clerk_user_id = 'user_test_enfermera_2'
  union all select 'esp_1', id from public.especialidades where nombre = 'Esp prueba 1';

-- Lectura: cualquier sesión con rol válido lee especialidades y médicos; una sesión sin rol, nada.
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.especialidades where nombre like 'Esp prueba%'), 2, 'el paciente lee las especialidades');
select is((select count(*)::int from public.medicos where cmp = 'CMP-P-0001'), 1, 'el paciente lee los médicos');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.medicos where cmp = 'CMP-P-0001'), 1, 'el médico lee los médicos');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.medicos where cmp = 'CMP-P-0001'), 1, 'la enfermera lee los médicos');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.especialidades where nombre like 'Esp prueba%'), 0, 'una sesión sin rol NO lee especialidades');
select is((select count(*)::int from public.medicos where cmp = 'CMP-P-0001'), 0, 'una sesión sin rol NO lee médicos');

-- Escritura: solo el administrativo (negativos para los demás roles).
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.especialidades (nombre) values ('Esp colada') $q$,
  '42501', null, 'un paciente no crea especialidades'
);
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.especialidades (nombre) values ('Esp colada') $q$,
  '42501', null, 'un médico no crea especialidades'
);
select lives_ok(
  $q$ update public.medicos set cmp = 'CMP-HACK' where cmp = 'CMP-P-0001' $q$,
  'un médico puede intentar editar su registro (RLS lo deja en cero filas)'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.medicos (perfil_id, cmp, especialidad_id)
      values ((select id from esperado where clave = 'perfil_enfermera_2'), 'CMP-COLADO',
              (select id from esperado where clave = 'esp_1')) $q$,
  '42501', null, 'una enfermera no crea médicos'
);
select tests.volver_a_dueno();
select is(
  (select count(*)::int from public.medicos where cmp in ('CMP-HACK', 'CMP-COLADO')), 0,
  'ninguna escritura no autorizada sobre médicos se aplicó'
);

-- Administrativo: gestiona catálogos y personal; no borra médicos.
select tests.autenticar_como('administrativo');
select lives_ok($q$ insert into public.especialidades (nombre) values ('Esp prueba 3') $q$, 'el administrativo crea una especialidad');
select lives_ok($q$ update public.especialidades set nombre = 'Esp prueba 3b' where nombre = 'Esp prueba 3' $q$, 'el administrativo renombra una especialidad');
select lives_ok($q$ delete from public.especialidades where nombre = 'Esp prueba 3b' $q$, 'el administrativo borra una especialidad sin uso');
select lives_ok($q$ update public.medicos set activo = false where cmp = 'CMP-P-0001' $q$, 'el administrativo da de baja a un médico');
select throws_ok($q$ delete from public.medicos where cmp = 'CMP-P-0001' $q$, '42501', null, 'ni el administrativo borra médicos (se da de baja con activo)');
select tests.volver_a_dueno();
select ok(
  not (select activo from public.medicos where cmp = 'CMP-P-0001')
  and not exists (select 1 from public.especialidades where nombre in ('Esp prueba 3', 'Esp prueba 3b')),
  'los cambios del administrativo se aplicaron'
);

-- Enfermeras: cada una ve solo su fila; el administrativo las gestiona.
select tests.autenticar_como('enfermera');
select is(
  (select count(*)::int from public.enfermeras
    where perfil_id in (select id from esperado where clave like 'perfil_enfermera_%')), 1,
  'la enfermera ve una sola fila de enfermeras: la suya'
);
select is_empty(
  $q$ select 1 from public.enfermeras where perfil_id = (select id from esperado where clave = 'perfil_enfermera_2') $q$,
  'la enfermera NO ve a otra enfermera'
);
select tests.autenticar_como('paciente_a');
select is(
  (select count(*)::int from public.enfermeras
    where perfil_id in (select id from esperado where clave like 'perfil_enfermera_%')), 0,
  'el paciente NO ve enfermeras'
);
select tests.autenticar_como('medico_a');
select is(
  (select count(*)::int from public.enfermeras
    where perfil_id in (select id from esperado where clave like 'perfil_enfermera_%')), 0,
  'el médico NO ve enfermeras'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.enfermeras (perfil_id) values ((select id from esperado where clave = 'perfil_enfermera_2')) $q$,
  '42501', null, 'una enfermera no crea enfermeras'
);
select tests.autenticar_como('administrativo');
select is(
  (select count(*)::int from public.enfermeras
    where perfil_id in (select id from esperado where clave like 'perfil_enfermera_%')), 2,
  'el administrativo ve todas las enfermeras'
);

select ok(
  not has_table_privilege('anonymous', 'public.especialidades', 'SELECT')
  and not has_table_privilege('anonymous', 'public.medicos', 'SELECT')
  and not has_table_privilege('anonymous', 'public.enfermeras', 'SELECT'),
  'el rol anonymous no tiene acceso a especialidades, médicos ni enfermeras'
);

select * from finish();
