-- H7, tarea 6.2 (turnos-y-dashboard): la pantalla de la enfermera con la RLS existente y SIN ninguna política nueva.
-- Spec: turnos-de-enfermeria («La enfermera ve su turno y con quién trabaja, y nada más»). La función de abajo es la MISMA consulta que
-- arma la pantalla (lib/turnos/mis-turnos.ts, SQL_MIS_TURNOS; tests/integracion/turnos-enfermeria.test.ts la corre desde el código real).
select plan(23);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp vista enf 1'), ('Esp vista enf 2');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('enfermera'), 'enfermera', 'Elena', 'Uno'),
  ('user_test_ve_e2', 'enfermera', 'Eva', 'Dos'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'Alfa'),
  ('user_test_ve_mb', 'medico', 'Marta', 'Baja'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'Uno');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select p.id, 'CMP-VE-' || right(p.clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp vista enf 1')
  from public.perfiles p where p.clerk_user_id in (tests.sub('medico_a'), 'user_test_ve_mb');
update public.medicos set activo = false where cmp = 'CMP-VE-_mb';
insert into public.enfermeras (perfil_id)
  select id from public.perfiles where clerk_user_id in (tests.sub('enfermera'), 'user_test_ve_e2');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id) values
  ('DNI', '78300001', 'Paula', 'Uno', '1990-01-01', 'F', 've1@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')));
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'enf1', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = tests.sub('enfermera')
  union all select 'enf2', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = 'user_test_ve_e2'
  union all select 'm_a', id from public.medicos where cmp like 'CMP-VE-%' and activo
  union all select 'm_b', id from public.medicos where cmp like 'CMP-VE-%' and not activo
  union all select 'esp1', id from public.especialidades where nombre = 'Esp vista enf 1'
  union all select 'esp2', id from public.especialidades where nombre = 'Esp vista enf 2'
  union all select 'pac', id from public.pacientes where numero_documento = '78300001';

-- Turnos relativos a hoy en Lima. enf1: T01 mañana+1 con médico A; T02 tarde+2 solo servicio; T03 noche+3 con médico de baja;
-- T05 ayer (no); T06 a los 15 días (no); T07 a los 14 días (sí: el último día de la ventana); T08 hoy (sí). enf2: T04 mañana+1.
insert into public.turnos_enfermeria (id, enfermera_id, fecha, turno, medico_id, especialidad_id) values
  ('00000000-0000-4000-8000-000000008301', (select id from e where clave = 'enf1'), public.hoy_lima() + 1,  'manana', (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008302', (select id from e where clave = 'enf1'), public.hoy_lima() + 2,  'tarde',  null, (select id from e where clave = 'esp2')),
  ('00000000-0000-4000-8000-000000008303', (select id from e where clave = 'enf1'), public.hoy_lima() + 3,  'noche',  (select id from e where clave = 'm_b'), null),
  ('00000000-0000-4000-8000-000000008304', (select id from e where clave = 'enf2'), public.hoy_lima() + 1,  'manana', (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008305', (select id from e where clave = 'enf1'), public.hoy_lima() - 1,  'manana', (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008306', (select id from e where clave = 'enf1'), public.hoy_lima() + 15, 'manana', (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008307', (select id from e where clave = 'enf1'), public.hoy_lima() + 14, 'tarde',  (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008308', (select id from e where clave = 'enf1'), public.hoy_lima(),      'tarde',  (select id from e where clave = 'm_a'), null);

-- Datos que la enfermera NO debe ver: una cita, un bloqueo, una atención (con su addenda y su antecedente) y una notificación.
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo)
  values ((select id from e where clave = 'pac'), (select id from e where clave = 'm_a'), public.hoy_lima() - 30, 'manual');
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen) values
  ('00000000-0000-4000-8000-000000008321', (select id from e where clave = 'pac'), (select id from e where clave = 'm_a'), '2032-09-01 09:00:00-05', '2032-09-01 09:20:00-05', 'portal');
insert into public.bloqueos_agenda (medico_id, rango, motivo)
  values ((select id from e where clave = 'm_a'), tstzrange('2032-09-05 00:00:00-05', '2032-09-06 00:00:00-05'), 'Bloqueo privado de la vista enfermera');
insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  values ('00000000-0000-4000-8000-000000008331',
          (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'pac')),
          (select id from e where clave = 'pac'), (select id from e where clave = 'm_a'),
          'Motivo', 'Anamnesis', 'Examen', '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'Plan');
insert into public.addendas (atencion_id, medico_id, texto)
  values ('00000000-0000-4000-8000-000000008331', (select id from e where clave = 'm_a'), 'Addenda de la vista enfermera');
insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
  values ((select id from e where clave = 'pac'), 'alergico', 'Alergia de la vista enfermera', (select id from e where clave = 'm_a'));
insert into public.notificaciones (cita_id, tipo, destinatario, programada_para, estado)
  values ('00000000-0000-4000-8000-000000008321', 'recordatorio_24h', 've@demo.invalid', '2032-08-31 09:00:00-05', 'fallida');

-- La consulta que arma la pantalla de la enfermera (lib/turnos/mis-turnos.ts, SQL_MIS_TURNOS, con 14 días).
create function pg_temp.mis_turnos() returns table (
  id uuid, fecha text, turno text, medico_nombres text, medico_apellidos text, medico_activo boolean, medico_especialidad text, servicio text
) language sql as $$
  select t.id, t.fecha::text, t.turno::text, pm.nombres, pm.apellidos, m.activo, em.nombre, es.nombre
    from public.turnos_enfermeria t
    left join public.medicos m on m.id = t.medico_id
    left join public.perfiles pm on pm.id = m.perfil_id
    left join public.especialidades em on em.id = m.especialidad_id
    left join public.especialidades es on es.id = t.especialidad_id
   where t.enfermera_id = (select public.enfermera_actual())
     and t.fecha >= public.hoy_lima()
     and t.fecha <= public.hoy_lima() + 14
   order by t.fecha, t.turno
$$;
grant execute on function pg_temp.mis_turnos() to public;

-- ---- Control: los datos existen para el dueño ----
select tests.volver_a_dueno();
select cmp_ok(
  (select count(*)::int from public.citas where id = '00000000-0000-4000-8000-000000008321')
  + (select count(*)::int from public.bloqueos_agenda where motivo = 'Bloqueo privado de la vista enfermera')
  + (select count(*)::int from public.atenciones where id = '00000000-0000-4000-8000-000000008331')
  + (select count(*)::int from public.addendas where texto = 'Addenda de la vista enfermera')
  + (select count(*)::int from public.antecedentes where descripcion = 'Alergia de la vista enfermera')
  + (select count(*)::int from public.notificaciones where destinatario = 've@demo.invalid')
  + (select count(*)::int from public.pacientes where numero_documento = '78300001')
  + (select count(*)::int from public.historias_clinicas where paciente_id = (select id from e where clave = 'pac')),
  '=', 8, 'control: la cita, el bloqueo, la atención, la addenda, el antecedente, la notificación, el paciente y su historia existen'
);

-- ---- La enfermera: lo suyo, con el médico y el servicio resueltos ----
select tests.autenticar_como('enfermera');
select is(
  (select array_agg(right(id::text, 2) order by fecha, turno) from pg_temp.mis_turnos()),
  array['08', '01', '02', '03', '07'],
  've sus turnos de hoy a +14 días, ordenados, sin los de ayer, los de +15 días ni los de otra enfermera'
);
select is(
  (select medico_nombres || ' ' || medico_apellidos || ' / ' || medico_especialidad from pg_temp.mis_turnos() where id = '00000000-0000-4000-8000-000000008301'),
  'Mario Alfa / Esp vista enf 1',
  'resuelve el nombre y la especialidad de su médico sin ninguna política nueva'
);
select is(
  (select servicio || '|' || coalesce(medico_nombres, 'sin médico') from pg_temp.mis_turnos() where id = '00000000-0000-4000-8000-000000008302'),
  'Esp vista enf 2|sin médico',
  'resuelve la especialidad del servicio de un turno sin médico'
);
select is(
  (select medico_activo from pg_temp.mis_turnos() where id = '00000000-0000-4000-8000-000000008303'),
  false,
  'un turno con un médico de baja sigue mostrándose, con el médico marcado como inactivo (la nota «Fuera de servicio»)'
);
select is(
  (select fecha from pg_temp.mis_turnos() where id = '00000000-0000-4000-8000-000000008308'),
  (select public.hoy_lima()::text),
  'el turno de hoy (día de Lima) entra en la ventana'
);

-- ---- Negativas: no ve turnos ajenos ----
select is_empty(
  $q$ select 1 from public.turnos_enfermeria where enfermera_id = (select id from e where clave = 'enf2') $q$,
  'no ve los turnos de otra enfermera, ni consultando la tabla directamente'
);
select is_empty(
  $q$ select 1 from pg_temp.mis_turnos() where id = '00000000-0000-4000-8000-000000008304' $q$,
  'la consulta de su pantalla no trae el turno de la otra enfermera'
);

-- ---- Negativas: cero filas en todo lo demás ----
select is((select count(*)::int from public.citas), 0, 'cero filas en citas');
select is((select count(*)::int from public.pacientes), 0, 'cero filas en pacientes');
select is((select count(*)::int from public.historias_clinicas), 0, 'cero filas en historias_clinicas');
select is((select count(*)::int from public.atenciones), 0, 'cero filas en atenciones');
select is((select count(*)::int from public.addendas), 0, 'cero filas en addendas');
select is((select count(*)::int from public.antecedentes), 0, 'cero filas en antecedentes');
select is((select count(*)::int from public.notificaciones), 0, 'cero filas en notificaciones');
select is((select count(*)::int from public.bloqueos_agenda), 0, 'cero filas en bloqueos_agenda');
select is((select count(*)::int from public.turnos_enfermeria_con_aviso), 0, 'cero filas en turnos_enfermeria_con_aviso');
select is((select count(*)::int from public.asignaciones_paciente_medico), 0, 'cero filas en asignaciones_paciente_medico');

-- ---- Otros roles: no ven la tabla de turnos ----
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.turnos_enfermeria where id::text like '00000000-0000-4000-8000-0000000083%'), 0, 'el médico no ve turnos de enfermería');
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.turnos_enfermeria where id::text like '00000000-0000-4000-8000-0000000083%'), 0, 'el paciente no ve turnos de enfermería');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.turnos_enfermeria where id::text like '00000000-0000-4000-8000-0000000083%'), 0, 'una sesión sin rol no ve turnos de enfermería');

-- ---- Sin política nueva ----
select tests.volver_a_dueno();
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'turnos_enfermeria'),
  array['turnos_gestiona_el_administrativo', 'turnos_lee_la_enfermera_propia'],
  'turnos_enfermeria conserva solo las dos políticas de H2: este change no añadió ninguna'
);
select tests.autenticar_como('administrativo');
select cmp_ok((select count(*)::int from public.turnos_enfermeria where id::text like '00000000-0000-4000-8000-0000000083%'), '=', 8, 'control: el administrativo sí ve los 8 turnos sembrados');

select * from finish();
