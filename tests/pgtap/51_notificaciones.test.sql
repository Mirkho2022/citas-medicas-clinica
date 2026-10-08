-- Notificaciones (H2, tarea 7.2): restricciones, política del administrativo y alcance mínimo del rol del cron.
-- Spec: aislamiento-por-rol-rls («Notificaciones visibles solo al administrativo, y cron con privilegio mínimo»).
select plan(26);

-- Para actuar como el proceso programado hace falta poder hacer SET ROLE cron_notificaciones; se concede
-- dentro de la transacción de prueba (se revierte).
grant cron_notificaciones to current_user with set true;

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp notificaciones');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_test_nt_m1', 'medico', 'Mario', 'N');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = 'user_test_nt_m1'), 'CMP-NT-0001',
          (select id from public.especialidades where nombre = 'Esp notificaciones'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  values ('DNI', '80000001', 'Paciente', 'N', '1990-01-01', 'F', 'nt@demo.invalid');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'cita', gen_random_uuid() union all
  select 'cita2', gen_random_uuid();
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen) values
  ((select id from e where clave = 'cita'),  (select id from public.pacientes where numero_documento = '80000001'), (select id from public.medicos where cmp = 'CMP-NT-0001'), '2032-03-01 09:00:00-05', '2032-03-01 09:20:00-05', 'portal'),
  ((select id from e where clave = 'cita2'), (select id from public.pacientes where numero_documento = '80000001'), (select id from public.medicos where cmp = 'CMP-NT-0001'), '2032-03-02 09:00:00-05', '2032-03-02 09:20:00-05', 'portal');
insert into public.notificaciones (cita_id, tipo, destinatario, programada_para, estado)
  values ((select id from e where clave = 'cita'), 'recordatorio_24h', 'nt@demo.invalid', '2032-02-29 09:00:00-05', 'fallida');

-- ---- Restricciones ----
select ok((select relrowsecurity from pg_class where oid = 'public.notificaciones'::regclass), 'notificaciones tiene RLS activada');
select is((select canal from public.notificaciones limit 1), 'email', 'el canal por defecto es email');
select throws_ok(
  $q$ insert into public.notificaciones (cita_id, tipo, destinatario, programada_para)
      values ((select id from e where clave = 'cita'), 'recordatorio_24h', 'otra@demo.invalid', now()) $q$,
  '23505', null, 'el mismo aviso (cita, tipo) no puede crearse dos veces: idempotencia'
);
select throws_ok(
  $q$ insert into public.notificaciones (cita_id, tipo, destinatario, programada_para)
      values ((select id from e where clave = 'cita'), 'spam', 'x@demo.invalid', now()) $q$,
  '23514', null, 'el tipo de notificación solo admite los valores definidos'
);

-- ---- Roles de usuario ----
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.notificaciones where cita_id in (select id from e)), 1, 'el administrativo ve las notificaciones (para revisar las fallidas)');
select throws_ok(
  $q$ insert into public.notificaciones (cita_id, tipo, destinatario, programada_para)
      values ((select id from e where clave = 'cita2'), 'cancelacion', 'x@demo.invalid', now()) $q$,
  '42501', null, 'ni el administrativo crea notificaciones: las crea el proceso programado'
);
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.notificaciones where cita_id in (select id from e)), 0, 'el paciente NO ve notificaciones');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.notificaciones where cita_id in (select id from e)), 0, 'el médico NO ve notificaciones');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.notificaciones where cita_id in (select id from e)), 0, 'la enfermera NO ve notificaciones');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.notificaciones where cita_id in (select id from e)), 0, 'una sesión sin rol NO ve notificaciones');
select tests.volver_a_dueno();

-- ---- Rol del cron: alcance mínimo ----
set local role cron_notificaciones;
select is((select count(*)::int from public.notificaciones where cita_id in (select id from e)), 1, 'el cron lee notificaciones');
select lives_ok(
  $q$ insert into public.notificaciones (cita_id, tipo, destinatario, programada_para)
      values ((select id from e where clave = 'cita2'), 'recordatorio_24h', 'nt@demo.invalid', '2032-03-01 09:00:00-05') $q$,
  'el cron crea notificaciones'
);
select lives_ok(
  $q$ update public.notificaciones set estado = 'enviada', intentos = intentos + 1, enviada_en = now(), proveedor_id = 'msg_1'
      where cita_id = (select id from e where clave = 'cita2') $q$,
  'el cron actualiza el estado de una notificación'
);
select is((select count(*)::int from public.citas where id in (select id from e)), 2, 'el cron lee citas');
select throws_ok($q$ delete from public.notificaciones where cita_id = (select id from e where clave = 'cita') $q$, '42501', null, 'el cron NO borra notificaciones');
select throws_ok($q$ update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'cita') $q$, '42501', null, 'el cron NO modifica citas');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      select paciente_id, medico_id, '2032-05-01 09:00:00-05', '2032-05-01 09:20:00-05', 'portal' from public.citas limit 1 $q$,
  '42501', null, 'el cron NO crea citas'
);
select throws_ok($q$ delete from public.citas $q$, '42501', null, 'el cron NO borra citas');
select throws_ok($q$ select 1 from public.atenciones $q$, '42501', null, 'el cron NO lee atenciones');
select throws_ok($q$ select 1 from public.antecedentes $q$, '42501', null, 'el cron NO lee antecedentes');
select throws_ok($q$ select 1 from public.historias_clinicas $q$, '42501', null, 'el cron NO lee historias clínicas');
select throws_ok($q$ select 1 from public.addendas $q$, '42501', null, 'el cron NO lee addendas');
select throws_ok($q$ select 1 from public.asignaciones_paciente_medico $q$, '42501', null, 'el cron NO lee asignaciones');
select throws_ok($q$ select 1 from public.pacientes $q$, '42501', null, 'el cron NO lee pacientes');
select throws_ok($q$ select 1 from public.perfiles $q$, '42501', null, 'el cron NO lee perfiles');
reset role;

select ok(
  not has_table_privilege('anonymous', 'public.notificaciones', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.notificaciones', 'SELECT'),
  'anonymous y sync_identidad no tienen acceso a notificaciones'
);

select * from finish();
