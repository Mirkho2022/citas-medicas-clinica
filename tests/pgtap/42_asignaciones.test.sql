-- Historias clínicas (H2, tarea 6.3): asignaciones paciente-médico (ADR-0016) y medico_tiene_paciente().
-- Spec: integridad-historia-clinica («Asignación automática...») y aislamiento-por-rol-rls («El acceso expira...»).
select plan(21);

-- Datos de prueba (dueño).
insert into public.especialidades (nombre) values ('Esp asignaciones');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  ('user_test_as_m2', 'medico', 'Marta', 'B');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-A-' || right(clerk_user_id, 2), (select id from public.especialidades where nombre = 'Esp asignaciones')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), 'user_test_as_m2');
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  select 'DNI', '7800000' || n, 'Paciente', 'N' || n, '1990-01-01', 'F', 'as' || n || '@demo.invalid' from generate_series(1, 8) n;

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'm_a', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = tests.sub('medico_a')
  union all select 'm_b', m.id from public.medicos m join public.perfiles p on p.id = m.perfil_id where p.clerk_user_id = 'user_test_as_m2'
  union all select 'p' || right(numero_documento, 1), id from public.pacientes where numero_documento like '7800000%';

-- Crea una cita y guarda su id en e bajo la clave dada.
create function pg_temp.nueva_cita(p_clave text, p_pac text, p_med text, p_inicio timestamptz, p_estado estado_cita) returns void
language plpgsql as $f$
declare v_id uuid;
begin
  insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado)
  values ((select id from e where clave = p_pac), (select id from e where clave = p_med), p_inicio, p_inicio + interval '20 minutes', 'administrativo', p_estado)
  returning id into v_id;
  insert into e values (p_clave, v_id);
end
$f$;

-- ---- Disparador: acceso al confirmar o atender ----
select pg_temp.nueva_cita('c1', 'p1', 'm_a', '2032-03-01 09:00:00-05', 'reservada');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where paciente_id = (select id from e where clave = 'p1')), 0,
  'una cita solo reservada NO otorga acceso'
);
update public.citas set estado = 'confirmada' where id = (select id from e where clave = 'c1');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c1')), 1,
  'la primera confirmación crea la asignación'
);
select is(
  (select vigente_hasta from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c1')), date '2032-09-01',
  'la asignación vence 6 meses después de la cita'
);
select is(
  (select vigente_desde from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c1')), public.hoy_lima(),
  'la asignación empieza hoy (fecha de Lima)'
);
update public.citas set estado = 'atendida' where id = (select id from e where clave = 'c1');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c1')), 1,
  'pasar de confirmada a atendida NO duplica la asignación'
);

-- Una cita insertada ya confirmada (camino INSERT del disparador), cancelada y vuelta a confirmar.
select pg_temp.nueva_cita('c2', 'p2', 'm_a', '2032-03-02 09:00:00-05', 'confirmada');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c2')), 1,
  'una cita insertada ya confirmada (camino INSERT) también crea la asignación'
);
update public.citas set estado = 'cancelada' where id = (select id from e where clave = 'c2');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c2')), 1,
  'cancelar la cita NO revoca la asignación ya otorgada'
);
update public.citas set estado = 'confirmada' where id = (select id from e where clave = 'c2');
select is(
  (select count(*)::int from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c2')), 1,
  'confirmar de nuevo una cita cancelada NO duplica la asignación'
);

-- Cita a las 23:30 de Lima (04:30 UTC del día siguiente): el vencimiento usa la fecha de Lima.
select pg_temp.nueva_cita('c3', 'p3', 'm_a', '2032-03-01 23:30:00-05', 'confirmada');
select is(
  (select vigente_hasta from public.asignaciones_paciente_medico where motivo = 'cita:' || (select id from e where clave = 'c3')), date '2032-09-01',
  'el vencimiento usa la fecha de Lima, no la de UTC (23:30 Lima del 1 de marzo -> 1 de septiembre)'
);

-- ---- medico_tiene_paciente() ----
-- Asignaciones manuales, como las inserta el administrativo: vencida, sin vencimiento, futura, de otro médico.
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo) values
  ((select id from e where clave = 'p4'), (select id from e where clave = 'm_a'), public.hoy_lima() - 30, public.hoy_lima() - 1, 'manual: vencida ayer'),
  ((select id from e where clave = 'p5'), (select id from e where clave = 'm_a'), public.hoy_lima() - 30, null,                    'manual: sin vencimiento'),
  ((select id from e where clave = 'p6'), (select id from e where clave = 'm_a'), public.hoy_lima() + 1,  null,                    'manual: empieza mañana'),
  ((select id from e where clave = 'p7'), (select id from e where clave = 'm_b'), public.hoy_lima() - 30, null,                    'manual: de otro médico');

select tests.autenticar_como('medico_a');
select is(public.medico_tiene_paciente((select id from e where clave = 'p1')), true,  'asignación vigente (por cita atendida): el médico tiene al paciente a cargo');
select is(public.medico_tiene_paciente((select id from e where clave = 'p5')), true,  'asignación manual sin vencimiento: a cargo');
select is(public.medico_tiene_paciente((select id from e where clave = 'p8')), false, 'paciente sin ninguna asignación: NO a cargo');
select is(public.medico_tiene_paciente((select id from e where clave = 'p4')), false, 'asignación vencida ayer: NO a cargo');
select is(public.medico_tiene_paciente((select id from e where clave = 'p6')), false, 'asignación que empieza mañana: NO a cargo todavía');
select is(public.medico_tiene_paciente((select id from e where clave = 'p7')), false, 'paciente asignado a OTRO médico: NO a cargo');

select tests.volver_a_dueno();
update public.medicos set activo = false where id = (select id from e where clave = 'm_a');
select tests.autenticar_como('medico_a');
select is(public.medico_tiene_paciente((select id from e where clave = 'p5')), false, 'un médico dado de baja pierde el acceso aunque su asignación no haya vencido');

select tests.autenticar_como('paciente_a');
select is(public.medico_tiene_paciente((select id from e where clave = 'p5')), false, 'un usuario que no es médico: NO a cargo de nadie');

-- ---- Definición ----
select is(public.hoy_lima(), (now() at time zone 'America/Lima')::date, 'hoy_lima() devuelve la fecha de Lima');
select ok(
  has_function_privilege('authenticated', 'public.medico_tiene_paciente(uuid)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.medico_tiene_paciente(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.extender_asignacion_por_cita()', 'EXECUTE'),
  'medico_tiene_paciente() la ejecuta authenticated; el disparador no se puede invocar'
);
select ok(
  (select bool_and(prosecdef) from pg_proc
    where oid in ('public.medico_tiene_paciente(uuid)'::regprocedure, 'public.extender_asignacion_por_cita()'::regprocedure)),
  'ambas funciones son SECURITY DEFINER'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.asignaciones_paciente_medico'::regclass),
  'asignaciones_paciente_medico tiene RLS activada'
);

select * from finish();
