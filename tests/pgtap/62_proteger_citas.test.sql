-- H3, hallazgo (1) de la revisión 6.4 (agenda-y-reserva): una cita no se edita (solo cambia de estado) y solo nace en un hueco de
-- la agenda del médico. proteger_columnas_cita() / citas_proteger_columnas y validar_horario_cita() / citas_validar_horario.
-- Cierra la brecha por la que un UPDATE directo esquivaba los disparadores de estado (mover una cita que empieza en menos de
-- una hora y cancelarla después; alargar `fin` y confirmar una cita terminada, que concede acceso retroactivo a la historia)
-- y la de un INSERT directo fuera de la agenda.
select plan(53);

-- Datos de prueba (dueño). Lunes 7/6/2032; el domingo 6/6/2032 el médico no tiene plantilla.
insert into public.especialidades (nombre) values ('Esp proteger citas');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  ('user_test_pc_mb', 'medico', 'Marta', 'B'),
  ('user_test_pc_mx', 'medico', 'Manuel', 'X'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id, activo)
  select id, 'CMP-PC-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp proteger citas'),
         clerk_user_id <> 'user_test_pc_mx'
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), 'user_test_pc_mb', 'user_test_pc_mx');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  select 'DNI', '7462000' || n, 'Paciente', 'PC' || n, '1990-01-01', 'F', 'pc' || n || '@demo.invalid',
         case n when 1 then (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))
                when 2 then (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b')) end
  from generate_series(1, 3) n;
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_pc_mb'
  union all select 'm_x', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_pc_mx'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7462000%'
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo')
  union all select 'perfil_ma', id from public.perfiles where clerk_user_id = tests.sub('medico_a')
  union all select 'perfil_pa', id from public.perfiles where clerk_user_id = tests.sub('paciente_a');

-- Plantilla de los tres médicos: lunes a viernes de 08:00 a 11:00 en huecos de 20 minutos (m_x está dado de baja). Un bloqueo de
-- m_a el miércoles 9/6/2032 de 10:00 a 10:20 (hora de Lima).
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde, vigente_hasta)
  select m.id, d, '08:00', '11:00', 20, '2020-01-01', null
  from public.medicos m, generate_series(1, 5) d
  where m.id in (select id from e where clave in ('m_a', 'm_b', 'm_x'));
insert into public.bloqueos_agenda (medico_id, rango, motivo)
  values ((select id from e where clave = 'm_a'), tstzrange('2032-06-09 10:00:00-05', '2032-06-09 10:20:00-05'), 'Bloqueo de prueba');

-- Citas (dueño, sin restricciones de los disparadores). Identificadores fijos terminados en el número de la cita.
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  -- c1 reservada futura: blanco de los intentos de edición
  ('00000000-0000-4000-8000-000000006201', (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'portal', 'reservada'),
  -- c2 reservada que empieza en 50 minutos: dentro de la ventana de cancelación
  ('00000000-0000-4000-8000-000000006202', (select id from e where clave = 'p2'), (select id from e where clave = 'm_a'), now() + interval '50 minutes', now() + interval '70 minutes', 'portal', 'reservada'),
  -- c3 reservada que ya terminó (hace 2 h)
  ('00000000-0000-4000-8000-000000006203', (select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), now() - interval '2 hours', now() - interval '100 minutes', 'portal', 'reservada'),
  -- c4 reservada futura: se cancela con valores de auditoría falsificados
  ('00000000-0000-4000-8000-000000006204', (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'), '2032-06-08 09:00:00-05', '2032-06-08 09:20:00-05', 'portal', 'reservada'),
  -- c5 reservada futura de otra paciente: ocupa un hueco para la prueba de la doble reserva
  ('00000000-0000-4000-8000-000000006205', (select id from e where clave = 'p2'), (select id from e where clave = 'm_a'), '2032-06-08 10:00:00-05', '2032-06-08 10:20:00-05', 'portal', 'reservada'),
  -- c6 reservada futura de la paciente A: la que intenta editar con una política temporal
  ('00000000-0000-4000-8000-000000006206', (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'), '2032-06-10 09:00:00-05', '2032-06-10 09:20:00-05', 'portal', 'reservada');
create temp table antes as select id, to_jsonb(c) as fila from public.citas c where id in
  ('00000000-0000-4000-8000-000000006201', '00000000-0000-4000-8000-000000006202', '00000000-0000-4000-8000-000000006203');
grant select on antes to public;

-- ---- El administrativo no edita columnas de una cita ----
select tests.autenticar_como('administrativo');
select throws_ok($q$ update public.citas set inicio = inicio + interval '10 minutes' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'mover `inicio` se rechaza');
select throws_ok($q$ update public.citas set fin = fin + interval '10 minutes' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'alargar `fin` se rechaza');
select throws_ok($q$ update public.citas set medico_id = (select id from e where clave = 'm_b') where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar de médico se rechaza (se reprograma)');
select throws_ok($q$ update public.citas set paciente_id = (select id from e where clave = 'p3') where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar de paciente se rechaza');
select throws_ok($q$ update public.citas set motivo = 'otro motivo' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar el motivo se rechaza');
select throws_ok($q$ update public.citas set origen = 'administrativo' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar el origen se rechaza');
select throws_ok($q$ update public.citas set creada_por = (select id from e where clave = 'perfil_admin') where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar quién la creó se rechaza');
select throws_ok($q$ update public.citas set reprogramada_de = '00000000-0000-4000-8000-000000006204' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar de qué cita viene se rechaza');
select throws_ok($q$ update public.citas set creada_en = now() - interval '1 day' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar la fecha de creación se rechaza');
select throws_ok($q$ update public.citas set id = gen_random_uuid() where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cambiar el identificador se rechaza');
select throws_ok($q$ update public.citas set cancelada_en = now() where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'fijar `cancelada_en` sin cancelar se rechaza');
select throws_ok($q$ update public.citas set cancelada_por = (select id from e where clave = 'perfil_admin') where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'fijar `cancelada_por` sin cancelar se rechaza');
select throws_ok($q$ update public.citas set estado = 'cancelada', inicio = inicio + interval '30 days', fin = fin + interval '30 days' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'cancelar y mover la cita en el mismo UPDATE se rechaza');
select throws_ok($q$ update public.citas set estado = 'confirmada', motivo = 'otro motivo' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'confirmar y editar en el mismo UPDATE se rechaza');
select throws_ok($q$ update public.citas set estado = 'confirmada', cancelada_por = (select id from e where clave = 'perfil_admin') where id = '00000000-0000-4000-8000-000000006205' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'confirmar y fijar `cancelada_por` se rechaza: esas dos columnas solo cambian al cancelar');

-- Escenario 1 de la revisión: mover una cita que empieza en 50 minutos al futuro y cancelarla con otro UPDATE.
select throws_ok($q$ update public.citas set inicio = inicio + interval '30 days', fin = fin + interval '30 days' where id = '00000000-0000-4000-8000-000000006202' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'escenario 1: no se puede mover una cita que empieza en menos de una hora...');
select throws_ok($q$ update public.citas set estado = 'cancelada' where id = '00000000-0000-4000-8000-000000006202' $q$,
  'P0001', 'No es posible cancelar con menos de 1 hora de anticipación', '...y por tanto cancelarla sigue sujeto a la ventana de 1 hora');
-- Escenario 2: alargar `fin` de una cita terminada y confirmarla (acceso retroactivo a la historia).
select throws_ok($q$ update public.citas set fin = now() + interval '1 hour' where id = '00000000-0000-4000-8000-000000006203' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'escenario 2: no se puede alargar `fin` de una cita terminada...');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006203' $q$,
  'UC004', null, '...y confirmarla sigue rechazado: ya terminó');
select tests.volver_a_dueno();
select is((select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:00000000-0000-4000-8000-000000006203'), 0,
  'y no se creó la asignación que daría al médico acceso a la historia');
select is((select jsonb_agg(to_jsonb(c) order by c.id) from public.citas c where c.id in
            ('00000000-0000-4000-8000-000000006201', '00000000-0000-4000-8000-000000006202', '00000000-0000-4000-8000-000000006203')),
          (select jsonb_agg(fila order by id) from antes),
  'tras todos los intentos, las tres citas están exactamente como estaban');

-- Falla cerrado: una columna que se añada a `citas` más adelante queda protegida sin tocar el disparador.
alter table public.citas add column tmp_columna_futura text;
select tests.autenticar_como('administrativo');
select throws_ok($q$ update public.citas set tmp_columna_futura = 'x' where id = '00000000-0000-4000-8000-000000006201' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'una columna añadida en el futuro queda protegida por defecto');
select tests.volver_a_dueno();

-- ---- Cambiar de estado sigue funcionando, y la cancelación fija su propia auditoría ----
select tests.autenticar_como('administrativo');
select lives_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006201' $q$,
  'el administrativo confirma una cita (solo `estado`)');
select lives_ok(
  $q$ update public.citas set estado = 'cancelada', cancelada_por = (select id from e where clave = 'perfil_ma'), cancelada_en = '2000-01-01'
      where id = '00000000-0000-4000-8000-000000006204' $q$,
  'el administrativo cancela una cita aunque envíe valores en `cancelada_por` y `cancelada_en`...');
select tests.volver_a_dueno();
select is((select cancelada_por from public.citas where id = '00000000-0000-4000-8000-000000006204'),
  (select id from e where clave = 'perfil_admin'), '...pero valen los que fija validar_cancelacion: cancelada_por es quien canceló');
select ok((select cancelada_en > now() - interval '1 minute' from public.citas where id = '00000000-0000-4000-8000-000000006204'),
  'y cancelada_en es el instante de la cancelación, no el enviado');

-- ---- El dueño de la base sí edita (migraciones, siembra de demostración, carga histórica de H8) ----
select lives_ok(
  $q$ update public.citas set motivo = 'corregido por el dueño', inicio = '2032-06-07 09:20:00-05', fin = '2032-06-07 09:40:00-05'
      where id = '00000000-0000-4000-8000-000000006201' $q$,
  'el dueño edita columnas de una cita: los disparadores no actúan sobre él');

-- ---- El paciente, con una política de UPDATE temporal que simula la de H4 ----
create policy tmp_paciente_actualiza on public.citas for update to authenticated
  using (paciente_id = (select public.paciente_actual())) with check (paciente_id = (select public.paciente_actual()));
select tests.autenticar_como('paciente_a');
select throws_ok($q$ update public.citas set motivo = 'otro motivo' where id = '00000000-0000-4000-8000-000000006206' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'el paciente no edita el motivo de su cita');
select throws_ok($q$ update public.citas set inicio = inicio + interval '20 minutes', fin = fin + interval '20 minutes' where id = '00000000-0000-4000-8000-000000006206' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'ni la mueve');
select throws_ok($q$ update public.citas set medico_id = (select id from e where clave = 'm_b') where id = '00000000-0000-4000-8000-000000006206' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'ni cambia de médico');
select throws_ok($q$ update public.citas set estado = 'cancelada', inicio = inicio + interval '30 days', fin = fin + interval '30 days' where id = '00000000-0000-4000-8000-000000006206' $q$,
  '42501', 'Una cita no se edita: solo cambia de estado', 'ni cancela y mueve en el mismo UPDATE');
select lives_ok($q$ update public.citas set estado = 'cancelada' where id = '00000000-0000-4000-8000-000000006206' $q$,
  'pero cancela su cita cambiando solo `estado`');
select tests.volver_a_dueno();
select is((select cancelada_por from public.citas where id = '00000000-0000-4000-8000-000000006206'),
  (select id from e where clave = 'perfil_pa'), 'y cancelada_por registra al paciente');
drop policy tmp_paciente_actualiza on public.citas;

-- ---- Una cita solo nace en un hueco de la agenda del médico ----
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-07 09:10:00-05', '2032-06-07 09:30:00-05', 'administrativo') $q$,
  'UC001', 'El horario elegido no está disponible', 'una hora que no es un hueco de la plantilla se rechaza');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-07 09:00:00-05', '2032-06-07 09:15:00-05', 'administrativo') $q$,
  'UC001', null, 'un hueco con otra duración se rechaza');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-07 12:00:00-05', '2032-06-07 12:20:00-05', 'administrativo') $q$,
  'UC001', null, 'una hora fuera de la franja del médico se rechaza');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-06 09:00:00-05', '2032-06-06 09:20:00-05', 'administrativo') $q$,
  'UC001', null, 'un día sin plantilla (domingo) se rechaza');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2026-01-05 09:00:00-05', '2026-01-05 09:20:00-05', 'administrativo') $q$,
  'UC001', null, 'un hueco de la plantilla que ya pasó (lunes 5/1/2026, dentro de la plantilla) se rechaza');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), '2032-06-09 10:00:00-05', '2032-06-09 10:20:00-05', 'administrativo') $q$,
  'UC001', null, 'un hueco dentro de una ausencia del médico se rechaza');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_x'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'administrativo') $q$,
  'UC001', null, 'un médico dado de baja no recibe citas');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), '2032-06-08 10:00:00-05', '2032-06-08 10:20:00-05', 'administrativo') $q$,
  '23P01', null, 'un hueco de la plantilla ya ocupado sigue dando 23P01 (el mensaje de la doble reserva), no UC001');
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-07 09:40:00-05', '2032-06-07 10:00:00-05', 'administrativo') $q$,
  'un hueco libre de la plantilla se acepta');

-- Solo el administrativo y el paciente crean citas: los demás reciben el error de permiso, no «horario no disponible».
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-07 10:20:00-05', '2032-06-07 10:40:00-05', 'administrativo') $q$,
  '42501', 'No tiene permiso para reservar citas', 'el médico recibe 42501 aunque el hueco sea válido');
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-07 10:20:00-05', '2032-06-07 10:40:00-05', 'administrativo') $q$,
  '42501', null, 'la enfermera, igual');
select tests.autenticar_como('sin_rol');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_b'), '2032-06-07 10:20:00-05', '2032-06-07 10:40:00-05', 'administrativo') $q$,
  '42501', null, 'una sesión sin rol, igual');

-- El paciente inserta con la política de H2 (a su nombre, por el portal, a futuro); el disparador añade la agenda.
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p1'), (select id from e where clave = 'm_b'), '2032-06-07 10:10:00-05', '2032-06-07 10:30:00-05', 'portal') $q$,
  'UC001', null, 'el paciente tampoco inserta una hora fuera de la plantilla');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p1'), (select id from e where clave = 'm_b'), '2032-06-06 09:00:00-05', '2032-06-06 09:20:00-05', 'portal') $q$,
  'UC001', null, 'ni en un día sin plantilla');
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'p1'), (select id from e where clave = 'm_b'), '2032-06-11 09:00:00-05', '2032-06-11 09:20:00-05', 'portal') $q$,
  'pero sí un hueco libre, a su nombre');
select tests.volver_a_dueno();

-- El dueño de la base inserta sin pasar por el disparador (siembra de demostración, carga histórica de H8).
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado)
      values ((select id from e where clave = 'p3'), (select id from e where clave = 'm_x'), '2020-01-06 09:10:00-05', '2020-01-06 09:25:00-05', 'administrativo', 'atendida') $q$,
  'el dueño inserta una cita histórica fuera de la agenda');

-- ---- Forma ----
select ok(
  (select bool_and(not p.prosecdef and p.proconfig = array['search_path=""'])
     from pg_proc p where p.oid in ('public.proteger_columnas_cita()'::regprocedure, 'public.validar_horario_cita()'::regprocedure)),
  'ambos disparadores son SECURITY INVOKER con search_path vacío'
);
select ok(
  not has_function_privilege('authenticated', 'public.proteger_columnas_cita()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.validar_horario_cita()', 'EXECUTE')
  and not has_function_privilege('public', 'public.proteger_columnas_cita()', 'EXECUTE')
  and not has_function_privilege('public', 'public.validar_horario_cita()', 'EXECUTE'),
  'nadie ejecuta las funciones de disparador directamente'
);
select is(
  (select pg_get_triggerdef(t.oid) like '%BEFORE UPDATE ON public.citas FOR EACH ROW%' from pg_trigger t where t.tgname = 'citas_proteger_columnas'),
  true, 'citas_proteger_columnas es BEFORE UPDATE de cualquier columna'
);
select is(
  (select pg_get_triggerdef(t.oid) like '%BEFORE INSERT ON public.citas FOR EACH ROW%' from pg_trigger t where t.tgname = 'citas_validar_horario'),
  true, 'citas_validar_horario es BEFORE INSERT'
);

select * from finish();
