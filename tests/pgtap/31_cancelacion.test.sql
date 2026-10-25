-- Agenda y citas (H2, tarea 5.3): ventana de cancelación de 1 hora y su excepción por baja médica.
-- Spec: integridad-de-agenda. Las políticas reales de citas se prueban en 5.4; aquí, para ejercer el
-- disparador con roles, se conceden permisos y políticas TEMPORALES dentro de la transacción de prueba
-- (la política de cancelación del paciente llegó con el portal, H4: ver 71_portal_cancelacion).
select plan(16);

-- Datos de prueba (dueño). Todo es relativo a now(), que es fijo dentro de la transacción: el límite de
-- exactamente 1 hora es determinista.
insert into public.especialidades (nombre) values ('Esp cancelacion');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  ('user_test_c_m1', 'medico', 'M', '1'), ('user_test_c_m2', 'medico', 'M', '2'),
  ('user_test_c_m3', 'medico', 'M', '3'), ('user_test_c_m4', 'medico', 'M', '4'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-C-' || right(clerk_user_id, 2), (select id from public.especialidades where nombre = 'Esp cancelacion')
  from public.perfiles where clerk_user_id like 'user_test_c_m%';
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  select 'DNI', '7400000' || n, 'Paciente', 'Num' || n, '1990-01-01', 'F', 'p' || n || '@demo.invalid', null
  from generate_series(1, 5) n;
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '74000006', 'Paula', 'A', '1992-02-02', 'F', 'pa@demo.invalid',
          (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')));

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm' || right(cmp, 1), id from public.medicos where cmp like 'CMP-C-m%'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7400000%'
  union all select 'perfil_pa', id from public.perfiles where clerk_user_id = tests.sub('paciente_a');
-- Los médicos se llaman CMP-C-m1..m4 y los pacientes 74000001..74000006 (p6 es paciente_a).

create function pg_temp.nueva_cita(p_clave text, p_pac text, p_med text, p_desde interval) returns void
language plpgsql as $f$
declare v_id uuid := gen_random_uuid();
begin
  insert into e values (p_clave, v_id);
  insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen)
  values (v_id, (select id from e where clave = p_pac), (select id from e where clave = p_med),
          now() + p_desde, now() + p_desde + interval '20 minutes', 'administrativo');
end
$f$;
select pg_temp.nueva_cita('c_ok',     'p1', 'm1', interval '120 minutes');
select pg_temp.nueva_cita('c_late',   'p2', 'm1', interval '30 minutes');
select pg_temp.nueva_cita('c_limite', 'p3', 'm1', interval '60 minutes');
select pg_temp.nueva_cita('c_59',     'p4', 'm2', interval '59 minutes');
select pg_temp.nueva_cita('c_pasada', 'p5', 'm2', interval '-60 minutes');
select pg_temp.nueva_cita('c_baja',   'p1', 'm2', interval '15 minutes');
select pg_temp.nueva_cita('pa_tarde', 'p6', 'm3', interval '30 minutes');
select pg_temp.nueva_cita('pa_ok',    'p6', 'm3', interval '180 minutes');
select pg_temp.nueva_cita('pa_baja',  'p6', 'm4', interval '5 minutes');

-- Bloqueos: el del médico 2 alcanza solo a c_baja; el del médico 4 alcanza a pa_baja.
insert into public.bloqueos_agenda (medico_id, rango, motivo) values
  ((select id from e where clave = 'm2'), tstzrange(now() + interval '10 minutes', now() + interval '40 minutes'), 'emergencia'),
  ((select id from e where clave = 'm4'), tstzrange(now(), now() + interval '30 minutes'), 'licencia');

-- ---- Cancelación como dueño (sin identidad): la regla vive en la base, no en el rol ----
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'c_ok') $q$,
  'cancelar con más de 1 hora de anticipación se acepta'
);
select ok(
  (select cancelada_en is not null and cancelada_por is null from public.citas where id = (select id from e where clave = 'c_ok')),
  'la cancelación registra cancelada_en (y cancelada_por queda nulo sin identidad)'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'c_late') $q$,
  'P0001', 'No es posible cancelar con menos de 1 hora de anticipación',
  'cancelar con 30 minutos se rechaza (el bloqueo de OTRO médico no habilita la excepción)'
);
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'c_limite') $q$,
  'cancelar exactamente 1 hora antes se acepta (la regla es «menos de 1 hora»)'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'c_59') $q$,
  'P0001', 'No es posible cancelar con menos de 1 hora de anticipación',
  'cancelar con 59 minutos se rechaza'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'c_pasada') $q$,
  'P0001', 'No es posible cancelar con menos de 1 hora de anticipación',
  'una cita que ya empezó no se puede cancelar'
);
select throws_ok(
  $q$ update public.citas set estado = 'cancelada', inicio = now() + interval '30 days', fin = now() + interval '30 days 20 minutes'
      where id = (select id from e where clave = 'c_late') $q$,
  'P0001', 'No es posible cancelar con menos de 1 hora de anticipación',
  'cancelar y mover la cita al futuro en el mismo UPDATE no esquiva la ventana (se mide contra OLD.inicio)'
);
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'c_baja') $q$,
  'un bloqueo del MISMO médico que alcanza la cita habilita la cancelación dentro de la hora (baja médica)'
);
select lives_ok(
  $q$ update public.citas set motivo = 'cambio de motivo' where id = (select id from e where clave = 'c_late') $q$,
  'un UPDATE que no cancela no está sujeto a la ventana'
);

-- ---- Con un paciente: permisos y políticas temporales que simulan el flujo del portal (H4) ----
grant select, update on public.citas to authenticated;
create policy t_paciente_sus_citas on public.citas
  for all to authenticated
  using (paciente_id = (select public.paciente_actual())) with check (paciente_id = (select public.paciente_actual()));

select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'pa_tarde') $q$,
  'P0001', 'No es posible cancelar con menos de 1 hora de anticipación',
  'un paciente no cancela dentro de la hora previa'
);
select is_empty(
  $q$ select 1 from public.bloqueos_agenda $q$,
  'el paciente no ve los bloqueos de agenda'
);
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'pa_baja') $q$,
  'el paciente cancela dentro de la hora si hay un bloqueo que no puede ver: la excepción depende de los datos, no del rol'
);
select lives_ok(
  $q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'pa_ok') $q$,
  'el paciente cancela con más de 1 hora de anticipación'
);
select tests.volver_a_dueno();
select is(
  (select cancelada_por from public.citas where id = (select id from e where clave = 'pa_ok')),
  (select id from e where clave = 'perfil_pa'),
  'cancelada_por registra el perfil de quien canceló'
);

-- ---- Definición ----
select has_trigger('public', 'citas', 'citas_validar_cancelacion', 'citas tiene el disparador de la ventana de cancelación');
select ok(
  (select prosecdef from pg_proc where oid = 'public.validar_cancelacion()'::regprocedure),
  'validar_cancelacion() es SECURITY DEFINER (la excepción no depende de la RLS de quien cancela)'
);

select * from finish();
