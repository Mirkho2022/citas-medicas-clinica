-- H3, tarea 5.3 (agenda-y-reserva): vista citas_por_reasignar (security_invoker) y su aislamiento por rol.
-- Spec: reasignacion-por-baja-medica («La baja del médico se registra como un bloqueo y muestra las citas afectadas»).
select plan(17);

-- Datos de prueba (dueño). Bajas de los dos médicos el 7 y 8/6/2032.
insert into public.especialidades (nombre) values ('Esp por reasignar');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-PR-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp por reasignar')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '74390001', 'Paula', 'A', '1990-01-01', 'F', 'pr-pa@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))),
         ('DNI', '74390002', 'Pablo', 'B', '1991-01-01', 'M', 'pr-pb@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b')));
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_b')
  union all select 'pa', id from public.pacientes where numero_documento = '74390001'
  union all select 'pb', id from public.pacientes where numero_documento = '74390002';
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
  select id, 1, '08:00', '12:00', 20, '2020-01-01' from e where clave = 'm_b';

insert into public.bloqueos_agenda (id, medico_id, rango, motivo) values
  ('00000000-0000-4000-8000-000000003911', (select id from e where clave = 'm_a'), tstzrange('2032-06-07 00:00:00-05', '2032-06-09 00:00:00-05'), 'Baja A'),
  ('00000000-0000-4000-8000-000000003912', (select id from e where clave = 'm_b'), tstzrange('2032-06-07 00:00:00-05', '2032-06-09 00:00:00-05'), 'Baja B'),
  ('00000000-0000-4000-8000-000000003913', (select id from e where clave = 'm_a'), tstzrange('2021-06-07 00:00:00-05', '2021-06-08 00:00:00-05'), 'Baja ya pasada');
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  ('00000000-0000-4000-8000-000000003921', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000003922', (select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), '2032-06-07 10:00:00-05', '2032-06-07 10:20:00-05', 'portal', 'confirmada'),
  -- no corresponden: cancelada, atendida, fuera del periodo y ya terminada
  ('00000000-0000-4000-8000-000000003923', (select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), '2032-06-07 11:00:00-05', '2032-06-07 11:20:00-05', 'portal', 'cancelada'),
  ('00000000-0000-4000-8000-000000003924', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), '2032-06-07 12:00:00-05', '2032-06-07 12:20:00-05', 'portal', 'atendida'),
  ('00000000-0000-4000-8000-000000003925', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), '2032-06-10 09:00:00-05', '2032-06-10 09:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000003926', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), '2021-06-07 09:00:00-05', '2021-06-07 09:20:00-05', 'portal', 'reservada'),
  -- del otro médico, afectada por su propia baja
  ('00000000-0000-4000-8000-000000003927', (select id from e where clave = 'pa'), (select id from e where clave = 'm_b'), '2032-06-08 09:00:00-05', '2032-06-08 09:20:00-05', 'portal', 'reservada');

create function pg_temp.ids() returns text[] language sql as $$
  select coalesce(array_agg(right(v.cita_id::text, 2) order by v.inicio), '{}')
  from public.citas_por_reasignar v where v.cita_id::text like '00000000-0000-4000-8000-0000000039%'
$$;
grant execute on function pg_temp.ids() to public;

-- ---- Administrativo: todas las afectadas vigentes y no terminadas ----
select tests.autenticar_como('administrativo');
select is(pg_temp.ids(), array['21', '22', '27'],
  'el administrativo ve las vigentes cubiertas por una baja (de ambos médicos), ordenadas por hora');
select is(
  (select count(*)::int from public.citas_por_reasignar where cita_id in (
     '00000000-0000-4000-8000-000000003923', '00000000-0000-4000-8000-000000003924',
     '00000000-0000-4000-8000-000000003925', '00000000-0000-4000-8000-000000003926')),
  0, 'no aparecen la cancelada, la atendida, la que está fuera del periodo ni la que ya terminó'
);
select is(
  (select bloqueo_id from public.citas_por_reasignar where cita_id = '00000000-0000-4000-8000-000000003927'),
  '00000000-0000-4000-8000-000000003912'::uuid, 'cada fila indica el bloqueo que la alcanza'
);

-- ---- Médicos: solo las suyas ----
select tests.autenticar_como('medico_a');
select is(pg_temp.ids(), array['21', '22'], 'medico_a ve solo las suyas');
select is_empty(
  $q$ select 1 from public.citas_por_reasignar where cita_id = '00000000-0000-4000-8000-000000003927' $q$,
  'y ninguna de otro médico'
);
select tests.autenticar_como('medico_b');
select is(pg_temp.ids(), array['27'], 'medico_b ve solo la suya');

-- ---- Paciente, enfermera y sin rol: cero filas, incluso de sus propias citas ----
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.citas where id = '00000000-0000-4000-8000-000000003921'), 1,
  'control: paciente_a sí ve su propia cita directamente');
select is(pg_temp.ids(), '{}'::text[], 'pero la vista no le devuelve ninguna fila, ni siquiera de sus propias citas afectadas');
select tests.autenticar_como('paciente_b');
select is(pg_temp.ids(), '{}'::text[], 'paciente_b tampoco ve ninguna');
select tests.autenticar_como('enfermera');
select is(pg_temp.ids(), '{}'::text[], 'la enfermera no ve ninguna');
select tests.autenticar_como('sin_rol');
select is(pg_temp.ids(), '{}'::text[], 'una sesión sin rol no ve ninguna');

-- ---- La cita sale sola de la vista ----
select tests.volver_a_dueno();
update public.bloqueos_agenda set rango = tstzrange('2032-06-07 00:00:00-05', '2032-06-07 09:30:00-05')
  where id = '00000000-0000-4000-8000-000000003911';
select tests.autenticar_como('administrativo');
select is(pg_temp.ids(), array['21', '27'], 'al acortar la baja, la cita de las 10:00 deja de estar afectada');
select tests.volver_a_dueno();
update public.citas set estado = 'cancelada' where id = '00000000-0000-4000-8000-000000003921';
select tests.autenticar_como('administrativo');
select is(pg_temp.ids(), array['27'], 'al cancelar la cita de las 09:00 sale de la vista');
select lives_ok(
  $q$ select public.reprogramar_cita('00000000-0000-4000-8000-000000003927', (select id from e where clave = 'm_b'),
        '2032-06-14 09:00:00-05', '2032-06-14 09:20:00-05') $q$,
  'el administrativo reprograma la cita del otro médico a un lunes fuera de la baja'
);
select is(pg_temp.ids(), '{}'::text[], 'y al reprogramarla ni la original ni la nueva están afectadas');

-- ---- Forma de la vista ----
select tests.volver_a_dueno();
select is((select c.reloptions from pg_class c where c.oid = 'public.citas_por_reasignar'::regclass), array['security_invoker=true'],
  'la vista es security_invoker: aplica la RLS de quien la consulta');
select ok(
  has_table_privilege('authenticated', 'public.citas_por_reasignar', 'SELECT')
  and not has_table_privilege('anonymous', 'public.citas_por_reasignar', 'SELECT')
  and not has_table_privilege('public', 'public.citas_por_reasignar', 'SELECT')
  and not has_table_privilege('authenticated', 'public.citas_por_reasignar', 'INSERT'),
  'solo authenticated la lee y nadie la escribe'
);

select * from finish();
