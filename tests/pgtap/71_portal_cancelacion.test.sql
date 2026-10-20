-- Cancelación propia del paciente (H4, tarea 2.5): política «paciente cancela su cita» (migración portal-paciente-cancelacion).
-- Spec: mis-citas-y-cancelacion. Dos barreras distintas: la política (qué filas puede tocar y a qué estado las deja) y los
-- disparadores de H3 (citas_proteger_columnas: solo cambia `estado`; validar_cancelacion: ventana de 1 hora; validar_transicion_estado:
-- el paciente no pone ningún otro estado). Cada uno tiene su caso negativo.
select plan(29);

-- ---- Datos de prueba (dueño). Los citas se siembran con identificadores fijos terminados en el número de la cita. ----
insert into public.especialidades (nombre) values ('Esp portal cancelacion');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  ('user_test_pca_mb', 'medico', 'Marta', 'B'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-PCA-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp portal cancelacion')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), 'user_test_pca_mb');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  select 'DNI', '7263000' || n, 'Paciente', 'PCA' || n, '1990-01-01', 'F', 'pca' || n || '@demo.invalid',
         case n when 1 then (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))
                when 2 then (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b')) end
  from generate_series(1, 2) n;
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_pca_mb'
  union all select 'pa', id from public.pacientes where numero_documento = '72630001'
  union all select 'pb', id from public.pacientes where numero_documento = '72630002'
  union all select 'perfil_pa', id from public.perfiles where clerk_user_id = tests.sub('paciente_a')
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo');

insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado, cancelada_en, cancelada_por) values
  -- c1 de paciente_a a 61 minutos: dentro de lo permitido (la ventana es de 1 hora)
  ('00000000-0000-4000-8000-000000007101', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() + interval '61 minutes', now() + interval '81 minutes', 'portal', 'reservada', null, null),
  -- c2 de paciente_a a 59 minutos: fuera de la ventana
  ('00000000-0000-4000-8000-000000007102', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() + interval '59 minutes', now() + interval '60 minutes', 'portal', 'reservada', null, null),
  -- c3 de paciente_b, lejana
  ('00000000-0000-4000-8000-000000007103', (select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), now() + interval '3 days', now() + interval '3 days 20 minutes', 'portal', 'reservada', null, null),
  -- c4 de paciente_a ya cancelada
  ('00000000-0000-4000-8000-000000007104', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() + interval '6 days', now() + interval '6 days 20 minutes', 'portal', 'cancelada', now(), (select id from e where clave = 'perfil_pa')),
  -- c5 de paciente_a ya atendida
  ('00000000-0000-4000-8000-000000007105', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() - interval '2 days', now() - interval '2 days' + interval '20 minutes', 'portal', 'atendida', null, null),
  -- c6 de paciente_a, lejana: la que se intenta editar
  ('00000000-0000-4000-8000-000000007106', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() + interval '2 days', now() + interval '2 days 20 minutes', 'portal', 'reservada', null, null),
  -- c7 de paciente_a, lejana: se cancela con valores de auditoría falsificados
  ('00000000-0000-4000-8000-000000007107', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() + interval '4 days', now() + interval '4 days 20 minutes', 'portal', 'reservada', null, null),
  -- c9 de paciente_a, lejana: la cancela el administrativo
  ('00000000-0000-4000-8000-000000007109', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() + interval '5 days', now() + interval '5 days 20 minutes', 'administrativo', 'reservada', null, null),
  -- c10 de paciente_b a 40 minutos, bajo un bloqueo de agenda del médico (la excepción por baja de ADR-0011)
  ('00000000-0000-4000-8000-000000007110', (select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), now() + interval '30 minutes', now() + interval '50 minutes', 'administrativo', 'reservada', null, null);
insert into public.bloqueos_agenda (medico_id, rango, motivo)
  values ((select id from e where clave = 'm_a'), tstzrange(now() + interval '20 minutes', now() + interval '55 minutes'), 'Baja de prueba');

-- Funciones de apoyo (SECURITY INVOKER: corren con los privilegios y la RLS de quien las llama). Devuelven las filas afectadas,
-- porque un UPDATE con RETURNING en un CTE no puede ir dentro de un subselect.
create function pg_temp.cancelar(p_id uuid) returns int language plpgsql as $$
declare n int;
begin
  update public.citas set estado = 'cancelada' where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;
create function pg_temp.cancelar_falsificando(p_id uuid, p_perfil uuid) returns int language plpgsql as $$
declare n int;
begin
  update public.citas set estado = 'cancelada', cancelada_por = p_perfil, cancelada_en = '2000-01-01' where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- La política y los disparadores existen como se diseñó ----
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'citas' and policyname = 'paciente cancela su cita' and cmd = 'UPDATE'),
  'existe la política «paciente cancela su cita» para UPDATE'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.citas'::regclass and tgname = 'citas_proteger_columnas' and not tgisinternal)
  and not exists (select 1 from pg_trigger where tgrelid = 'public.citas'::regclass and tgname = 'citas_proteger_columnas_paciente'),
  'el disparador de columnas es el de H3 (para todos los roles), no uno propio del paciente'
);

-- ---- Cancelar a 61 minutos ----
select tests.autenticar_como('paciente_a');
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007101')),
  1, 'el paciente cancela su cita a 61 minutos'
);
select tests.volver_a_dueno();
select is(
  (select row(estado::text, cancelada_por is not distinct from (select id from e where clave = 'perfil_pa'), cancelada_en is not null)::text
     from public.citas where id = '00000000-0000-4000-8000-000000007101'),
  row('cancelada', true, true)::text,
  'la cita quedó cancelada, con cancelada_por = el perfil del paciente y cancelada_en fijada'
);

-- ---- Cancelar a 59 minutos ----
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ update public.citas set estado = 'cancelada' where id = '00000000-0000-4000-8000-000000007102' $q$,
  'P0001', null, 'a 59 minutos la cancelación falla por la ventana de 1 hora'
);

-- ---- Citas que el paciente no puede cancelar: cero filas ----
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007103')),
  0, 'NO cancela la cita de otro paciente (cero filas)'
);
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007104')),
  0, 'NO vuelve a cancelar una cita ya cancelada (cero filas)'
);
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007105')),
  0, 'NO cancela una cita ya atendida (cero filas)'
);

-- La política de lectura ya oculta las citas ajenas, lo que taparía la condición de la propia política de cancelación. Con una
-- política de lectura temporal que lo deja verlo todo, la de cancelación tiene que defenderse sola.
select tests.volver_a_dueno();
create policy tmp_ve_todas_las_citas on public.citas for select to authenticated using (true);
select tests.autenticar_como('paciente_a');
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007103')),
  0, 'aun viendo la cita de otro paciente, la política de cancelación NO le deja cancelarla (cero filas)'
);
select tests.volver_a_dueno();
drop policy tmp_ve_todas_las_citas on public.citas;
select tests.autenticar_como('paciente_a');

-- ---- Una cita no se edita: ni siquiera la propia ----
-- Cada UPDATE cancela y además cambia otra columna: así la política (estado = 'cancelada') se cumple y lo único que lo
-- detiene es citas_proteger_columnas (42501). El último no cancela: lo detiene el WITH CHECK de la política.
select throws_ok(
  $q$ update public.citas set estado = 'cancelada', inicio = inicio + interval '1 day', fin = fin + interval '1 day' where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO cancela y cambia el inicio en el mismo UPDATE'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada', medico_id = (select id from e where clave = 'm_b') where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO cancela y cambia el médico en el mismo UPDATE'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada', paciente_id = (select id from e where clave = 'pb') where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO cancela y traspasa la cita a otro paciente'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada', motivo = 'cualquier texto' where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO cancela y cambia el motivo'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada', origen = 'administrativo' where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO cancela y cambia el origen'
);
select throws_ok(
  $q$ update public.citas set motivo = 'cualquier texto' where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO edita la cita sin cancelarla: la política solo deja dejarla cancelada'
);

-- ---- Ningún otro estado ----
select throws_ok(
  $q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO se confirma su cita'
);
select throws_ok(
  $q$ update public.citas set estado = 'atendida' where id = '00000000-0000-4000-8000-000000007106' $q$,
  '42501', null, 'NO marca su cita como atendida'
);
select throws_ok(
  $q$ update public.citas set estado = 'no_asistio' where id = '00000000-0000-4000-8000-000000007106' $q$,
  'UC004', null, 'NO marca su cita como «No asistió» (transición no permitida)'
);

-- ---- Auditoría: el paciente no falsifica quién canceló ----
select is(
  (select pg_temp.cancelar_falsificando('00000000-0000-4000-8000-000000007107', (select id from e where clave = 'perfil_admin'))),
  1, 'cancela c7 enviando valores falsos de cancelada_por y cancelada_en'
);
select tests.volver_a_dueno();
select is(
  (select row(cancelada_por is not distinct from (select id from e where clave = 'perfil_pa'), cancelada_en > now() - interval '1 minute')::text
     from public.citas where id = '00000000-0000-4000-8000-000000007107'),
  row(true, true)::text,
  'cancelada_por y cancelada_en los fija el servidor (el perfil del paciente y now()), no el cliente'
);

-- ---- La cita editada no cambió ----
select is(
  (select row(estado::text, inicio = now() + interval '2 days', motivo is null, origen)::text from public.citas where id = '00000000-0000-4000-8000-000000007106'),
  row('reservada', true, true, 'portal')::text,
  'tras todos los intentos, c6 sigue igual (reservada, mismo inicio, sin motivo, origen portal)'
);

-- ---- Otros roles ----
select tests.autenticar_como('paciente_b');
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007106')),
  0, 'paciente_b NO cancela la cita de paciente_a (cero filas)'
);
select tests.autenticar_como('medico_a');
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007106')),
  0, 'el médico NO actualiza citas (cero filas)'
);
select tests.autenticar_como('enfermera');
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007106')),
  0, 'la enfermera NO actualiza citas (cero filas)'
);
select tests.autenticar_como('sin_rol');
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007106')),
  0, 'una sesión sin rol NO actualiza citas (cero filas)'
);
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000007106'), 'reservada', 'c6 sigue reservada tras los intentos de los demás roles');

-- ---- Lo de H2 sigue igual para el administrativo ----
select tests.autenticar_como('administrativo');
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007109')),
  1, 'el administrativo sigue cancelando la cita de cualquier paciente'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada' where id = '00000000-0000-4000-8000-000000007102' $q$,
  'P0001', null, 'la ventana de 1 hora también aplica al administrativo (ADR-0012)'
);
select is(
  (select pg_temp.cancelar('00000000-0000-4000-8000-000000007110')),
  1, 'bajo un bloqueo de agenda se cancela dentro de la ventana (excepción por baja, ADR-0011)'
);

select * from finish();
