-- H3, tarea 3.2 (agenda-y-reserva): cálculo de slots. Spec: disponibilidad-y-slots («Los horarios libres se calculan en
-- consulta» y «El cálculo de horarios no expone datos de otras citas ni los motivos de ausencias»).
select plan(47);

-- Datos de prueba (dueño). Fecha de referencia: lunes 7/6/2032 (día de la semana 1) en Lima.
insert into public.especialidades (nombre) values ('Esp slots');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos, activo) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin', true),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A', true),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B', true),
  ('user_test_slots_c', 'medico', 'Mateo', 'C', true),
  ('user_test_slots_x', 'medico', 'Manuel', 'X', true),
  ('user_test_slots_t', 'medico', 'Marcos', 'T', true),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A', true),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B', true);
insert into public.medicos (perfil_id, cmp, especialidad_id, activo)
  select id, 'CMP-SL-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp slots'),
         clerk_user_id <> 'user_test_slots_x'
  from public.perfiles
  where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'), 'user_test_slots_c', 'user_test_slots_x', 'user_test_slots_t');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '74350001', 'Paula', 'A', '1990-01-01', 'F', 'sl-pa@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))),
         ('DNI', '74350002', 'Pablo', 'B', '1991-01-01', 'M', 'sl-pb@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_b')));
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_b')
  union all select 'm_c', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_slots_c'
  union all select 'm_x', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_slots_x'
  union all select 'm_t', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_slots_t'
  union all select 'pb', id from public.pacientes where numero_documento = '74350002';

-- m_a: lunes 08:00-10:00 con slots de 20 minutos, vigente solo durante 2032.
-- m_b: lunes 08:00-09:50 (no es múltiplo de 20). m_c: lunes 18:00-20:00 (cruza la medianoche UTC).
-- m_x: igual que m_a pero dado de baja. m_t: todos los días de hoy, de 00:00 a 24:00 en slots de 60 minutos.
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde, vigente_hasta) values
  ((select id from e where clave = 'm_a'), 1, '08:00', '10:00', 20, '2032-01-01', '2032-12-31'),
  ((select id from e where clave = 'm_b'), 1, '08:00', '09:50', 20, '2032-01-01', null),
  ((select id from e where clave = 'm_c'), 1, '18:00', '20:00', 20, '2032-01-01', null),
  ((select id from e where clave = 'm_x'), 1, '08:00', '10:00', 20, '2032-01-01', null);
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min)
  values ((select id from e where clave = 'm_t'),
          extract(dow from public.hoy_lima())::int, '00:00', '24:00', 60);

-- Lista legible de los slots libres (HH:MI en Lima) para un médico y una fecha, vista por quien esté autenticado.
create function pg_temp.horas(p_medico text, p_fecha date) returns text[] language sql as $$
  select coalesce(array_agg(to_char(s.inicio at time zone 'America/Lima', 'HH24:MI') order by s.inicio), '{}')
  from public.slots_disponibles((select id from e where clave = p_medico), p_fecha) s
$$;
grant execute on function pg_temp.horas(text, date) to public;

-- ---- Cálculo básico (administrativo) ----
select tests.autenticar_como('administrativo');

select is(pg_temp.horas('m_a', '2032-06-07'), array['08:00', '08:20', '08:40', '09:00', '09:20', '09:40'],
  'un tramo de 08:00 a 10:00 con slots de 20 minutos da seis slots');
select is(pg_temp.horas('m_b', '2032-06-07'), array['08:00', '08:20', '08:40', '09:00', '09:20'],
  'un tramo de 08:00 a 09:50 no ofrece un slot que termine después: el último empieza a las 09:20');
select ok(
  (select max(s.fin) <= '2032-06-07 09:50:00-05'::timestamptz from public.slots_disponibles((select id from e where clave = 'm_b'), '2032-06-07') s),
  'ningún slot de ese tramo termina después de las 09:50'
);
select is(pg_temp.horas('m_a', '2032-06-08'), '{}'::text[], 'un martes sin disponibilidad no ofrece slots');
select is(pg_temp.horas('m_a', '2031-06-09'), '{}'::text[], 'un lunes anterior al inicio de la vigencia no ofrece slots');
select is(pg_temp.horas('m_a', '2033-06-06'), '{}'::text[], 'un lunes posterior al fin de la vigencia no ofrece slots');
select is(pg_temp.horas('m_x', '2032-06-07'), '{}'::text[], 'un médico dado de baja no ofrece ningún slot aunque tenga disponibilidad');

-- ---- Frontera con UTC: tramo 18:00-20:00 de Lima (23:00Z a 01:00Z del día siguiente) ----
set local timezone = 'UTC';
select is(pg_temp.horas('m_c', '2032-06-07'), array['18:00', '18:20', '18:40', '19:00', '19:20', '19:40'],
  'el tramo vespertino da sus seis slots con la sesión en UTC');
select is(
  (select min(s.inicio) from public.slots_disponibles((select id from e where clave = 'm_c'), '2032-06-07') s),
  '2032-06-07 23:00:00+00'::timestamptz, 'el primer slot es 23:00Z del lunes de Lima'
);
set local timezone = 'Asia/Tokyo';
select is(pg_temp.horas('m_c', '2032-06-07'), array['18:00', '18:20', '18:40', '19:00', '19:20', '19:40'],
  'el mismo resultado con la sesión en Asia/Tokyo');
select is(
  (select max(s.fin) from public.slots_disponibles((select id from e where clave = 'm_c'), '2032-06-07') s),
  '2032-06-08 01:00:00+00'::timestamptz, 'el último slot termina a la 01:00Z del martes en UTC, que sigue siendo lunes en Lima'
);
select is(pg_temp.horas('m_c', '2032-06-08'), '{}'::text[], 'la fecha de Lima del martes no recibe los slots del lunes');
set local timezone = 'UTC';

-- ---- Los slots pasados no se ofrecen (m_t atiende hoy las 24 horas) ----
select is_empty(
  $q$ select 1 from public.slots_disponibles((select id from e where clave = 'm_t'), public.hoy_lima()) s where s.inicio <= now() $q$,
  'hoy no se ofrece ningún slot que empiece ahora o antes'
);
select is(
  (select count(*)::int from public.slots_disponibles((select id from e where clave = 'm_t'), public.hoy_lima())),
  (select count(*)::int from generate_series(0, 23) h
    where ((public.hoy_lima() + make_interval(hours => h)) at time zone 'America/Lima') > now()),
  'hoy se ofrecen exactamente los slots horarios que todavía no empezaron'
);

-- ---- Una cita vigente oculta su slot y una cancelada lo libera ----
select tests.volver_a_dueno();
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen) values
  ('00000000-0000-4000-8000-000000003501', (select id from e where clave = 'pb'), (select id from e where clave = 'm_a'),
   '2032-06-07 08:20:00-05', '2032-06-07 08:40:00-05', 'administrativo');
select tests.autenticar_como('administrativo');
select is(pg_temp.horas('m_a', '2032-06-07'), array['08:00', '08:40', '09:00', '09:20', '09:40'],
  'mientras la cita de 08:20 está reservada, ese slot no se ofrece');
select ok(public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:20:00-05', '2032-06-07 08:40:00-05'),
  'horario_en_agenda ignora las citas: el slot ocupado sigue siendo un horario válido de la agenda');

-- El paciente A consulta un slot ocupado por la cita del paciente B.
select tests.autenticar_como('paciente_a');
select is(pg_temp.horas('m_a', '2032-06-07'), array['08:00', '08:40', '09:00', '09:20', '09:40'],
  'un paciente no ve como libre un horario ocupado por la cita de otro paciente');
select is_empty(
  $q$ select 1 from public.citas where medico_id = (select id from e where clave = 'm_a') $q$,
  'y no puede leer esa cita directamente (cero filas)'
);

select tests.volver_a_dueno();
update public.citas set estado = 'cancelada' where id = '00000000-0000-4000-8000-000000003501';
select tests.autenticar_como('administrativo');
select is(pg_temp.horas('m_a', '2032-06-07'), array['08:00', '08:20', '08:40', '09:00', '09:20', '09:40'],
  'tras cancelar la cita, el slot de 08:20 vuelve a ofrecerse');

-- ---- Un bloqueo oculta los slots que toca, aunque solo cubra parte de alguno ----
select lives_ok(
  $q$ insert into public.bloqueos_agenda (id, medico_id, rango, motivo)
      values ('00000000-0000-4000-8000-000000003502', (select id from e where clave = 'm_a'),
              tstzrange('2032-06-07 08:30:00-05', '2032-06-07 09:10:00-05'), 'Licencia de prueba') $q$,
  'el administrativo crea un bloqueo de 08:30 a 09:10'
);
select is(pg_temp.horas('m_a', '2032-06-07'), array['08:00', '09:20', '09:40'],
  'se ocultan 08:20, 08:40 y 09:00 y el cambio se ve en la siguiente consulta, sin resincronizar');
select ok(
  not public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:40:00-05', '2032-06-07 09:00:00-05'),
  'un horario dentro del bloqueo no está en la agenda'
);
select ok(
  public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05'),
  'un slot exacto fuera del bloqueo sí está en la agenda'
);

-- El paciente consulta los slots (ve los libres) y luego los bloqueos directamente (cero filas).
select tests.autenticar_como('paciente_a');
select is(pg_temp.horas('m_a', '2032-06-07'), array['08:00', '09:20', '09:40'],
  'el paciente ve los horarios libres que quedan con el bloqueo');
select is_empty(
  $q$ select 1 from public.bloqueos_agenda where medico_id = (select id from e where clave = 'm_a') $q$,
  'pero no puede leer los bloqueos directamente (cero filas)'
);

-- ---- Médico, enfermera y sesión sin rol obtienen vacío ----
select tests.autenticar_como('medico_a');
select is(pg_temp.horas('m_a', '2032-06-07'), '{}'::text[], 'el médico (incluso el dueño de la agenda) recibe vacío');
select ok(not public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05'),
  'y horario_en_agenda le responde falso');
select tests.autenticar_como('enfermera');
select is(pg_temp.horas('m_a', '2032-06-07'), '{}'::text[], 'la enfermera recibe vacío');
select ok(not public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05'),
  'y horario_en_agenda le responde falso');
select tests.autenticar_como('sin_rol');
select is(pg_temp.horas('m_a', '2032-06-07'), '{}'::text[], 'una sesión sin rol recibe vacío');
select ok(not public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05'),
  'y horario_en_agenda le responde falso');

-- ---- horario_en_agenda: malla exacta ----
select tests.volver_a_dueno();
delete from public.bloqueos_agenda where id = '00000000-0000-4000-8000-000000003502';
select tests.autenticar_como('administrativo');
select ok(
  public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 09:40:00-05', '2032-06-07 10:00:00-05'),
  'el último slot del tramo es un horario válido'
);
select ok(
  not public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:10:00-05', '2032-06-07 08:30:00-05'),
  'un horario fuera de la malla (08:10) no lo es'
);
select ok(
  not public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:00:00-05', '2032-06-07 08:40:00-05'),
  'una duración distinta a la del slot (40 minutos) no lo es'
);
select ok(
  not public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 10:00:00-05', '2032-06-07 10:20:00-05'),
  'un horario que empieza donde termina el tramo no lo es'
);
select ok(
  not public.horario_en_agenda((select id from e where clave = 'm_x'), '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05'),
  'un médico dado de baja no tiene horarios válidos'
);
select ok(
  public.horario_en_agenda((select id from e where clave = 'm_c'), '2032-06-07 18:00:00-05', '2032-06-07 18:20:00-05'),
  'el tramo vespertino se reconoce con la fecha de Lima'
);
set local timezone = 'Asia/Tokyo';
select ok(
  public.horario_en_agenda((select id from e where clave = 'm_c'), '2032-06-07 18:00:00-05', '2032-06-07 18:20:00-05'),
  'y también con la sesión en otra zona horaria'
);
set local timezone = 'UTC';
select tests.autenticar_como('paciente_a');
select ok(
  public.horario_en_agenda((select id from e where clave = 'm_a'), '2032-06-07 08:00:00-05', '2032-06-07 08:20:00-05'),
  'el paciente también puede comprobar un horario (es quien reserva por el portal)'
);

-- ---- Forma y privilegios de las funciones ----
select tests.volver_a_dueno();
select is(
  (select array_agg(a.nombre order by a.ord) from pg_proc p,
     unnest(p.proargnames, p.proargmodes) with ordinality as a(nombre, modo, ord)
    where p.oid = 'public.slots_disponibles(uuid,date)'::regprocedure and a.modo = 't'),
  array['inicio', 'fin'],
  'slots_disponibles devuelve solo inicio y fin'
);
select is(
  (select array_agg(a.nombre order by a.ord) from pg_proc p,
     unnest(p.proargnames, p.proargmodes) with ordinality as a(nombre, modo, ord)
    where p.oid = 'public.slots_agenda(uuid,date)'::regprocedure and a.modo = 't'),
  array['inicio', 'fin'],
  'slots_agenda tampoco devuelve nada más'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig = array['search_path=""'])
     from pg_proc p where p.oid in ('public.slots_agenda(uuid,date)'::regprocedure, 'public.slots_disponibles(uuid,date)'::regprocedure,
                                    'public.horario_en_agenda(uuid,timestamptz,timestamptz)'::regprocedure)),
  'las tres son SECURITY DEFINER con search_path vacío'
);
select ok(
  has_function_privilege('authenticated', 'public.slots_disponibles(uuid,date)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.horario_en_agenda(uuid,timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated ejecuta las dos funciones públicas'
);
select ok(
  not has_function_privilege('anonymous', 'public.slots_disponibles(uuid,date)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.horario_en_agenda(uuid,timestamptz,timestamptz)', 'EXECUTE')
  and not has_function_privilege('public', 'public.slots_disponibles(uuid,date)', 'EXECUTE'),
  'anonymous y public no ejecutan las funciones públicas'
);
select ok(
  not has_function_privilege('authenticated', 'public.slots_agenda(uuid,date)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.slots_agenda(uuid,date)', 'EXECUTE'),
  'slots_agenda (interna) no la ejecuta ningún rol de usuario'
);
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select * from public.slots_agenda((select id from e where clave = 'm_a'), '2032-06-07') $q$,
  '42501', null, 'el administrativo no puede llamar a slots_agenda directamente'
);
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ select * from public.slots_agenda((select id from e where clave = 'm_a'), '2032-06-07') $q$,
  '42501', null, 'el paciente tampoco'
);

select * from finish();
