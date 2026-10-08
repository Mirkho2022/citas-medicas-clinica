-- Historias clínicas (H2, tarea 6.5): una atención firmada no se altera ni se elimina; las addendas son
-- solo-agregar. Spec: integridad-historia-clinica. Estas barreras valen incluso para el rol dueño.
select plan(14);

-- Datos de prueba (dueño).
insert into public.especialidades (nombre) values ('Esp inmutabilidad');
insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_test_im_m1', 'medico', 'Mario', 'Im');
insert into public.medicos (perfil_id, cmp, especialidad_id)
  values ((select id from public.perfiles where clerk_user_id = 'user_test_im_m1'), 'CMP-IM-0001',
          (select id from public.especialidades where nombre = 'Esp inmutabilidad'));
insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
  values ('DNI', '79100001', 'Paciente', 'Im', '1990-01-01', 'F', 'im@demo.invalid');

create temp table e (clave text primary key, id uuid);
insert into e
  select 'medico', id from public.medicos where cmp = 'CMP-IM-0001'
  union all select 'p', id from public.pacientes where numero_documento = '79100001'
  union all select 'firmada', gen_random_uuid()
  union all select 'sin_firmar', gen_random_uuid()
  union all select 'sin_firmar_2', gen_random_uuid();

insert into public.atenciones (id, historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
select (select id from e where clave = c.clave),
       (select h.id from public.historias_clinicas h where h.paciente_id = (select id from e where clave = 'p')),
       (select id from e where clave = 'p'), (select id from e where clave = 'medico'),
       'Motivo', 'Anamnesis original', 'Examen', '[{"cie10": "R51"}]', 'Plan', case when c.firmada then now() end
from (values ('firmada', true), ('sin_firmar', false), ('sin_firmar_2', false)) as c(clave, firmada);

-- ---- Atención firmada: ni se modifica ni se elimina ----
select throws_ok(
  $q$ update public.atenciones set anamnesis = 'Alterada' where id = (select id from e where clave = 'firmada') $q$,
  '42501', 'Atención firmada: use una addenda para corregir',
  'una atención firmada no se puede modificar'
);
select throws_ok(
  $q$ update public.atenciones set firmada_en = null where id = (select id from e where clave = 'firmada') $q$,
  '42501', 'Atención firmada: use una addenda para corregir',
  'tampoco se puede «des-firmar»'
);
select throws_ok(
  $q$ delete from public.atenciones where id = (select id from e where clave = 'firmada') $q$,
  '42501', 'Las atenciones clínicas no se eliminan',
  'una atención firmada no se puede eliminar'
);
select throws_ok(
  $q$ delete from public.atenciones where id = (select id from e where clave = 'sin_firmar') $q$,
  '42501', 'Las atenciones clínicas no se eliminan',
  'ninguna atención se elimina, ni siquiera sin firmar'
);
select lives_ok(
  $q$ update public.atenciones set anamnesis = 'Editada antes de firmar' where id = (select id from e where clave = 'sin_firmar') $q$,
  'una atención sin firmar sí se puede editar'
);
select lives_ok(
  $q$ update public.atenciones set firmada_en = now() where id = (select id from e where clave = 'sin_firmar') $q$,
  'firmar una atención es poner firmada_en'
);
select throws_ok(
  $q$ update public.atenciones set anamnesis = 'Tras firmar' where id = (select id from e where clave = 'sin_firmar') $q$,
  '42501', 'Atención firmada: use una addenda para corregir',
  'tras firmar, la atención queda inmutable'
);

-- ---- Addenda: corrige sin alterar el original, y ella misma es solo-agregar ----
select lives_ok(
  $q$ insert into public.addendas (atencion_id, medico_id, texto)
      values ((select id from e where clave = 'firmada'), (select id from e where clave = 'medico'), 'Corrección posterior') $q$,
  'una addenda se agrega sobre la atención firmada'
);
select is(
  (select anamnesis from public.atenciones where id = (select id from e where clave = 'firmada')), 'Anamnesis original',
  'la addenda no altera el texto original de la atención'
);
select throws_ok(
  $q$ update public.addendas set texto = 'Reescrita' where atencion_id = (select id from e where clave = 'firmada') $q$,
  '42501', null, 'una addenda no se modifica'
);
select throws_ok(
  $q$ delete from public.addendas where atencion_id = (select id from e where clave = 'firmada') $q$,
  '42501', null, 'una addenda no se elimina'
);

-- ---- Definición ----
select has_trigger('public', 'atenciones', 'atenciones_inmutables', 'atenciones tiene su disparador de inmutabilidad');
select has_trigger('public', 'addendas', 'addendas_inmutables', 'addendas tiene su disparador de solo-agregar');
select has_trigger('public', 'antecedentes', 'antecedentes_inmutables', 'antecedentes tiene su disparador de no-sobrescritura');

select * from finish();
