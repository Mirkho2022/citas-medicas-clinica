-- historias-clinicas, tareas 3.2 y 3.3 (design.md, D6, hueco H4): la cita vinculada a una atención debe ser del mismo paciente
-- y del mismo médico, y tener como máximo una atención; firmar no cambia el estado de la cita (design.md, D13).
-- Spec: registro-de-atencion («Vínculo opcional con la cita»), firma-y-addendas («Firmar no cambia el estado de la cita»).
select plan(13);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp coherencia de cita');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'Cita'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'Cita');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-92-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp coherencia de cita')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '79920001', 'Paciente', 'Uno', '1990-01-01', 'F', 'p92a@demo.invalid'),
  ('DNI', '79920002', 'Paciente', 'Dos', '1991-01-01', 'M', 'p92b@demo.invalid');

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-92-a'
  union all select 'mb', id from public.medicos where cmp = 'CMP-92-b'
  union all select 'p1', id from public.pacientes where numero_documento = '79920001'
  union all select 'p2', id from public.pacientes where numero_documento = '79920002'
  union all select c, gen_random_uuid() from unnest(array['cita_ok', 'cita_de_b', 'cita_de_p2', 'at1', 'at2']) as c;

-- Citas confirmadas (esto crea la asignación vigente: el disparador de citas inserta la del médico con su paciente).
insert into public.citas (id, paciente_id, medico_id, inicio, fin, estado, origen) values
  ((select id from e where clave = 'cita_ok'),    (select id from e where clave = 'p1'), (select id from e where clave = 'ma'), now() + interval '30 days', now() + interval '30 days 30 minutes', 'confirmada', 'administrativo'),
  ((select id from e where clave = 'cita_de_b'),  (select id from e where clave = 'p1'), (select id from e where clave = 'mb'), now() + interval '31 days', now() + interval '31 days 30 minutes', 'confirmada', 'administrativo'),
  ((select id from e where clave = 'cita_de_p2'), (select id from e where clave = 'p2'), (select id from e where clave = 'ma'), now() + interval '32 days', now() + interval '32 days 30 minutes', 'confirmada', 'administrativo');
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo)
  values ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), public.hoy_lima() - 1, 'manual: prueba 92')
  on conflict do nothing;

create function pg_temp.insertar(p_id uuid, p_cita text) returns void
language plpgsql as $f$
begin
  insert into public.atenciones (id, historia_id, paciente_id, cita_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  values (p_id, (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
          (select id from e where clave = 'p1'), (select id from e where clave = p_cita), (select id from e where clave = 'ma'),
          'Motivo', 'Anamnesis', 'Examen', '[{"cie10": "R51", "tipo": "definitivo"}]', 'Plan');
end
$f$;

-- ---- Como el médico A, a cargo de P1 ----
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), 'cita_de_b') $q$,
  'HC003', null, 'no se vincula la atención a una cita de OTRO médico'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), 'cita_de_p2') $q$,
  'HC003', null, 'no se vincula la atención de un paciente a la cita de OTRO paciente'
);
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select id from e where clave = 'at2'),
              (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'ma'),
              'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]', 'P') $q$,
  'una atención sin cita vinculada se guarda con normalidad'
);
select lives_ok(
  $q$ select pg_temp.insertar((select id from e where clave = 'at1'), 'cita_ok') $q$,
  'la atención vinculada a una cita del mismo médico y paciente se guarda'
);
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), 'cita_ok') $q$,
  '23505', null, 'una segunda atención para la misma cita se rechaza'
);

-- ---- Firmar no cambia el estado de la cita ----
select lives_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'at1')) $q$,
  'el autor firma la atención vinculada a la cita'
);
select tests.volver_a_dueno();
select is(
  (select estado::text from public.citas where id = (select id from e where clave = 'cita_ok')), 'confirmada',
  'firmar la atención NO cambia el estado de la cita'
);
select isnt(
  (select firmada_en from public.atenciones where id = (select id from e where clave = 'at1')), null,
  'y la atención quedó firmada'
);

-- ---- El disparador también cubre el UPDATE de cita_id (solo lo puede hacer el dueño: authenticated no tiene el privilegio) ----
select throws_ok(
  $q$ update public.atenciones set cita_id = (select id from e where clave = 'cita_de_b') where id = (select id from e where clave = 'at2') $q$,
  'HC003', null, 'cambiar cita_id a la cita de otro médico también se rechaza'
);

-- ---- Un médico no puede mover la cita de una atención (sin privilegio de columna) ----
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ update public.atenciones set cita_id = (select id from e where clave = 'cita_ok') where id = (select id from e where clave = 'at2') $q$,
  '42501', null, 'el médico no puede reasignar la cita de una atención existente'
);

-- ---- Otros roles: ni leen ni vinculan ----
select tests.autenticar_como('medico_b');
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, cita_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'cita_ok'), (select id from e where clave = 'mb'),
              'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]', 'P') $q$,
  'HC003', null, 'el médico B no gasta ni vincula la cita de su colega A, aunque tenga al paciente a cargo'
);
select tests.autenticar_como('administrativo');
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), 'cita_ok') $q$,
  '42501', null, 'el administrativo no registra atenciones'
);
select tests.autenticar_como('paciente_a');
select throws_ok(
  $q$ select pg_temp.insertar(gen_random_uuid(), 'cita_ok') $q$,
  '42501', null, 'el paciente no registra atenciones'
);
select tests.volver_a_dueno();

select * from finish();
