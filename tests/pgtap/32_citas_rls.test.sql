-- Agenda y citas (H2, tarea 5.4): privilegios y políticas de citas.
-- Spec: aislamiento-por-rol-rls («Citas visibles según el rol») e integridad-de-agenda (cancelación por el
-- administrativo).
select plan(25);

-- Datos de prueba (dueño). Los conteos se limitan a las citas de prueba (por id): la base puede tener otras.
insert into public.especialidades (nombre) values ('Esp citas rls');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  ('user_test_citas_mb', 'medico', 'Marta', 'B'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-R-' || right(clerk_user_id, 2), (select id from public.especialidades where nombre = 'Esp citas rls')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), 'user_test_citas_mb');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '75000001', 'Paula', 'A', '1990-01-01', 'F', 'pa@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))),
         ('DNI', '75000002', 'Pablo', 'B', '1991-01-01', 'M', 'pb@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b'))),
         ('DNI', '75000003', 'Sin',   'Cuenta', '1992-01-01', 'X', 'pc@demo.invalid', null);

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_citas_mb'
  union all select 'pa', id from public.pacientes where numero_documento = '75000001'
  union all select 'pb', id from public.pacientes where numero_documento = '75000002'
  union all select 'pc', id from public.pacientes where numero_documento = '75000003'
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo');

-- Malla de los dos médicos: todos los días de 08:00 a 11:00 en huecos de 20 minutos. Desde H3 (6.4) citas_validar_horario rechaza
-- (UC001) los INSERT de un usuario de la aplicación que no caen en un hueco de la agenda; las pruebas de política de abajo
-- tienen que llegar a la política con horas que sí lo sean. Las citas que inserta el dueño no pasan por ese disparador.
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde, vigente_hasta)
  select m.id, d, '08:00', '11:00', 20, '2020-01-01', null
  from public.medicos m, generate_series(0, 6) d
  where m.id in (select id from e where clave in ('m_a', 'm_b'));

insert into public.citas (paciente_id, medico_id, inicio, fin, origen) values
  ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), '2032-03-01 09:00:00-05', '2032-03-01 09:20:00-05', 'portal'),
  ((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), '2032-03-01 10:00:00-05', '2032-03-01 10:20:00-05', 'portal'),
  ((select id from e where clave = 'pa'), (select id from e where clave = 'm_b'), '2032-03-02 09:00:00-05', '2032-03-02 09:20:00-05', 'portal');
-- Una cita próxima (dentro de la hora) para comprobar la ventana con el administrativo.
insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
  values ((select id from e where clave = 'pc'), (select id from e where clave = 'm_b'), now() + interval '30 minutes', now() + interval '50 minutes', 'administrativo');

-- ---- Lectura por rol ----
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.citas where paciente_id in (select id from e)), 2, 'el paciente ve sus dos citas');
select is_empty(
  $q$ select 1 from public.citas where paciente_id in (select id from e where clave in ('pb', 'pc')) $q$,
  'el paciente NO ve las citas de otros pacientes'
);
select tests.autenticar_como('paciente_b');
select is((select count(*)::int from public.citas where paciente_id in (select id from e)), 1, 'otro paciente ve solo su cita');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.citas where medico_id in (select id from e)), 2, 'el médico ve las dos citas de su agenda');
select is_empty(
  $q$ select 1 from public.citas where medico_id = (select id from e where clave = 'm_b') $q$,
  'el médico NO ve las citas de otro médico'
);
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.citas where medico_id in (select id from e)), 0, 'la enfermera NO ve citas');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.citas where medico_id in (select id from e)), 0, 'una sesión sin rol NO ve citas');

-- ---- El paciente reserva solo a su nombre, por el portal y hacia el futuro ----
select tests.autenticar_como('paciente_a');
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
              '2032-03-03 09:00:00-05', '2032-03-03 09:20:00-05', 'portal') $q$,
  'el paciente reserva su propia cita por el portal'
);
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
              '2032-03-04 09:00:00-05', '2032-03-04 09:20:00-05', 'portal') $q$,
  '42501', null, 'el paciente NO reserva a nombre de otro paciente'
);
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
              '2032-03-05 09:00:00-05', '2032-03-05 09:20:00-05', 'administrativo') $q$,
  '42501', null, 'el paciente NO crea citas con origen administrativo'
);
-- El «pasado» lo rechazan dos barreras: citas_validar_horario (UC001, corre antes) y la política (42501, `inicio > now()`).
-- Para probar la política por separado, el dueño apaga el disparador solo en estas dos sentencias; en 62 se prueba el disparador.
select tests.volver_a_dueno();
alter table public.citas disable trigger citas_validar_horario;
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
              now() - interval '2 hours', now() - interval '100 minutes', 'portal') $q$,
  '42501', null, 'el paciente NO reserva en el pasado'
);
select tests.volver_a_dueno();
alter table public.citas enable trigger citas_validar_horario;
select tests.autenticar_como('paciente_a');
-- Mismo hueco que su otra cita (03-01 09:00, con m_a) pero con otro médico: lo para el motor, no la política ni el disparador.
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_b'),
              '2032-03-01 09:00:00-05', '2032-03-01 09:20:00-05', 'portal') $q$,
  '23P01', null, 'la doble reserva sigue bloqueada por el motor aunque la política permita insertar'
);
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where paciente_id = (select id from e where clave = 'pa') and inicio = '2032-03-02 09:00:00-05' $q$,
  'el paciente puede intentar cancelar (aún sin política de actualización: RLS lo deja en cero filas)'
);
select tests.volver_a_dueno();
select is(
  (select estado::text from public.citas where inicio = '2032-03-02 09:00:00-05'), 'reservada',
  'la cita no se canceló: la cancelación del paciente llega con el portal (H4)'
);

-- ---- Médico y enfermera no crean citas ----
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
              '2032-04-01 09:00:00-05', '2032-04-01 09:20:00-05', 'administrativo') $q$,
  '42501', null, 'el médico NO crea citas'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'),
              '2032-04-02 09:00:00-05', '2032-04-02 09:20:00-05', 'administrativo') $q$,
  '42501', null, 'la enfermera NO crea citas'
);

-- ---- Administrativo: gestiona todas; la ventana de 1 h también lo alcanza; nadie borra ----
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.citas where paciente_id in (select id from e)), 5, 'el administrativo ve todas las citas de prueba');
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pb'), (select id from e where clave = 'm_b'),
              '2032-05-01 09:00:00-05', '2032-05-01 09:20:00-05', 'administrativo') $q$,
  'el administrativo agenda una cita para cualquier paciente'
);
select lives_ok(
  $q$ update public.citas set estado = 'confirmada' where paciente_id = (select id from e where clave = 'pb') and inicio = '2032-05-01 09:00:00-05' $q$,
  'el administrativo confirma una cita'
);
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where paciente_id = (select id from e where clave = 'pb') and inicio = '2032-05-01 09:00:00-05' $q$,
  'el administrativo cancela una cita con más de 1 hora de anticipación'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada' where paciente_id = (select id from e where clave = 'pc') $q$,
  'P0001', 'No es posible cancelar con menos de 1 hora de anticipación',
  'la ventana de 1 hora alcanza también al administrativo'
);
select throws_ok(
  $q$ delete from public.citas where paciente_id = (select id from e where clave = 'pa') $q$,
  '42501', null, 'ni el administrativo borra citas (se cancelan)'
);
select tests.volver_a_dueno();
select is(
  (select cancelada_por from public.citas where paciente_id = (select id from e where clave = 'pb') and inicio = '2032-05-01 09:00:00-05'),
  (select id from e where clave = 'perfil_admin'),
  'cancelada_por registra el perfil del administrativo que canceló'
);

select ok(not has_table_privilege('anonymous', 'public.citas', 'SELECT'), 'el rol anonymous no tiene acceso a citas');

select ok(
  not has_table_privilege('sync_identidad', 'public.citas', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.disponibilidades', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.bloqueos_agenda', 'SELECT'),
  'sync_identidad no tiene privilegios sobre la agenda'
);

select * from finish();
