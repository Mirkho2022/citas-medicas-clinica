-- Up Migration
-- H2 grupo 6, tarea 6.2 (esquema-rls-pgtap): cada paciente tiene exactamente una historia clínica, creada
-- automáticamente al registrarlo. Ver design.md, D3.

-- Correlativo visible de la historia (HC-000001, HC-000002, ...). Una secuencia no se revierte: puede haber
-- saltos, nunca repetidos.
create sequence historias_clinicas_numero_seq;

-- SECURITY DEFINER: quien registra al paciente (el administrativo) no tiene —ni debe tener— privilegios
-- sobre historias_clinicas. Es lo que permite que el administrativo registre pacientes sin ver contenido
-- clínico. La función no la llama nadie directamente: solo el disparador.
create function public.crear_historia_clinica()
returns trigger
language plpgsql security definer set search_path = ''
as $f$
begin
  insert into public.historias_clinicas (paciente_id, numero)
  values (new.id, 'HC-' || lpad(nextval('public.historias_clinicas_numero_seq')::text, 6, '0'));
  return new;
end
$f$;

revoke execute on function public.crear_historia_clinica() from public;

create trigger pacientes_crear_historia
  after insert on public.pacientes
  for each row execute function public.crear_historia_clinica();

-- Pacientes que ya existían sin historia (idempotente; en producción aún no hay ninguno).
insert into public.historias_clinicas (paciente_id, numero)
select p.id, 'HC-' || lpad(nextval('public.historias_clinicas_numero_seq')::text, 6, '0')
from public.pacientes p
where not exists (select 1 from public.historias_clinicas h where h.paciente_id = p.id)
order by p.creado_en;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
