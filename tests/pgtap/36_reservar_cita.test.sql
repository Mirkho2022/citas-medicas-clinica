-- H3, tarea 4.2 (agenda-y-reserva): reservar_cita(). Spec: gestion-de-citas («Reserva de una cita» y «Doble reserva»).
select plan(26);

-- Datos de prueba (dueño). Lunes 7/6/2032: m_a y m_b atienden 08:00-10:00 en slots de 20 minutos; m_x está dado de baja.
insert into public.especialidades (nombre) values ('Esp reservar');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B'),
  ('user_test_res_x', 'medico', 'Manuel', 'X'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id, activo)
  select id, 'CMP-RS-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp reservar'),
         clerk_user_id <> 'user_test_res_x'
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'), 'user_test_res_x');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '74360001', 'Paula', 'A', '1990-01-01', 'F', 'rs-pa@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))),
         ('DNI', '74360002', 'Pablo', 'B', '1991-01-01', 'M', 'rs-pb@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b'))),
         ('DNI', '74360003', 'Sin',   'Cuenta', '1992-01-01', 'X', 'rs-pc@demo.invalid', null);
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_b')
  union all select 'm_x', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_res_x'
  union all select 'pa', id from public.pacientes where numero_documento = '74360001'
  union all select 'pb', id from public.pacientes where numero_documento = '74360002'
  union all select 'pc', id from public.pacientes where numero_documento = '74360003'
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo')
  union all select 'perfil_pa', id from public.perfiles where clerk_user_id = tests.sub('paciente_a');
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde, vigente_hasta)
  select id, 1, '08:00', '10:00', 20, '2020-01-01', null from public.medicos
  where id in (select id from e where clave in ('m_a', 'm_b', 'm_x'));
-- Un bloqueo que cubre de 09:00 a 09:20 del 7/6/2032 en la agenda de m_b.
insert into public.bloqueos_agenda (medico_id, rango, motivo)
  values ((select id from e where clave = 'm_b'), tstzrange('2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05'), 'Bloqueo de prueba');

create temp table r (clave text primary key, id uuid);
grant all on r to public;

-- ---- Reserva del administrativo ----
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into r select 'admin', public.reservar_cita(
        (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
        '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05', '  Control general  ') $q$,
  'el administrativo reserva una cita'
);
select tests.volver_a_dueno();
select is(
  (select estado::text || '/' || origen from public.citas where id = (select id from r where clave = 'admin')),
  'reservada/administrativo', 'queda reservada, con origen administrativo'
);
select is(
  (select creada_por from public.citas where id = (select id from r where clave = 'admin')),
  (select id from e where clave = 'perfil_admin'), 'creada_por es el perfil del administrativo'
);
select is(
  (select motivo from public.citas where id = (select id from r where clave = 'admin')), 'Control general',
  'el motivo se guarda recortado'
);
select is(
  (select medico_id from public.citas where id = (select id from r where clave = 'admin')), (select id from e where clave = 'm_a'),
  'con el médico y el horario pedidos'
);

-- ---- Reserva del paciente ----
select tests.autenticar_como('paciente_a');
select lives_ok(
  $q$ insert into r select 'paciente', public.reservar_cita(
        (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
        '2032-06-07 08:20:00-05', '2032-06-07 08:40:00-05') $q$,
  'el paciente reserva a su nombre'
);
select tests.volver_a_dueno();
select is(
  (select estado::text || '/' || origen from public.citas where id = (select id from r where clave = 'paciente')),
  'reservada/portal', 'queda reservada, con origen portal'
);
select is(
  (select creada_por from public.citas where id = (select id from r where clave = 'paciente')),
  (select id from e where clave = 'perfil_pa'), 'creada_por es el perfil del paciente'
);
select is(
  (select motivo from public.citas where id = (select id from r where clave = 'paciente')), null,
  'sin motivo queda nulo'
);

-- ---- Horarios no válidos: UC001 ----
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
        '2021-06-07 08:00:00-05', '2021-06-07 08:20:00-05') $q$,
  'UC001', null, 'un horario pasado falla con UC001'
);
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
        '2032-06-07 08:50:00-05', '2032-06-07 09:10:00-05') $q$,
  'UC001', null, 'un horario fuera de la malla falla con UC001'
);
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
        '2032-06-07 08:40:00-05', '2032-06-07 09:20:00-05') $q$,
  'UC001', null, 'una duración distinta a la del slot falla con UC001'
);
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_b'),
        '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05') $q$,
  'UC001', null, 'un horario dentro de un bloqueo falla con UC001'
);
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_x'),
        '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05') $q$,
  'UC001', null, 'un médico dado de baja falla con UC001'
);
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), null, null) $q$,
  'UC001', null, 'un horario sin inicio o fin falla con UC001'
);

-- ---- Doble reserva: 23P01 ----
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pc'), (select id from e where clave = 'm_a'),
        '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05') $q$,
  '23P01', null, 'una segunda reserva del mismo médico y horario falla con 23P01'
);
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pa'), (select id from e where clave = 'm_b'),
        '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05') $q$,
  '23P01', null, 'el mismo paciente con otro médico a la misma hora también falla con 23P01'
);
select tests.volver_a_dueno();
update public.citas set estado = 'cancelada' where id = (select id from r where clave = 'admin');
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pc'), (select id from e where clave = 'm_a'),
        '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05') $q$,
  'una cita cancelada libera el horario y se puede reservar de nuevo'
);

-- ---- Negativos por rol ----
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05') $q$,
  '42501', null, 'un paciente NO reserva a nombre de otro paciente (42501)'
);
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05') $q$,
  '42501', null, 'un médico NO reserva citas (42501)'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05') $q$,
  '42501', null, 'una enfermera NO reserva citas (42501)'
);
select tests.autenticar_como('sin_rol');
select throws_ok(
  $q$ select public.reservar_cita((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05') $q$,
  '42501', null, 'una sesión sin rol NO reserva citas (42501)'
);
select tests.volver_a_dueno();
select is(
  (select count(*)::int from public.citas where medico_id in (select id from e where clave in ('m_a', 'm_b', 'm_x'))
     and estado in ('reservada', 'confirmada')),
  2, 'los intentos rechazados no dejaron ninguna cita: solo la del paciente y la repuesta del administrativo'
);
select is(
  (select count(*)::int from public.citas where paciente_id = (select id from e where clave = 'pb')),
  0, 'y el paciente B no recibió ninguna cita'
);

-- ---- Forma de la función ----
select ok(
  (select not p.prosecdef and p.proconfig = array['search_path=""']
     from pg_proc p where p.oid = 'public.reservar_cita(uuid,uuid,timestamptz,timestamptz,text)'::regprocedure),
  'reservar_cita es SECURITY INVOKER con search_path vacío'
);
select ok(
  has_function_privilege('authenticated', 'public.reservar_cita(uuid,uuid,timestamptz,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.reservar_cita(uuid,uuid,timestamptz,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.reservar_cita(uuid,uuid,timestamptz,timestamptz,text)', 'EXECUTE'),
  'solo authenticated ejecuta reservar_cita'
);

select * from finish();
