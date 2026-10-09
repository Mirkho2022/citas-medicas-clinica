# Spec Delta

## Purpose

El paciente recibe de inmediato la confirmación de su reserva y el aviso de cancelación o reprogramación de su cita, en la
misma operación que la origina, y un fallo del correo nunca deshace la operación de negocio ni se pierde sin dejar rastro.

## ADDED Requirements

### Requirement: Confirmación de reserva inmediata
Al confirmarse la reserva de una cita (por el paciente o por el administrativo), el sistema SHALL enviar al paciente un
correo de confirmación como parte de la misma operación, sin esperar al proceso programado, y SHALL registrar su resultado.
El correo SHALL incluir la advertencia de que la cita solo puede cancelarse hasta 1 hora antes.

#### Scenario: Reserva con envío correcto
- **WHEN** un paciente reserva una cita y el proveedor de correo acepta el mensaje
- **THEN** el paciente recibe la confirmación, queda una notificación de confirmación en estado enviado con el
  identificador del proveedor, y la pantalla del paciente muestra su cita reservada

#### Scenario: Envío inmediato, no diferido
- **WHEN** se confirma una reserva a las 15:00
- **THEN** la confirmación sale en esa misma operación, no en la ejecución diaria de la mañana siguiente

### Requirement: Aviso inmediato de cancelación
Al cancelarse una cita (por el paciente o por el administrativo), el sistema SHALL enviar al paciente un correo de
cancelación como parte de la misma operación y SHALL registrar su resultado.

#### Scenario: Cancelación por el paciente
- **WHEN** un paciente cancela su cita con más de 1 hora de anticipación
- **THEN** recibe el aviso de cancelación y queda registrado en estado enviado

#### Scenario: Cancelación rechazada por la ventana de 1 hora
- **WHEN** la cancelación es rechazada por quedar menos de 1 hora para la cita
- **THEN** no se envía ningún correo ni se registra ninguna notificación de cancelación

### Requirement: Reprogramación y reasignación en un solo correo
Cuando una cita se reprograma o se reasigna por la baja de un médico, el sistema SHALL enviar **un solo** correo de
reprogramación que muestre el horario y el médico anteriores y los nuevos, y SHALL NOT enviar además una cancelación de la
cita original ni una confirmación de la cita nueva. La cita nueva SHALL conservar su propio recordatorio.

#### Scenario: Reprogramación por el administrativo
- **WHEN** el administrativo mueve una cita a otro horario
- **THEN** el paciente recibe un correo de reprogramación con el horario anterior y el nuevo, y ningún otro correo de esa
  operación

#### Scenario: Reasignación por baja del médico
- **WHEN** una cita se reasigna al médico sustituto de la misma especialidad
- **THEN** el paciente recibe un correo de reprogramación con el médico anterior y el sustituto

#### Scenario: Cita sin sustituto
- **WHEN** una cita de un médico de baja no tiene sustituto disponible y queda marcada para contacto manual
- **THEN** el sistema no envía ningún correo automático de cancelación ni de reprogramación

### Requirement: Un fallo del correo no revierte ni bloquea la operación
Un fallo del proveedor de correo (caída, límite de envíos, dirección rechazada o tiempo agotado) SHALL NOT revertir la
reserva, la cancelación ni la reprogramación, y SHALL NOT mostrar al usuario el error del proveedor ni texto técnico. El
envío síncrono SHALL tener un tiempo máximo de espera, vencido el cual se trata como un fallo que se puede reintentar. Cada
intento, exitoso o no, SHALL quedar registrado.

#### Scenario: El proveedor no responde
- **WHEN** el proveedor de correo no responde dentro del tiempo máximo al confirmar una reserva
- **THEN** la reserva queda confirmada, el usuario ve el resultado normal de su operación, y queda una notificación en
  estado fallido con un intento y el motivo

#### Scenario: Dirección rechazada de forma permanente
- **WHEN** el proveedor rechaza la dirección del paciente por inválida
- **THEN** la operación se confirma igual, la notificación queda fallida con todos sus intentos agotados y visible para
  revisión manual, y no se reintenta

#### Scenario: El registro del resultado también falla
- **WHEN** el correo se envió pero no se pudo registrar su resultado
- **THEN** la operación de negocio no se revierte y el incidente queda en el registro técnico del servidor sin datos
  personales del paciente

### Requirement: El resultado de un aviso solo lo registra quien actúa sobre esa cita
El registro del resultado de un aviso inmediato SHALL poder hacerlo únicamente el administrativo, o el paciente dueño de la
cita, y solo para los tipos de confirmación, cancelación y reprogramación. El destinatario SHALL tomarse siempre del correo
registrado del paciente, nunca de un dato enviado por quien registra. Nadie SHALL poder registrar un recordatorio, ni marcar
como enviada una notificación sin haberla enviado el sistema, ni escribir directamente en las notificaciones.

#### Scenario: Administrativo registra el aviso de una cita
- **WHEN** el administrativo reserva, cancela o reprograma la cita de cualquier paciente
- **THEN** el resultado del aviso queda registrado con el correo registrado de ese paciente

#### Scenario: Paciente registra el aviso de su propia cita
- **WHEN** un paciente reserva o cancela su cita desde el portal
- **THEN** el resultado del aviso queda registrado

#### Scenario: Otro paciente (negativo)
- **WHEN** un paciente intenta registrar un aviso sobre la cita de otro paciente
- **THEN** la operación es rechazada y no se crea ninguna notificación

#### Scenario: Médico, enfermera o sesión sin rol (negativo)
- **WHEN** un médico, una enfermera o una sesión sin rol intenta registrar un aviso
- **THEN** la operación es rechazada y no se crea ninguna notificación

#### Scenario: Tipo no permitido (negativo)
- **WHEN** quien registra pide el tipo recordatorio, o un tipo que no corresponde al estado de la cita (por ejemplo una
  confirmación de una cita cancelada)
- **THEN** la operación es rechazada

#### Scenario: Registro repetido
- **WHEN** se intenta registrar por segunda vez el mismo tipo de aviso para la misma cita
- **THEN** no se crea una segunda notificación ni se altera la primera

### Requirement: Reintento de los avisos inmediatos fallidos
Un aviso inmediato que falló con un error que se puede reintentar SHALL reintentarse en las ejecuciones del proceso
programado, con el mismo tope de 3 intentos totales que los recordatorios. El reintento SHALL omitirse, sin llamar al
proveedor, cuando el aviso dejó de tener sentido: una confirmación o reprogramación de una cita que ya fue cancelada o que
ya ocurrió, o una cancelación de una cita que ya ocurrió.

#### Scenario: Confirmación fallida que se recupera
- **WHEN** la confirmación de una reserva falló por un error transitorio y la cita sigue vigente
- **THEN** la siguiente ejecución del proceso programado la reenvía y la marca como enviada

#### Scenario: Confirmación que ya no tiene sentido
- **WHEN** la confirmación de una reserva quedó fallida y, antes del reintento, la cita se canceló
- **THEN** no se reenvía la confirmación y queda registrada como no enviada con el motivo «cita cancelada»

#### Scenario: Tope de intentos
- **WHEN** un aviso inmediato acumula 3 intentos fallidos
- **THEN** deja de reintentarse y queda visible para revisión manual del administrativo
