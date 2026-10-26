-- historias-clinicas, tarea 3.4 (design.md, D6, hueco H8): `medico_tiene_paciente()` exige también `perfiles.activo`. Un médico
-- con el perfil desactivado pierde el acceso a atenciones, historias, antecedentes y accesos aunque su asignación siga vigente y
-- su `medicos.activo` sea verdadero; al reactivarlo lo recupera. Es la función central de acceso clínico: cada ruta de
-- lectura y de escritura tiene su caso.
select plan(16);

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp perfil activo');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values (tests.sub('medico_a'), 'medico', 'Mario', 'Activo');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = tests.sub('medico_a')), 'CMP-93-0001',
          (select id from public.especialidades where nombre = 'Esp perfil activo'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  values ('DNI', '79930001', 'Paciente', 'Activo', '1990-01-01', 'F', 'p93@demo.invalid');

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-93-0001'
  union all select 'p', id from public.pacientes where numero_documento = '79930001'
  union all select 'at', gen_random_uuid()
  union all select 'at_nueva', gen_random_uuid();

insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo)
  values ((select id from e where clave = 'p'), (select id from e where clave = 'ma'), public.hoy_lima() - 1, 'manual: prueba 93');
insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  values ((select id from e where clave = 'at'),
          (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p')),
          (select id from e where clave = 'p'), (select id from e where clave = 'ma'),
          'Motivo', 'Anamnesis', 'Examen', '[{"cie10": "R51", "tipo": "definitivo"}]', 'Plan');
insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
  values ((select id from e where clave = 'p'), 'alergico', 'Penicilina', (select id from e where clave = 'ma'));
insert into public.accesos_historia (actor_id, paciente_id)
  values ((select id from public.perfiles where clerk_user_id = tests.sub('medico_a')), (select id from e where clave = 'p'));

-- ---- Con el perfil activo (línea base) ----
select tests.autenticar_como('medico_a');
select ok((select public.medico_tiene_paciente((select id from e where clave = 'p'))), 'perfil activo: el médico tiene al paciente a cargo');
select is((select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'p')), 1, 'perfil activo: lee las atenciones');

-- ---- Se desactiva el perfil (el dueño; el disparador de rol solo deja cambiarlo al administrativo o a la sincronización) ----
select tests.volver_a_dueno();
alter table public.perfiles disable trigger perfiles_bloquear_rol;
update public.perfiles set activo = false where clerk_user_id = tests.sub('medico_a');
alter table public.perfiles enable trigger perfiles_bloquear_rol;
select ok(
  (select m.activo from public.medicos m where m.id = (select id from e where clave = 'ma')),
  'precondición: medicos.activo sigue siendo verdadero y la asignación sigue vigente'
);

select tests.autenticar_como('medico_a');
select ok(not (select public.medico_tiene_paciente((select id from e where clave = 'p'))), 'perfil desactivado: medico_tiene_paciente() es falso');
select is((select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'p')), 0, 'perfil desactivado: no lee atenciones');
select is((select count(*)::int from public.historias_clinicas where paciente_id = (select id from e where clave = 'p')), 0, 'perfil desactivado: no lee la historia');
select is((select count(*)::int from public.antecedentes where paciente_id = (select id from e where clave = 'p')), 0, 'perfil desactivado: no lee antecedentes');
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p')),
              (select id from e where clave = 'p'), (select id from e where clave = 'ma'),
              'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]', 'P') $q$,
  '42501', null, 'perfil desactivado: no registra atenciones'
);
select throws_ok(
  $q$ insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
      values ((select id from e where clave = 'p'), 'alergico', 'Polen', (select id from e where clave = 'ma')) $q$,
  '42501', null, 'perfil desactivado: no registra antecedentes'
);
select throws_ok(
  $q$ insert into public.accesos_historia (actor_id, paciente_id)
      values ((select public.perfil_actual()), (select id from e where clave = 'p')) $q$,
  '42501', null, 'perfil desactivado: no registra accesos a la historia'
);
select throws_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'at')) $q$,
  '42501', 'No tiene acceso a esta atención', 'perfil desactivado: no firma sus propios borradores'
);

-- ---- Se reactiva ----
select tests.volver_a_dueno();
alter table public.perfiles disable trigger perfiles_bloquear_rol;
update public.perfiles set activo = true where clerk_user_id = tests.sub('medico_a');
alter table public.perfiles enable trigger perfiles_bloquear_rol;

select tests.autenticar_como('medico_a');
select ok((select public.medico_tiene_paciente((select id from e where clave = 'p'))), 'al reactivar el perfil recupera el acceso');
select is((select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'p')), 1, 'al reactivarlo lee de nuevo las atenciones');
select lives_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'at')) $q$,
  'al reactivarlo firma su borrador'
);

-- ---- Un médico con medicos.activo = false sigue sin acceso (comportamiento de H2 conservado) ----
select tests.volver_a_dueno();
update public.medicos set activo = false where id = (select id from e where clave = 'ma');
select tests.autenticar_como('medico_a');
select ok(not (select public.medico_tiene_paciente((select id from e where clave = 'p'))), 'un médico dado de baja sigue sin acceso');
select tests.autenticar_como('administrativo');
select ok(not (select public.medico_tiene_paciente((select id from e where clave = 'p'))), 'el administrativo no es médico a cargo de nadie');

select * from finish();
