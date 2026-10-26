-- Up Migration
-- historias-clinicas, grupo 4, tarea 4.1: el registro de lecturas distingue qué se abrió (historia, atención o
-- adjunto) y deja de depender de la buena fe del cliente en lo que puede escribir. Ver
-- openspec/changes/historias-clinicas/design.md, D2 y D6 (H5), y specs/auditoria-de-accesos-clinicos.
--
-- La escritura del rastro sigue siendo la política `accesos_registra_el_medico` de H2 (médico a cargo, a su nombre):
-- la lectura la hace la aplicación en la MISMA transacción que este INSERT (lib/historia/repositorio.ts), así que si el
-- INSERT es rechazado se revierte todo y no se devuelve contenido. Esta migración no cambia ese modelo: lo completa.

-- Qué se abrió. `historia` por defecto: las filas de H2 (que solo tienen paciente) siguen siendo válidas. Sin clave
-- foránea en `adjunto_id`: la tabla de adjuntos llega en otro grupo del change (10.1) y el rastro no debe impedir ni
-- depender de ella.
alter table public.accesos_historia
  add column tipo_acceso text not null default 'historia',
  add column adjunto_id  uuid,
  add constraint accesos_historia_tipo_valido check (tipo_acceso in ('historia', 'atencion', 'adjunto'));

-- Coherencia entre el tipo y el identificador del recurso. NOT VALID: solo exige la regla a las filas nuevas (el
-- registro es solo-agregar, así que las anteriores no se pueden corregir).
alter table public.accesos_historia
  add constraint accesos_historia_recurso_coherente check (
    (tipo_acceso = 'historia' and atencion_id is null     and adjunto_id is null)
    or (tipo_acceso = 'atencion' and atencion_id is not null and adjunto_id is null)
    or (tipo_acceso = 'adjunto'  and adjunto_id  is not null and atencion_id is null)
  ) not valid;

-- Un acceso de tipo `atencion` solo se registra sobre una atención que existe Y es de ese paciente: sin esto, un
-- médico a cargo del paciente A podría dejar escrito «abrió la atención X» con una atención del paciente B, y el
-- administrativo leería un rastro falso. La subconsulta corre bajo la RLS del médico: una atención que no puede leer
-- (otro paciente sin asignación, inexistente) no cuenta y el INSERT se rechaza con 42501, igual que cualquier otro acceso
-- no permitido.
alter policy accesos_registra_el_medico on public.accesos_historia
  with check (
    (select public.rol_actual()) = 'medico'
    and actor_id = (select public.perfil_actual())
    and (select public.medico_tiene_paciente(paciente_id))
    and (
      tipo_acceso <> 'atencion'
      or exists (
        select 1 from public.atenciones a
        where a.id = accesos_historia.atencion_id
          and a.paciente_id = accesos_historia.paciente_id
      )
    )
  );

-- La hora del acceso la pone la base, no el cliente: con el INSERT de tabla completa de H2 un médico podía enviar
-- `creado_en` (y `id`). Se sustituye por un INSERT por columnas: lo único que el médico declara es quién, a quién, qué
-- tipo y qué recurso. `creado_en` toma su valor por defecto (`now()`, la hora de la transacción de la lectura) y el `id`
-- sale de la secuencia. Consecuencia: el INSERT no puede devolver filas (`returning` exige leer, y el médico no lee el
-- registro): la aplicación no lo usa.
revoke insert on public.accesos_historia from authenticated;
grant insert (actor_id, paciente_id, atencion_id, tipo_acceso, adjunto_id) on public.accesos_historia to authenticated;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
