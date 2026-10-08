-- Up Migration
-- H2 grupo 5, tarea 5.3 (esquema-rls-pgtap): ventana de cancelación de 1 hora para TODOS los roles
-- (ADR-0012), con la excepción por baja médica (ADR-0011). Ver design.md, D6.
--
-- SECURITY DEFINER: la excepción consulta bloqueos_agenda y esa consulta no debe pasar por la RLS de
-- quien cancela (un paciente no ve los bloqueos). Si no, la excepción dependería del rol, contra
-- ADR-0012: es una condición de datos, no de rol. perfil_actual() ya es DEFINER y es lo único que toca auth.*.
--
-- Se mide contra OLD.inicio y no contra NEW.inicio: con NEW, un UPDATE que cancela y a la vez mueve
-- la cita al futuro esquivaría la ventana.
create function public.validar_cancelacion()
returns trigger
language plpgsql security definer set search_path = ''
as $f$
declare
  v_es_por_baja boolean;
begin
  if new.estado = 'cancelada' and old.estado <> 'cancelada' then
    -- Excepción: un bloqueo de agenda del mismo médico que alcanza la cita indica que la cancelación
    -- forma parte de la reasignación por baja o emergencia, no de una cancelación discrecional.
    select exists (
      select 1 from public.bloqueos_agenda b
      where b.medico_id = old.medico_id
        and b.rango && old.rango
    ) into v_es_por_baja;

    if not v_es_por_baja and old.inicio - now() < interval '1 hour' then
      raise exception 'No es posible cancelar con menos de 1 hora de anticipación'
        using errcode = 'P0001';
    end if;

    new.cancelada_en  := now();
    new.cancelada_por := public.perfil_actual();
  end if;
  return new;
end
$f$;

create trigger citas_validar_cancelacion
  before update on public.citas
  for each row execute function public.validar_cancelacion();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
