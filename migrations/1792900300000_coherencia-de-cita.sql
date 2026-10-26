-- Up Migration
-- historias-clinicas, tarea 3.2 (design.md, D6, hueco H4): `atenciones.cita_id` no comprobaba que la cita fuera del mismo
-- paciente y del mismo médico (la clave foránea ignora RLS): un médico podía atar su atención a la cita de otro, o
-- «gastar» el `unique` de una cita ajena y bloquear la atención de su colega.
--
-- SECURITY DEFINER con search_path vacío: lee `citas` sin que el médico necesite verla, y solo compara identificadores
-- (no devuelve ningún dato de la cita). SQLSTATE propio `HC003`. El `unique` de `cita_id` ya impide una segunda atención
-- para la misma cita (`23505`).
create function public.validar_cita_de_atencion()
returns trigger
language plpgsql security definer set search_path = ''
as $f$
begin
  if new.cita_id is not null and (tg_op = 'INSERT' or new.cita_id is distinct from old.cita_id) then
    if not exists (
      select 1 from public.citas c
      where c.id = new.cita_id and c.paciente_id = new.paciente_id and c.medico_id = new.medico_id
    ) then
      raise exception 'La cita indicada no corresponde a este paciente y a este médico' using errcode = 'HC003';
    end if;
  end if;
  return new;
end
$f$;

revoke execute on function public.validar_cita_de_atencion() from public;

create trigger atenciones_coherencia_de_cita
  before insert or update of cita_id on public.atenciones
  for each row execute function public.validar_cita_de_atencion();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
