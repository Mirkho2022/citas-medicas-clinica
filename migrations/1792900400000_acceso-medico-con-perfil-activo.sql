-- Up Migration
-- historias-clinicas, tarea 3.4 (design.md, D6, hueco H8): `medico_tiene_paciente()` no miraba `perfiles.activo`, así que
-- un perfil desactivado conservaba el acceso clínico en la base hasta que expirara su token.
--
-- RIESGO PRINCIPAL DEL PROYECTO: es la función central de acceso a las historias clínicas (ADR-0003, ADR-0016) y la
-- usan las políticas de historias, atenciones, addendas, antecedentes y accesos. Misma firma y mismo comportamiento;
-- solo se AÑADE una condición (el perfil del médico debe estar activo). `create or replace` conserva dueño y permisos.
create or replace function public.medico_tiene_paciente(p_paciente uuid)
returns boolean
language sql stable security definer set search_path = ''
as $f$
  select exists (
    select 1
    from public.asignaciones_paciente_medico a
    join public.medicos m on m.id = a.medico_id and m.activo
    join public.perfiles pf on pf.id = m.perfil_id and pf.activo
    where a.paciente_id = p_paciente
      and a.medico_id = public.medico_actual()
      and a.vigente_desde <= public.hoy_lima()
      and (a.vigente_hasta is null or a.vigente_hasta >= public.hoy_lima())
  )
$f$;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
