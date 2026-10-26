-- H7, tarea 4.3 (turnos-y-dashboard): negativas de ESCRITURA de turnos_enfermeria por rol. Solo el administrativo asigna, modifica y
-- quita turnos; un intento directo de otro rol, saltándose la interfaz, se rechaza (42501) o no afecta ninguna fila, y el turno queda
-- intacto. Spec: turnos-de-enfermeria («Solo el administrativo gestiona los turnos»). No repite 50_turnos_enfermeria (restricciones,
-- enfermera_actual() y lectura): aquí solo la escritura de cada rol, y la del administrativo como control de que sí se puede.
select plan(20);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp turnos escritura');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('enfermera'), 'enfermera', 'Elena', 'Uno'),
  ('user_test_te_e2', 'enfermera', 'Eva', 'Dos'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-TE-0001', (select id from public.especialidades where nombre = 'Esp turnos escritura')
  from public.perfiles where clerk_user_id = tests.sub('medico_a');
insert into public.enfermeras (perfil_id)
  select id from public.perfiles where clerk_user_id in (tests.sub('enfermera'), 'user_test_te_e2');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'e1', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = tests.sub('enfermera')
  union all select 'e2', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = 'user_test_te_e2'
  union all select 'medico', id from public.medicos where cmp = 'CMP-TE-0001';

insert into public.turnos_enfermeria (id, enfermera_id, fecha, turno, medico_id) values
  ('00000000-0000-4000-8000-000000008201', (select id from e where clave = 'e1'), '2032-08-02', 'manana', (select id from e where clave = 'medico')),
  ('00000000-0000-4000-8000-000000008202', (select id from e where clave = 'e2'), '2032-08-02', 'manana', (select id from e where clave = 'medico'));

-- El turno 01 es de la enfermera e1: su estado de partida, para comprobar que nadie lo toca.
create function pg_temp.turno_01() returns text language sql as $$
  select t.enfermera_id::text || '|' || t.fecha::text || '|' || t.turno::text || '|' || coalesce(t.medico_id::text, '-') || '|' || coalesce(t.especialidad_id::text, '-')
  from public.turnos_enfermeria t where t.id = '00000000-0000-4000-8000-000000008201'
$$;
grant execute on function pg_temp.turno_01() to public;
select tests.volver_a_dueno();
create temp table partida (valor text);
grant select on partida to public;
insert into partida select pg_temp.turno_01();

-- Filas que afecta un UPDATE / DELETE de cada turno de partida (0 si la RLS no deja ver o escribir la fila).
create function pg_temp.actualizar(p_id uuid) returns int language sql as $$
  with u as (update public.turnos_enfermeria set turno = 'tarde' where id = p_id returning id) select count(*)::int from u
$$;
create function pg_temp.borrar(p_id uuid) returns int language sql as $$
  with d as (delete from public.turnos_enfermeria where id = p_id returning id) select count(*)::int from d
$$;
grant execute on function pg_temp.actualizar(uuid), pg_temp.borrar(uuid) to public;

-- ---- Enfermera (dueña del turno 01) ----
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e1'), '2032-08-03', 'manana', (select id from e where clave = 'medico')) $q$,
  '42501', null, 'la enfermera no inserta un turno, ni siquiera a su nombre'
);
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e2'), '2032-08-03', 'manana', (select id from e where clave = 'medico')) $q$,
  '42501', null, 'ni a nombre de otra enfermera'
);
select is(pg_temp.actualizar('00000000-0000-4000-8000-000000008201'), 0, 'la enfermera no modifica su propio turno (ninguna fila afectada)');
select is(pg_temp.borrar('00000000-0000-4000-8000-000000008201'), 0, 'la enfermera no quita su propio turno (ninguna fila afectada)');
select tests.volver_a_dueno();
select is(pg_temp.turno_01(), (select valor from partida), 'el turno de la enfermera quedó intacto');

-- ---- Médico ----
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e1'), '2032-08-04', 'manana', (select id from e where clave = 'medico')) $q$,
  '42501', null, 'el médico no inserta un turno'
);
select is(pg_temp.actualizar('00000000-0000-4000-8000-000000008201'), 0, 'el médico no modifica un turno (ninguna fila afectada)');
select is(pg_temp.borrar('00000000-0000-4000-8000-000000008201'), 0, 'el médico no quita un turno (ninguna fila afectada)');
select tests.volver_a_dueno();
select is(pg_temp.turno_01(), (select valor from partida), 'el turno quedó intacto tras los intentos del médico');

-- ---- Paciente ----
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e1'), '2032-08-04', 'tarde', (select id from e where clave = 'medico')) $q$,
  '42501', null, 'el paciente no inserta un turno'
);
select is(pg_temp.actualizar('00000000-0000-4000-8000-000000008201'), 0, 'el paciente no modifica un turno (ninguna fila afectada)');
select is(pg_temp.borrar('00000000-0000-4000-8000-000000008201'), 0, 'el paciente no quita un turno (ninguna fila afectada)');
select tests.volver_a_dueno();
select is(pg_temp.turno_01(), (select valor from partida), 'el turno quedó intacto tras los intentos del paciente');

-- ---- Sesión sin rol ----
select tests.autenticar_como('sin_rol');
select throws_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e1'), '2032-08-04', 'noche', (select id from e where clave = 'medico')) $q$,
  '42501', null, 'una sesión sin rol no inserta un turno'
);
select is(pg_temp.actualizar('00000000-0000-4000-8000-000000008201'), 0, 'una sesión sin rol no modifica un turno (ninguna fila afectada)');
select is(pg_temp.borrar('00000000-0000-4000-8000-000000008201'), 0, 'una sesión sin rol no quita un turno (ninguna fila afectada)');
select tests.volver_a_dueno();
select is(pg_temp.turno_01(), (select valor from partida), 'el turno quedó intacto tras los intentos de la sesión sin rol');

-- ---- Administrativo: control, sí puede ----
select tests.autenticar_como('administrativo');
select lives_ok(
  $q$ insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
      values ((select id from e where clave = 'e1'), '2032-08-03', 'manana', (select id from e where clave = 'medico')) $q$,
  'control: el administrativo sí asigna un turno'
);
select is(pg_temp.actualizar('00000000-0000-4000-8000-000000008201'), 1, 'control: el administrativo sí modifica un turno');
select is(pg_temp.borrar('00000000-0000-4000-8000-000000008202'), 1, 'control: el administrativo sí quita un turno');

select * from finish();
