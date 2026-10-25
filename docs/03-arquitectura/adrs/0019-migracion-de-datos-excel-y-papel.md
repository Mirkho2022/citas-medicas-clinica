# ADR 0019: Migración de datos desde Excel y papel

## Estado

Aceptado — formaliza como ADR una decisión que ya estaba en TECH-DESIGN.md sin el mismo nivel de
rigor que el resto del documento, a partir de un hallazgo de revisión adversarial del diseño.
Queda una pregunta operativa abierta para el cliente (ver «Consecuencias»).

## Contexto

El reemplazo de Excel (citas) y papel (historias clínicas) no es una integración con un sistema
existente — es una migración de datos hacia uno nuevo, con sus propios riesgos: duplicados de
pacientes, documentos de identidad inválidos en los registros históricos, y el reemplazo de un
hábito de trabajo del personal (papel) que no cambia de la noche a la mañana. Sin una decisión
explícita, cada uno de estos riesgos podría resolverse de forma distinta según quién ejecute la
migración.

## Decisión

Migración en 4 fases, ejecutada en orden y con la fase 4 nunca "cerrada" (es progresiva hacia el
60% del criterio de éxito del PRD):

1. **Catálogos** — especialidades, médicos, enfermeras, disponibilidades semanales.
2. **Maestro de pacientes** — import del Excel con deduplicación por
   `(tipo_documento, numero_documento)`. Un registro con documento inválido (no pasa el `CHECK` de
   formato de `pacientes`) **no se descarta**: pasa a una bandeja de revisión manual.
3. **Citas futuras** — solo citas a futuro migran al sistema; el histórico de citas pasadas queda
   en el Excel como archivo, no se importa.
4. **Historias clínicas** — digitalización progresiva según la definición híbrida de
   [ADR-0013](0013-definicion-de-historia-clinica-digitalizada.md).

Durante la transición corre un período de **doble registro** (sistema + papel) hasta validar que
no se pierde información; la fecha de corte la fija la clínica.

## Alternativas consideradas

- **Descartar los registros con documento inválido en vez de una bandeja de revisión** — es más
  simple de ejecutar (una migración de un solo paso, sin proceso de seguimiento), pero pierde
  pacientes reales del maestro solo porque su documento fue mal transcrito en el Excel original;
  se descartó porque el objetivo del proyecto es reducir pérdida de información, no trasladarla al
  sistema nuevo.
- **Migrar también el histórico completo de citas pasadas** — daría trazabilidad histórica
  completa desde el día uno, pero el PRD no la pide (el problema declarado es hacia adelante:
  evitar cruces y reducir tiempos de espera futuros) y el volumen adicional no aporta a ningún
  criterio de éxito medido; se prefirió dejarlo en el Excel como archivo de consulta.
- **Corte inmediato sin doble registro** — más simple operativamente (una sola fuente de verdad
  desde el día uno), pero un error de captura durante la curva de aprendizaje del personal, sin un
  respaldo en papel corriendo en paralelo, arriesga perder una cita o un dato clínico real durante
  la transición; se descartó porque el costo de un período de doble registro es bajo comparado con
  ese riesgo.

## Consecuencias

- Ningún paciente del Excel original se pierde silenciosamente por un error de formato de
  documento — queda visible en una bandeja, no descartado.
- El período de doble registro da una red de seguridad durante la adopción, a costa de trabajo
  duplicado temporal para el personal administrativo.
- **Trade-off / pregunta abierta para el cliente:** esta ADR no define quién es responsable de
  resolver la bandeja de revisión manual ni en qué plazo — sin un dueño y un SLA, los registros
  con documento inválido pueden acumularse indefinidamente sin que nadie los revise, y esos
  pacientes quedan fuera del sistema mientras tanto. Es una decisión operativa del cliente, no
  técnica: no se resuelve inventando una respuesta aquí (ver [CLAUDE.md](../../../CLAUDE.md), "Decisiones
  aún abiertas: no las inventes, pregunta"). **Cómo avanzar:** antes de H8 (migración de datos en
  el plan de implementación), preguntar al cliente quién en el personal administrativo asume esa
  bandeja y cada cuánto se revisa.
