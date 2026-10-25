-- Aislamiento del paciente tras el portal (H4, tarea 8.2; specs/aislamiento-del-paciente). Es la vista completa del rol paciente DESPUÉS
-- de registrarse por sí mismo: lo que ve, lo que no ve y lo que no puede hacer. Cada tabla y cada función tiene además su prueba
-- propia (23, 24, 32, 40–53, 61–64, 70, 71); esta las junta desde el punto de vista del paciente, incluida la carpeta clínica que el
-- alta le crea y que no puede leer.
select plan(30);

-- ---- Datos de prueba (dueño). Documentos 72800001 a 72800003. ----
insert into public.especialidades (nombre) values ('Esp portal aislamiento');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin'),
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A'),
  (tests.sub('paciente_b'), 'paciente', 'Pablo', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-PAI-1', (select id from public.especialidades where nombre = 'Esp portal aislamiento')
  from public.perfiles where clerk_user_id = tests.sub('medico_a');
-- paciente_b ya tiene ficha y cita; la tercera ficha no tiene cuenta.
insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, telefono) values
  ((select id from public.perfiles where clerk_user_id = tests.sub('paciente_b')), 'DNI', '72800002', 'Pablo', 'B', '1991-02-02', 'M', 'b@demo.invalid', '222222222'),
  (null, 'DNI', '72800003', 'Sin', 'Cuenta', '1992-03-03', 'X', 'c@demo.invalid', '333333333');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'pb', id from public.pacientes where numero_documento = '72800002'
  union all select 'pc', id from public.pacientes where numero_documento = '72800003';
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado) values
  ('00000000-0000-4000-8000-000000007201', (select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), '2032-07-05 09:00:00-05', '2032-07-05 09:20:00-05', 'portal', 'reservada'),
  ('00000000-0000-4000-8000-000000007202', (select id from e where clave = 'pc'), (select id from e where clave = 'm_a'), '2032-07-05 10:00:00-05', '2032-07-05 10:20:00-05', 'administrativo', 'reservada');
insert into public.bloqueos_agenda (medico_id, rango, motivo)
  values ((select id from e where clave = 'm_a'), tstzrange('2032-07-06 10:00:00-05', '2032-07-06 10:20:00-05'), 'Bloqueo de prueba');

-- ---- paciente_a se registra por sí mismo (documento nuevo) y recibe una cita ----
select tests.autenticar_como('paciente_a');
select is(
  (select vinculado from public.registrar_paciente_portal('DNI', '72800001', 'Paula', 'A', '1990-01-01', 'F')),
  false, 'paciente_a se registra con un documento nuevo (el alta del portal)'
);
select tests.volver_a_dueno();
insert into e select 'pa', id from public.pacientes where numero_documento = '72800001';
insert into public.citas (id, paciente_id, medico_id, inicio, fin, origen, estado)
  values ('00000000-0000-4000-8000-000000007203', (select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), '2032-07-06 09:00:00-05', '2032-07-06 09:20:00-05', 'portal', 'reservada');

-- ---- Lo que sí ve: su ficha, sus citas y los perfiles de los médicos ----
select tests.autenticar_como('paciente_a');
select is(
  (select count(*)::int from public.pacientes where numero_documento like '728000%'), 1,
  've una sola ficha de paciente'
);
select is(
  (select numero_documento from public.pacientes where numero_documento like '728000%'), '72800001',
  'la ficha que ve es la suya'
);
select is(
  (select count(*)::int from public.citas where id in ('00000000-0000-4000-8000-000000007201', '00000000-0000-4000-8000-000000007202', '00000000-0000-4000-8000-000000007203')), 1,
  've una sola cita de las tres sembradas: la suya'
);
select is(
  (select count(*)::int from public.perfiles where clerk_user_id in (tests.sub('paciente_a'), tests.sub('medico_a'))), 2,
  've su propio perfil y el del médico (para elegir con quién reservar)'
);
select is(
  (select count(*)::int from public.perfiles where clerk_user_id in (tests.sub('paciente_b'), tests.sub('administrativo'))), 0,
  'NO ve el perfil de otro paciente ni el del administrativo'
);

-- ---- Lo que no ve: ninguna tabla clínica ni administrativa, ni siquiera su carpeta recién creada ----
select is((select count(*)::int from public.historias_clinicas), 0, 'NO ve ninguna historia clínica, ni la suya recién creada');
select is((select count(*)::int from public.atenciones), 0, 'NO ve atenciones');
select is((select count(*)::int from public.addendas), 0, 'NO ve addendas');
select is((select count(*)::int from public.antecedentes), 0, 'NO ve antecedentes');
select is((select count(*)::int from public.accesos_historia), 0, 'NO ve el registro de accesos a historias');
select is((select count(*)::int from public.asignaciones_paciente_medico), 0, 'NO ve las asignaciones paciente-médico');
select is((select count(*)::int from public.auditoria), 0, 'NO ve la auditoría');
select is((select count(*)::int from public.bloqueos_agenda), 0, 'NO ve los bloqueos de agenda ni sus motivos');
select is((select count(*)::int from public.notificaciones), 0, 'NO ve las notificaciones');
select is((select count(*)::int from public.turnos_enfermeria), 0, 'NO ve los turnos de enfermería');
select is((select count(*)::int from public.enfermeras), 0, 'NO ve a las enfermeras');

-- ---- Lo que no puede hacer ----
select throws_ok(
  $q$ insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
      values ('DNI', '72800099', 'Colado', 'Colado', '1990-01-01', 'M', 'x@demo.invalid') $q$,
  '42501', null, 'NO inserta pacientes por su cuenta (solo por la función del alta)'
);
select lives_ok(
  $q$ update public.pacientes set telefono = '000000000', nombres = 'Cambiado' where numero_documento = '72800001' $q$,
  'puede intentar editar su ficha (RLS lo deja en cero filas)'
);
select tests.volver_a_dueno();
select is(
  (select row(nombres, telefono)::text from public.pacientes where numero_documento = '72800001'),
  row('Paula', null::text)::text, 'su ficha no cambió'
);

-- Con el disparador de horario apagado, lo único que detiene estas inserciones es la política de RLS.
alter table public.citas disable trigger citas_validar_horario;
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), '2032-07-07 09:00:00-05', '2032-07-07 09:20:00-05', 'administrativo') $q$,
  '42501', null, 'NO crea una cita con origen administrativo'
);
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pb'), (select id from e where clave = 'm_a'), '2032-07-07 10:00:00-05', '2032-07-07 10:20:00-05', 'portal') $q$,
  '42501', null, 'NO reserva una cita a nombre de otro paciente'
);
select throws_ok(
  $q$ insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
      values ((select id from e where clave = 'pa'), (select id from e where clave = 'm_a'), now() - interval '2 hours', now() - interval '100 minutes', 'portal') $q$,
  '42501', null, 'NO reserva en el pasado'
);
select tests.volver_a_dueno();
alter table public.citas enable trigger citas_validar_horario;

select tests.autenticar_como('paciente_a');
select lives_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('paciente_a') $q$,
  'puede intentar cambiar su propio rol (RLS lo deja en cero filas: solo el administrativo actualiza perfiles)'
);
select tests.volver_a_dueno();
select is(
  (select rol::text from public.perfiles where clerk_user_id = tests.sub('paciente_a')), 'paciente',
  'su rol no cambió'
);
-- Segunda barrera: aunque una política permitiera actualizar, el disparador rechaza el cambio de rol de quien no es administrativo.
create policy tmp_permite_actualizar_perfiles on public.perfiles for update to authenticated using (true) with check (true);
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ update public.perfiles set rol = 'administrativo' where clerk_user_id = tests.sub('paciente_a') $q$,
  '42501', null, 'aun con una política temporal que le deje actualizar, el disparador NO le deja cambiar su rol (42501)'
);
select tests.volver_a_dueno();
drop policy tmp_permite_actualizar_perfiles on public.perfiles;
select tests.autenticar_como('paciente_a');
select throws_ok($q$ select public.cerrar_citas_vencidas_como_personal() $q$, '42501', null, 'NO ejecuta el cierre de citas vencidas del personal');
select throws_ok(
  $q$ select public.marcar_cita_atendida('00000000-0000-4000-8000-000000007203') $q$,
  '42501', null, 'NO marca una cita como atendida'
);
select throws_ok(
  $q$ select * from public.propuestas_reasignacion('00000000-0000-4000-8000-000000000001', 0, 7) $q$,
  '42501', null, 'NO consulta propuestas de reasignación'
);
select throws_ok(
  $q$ select * from public.reasignar_cita_por_baja('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003', now(), now() + interval '1 hour') $q$,
  '42501', null, 'NO reasigna citas por baja de un médico'
);

select * from finish();
