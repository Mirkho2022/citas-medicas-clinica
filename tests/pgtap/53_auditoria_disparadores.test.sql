-- Auditoría (H2, tarea 7.4): los disparadores dejan registro de cada cambio, y las tablas clínicas NO vuelcan contenido.
-- Spec: aislamiento-por-rol-rls («La auditoría de escritura no filtra contenido clínico al administrativo»).
select plan(18);

-- ---- Sin identidad (dueño): el actor queda nulo ----
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values (tests.sub('administrativo'), 'administrativo', 'Adela', 'Admin');
select is(
  (select count(*)::int from public.auditoria where tabla = 'perfiles' and accion = 'INSERT'
     and registro_id = (select id::text from public.perfiles where clerk_user_id = tests.sub('administrativo'))), 1,
  'insertar un perfil deja un registro de auditoría'
);
select is(
  (select datos_despues ->> 'nombres' from public.auditoria where tabla = 'perfiles' and accion = 'INSERT'
     and registro_id = (select id::text from public.perfiles where clerk_user_id = tests.sub('administrativo'))), 'Adela',
  'el INSERT registra el estado nuevo y ningún estado anterior'
);
select ok(
  (select actor_id is null and actor_rol is null and datos_antes is null from public.auditoria
    where tabla = 'perfiles' and accion = 'INSERT'
      and registro_id = (select id::text from public.perfiles where clerk_user_id = tests.sub('administrativo'))),
  'sin sesión de usuario el actor queda nulo'
);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp auditoria disparadores');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'A'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'A');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = tests.sub('medico_a')), 'CMP-AD-0001',
          (select id from public.especialidades where nombre = 'Esp auditoria disparadores'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  values ('DNI', '82000001', 'Paula', 'A', '1990-01-01', 'F', 'ad@demo.invalid');
create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'medico', id from public.medicos where cmp = 'CMP-AD-0001'
  union all select 'p', id from public.pacientes where numero_documento = '82000001'
  union all select 'perfil_admin', id from public.perfiles where clerk_user_id = tests.sub('administrativo')
  union all select 'perfil_pa', id from public.perfiles where clerk_user_id = tests.sub('paciente_a')
  union all select 'atencion', gen_random_uuid();
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo)
  values ((select id from e where clave = 'p'), (select id from e where clave = 'medico'), public.hoy_lima() - 1, 'manual');

-- ---- Cambios hechos por una sesión de usuario: quedan con su actor y rol ----
select tests.autenticar_como('administrativo');
update public.perfiles set rol = 'enfermera' where clerk_user_id = tests.sub('paciente_a');
select tests.volver_a_dueno();
select ok(
  (select actor_id = (select id from e where clave = 'perfil_admin') and actor_rol = 'administrativo'
          and datos_antes ->> 'rol' = 'paciente' and datos_despues ->> 'rol' = 'enfermera'
     from public.auditoria
    where tabla = 'perfiles' and accion = 'UPDATE' and registro_id = (select id::text from e where clave = 'perfil_pa')),
  'un UPDATE hecho por el administrativo registra actor, rol y los estados anterior y nuevo'
);

-- ---- Pacientes, citas y asignaciones ----
select is(
  (select count(*)::int from public.auditoria where tabla = 'pacientes' and accion = 'INSERT' and registro_id = (select id::text from e where clave = 'p')), 1,
  'registrar un paciente se audita'
);
insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado)
  values ((select id from e where clave = 'p'), (select id from e where clave = 'medico'), '2032-03-01 09:00:00-05', '2032-03-01 09:20:00-05', 'administrativo', 'confirmada');
select is(
  (select count(*)::int from public.auditoria where tabla = 'citas' and accion = 'INSERT'
     and registro_id = (select id::text from public.citas where paciente_id = (select id from e where clave = 'p'))), 1,
  'agendar una cita se audita'
);
select ok(
  exists (select 1 from public.auditoria where tabla = 'asignaciones_paciente_medico' and accion = 'INSERT'
            and datos_despues ->> 'motivo' like 'cita:%'),
  'la asignación creada automáticamente al confirmar una cita también se audita'
);
update public.citas set estado = 'atendida' where paciente_id = (select id from e where clave = 'p');
select is(
  (select datos_antes ->> 'estado' || '>' || (datos_despues ->> 'estado') from public.auditoria
    where tabla = 'citas' and accion = 'UPDATE' order by id desc limit 1), 'confirmada>atendida',
  'un cambio de estado de la cita registra el antes y el después'
);

-- ---- Tablas clínicas: se audita el hecho, NUNCA el contenido ----
insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  values ((select id from e where clave = 'atencion'),
          (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p')),
          (select id from e where clave = 'p'), (select id from e where clave = 'medico'),
          'MOTIVO-SECRETO-XYZ', 'ANAMNESIS-SECRETA-XYZ', 'EXAMEN-SECRETO-XYZ', '[{"cie10": "R51"}]', 'PLAN-SECRETO-XYZ');
update public.atenciones set anamnesis = 'ANAMNESIS-EDITADA-XYZ' where id = (select id from e where clave = 'atencion');
update public.atenciones set firmada_en = now() where id = (select id from e where clave = 'atencion');
insert into public.addendas (atencion_id, medico_id, texto)
  values ((select id from e where clave = 'atencion'), (select id from e where clave = 'medico'), 'ADDENDA-SECRETA-XYZ');
insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
  values ((select id from e where clave = 'p'), 'alergico', 'ANTECEDENTE-SECRETO-XYZ', (select id from e where clave = 'medico'));
update public.antecedentes set vigente = false where descripcion = 'ANTECEDENTE-SECRETO-XYZ';

select is(
  (select count(*)::int from public.auditoria where tabla = 'atenciones' and registro_id = (select id::text from e where clave = 'atencion')), 3,
  'insertar, editar y firmar una atención deja tres registros'
);
select ok(
  (select bool_and(datos_antes is null and datos_despues is null) from public.auditoria where tabla in ('atenciones', 'addendas', 'antecedentes')),
  'la auditoría de atenciones, addendas y antecedentes NO guarda datos_antes ni datos_despues'
);
select is_empty(
  $q$ select 1 from public.auditoria where (coalesce(datos_antes::text, '') || coalesce(datos_despues::text, '')) like '%SECRET%' $q$,
  'ningún texto clínico aparece en la auditoría'
);
select is(
  (select count(*)::int from public.auditoria where tabla = 'addendas' and accion = 'INSERT'
     and registro_id = (select id::text from public.addendas where texto = 'ADDENDA-SECRETA-XYZ')), 1,
  'una addenda se audita (solo el hecho)'
);
select is(
  (select count(*)::int from public.auditoria where tabla = 'antecedentes'
     and registro_id = (select id::text from public.antecedentes where descripcion = 'ANTECEDENTE-SECRETO-XYZ')), 2,
  'registrar y marcar no vigente un antecedente se audita (solo el hecho)'
);

-- ---- El administrativo ve la auditoría, y en ella no hay contenido clínico ----
select tests.autenticar_como('administrativo');
select cmp_ok((select count(*)::int from public.auditoria where tabla = 'atenciones'), '>=', 3, 'el administrativo ve los registros de auditoría de atenciones');
select is_empty(
  $q$ select 1 from public.auditoria where tabla = 'atenciones' and (datos_antes is not null or datos_despues is not null) $q$,
  'pero en ellos no hay contenido clínico (negativo)'
);

-- ---- Delete y definición ----
select tests.volver_a_dueno();
delete from public.perfiles where clerk_user_id = tests.sub('administrativo');
select ok(
  (select datos_despues is null and datos_antes ->> 'nombres' = 'Adela' from public.auditoria
    where tabla = 'perfiles' and accion = 'DELETE' order by id desc limit 1),
  'un DELETE registra el estado anterior y ninguno nuevo'
);
select ok(
  not has_function_privilege('authenticated', 'public.registrar_auditoria()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.registrar_auditoria()', 'EXECUTE'),
  'registrar_auditoria() no se puede invocar directamente'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.registrar_auditoria()'::regprocedure),
  'registrar_auditoria() es SECURITY DEFINER (quien escribe no tiene privilegios sobre auditoria)'
);

select * from finish();
