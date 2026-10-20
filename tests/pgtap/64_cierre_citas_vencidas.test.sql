-- H3, tarea 6.4 (4) (agenda-y-reserva): cerrar_citas_vencidas() cierra como «No asistió» las citas `reservada` cuya hora terminó.
-- Spec: gestion-de-citas («Una cita reservada que terminó sin confirmarse se cierra sola como «No asistió»»).
select plan(16);

-- Datos de prueba (dueño). Seis citas del médico A (horas relativas a now(): la transacción de la prueba lo fija):
--   01 reservada que terminó hace horas (se cierra)      02 reservada en curso (no)        03 reservada futura (no)
--   04 confirmada que terminó (no: la cierra otra vía)   05 cancelada (no)                 06 atendida (no)
-- La 07 (reservada que terminó, del paciente D, que el médico A solo ve por esa cita) se inserta en la segunda parte.
insert into public.especialidades (nombre) values ('Esp cierre');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-CV-' || right(clerk_user_id, 3), (select id from public.especialidades where nombre = 'Esp cierre')
  from public.perfiles where clerk_user_id = tests.sub('medico_a');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id)
  values ('DNI', '74640001', 'Paula', 'A', '1990-01-01', 'F', 'cv-pa@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a'))),
         ('DNI', '74640003', 'Pilar', 'C', '1992-01-01', 'F', 'cv-pc@demo.invalid', null),
         ('DNI', '74640004', 'Pedro', 'D', '1993-01-01', 'M', 'cv-pd@demo.invalid', null);
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'pa', id from public.pacientes where numero_documento = '74640001'
  union all select 'pc', id from public.pacientes where numero_documento = '74640003'
  union all select 'pd', id from public.pacientes where numero_documento = '74640004';
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  ('00000000-0000-4000-8000-000000006401', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() - interval '3 hours', now() - interval '2 hours 40 minutes', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006402', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() - interval '10 minutes', now() + interval '10 minutes', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006403', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() + interval '2 days', now() + interval '2 days 20 minutes', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000006404', (select id from e where clave = 'pc'), (select id from e where clave = 'm_a'), now() - interval '8 hours', now() - interval '7 hours 40 minutes', 'administrativo', 'confirmada'),
  ('00000000-0000-4000-8000-000000006405', (select id from e where clave = 'pc'), (select id from e where clave = 'm_a'), now() - interval '9 hours', now() - interval '8 hours 40 minutes', 'administrativo', 'cancelada'),
  ('00000000-0000-4000-8000-000000006406', (select id from e where clave = 'pc'), (select id from e where clave = 'm_a'), now() - interval '10 hours', now() - interval '9 hours 40 minutes', 'administrativo', 'atendida');
create temp table antes as
  select id, paciente_id, medico_id, inicio, fin, origen from public.citas where id::text like '00000000-0000-4000-8000-0000000064%';

create function pg_temp.estados() returns text[] language sql as $$
  select array_agg(c.estado::text order by c.id) from public.citas c where c.id::text like '00000000-0000-4000-8000-0000000064%'
$$;
grant execute on function pg_temp.estados() to public;
create function pg_temp.pacientes_visibles(p_id uuid) returns int language sql as $$
  select count(*)::int from public.pacientes where id = p_id
$$;
grant execute on function pg_temp.pacientes_visibles(uuid) to public;

-- ---- Primera parte: el cierre, sin sesión de usuario (como lo invocará el cron) ----
-- Va antes de cualquier tests.autenticar_como: tests.volver_a_dueno() conserva la identidad de la sesión y la auditoría la
-- tomaría como actor.
create temp table esperadas as
  select count(*)::int as n from public.citas where estado = 'reservada' and fin <= now();
select is(public.cerrar_citas_vencidas(), (select n from esperadas),
  'devuelve cuántas citas cerró: todas las reservadas que ya terminaron, de la base completa');
select is(pg_temp.estados(),
  array['no_asistio', 'reservada', 'reservada', 'confirmada', 'cancelada', 'atendida'],
  'cierra la reservada que terminó (01); deja la en curso, la futura, la confirmada, la cancelada y la atendida');
select is(public.cerrar_citas_vencidas(), 0, 'es idempotente: una segunda llamada no encuentra nada que cerrar');
select is_empty(
  $q$ select a.id from antes a join public.citas c using (id)
      where (a.paciente_id, a.medico_id, a.inicio, a.fin, a.origen) is distinct from (c.paciente_id, c.medico_id, c.inicio, c.fin, c.origen) $q$,
  'solo cambia el estado: paciente, médico, horas y origen quedan igual'
);
select is(
  (select count(*)::int from public.auditoria
    where tabla = 'citas' and accion = 'UPDATE' and registro_id = '00000000-0000-4000-8000-000000006401'
      and actor_id is null and datos_antes ->> 'estado' = 'reservada' and datos_despues ->> 'estado' = 'no_asistio'),
  1, 'queda auditado, con el sistema como actor (actor nulo)'
);

-- ---- Segunda parte: la consecuencia de acceso. El médico A lee al paciente D solo por una reservada que ya terminó ----
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  ('00000000-0000-4000-8000-000000006407', (select id from e where clave = 'pd'), (select id from e where clave = 'm_a'), now() - interval '5 hours', now() - interval '4 hours 40 minutes', 'portal', 'reservada');
select tests.autenticar_como('medico_a');
select is(pg_temp.pacientes_visibles((select id from e where clave = 'pd')), 1,
  'antes del cierre, el médico A lee al paciente D por la cita reservada vencida (la política cuenta reservada y confirmada)');
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ update public.citas set estado = 'no_asistio' where id = '00000000-0000-4000-8000-000000006407' $q$,
  'UC004', 'Esa transición de estado no está permitida',
  'el administrativo no puede cerrar a mano una reservada como «No asistió»: la única vía es la función del sistema'
);
select tests.volver_a_dueno();
create temp table esperadas_2 as
  select count(*)::int as n from public.citas where estado = 'reservada' and fin <= now();
select is(public.cerrar_citas_vencidas(), (select n from esperadas_2),
  'la función cierra la cita 07 (la primera llamada ya cerró el resto)');
select is((select estado::text from public.citas where id = '00000000-0000-4000-8000-000000006407'), 'no_asistio',
  'la cita 07 quedó «No asistió»');
select tests.autenticar_como('medico_a');
select is(pg_temp.pacientes_visibles((select id from e where clave = 'pd')), 0,
  'después del cierre, el médico A ya no lee al paciente D (su única cita pasó a «No asistió» y no hay asignación)');
select is(pg_temp.pacientes_visibles((select id from e where clave = 'pa')), 1,
  'control: sigue leyendo a la paciente A, que conserva citas reservadas vigentes (en curso y futura)');

-- ---- Nadie de la aplicación la ejecuta ----
select tests.autenticar_como('administrativo');
select throws_ok($q$ select public.cerrar_citas_vencidas() $q$, '42501', null, 'el administrativo no puede ejecutarla');
select tests.autenticar_como('medico_a');
select throws_ok($q$ select public.cerrar_citas_vencidas() $q$, '42501', null, 'el médico no puede ejecutarla');
select tests.autenticar_como('paciente_a');
select throws_ok($q$ select public.cerrar_citas_vencidas() $q$, '42501', null, 'el paciente no puede ejecutarla');

select tests.volver_a_dueno();
select ok(
  not has_function_privilege('public', 'public.cerrar_citas_vencidas()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.cerrar_citas_vencidas()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.cerrar_citas_vencidas()', 'EXECUTE'),
  'public, anonymous y authenticated no tienen EXECUTE (el cron de H5 recibirá el suyo en su propia migración)'
);
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.cerrar_citas_vencidas()'::regprocedure),
  'es SECURITY DEFINER con search_path vacío'
);

select * from finish();
