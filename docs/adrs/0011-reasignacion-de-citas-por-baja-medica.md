# ADR 0011: Reasignación de citas por baja o emergencia médica

## Estado

Aceptado

## Contexto

El PRD identifica como caso borde que, si un doctor se da de baja o tiene una emergencia, los
pacientes agendados con él deben ser reasignados y cubiertos por otro médico, y exige que "debe
existir un flujo para ello". Hace falta definir ese flujo sin cancelar citas de forma silenciosa
ni perder la relación entre la cita original y la nueva.

## Decisión

1. El administrativo crea un `bloqueo_agenda` (rango `tstzrange`) para el médico afectado.
2. El sistema lista las citas vigentes de ese médico dentro del rango bloqueado.
3. Para cada una, propone médicos de la misma especialidad con slot libre en un horario
   equivalente.
4. La reasignación se ejecuta en una única transacción: cancela la cita original e inserta la
   nueva cita con `reprogramada_de` apuntando a la original. *(Corregido el 2026-10-08: este paso
   decía lo contrario; la columna vive en la cita nueva, como en el esquema de H2.)*
5. Se encola una notificación de reprogramación al paciente.
6. Si no hay médico sustituto disponible, la cita queda marcada para contacto manual — nunca se
   cancela en silencio.

## Consecuencias

- La trazabilidad `reprogramada_de` conserva el historial completo de una cita reasignada, lo que
  permite auditar por qué el paciente terminó con un médico distinto al que reservó.
- El paso 6 evita el peor escenario del caso borde: un paciente que se presenta a una cita que fue
  cancelada sin que nadie le avisara.
- **Trade-off:** el paso 3 (proponer sustituto de la misma especialidad con slot libre) es una
  heurística automática; no considera continuidad de tratamiento (que el paciente prefiera seguir
  con el mismo médico si vuelve a estar disponible pronto) ni carga de trabajo ya asignada al
  sustituto más allá de la disponibilidad de agenda — el administrativo debe revisar la propuesta
  antes de confirmarla, el sistema no la ejecuta de forma autónoma.
