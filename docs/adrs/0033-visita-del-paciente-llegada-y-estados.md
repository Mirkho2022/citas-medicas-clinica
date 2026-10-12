# ADR 0033: Visita del paciente: llegada, estados y quién transiciona

## Estado

**Propuesto** — pendiente de aceptación del usuario. Detalle en `openspec/changes/triaje-y-derivacion/design.md` (D1, D2, D14).
Cierra la decisión que H7 (`turnos-y-dashboard`, D14) reservó a una ADR: cómo se define «en espera».

## Contexto

La clínica atiende pacientes con y sin cita. El PRD (2026-10-11) añade el triaje por enfermería y la derivación entre
especialidades. Hoy solo existen `citas` y sus estados, que son de H3 y no representan a un paciente sin cita ni el paso por
triaje. Hace falta un lugar donde anclar «llegó», «fue triado», «espera a una especialidad» y «está en consulta», y desde el que
H7 pueda medir la espera de la métrica de 20 minutos.

## Decisión propuesta

- Una entidad propia, **`visitas`**: una llegada del paciente a la clínica en un día, con o sin cita (`cita_id` nulo = sin cita).
  No se tocan los estados de `citas`: ambas entidades **no se acoplan**.
- Estados cerrados: `llegada`, `con_triaje`, `derivada`, `en_atencion`, `atendida`, `abandonada`, `anulada`. Cada transición
  tiene **una operación** (función `SECURITY DEFINER`) y un responsable: recepción registra la llegada y cierra; la enfermera
  registra el triaje y deriva las visitas sin cita; el profesional toma, deriva a otra especialidad y termina. Un disparador
  rechaza cualquier otra transición para todo rol, incluido el dueño.
- Una visita en curso por paciente. Una visita sin cita nunca crea fila en `citas`, así que queda fuera del denominador del 75 %.
- El tiempo de espera se mide de `llegada_en` a `atencion_iniciada_en`; H7 lo consume sin escribir en estas tablas.
- Sin cron nuevo: las visitas de días anteriores se cierran de forma perezosa (ADR-0028 sigue vigente).

## Alternativas consideradas

- **Estados nuevos en `citas`:** un paciente sin cita no tiene fila; además toca las restricciones de no solapamiento de H2 y la
  transición es de H3.
- **Una cita inmediata para cada paciente sin cita:** fija de antemano al profesional (alternativa ya descartada en ADR-0032) y
  contamina el indicador de citas del portal.
- **Reutilizar `atenciones`:** es el acto clínico firmado e inmutable de H6; una llegada no es una atención.

## Consecuencias

- Tres tablas nuevas (`visitas`, `triajes`, `derivaciones`) con RLS y pruebas pgTAP negativas. La enfermera no lee historias.
- H3 debe definir qué pasa con una cita cancelada o marcada «no asistió» cuando hay una visita abierta.
- H7 adopta el contrato de estados para «en espera».
- Se apoya en [ADR-0016](0016-vigencia-de-asignacion-paciente-medico.md) y [ADR-0032](0032-acceso-a-la-historia-de-pacientes-sin-cita.md).
