-- Up Migration
-- H2 grupo 6, tarea 6.5 (esquema-rls-pgtap): una historia clínica es un registro legal. Lo firmado no se
-- altera ni se elimina; los antecedentes no se sobrescriben; las asignaciones solo se agregan.
-- Fuente: TECH-DESIGN.md, "Inmutabilidad de la historia clínica", y ADR-0015 y ADR-0016.

-- Atenciones: nunca se eliminan; una vez firmadas, nunca se modifican (la corrección es una addenda). Son
-- barreras de fondo: valen incluso para el rol dueño. SECURITY INVOKER: solo miran OLD/NEW.
create function public.proteger_atencion_firmada()
returns trigger
language plpgsql set search_path = ''
as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las atenciones clínicas no se eliminan' using errcode = '42501';
  end if;
  if old.firmada_en is not null then
    raise exception 'Atención firmada: use una addenda para corregir' using errcode = '42501';
  end if;
  return new;
end
$f$;

create trigger atenciones_inmutables
  before update or delete on public.atenciones
  for each row execute function public.proteger_atencion_firmada();

-- Addendas: la corrección conserva su propio texto, fecha y autor; no se edita ni se borra (append-only).
create function public.proteger_addenda()
returns trigger
language plpgsql set search_path = ''
as $f$
begin
  raise exception 'Las addendas no se modifican ni se eliminan: registre una nueva' using errcode = '42501';
end
$f$;

create trigger addendas_inmutables
  before update or delete on public.addendas
  for each row execute function public.proteger_addenda();

-- Antecedentes (ADR-0015): no se eliminan ni se reescriben; cuando dejan de aplicar se marcan como no vigentes
-- y, si corresponde, se registra uno nuevo. RLS no filtra por columna, así que el disparador impone que lo
-- único que cambia es `vigente`.
create function public.proteger_antecedente()
returns trigger
language plpgsql set search_path = ''
as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los antecedentes no se eliminan: márquelo como no vigente' using errcode = '42501';
  end if;
  if new.paciente_id is distinct from old.paciente_id
     or new.tipo is distinct from old.tipo
     or new.descripcion is distinct from old.descripcion
     or new.registrado_por is distinct from old.registrado_por
     or new.creado_en is distinct from old.creado_en then
    raise exception 'Un antecedente no se reescribe: márquelo como no vigente y registre uno nuevo' using errcode = '42501';
  end if;
  new.actualizado_en := now();
  return new;
end
$f$;

create trigger antecedentes_inmutables
  before update or delete on public.antecedentes
  for each row execute function public.proteger_antecedente();

-- Políticas de antecedentes: las mismas que atenciones (solo el médico a cargo); el administrativo, el paciente
-- y la enfermera no tienen política. Solo se puede actualizar `vigente`.
grant select, insert on public.antecedentes to authenticated;
grant update (vigente) on public.antecedentes to authenticated;

create policy antecedentes_lee_el_medico_a_cargo on public.antecedentes
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and (select public.medico_tiene_paciente(paciente_id))
  );

create policy antecedentes_registra_el_medico on public.antecedentes
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'medico'
    and (select public.medico_tiene_paciente(paciente_id))
    and registrado_por = (select public.medico_actual())
  );

create policy antecedentes_actualiza_el_medico_a_cargo on public.antecedentes
  for update to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and (select public.medico_tiene_paciente(paciente_id))
  )
  with check (
    (select public.rol_actual()) = 'medico'
    and (select public.medico_tiene_paciente(paciente_id))
  );

-- Asignaciones paciente-médico (ADR-0016): append-only. El administrativo lee e inserta asignaciones manuales
-- (interconsulta, cobertura de un colega, médico de cabecera); el médico solo lee las suyas; el paciente no
-- tiene política. El disparador de citas inserta como SECURITY DEFINER. Nadie edita ni borra: el acceso se
-- deja vencer. (TECH-DESIGN sugería `for all` para el administrativo, lo que permitiría editar.)
grant select, insert on public.asignaciones_paciente_medico to authenticated;

create policy asignaciones_lee_el_administrativo on public.asignaciones_paciente_medico
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

create policy asignaciones_inserta_el_administrativo on public.asignaciones_paciente_medico
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrativo');

create policy asignaciones_lee_el_medico_propio on public.asignaciones_paciente_medico
  for select to authenticated
  using (
    (select public.rol_actual()) = 'medico'
    and medico_id = (select public.medico_actual())
  );

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
