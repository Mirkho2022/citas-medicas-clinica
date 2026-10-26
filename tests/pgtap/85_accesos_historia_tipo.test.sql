-- historias-clinicas, grupo 4 (tarea 4.2): tipo de acceso y blindaje del rastro de lecturas en accesos_historia.
-- Specs: auditoria-de-accesos-clinicos («Toda lectura de contenido clínico se registra antes de entregarse»,
-- «Los registros de acceso no se alteran», «El administrativo revisa los accesos sin ver contenido»).
-- Cada rol incorrecto tiene su caso negativo. La lectura y su registro van en una sola transacción de la aplicación
-- (lib/historia/repositorio.ts): lo que garantiza la base es que el INSERT del acceso se rechaza cuando el médico no
-- tiene al paciente a cargo, y por eso la transacción entera se revierte y no se entrega contenido.
select plan(42);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp accesos tipo');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-AT-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp accesos tipo')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  select 'DNI', '8500000' || n, 'Paciente', 'N' || n, '1990-01-01', 'F', 'at' || n || '@demo.invalid' from generate_series(1, 4) n;

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-AT-a'
  union all select 'pa_perfil_a', id from public.perfiles where clerk_user_id = tests.sub('medico_a')
  union all select 'pa_perfil_b', id from public.perfiles where clerk_user_id = tests.sub('medico_b')
  union all select 'mb', id from public.medicos where cmp = 'CMP-AT-b'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '8500000%';

-- P1: a cargo de A. P2: a cargo de B. P3: de nadie. P4: la asignación de A venció ayer.
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo) values
  ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, null, 'manual'),
  ((select id from e where clave = 'p2'), (select id from e where clave = 'mb'), public.hoy_lima() - 30, null, 'manual'),
  ((select id from e where clave = 'p4'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, public.hoy_lima() - 1, 'manual: vencida');

create function pg_temp.nueva_atencion(p_clave text, p_pac text, p_med text) returns void
language plpgsql as $f$
declare v_id uuid := gen_random_uuid();
begin
  insert into e values (p_clave, v_id);
  insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  values (v_id, (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = p_pac)),
          (select id from e where clave = p_pac), (select id from e where clave = p_med),
          'Motivo ' || p_clave, 'Anamnesis', 'Examen', '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'Plan');
end
$f$;
select pg_temp.nueva_atencion('at1', 'p1', 'ma');  -- atención de P1
select pg_temp.nueva_atencion('at2', 'p2', 'mb');  -- atención de P2 (a cargo de B)

select ok((select relrowsecurity from pg_class where oid = 'public.accesos_historia'::regclass), 'accesos_historia tiene RLS activada');
select has_column('public', 'accesos_historia', 'tipo_acceso', 'accesos_historia tiene tipo_acceso');
select has_column('public', 'accesos_historia', 'adjunto_id', 'accesos_historia tiene adjunto_id');

-- ---- El médico a cargo registra cada tipo de acceso ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  'el médico a cargo registra un acceso sin indicar el tipo (por defecto, historia)'
);
select lives_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'historia') $q$,
  'el médico a cargo registra un acceso de tipo historia'
);
select lives_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'atencion', (select id from e where clave = 'at1')) $q$,
  'el médico a cargo registra un acceso de tipo atención con la atención del paciente'
);
select lives_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, adjunto_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'adjunto', gen_random_uuid()) $q$,
  'el médico a cargo registra un acceso de tipo adjunto con su identificador'
);

-- ---- Tipos y recursos incoherentes ----
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'borrado') $q$,
  '23514', null, 'un tipo de acceso no permitido se rechaza (23514)'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'historia', (select id from e where clave = 'at1')) $q$,
  '23514', null, 'un acceso de tipo historia con atención se rechaza (23514)'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'adjunto') $q$,
  '23514', null, 'un acceso de tipo adjunto sin identificador se rechaza (23514)'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id, adjunto_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'adjunto', (select id from e where clave = 'at1'), gen_random_uuid()) $q$,
  '23514', null, 'un acceso de tipo adjunto que además trae atención se rechaza (23514)'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'atencion') $q$,
  '42501', null, 'un acceso de tipo atención sin identificador se rechaza'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'atencion', gen_random_uuid()) $q$,
  '42501', null, 'un acceso de tipo atención con una atención inexistente se rechaza'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), 'atencion', (select id from e where clave = 'at2')) $q$,
  '42501', null, 'el médico NO registra un acceso a una atención de OTRO paciente aunque tenga a este a cargo (rastro falso)'
);

-- ---- Negativos del médico ----
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p2')) $q$,
  '42501', null, 'el médico NO registra un acceso a un paciente que tiene a cargo otro médico'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p3')) $q$,
  '42501', null, 'el médico NO registra un acceso a un paciente sin nadie a cargo'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p4')) $q$,
  '42501', null, 'el médico NO registra un acceso cuando su asignación venció ayer'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_b'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'el médico NO registra un acceso a nombre de otro médico'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, creado_en)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1'), now() - interval '10 days') $q$,
  '42501', null, 'el médico NO fija la hora del acceso (la pone la base)'
);
select throws_ok(
  $q$ insert into public.accesos_historia (id, actor_id, paciente_id)
      values (-1, (select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'el médico NO fija el identificador del acceso'
);
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'el médico NO lee el registro de accesos, ni los suyos');
select throws_ok($q$ update public.accesos_historia set tipo_acceso = 'historia' $q$, '42501', null, 'el médico NO actualiza el registro de accesos');
select throws_ok($q$ delete from public.accesos_historia $q$, '42501', null, 'el médico NO borra el registro de accesos');

-- ---- El otro médico no ve ni escribe sobre P1 ----
select tests.autenticar_como('medico_b');
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id)
      values ((select id from e where clave = 'pa_perfil_b'), (select id from e where clave = 'p1'), 'atencion', (select id from e where clave = 'at1')) $q$,
  '42501', null, 'el otro médico NO registra un acceso a la atención de un paciente que no tiene a cargo'
);
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'el otro médico tampoco lee el registro de accesos');

-- ---- El administrativo revisa, sin escribir ----
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 4, 'el administrativo lee los cuatro accesos registrados');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e) and tipo_acceso = 'historia'), 2, 'el tipo por defecto es historia (el explícito y el omitido)');
select is((select count(*)::int from public.accesos_historia where tipo_acceso = 'atencion' and atencion_id = (select id from e where clave = 'at1')), 1, 'el administrativo ve el acceso de tipo atención con su identificador');
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'el administrativo NO registra accesos'
);

-- ---- Paciente, enfermera y sin rol ----
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'el paciente NO lee accesos');
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'el paciente NO registra accesos'
);
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'la enfermera NO lee accesos');
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'la enfermera NO registra accesos'
);
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.accesos_historia where paciente_id in (select id from e)), 0, 'una sesión sin rol NO lee accesos');
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select id from e where clave = 'pa_perfil_a'), (select id from e where clave = 'p1')) $q$,
  '42501', null, 'una sesión sin rol NO registra accesos'
);

-- ---- Solo-agregar incluso para el dueño ----
select tests.volver_a_dueno();
select throws_ok(
  $q$ update public.accesos_historia set tipo_acceso = 'historia' where paciente_id = (select id from e where clave = 'p1') $q$,
  '42501', 'Los registros de auditoría no se modifican ni se eliminan', 'el dueño tampoco modifica el tipo de un acceso'
);
select throws_ok(
  $q$ delete from public.accesos_historia where paciente_id = (select id from e where clave = 'p1') $q$,
  '42501', 'Los registros de auditoría no se modifican ni se eliminan', 'ni elimina accesos'
);

-- ---- Privilegios ----
select ok(
  not has_table_privilege('anonymous', 'public.accesos_historia', 'SELECT')
  and not has_table_privilege('anonymous', 'public.accesos_historia', 'INSERT')
  and not has_table_privilege('cron_notificaciones', 'public.accesos_historia', 'SELECT')
  and not has_table_privilege('cron_notificaciones', 'public.accesos_historia', 'INSERT')
  and not has_table_privilege('sync_identidad', 'public.accesos_historia', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.accesos_historia', 'INSERT'),
  'anonymous, el cron y la sincronización no leen ni escriben accesos'
);
select ok(
  has_column_privilege('authenticated', 'public.accesos_historia', 'tipo_acceso', 'INSERT')
  and has_column_privilege('authenticated', 'public.accesos_historia', 'actor_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.accesos_historia', 'creado_en', 'INSERT')
  and not has_column_privilege('authenticated', 'public.accesos_historia', 'id', 'INSERT'),
  'authenticated inserta solo las columnas que declaran el acceso (no creado_en ni id)'
);
select ok(
  not has_table_privilege('authenticated', 'public.accesos_historia', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.accesos_historia', 'DELETE'),
  'authenticated no tiene UPDATE ni DELETE sobre accesos_historia'
);
select ok(
  (select convalidated from pg_constraint where conname = 'accesos_historia_tipo_valido'),
  'el CHECK del tipo de acceso está validado'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'accesos_historia_recurso_coherente'),
  'existe el CHECK de coherencia entre tipo y recurso'
);

select * from finish();
