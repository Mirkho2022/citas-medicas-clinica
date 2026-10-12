# ADR 0032: Acceso a la historia de pacientes sin cita: derivación

## Estado

**Propuesto** — pendiente de aceptación del usuario. Modifica el modelo de acceso de
[ADR-0016](0016-vigencia-de-asignacion-paciente-medico.md). Toca el acceso a historias clínicas: revisión explícita con
`code-review`.

## Contexto

La clínica atiende también pacientes **sin cita** (PRD, 2026-10-11). Hoy el acceso a la historia nace de una asignación
paciente-profesional, creada por un disparador cuando una cita pasa a `confirmada` o a `atendida` (6 meses de vigencia), o por
asignación manual del administrativo. Un paciente sin cita no tiene profesional «a cargo». Según el PRD, recepción registra al
paciente nuevo y abre su historia, la enfermera hace el triaje y **deriva** al paciente a una especialidad, y un profesional
también puede derivarlo a otra especialidad. La enfermera no lee historias clínicas.

## Decisión propuesta

- Una entidad **`derivaciones`**: paciente, especialidad de destino, origen (enfermera o profesional), quién la creó, estado
  (`pendiente`, `tomada`, `cerrada`, `vencida` y `anulada`, esta última para corregir un error antes de que alguien tome al
  paciente) y vigencia. Cuelga de una **visita** ([ADR-0033](0033-visita-del-paciente-llegada-y-estados.md)).
- **Crear una derivación no da acceso a nadie.** Un profesional de la especialidad de destino **toma** al paciente, y esa acción
  inserta la asignación (append-only, con motivo `derivacion:<id>` y vigencia acotada), como ya hace el disparador de citas.
- La enfermera solo puede derivar a una **especialidad**, nunca a un profesional concreto, y no obtiene lectura de contenido
  clínico por derivar.
- La vigencia de una asignación por derivación **no está decidida**: el change `triaje-y-derivacion` propone **7 días** de Lima
  desde la toma, en una sola función que se cambia con una migración (D8, con seis opciones comparadas); la derivación
  pendiente vence al final del día. Es una pregunta abierta para el usuario y el asesor legal.

## Alternativas consideradas

- **La derivación da acceso a todos los profesionales de la especialidad de inmediato.** Es más simple, pero 2 o 3 profesionales
  verían a un paciente que quizá no atiendan: más amplio que «a cargo».
- **La enfermera asigna a un profesional concreto.** Le daría poder de conceder acceso clínico que ella no puede ejercer.
- **Recepción crea una cita inmediata para cada paciente sin cita**, reutilizando ADR-0016. Cambia lo mínimo en RLS, pero fija
  de antemano al profesional y contamina el indicador de citas del portal (75 %).

## Consecuencias

- Una tabla nueva (`derivaciones`) con RLS y prueba pgTAP negativa, y una función `SECURITY DEFINER` acotada para «tomar».
- La asignación sigue siendo la **única** fuente de acceso, así que el aislamiento por profesional a cargo se conserva.
- Esta ADR no resuelve P-1 ni el aislamiento de Psicología ([ADR-0031](0031-aislamiento-de-la-informacion-de-psicologia.md)),
  que se aplica por encima del acceso.
- El detalle vive en el change `triaje-y-derivacion`.
