-- H3, tarea 2.2 (agenda-y-reserva): la plantilla semanal no se solapa, vigente_desde usa la fecha de Lima y los
-- bloqueos quedan auditados. Spec: disponibilidad-y-slots («Los tramos de disponibilidad no se solapan»).
select plan(32);

-- Datos de prueba (dueño). La base puede tener otros datos: todo se filtra por los ids de prueba.
insert into public.especialidades (nombre) values ('Esp solape');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  ('user_test_sol_m2', 'medico', 'Marta', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-S-' || right(clerk_user_id, 2), (select id from public.especialidades where nombre = 'Esp solape')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), 'user_test_sol_m2');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_sol_m2'
  union all select 'admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo');

-- Tramo base: lunes 08:00-10:00 del médico A, vigente durante todo 2032.
insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
  values ((select id from e where clave = 'm_a'), 1, '08:00', '10:00', '2032-01-01', '2032-12-31');

-- ---- El administrativo escribe; la restricción decide ----
select tests.autenticar_como('administrativo');

select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 1, '09:00', '11:00', '2032-03-01', '2032-06-30') $q$,
  '23P01', null, 'un tramo que se cruza con otro del mismo día y vigencia es rechazado (23P01)'
);
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 1, '08:00', '10:00', '2032-06-01', '2032-06-30') $q$,
  '23P01', null, 'el mismo tramo exacto, con vigencia contenida, también es rechazado'
);
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 1, '07:00', '08:30', '2032-01-01', '2032-12-31') $q$,
  '23P01', null, 'un tramo que entra por el inicio también se cruza'
);
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 1, '10:00', '12:00', '2032-01-01', '2032-12-31') $q$,
  'un tramo contiguo (10:00 empieza donde termina el de 08:00-10:00) no se cruza'
);
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 2, '08:00', '10:00', '2032-01-01', '2032-12-31') $q$,
  'las mismas horas en otro día de la semana pasan'
);
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_b'), 1, '08:00', '10:00', '2032-01-01', '2032-12-31') $q$,
  'las mismas horas y día de otro médico pasan'
);
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 1, '08:00', '10:00', '2033-01-01', '2033-12-31') $q$,
  'las mismas horas con vigencia disjunta (2033) pasan'
);
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 1, '08:00', '10:00', '2032-12-31', '2033-01-02') $q$,
  '23P01', null, 'la vigencia es inclusiva: compartir el último día (31/12/2032) ya es un cruce'
);
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde, vigente_hasta)
      values ((select id from e where clave = 'm_a'), 1, '08:00', '10:00', '2033-06-01', null) $q$,
  '23P01', null, 'sin vigente_hasta (sin término) desde mitad de 2033 se cruza con la vigencia de 2033 que ya existe'
);
select throws_ok(
  $q$ update public.disponibilidades set hora_fin = '10:30'
      where medico_id = (select id from e where clave = 'm_a') and dia_semana = 1 and hora_inicio = '08:00' and vigente_desde = '2032-01-01' $q$,
  '23P01', null, 'editar un tramo hasta cruzarlo con su contiguo también es rechazado'
);

-- ---- vigente_desde por defecto: la fecha de Lima, no la del servidor ----
-- now() es fijo dentro de la transacción y no se puede mover a las 02:00 UTC; en su lugar se cambia la zona de la
-- sesión a dos extremos (UTC+14 y UTC-11, que siempre difieren en un día): current_date coincidiría con la fecha de
-- Lima en a lo sumo una de las dos.
set local timezone = 'Pacific/Kiritimati';
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 3, '08:00', '09:00') $q$,
  'el administrativo crea un tramo sin indicar vigente_desde (sesión en UTC+14)'
);
set local timezone = 'Pacific/Pago_Pago';
select lives_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 4, '08:00', '09:00') $q$,
  'el administrativo crea otro tramo sin indicar vigente_desde (sesión en UTC-11)'
);
set local timezone = 'UTC';
select is(
  (select count(*)::int from public.disponibilidades
    where medico_id = (select id from e where clave = 'm_a') and dia_semana in (3, 4)
      and vigente_desde = (now() at time zone 'America/Lima')::date),
  2,
  'ambos tramos quedaron con la fecha de hoy en Lima, sea cual sea la zona de la sesión'
);

-- ---- Bloqueos: crear, modificar y borrar dejan auditoría con el actor ----
select lives_ok(
  $q$ insert into public.bloqueos_agenda (id, medico_id, rango, motivo)
      values ('00000000-0000-4000-8000-000000003401', (select id from e where clave = 'm_a'),
              tstzrange('2032-08-01 00:00:00-05', '2032-08-10 00:00:00-05'), 'licencia') $q$,
  'el administrativo crea un bloqueo'
);
select lives_ok(
  $q$ update public.bloqueos_agenda set motivo = 'licencia extendida' where id = '00000000-0000-4000-8000-000000003401' $q$,
  'el administrativo modifica el bloqueo'
);
select lives_ok(
  $q$ delete from public.bloqueos_agenda where id = '00000000-0000-4000-8000-000000003401' $q$,
  'el administrativo borra el bloqueo'
);
select tests.volver_a_dueno();
select is(
  (select array_agg(accion order by id) from public.auditoria
    where tabla = 'bloqueos_agenda' and registro_id = '00000000-0000-4000-8000-000000003401'),
  array['INSERT', 'UPDATE', 'DELETE'],
  'cada operación sobre el bloqueo dejó una fila en auditoria'
);
select ok(
  (select bool_and(actor_id = (select id from e where clave = 'admin') and actor_rol = 'administrativo')
     from public.auditoria where tabla = 'bloqueos_agenda' and registro_id = '00000000-0000-4000-8000-000000003401'),
  'el actor registrado es el administrativo, con su rol'
);
select is(
  (select datos_antes ->> 'motivo' || ' -> ' || (datos_despues ->> 'motivo') from public.auditoria
    where tabla = 'bloqueos_agenda' and registro_id = '00000000-0000-4000-8000-000000003401' and accion = 'UPDATE'),
  'licencia -> licencia extendida',
  'la modificación guarda el estado anterior y el nuevo'
);

-- ---- Negativos por rol: nadie más escribe disponibilidades ni bloqueos ----
insert into public.bloqueos_agenda (id, medico_id, rango, motivo)
  values ('00000000-0000-4000-8000-000000003402', (select id from e where clave = 'm_a'),
          tstzrange('2032-09-01 00:00:00-05', '2032-09-10 00:00:00-05'), 'vacaciones');

select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 5, '08:00', '09:00') $q$,
  '42501', null, 'el paciente NO escribe disponibilidades'
);
select throws_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm_a'), tstzrange('2032-10-01 00:00:00-05', '2032-10-02 00:00:00-05'), 'x') $q$,
  '42501', null, 'el paciente NO escribe bloqueos'
);
select is((select count(*)::int from public.bloqueos_agenda where medico_id in (select id from e)), 0, 'el paciente NO lee bloqueos');
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 5, '08:00', '09:00') $q$,
  '42501', null, 'el médico NO escribe disponibilidades'
);
select throws_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm_a'), tstzrange('2032-10-01 00:00:00-05', '2032-10-02 00:00:00-05'), 'x') $q$,
  '42501', null, 'el médico NO escribe bloqueos'
);
select tests.autenticar_como('enfermera');
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 5, '08:00', '09:00') $q$,
  '42501', null, 'la enfermera NO escribe disponibilidades'
);
select throws_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm_a'), tstzrange('2032-10-01 00:00:00-05', '2032-10-02 00:00:00-05'), 'x') $q$,
  '42501', null, 'la enfermera NO escribe bloqueos'
);
select is((select count(*)::int from public.bloqueos_agenda where medico_id in (select id from e)), 0, 'la enfermera NO lee bloqueos');
select tests.autenticar_como('sin_rol');
select throws_ok(
  $q$ insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
      values ((select id from e where clave = 'm_a'), 5, '08:00', '09:00') $q$,
  '42501', null, 'una sesión sin rol NO escribe disponibilidades'
);
select throws_ok(
  $q$ insert into public.bloqueos_agenda (medico_id, rango, motivo)
      values ((select id from e where clave = 'm_a'), tstzrange('2032-10-01 00:00:00-05', '2032-10-02 00:00:00-05'), 'x') $q$,
  '42501', null, 'una sesión sin rol NO escribe bloqueos'
);
-- UPDATE y DELETE sin política no fallan: la RLS los deja en cero filas. Se comprueba que nada cambió.
select lives_ok(
  $q$ update public.bloqueos_agenda set motivo = 'manipulado' where id = '00000000-0000-4000-8000-000000003402';
      delete from public.bloqueos_agenda where id = '00000000-0000-4000-8000-000000003402';
      delete from public.disponibilidades where medico_id = (select id from e where clave = 'm_a') $q$,
  'una sesión sin rol puede intentar modificar y borrar (la RLS las deja en cero filas)'
);
select tests.volver_a_dueno();
select is(
  (select motivo from public.bloqueos_agenda where id = '00000000-0000-4000-8000-000000003402'), 'vacaciones',
  'el bloqueo sigue intacto tras los intentos sin permiso'
);
select cmp_ok(
  (select count(*)::int from public.disponibilidades where medico_id = (select id from e where clave = 'm_a')), '>=', 5,
  'las disponibilidades siguen en pie tras el intento de borrado sin permiso'
);

select * from finish();
