-- H7 grupo 2, tarea 2.4 (turnos-y-dashboard): vista turnos_enfermeria_con_aviso (security_invoker) y su aislamiento por rol.
-- Spec: turnos-de-enfermeria («El administrativo ve los turnos afectados por la ausencia de un médico o la baja de personal»).
-- Las filas llevan ids propios (…0080NN) y fechas de 2032: las pruebas afirman por id y no asumen tablas vacías.
select plan(24);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp aviso');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('enfermera'), 'enfermera', 'Elena', 'Uno'),
  ('user_test_av_e2', 'enfermera', 'Eva', 'Dos'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'Bloqueado'),
  ('user_test_av_mb', 'medico', 'Marta', 'Baja'),
  ('user_test_av_mc', 'medico', 'Marcos', 'Sano');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-AV-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp aviso')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), 'user_test_av_mb', 'user_test_av_mc');
insert into public.enfermeras (perfil_id)
  select id from public.perfiles where clerk_user_id in (tests.sub('enfermera'), 'user_test_av_e2');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'enf1', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = tests.sub('enfermera')
  union all select 'enf2', en.id from public.enfermeras en join public.perfiles p on p.id = en.perfil_id where p.clerk_user_id = 'user_test_av_e2'
  union all select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_av_mb'
  union all select 'm_c', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_av_mc'
  union all select 'esp', id from public.especialidades where nombre = 'Esp aviso';

-- Bajas: el médico B y la enfermera 2 están dados de baja.
update public.medicos set activo = false where id = (select id from e where clave = 'm_b');
update public.enfermeras set activo = false where id = (select id from e where clave = 'enf2');

-- Bloqueos del médico A (fechas y horas de Lima, offset -05):
--  - 5/7/2032 de 15:00 a 17:00 (parcial: marca todo el día 5);
--  - del 10/7/2032 00:00 al 11/7/2032 00:00 (el límite superior es exclusivo: el día 11 no está cubierto);
--  - 12/7/2032 de 21:00 a 22:00 de Lima = 13/7/2032 02:00–03:00 UTC (frontera: cuenta el 12, no el 13).
insert into public.bloqueos_agenda (medico_id, rango, motivo) values
  ((select id from e where clave = 'm_a'), tstzrange('2032-07-05 15:00:00-05', '2032-07-05 17:00:00-05'), 'MOTIVO-PRIVADO-AVISO licencia'),
  ((select id from e where clave = 'm_a'), tstzrange('2032-07-10 00:00:00-05', '2032-07-11 00:00:00-05'), 'MOTIVO-PRIVADO-AVISO otro día'),
  ((select id from e where clave = 'm_a'), tstzrange('2032-07-12 21:00:00-05', '2032-07-12 22:00:00-05'), 'MOTIVO-PRIVADO-AVISO frontera');

-- T01 médico con bloqueo parcial ese día · T02 médico dado de baja · T03 enfermera dada de baja · T04 sin problema
-- T05 fecha pasada con médico de baja · T06 bloqueo que empieza al día siguiente · T07 frontera de Lima (cuenta)
-- T08 frontera de Lima (no cuenta) · T09 dos causas · T10 servicio con enfermera de baja · T11 sin médico ni problema
-- T12 bloqueo que terminó a las 00:00 de ese día
insert into public.turnos_enfermeria (id, enfermera_id, fecha, turno, medico_id, especialidad_id) values
  ('00000000-0000-4000-8000-000000008001', (select id from e where clave = 'enf1'), '2032-07-05', 'manana', (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008002', (select id from e where clave = 'enf1'), '2032-07-06', 'manana', (select id from e where clave = 'm_b'), null),
  ('00000000-0000-4000-8000-000000008003', (select id from e where clave = 'enf2'), '2032-07-07', 'manana', (select id from e where clave = 'm_c'), null),
  ('00000000-0000-4000-8000-000000008004', (select id from e where clave = 'enf1'), '2032-07-08', 'manana', (select id from e where clave = 'm_c'), null),
  ('00000000-0000-4000-8000-000000008005', (select id from e where clave = 'enf1'), '2021-07-05', 'manana', (select id from e where clave = 'm_b'), null),
  ('00000000-0000-4000-8000-000000008006', (select id from e where clave = 'enf1'), '2032-07-09', 'tarde',  (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008007', (select id from e where clave = 'enf1'), '2032-07-12', 'noche',  (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008008', (select id from e where clave = 'enf1'), '2032-07-13', 'noche',  (select id from e where clave = 'm_a'), null),
  ('00000000-0000-4000-8000-000000008009', (select id from e where clave = 'enf2'), '2032-07-14', 'manana', (select id from e where clave = 'm_b'), null),
  ('00000000-0000-4000-8000-000000008010', (select id from e where clave = 'enf2'), '2032-07-15', 'tarde',  null, (select id from e where clave = 'esp')),
  ('00000000-0000-4000-8000-000000008011', (select id from e where clave = 'enf1'), '2032-07-16', 'tarde',  null, (select id from e where clave = 'esp')),
  ('00000000-0000-4000-8000-000000008012', (select id from e where clave = 'enf1'), '2032-07-11', 'noche',  (select id from e where clave = 'm_a'), null);

-- Los turnos sembrados que la vista muestra, por sufijo, en orden de fecha.
create function pg_temp.avisos() returns text[] language sql as $$
  select coalesce(array_agg(right(v.turno_id::text, 2) order by v.fecha, v.turno), '{}')
  from public.turnos_enfermeria_con_aviso v where v.turno_id::text like '00000000-0000-4000-8000-0000000080%'
$$;
grant execute on function pg_temp.avisos() to public;
create function pg_temp.causas(p_sufijo text) returns text[] language sql as $$
  select v.causas from public.turnos_enfermeria_con_aviso v where v.turno_id = ('00000000-0000-4000-8000-0000000080' || p_sufijo)::uuid
$$;
grant execute on function pg_temp.causas(text) to public;

-- ---- Administrativo: los turnos con problema, con su causa ----
select tests.autenticar_como('administrativo');
select is(pg_temp.avisos(), array['01', '02', '03', '07', '09', '10'],
  'el administrativo ve exactamente los turnos con médico bloqueado o de baja y con enfermera de baja, por fecha');
select is(pg_temp.causas('01'), array['bloqueo_de_agenda'], 'un bloqueo parcial del día marca el turno con la causa bloqueo_de_agenda');
select is(pg_temp.causas('02'), array['medico_de_baja'], 'un médico dado de baja marca el turno con la causa medico_de_baja');
select is(pg_temp.causas('03'), array['enfermera_de_baja'], 'una enfermera dada de baja marca el turno con la causa enfermera_de_baja');
select is(pg_temp.causas('09'), array['enfermera_de_baja', 'medico_de_baja'], 'un turno con dos problemas lista las dos causas, en orden');
select is(pg_temp.causas('10'), array['enfermera_de_baja'], 'un turno asignado a un servicio también avisa si la enfermera está de baja');
select is(pg_temp.causas('07'), array['bloqueo_de_agenda'],
  'frontera de Lima: el bloqueo del 12/7 de 21:00 a 22:00 (13/7 en UTC) marca el turno del 12/7');
select is_empty(
  $q$ select 1 from public.turnos_enfermeria_con_aviso where turno_id = '00000000-0000-4000-8000-000000008004' $q$,
  'un turno sin ningún problema no aparece');
select is_empty(
  $q$ select 1 from public.turnos_enfermeria_con_aviso where turno_id = '00000000-0000-4000-8000-000000008005' $q$,
  'un turno de una fecha pasada no aparece, aunque su médico esté de baja');
select is_empty(
  $q$ select 1 from public.turnos_enfermeria_con_aviso where turno_id in (
       '00000000-0000-4000-8000-000000008006', '00000000-0000-4000-8000-000000008012') $q$,
  'un bloqueo que empieza a las 00:00 del día siguiente, o que terminó a las 00:00 de ese día, no marca el turno');
select is_empty(
  $q$ select 1 from public.turnos_enfermeria_con_aviso where turno_id = '00000000-0000-4000-8000-000000008008' $q$,
  'frontera de Lima: el mismo bloqueo (13/7 en UTC) no marca el turno del 13/7');
select is_empty(
  $q$ select 1 from public.turnos_enfermeria_con_aviso where turno_id = '00000000-0000-4000-8000-000000008011' $q$,
  'un turno de servicio con personal activo no aparece');

-- ---- El aviso desaparece al corregir el turno ----
select lives_ok(
  $q$ update public.turnos_enfermeria set medico_id = (select id from e where clave = 'm_c')
      where id = '00000000-0000-4000-8000-000000008001' $q$,
  'el administrativo cambia el médico del turno 01 por uno sin bloqueos');
select is(pg_temp.avisos(), array['02', '03', '07', '09', '10'], 'al cambiar el médico, el turno 01 deja de estar en los avisos');
select is(
  (select count(*)::int from public.turnos_enfermeria where id = '00000000-0000-4000-8000-000000008001'), 1,
  'y el turno sigue guardado: la vista solo avisa, no modifica ni quita turnos'
);

-- ---- Sin motivo del bloqueo ----
select tests.volver_a_dueno();
select is_empty(
  $q$ select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'turnos_enfermeria_con_aviso' and column_name ilike '%motivo%' $q$,
  'la vista no tiene ninguna columna con el motivo del bloqueo');
select tests.autenticar_como('administrativo');
select is_empty(
  $q$ select 1 from public.turnos_enfermeria_con_aviso v where v::text like '%MOTIVO-PRIVADO-AVISO%' $q$,
  'el texto del motivo de un bloqueo no aparece en ninguna fila de la vista');

-- ---- Negativas: enfermera (dueña de los turnos), médico, paciente y sin rol, cero filas ----
select tests.autenticar_como('enfermera');
select cmp_ok(
  (select count(*)::int from public.turnos_enfermeria where id in (
     '00000000-0000-4000-8000-000000008002', '00000000-0000-4000-8000-000000008007')), '=', 2,
  'control: la enfermera sí ve directamente sus propios turnos con aviso');
select is(pg_temp.avisos(), '{}'::text[], 'la enfermera, incluso dueña del turno, no ve ninguna fila de la vista');
select tests.autenticar_como('medico_a');
select is(pg_temp.avisos(), '{}'::text[], 'el médico (con el bloqueo propio) no ve ninguna fila de la vista');
select tests.autenticar_como('paciente_a');
select is(pg_temp.avisos(), '{}'::text[], 'el paciente no ve ninguna fila');
select tests.autenticar_como('sin_rol');
select is(pg_temp.avisos(), '{}'::text[], 'una sesión sin rol no ve ninguna fila');

-- ---- Forma de la vista ----
select tests.volver_a_dueno();
select is((select c.reloptions from pg_class c where c.oid = 'public.turnos_enfermeria_con_aviso'::regclass), array['security_invoker=true'],
  'la vista es security_invoker: aplica la RLS de quien la consulta');
select ok(
  has_table_privilege('authenticated', 'public.turnos_enfermeria_con_aviso', 'SELECT')
  and not has_table_privilege('anonymous', 'public.turnos_enfermeria_con_aviso', 'SELECT')
  and not has_table_privilege('public', 'public.turnos_enfermeria_con_aviso', 'SELECT')
  and not has_table_privilege('authenticated', 'public.turnos_enfermeria_con_aviso', 'INSERT')
  and not has_table_privilege('authenticated', 'public.turnos_enfermeria_con_aviso', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.turnos_enfermeria_con_aviso', 'DELETE'),
  'solo authenticated la lee y nadie la escribe'
);

select * from finish();
