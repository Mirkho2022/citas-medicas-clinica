# Spec Delta

## Purpose

Permitir que el paciente encuentre un horario libre por especialidad o por médico y reserve su propia cita sin ayuda, viendo
antes de confirmar la advertencia de la ventana de cancelación y recibiendo el rechazo exacto de la doble reserva.

## ADDED Requirements

### Requirement: El paciente elige especialidad y médico
«Reservar» SHALL presentar una tarea por pantalla: primero la especialidad, luego el médico, el día y el horario, y por último
la confirmación. Las especialidades SHALL listar solo las que tienen al menos un médico activo. Al elegir una especialidad se
SHALL mostrar sus médicos activos, cada uno con su próximo horario libre o con «Sin horarios próximos». El paciente SHALL
poder también elegir directamente un médico, sin pasar por la especialidad. Un médico dado de baja no SHALL ofrecerse.

#### Scenario: Elegir una especialidad
- **WHEN** el paciente abre «Reservar»
- **THEN** ve las especialidades con médicos activos y, al elegir una, ve esos médicos con su próximo horario libre en hora
  de Lima

#### Scenario: Médico dado de baja
- **WHEN** un médico está marcado como inactivo
- **THEN** no aparece en ninguna lista del portal y no se puede reservar con él

#### Scenario: Elegir directamente un médico
- **WHEN** el paciente elige «Ya sé con qué médico» y selecciona uno
- **THEN** continúa al paso de día con ese médico y su especialidad ya determinadas

### Requirement: El paciente solo ve horarios libres
Para el médico elegido, el portal SHALL ofrecer los días de los próximos 30 días que tienen horarios libres y, para el día
elegido, únicamente los horarios libres. Un horario SHALL considerarse libre solo si está dentro de la disponibilidad del
médico, no se solapa con una cita vigente (`reservada` o `confirmada`) ni con un bloqueo de su agenda, y empieza en el futuro.
Un horario que se cruza con una cita vigente del propio paciente SHALL mostrarse como «No disponible» con texto, no solo con
color. La búsqueda SHALL NOT revelar datos de otros pacientes ni los motivos de los bloqueos de agenda.

#### Scenario: Días sin horarios
- **WHEN** el paciente ve los días de un médico
- **THEN** los días sin horarios libres aparecen deshabilitados con el texto «Sin horarios» y no se pueden elegir

#### Scenario: Horario con cita de otra persona
- **WHEN** un horario del médico tiene una cita vigente de otro paciente
- **THEN** ese horario no se ofrece y el paciente no recibe ningún dato de quién lo tiene

#### Scenario: Horario dentro de un bloqueo de agenda
- **WHEN** un horario cae dentro de un bloqueo de la agenda del médico (licencia, baja, emergencia)
- **THEN** no se ofrece y el paciente no ve el motivo del bloqueo ni que existe

#### Scenario: Horario que ya empezó
- **WHEN** el horario de hoy ya pasó o ya empezó
- **THEN** no se ofrece

#### Scenario: Horario que choca con una cita propia
- **WHEN** el paciente ya tiene una cita vigente a esa hora con otro médico
- **THEN** el horario aparece como «No disponible» y no se puede elegir

#### Scenario: Zona horaria
- **WHEN** el paciente consulta horarios desde un navegador configurado en otra zona horaria
- **THEN** todos los días y horas se muestran en hora de Lima, con formato `dd/MM/yyyy` y `HH:mm` de 24 horas

### Requirement: Antes de confirmar se muestra el resumen y la advertencia de cancelación
La pantalla de confirmación SHALL mostrar el médico, la especialidad, la fecha y la hora, y una advertencia visible de que la
cita solo puede cancelarse hasta 1 hora antes, indicando la hora límite en hora de Lima. La advertencia SHALL estar siempre
visible antes del botón de confirmar. Si la cita empieza en menos de 1 hora, la advertencia SHALL indicar que ya no podrá
cancelarla desde el portal. El portal no SHALL pedir un motivo de consulta en texto libre.

#### Scenario: Reserva de una cita a las 14:30
- **WHEN** el paciente elige el horario de las 14:30 del 14/10/2026
- **THEN** ve el resumen con médico, especialidad, `14/10/2026` y `14:30`, y la advertencia «Podrá cancelar esta cita hasta
  1 hora antes, a las 13:30.» antes del botón «Confirmar cita»

#### Scenario: Cita que empieza en menos de una hora
- **WHEN** el paciente elige un horario que empieza en menos de 1 hora
- **THEN** la advertencia dice que esa cita ya no podrá cancelarse desde el portal y pide confirmar de todos modos

#### Scenario: Sin motivo de consulta libre
- **WHEN** el paciente está en la pantalla de confirmación
- **THEN** no hay un campo de texto libre para describir síntomas o el motivo de la consulta

### Requirement: El paciente reserva únicamente su propia cita
Al confirmar, el sistema SHALL crear una cita en estado `reservada`, a nombre del paciente de la sesión, con el médico y el
horario elegidos y origen `portal`. El paciente SHALL NOT poder reservar a nombre de otra persona, en el pasado, ni en un horario
que ya no pertenece a la disponibilidad del médico. Mientras el envío está en curso, el botón SHALL quedar deshabilitado con el
texto «Reservando…». Tras reservar, el paciente SHALL ver una confirmación con los datos de la cita y la opción de ir a
«Mis citas».

#### Scenario: Reserva exitosa
- **WHEN** el paciente confirma un horario libre
- **THEN** se crea una cita `reservada` a su nombre con origen `portal`, ve la confirmación con médico, fecha y hora, y la
  cita aparece en sus próximas citas

#### Scenario: Reserva a nombre de otro paciente
- **WHEN** el paciente modifica la solicitud para indicar el identificador de otro paciente
- **THEN** la cita no se crea a nombre de esa persona; el sistema usa siempre al paciente de la sesión o rechaza el envío

#### Scenario: Horario que dejó de existir
- **WHEN** el horario elegido ya no pertenece a la disponibilidad del médico (por ejemplo, un bloqueo reciente)
- **THEN** ve «El horario elegido ya no está disponible. Elija otro horario.», no se crea ninguna cita y la lista de horarios se actualiza

#### Scenario: Reserva en el pasado
- **WHEN** llega una solicitud de reserva con un inicio anterior al momento actual
- **THEN** se rechaza y no se crea ninguna cita

### Requirement: La doble reserva se rechaza con el mensaje exacto
Si el horario fue tomado antes de que la reserva se confirme, el sistema SHALL rechazar la reserva y mostrar, como alerta de
error, exactamente el texto `Registro de cita ya agendado`, sin traducirlo, acortarlo ni mezclarlo con otro texto en la misma
línea; cualquier indicación adicional («Elija otro horario») SHALL ir en un elemento aparte. La lista de horarios SHALL
actualizarse mostrando ese horario como «No disponible». Cuando varias reservas del mismo horario llegan a la vez, exactamente
una SHALL crearse y las demás SHALL recibir ese mismo mensaje, cualquiera sea la forma en que la base de datos resuelva el
choque.

#### Scenario: Horario tomado mientras el paciente decidía
- **WHEN** otra persona reserva el horario antes de que el paciente confirme
- **THEN** el paciente ve la alerta con el texto exacto `Registro de cita ya agendado`, no se crea su cita y el horario pasa a
  «No disponible»

#### Scenario: Dos pacientes confirman a la vez
- **WHEN** dos pacientes confirman al mismo tiempo el mismo horario del mismo médico
- **THEN** se crea exactamente una cita y el otro paciente ve el texto exacto `Registro de cita ya agendado`

#### Scenario: Cruce con otra cita del mismo paciente
- **WHEN** el paciente intenta reservar un horario que se solapa con otra cita vigente suya
- **THEN** la reserva se rechaza con el texto exacto `Registro de cita ya agendado` y no se crea la cita

### Requirement: Reenviar la misma reserva no produce un error
Si el mismo paciente envía dos veces la misma reserva (doble clic, reintento por mala conexión) para el mismo médico y horario,
el sistema SHALL dejar una sola cita y SHALL mostrar al paciente la confirmación de esa cita, no el error de doble reserva.

#### Scenario: Doble clic en «Confirmar cita»
- **WHEN** el paciente envía dos veces seguidas la reserva del mismo horario
- **THEN** existe una sola cita suya en ese horario y la pantalla muestra la confirmación, no una alerta de error

### Requirement: Una sesión vencida no hace perder la reserva
Si la sesión del paciente venció mientras elegía, el sistema SHALL decirlo con un mensaje claro, no crear ninguna cita y
conservar la selección (médico, día y horario) para retomarla tras volver a iniciar sesión.

#### Scenario: Sesión vencida al confirmar
- **WHEN** el paciente confirma una cita con la sesión vencida
- **THEN** ve «Su sesión venció. Inicie sesión de nuevo para terminar su reserva.», no se crea ninguna cita y, al iniciar sesión,
  vuelve a la confirmación con su selección intacta
