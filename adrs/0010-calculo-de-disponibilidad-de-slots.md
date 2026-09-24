# ADR 0010: Cálculo de disponibilidad de slots

## Estado

Aceptado

## Contexto

El portal necesita mostrar los horarios libres de un médico en una fecha dada; es la consulta más
frecuente del sistema porque se ejecuta en cada búsqueda de disponibilidad. Hay que decidir si los
slots se precalculan y almacenan, o se calculan al vuelo a partir de la plantilla de
disponibilidad.

## Decisión

Los slots se calculan **en consulta**, mediante la función `slots_disponibles(medico, fecha)`, que
genera la serie de horarios a partir de `disponibilidades` (plantilla semanal) y descarta los que
se solapan con `citas` vigentes o `bloqueos_agenda`. No se materializan ni almacenan slots vacíos
por adelantado.

## Consecuencias

- Un cambio de horario de un médico (nueva `disponibilidad`, un `bloqueo_agenda`) se refleja de
  inmediato en la búsqueda del portal, sin ningún job de resincronización que pueda quedar
  desactualizado.
- No existe tabla de slots que crezca sin límite ni haya que purgar; el volumen de datos se
  mantiene proporcional a citas y disponibilidades reales, no a slots hipotéticos.
- **Trade-off:** cada búsqueda de disponibilidad paga el costo de generar la serie de horarios y
  verificar solapamientos en tiempo real; si el catálogo de médicos y el rango de fechas buscado
  crecen mucho, esta consulta (ya identificada como la más caliente del sistema) es la primera
  candidata a degradar el objetivo de p95 < 500ms, y requiere que los índices
  (`citas_medico_inicio_idx` y el GiST de `citas_sin_cruce_medico`) se mantengan vigentes conforme
  crece la tabla `citas`.
