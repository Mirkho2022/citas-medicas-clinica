-- historias-clinicas, grupos 7 y 8 (parte de base de datos): lo que hace falta para registrar, firmar y corregir una atención
-- con el aislamiento por médico a cargo. Cada rol incorrecto tiene su caso negativo. Spec: registro-de-atencion,
-- firma-y-addendas. Complementa a 43 (RLS), 44 (inmutabilidad) y 91 (sello): aquí van la función `firmar_atencion()`,
-- la atomicidad de «guardar y firmar», las addendas por rol y los privilegios de la función.
select plan(36);

-- Filas que afecta una sentencia de escritura (execute dentro de plpgsql: una CTE con escritura debe estar en el nivel superior).
create function pg_temp.afectadas(p_sql text) returns int language plpgsql as $f$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end
$f$;

-- ---- Datos de prueba (dueño) ----
insert into public.especialidades (nombre) values ('Esp registro y firma');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values
  (tests.sub('medico_a'), 'medico', 'Mario', 'Firma'),
  (tests.sub('medico_b'), 'medico', 'Marta', 'Firma'),
  (tests.sub('paciente_a'), 'paciente', 'Paula', 'Firma');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  select id, 'CMP-94-' || right(clerk_user_id, 1), (select id from public.especialidades where nombre = 'Esp registro y firma')
  from public.perfiles where clerk_user_id in (tests.sub('medico_a'), tests.sub('medico_b'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, perfil_id) values
  ('DNI', '79940001', 'Paula', 'Firma', '1990-01-01', 'F', 'p94a@demo.invalid', (select id from public.perfiles where clerk_user_id = tests.sub('paciente_a')));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email) values
  ('DNI', '79940002', 'Paciente', 'Ajeno', '1991-01-01', 'M', 'p94b@demo.invalid');

create temp table e (clave text primary key, id uuid);
grant select on e to public;
insert into e
  select 'ma', id from public.medicos where cmp = 'CMP-94-a'
  union all select 'mb', id from public.medicos where cmp = 'CMP-94-b'
  union all select 'p1', id from public.pacientes where numero_documento = '79940001'
  union all select 'p2', id from public.pacientes where numero_documento = '79940002'
  union all select c, gen_random_uuid() from unnest(array['borrador', 'firmada', 'ajena_firmada', 'atomica', 'de_b']) as c;

-- A y B están a cargo de P1. Nadie tiene a P2.
insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, motivo) values
  ((select id from e where clave = 'p1'), (select id from e where clave = 'ma'), public.hoy_lima() - 30, 'manual: prueba 94 A'),
  ((select id from e where clave = 'p1'), (select id from e where clave = 'mb'), public.hoy_lima() - 30, 'manual: prueba 94 B');

-- Una atención firmada de P2 (a cargo de nadie) por el médico B, sembrada por el dueño.
insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
  values ((select id from e where clave = 'ajena_firmada'),
          (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p2')),
          (select id from e where clave = 'p2'), (select id from e where clave = 'mb'),
          'Motivo', 'Anamnesis', 'Examen', '[{"cie10": "R51", "tipo": "definitivo"}]', 'Plan', now());

-- ---- Registro por el médico a cargo, a su nombre ----
select tests.autenticar_como('medico_a');
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      select (select id from e where clave = 'borrador'), h.id, h.paciente_id, public.medico_actual(),
             'Motivo', 'Anamnesis', 'Examen', '[{"cie10": "R51", "tipo": "definitivo"}]', 'Plan'
        from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1') $q$,
  'el médico a cargo registra su atención con la historia resuelta bajo RLS y su identidad tomada de la sesión'
);
select is(
  (select count(*)::int from public.atenciones where id = (select id from e where clave = 'borrador') and firmada_en is null), 1,
  'la atención queda como borrador, sin firmar'
);
-- Registrar una atención de un paciente ajeno con la forma `insert ... select` de la aplicación inserta CERO filas (la historia no es visible).
select is(
  pg_temp.afectadas($q$
    insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
    select h.id, h.paciente_id, public.medico_actual(), 'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]'::jsonb, 'P'
      from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p2') $q$),
  0,
  'registrar la atención de un paciente que no tiene a cargo no inserta nada (la historia no es visible)'
);
select throws_ok(
  $q$ insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      values ((select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1')),
              (select id from e where clave = 'p1'), (select id from e where clave = 'mb'),
              'A nombre de otro', 'a', 'b', '[{"cie10": "R51", "tipo": "definitivo"}]', 'c') $q$,
  '42501', null, 'el médico no registra la atención a nombre de otro médico'
);

-- ---- Atomicidad de «guardar y firmar»: si la firma falla, no se guarda nada ----
do $$
begin
  insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
  select (select id from e where clave = 'atomica'), h.id, h.paciente_id, public.medico_actual(), 'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]'::jsonb, 'P'
    from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1');
  perform public.firmar_atencion(gen_random_uuid());  -- falla: no existe
exception when sqlstate '42501' then
  null;  -- equivale a la transacción de la aplicación, que se revierte completa
end
$$;
select is_empty(
  $q$ select 1 from public.atenciones where id = (select id from e where clave = 'atomica') $q$,
  'si el segundo paso (firmar) falla, la atención del primer paso tampoco se guarda'
);

-- ---- Firmar: el autor, una sola vez ----
select lives_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'borrador')) $q$,
  'el autor firma su borrador'
);
select is(
  (select firmada_en from public.atenciones where id = (select id from e where clave = 'borrador')), now(),
  'la firma lleva la hora del servidor'
);
select throws_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'borrador')) $q$,
  '42501', 'Atención firmada: use una addenda para corregir', 'firmar una atención ya firmada se rechaza con el mensaje de la regla'
);
select throws_ok(
  $q$ select public.firmar_atencion(gen_random_uuid()) $q$,
  '42501', 'No tiene acceso a esta atención', 'firmar una atención que no existe da el mismo mensaje que una ajena'
);
select throws_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'ajena_firmada')) $q$,
  '42501', 'No tiene acceso a esta atención', 'firmar la atención de un paciente que no se tiene a cargo no revela que existe (ni que está firmada)'
);
select is(
  (select count(*)::int from public.atenciones where id = (select id from e where clave = 'ajena_firmada')), 0,
  'el médico no lee la atención de un paciente que no tiene a cargo'
);
select is(
  pg_temp.afectadas($q$ update public.atenciones set anamnesis = 'Reescrita' where id = (select id from e where clave = 'borrador') $q$),
  0,
  'editar una atención firmada no modifica ninguna fila (la política la excluye)'
);

-- ---- Addendas ----
select lives_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'ma'), 'Corrección del autor') $q$,
  'el autor agrega una addenda a su atención firmada'
);
select is(
  (select anamnesis from public.atenciones where id = (select id from e where clave = 'borrador')), 'Anamnesis',
  'la addenda no altera el texto original'
);
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'mb'), 'A nombre de otro') $q$,
  '42501', null, 'la addenda no se registra a nombre de otro médico'
);
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'ajena_firmada'), (select id from e where clave = 'ma'), 'Paciente ajeno') $q$,
  '42501', null, 'la addenda sobre la atención de un paciente que no se tiene a cargo se rechaza'
);
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'ma'), E' \t\n ') $q$,
  '23514', null, 'una addenda sin contenido se rechaza'
);
select throws_ok(
  $q$ update public.addendas set texto = 'Reescrita' where atencion_id = (select id from e where clave = 'borrador') $q$,
  '42501', 'permission denied for table addendas', 'una addenda no se modifica (el médico no tiene privilegio de UPDATE; el disparador lo impide además al dueño: prueba 44)'
);
select throws_ok(
  $q$ delete from public.addendas where atencion_id = (select id from e where clave = 'borrador') $q$,
  '42501', 'permission denied for table addendas', 'una addenda no se elimina (sin privilegio de DELETE; el disparador lo impide además al dueño: prueba 44)'
);

-- Un borrador sin firmar no admite addenda (se edita directamente).
select lives_ok(
  $q$ insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
      select (select id from e where clave = 'firmada'), h.id, h.paciente_id, public.medico_actual(), 'M', 'A', 'E', '[{"cie10": "R51", "tipo": "definitivo"}]'::jsonb, 'P'
        from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p1') $q$,
  'otro borrador del autor'
);
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'firmada'), (select id from e where clave = 'ma'), 'Addenda a un borrador') $q$,
  '42501', null, 'no se agrega una addenda a un borrador sin firmar'
);

-- ---- Otro médico a cargo (B): ve la atención firmada y agrega addenda con su propia autoría; no firma ni edita el borrador ajeno ----
select tests.autenticar_como('medico_b');
select is(
  (select count(*)::int from public.atenciones where paciente_id = (select id from e where clave = 'p1')), 2,
  'el otro médico a cargo ve las atenciones del paciente (firmada y borrador)'
);
select lives_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'mb'), 'Addenda del colega') $q$,
  'otro médico a cargo agrega su propia addenda a la atención firmada'
);
select is(
  (select count(*)::int from public.addendas where atencion_id = (select id from e where clave = 'borrador')), 2,
  'las addendas de ambos médicos se ven, cada una con su autor'
);
select throws_ok(
  $q$ select public.firmar_atencion((select id from e where clave = 'firmada')) $q$,
  '42501', 'No tiene acceso a esta atención', 'otro médico a cargo no firma el borrador de su colega'
);
select is(
  pg_temp.afectadas($q$ update public.atenciones set anamnesis = 'Intento ajeno' where id = (select id from e where clave = 'firmada') $q$),
  0,
  'otro médico a cargo no edita el borrador de su colega'
);

-- ---- Otros roles: nada ----
select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.addendas), 0, 'el administrativo no lee addendas');
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'ma'), 'Admin') $q$,
  '42501', null, 'el administrativo no agrega addendas'
);
select is(public.huella_atencion((select id from e where clave = 'borrador')), null, 'el administrativo no obtiene la huella de ninguna atención');
select tests.autenticar_como('enfermera');
select is((select count(*)::int from public.addendas), 0, 'la enfermera no lee addendas');
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'ma'), 'Enfermera') $q$,
  '42501', null, 'la enfermera no agrega addendas'
);
select tests.autenticar_como('paciente_a');
select is((select count(*)::int from public.addendas), 0, 'el paciente no lee addendas, ni las de su propia historia');
select throws_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'borrador'), (select id from e where clave = 'ma'), 'Paciente') $q$,
  '42501', null, 'el paciente no agrega addendas'
);
select tests.autenticar_como('sin_rol');
select is((select count(*)::int from public.addendas), 0, 'una sesión sin rol no lee addendas');

-- ---- Privilegios de las funciones nuevas ----
select tests.volver_a_dueno();
select ok(
  has_function_privilege('authenticated', 'public.firmar_atencion(uuid)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.firmar_atencion(uuid)', 'EXECUTE')
  and not has_function_privilege('cron_notificaciones', 'public.firmar_atencion(uuid)', 'EXECUTE')
  and not has_function_privilege('sync_identidad', 'public.firmar_atencion(uuid)', 'EXECUTE'),
  'firmar_atencion() solo es ejecutable por authenticated'
);
select ok(
  has_function_privilege('authenticated', 'public.huella_atencion(uuid)', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.huella_atencion(uuid)', 'EXECUTE')
  and not has_function_privilege('cron_notificaciones', 'public.huella_atencion(uuid)', 'EXECUTE')
  and not has_function_privilege('sync_identidad', 'public.huella_atencion(uuid)', 'EXECUTE'),
  'huella_atencion() solo es ejecutable por authenticated'
);

select * from finish();
