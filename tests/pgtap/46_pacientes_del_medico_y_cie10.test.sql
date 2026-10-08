-- Historias clínicas (H2, tarea 6.6): el médico lee los datos de los pacientes con los que trabaja; cie10 de solo lectura.
-- Spec: aislamiento-por-rol-rls («Datos de identidad visibles según el rol» y «Catálogos y personal legibles...»).
select plan(18);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp pacientes medico');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-PM-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp pacientes medico')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  select 'DNI', '7930000' || n, 'Paciente', 'N' || n, '1990-01-01', 'F', 'pm' || n || '@demo.invalid' from generate_series(1, 6) n;

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-PM-a'
  union all select 'mb', id from public.medicos where cmp = 'CMP-PM-b'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7930000%';

-- P1: cita reservada con A.  P2: cita confirmada con A (el disparador crea la asignación).  P3: solo una cita
-- cancelada con A.  P4: asignación de A vencida ayer.  P5: nada.  P6: cita reservada con B.
insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado) values
  ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), '2032-03-01 09:00:00-05', '2032-03-01 09:20:00-05', 'administrativo', 'reservada'),
  ((select id from e where clave = 'p2'), (select id from e where clave = 'ma'), '2032-03-01 10:00:00-05', '2032-03-01 10:20:00-05', 'administrativo', 'confirmada'),
  ((select id from e where clave = 'p3'), (select id from e where clave = 'ma'), '2032-03-01 11:00:00-05', '2032-03-01 11:20:00-05', 'administrativo', 'cancelada'),
  ((select id from e where clave = 'p6'), (select id from e where clave = 'mb'), '2032-03-01 09:00:00-05', '2032-03-01 09:20:00-05', 'administrativo', 'reservada');
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo)
  values ((select id from e where clave = 'p4'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, public.hoy_lima() - 1, 'manual: vencida');

-- ---- El médico lee a los pacientes con relación y a ningún otro ----
select tests.autenticar_como('medico_a');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '7930000%'), 2,
  'el médico ve a los pacientes con cita vigente (P1) o asignación vigente (P2)'
);
select is_empty(
  $q$ select 1 from public.pacientes where numero_documento = '79300003' $q$,
  'el médico NO ve a un paciente cuya única cita está cancelada'
);
select is_empty(
  $q$ select 1 from public.pacientes where numero_documento = '79300004' $q$,
  'el médico NO ve a un paciente cuya asignación venció'
);
select is_empty(
  $q$ select 1 from public.pacientes where numero_documento = '79300005' $q$,
  'el médico NO ve a un paciente sin cita ni asignación'
);
select is_empty(
  $q$ select 1 from public.pacientes where numero_documento = '79300006' $q$,
  'el médico NO ve a un paciente de la agenda de OTRO médico'
);
select lives_ok(
  $q$ update public.pacientes set telefono = '000000000' where numero_documento = '79300001' $q$,
  'el médico puede intentar editar un paciente (RLS lo deja en cero filas: son datos de solo lectura)'
);
select tests.autenticar_como('medico_b');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '7930000%'), 1,
  'el otro médico ve solo a su paciente'
);
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.pacientes where numero_documento like '7930000%'), 6, 'el administrativo ve a todos los pacientes');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.pacientes where numero_documento like '7930000%'), 0, 'la enfermera sigue sin ver pacientes');
select tests.volver_a_dueno();
select is(
  (select telefono from public.pacientes where numero_documento = '79300001'), null,
  'los datos del paciente no cambiaron desde la historia clínica del médico'
);

-- ---- cie10: lectura para toda sesión con rol válido; sin escritura para nadie ----
insert into public.cie10 (codigo, descripcion, capitulo) values ('Z99TEST1', 'Código de prueba 1', 'Prueba'), ('Z99TEST2', 'Código de prueba 2', 'Prueba');
select tests.autenticar_como('medico_a');
select is((select count(*)::int from public.cie10 where codigo like 'Z99TEST%'), 2, 'el médico consulta el catálogo CIE-10');
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.cie10 where codigo like 'Z99TEST%'), 2, 'cualquier rol válido consulta el catálogo CIE-10');
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.cie10 where codigo like 'Z99TEST%'), 0, 'una sesión sin rol no consulta el catálogo');
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ insert into public.cie10 (codigo, descripcion) values ('Z99NUEVO', 'Colado por el administrativo') $q$,
  '42501', null, 'el administrativo NO escribe en cie10 (solo se carga por migración de datos)'
);
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.cie10 (codigo, descripcion) values ('Z99MEDICO', 'Colado por un médico') $q$,
  '42501', null, 'el médico NO escribe en cie10'
);
select throws_ok(
  $q$ update public.cie10 set descripcion = 'Alterada' where codigo = 'Z99TEST1' $q$,
  '42501', null, 'nadie actualiza cie10'
);
select throws_ok(
  $q$ delete from public.cie10 where codigo = 'Z99TEST1' $q$,
  '42501', null, 'nadie borra de cie10'
);
select ok(not has_table_privilege('anonymous', 'public.cie10', 'SELECT'), 'el rol anonymous no tiene acceso a cie10');

select * from finish();
