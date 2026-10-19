-- H3, tarea 6.2 (agenda-y-reserva): ciclo de estados de la cita. Spec: gestion-de-citas («Ciclo de estados de la cita»).
-- validar_transicion_estado() / citas_validar_transicion y marcar_cita_atendida(). Decisión del cliente: la recepción confirma
-- y marca «No asistió»; el médico marca «Atendida». Confirmar concede acceso a la historia (ADR-0016).
select plan(57);

-- Datos de prueba (dueño). Las horas relativas a now() son estables: now() es fijo dentro de la transacción.
insert into public.especialidades (nombre) values ('Esp transiciones');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-TR-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp transiciones')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  select 'DNI', '7461000' || n, 'Paciente', 'T' || n, '1990-01-01', 'F', 'tr' || n || '@demo.invalid',
         case n when 1 then (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))
                when 2 then (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b')) end
  from generate_series(1, 7) n;
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_b')
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7461000%'
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo')
  union all select 'perfil_ma', id from public.perfiles where clerk_user_id = tests.sub('medico_a');

-- Malla del médico A: todos los días de 08:00 a 11:00 en huecos de 20 minutos. Las pruebas de INSERT de abajo quieren llegar a
-- citas_validar_transicion (UC004) con una hora válida: desde H3 6.4, citas_validar_horario (UC001) corre antes y rechazaría
-- una hora fuera de la agenda.
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde, vigente_hasta)
  select (select id from e where clave = 'm_a'), d, '08:00', '11:00', 20, '2020-01-01', null from generate_series(0, 6) d;

-- Citas (dueño, sin restricciones del disparador). Identificadores fijos terminados en el número de la cita.
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  -- t1 reservada futura: la que se confirma
  ('00000000-0000-4000-8000-000000006101', (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'), '2032-06-07 09:00:00-05', '2032-06-07 09:20:00-05', 'portal', 'reservada'),
  -- t2 reservada que ya terminó (hace 2 h)
  ('00000000-0000-4000-8000-000000006102', (select id from e where clave = 'p2'), (select id from e where clave = 'm_a'), now() - interval '2 hours', now() - interval '100 minutes', 'portal', 'reservada'),
  -- t3 cancelada
  ('00000000-0000-4000-8000-000000006103', (select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), '2032-06-07 10:00:00-05', '2032-06-07 10:20:00-05', 'portal', 'cancelada'),
  -- t4 atendida (pasada), t5 no_asistio (pasada)
  ('00000000-0000-4000-8000-000000006104', (select id from e where clave = 'p4'), (select id from e where clave = 'm_a'), now() - interval '5 hours', now() - interval '280 minutes', 'portal', 'atendida'),
  ('00000000-0000-4000-8000-000000006105', (select id from e where clave = 'p5'), (select id from e where clave = 'm_a'), now() - interval '7 hours', now() - interval '400 minutes', 'portal', 'no_asistio'),
  -- t6 confirmada que ya empezó pero no terminó: «No asistió»
  ('00000000-0000-4000-8000-000000006106', (select id from e where clave = 'p6'), (select id from e where clave = 'm_a'), now() - interval '30 minutes', now() - interval '10 minutes', 'portal', 'confirmada'),
  -- t7 confirmada que ya empezó: «Atendida» por su médico
  ('00000000-0000-4000-8000-000000006107', (select id from e where clave = 'p7'), (select id from e where clave = 'm_a'), now() - interval '3 hours', now() - interval '160 minutes', 'portal', 'confirmada'),
  -- t8 confirmada futura; t9 reservada futura
  ('00000000-0000-4000-8000-000000006108', (select id from e where clave = 'p3'), (select id from e where clave = 'm_a'), '2032-06-08 09:00:00-05', '2032-06-08 09:20:00-05', 'portal', 'confirmada'),
  ('00000000-0000-4000-8000-000000006109', (select id from e where clave = 'p4'), (select id from e where clave = 'm_a'), '2032-06-08 10:00:00-05', '2032-06-08 10:20:00-05', 'portal', 'reservada'),
  -- t10 reservada futura de la paciente A (para el intento con una política temporal)
  ('00000000-0000-4000-8000-000000006110', (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'), '2032-06-09 09:00:00-05', '2032-06-09 09:20:00-05', 'portal', 'reservada'),
  -- t11 confirmada que ya empezó, del médico B
  ('00000000-0000-4000-8000-000000006111', (select id from e where clave = 'p5'), (select id from e where clave = 'm_b'), now() - interval '2 hours', now() - interval '100 minutes', 'portal', 'confirmada');

-- La historia de la paciente 1 (t1): una atención firmada por el médico A. Antes de confirmar t1 el médico A no la ve.
insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
  values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
          (select id from e where clave = 'p1'), (select id from e where clave = 'm_a'),
          'TR motivo', 'a', 'b', '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'c', now());
create temp table antes as select id, to_jsonb(c) - 'estado' as resto from public.citas c where id = '00000000-0000-4000-8000-000000006107';
grant select on antes to public;

-- ---- El administrativo confirma ----
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'p1')), 0,
  'antes de confirmar, el médico NO ve las atenciones de la paciente (la cita solo está reservada)');
select tests.autenticar_como('administrativo');
select lives_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006101' $q$,
  'el administrativo confirma una cita futura reservada');
select tests.volver_a_dueno();
select is((select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:00000000-0000-4000-8000-000000006101' and medico_id = (select id from e where clave = 'm_a')), 1,
  'al confirmar queda la asignación vigente del ADR-0016');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'p1')), 1,
  'y desde la confirmación el médico dueño ve las atenciones de la paciente');
select tests.volver_a_dueno();
select is((select actor_rol::text || '/' || (actor_id = (select id from e where clave = 'perfil_admin'))::text from public.auditoria
            where tabla = 'citas' and accion = 'UPDATE' and registro_id = '00000000-0000-4000-8000-000000006101'),
  'administrativo/true', 'la auditoría registra la confirmación con el administrativo como actor');
select tests.autenticar_como('administrativo');
select lives_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006101' $q$,
  'confirmar una cita ya confirmada es idempotente');
select tests.volver_a_dueno();
select is((select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:00000000-0000-4000-8000-000000006101'), 1,
  'y no duplica la asignación');

-- ---- «No asistió» ----
select tests.autenticar_como('administrativo');
select lives_ok($q$ update public.citas set estado = 'no_asistio' where id = '00000000-0000-4000-8000-000000006106' $q$,
  'el administrativo marca «No asistió» una cita confirmada que ya empezó');
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000006106'), 'no_asistio', 'y queda no_asistio');

-- ---- El médico dueño marca «Atendida» ----
select tests.autenticar_como('medico_a');
select lives_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006107') $q$,
  'el médico dueño marca «Atendida» una cita confirmada que ya empezó');
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000006107'), 'atendida', 'y queda atendida');
select is((select to_jsonb(c) - 'estado' from public.citas c where c.id = '00000000-0000-4000-8000-000000006107'),
  (select resto from antes), 'la función solo cambió `estado`: el resto de las columnas es idéntico');
select is((select actor_rol::text || '/' || (actor_id = (select id from e where clave = 'perfil_ma'))::text from public.auditoria
            where tabla = 'citas' and accion = 'UPDATE' and registro_id = '00000000-0000-4000-8000-000000006107'),
  'medico/true', 'la auditoría muestra al médico (rol medico) como actor, no al dueño de la función');
select is((select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:00000000-0000-4000-8000-000000006107'), 1,
  'no se creó una asignación nueva: la cita ya estaba confirmada');

-- ---- El dueño de la base no está sujeto al disparador (migraciones, siembra, carga histórica) ----
select lives_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado)
      values ((select id from e where clave = 'p6'), (select id from e where clave = 'm_a'), '2020-01-06 09:00:00-05', '2020-01-06 09:20:00-05', 'administrativo', 'atendida') $q$,
  'el dueño inserta una cita histórica ya atendida');
select lives_ok($q$ update public.citas set estado = 'reservada' where id = '00000000-0000-4000-8000-000000006104' $q$,
  'y puede retroceder un estado (preparar datos): el disparador no actúa sobre el dueño');
update public.citas set estado = 'atendida' where id = '00000000-0000-4000-8000-000000006104';

-- ---- Negativos del administrativo ----
select tests.autenticar_como('administrativo');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006102' $q$,
  'UC004', null, 'confirmar una cita que ya terminó falla con UC004');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006103' $q$,
  'UC004', null, 'confirmar una cancelada falla con UC004');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006104' $q$,
  'UC004', null, 'confirmar una atendida falla con UC004');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006105' $q$,
  'UC004', null, 'confirmar una «no asistió» falla con UC004');
select throws_ok($q$ update public.citas set estado = 'no_asistio' where id = '00000000-0000-4000-8000-000000006108' $q$,
  'UC004', null, '«No asistió» antes de la hora de la cita falla con UC004');
select throws_ok($q$ update public.citas set estado = 'no_asistio' where id = '00000000-0000-4000-8000-000000006109' $q$,
  'UC004', null, '«No asistió» sobre una reservada falla con UC004');
select throws_ok($q$ update public.citas set estado = 'no_asistio' where id = '00000000-0000-4000-8000-000000006104' $q$,
  'UC004', null, '«No asistió» sobre una atendida falla con UC004');
select throws_ok($q$ update public.citas set estado = 'atendida' where id = '00000000-0000-4000-8000-000000006109' $q$,
  '42501', null, 'reservada -> atendida por UPDATE directo falla con 42501');
select throws_ok($q$ update public.citas set estado = 'atendida' where id = '00000000-0000-4000-8000-000000006108' $q$,
  '42501', null, 'el administrativo tampoco puede marcar «Atendida» una confirmada por UPDATE directo (42501)');
select throws_ok($q$ update public.citas set estado = 'reservada' where id = '00000000-0000-4000-8000-000000006108' $q$,
  'UC004', null, 'confirmada -> reservada falla con UC004');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006104' $q$,
  'UC004', null, 'cambiar un estado final (atendida -> confirmada) falla con UC004');
select throws_ok($q$ update public.citas set estado = 'reservada' where id = '00000000-0000-4000-8000-000000006103' $q$,
  'UC004', null, 'reabrir una cancelada falla con UC004');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado)
      values ((select id from e where clave = 'p6'), (select id from e where clave = 'm_a'), '2032-06-10 09:00:00-05', '2032-06-10 09:20:00-05', 'administrativo', 'confirmada') $q$,
  'UC004', null, 'insertar una cita ya confirmada falla con UC004 (no se concede acceso saltándose la confirmación)');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado)
      values ((select id from e where clave = 'p6'), (select id from e where clave = 'm_a'), '2032-06-10 09:00:00-05', '2032-06-10 09:20:00-05', 'administrativo', 'atendida') $q$,
  'UC004', null, 'y una ya atendida también');
select lives_ok($q$ update public.citas set estado = 'cancelada' where id = '00000000-0000-4000-8000-000000006109' $q$,
  'cancelar una reservada futura sigue permitido (la ventana la valida validar_cancelacion)');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006107') $q$,
  '42501', null, 'el administrativo tampoco puede marcar «Atendida» con la función (42501)');

-- Un mismo UPDATE no puede mover la cita y confirmarla. Dos barreras: desde H3 6.4 citas_proteger_columnas rechaza (42501) todo
-- UPDATE que toque algo más que el estado, y llega primero; si no existiera, las condiciones de tiempo de
-- validar_transicion_estado() miran los valores ANTERIORES (old.fin) y darían UC004. 62 prueba la primera barrera por separado.
select throws_ok(
  $q$ update public.citas set estado = 'confirmada', fin = now() + interval '1 hour' where id = '00000000-0000-4000-8000-000000006102' $q$,
  '42501', null, 'no se confirma una cita terminada alargando su fin en el mismo UPDATE (42501: la cita no se edita)');
select tests.volver_a_dueno();
alter table public.citas disable trigger citas_proteger_columnas;
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ update public.citas set estado = 'confirmada', fin = now() + interval '1 hour' where id = '00000000-0000-4000-8000-000000006102' $q$,
  'UC004', null, 'y sin esa barrera, las condiciones miran old.fin y también lo rechazan (UC004)');
select tests.volver_a_dueno();
alter table public.citas enable trigger citas_proteger_columnas;
select tests.autenticar_como('administrativo');

-- ---- Negativos de la función marcar_cita_atendida ----
select tests.autenticar_como('medico_b');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006107') $q$,
  'UC002', null, 'otro médico recibe UC002 sobre una cita ajena...');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-0000000061ff') $q$,
  'UC002', null, '...igual que sobre una cita inexistente: no revela de quién es');
select tests.autenticar_como('medico_a');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006109') $q$,
  'UC004', null, 'una cita cancelada (antes reservada) no se puede marcar atendida (UC004)');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006110') $q$,
  'UC004', null, 'una cita solo reservada no se puede marcar atendida (UC004)');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006108') $q$,
  'UC004', null, 'una confirmada futura, antes de su hora, tampoco (UC004)');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006107') $q$,
  'UC004', null, 'ni una que ya está atendida (UC004)');
select lives_ok($q$ update public.citas set estado = 'atendida' where id = '00000000-0000-4000-8000-000000006106' $q$,
  'el UPDATE directo del médico dueño no falla...');
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000006106'), 'no_asistio',
  '...pero no cambia ninguna fila: el médico no tiene política de UPDATE sobre citas');

-- Enfermera, paciente y sesión sin rol: 42501 en la función y nada cambia con UPDATE directo.
select tests.autenticar_como('enfermera');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006107') $q$, '42501', null, 'la enfermera recibe 42501 en la función');
select tests.autenticar_como('paciente_a');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006107') $q$, '42501', null, 'el paciente recibe 42501 en la función');
select tests.autenticar_como('sin_rol');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006107') $q$, '42501', null, 'una sesión sin rol recibe 42501 en la función');

-- UPDATE directo aun con una política temporal que lo permita: el disparador es la segunda barrera.
select tests.volver_a_dueno();
create policy tmp_permite_actualizar on public.citas for update to authenticated using (true) with check (true);
select tests.autenticar_como('paciente_a');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006110' $q$,
  '42501', null, 'el paciente NO se confirma su cita aunque una política temporal le deje actualizar (42501)');
select throws_ok($q$ update public.citas set estado = 'atendida' where id = '00000000-0000-4000-8000-000000006110' $q$,
  '42501', null, 'ni la marca atendida (42501)');
select tests.autenticar_como('enfermera');
select lives_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006110' $q$,
  'la enfermera puede intentarlo: no ve citas, así que no toca ninguna fila');
select tests.autenticar_como('sin_rol');
select lives_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006110' $q$,
  'una sesión sin rol, igual');
select tests.autenticar_como('medico_a');
select throws_ok($q$ update public.citas set estado = 'confirmada' where id = '00000000-0000-4000-8000-000000006110' $q$,
  '42501', null, 'el médico NO confirma aunque la política temporal le deje actualizar (solo la recepción confirma, 42501)');
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000006110'), 'reservada',
  'tras todos esos intentos la cita sigue reservada');
drop policy tmp_permite_actualizar on public.citas;

-- Un médico dado de baja no puede marcar «Atendida».
update public.medicos set activo = false where id = (select id from e where clave = 'm_b');
select tests.autenticar_como('medico_b');
select throws_ok($q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000006111') $q$,
  '42501', null, 'un médico con activo = false recibe 42501');
select tests.volver_a_dueno();
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000006111'), 'confirmada', 'y su cita no cambió');

-- ---- Forma ----
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.marcar_cita_atendida(uuid)'::regprocedure)
  and (select not p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.validar_transicion_estado()'::regprocedure),
  'marcar_cita_atendida es SECURITY DEFINER y el disparador SECURITY INVOKER, ambas con search_path vacío'
);
select ok(
  has_function_privilege('authenticated', 'public.marcar_cita_atendida(uuid)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.marcar_cita_atendida(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.marcar_cita_atendida(uuid)', 'EXECUTE'),
  'solo authenticated ejecuta marcar_cita_atendida'
);
select is(
  (select array_agg(tgname::text order by tgname::text) from pg_trigger
    where tgrelid = 'public.citas'::regclass and not tgisinternal and tgtype & 2 = 2),  -- BEFORE
  array['citas_proteger_columnas', 'citas_validar_cancelacion', 'citas_validar_horario', 'citas_validar_transicion'],
  'los disparadores BEFORE de citas, en orden alfabético: proteger_columnas, validar_cancelacion, validar_horario y validar_transicion'
);
select is(
  (select pg_get_triggerdef(t.oid) like '%BEFORE INSERT OR UPDATE OF estado ON public.citas%' from pg_trigger t where t.tgname = 'citas_validar_transicion'),
  true, 'el disparador es BEFORE INSERT OR UPDATE OF estado'
);

select * from finish();
