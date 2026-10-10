# Spec Delta

## Purpose

Cubrir el caso borde del PRD «doctor de baja o emergencia»: cuando un médico no puede atender, el administrativo registra la
baja, ve sus citas afectadas, las reasigna a un médico de la misma especialidad y, si no hay sustituto, las deja marcadas
para contacto manual, sin cancelar nunca una cita en silencio y sin dar acceso a historias clínicas.

## ADDED Requirements

### Requirement: La baja del médico se registra como un bloqueo y muestra las citas afectadas
Al registrar la baja (bloqueo de agenda del médico con inicio, fin y motivo), el sistema SHALL listar las citas del médico
`reservada` o `confirmada` que se solapan con el bloqueo y que no han terminado, ordenadas por hora, con el paciente (nombre
y documento), el horario en hora de Lima y el estado. No SHALL listar citas canceladas, atendidas ni de otros médicos. La
lista de citas por reasignar SHALL ser visible para el administrativo y, solo para sus propias citas, para el médico; el
paciente, la enfermera y una sesión sin rol no SHALL ver ninguna fila.

#### Scenario: Baja con citas afectadas
- **WHEN** el administrativo registra un bloqueo del 20/10/2026 al 24/10/2026 para un médico con tres citas vigentes en ese
  periodo
- **THEN** la pantalla muestra esas tres citas ordenadas por hora, cada una con su paciente y su estado

#### Scenario: Citas que no corresponden
- **WHEN** el médico tiene además una cita cancelada en el periodo, una cita fuera del periodo y otro médico tiene citas en
  esas fechas
- **THEN** ninguna de ellas aparece en la lista

#### Scenario: Baja sin citas
- **WHEN** el bloqueo no se solapa con ninguna cita vigente
- **THEN** la pantalla indica que no hay citas afectadas y no se pide ninguna acción

#### Scenario: Paciente, enfermera y sesión sin rol no ven la lista (negativo)
- **WHEN** un paciente, una enfermera o una sesión sin rol consulta las citas por reasignar
- **THEN** no recibe ninguna fila, ni siquiera de sus propias citas afectadas

#### Scenario: Un médico solo ve las suyas (negativo)
- **WHEN** un médico consulta las citas por reasignar
- **THEN** recibe únicamente las citas de su agenda cubiertas por sus propios bloqueos y ninguna de otro médico

### Requirement: El sistema propone sustitutos de la misma especialidad y no ejecuta nada sin confirmación
Para cada cita afectada, el sistema SHALL proponer horarios libres de médicos activos de la misma especialidad que el médico
original y distintos de él, priorizando el mismo horario del mismo día, luego los horarios más cercanos ese día y luego los
días siguientes hasta 7 días después. No SHALL proponer horarios en los que el paciente ya tiene otra cita vigente. La
propuesta SHALL ser solo una sugerencia: ningún cambio se aplica hasta que el administrativo confirme cada reasignación.

#### Scenario: Sustituto con el mismo horario
- **WHEN** otro médico de la misma especialidad tiene libre el mismo día y la misma hora de la cita afectada
- **THEN** ese horario es la primera propuesta para la cita

#### Scenario: Sin el mismo horario, el más cercano
- **WHEN** ningún sustituto tiene libre el horario exacto pero uno tiene libre una hora después ese mismo día
- **THEN** la propuesta ofrece ese horario más cercano antes que cualquiera de los días siguientes

#### Scenario: Otra especialidad, médico dado de baja o médico bloqueado (negativo)
- **WHEN** existen médicos de otra especialidad, un médico con `activo = false` y un médico con un bloqueo en esa fecha, todos
  con la agenda libre
- **THEN** ninguno de ellos aparece como sustituto propuesto

#### Scenario: El paciente ya tiene una cita en ese horario
- **WHEN** un horario del sustituto se solapa con otra cita vigente del mismo paciente
- **THEN** ese horario no se propone

#### Scenario: Proponer no cambia nada
- **WHEN** el administrativo abre la pantalla de reasignación y se calculan las propuestas
- **THEN** ninguna cita cambia de estado ni de horario hasta que el administrativo confirme una reasignación

### Requirement: Cada reasignación es atómica y deja trazabilidad
Al confirmar la reasignación de una cita, el sistema SHALL cancelar la cita original y crear la nueva con el sustituto en una
sola transacción. La cita nueva SHALL nacer `reservada` (nunca hereda `confirmada`) y SHALL apuntar a la original mediante
`reprogramada_de`. La ventana de cancelación de 1 hora NO SHALL impedirla, porque la cita original está cubierta por el
bloqueo de la baja. Cada cita SHALL reasignarse en su propia transacción: el fallo de una no SHALL afectar a las demás, y el
resultado SHALL informarse cita por cita.

#### Scenario: Reasignación dentro de la hora previa
- **WHEN** el administrativo reasigna una cita que empieza dentro de 30 minutos y está cubierta por el bloqueo de la baja
- **THEN** la original queda `cancelada` y existe una cita nueva `reservada` con el sustituto y `reprogramada_de` apuntando a
  la original

#### Scenario: El horario del sustituto se ocupó (atomicidad)
- **WHEN** el horario propuesto se ocupa antes de confirmar
- **THEN** se muestra `Registro de cita ya agendado`, la cita original sigue vigente sin cancelar y se vuelven a proponer
  horarios

#### Scenario: Varias citas, una falla
- **WHEN** el administrativo confirma la reasignación de tres citas y el horario de una ya no está libre
- **THEN** dos quedan reasignadas, la tercera sigue vigente y el resultado indica cuál falló y por qué

#### Scenario: La cita nueva no hereda la confirmación
- **WHEN** se reasigna una cita que estaba `confirmada`
- **THEN** la cita nueva queda `reservada`

#### Scenario: Trazabilidad de quién y cuándo
- **WHEN** se reasigna una cita
- **THEN** la original conserva el instante de cancelación y el administrativo que la reasignó, y desde la nueva se puede
  llegar a la original

### Requirement: La excepción de la ventana de cancelación solo sirve para una baja real
La reasignación SHALL rechazarse cuando el bloqueo indicado no pertenezca al médico de la cita o no cubra su horario, cuando
el destino no sea un médico activo de la misma especialidad o cuando el destino sea el mismo médico original. El rechazo
SHALL ocurrir en la base de datos aunque la operación se invoque directamente, y solo el administrativo SHALL poder invocarla.

#### Scenario: Bloqueo de otro médico (negativo)
- **WHEN** se intenta reasignar una cita indicando como baja el bloqueo de un médico distinto del de la cita
- **THEN** se rechaza, la cita sigue vigente y no se crea ninguna cita nueva

#### Scenario: Bloqueo que no cubre la cita (negativo)
- **WHEN** el bloqueo indicado termina antes de que empiece la cita
- **THEN** se rechaza, la cita sigue vigente y no se aplica la excepción de la ventana

#### Scenario: Sustituto de otra especialidad o inactivo (negativo)
- **WHEN** se intenta reasignar a un médico de otra especialidad, a uno con `activo = false` o al mismo médico original
- **THEN** se rechaza con un mensaje de reasignación no válida y la cita sigue vigente

#### Scenario: Otros roles no reasignan (negativo)
- **WHEN** un paciente, un médico, una enfermera o una sesión sin rol intenta reasignar una cita
- **THEN** la base de datos rechaza la operación y ninguna cita cambia

### Requirement: Sin sustituto, la cita queda marcada para contacto manual
Si no hay ningún sustituto disponible para una cita afectada, el sistema SHALL dejarla vigente, nunca cancelarla por su
cuenta, y mostrarla con la marca «Contactar al paciente» junto a los datos de contacto del paciente (correo y teléfono). La
marca SHALL calcularse en cada consulta a partir de los datos vigentes (cita vigente cubierta por un bloqueo del médico y
sin horario sustituto disponible), de modo que no pueda quedar desincronizada: la cita SHALL salir de esa situación cuando
el administrativo la reprograme, la cancele o la reasigne, cuando el bloqueo deje de cubrirla o cuando aparezca un
sustituto.

#### Scenario: Cita sin sustituto
- **WHEN** ningún médico de la misma especialidad tiene horario libre en los 7 días siguientes
- **THEN** la cita sigue `reservada` o `confirmada`, aparece con la marca «Contactar al paciente» y el correo y el teléfono
  del paciente, y el sistema no la cancela

#### Scenario: El administrativo la resuelve
- **WHEN** el administrativo reprograma manualmente la cita a otro horario, o la cancela (permitido por estar cubierta por
  el bloqueo)
- **THEN** la cita deja de tener la marca «Contactar al paciente»

#### Scenario: El bloqueo se acorta
- **WHEN** el administrativo acorta el bloqueo de modo que ya no cubre la cita
- **THEN** la cita deja de estar afectada y de tener la marca porque el médico volvió a estar disponible

#### Scenario: Nada se cancela solo
- **WHEN** pasa el tiempo sin que el administrativo actúe sobre una cita afectada
- **THEN** la cita sigue vigente: ningún proceso automático la cancela

### Requirement: La reasignación no concede acceso a historias clínicas
Reasignar una cita SHALL NO crear ni modificar asignaciones paciente-médico y SHALL NO dar al médico sustituto acceso a la
historia clínica del paciente. La cita nueva nace `reservada`; el acceso, si corresponde, lo otorgan los mecanismos de
asignación vigentes (ADR-0016), por ejemplo cuando la recepción confirma la cita nueva, y no este flujo.

#### Scenario: El sustituto no ve la historia por haber recibido la cita (negativo)
- **WHEN** se reasigna a un paciente a un médico sustituto que no lo tenía a su cargo y ese médico consulta las atenciones y
  antecedentes del paciente
- **THEN** no recibe ninguna fila

#### Scenario: El acceso nace al confirmar la cita nueva
- **WHEN** la recepción confirma la cita nueva del paciente con el médico sustituto
- **THEN** el sustituto obtiene la asignación vigente de ADR-0016 y, solo entonces, puede consultar la historia del paciente

#### Scenario: Las asignaciones existentes no cambian
- **WHEN** se reasigna una cita
- **THEN** las asignaciones paciente-médico existentes no se crean, no se modifican ni se revocan por este flujo

### Requirement: El paciente es informado de la reasignación
Cada reasignación confirmada SHALL emitir un evento de cita reprogramada con motivo `baja_medica`, que identifica la cita
original y la nueva, para que el sistema de notificaciones informe al paciente por correo. Un fallo al procesar el evento no
SHALL revertir la reasignación.

#### Scenario: Evento por reasignación
- **WHEN** se reasigna una cita con éxito
- **THEN** se emite un evento de cita reprogramada con motivo `baja_medica` que incluye el identificador de la original y el
  de la nueva

#### Scenario: Fallo al procesar el evento
- **WHEN** el procesamiento del evento falla
- **THEN** la reasignación permanece confirmada y el resultado de la operación es de éxito
