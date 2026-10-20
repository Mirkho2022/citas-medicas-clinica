-- H3, tarea 5.2 (agenda-y-reserva): propuestas_reasignacion() y reasignar_cita_por_baja().
-- Spec: reasignacion-por-baja-medica (propuestas, atomicidad, excepción de la ventana, sin acceso a historias, roles).
select plan(46);

-- Datos de prueba (dueño). Lunes 7/6/2032: solo el sustituto s1 (misma especialidad que orig) tiene la agenda libre en slots de 20 minutos.
insert into public.especialidades (nombre) values ('Esp baja A'), ('Esp baja B');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Oscar', 'Original'),
  (tests.sub('medico_b'), 'medico', 'Sara', 'Sustituta'),
  ('user_test_baj_o', 'medico', 'Otto', 'Otra'),
  ('user_test_baj_i', 'medico', 'Ines', 'Inactiva'),
  ('user_test_baj_b', 'medico', 'Beto', 'Bloqueado'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id, activo)
  select p.id, 'CMP-BJ-' || right(p.clerk_user_id, 3),
         (select id from public.especialidades where nombre = case when p.clerk_user_id = 'user_test_baj_o' then 'Esp baja B' else 'Esp baja A' end),
         p.clerk_user_id <> 'user_test_baj_i'
  from public.perfiles p
  where p.clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'), 'user_test_baj_o', 'user_test_baj_i', 'user_test_baj_b');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '74380001', 'Paula', 'A', '1990-01-01', 'F', 'bj-pa@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))),
         ('DNI', '74380002', 'Pablo', 'B', '1991-01-01', 'M', 'bj-pb@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b'))),
         ('DNI', '74380003', 'Pilar', 'C', '1992-01-01', 'F', 'bj-pc@demo.invalid', null),
         ('DNI', '74380004', 'Pedro', 'D', '1993-01-01', 'M', 'bj-pd@demo.invalid', null);
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'orig', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 's1', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_b')
  union all select 's_otra', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_baj_o'
  union all select 's_inact', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_baj_i'
  union all select 's_bloq', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_baj_b'
  union all select 'pa', id from public.pacientes where numero_documento = '74380001'
  union all select 'pb', id from public.pacientes where numero_documento = '74380002'
  union all select 'pc', id from public.pacientes where numero_documento = '74380003'
  union all select 'pd', id from public.pacientes where numero_documento = '74380004'
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo');
-- Todos los sustitutos (también los que deben quedar excluidos) atienden los lunes 08:00-12:00.
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
  select id, 1, '08:00', '12:00', 20, '2020-01-01' from e where clave in ('s1', 's_otra', 's_inact', 's_bloq');

-- Bloqueos: la baja de orig (lunes y martes), uno corto que no alcanza a c1, uno que cubre la cita de dentro de la hora previa,
-- y uno de otro médico (que lo deja sin agenda esos dos lunes).
insert into public.bloqueos_agenda (id, medico_id, rango, motivo) values
  ('00000000-0000-4000-8000-000000003811', (select id from e where clave = 'orig'), tstzrange('2032-06-07 00:00:00-05', '2032-06-09 00:00:00-05'), 'Baja de prueba'),
  ('00000000-0000-4000-8000-000000003812', (select id from e where clave = 'orig'), tstzrange('2032-07-01 00:00:00-05', '2032-07-01 08:00:00-05'), 'Bloqueo corto'),
  ('00000000-0000-4000-8000-000000003813', (select id from e where clave = 'orig'), tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 'Baja inmediata'),
  ('00000000-0000-4000-8000-000000003814', (select id from e where clave = 's_bloq'), tstzrange('2032-06-07 00:00:00-05', '2032-06-15 00:00:00-05'), 'Bloqueo del sustituto');

-- Citas (dueño). c1 y c2 son del lunes; c3 del martes (sin agenda de sustitutos ese día); c_prox empieza en 30 minutos.
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  ('00000000-0000-4000-8000-000000003801', (select id from e where clave = 'pa'), (select id from e where clave = 'orig'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000003802', (select id from e where clave = 'pb'), (select id from e where clave = 'orig'), '2032-06-07 10:00:00-05', '2032-06-07 10:20:00-05', 'portal', 'confirmada'),
  ('00000000-0000-4000-8000-000000003803', (select id from e where clave = 'pd'), (select id from e where clave = 'orig'), '2032-06-08 09:00:00-05', '2032-06-08 09:20:00-05', 'administrativo', 'reservada'),
  ('00000000-0000-4000-8000-000000003804', (select id from e where clave = 'pc'), (select id from e where clave = 'orig'), now() + interval '30 minutes', now() + interval '50 minutes', 'administrativo', 'reservada'),
  -- otra cita de la paciente A con un médico de otra especialidad a las 08:40: ese horario no debe proponérsele
  ('00000000-0000-4000-8000-000000003805', (select id from e where clave = 'pa'), (select id from e where clave = 's_otra'), '2032-06-07 08:40:00-05', '2032-06-07 09:00:00-05', 'administrativo', 'reservada');

-- Historia de pb en manos de orig (que lo tiene a cargo por la cita confirmada c2).
insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
  values ((select id from e where clave = 'pb'), 'alergico', 'BJ alergia de prueba', (select id from e where clave = 'orig'));
insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'pb')),
          (select id from e where clave = 'pb'), (select id from e where clave = 'orig'),
          'BJ motivo', 'a', 'b', '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'c');
create temp table asig_antes as
  select id, paciente_id, medico_id, vigente_desde, vigente_hasta, motivo from public.asignaciones_paciente_medico
  where paciente_id in (select id from e where clave in ('pa', 'pb', 'pc', 'pd'));
create temp table citas_antes as
  select id, estado, medico_id, inicio, fin from public.citas where paciente_id in (select id from e where clave in ('pa', 'pb', 'pc', 'pd'));
grant select on asig_antes to public;
grant select on citas_antes to public;
create temp table r (clave text primary key, id uuid);
grant all on r to public;

-- Horas de Lima de las propuestas de una cita, en el orden en que la función las devuelve.
create function pg_temp.horas(p_cita uuid, p_bloqueo uuid, p_dias int default 7, p_max int default 3) returns text[] language sql as $$
  select coalesce(array_agg(to_char(p.inicio at time zone 'America/Lima', 'HH24:MI') order by p.ord), '{}')
  from public.propuestas_reasignacion(p_bloqueo, p_dias, p_max) with ordinality as p(cita_id, medico_id, inicio, fin, mismo_horario, ord)
  where p.cita_id = p_cita
$$;
grant execute on function pg_temp.horas(uuid, uuid, int, int) to public;

-- ---- Propuestas ----
select tests.autenticar_como('administrativo');
select is(pg_temp.horas('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811'), array['09:00', '09:20', '08:20'],
  'para c1: el mismo horario primero, luego el más cercano (08:40 se salta: la paciente ya tiene otra cita)');
select ok(
  (select p.mismo_horario from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') p
    where p.cita_id = '00000000-0000-4000-8000-000000003801' and to_char(p.inicio at time zone 'America/Lima', 'HH24:MI') = '09:00'),
  'y el primero está marcado como mismo_horario'
);
select ok(
  not (select bool_or(p.mismo_horario) from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') p
        where p.cita_id = '00000000-0000-4000-8000-000000003801' and to_char(p.inicio at time zone 'America/Lima', 'HH24:MI') <> '09:00'),
  'los demás no lo están'
);
select is(pg_temp.horas('00000000-0000-4000-8000-000000003802', '00000000-0000-4000-8000-000000003811'), array['10:00', '09:40', '10:20'],
  'para c2 (confirmada): 10:00, luego 09:40 y 10:20 (a igual distancia, el más temprano)');
select is(
  (select count(*)::int from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811', 7, 10) p
    where p.cita_id = '00000000-0000-4000-8000-000000003801'),
  10, 'máx limita la cantidad por cita (10 pedidas, 10 devueltas)'
);
select is(
  (select count(*)::int from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811', 7, 10) p
    where p.cita_id = '00000000-0000-4000-8000-000000003801' and to_char(p.inicio at time zone 'America/Lima', 'HH24:MI') = '08:40'
      and (p.inicio at time zone 'America/Lima')::date = '2032-06-07'),
  0, 'el 08:40 del lunes nunca se propone a la paciente A (choca con su otra cita)'
);
select is(
  (select count(*)::int from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811', 7, 10) p
    where p.medico_id is distinct from (select id from e where clave = 's1')),
  0, 'solo se proponen horarios del sustituto de la misma especialidad: ni otra especialidad, ni inactivo, ni bloqueado, ni el original'
);
select is(
  (select array_agg(to_char(p.inicio at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') order by p.ord)
     from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') with ordinality as p(cita_id, medico_id, inicio, fin, mismo_horario, ord)
    where p.cita_id = '00000000-0000-4000-8000-000000003803'),
  array['2032-06-14 09:00', '2032-06-14 08:40', '2032-06-14 09:20'],
  'una cita del martes sin agenda de sustitutos se propone el lunes siguiente (a 6 días), a la misma hora primero'
);
select is(pg_temp.horas('00000000-0000-4000-8000-000000003803', '00000000-0000-4000-8000-000000003811', 0, 3), '{}'::text[],
  'con días = 0 esa cita no tiene propuestas (queda para contacto manual)');

-- Sin el mismo horario: el más cercano ese mismo día.
select tests.volver_a_dueno();
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen) values
  ('00000000-0000-4000-8000-000000003806', (select id from e where clave = 'pd'), (select id from e where clave = 's1'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'administrativo');
select tests.autenticar_como('administrativo');
select is(pg_temp.horas('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811'), array['09:20', '08:20', '09:40'],
  'si el sustituto ocupó el mismo horario, se propone el más cercano ese día antes que cualquier otro día');
select ok(
  not (select p.mismo_horario from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') p
        where p.cita_id = '00000000-0000-4000-8000-000000003801' order by p.inicio limit 1),
  'y ninguna está marcada como mismo_horario'
);

-- Proponer no cambia nada.
select tests.volver_a_dueno();
select is_empty(
  $q$ select id, estado, medico_id, inicio, fin from public.citas where paciente_id in (select id from e where clave in ('pa', 'pb', 'pc', 'pd')) and id <> '00000000-0000-4000-8000-000000003806'
      except select id, estado, medico_id, inicio, fin from citas_antes $q$,
  'proponer no cambió ninguna cita (estado, médico ni horario)'
);
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where paciente_id in (select id from e where clave in ('pa', 'pb', 'pc', 'pd'))),
  (select count(*)::int from asig_antes), 'ni creó asignaciones'
);

-- ---- Reasignar ----
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into r select 'prox', public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003804', '00000000-0000-4000-8000-000000003813',
        (select id from e where clave = 's1'), '2032-06-07 11:00:00-05', '2032-06-07 11:20:00-05') $q$,
  'se reasigna una cita que empieza dentro de 30 minutos, cubierta por el bloqueo de la baja'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000003804'), 'cancelada', 'la original quedó cancelada');
select is((select cancelada_por from public.citas where id = '00000000-0000-4000-8000-000000003804'), (select id from e where clave = 'perfil_admin'),
  'con el administrativo que la reasignó');
select ok(
  (select c.estado = 'reservada' and c.reprogramada_de = '00000000-0000-4000-8000-000000003804' and c.medico_id = (select id from e where clave = 's1')
     from public.citas c where c.id = (select id from r where clave = 'prox')),
  'la nueva está reservada, con el sustituto, y apunta a la original'
);

select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into r select 'confirmada', public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003802', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's1'), '2032-06-07 10:00:00-05', '2032-06-07 10:20:00-05') $q$,
  'se reasigna una cita confirmada al mismo horario del sustituto'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = (select id from r where clave = 'confirmada')), 'reservada',
  'la cita nueva nace reservada aunque la original estaba confirmada');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where paciente_id in (select id from e where clave in ('pa', 'pb', 'pc', 'pd'))),
  (select count(*)::int from asig_antes), 'no se creó ninguna asignación paciente-médico');
select is_empty(
  $q$ select id, paciente_id, medico_id, vigente_desde, vigente_hasta, motivo from public.asignaciones_paciente_medico
      where paciente_id in (select id from e where clave in ('pa', 'pb', 'pc', 'pd'))
      except select id, paciente_id, medico_id, vigente_desde, vigente_hasta, motivo from asig_antes $q$,
  'ni se modificó o revocó ninguna existente'
);
-- El sustituto no ve la historia de pb; el médico original, que la tiene a cargo desde la confirmación, sigue viéndola.
select tests.autenticar_como('medico_b');
select is((select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'pb')), 0,
  'el sustituto NO ve las atenciones del paciente reasignado');
select is((select count(*)::int from public.antecedentes where paciente_id = (select id from e where clave = 'pb')), 0,
  'ni sus antecedentes');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'pb')), 1,
  'el médico original, que sí lo tiene a cargo, sigue viéndolas (la reasignación no revoca su acceso)');

-- ---- Reasignación inválida: UC003, la cita sigue vigente ----
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003814',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  'UC003', null, 'el bloqueo de otro médico no sirve como baja (UC003)'
);
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003812',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  'UC003', null, 'un bloqueo del mismo médico que no cubre la cita tampoco (UC003)'
);
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-0000000038ff',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  'UC003', null, 'un bloqueo inexistente tampoco (UC003)'
);
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's_otra'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  'UC003', null, 'un sustituto de otra especialidad es rechazado (UC003)'
);
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's_inact'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  'UC003', null, 'un sustituto dado de baja es rechazado (UC003)'
);
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 'orig'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  'UC003', null, 'reasignar al mismo médico es rechazado (UC003)'
);
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-0000000038aa', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  'UC002', null, 'una cita inexistente es UC002'
);
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's1'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05') $q$,
  '23P01', null, 'si el horario del sustituto ya está ocupado, falla con 23P01 (doble reserva)'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000003801'), 'reservada',
  'tras todos esos rechazos la cita c1 sigue vigente');
select is((select count(*)::int from public.citas where reprogramada_de = '00000000-0000-4000-8000-000000003801'), 0, 'y no se creó ninguna cita nueva');

-- ---- Negativos por rol ----
select tests.autenticar_como('paciente_a');
select throws_ok($q$ select * from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') $q$, '42501', null, 'un paciente NO consulta propuestas');
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  '42501', null, 'un paciente NO reasigna');
select tests.autenticar_como('medico_a');
select throws_ok($q$ select * from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') $q$, '42501', null, 'un médico NO consulta propuestas');
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  '42501', null, 'un médico NO reasigna');
select tests.autenticar_como('enfermera');
select throws_ok($q$ select * from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') $q$, '42501', null, 'una enfermera NO consulta propuestas');
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  '42501', null, 'una enfermera NO reasigna');
select tests.autenticar_como('sin_rol');
select throws_ok($q$ select * from public.propuestas_reasignacion('00000000-0000-4000-8000-000000003811') $q$, '42501', null, 'una sesión sin rol NO consulta propuestas');
select throws_ok(
  $q$ select public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000003811',
        (select id from e where clave = 's1'), '2032-06-07 11:20:00-05', '2032-06-07 11:40:00-05') $q$,
  '42501', null, 'una sesión sin rol NO reasigna');
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000003801'), 'reservada', 'ninguna cita cambió por los intentos sin permiso');
select is((select count(*)::int from public.citas where reprogramada_de = '00000000-0000-4000-8000-000000003801'), 0, 'y no se creó ninguna cita nueva');

-- ---- Forma de las funciones y de la vista ----
select ok(
  (select bool_and(not p.prosecdef and p.proconfig = array['search_path=""'])
     from pg_proc p where p.oid in ('public.propuestas_reasignacion(uuid,integer,integer)'::regprocedure,
                                    'public.reasignar_cita_por_baja(uuid,uuid,uuid,timestamptz,timestamptz)'::regprocedure)),
  'las dos funciones son SECURITY INVOKER con search_path vacío'
);
select ok(
  has_function_privilege('authenticated', 'public.propuestas_reasignacion(uuid,integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reasignar_cita_por_baja(uuid,uuid,uuid,timestamptz,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.propuestas_reasignacion(uuid,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.reasignar_cita_por_baja(uuid,uuid,uuid,timestamptz,timestamptz)', 'EXECUTE')
  and not has_function_privilege('public', 'public.reasignar_cita_por_baja(uuid,uuid,uuid,timestamptz,timestamptz)', 'EXECUTE'),
  'solo authenticated ejecuta las dos funciones'
);

select * from finish();
