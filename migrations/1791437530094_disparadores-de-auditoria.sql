-- Up Migration
-- H2 grupo 7, tarea 7.4 (esquema-rls-pgtap): auditoría de escritura alimentada por disparadores.
-- Ver design.md, D6. TECH-DESIGN no fija qué tablas audita; se auditan las de identidad, agenda y acceso, y las tres
-- tablas clínicas, estas últimas SIN contenido.

-- SECURITY DEFINER: quien escribe (un usuario, el webhook de sincronización) no tiene privilegios sobre
-- `auditoria`. Una fila de auditoría de una tabla clínica NO copia el contenido: el administrativo lee `auditoria`
-- y, si se volcaran atenciones, addendas o antecedentes en datos_antes/datos_despues, leería historias clínicas
-- por esa vía. Para esas tablas queda quién, cuándo, qué acción y el id del registro.
create function public.registrar_auditoria()
returns trigger
language plpgsql security definer set search_path = ''
as $f$
declare
  v_clinica boolean := tg_table_name in ('atenciones', 'addendas', 'antecedentes');
  v_rol     text    := public.rol_actual();
begin
  insert into public.auditoria (actor_id, actor_rol, accion, tabla, registro_id, datos_antes, datos_despues)
  values (
    public.perfil_actual(),
    -- Un rol desconocido en el token no debe romper la escritura auditada: se registra como nulo.
    case when v_rol in ('administrativo', 'medico', 'enfermera', 'paciente') then v_rol::public.rol_usuario end,
    tg_op,
    tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end,
    case when v_clinica or tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when v_clinica or tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end
$f$;

revoke execute on function public.registrar_auditoria() from public;

create trigger perfiles_auditoria
  after insert or update or delete on public.perfiles
  for each row execute function public.registrar_auditoria();
create trigger pacientes_auditoria
  after insert or update or delete on public.pacientes
  for each row execute function public.registrar_auditoria();
create trigger citas_auditoria
  after insert or update or delete on public.citas
  for each row execute function public.registrar_auditoria();
create trigger asignaciones_auditoria
  after insert or update or delete on public.asignaciones_paciente_medico
  for each row execute function public.registrar_auditoria();
create trigger atenciones_auditoria
  after insert or update or delete on public.atenciones
  for each row execute function public.registrar_auditoria();
create trigger addendas_auditoria
  after insert or update or delete on public.addendas
  for each row execute function public.registrar_auditoria();
create trigger antecedentes_auditoria
  after insert or update or delete on public.antecedentes
  for each row execute function public.registrar_auditoria();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
