-- Agenda y citas (H2, tarea 5.5): políticas de disponibilidades y bloqueos_agenda.
-- Spec: aislamiento-por-rol-rls («Catálogos y personal legibles...») e integridad-de-agenda (bloqueos).
select plan(23);

-- Datos de prueba (dueño). Se filtra por los ids de prueba: la base puede tener otros datos.
insert into public.especialidades (nombre) values ('Esp disp rls');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  ('user_test_db_m2', 'medico', 'Marta', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-D-' || right(clerk_user_id, 2), (select id from public.especialidades where nombre = 'Esp disp rls')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), 'user_test_db_m2');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_db_m2';
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin) values
  ((select id from e where clave = 'm_a'), 1, '08:00', '12:00'),
  ((select id from e where clave = 'm_b'), 2, '14:00', '18:00');
insert into public.bloqueos_agenda (medico_id, rango, motivo) values
  ((select id from e where clave = 'm_a'), tstzrange('2032-06-01 00:00:00-05', '2032-06-10 00:00:00-05'), 'vacaciones A'),
  ((select id from e where clave = 'm_b'), tstzrange('2032-06-01 00:00:00-05', '2032-06-10 00:00:00-05'), 'vacaciones B');

-- ---- disponibilidades: lectura para todo rol válido ----
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.disponibilidades where medico_id in (select id from e)), 2, 'el paciente lee las disponibilidades');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.disponibilidades where medico_id in (select id from e)), 2, 'el médico lee las disponibilidades');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.disponibilidades where medico_id in (select id from e)), 2, 'la enfermera lee las disponibilidades');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.disponibilidades where medico_id in (select id from e)), 0, 'una sesión sin rol NO lee disponibilidades');

-- ---- disponibilidades: escritura solo del administrativo ----
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 3, '08:00', '09:00') $q$,
  '42501', null, 'el paciente NO crea disponibilidades'
);
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 3, '08:00', '09:00') $q$,
  '42501', null, 'ni el propio médico crea disponibilidades (las gestiona el administrativo)'
);
select lives_ok(
  $q$ update public.disponibilidades set hora_fin = '23:00' where medico_id = (select id from e where clave = 'm_a') $q$,
  'el médico puede intentar editar su disponibilidad (RLS lo deja en cero filas)'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 3, '08:00', '09:00') $q$,
  '42501', null, 'la enfermera NO crea disponibilidades'
);
select tests.volver_a_dueno();
select is(
  (select hora_fin::text from public.disponibilidades where medico_id = (select id from e where clave = 'm_a')), '12:00:00',
  'la disponibilidad no cambió'
);
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 3, '08:00', '09:00') $q$,
  'el administrativo crea una disponibilidad'
);
select lives_ok(
  $q$ update public.disponibilidades set hora_fin = '10:00' where medico_id = (select id from e where clave = 'm_a') and dia_semana = 3 $q$,
  'el administrativo la corrige'
);
select lives_ok(
  $q$ delete from public.disponibilidades where medico_id = (select id from e where clave = 'm_a') and dia_semana = 3 $q$,
  'el administrativo la elimina'
);

-- ---- bloqueos_agenda: visibles al administrativo y al médico dueño ----
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.bloqueos_agenda where medico_id in (select id from e)), 0, 'el paciente NO ve bloqueos de agenda');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.bloqueos_agenda where medico_id in (select id from e)), 0, 'la enfermera NO ve bloqueos de agenda');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.bloqueos_agenda where medico_id in (select id from e)), 0, 'una sesión sin rol NO ve bloqueos');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.bloqueos_agenda where medico_id in (select id from e)), 1, 'el médico ve solo su bloqueo');
select is_empty(
  $q$ select 1 from public.bloqueos_agenda where medico_id = (select id from e where clave = 'm_b') $q$,
  'el médico NO ve el bloqueo de otro médico'
);
select throws_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm_a'), tstzrange('2032-07-01 00:00:00-05', '2032-07-05 00:00:00-05'), 'propio') $q$,
  '42501', null, 'el médico NO crea bloqueos (los registra el administrativo)'
);
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.bloqueos_agenda where medico_id in (select id from e)), 2, 'el administrativo ve todos los bloqueos');
select lives_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm_a'), tstzrange('2032-07-01 00:00:00-05', '2032-07-05 00:00:00-05'), 'licencia') $q$,
  'el administrativo registra un bloqueo'
);
select throws_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm_a'), tstzrange('2032-07-03 00:00:00-05', '2032-07-08 00:00:00-05'), 'solapado') $q$,
  '23P01', null, 'la restricción impide bloqueos solapados del mismo médico aunque la política lo permita'
);
select lives_ok(
  $q$ delete from public.bloqueos_agenda where medico_id = (select id from e where clave = 'm_a') and motivo = 'licencia' $q$,
  'el administrativo elimina un bloqueo'
);

select ok(
  not has_table_privilege('anonymous', 'public.disponibilidades', 'SELECT')
  and not has_table_privilege('anonymous', 'public.bloqueos_agenda', 'SELECT'),
  'el rol anonymous no tiene acceso a disponibilidades ni bloqueos'
);

select * from finish();
