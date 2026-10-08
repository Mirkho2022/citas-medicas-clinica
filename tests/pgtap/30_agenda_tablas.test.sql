-- Agenda y citas (H2, tarea 5.1): restricciones de disponibilidades, bloqueos_agenda y citas.
-- Spec: integridad-de-agenda. La concurrencia real (dos sesiones) se prueba en tests/concurrencia (5.2);
-- el trigger de cancelación en 5.3; las políticas en 5.4 y 5.5.
select plan(19);

-- Datos de prueba (dueño). Fechas en 2030 para no interferir con la cancelación tardía (5.3).
insert into public.especialidades (nombre) values ('Esp agenda prueba');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  ('user_test_ag_m1', 'medico', 'Medico', 'Uno'),
  ('user_test_ag_m2', 'medico', 'Medico', 'Dos');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select p.id, 'CMP-AG-' || right(p.clerk_user_id, 2), (select id from public.especialidades where nombre = 'Esp agenda prueba')
  from public.perfiles p where p.clerk_user_id in ('user_test_ag_m1', 'user_test_ag_m2');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '72000001', 'Paciente', 'Uno', '1990-01-01', 'F', 'p1@demo.invalid'),
  ('DNI', '72000002', 'Paciente', 'Dos', '1991-01-01', 'M', 'p2@demo.invalid');

create temp table e (clave text primary key, id uuid);
insert into e
  select 'm1', id from public.medicos where cmp = 'CMP-AG-m1'
  union all select 'm2', id from public.medicos where cmp = 'CMP-AG-m2'
  union all select 'p1', id from public.pacientes where numero_documento = '72000001'
  union all select 'p2', id from public.pacientes where numero_documento = '72000002';

-- RLS activada en las tres tablas.
select ok((select relrowsecurity from pg_class where oid = 'public.disponibilidades'::regclass), 'disponibilidades tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.bloqueos_agenda'::regclass), 'bloqueos_agenda tiene RLS activada');
select ok((select relrowsecurity from pg_class where oid = 'public.citas'::regclass), 'citas tiene RLS activada');

-- Doble reserva del médico.
insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
  values ((select id from e where clave = 'p1'), (select id from e where clave = 'm1'),
          '2030-03-04 09:00:00-05', '2030-03-04 09:20:00-05', 'portal');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p2'), (select id from e where clave = 'm1'),
              '2030-03-04 09:10:00-05', '2030-03-04 09:30:00-05', 'portal') $q$,
  '23P01', null, 'un médico no puede tener dos citas reservadas solapadas'
);
update public.citas set estado = 'confirmada' where inicio = '2030-03-04 09:00:00-05';
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p2'), (select id from e where clave = 'm1'),
              '2030-03-04 09:00:00-05', '2030-03-04 09:20:00-05', 'administrativo') $q$,
  '23P01', null, 'una cita confirmada también bloquea el horario'
);

-- Contiguas: el rango es [inicio, fin), así que terminar a la hora en que empieza otra no solapa.
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p2'), (select id from e where clave = 'm1'),
              '2030-03-04 09:20:00-05', '2030-03-04 09:40:00-05', 'portal') $q$,
  'dos citas contiguas del mismo médico no se solapan'
);

-- Cancelar libera el horario.
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where inicio = '2030-03-04 09:00:00-05' $q$,
  'se puede cancelar la cita (lejos en el futuro)'
);
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p2'), (select id from e where clave = 'm2'),
              '2030-03-04 09:00:00-05', '2030-03-04 09:20:00-05', 'portal') $q$,
  'el horario liberado por una cancelación se puede volver a reservar'
);
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado)
      values ((select id from e where clave = 'p1'), (select id from e where clave = 'm1'),
              '2030-03-04 09:20:00-05', '2030-03-04 09:40:00-05', 'administrativo', 'no_asistio') $q$,
  'una cita que no es vigente (no_asistio) no bloquea el horario'
);

-- Un paciente tampoco puede tener dos citas vigentes solapadas, ni con médicos distintos.
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p2'), (select id from e where clave = 'm2'),
              '2030-03-04 09:30:00-05', '2030-03-04 09:50:00-05', 'portal') $q$,
  '23P01', null, 'un paciente no puede tener dos citas vigentes solapadas (aunque sean con médicos distintos)'
);

-- Rangos coherentes.
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p1'), (select id from e where clave = 'm2'),
              '2030-03-05 10:00:00-05', '2030-03-05 09:00:00-05', 'portal') $q$,
  '22000', null, 'una cita no puede terminar antes de empezar (la columna generada rango ya lo rechaza)'
);
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p1'), (select id from e where clave = 'm2'),
              '2030-03-05 10:00:00-05', '2030-03-05 10:00:00-05', 'portal') $q$,
  '23514', null, 'una cita no puede durar cero'
);
select is(
  (select rango from public.citas where inicio = '2030-03-04 09:20:00-05' and estado = 'reservada'),
  tstzrange('2030-03-04 09:20:00-05', '2030-03-04 09:40:00-05', '[)'),
  'el rango de la cita se calcula como [inicio, fin)'
);

-- Disponibilidades coherentes.
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm1'), 1, '08:00', '12:00') $q$,
  'una disponibilidad válida se acepta (slot de 20 min por defecto)'
);
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm1'), 1, '12:00', '08:00') $q$,
  '23514', null, 'una disponibilidad no puede terminar antes de empezar'
);
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm1'), 7, '08:00', '12:00') $q$,
  '23514', null, 'el día de la semana debe estar entre 0 y 6'
);
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min)
      values ((select id from e where clave = 'm1'), 1, '08:00', '12:00', 0) $q$,
  '23514', null, 'la duración del slot debe ser positiva'
);

-- Bloqueos de agenda: no se solapan dentro del mismo médico.
insert into public.bloqueos_agenda (medico_id, rango, motivo)
  values ((select id from e where clave = 'm1'), tstzrange('2030-04-01 00:00:00-05', '2030-04-10 00:00:00-05'), 'vacaciones');
select throws_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm1'), tstzrange('2030-04-05 00:00:00-05', '2030-04-15 00:00:00-05'), 'licencia') $q$,
  '23P01', null, 'dos bloqueos solapados del mismo médico se rechazan'
);
select lives_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm2'), tstzrange('2030-04-05 00:00:00-05', '2030-04-15 00:00:00-05'), 'licencia') $q$,
  'el mismo rango para otro médico se acepta'
);

select * from finish();
