# Spec Delta

## Purpose

El paciente recibe por correo un recordatorio de su cita **el día anterior**, sin que nadie en la clínica lo programe a
mano, y nunca recibe uno de una cita que ya no existe, ya ocurrió o cambió. Cubre cuándo se programa, qué se guarda y qué
pasa si la cita se cancela, se reprograma o se reasigna antes del envío.

## ADDED Requirements

### Requirement: Toda cita vigente y futura queda con un recordatorio programado
Al crearse una cita en estado `reservada` o `confirmada` cuyo inicio es futuro, el sistema SHALL dejar un único
recordatorio pendiente para esa cita, dirigido al correo registrado del paciente, por el canal de correo. El recordatorio
SHALL crearse en la misma operación que la cita, sin depender de que el código que la crea se acuerde de pedirlo, y sin
requerir que quien reserva (paciente, administrativo o proceso de reasignación) tenga permiso de escritura sobre las
notificaciones. Una cita creada ya cancelada, atendida, o con inicio en el pasado SHALL NOT generar recordatorio.

#### Scenario: Reserva del paciente por el portal
- **WHEN** un paciente reserva una cita futura para sí mismo
- **THEN** existe exactamente un recordatorio pendiente de esa cita, con el correo del paciente como destinatario

#### Scenario: Agendado por el administrativo
- **WHEN** el administrativo agenda una cita futura de cualquier paciente
- **THEN** existe exactamente un recordatorio pendiente de esa cita

#### Scenario: La reserva falla y no queda recordatorio
- **WHEN** la creación de la cita es rechazada porque el horario ya está ocupado (`Registro de cita ya agendado`)
- **THEN** no se crea ninguna cita ni ningún recordatorio

#### Scenario: Cita que no necesita recordatorio
- **WHEN** se carga una cita ya atendida, una cita cancelada, o una cita cuyo inicio ya pasó
- **THEN** no se crea recordatorio para ella

#### Scenario: Crear la cita no da permiso de escribir notificaciones (negativo)
- **WHEN** un paciente o un administrativo intenta insertar o modificar directamente una fila de notificaciones
- **THEN** la operación es rechazada por falta de permiso, aunque la reserva que sí hizo creó su recordatorio

### Requirement: «Un día antes» es el día calendario anterior, a las 08:00 de Lima
El recordatorio SHALL programarse para las **08:00 de la zona `America/Lima` del día calendario anterior** al de la cita,
sin importar la hora de la cita ni la zona horaria del servidor. El proceso programado diario SHALL enviarlo en su primera
ejecución desde esa hora, de modo que el paciente lo recibe la mañana del día anterior y nunca el mismo día de una cita que
fue reservada con anticipación suficiente. Si la cita se reservó con tan poca anticipación que esa hora ya pasó, se aplica
el requisito de reservas de último momento.

#### Scenario: Cita de la tarde
- **WHEN** se reserva una cita para el 02/03/2032 a las 15:00 (Lima) con días de anticipación
- **THEN** su recordatorio queda programado para el 01/03/2032 a las 08:00 (Lima), y se envía en la ejecución diaria de ese
  día, no en la del 02/03/2032

#### Scenario: Cita de primera hora
- **WHEN** se reserva una cita para el 02/03/2032 a las 08:30 (Lima)
- **THEN** su recordatorio queda programado para el 01/03/2032 a las 08:00 (Lima)

#### Scenario: Cambio de mes y año bisiesto
- **WHEN** se reserva una cita para el 01/03/2032 a las 09:00 (Lima)
- **THEN** su recordatorio queda programado para el 29/02/2032 a las 08:00 (Lima)

#### Scenario: El día de Lima manda sobre el día del servidor
- **WHEN** se reserva una cita para el 01/03/2032 a las 23:30 (Lima), que en UTC ya es el 02/03/2032
- **THEN** su recordatorio queda programado para el 29/02/2032 a las 08:00 (Lima), no para el 01/03/2032

#### Scenario: Aún no es el momento
- **WHEN** el proceso programado corre y la cita es de pasado mañana
- **THEN** su recordatorio sigue pendiente y no se envía

### Requirement: Reserva de último momento
Cuando la hora programada de un recordatorio ya pasó al crearse la cita, el sistema SHALL enviarlo en la siguiente ejecución
del proceso programado **solo si** la cita sigue vigente y todavía no ha ocurrido en ese momento (ADR-0017). Si la cita ya
ocurrió, el recordatorio SHALL omitirse sin llamar al proveedor de correo y con el motivo registrado.

#### Scenario: Reserva la tarde anterior
- **WHEN** se reserva a las 15:00 una cita para el día siguiente a las 10:00 y el proceso programado corre a la mañana
  siguiente antes de las 10:00
- **THEN** el recordatorio se envía en esa ejecución, aunque sea tarde

#### Scenario: La cita ya ocurrió cuando corre el proceso
- **WHEN** el proceso programado corre y la cita del recordatorio pendiente ya tiene su inicio en el pasado
- **THEN** no se envía el correo, la notificación queda registrada como no enviada con el motivo «cita ya ocurrida» y no se
  vuelve a intentar

### Requirement: Un recordatorio solo se envía si su cita sigue vigente y sin cambios
Antes de enviar un recordatorio, el sistema SHALL comprobar que la cita está en estado `reservada` o `confirmada`, que su
inicio es futuro y que su horario y su médico coinciden con los datos con los que se programó el aviso. Si alguna condición
no se cumple, el recordatorio SHALL omitirse sin llamar al proveedor de correo, con el motivo registrado, sin reintentos
posteriores y sin aparecer en la revisión de notificaciones fallidas.

#### Scenario: Cita cancelada antes del envío
- **WHEN** la cita se cancela después de reservada y antes de que corra el proceso programado
- **THEN** el recordatorio no se envía y queda registrado como no enviado con el motivo «cita cancelada»

#### Scenario: Cita reprogramada
- **WHEN** el administrativo reprograma una cita, de modo que la original queda cancelada y se crea una nueva
- **THEN** el recordatorio de la original no se envía y la cita nueva tiene su propio recordatorio con el nuevo horario y
  el nuevo médico

#### Scenario: Cita reasignada por baja del médico
- **WHEN** la cita se reasigna a otro médico por una baja (cancela la original y crea la nueva)
- **THEN** el paciente no recibe recordatorio con el médico anterior y sí uno con el médico sustituto y el horario vigente

#### Scenario: Cita modificada en sitio
- **WHEN** el inicio o el médico de una cita cambian sin pasar por una reprogramación, después de programado el aviso
- **THEN** el recordatorio no se envía con datos desactualizados y queda registrado como no enviado con el motivo «cita
  modificada»

#### Scenario: Omitido no es fallido
- **WHEN** un recordatorio se omite por cualquiera de los motivos anteriores
- **THEN** no se cuenta entre las notificaciones que esperan revisión manual ni se reintenta en ejecuciones posteriores

### Requirement: Un solo recordatorio por cita
El sistema SHALL garantizar que una misma cita nunca tenga dos recordatorios ni reciba el recordatorio dos veces, aunque el
proceso programado se ejecute más de una vez o se solape con otra ejecución.

#### Scenario: Doble creación
- **WHEN** se intenta programar por segunda vez el recordatorio de una cita que ya lo tiene
- **THEN** no se crea una segunda fila ni se altera la existente

#### Scenario: Doble ejecución
- **WHEN** el proceso programado corre dos veces seguidas sobre el mismo recordatorio vencido
- **THEN** el paciente recibe un solo correo (ver «Idempotencia» en `proceso-programado-de-notificaciones`)

### Requirement: El aviso programado lleva una copia mínima de los datos de la cita
Al programar el recordatorio, el sistema SHALL guardar con él una copia de los únicos datos que el correo necesita: nombre
del paciente, inicio y fin de la cita, médico (identificador y nombre) y especialidad. La copia SHALL NOT incluir el motivo
de la cita, el documento de identidad, el teléfono, la dirección, la fecha de nacimiento, el sexo ni ningún dato clínico. Esa
copia SHALL ser la única fuente de contenido del proceso programado, que no necesita leer pacientes ni médicos.

#### Scenario: Contenido de la copia
- **WHEN** se programa el recordatorio de una cita que tiene un motivo escrito por el paciente
- **THEN** la copia contiene exactamente los campos permitidos y no contiene ese motivo ni los demás campos excluidos

#### Scenario: Solo el administrativo puede leerla (negativo)
- **WHEN** un paciente, un médico, una enfermera o una sesión sin rol consulta las notificaciones
- **THEN** no obtienen ninguna fila ni, por tanto, la copia; solo el administrativo puede leerla

### Requirement: Corregir el correo del paciente rehabilita sus avisos pendientes
Cuando se corrige el correo de un paciente, el sistema SHALL actualizar el destinatario de sus notificaciones pendientes y
fallidas, y SHALL volver a habilitar el reintento de las notificaciones fallidas cuya cita sigue siendo futura. Las
notificaciones ya enviadas SHALL NOT modificarse.

#### Scenario: Correo con error corregido
- **WHEN** un recordatorio quedó fallido por una dirección inválida y el administrativo corrige el correo del paciente antes
  de la cita
- **THEN** la notificación toma el correo nuevo y se reintenta en la siguiente ejecución del proceso programado

#### Scenario: Aviso ya enviado
- **WHEN** se corrige el correo de un paciente cuyo recordatorio ya se envió
- **THEN** esa notificación no cambia
