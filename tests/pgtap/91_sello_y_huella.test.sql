-- historias-clinicas, tareas 3.1 y 3.3 (design.md, D5): el servidor sella la hora de creación y de firma, y fija el método y
-- la huella de la firma lógica. Spec: firma-y-addendas («Firmar una atención la vuelve inmutable con sello del servidor»).
-- Esto NO prueba validez legal: la firma es lógica (P-1 y P-5 siguen abiertas).
-- Una transacción dura lo que dura el archivo: `now()` es constante, así que «la hora del servidor» se compara por igualdad.
select plan(38);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp sello y huella');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'Sello'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'Sello'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'Sello');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-91-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp sello y huella')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id) values
  ('DNI', '79910001', 'Paula', 'Sello', '1990-01-01', 'F', 'p91a@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '79910002', 'Paciente', 'Dos', '1991-01-01', 'M', 'p91b@demo.invalid');

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-91-a'
  union all select 'mb', id from public.medicos where cmp = 'CMP-91-b'
  union all select 'p1', id from public.pacientes where numero_documento = '79910001'
  union all select 'p2', id from public.pacientes where numero_documento = '79910002'
  union all select c, gen_random_uuid() from unnest(array['borrador', 'borrador2', 'borrador3', 'sembrada']) as c;

-- A está a cargo de P1; B también (para probar que un médico a cargo que no es el autor no firma). Nadie tiene a P2.
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo) values
  ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, 'manual: prueba 91 A'),
  ((select id from e where clave = 'p1'), (select id from e where clave = 'mb'), public.hoy_lima() - 30, 'manual: prueba 91 B');

create function pg_temp.insertar(p_id uuid, p_med text, p_firmada_en timestamptz default null, p_creado_en timestamptz default null) returns void
language plpgsql as $f$
begin
  insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en, creado_en)
  values (p_id, (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
          (select id from e where clave = 'p1'), (select id from e where clave = p_med),
          'Motivo', 'Anamnesis', 'Examen', '[{"cie10": "R51", "tipo": "definitivo"}]', 'Plan', p_firmada_en,
          coalesce(p_creado_en, now()));
end
$f$;

-- ---- El dueño (siembra, migraciones) conserva sus valores, pero la firma obtiene método y huella ----
select pg_temp.insertar((select id from e where clave = 'sembrada'), 'ma', '2020-01-01 10:00+00', '2020-01-01 09:00+00');
select is(
  (select firmada_en from public.atenciones where id = (select id from e where clave = 'sembrada')), '2020-01-01 10:00+00'::timestamptz,
  'el dueño (siembra) conserva su firmada_en'
);
select is(
  (select creado_en from public.atenciones where id = (select id from e where clave = 'sembrada')), '2020-01-01 09:00+00'::timestamptz,
  'el dueño (siembra) conserva su creado_en'
);
select is(
  (select firma_metodo from public.atenciones where id = (select id from e where clave = 'sembrada')), 'logica',
  'una atención que nace firmada obtiene el método de firma lógica'
);
select matches(
  (select firma_huella from public.atenciones where id = (select id from e where clave = 'sembrada')), '^v1:[0-9a-f]{64}$',
  'y una huella versionada SHA-256'
);
select is(
  (select firma_huella from public.atenciones where id = (select id from e where clave = 'sembrada')),
  public.huella_atencion((select id from e where clave = 'sembrada')),
  'la huella guardada coincide con su recálculo'
);

-- ---- La huella cambia si cambia cualquier parte del contenido (se desactiva la inmutabilidad solo en esta transacción) ----
alter table public.atenciones disable trigger atenciones_inmutables;
alter table public.atenciones disable trigger atenciones_zz_sello;
create temp table huella_original as select firma_huella as h from public.atenciones where id = (select id from e where clave = 'sembrada');
update public.atenciones set anamnesis = 'Alterada' where id = (select id from e where clave = 'sembrada');
select isnt(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'alterar la anamnesis rompe la huella');
update public.atenciones set anamnesis = 'Anamnesis' where id = (select id from e where clave = 'sembrada');
select is(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'al restaurar el contenido la huella vuelve a coincidir');
update public.atenciones set diagnosticos = '[{"cie10": "I10", "descripcion": "Hipertensión esencial (primaria)"}]' where id = (select id from e where clave = 'sembrada');
select isnt(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'alterar los diagnósticos rompe la huella');
update public.atenciones set diagnosticos = '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]' where id = (select id from e where clave = 'sembrada');
update public.atenciones set firmada_en = '2020-01-02 10:00+00' where id = (select id from e where clave = 'sembrada');
select isnt(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'alterar la fecha de firma rompe la huella');
update public.atenciones set firmada_en = '2020-01-01 10:00+00' where id = (select id from e where clave = 'sembrada');
update public.atenciones set cita_id = null, medico_id = (select id from e where clave = 'mb') where id = (select id from e where clave = 'sembrada');
select isnt(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'alterar el autor rompe la huella');
update public.atenciones set medico_id = (select id from e where clave = 'ma') where id = (select id from e where clave = 'sembrada');
select is(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'todo restaurado: la huella coincide otra vez');

-- La huella ya cubre la plantilla y los datos de especialidad (plantillas por especialidad, ADR-0029) aunque sus columnas
-- aún no existan: si no existen se añaden SOLO en esta transacción y se comprueba que (1) con sus valores por defecto la huella v1
-- ya guardada sigue verificándose y (2) alterar cualquiera de las dos la rompe.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'atenciones' and column_name = 'datos_especialidad') then
    alter table public.atenciones add column plantilla_id uuid, add column datos_especialidad jsonb not null default '{}';
  end if;
end
$$;
select is(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original),
  'con plantilla nula y datos vacíos la huella v1 ya guardada sigue verificándose');
update public.atenciones set datos_especialidad = '{"tiempo_enfermedad": "3 días"}' where id = (select id from e where clave = 'sembrada');
select isnt(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'alterar los datos de especialidad rompe la huella');
update public.atenciones set datos_especialidad = '{}', plantilla_id = gen_random_uuid() where id = (select id from e where clave = 'sembrada');
select isnt(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'alterar la plantilla rompe la huella');
update public.atenciones set plantilla_id = null where id = (select id from e where clave = 'sembrada');
select is(public.huella_atencion((select id from e where clave = 'sembrada')), (select h from huella_original), 'sin plantilla y sin datos la huella vuelve a coincidir');
alter table public.atenciones enable trigger atenciones_zz_sello;
alter table public.atenciones enable trigger atenciones_inmutables;

-- ---- El médico no fija creado_en ni firmada_en: los fija el servidor ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, creado_en)
      values ((select id from e where clave = 'borrador'),
              (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]', 'P', '2000-01-01 00:00+00') $q$,
  'el médico registra un borrador enviando una fecha de creación del pasado'
);
select is(
  (select creado_en from public.atenciones where id = (select id from e where clave = 'borrador')), now(),
  'la atención se guarda con la hora del servidor, no con la del cliente'
);
select is(
  (select firma_huella from public.atenciones where id = (select id from e where clave = 'borrador')), null,
  'un borrador no tiene huella'
);
select lives_ok(
  $q$ update public.atenciones set firmada_en = '2000-01-01 00:00+00' where id = (select id from e where clave = 'borrador') $q$,
  'el autor firma enviando una hora de firma del pasado'
);
select is(
  (select firmada_en from public.atenciones where id = (select id from e where clave = 'borrador')), now(),
  'la atención queda firmada con la hora del servidor (pasado ignorado)'
);
select is(
  (select firma_metodo from public.atenciones where id = (select id from e where clave = 'borrador')), 'logica',
  'el método de firma es «logica»'
);
select is(
  (select firma_huella from public.atenciones where id = (select id from e where clave = 'borrador')),
  public.huella_atencion((select id from e where clave = 'borrador')),
  'la huella guardada al firmar coincide con su recálculo'
);

-- Otro borrador, firmado con una hora del futuro, por la función de firma.
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'borrador2'),
              (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]', 'P') $q$,
  'segundo borrador'
);
select lives_ok(
  $q$ update public.atenciones set firmada_en = '2099-01-01 00:00+00' where id = (select id from e where clave = 'borrador2') $q$,
  'firmar enviando una hora del futuro'
);
select is(
  (select firmada_en from public.atenciones where id = (select id from e where clave = 'borrador2')), now(),
  'la atención queda firmada con la hora del servidor (futuro ignorado)'
);

-- ---- El cliente no escribe método ni huella ----
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'borrador3'),
              (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]', 'P') $q$,
  'tercer borrador'
);
select throws_ok(
  $q$ update public.atenciones set firma_huella = 'v1:falsa' where id = (select id from e where clave = 'borrador3') $q$,
  '42501', null, 'el médico no escribe la huella (sin privilegio de columna)'
);
select throws_ok(
  $q$ update public.atenciones set firma_metodo = 'logica' where id = (select id from e where clave = 'borrador3') $q$,
  '42501', null, 'el médico no escribe el método de firma (sin privilegio de columna)'
);

-- ---- Addendas y antecedentes: la hora de creación también la fija el servidor ----
select lives_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto, creado_en)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'ma'), 'Corrección', '2000-01-01 00:00+00') $q$,
  'el médico agrega una addenda enviando una fecha del pasado'
);
select is(
  (select creado_en from public.addendas where atencion_id = (select id from e where clave = 'borrador')), now(),
  'la addenda se guarda con la hora del servidor'
);
select lives_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por, creado_en)
      values ((select id from e where clave = 'p1'), 'personal_patologico', 'Hipertensión', (select id from e where clave = 'ma'), '2000-01-01 00:00+00') $q$,
  'el médico registra un antecedente enviando una fecha del pasado'
);
select is(
  (select creado_en from public.antecedentes where paciente_id = (select id from e where clave = 'p1') and descripcion = 'Hipertensión'), now(),
  'el antecedente se guarda con la hora del servidor'
);

-- ---- Firmar: solo el autor, y los demás roles no firman ----
select tests.autenticar_como('medico_b');
select throws_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'borrador3')) $q$,
  '42501', 'No tiene acceso a esta atención', 'un médico a cargo que no es el autor no firma el borrador de otro'
);
select tests.autenticar_como('administrativo');
select throws_ok($q$ select public.firmar_atencion((select id from e where clave = 'borrador3')) $q$, '42501', 'No tiene acceso a esta atención', 'el administrativo no firma');
select tests.autenticar_como('enfermera');
select throws_ok($q$ select public.firmar_atencion((select id from e where clave = 'borrador3')) $q$, '42501', 'No tiene acceso a esta atención', 'la enfermera no firma');
select tests.autenticar_como('paciente_a');
select throws_ok($q$ select public.firmar_atencion((select id from e where clave = 'borrador3')) $q$, '42501', 'No tiene acceso a esta atención', 'el paciente no firma, ni siquiera su propia historia');
select tests.autenticar_como('sin_rol');
select throws_ok($q$ select public.firmar_atencion((select id from e where clave = 'borrador3')) $q$, '42501', 'No tiene acceso a esta atención', 'una sesión sin rol no firma');
select tests.volver_a_dueno();
select is(
  (select firmada_en from public.atenciones where id = (select id from e where clave = 'borrador3')), null,
  'ningún intento ajeno firmó el borrador'
);

select * from finish();
