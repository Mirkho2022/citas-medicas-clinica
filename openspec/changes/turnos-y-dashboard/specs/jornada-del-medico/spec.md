# Spec Delta

## Purpose

Que cada médico consulte en un solo lugar cuándo atiende y qué citas confirmadas tiene, marque como atendida la que ya
atendió, y no vea nada de otros médicos ni datos clínicos. Es la parte del médico del módulo de turnos y agenda; el registro de historias clínicas pertenece a otro
módulo.

## ADDED Requirements

### Requirement: El médico ve su horario de atención y sus citas confirmadas
El sistema SHALL mostrar a cada médico, en su área, su jornada de hoy y de los próximos 7 días: sus horarios de atención
(según su disponibilidad semanal vigente), sus bloqueos de agenda y sus citas en estado `confirmada`, ordenados por fecha y
hora. Por cada cita SHALL mostrar la hora de inicio y de fin, el nombre y el documento del paciente y el estado. Fechas y
horas SHALL mostrarse en la zona `America/Lima` con el formato `dd/MM/yyyy` y `HH:mm`.

#### Scenario: Jornada con citas confirmadas
- **WHEN** un médico atiende hoy de 09:00 a 13:00 y tiene dos citas confirmadas, a las 09:20 y a las 10:00
- **THEN** ve «Hoy», su horario de 09:00 a 13:00 y las dos citas en ese orden, cada una con el nombre y el documento del
  paciente y la insignia «Confirmada»

#### Scenario: Solo citas confirmadas
- **WHEN** el médico tiene además citas reservadas, canceladas, atendidas y que no asistieron en esos días
- **THEN** la lista de citas muestra únicamente las confirmadas

#### Scenario: Bloqueo propio
- **WHEN** el médico tiene un bloqueo de agenda mañana de 08:00 a 12:00
- **THEN** su jornada de mañana lo muestra como «Bloqueo de agenda de 08:00 a 12:00»

#### Scenario: Sin citas
- **WHEN** el médico no tiene citas confirmadas en los próximos 7 días
- **THEN** ve «No tiene citas confirmadas en los próximos 7 días» y su horario de atención sigue visible

#### Scenario: Cita cuya hora ya pasó
- **WHEN** una cita confirmada de hoy empezó hace 12 minutos y sigue sin atenderse
- **THEN** la cita se muestra con la marca «Hace 12 min» junto a su hora, para que el médico sepa cuánto lleva esperando
  ese paciente

### Requirement: El médico marca como atendida una cita confirmada suya
El sistema SHALL permitir al médico marcar como atendida una cita suya que esté confirmada. Es la única acción de escritura
de la jornada: cambia el estado de `confirmada` a `atendida` y nada más. Las reglas de la transición pertenecen al módulo de
agenda y se cumplen en la base de datos: el médico no actualiza citas directamente, no cambia otros estados (no puede cancelar
ni marcar «no asistió», que son de la recepción) y no actúa sobre citas de otro médico. Mientras se envía, el botón SHALL
quedar deshabilitado para evitar un doble envío, y el resultado SHALL anunciarse sin quitar el foco al usuario. Cuando la cita
queda atendida SHALL salir de la lista de confirmadas y, en la siguiente actualización, del panel de pacientes en espera del
dashboard.

#### Scenario: Marcar atendida
- **WHEN** el médico elige «Marcar atendida» en una cita confirmada suya
- **THEN** la cita deja de aparecer en su lista de confirmadas, se anuncia «Cita marcada como atendida» y el foco pasa a la
  siguiente cita o, si no hay más, al encabezado de la jornada

#### Scenario: Doble clic
- **WHEN** el médico activa «Marcar atendida» dos veces seguidas sobre la misma cita
- **THEN** la cita queda atendida una sola vez y la segunda activación no muestra ningún error

#### Scenario: La cita ya no está confirmada
- **WHEN** el médico elige «Marcar atendida» sobre una cita que la recepción acaba de cancelar o de marcar «no asistió»
- **THEN** el estado no cambia y se muestra «La cita ya no está confirmada. Actualice la pantalla»

#### Scenario: Cita de otro médico (negativo)
- **WHEN** un médico intenta marcar atendida una cita de otro médico, saltándose la interfaz
- **THEN** la operación se rechaza, la cita queda sin cambios y no se revela si existe

#### Scenario: Otros estados y escritura directa (negativo)
- **WHEN** un médico intenta, saltándose la interfaz, cancelar una cita, marcarla «no asistió» o actualizar directamente
  `citas`
- **THEN** la base de datos rechaza la operación o no afecta ninguna fila, y la cita queda sin cambios

#### Scenario: Cita que aún no está confirmada
- **WHEN** el médico intenta marcar atendida una cita `reservada`
- **THEN** la operación se rechaza y la jornada ni siquiera ofrece el botón en citas que no están confirmadas

### Requirement: El médico solo ve lo suyo
La jornada SHALL incluir únicamente las citas, bloqueos y horarios del médico que inició sesión. Esta restricción SHALL
cumplirse en la base de datos y no solo en la pantalla.

#### Scenario: No ve citas de otro médico (negativo)
- **WHEN** un médico consulta, por la pantalla o directamente en la base de datos, una cita de la agenda de otro médico
- **THEN** no recibe ninguna fila

#### Scenario: No ve bloqueos de otro médico (negativo)
- **WHEN** un médico consulta los bloqueos de agenda de otro médico
- **THEN** no recibe ninguna fila

#### Scenario: No ve turnos de enfermería (negativo)
- **WHEN** un médico consulta `turnos_enfermeria`
- **THEN** no recibe ninguna fila y su jornada no muestra qué enfermera trabaja con él

#### Scenario: No abre el dashboard ni la gestión de turnos (negativo)
- **WHEN** un médico abre el dashboard operativo o la pantalla de gestión de turnos del administrativo
- **THEN** no ve su contenido y vuelve a su propia área

### Requirement: La jornada del médico no muestra datos clínicos
La jornada SHALL mostrar solo datos logísticos de la cita. NO SHALL mostrar diagnósticos, notas de atención, antecedentes ni
el motivo de la cita. El título de la pestaña y la dirección (URL) NO SHALL contener datos de pacientes. Mientras el módulo
de historias clínicas no exista, la jornada NO SHALL ofrecer enlaces a la historia del paciente que respondan como página
inexistente.

#### Scenario: Cita con motivo
- **WHEN** una cita confirmada tiene un motivo registrado
- **THEN** la jornada no muestra ese texto

#### Scenario: Título de la pestaña
- **WHEN** la jornada muestra citas con pacientes
- **THEN** el título de la pestaña es siempre «Panel del médico» y la dirección no contiene datos del paciente

### Requirement: La jornada del médico es accesible
La jornada SHALL cumplir WCAG 2.1 AA: tablas o listas con encabezados, estado con texto e icono, contraste suficiente, uso
completo con teclado y con el texto ampliado al 200 % sin desplazamiento horizontal de la página.

#### Scenario: Revisión automática
- **WHEN** se ejecuta la revisión automática de accesibilidad sobre la jornada de un médico con citas
- **THEN** no se reporta ninguna violación de nivel A ni AA de WCAG 2.1
