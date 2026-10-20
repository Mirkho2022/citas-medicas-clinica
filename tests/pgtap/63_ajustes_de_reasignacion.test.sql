-- H3, tarea 6.4 (agenda-y-reserva), hallazgos (2) y (3): citas_por_reasignar con un bloqueo sin fecha de fin, y el orden de
-- salida de propuestas_reasignacion().
-- Spec: reasignacion-por-baja-medica («La baja del médico se registra como un bloqueo y muestra las citas afectadas»; propuestas).
select plan(4);

-- Datos de prueba (dueño). m_a tiene una baja cerrada (lunes y martes 7 y 8/6/2032) con cinco citas el lunes; m_b es su sustituto
-- (misma especialidad, agenda libre los lunes de 08:00 a 12:00 en slots de 20 minutos); m_c tiene una baja ABIERTA (sin fin).
insert into public.especialidades (nombre) values ('Esp ajustes');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B'),
  ('user_test_aj_c', 'medico', 'Cesar', 'C');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-AJ-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp ajustes')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'), 'user_test_aj_c');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  select 'DNI', '7463000' || n, 'Paciente', 'Ajuste ' || n, '1990-01-01', 'F', 'aj-p' || n || '@demo.invalid'
  from generate_series(1, 6) n;
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_b')
  union all select 'm_c', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_aj_c'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7463000%';
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
  select id, 1, '08:00', '12:00', 20, '2020-01-01' from e where clave = 'm_b';

insert into public.bloqueos_agenda (id, medico_id, rango, motivo) values
  ('00000000-0000-4000-8000-000000006311', (select id from e where clave = 'm_a'), tstzrange('2032-06-07 00:00:00-05', '2032-06-09 00:00:00-05'), 'Baja cerrada'),
  ('00000000-0000-4000-8000-000000006312', (select id from e where clave = 'm_c'), tstzrange('2032-06-07 00:00:00-05', null), 'Baja sin fecha de regreso');

-- Las cinco citas de m_a se insertan de la última a la primera: el orden físico de la tabla no es el cronológico.
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  ('00000000-0000-4000-8000-000000006325', (select id from e where clave = 'p5'), (select id from e where clave = 'm_a'), '2032-06-07 11:00:00-05', '2032-06-07 11:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006324', (select id from e where clave = 'p4'), (select id from e where clave = 'm_a'), '2032-06-07 10:20:00-05', '2032-06-07 10:40:00-05', 'portal', 'confirmada'),
  ('00000000-0000-4000-8000-000000006323', (select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), '2032-06-07 09:40:00-05', '2032-06-07 10:00:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006322', (select id from e where clave = 'p2'), (select id from e where clave = 'm_a'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006321', (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'), '2032-06-07 08:20:00-05', '2032-06-07 08:40:00-05', 'portal', 'reservada'),
  -- m_c: una antes de que empiece su baja abierta (no la alcanza), una después y una muy lejana (la alcanzan)
  ('00000000-0000-4000-8000-000000006331', (select id from e where clave = 'p6'), (select id from e where clave = 'm_c'), '2032-06-04 09:00:00-05', '2032-06-04 09:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006332', (select id from e where clave = 'p6'), (select id from e where clave = 'm_c'), '2032-06-10 09:00:00-05', '2032-06-10 09:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006333', (select id from e where clave = 'p6'), (select id from e where clave = 'm_c'), '2040-01-03 09:00:00-05', '2040-01-03 09:20:00-05', 'portal', 'confirmada');

select tests.autenticar_como('administrativo');

-- ---- (2) Una baja sin fecha de fin alcanza a toda cita futura del médico ----
select is(
  (select coalesce(array_agg(right(v.cita_id::text, 2) order by v.inicio), '{}')
     from public.citas_por_reasignar v where v.medico_id = (select id from e where clave = 'm_c')),
  array['32', '33'],
  'una baja abierta (sin fin) muestra las citas vigentes futuras del médico, aunque upper() del rango sea nulo'
);
select is(
  (select count(distinct v.bloqueo_id)::int from public.citas_por_reasignar v
    where v.cita_id in ('00000000-0000-4000-8000-000000006332', '00000000-0000-4000-8000-000000006333')
      and v.bloqueo_id = '00000000-0000-4000-8000-000000006312'),
  1, 'y cada fila apunta a la baja abierta'
);
select is(
  (select count(*)::int from public.citas_por_reasignar where cita_id = '00000000-0000-4000-8000-000000006331'),
  0, 'la cita anterior al inicio de la baja abierta no se muestra'
);

-- ---- (3) La salida conserva el orden: por cita (hora) y, dentro de cada una, el mismo horario primero y luego los más cercanos ----
-- p_dias = 0 limita a ese lunes; a igual distancia gana el más temprano. `ord` es la posición en que la función devuelve cada fila.
select is(
  (select array_agg(to_char(c.inicio at time zone 'America/Lima', 'HH24:MI') || '>' || to_char(p.inicio at time zone 'America/Lima', 'HH24:MI')
                    || case when p.mismo_horario then '*' else '' end order by p.ord)
     from public.propuestas_reasignacion('00000000-0000-4000-8000-000000006311', 0, 3)
          with ordinality as p(cita_id, medico_id, inicio, fin, mismo_horario, ord)
     join public.citas c on c.id = p.cita_id),
  array[
    '08:20>08:20*', '08:20>08:00', '08:20>08:40',
    '09:00>09:00*', '09:00>08:40', '09:00>09:20',
    '09:40>09:40*', '09:40>09:20', '09:40>10:00',
    '10:20>10:20*', '10:20>10:00', '10:20>10:40',
    '11:00>11:00*', '11:00>10:40', '11:00>11:20'
  ],
  'con las citas insertadas en orden inverso, la salida va por hora de cita y, en cada una, el mismo horario (*) primero'
);

select * from finish();
