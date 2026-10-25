# ADR 0016: Vigencia temporal de la asignación paciente-médico

## Estado

Aceptado — confirmado por el cliente el 2026-09-23, a partir de un hallazgo de revisión
adversarial del diseño sobre [ADR-0003](0003-control-de-acceso-a-historias-clinicas.md).

## Contexto

[ADR-0003](0003-control-de-acceso-a-historias-clinicas.md) resuelve "paciente a cargo" con
`medico_tiene_paciente()`, que evalúa verdadero si existe una asignación vigente en
`asignaciones_paciente_medico` **o** cualquier cita histórica en estado `confirmada`/`atendida`
entre ese médico y ese paciente, sin límite de tiempo. En la práctica, ningún Server Action escribe
en `asignaciones_paciente_medico`, así que toda concesión real de acceso pasa por la rama de
`citas` — y esa rama no expira: un médico que atendió a un paciente una sola vez, por cualquier
motivo, conserva lectura y escritura sobre toda su historia clínica para siempre. Esto contradice
el requisito del PRD de que el médico solo acceda a "los pacientes a su cargo" y es precisamente el
riesgo que RLS existe para prevenir — es el riesgo principal declarado del proyecto
([CLAUDE.md](../../../CLAUDE.md)).

## Decisión

- `asignaciones_paciente_medico` pasa a ser **append-only** (mismo principio de no-destrucción que
  `atenciones`/`antecedentes`, ver [ADR-0005](0005-modelo-de-datos-y-prevencion-de-doble-reserva.md))
  y es la **única** fuente de verdad de acceso; se elimina la rama directa sobre `citas` de
  `medico_tiene_paciente()`.
- Un trigger sobre `citas` (`extender_asignacion_por_cita`) inserta automáticamente una fila
  cuando una cita entra por primera vez a `confirmada` o `atendida`, con
  `vigente_hasta = inicio + 6 meses`:

  ```sql
  create or replace function public.extender_asignacion_por_cita()
  returns trigger language plpgsql security definer set search_path = ''
  as $$
  begin
    if new.estado in ('confirmada','atendida')
       and (old is null or old.estado not in ('confirmada','atendida')) then
      insert into public.asignaciones_paciente_medico
        (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo)
      values
        (new.paciente_id, new.medico_id, current_date,
         (new.inicio::date + interval '6 months')::date,
         'cita:' || new.id);
    end if;
    return new;
  end;
  $$;

  create trigger citas_extender_asignacion
    after insert or update on citas
    for each row execute function public.extender_asignacion_por_cita();
  ```

  El acceso empieza en `confirmada` (para que el médico revise antecedentes antes de la consulta)
  y se otorga sin importar si la cita luego se cancela o se marca `no_asistio` — cancelar **no**
  revoca el acceso ya concedido; se deja expirar de forma natural a los 6 meses.
- Server Action nuevo `asignarPacienteAMedico` (solo administrativo) para asignaciones manuales —
  interconsulta, cobertura de colega, médico de cabecera de largo plazo — con `vigente_hasta`
  opcional (`null` = sin vencimiento).
- `asignaciones_paciente_medico` obtiene sus propias políticas RLS (hoy no tenía ninguna definida):
  el trigger inserta como `security definer`, así que no depende de que quien confirma la cita
  tenga permiso de escritura directa sobre esta tabla; el administrativo gestiona todo (lee e
  inserta asignaciones manuales); el médico solo lee sus propias asignaciones; el paciente no tiene
  ninguna política.

## Alternativas consideradas

- **Solo asignación explícita, sin automatismo** — más control (cada asignación es una decisión
  humana registrada), pero agrega un paso operativo a cada primera consulta que hoy no existe en el
  flujo de reserva. Se descartó porque introduce fricción en el camino más común (paciente reserva
  → médico atiende) a cambio de un control que el automatismo con expiración ya cubre
  razonablemente.
- **Ventana temporal calculada al vuelo sobre `citas`, sin tabla de asignaciones** — evita el
  trigger y mantiene la lógica en una sola función, pero pierde el registro explícito de qué
  asignación estuvo vigente y por qué (se pierde el campo `motivo`), y no deja un lugar natural
  para las asignaciones manuales de casos especiales sin reintroducir una rama aparte en la
  función.
- **Revocar el acceso al cancelar la cita** — cierra el riesgo residual por completo, pero se
  descartó por simplicidad frente a una exposición ya acotada a 6 meses y mitigada por la
  auditoría de lecturas en `accesos_historia`.

## Consecuencias

- El acceso a una historia clínica siempre tiene fecha de vencimiento salvo asignación manual
  explícita, cerrando el hallazgo de la revisión adversarial sin agregar un paso manual al flujo
  normal de reserva/atención.
- `asignaciones_paciente_medico` deja de ser una tabla sin ningún flujo que la escriba: cada cita
  relevante deja un rastro auditable de qué médico tuvo acceso y por qué (columna `motivo`).
- **Trade-off:** cancelar una cita no revoca el acceso ya otorgado — un médico conserva acceso
  hasta 6 meses después de la fecha de una cita cancelada. Se acepta porque la auditoría de
  lecturas (`accesos_historia`, ver [ADR-0003](0003-control-de-acceso-a-historias-clinicas.md))
  permite detectar un acceso indebido durante esa ventana, y porque revocar en cancelación
  complica el trigger para un riesgo residual ya acotado en el tiempo.
- La tabla crece con una fila por cada cita que alcanza `confirmada`/`atendida` (no se sobrescribe
  ninguna); a la escala de una clínica esto es proporcional al volumen de citas, no un problema de
  crecimiento sin control.

**Nota (2026-10-19, H3) — propuesta, pendiente de revisión humana:** quien confirma la cita es la **recepción** (rol administrativo):
`reservada → confirmada` y `confirmada → no_asistio`; el médico solo marca `confirmada → atendida`, sobre sus propias citas, con
`marcar_cita_atendida()`. Un disparador cierra la matriz de transiciones para el usuario de la aplicación. Confirmar es el hecho que
concede al médico el acceso a la historia; reprogramar y reasignar crean la cita nueva `reservada`, sin acceso hasta que se confirme.
No cambia el texto de la decisión.
