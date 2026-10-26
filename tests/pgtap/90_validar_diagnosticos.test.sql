-- historias-clinicas, tareas 2.3 y 2.4 (parcial): cada diagnóstico de una atención debe existir en el catálogo CIE-10, la
-- descripción la pone el catálogo y no el cliente, y un código repetido o un tipo no permitido se rechazan. Segunda
-- barrera: la primera es el esquema Zod del servidor (lib/schemas/atencion.ts). Spec: registro-de-atencion («Diagnósticos del
-- catálogo CIE-10»).
-- No asume tablas vacías: usa los códigos R51, I10 y J00 del subconjunto inicial (migración cie10-subconjunto-inicial).
select plan(20);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp validar diagnosticos');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values (tests.sub('medico_a'), 'medico', 'Mario', 'Diag');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = tests.sub('medico_a')), 'CMP-90-0001',
          (select id from public.especialidades where nombre = 'Esp validar diagnosticos'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  values ('DNI', '79900001', 'Paciente', 'Diag', '1990-01-01', 'F', 'p90@demo.invalid');
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo)
  values ((select id from public.pacientes where numero_documento = '79900001'),
          (select id from public.medicos where cmp = 'CMP-90-0001'), public.hoy_lima() - 1, 'manual: prueba 90');

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'medico', id from public.medicos where cmp = 'CMP-90-0001'
  union all select 'p', id from public.pacientes where numero_documento = '79900001'
  union all select 'borrador', gen_random_uuid()
  union all select 'firmada', gen_random_uuid();

create function pg_temp.insertar(p_id uuid, p_diagnosticos jsonb, p_firmada boolean default false) returns void
language plpgsql as $f$
begin
  insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
  values (p_id, (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p')),
          (select id from e where clave = 'p'), (select id from e where clave = 'medico'),
          'Motivo', 'Anamnesis', 'Examen', p_diagnosticos, 'Plan', case when p_firmada then now() end);
end
$f$;

-- ---- Un diagnóstico válido: la descripción es la del catálogo y las claves ajenas se descartan ----
select lives_ok(
  $q$ select pg_temp.insertar((select id from e where clave = 'borrador'),
        '[{"cie10": "R51", "descripcion": "Inventada por el cliente", "tipo": "definitivo", "ajena": 1}]') $q$,
  'un diagnóstico con código del catálogo se acepta'
);
select is(
  (select diagnosticos from public.atenciones where id = (select id from e where clave = 'borrador')),
  '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]'::jsonb,
  'la descripción se toma del catálogo y se descartan las claves ajenas'
);

-- ---- Rechazos (dueño: la validación es del disparador, no de los permisos) ----
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), '[{"cie10": "ZZ99.9", "tipo": "definitivo"}]') $q$,
  'HC001', null, 'un código que no existe en el catálogo se rechaza'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), '[{"cie10": "R51"}, {"cie10": "R51", "tipo": "presuntivo"}]') $q$,
  'HC001', null, 'un código repetido en la misma atención se rechaza'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), '[{"cie10": "R51", "tipo": "sospechoso"}]') $q$,
  '23514', null, 'un tipo de diagnóstico no permitido se rechaza'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), '[{"cie10": "R51", "tipo": null}]') $q$,
  '23514', null, 'un tipo nulo no es un tipo permitido'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), '["R51"]') $q$,
  'HC001', null, 'una entrada que no es un objeto se rechaza'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), '[{"descripcion": "Sin código"}]') $q$,
  'HC001', null, 'una entrada sin código se rechaza'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), '[{"cie10": 51}]') $q$,
  'HC001', null, 'un código que no es texto se rechaza'
);

-- Lo que H2 ya rechazaba sigue rechazándose con el mismo código: el disparador no actúa y el CHECK decide.
select throws_ok($q$ select pg_temp.insertar(gen_random_uuid(), '[]') $q$, '23514', null, 'una lista vacía sigue rechazada por el CHECK');
select throws_ok($q$ select pg_temp.insertar(gen_random_uuid(), '{"cie10": "R51"}') $q$, '23514', null, 'un objeto en vez de una lista sigue rechazado por el CHECK');

-- ---- Tipo opcional en la base y orden conservado ----
select lives_ok(
  $q$ select pg_temp.insertar((select id from e where clave = 'firmada'), '[{"cie10": "I10"}, {"cie10": "R51", "tipo": "presuntivo"}]', true) $q$,
  'el tipo es opcional en la base (es obligatorio en el esquema Zod)'
);
select is(
  (select diagnosticos from public.atenciones where id = (select id from e where clave = 'firmada')),
  '[{"cie10": "I10", "descripcion": "Hipertensión esencial (primaria)"}, {"cie10": "R51", "descripcion": "Cefalea", "tipo": "presuntivo"}]'::jsonb,
  'el orden de los diagnósticos se conserva y el que no trae tipo no lo recibe'
);

-- ---- El UPDATE de un borrador revalida ----
select throws_ok(
  $q$ update public.atenciones set diagnosticos = '[{"cie10": "ZZ99.9"}]' where id = (select id from e where clave = 'borrador') $q$,
  'HC001', null, 'al editar el borrador, un código inexistente se rechaza'
);
select lives_ok(
  $q$ update public.atenciones set diagnosticos = '[{"cie10": "J00", "descripcion": "Otra", "tipo": "repetitivo"}]' where id = (select id from e where clave = 'borrador') $q$,
  'al editar el borrador, un diagnóstico válido se acepta'
);
select is(
  (select diagnosticos -> 0 ->> 'descripcion' from public.atenciones where id = (select id from e where clave = 'borrador')),
  'Rinofaringitis aguda (resfriado común)',
  'al editar, la descripción también se vuelve a tomar del catálogo'
);

-- ---- Un cambio posterior del catálogo no altera una atención firmada ----
update public.cie10 set descripcion = 'Cefalea (texto cambiado después)' where codigo = 'R51';
select is(
  (select diagnosticos -> 1 ->> 'descripcion' from public.atenciones where id = (select id from e where clave = 'firmada')),
  'Cefalea',
  'la descripción guardada en una atención es una instantánea: no cambia si luego cambia el catálogo'
);

-- ---- Como médico: la validación corre antes de la política, y no se puede falsear la descripción ----
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p')),
              (select id from e where clave = 'p'), (select id from e where clave = 'medico'),
              'M', 'A', 'E', '[{"cie10": "ZZ99.9", "tipo": "definitivo"}]', 'P') $q$,
  'HC001', null, 'el médico no registra un diagnóstico con código inexistente'
);
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values (gen_random_uuid(), (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p')),
              (select id from e where clave = 'p'), (select id from e where clave = 'medico'),
              'M', 'A', 'E', '[{"cie10": "J00", "descripcion": "Falsa", "tipo": "definitivo"}]', 'P') $q$,
  'el médico registra un diagnóstico válido'
);
select is(
  (select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'p')
     and diagnosticos -> 0 ->> 'descripcion' = 'Falsa'),
  0,
  'ninguna atención guarda una descripción enviada por el cliente'
);

select * from finish();
