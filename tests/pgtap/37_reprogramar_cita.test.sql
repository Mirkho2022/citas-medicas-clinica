-- H3, tarea 4.3 (agenda-y-reserva): reprogramar_cita(). Spec: gestion-de-citas («Reprogramación de una cita»).
select plan(35);

-- Datos de prueba (dueño). Lunes 7/6/2032: m_a y m_b atienden 08:00-10:00 en slots de 20 minutos.
insert into public.especialidades (nombre) values ('Esp reprogramar');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-RP-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp reprogramar')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '74370001', 'Paula', 'A', '1990-01-01', 'F', 'rp-pa@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))),
         ('DNI', '74370002', 'Pablo', 'B', '1991-01-01', 'M', 'rp-pb@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b'))),
         ('DNI', '74370003', 'Sin',   'Cuenta', '1992-01-01', 'X', 'rp-pc@demo.invalid', null),
         ('DNI', '74370004', 'Otra',  'Cuenta', '1993-01-01', 'F', 'rp-pd@demo.invalid', null);
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_b')
  union all select 'pa', id from public.pacientes where numero_documento = '74370001'
  union all select 'pb', id from public.pacientes where numero_documento = '74370002'
  union all select 'pc', id from public.pacientes where numero_documento = '74370003'
  union all select 'pd', id from public.pacientes where numero_documento = '74370004'
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo');
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
  select id, 1, '08:00', '10:00', 20, '2020-01-01' from e where clave in ('m_a', 'm_b');

-- Citas originales (dueño). Todas lejanas salvo las que prueban la ventana de 1 hora.
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  -- a: la que se reprograma con éxito (confirmada, para comprobar que la nueva no hereda el estado)
  ('00000000-0000-4000-8000-000000003701', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
   '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05', 'portal', 'confirmada'),
  -- b: ocupa el horario al que se intenta mover otra cita
  ('00000000-0000-4000-8000-000000003702', (select id from e where clave = 'pb'), (select id from e where clave = 'm_b'),
   '2032-06-07 09:20:00-05', '2032-06-07 09:40:00-05', 'portal', 'reservada'),
  -- c: se reprograma hacia un horario ocupado / inválido y debe quedar vigente
  ('00000000-0000-4000-8000-000000003703', (select id from e where clave = 'pc'), (select id from e where clave = 'm_a'),
   '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'administrativo', 'reservada'),
  -- d: faltan 30 minutos y no hay bloqueo
  ('00000000-0000-4000-8000-000000003704', (select id from e where clave = 'pd'), (select id from e where clave = 'm_b'),
   now() + interval '30 minutes', now() + interval '50 minutes', 'administrativo', 'reservada'),
  -- e: ya cancelada
  ('00000000-0000-4000-8000-000000003705', (select id from e where clave = 'pd'), (select id from e where clave = 'm_a'),
   '2032-06-14 08:00:00-05', '2032-06-14 08:20:00-05', 'administrativo', 'cancelada');
create temp table r (clave text primary key, id uuid);
grant all on r to public;
select is((select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:00000000-0000-4000-8000-000000003701'), 1,
  'preparación: la cita confirmada de origen ya generó su asignación (ADR-0016)');

-- ---- Éxito ----
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into r select 'a', public.reprogramar_cita('00000000-0000-4000-8000-000000003701',
        (select id from e where clave = 'm_b'), '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05') $q$,
  'el administrativo reprograma una cita a otro médico y horario'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000003701'), 'cancelada', 'la original queda cancelada');
select is((select cancelada_por from public.citas where id = '00000000-0000-4000-8000-000000003701'), (select id from e where clave = 'perfil_admin'),
  'con el administrativo como quien la canceló');
select isnt((select cancelada_en from public.citas where id = '00000000-0000-4000-8000-000000003701'), null, 'y con la fecha de cancelación');
select is((select estado::text from public.citas where id = (select id from r where clave = 'a')), 'reservada',
  'la nueva nace reservada aunque la original estaba confirmada');
select is((select reprogramada_de from public.citas where id = (select id from r where clave = 'a')),
  '00000000-0000-4000-8000-000000003701'::uuid, 'la nueva apunta a la original en reprogramada_de');
select is(
  (select medico_id::text || '/' || paciente_id::text || '/' || origen from public.citas where id = (select id from r where clave = 'a')),
  (select (select id from e where clave = 'm_b')::text || '/' || (select id from e where clave = 'pa')::text || '/administrativo'),
  'conserva al paciente, cambia de médico y el origen es administrativo'
);
select is((select creada_por from public.citas where id = (select id from r where clave = 'a')), (select id from e where clave = 'perfil_admin'),
  'creada_por es el administrativo');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from r where clave = 'a')),
  0, 'la nueva NO crea asignación: el médico nuevo no obtiene acceso a la historia por reprogramar'
);

-- ---- Nuevo horario ocupado o inválido: la original queda vigente ----
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select public.reprogramar_cita('00000000-0000-4000-8000-000000003703', (select id from e where clave = 'm_b'),
        '2032-06-07 09:20:00-05', '2032-06-07 09:40:00-05') $q$,
  '23P01', null, 'mover a un horario ocupado falla con 23P01'
);
select throws_ok(
  $q$ select public.reprogramar_cita('00000000-0000-4000-8000-000000003703', (select id from e where clave = 'm_b'),
        '2032-06-07 08:50:00-05', '2032-06-07 09:10:00-05') $q$,
  'UC001', null, 'mover a un horario fuera de la malla falla con UC001'
);
select throws_ok(
  $q$ select public.reprogramar_cita('00000000-0000-4000-8000-000000003703', (select id from e where clave = 'm_b'),
        '2021-06-07 08:00:00-05', '2021-06-07 08:20:00-05') $q$,
  'UC001', null, 'mover a un horario pasado falla con UC001'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000003703'), 'reservada',
  'tras esos tres fallos la original sigue vigente');
select is((select count(*)::int from public.citas where reprogramada_de = '00000000-0000-4000-8000-000000003703'), 0,
  'y no se creó ninguna cita nueva');

-- ---- Ventana de 1 hora ----
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select public.reprogramar_cita('00000000-0000-4000-8000-000000003704', (select id from e where clave = 'm_a'),
        '2032-06-07 08:40:00-05', '2032-06-07 09:00:00-05') $q$,
  'P0001', null, 'reprogramar una cita que empieza en 30 minutos falla con P0001 (ventana de 1 hora, ADR-0012)'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000003704'), 'reservada', 'la original sigue vigente');
select is((select count(*)::int from public.citas where reprogramada_de = '00000000-0000-4000-8000-000000003704'), 0, 'sin cita nueva');

-- Con un bloqueo del médico que cubre la cita, la ventana no aplica (reasignación por baja, ADR-0011).
insert into public.bloqueos_agenda (medico_id, rango, motivo)
  values ((select id from e where clave = 'm_b'), tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 'Baja de prueba');
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into r select 'd', public.reprogramar_cita('00000000-0000-4000-8000-000000003704', (select id from e where clave = 'm_a'),
        '2032-06-07 08:40:00-05', '2032-06-07 09:00:00-05') $q$,
  'una cita cubierta por un bloqueo de su médico sí se reprograma dentro de la hora previa'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000003704'), 'cancelada', 'la original quedó cancelada');
select is((select reprogramada_de from public.citas where id = (select id from r where clave = 'd')),
  '00000000-0000-4000-8000-000000003704'::uuid, 'y la nueva la referencia');

-- ---- Cita inexistente o no vigente: UC002 ----
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select public.reprogramar_cita('00000000-0000-4000-8000-000000003705', (select id from e where clave = 'm_a'),
        '2032-06-14 09:00:00-05', '2032-06-14 09:20:00-05') $q$,
  'UC002', null, 'reprogramar una cita ya cancelada falla con UC002'
);
select throws_ok(
  $q$ select public.reprogramar_cita('00000000-0000-4000-8000-0000000037ff', (select id from e where clave = 'm_a'),
        '2032-06-14 09:00:00-05', '2032-06-14 09:20:00-05') $q$,
  'UC002', null, 'reprogramar una cita inexistente falla con UC002'
);

-- ---- Cancelar antes de insertar ----
-- Mismo paciente, mismo horario, otro médico: con insert-primero chocaría con la original en citas_sin_cruce_paciente.
select lives_ok(
  $q$ insert into r select 'mismo_horario', public.reprogramar_cita('00000000-0000-4000-8000-000000003703', (select id from e where clave = 'm_b'),
        '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05') $q$,
  'cambiar de médico conservando el mismo horario funciona (se cancela antes de insertar)'
);
-- Mismo paciente y mismo médico, horario contiguo.
select lives_ok(
  $q$ insert into r select 'contiguo', public.reprogramar_cita((select id from r where clave = 'mismo_horario'), (select id from e where clave = 'm_b'),
        '2032-06-07 08:40:00-05', '2032-06-07 09:00:00-05') $q$,
  'mover a un horario contiguo (09:00 pasa a 08:40-09:00) del mismo paciente y médico funciona'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = (select id from r where clave = 'mismo_horario')), 'cancelada',
  'la cita intermedia quedó cancelada');
select is((select estado::text from public.citas where id = (select id from r where clave = 'contiguo')), 'reservada',
  'y la última quedó reservada');

-- ---- Negativos por rol ----
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ select public.reprogramar_cita((select id from r where clave = 'contiguo'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:20:00-05', '2032-06-07 09:40:00-05') $q$,
  '42501', null, 'un paciente NO reprograma (42501)'
);
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ select public.reprogramar_cita((select id from r where clave = 'contiguo'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:20:00-05', '2032-06-07 09:40:00-05') $q$,
  '42501', null, 'un médico NO reprograma (42501)'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ select public.reprogramar_cita((select id from r where clave = 'contiguo'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:20:00-05', '2032-06-07 09:40:00-05') $q$,
  '42501', null, 'una enfermera NO reprograma (42501)'
);
select tests.autenticar_como('sin_rol');
select throws_ok(
  $q$ select public.reprogramar_cita((select id from r where clave = 'contiguo'), (select id from e where clave = 'm_a'),
        '2032-06-07 09:20:00-05', '2032-06-07 09:40:00-05') $q$,
  '42501', null, 'una sesión sin rol NO reprograma (42501)'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = (select id from r where clave = 'contiguo')), 'reservada',
  'tras los intentos sin permiso la cita sigue como estaba');
select is((select count(*)::int from public.citas where reprogramada_de = (select id from r where clave = 'contiguo')), 0,
  'y no se creó ninguna cita nueva');

-- ---- Forma de la función ----
select ok(
  (select not p.prosecdef and p.proconfig = array['search_path=""']
     from pg_proc p where p.oid = 'public.reprogramar_cita(uuid,uuid,timestamptz,timestamptz,text)'::regprocedure),
  'reprogramar_cita es SECURITY INVOKER con search_path vacío'
);
select ok(
  has_function_privilege('authenticated', 'public.reprogramar_cita(uuid,uuid,timestamptz,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.reprogramar_cita(uuid,uuid,timestamptz,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.reprogramar_cita(uuid,uuid,timestamptz,timestamptz,text)', 'EXECUTE'),
  'solo authenticated ejecuta reprogramar_cita'
);

select * from finish();
