-- H7, tarea 8.1 (turnos-y-dashboard): la jornada del médico con la RLS existente y SIN ninguna política nueva.
-- Spec: jornada-del-medico («El médico ve su horario de atención y sus citas confirmadas», «El médico solo ve lo suyo»,
-- «El médico marca como atendida una cita confirmada suya»). Las consultas de abajo son las de lib/medico/jornada.ts sin la ventana de
-- fechas (las citas de la prueba son de 2032); tests/integracion/turnos-enfermeria.test.ts corre el código real con la sesión del médico.
select plan(25);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp jornada');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'Alfa'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'Beta'),
  (tests.sub('enfermera'), 'enfermera', 'Elena', 'Uno');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select p.id, 'CMP-JM-' || right(p.clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp jornada')
  from public.perfiles p where p.clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.enfermeras (perfil_id) select id from public.perfiles where clerk_user_id = tests.sub('enfermera');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '78400001', 'Paula', 'Uno', '1990-01-01', 'F', 'jm1@demo.invalid'),
  ('DNI', '78400002', 'Pablo', 'Dos', '1991-01-01', 'M', 'jm2@demo.invalid'),
  ('DNI', '78400003', 'Pilar', 'Tres', '1992-01-01', 'F', 'jm3@demo.invalid'),
  ('DNI', '78400004', 'Pedro', 'Cuatro', '1993-01-01', 'M', 'jm4@demo.invalid');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', id from public.medicos where cmp = 'CMP-JM-a'
  union all select 'm_b', id from public.medicos where cmp = 'CMP-JM-b'
  union all select 'enf', id from public.enfermeras where perfil_id = (select id from public.perfiles where clerk_user_id = tests.sub('enfermera'))
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7840000%';

-- Citas del médico A: C01 confirmada (la jornada la muestra), C02 reservada, C03 atendida, C04 cancelada, C05 confirmada que ya empezó.
-- Cita del médico B: C06 confirmada (de otro médico).
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  ('00000000-0000-4000-8000-000000008401', (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'), '2032-10-04 09:20:00-05', '2032-10-04 09:40:00-05', 'portal', 'confirmada'),
  ('00000000-0000-4000-8000-000000008402', (select id from e where clave = 'p2'), (select id from e where clave = 'm_a'), '2032-10-04 10:00:00-05', '2032-10-04 10:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000008403', (select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), '2032-10-04 11:00:00-05', '2032-10-04 11:20:00-05', 'portal', 'atendida'),
  ('00000000-0000-4000-8000-000000008404', (select id from e where clave = 'p2'), (select id from e where clave = 'm_a'), '2032-10-04 12:00:00-05', '2032-10-04 12:20:00-05', 'portal', 'cancelada'),
  ('00000000-0000-4000-8000-000000008405', (select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), now() - interval '2 hours', now() - interval '100 minutes', 'portal', 'confirmada'),
  ('00000000-0000-4000-8000-000000008406', (select id from e where clave = 'p4'), (select id from e where clave = 'm_b'), '2032-10-04 09:20:00-05', '2032-10-04 09:40:00-05', 'portal', 'confirmada');
insert into public.bloqueos_agenda (medico_id, rango, motivo) values
  ((select id from e where clave = 'm_a'), tstzrange('2032-10-05 08:00:00-05', '2032-10-05 12:00:00-05'), 'Bloqueo propio A'),
  ((select id from e where clave = 'm_b'), tstzrange('2032-10-05 08:00:00-05', '2032-10-05 12:00:00-05'), 'Bloqueo de B');
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde) values
  ((select id from e where clave = 'm_a'), 1, '09:00', '13:00', 20, '2020-01-01'),
  ((select id from e where clave = 'm_b'), 2, '14:00', '18:00', 20, '2020-01-01');
-- Un turno de enfermería con el médico A (que tiene un bloqueo ese día: aparece en turnos_enfermeria_con_aviso para el administrativo).
insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
  values ((select id from e where clave = 'enf'), '2032-10-05', 'manana', (select id from e where clave = 'm_a'));
-- Una atención del médico B a un paciente que el médico A no tiene a cargo.
insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  values ('00000000-0000-4000-8000-000000008411',
          (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p4')),
          (select id from e where clave = 'p4'), (select id from e where clave = 'm_b'),
          'Motivo', 'Anamnesis', 'Examen', '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'Plan');

-- Las citas que la jornada muestra: confirmadas del médico de la sesión, con el nombre y el documento del paciente (sin `motivo`).
create function pg_temp.citas_de_la_jornada() returns table (id uuid, nombres text, apellidos text, tipo_documento text, numero_documento text)
language sql as $$
  select c.id, p.nombres, p.apellidos, p.tipo_documento::text, p.numero_documento
    from public.citas c
    join public.pacientes p on p.id = c.paciente_id
   where c.medico_id = (select public.medico_actual()) and c.estado = 'confirmada'
   order by c.inicio
$$;
grant execute on function pg_temp.citas_de_la_jornada() to public;
-- Filas de una relación; nulo si la relación no existe todavía (dashboard_citas la crea otro change: la prueba pasa sola cuando exista).
create function pg_temp.filas_de(p_relacion text) returns int language plpgsql as $f$
declare v int;
begin
  if to_regclass(p_relacion) is null then return null; end if;
  execute format('select count(*)::int from %s', p_relacion) into v;
  return v;
end
$f$;
grant execute on function pg_temp.filas_de(text) to public;
create function pg_temp.actualizar_cita(p_id uuid, p_estado public.estado_cita) returns int language sql as $$
  with u as (update public.citas set estado = p_estado where id = p_id returning id) select count(*)::int from u
$$;
create function pg_temp.actualizar_motivo(p_id uuid) returns int language sql as $$
  with u as (update public.citas set motivo = 'cambiado' where id = p_id returning id) select count(*)::int from u
$$;
grant execute on function pg_temp.actualizar_cita(uuid, public.estado_cita), pg_temp.actualizar_motivo(uuid) to public;

-- ---- Control: los datos de otros existen ----
select tests.autenticar_como('administrativo');
select cmp_ok(
  (select count(*)::int from public.citas where id = '00000000-0000-4000-8000-000000008406')
  + (select count(*)::int from public.bloqueos_agenda where motivo = 'Bloqueo de B')
  + (select count(*)::int from public.turnos_enfermeria where medico_id = (select id from e where clave = 'm_a'))
  + (select count(*)::int from public.turnos_enfermeria_con_aviso where medico_id = (select id from e where clave = 'm_a')),
  '=', 4, 'control: el administrativo ve la cita de B, su bloqueo y el turno de enfermería (con aviso)'
);

select tests.volver_a_dueno();
select is((select count(*)::int from public.atenciones where id = '00000000-0000-4000-8000-000000008411'), 1, 'control: la atención del médico B existe');

-- ---- Médico A: su jornada ----
select tests.autenticar_como('medico_a');
select is(
  (select array_agg(right(id::text, 2) order by id) from pg_temp.citas_de_la_jornada()),
  array['01', '05'],
  'el médico ve sus citas confirmadas y ninguna reservada, atendida, cancelada ni de otro médico'
);
select is(
  (select nombres || ' ' || apellidos || ' ' || tipo_documento || ' ' || numero_documento from pg_temp.citas_de_la_jornada() where id = '00000000-0000-4000-8000-000000008401'),
  'Paula Uno DNI 78400001',
  've el nombre y el documento del paciente de cada cita confirmada'
);
select is(
  (select count(*)::int from public.disponibilidades where medico_id = (select public.medico_actual())), 1,
  'sus horarios de atención se filtran por medico_actual()'
);
select is(
  (select count(*)::int from public.bloqueos_agenda where motivo = 'Bloqueo propio A'), 1, 've su propio bloqueo de agenda'
);

-- ---- Médico A: negativas ----
select is_empty($q$ select 1 from public.citas where id = '00000000-0000-4000-8000-000000008406' $q$, 'cero filas de las citas de otro médico');
select is_empty($q$ select 1 from public.bloqueos_agenda where motivo = 'Bloqueo de B' $q$, 'cero filas de los bloqueos de otro médico');
select is((select count(*)::int from public.turnos_enfermeria), 0, 'cero filas de turnos_enfermeria (no ve qué enfermera trabaja con él)');
select is((select count(*)::int from public.turnos_enfermeria_con_aviso), 0, 'cero filas de turnos_enfermeria_con_aviso');
select is(coalesce(pg_temp.filas_de('public.dashboard_citas'), 0), 0, 'cero filas de dashboard_citas (si la vista ya existe)');
select is_empty(
  $q$ select 1 from public.atenciones where id = '00000000-0000-4000-8000-000000008411' $q$,
  'cero filas de las atenciones de un paciente que no tiene a cargo'
);
select is_empty($q$ select 1 from public.pacientes where id = (select id from e where clave = 'p4') $q$, 'ni siquiera ve al paciente de la cita de otro médico');

-- ---- Guarda de H3: el médico no actualiza citas directamente ----
select is(pg_temp.actualizar_cita('00000000-0000-4000-8000-000000008401', 'atendida'), 0, 'el médico no marca atendida con un UPDATE directo (ninguna fila afectada)');
select is(pg_temp.actualizar_cita('00000000-0000-4000-8000-000000008401', 'cancelada'), 0, 'ni cancela con un UPDATE directo');
select is(pg_temp.actualizar_motivo('00000000-0000-4000-8000-000000008401'), 0, 'ni cambia otro dato de la cita');
select tests.volver_a_dueno();
select is(
  (select estado::text || '|' || coalesce(motivo, '-') from public.citas where id = '00000000-0000-4000-8000-000000008401'),
  'confirmada|-',
  'la cita quedó intacta'
);

-- ---- La acción de H3 que consume la jornada ----
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000008406') $q$,
  'UC002', null, 'cita de otro médico: se rechaza y no se revela si existe (UC002)'
);
select throws_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000008402') $q$,
  'UC004', null, 'una cita reservada no se puede marcar atendida (UC004)'
);
select throws_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000008401') $q$,
  'UC004', null, 'una cita confirmada cuya hora aún no empieza tampoco (UC004): la jornada no ofrece el botón'
);
select lives_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000008405') $q$,
  'una cita confirmada propia cuya hora ya empezó se marca atendida'
);
select is(
  (select array_agg(right(id::text, 2) order by id) from pg_temp.citas_de_la_jornada()),
  array['01'],
  'y sale de su lista de confirmadas'
);
select throws_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000008405') $q$,
  'UC004', null, 'repetirlo no la vuelve a cambiar (UC004: ya no está confirmada)'
);

-- ---- Otros roles: no marcan atendida ----
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000008401') $q$,
  '42501', null, 'la enfermera no marca atendida'
);
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000008401') $q$,
  '42501', null, 'el administrativo tampoco: es del médico'
);

select * from finish();
