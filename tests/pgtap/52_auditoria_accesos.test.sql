-- Auditoría (H2, tarea 7.3): accesos_historia y auditoria. Spec: aislamiento-por-rol-rls («Auditoría de lectura de
-- historias solo-agregar»).
select plan(23);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp auditoria');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-AU-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp auditoria')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  select 'DNI', '8100000' || n, 'Paciente', 'N' || n, '1990-01-01', 'F', 'au' || n || '@demo.invalid' from generate_series(1, 2) n;
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-AU-a'
  union all select 'pa_perfil_a', id from public.perfiles where clerk_user_id = tests.sub('medico_a')
  union all select 'pa_perfil_b', id from public.perfiles where clerk_user_id = tests.sub('medico_b')
  union all select 'p1', id from public.pacientes where numero_documento = '81000001'
  union all select 'p2', id from public.pacientes where numero_documento = '81000002';
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo)
  values ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), public.hoy_lima() - 1, 'manual');
insert into public.auditoria (accion, tabla, registro_id) values ('INSERT', 'tabla_de_prueba', 'reg-prueba-1');

select ok((select relrowsecurity from pg_class where oid = 'public.auditoria'::regclass), 'auditoria tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.accesos_historia'::regclass), 'accesos_historia tiene RLS activada');

-- ---- accesos_historia: el médico registra sus propios accesos ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  'el médico a cargo registra su propio acceso a la historia de su paciente'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_b'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'el médico NO registra un acceso a nombre de otro médico'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p2')) $q$,
  '42501', null, 'el médico NO registra accesos a un paciente que no tiene a cargo'
);
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'el médico NO lee el registro de accesos (lo revisa el administrativo)');

select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 1, 'el administrativo lee el registro de accesos');
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'el administrativo NO registra accesos'
);
select throws_ok($q$ update public.accesos_historia set paciente_id = paciente_id $q$, '42501', null, 'ningún rol de usuario actualiza accesos_historia');
select throws_ok($q$ delete from public.accesos_historia $q$, '42501', null, 'ningún rol de usuario borra accesos_historia');

select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'el paciente NO lee accesos');
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'el paciente NO registra accesos'
);
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'la enfermera NO lee accesos');

-- Solo-agregar incluso para el dueño.
select tests.volver_a_dueno();
select throws_ok(
  $q$ update public.accesos_historia set atencion_id = gen_random_uuid() where paciente_id = (select id from e where clave = 'p1') $q$,
  '42501', 'Los registros de auditoría no se modifican ni se eliminan', 'el dueño tampoco modifica el registro de accesos'
);
select throws_ok(
  $q$ delete from public.accesos_historia where paciente_id = (select id from e where clave = 'p1') $q$,
  '42501', 'Los registros de auditoría no se modifican ni se eliminan', 'ni lo elimina'
);

-- ---- auditoria ----
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.auditoria where tabla = 'tabla_de_prueba'), 1, 'el administrativo lee la auditoría de escritura');
select throws_ok(
  $q$ insert into public.auditoria (accion, tabla, registro_id) values ('INSERT', 'falsa', 'x') $q$,
  '42501', null, 'ni el administrativo escribe en la auditoría: la escriben los disparadores'
);
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.auditoria where tabla = 'tabla_de_prueba'), 0, 'el médico NO lee la auditoría');
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.auditoria where tabla = 'tabla_de_prueba'), 0, 'el paciente NO lee la auditoría');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.auditoria where tabla = 'tabla_de_prueba'), 0, 'la enfermera NO lee la auditoría');
select tests.volver_a_dueno();
select throws_ok(
  $q$ update public.auditoria set accion = 'DELETE' where tabla = 'tabla_de_prueba' $q$,
  '42501', 'Los registros de auditoría no se modifican ni se eliminan', 'la auditoría no se modifica, ni siquiera por el dueño'
);
select throws_ok(
  $q$ delete from public.auditoria where tabla = 'tabla_de_prueba' $q$,
  '42501', 'Los registros de auditoría no se modifican ni se eliminan', 'ni se elimina'
);

select ok(
  not has_table_privilege('anonymous', 'public.auditoria', 'SELECT')
  and not has_table_privilege('anonymous', 'public.accesos_historia', 'SELECT')
  and not has_table_privilege('cron_notificaciones', 'public.auditoria', 'SELECT')
  and not has_table_privilege('cron_notificaciones', 'public.accesos_historia', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.auditoria', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.accesos_historia', 'SELECT'),
  'anonymous, el cron y la sincronización no tienen acceso a los registros de auditoría'
);

select * from finish();
