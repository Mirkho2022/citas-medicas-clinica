# gestion-de-citas Specification

## Purpose
Que el administrativo agende, reprograme y cancele citas de cualquier paciente sin cruces de horario, respetando la
ventana de cancelación de 1 hora, con mensajes de negocio en español y con fechas y horas siempre en la zona de la clínica.

## Requirements

### Requirement: Solo el administrativo opera la agenda del panel
Las operaciones del panel administrativo (agendar, reprogramar, confirmar y cancelar citas; marcar «No asistió»; gestionar
horarios y bloqueos; registrar y buscar pacientes; reasignar por baja) SHALL ejecutarse únicamente con una sesión válida, el
rol `administrativo` y MFA activo. La única operación sobre el estado de una cita que no es del administrativo es marcarla
«Atendida», que corresponde solo al médico dueño (ver su requisito). Cualquier otro caso SHALL ser rechazado sin ejecutar la operación ni revelar datos, aunque la operación se invoque
directamente sin pasar por la pantalla. La autoridad de acceso a los datos sigue siendo la RLS de la base de datos.

#### Scenario: Paciente invoca una operación del panel (negativo)
- **WHEN** un paciente con sesión válida invoca directamente agendar, reprogramar o cancelar una cita de cualquier paciente
- **THEN** la operación se rechaza con un mensaje de falta de permiso y no cambia ninguna cita

#### Scenario: Médico o enfermera invoca una operación del panel (negativo)
- **WHEN** un médico o una enfermera invoca cualquiera de las operaciones del panel
- **THEN** la operación se rechaza con un mensaje de falta de permiso y no cambia ningún dato

#### Scenario: Sin sesión
- **WHEN** se invoca una operación del panel sin sesión
- **THEN** no se ejecuta ninguna consulta y la respuesta indica que se requiere iniciar sesión

#### Scenario: Administrativo sin MFA
- **WHEN** un administrativo cuya cuenta no tiene MFA activo invoca una operación del panel
- **THEN** la operación se rechaza y se le indica que configure el segundo factor

#### Scenario: Administrativo con sesión y MFA
- **WHEN** un administrativo con MFA activo invoca una operación del panel con datos válidos
- **THEN** la operación se ejecuta

### Requirement: El administrativo agenda una cita en un horario libre
El administrativo SHALL poder agendar una cita eligiendo un paciente (identificado por su documento), un médico y uno de los
horarios libres de ese médico. La cita SHALL nacer en estado `reservada`, con origen `administrativo` y con el perfil del
administrativo como autor. La base de datos SHALL rechazar un horario que no coincida exactamente con un slot de la
disponibilidad vigente del médico, que esté en el pasado, que se solape con un bloqueo del médico o que sea de un médico
dado de baja.

#### Scenario: Reserva exitosa
- **WHEN** el administrativo agenda para un paciente existente un horario libre de un médico activo
- **THEN** se crea una cita `reservada` con origen `administrativo`, el horario deja de ofrecerse y la pantalla confirma
  médico, fecha y hora en hora de Lima

#### Scenario: Horario en el pasado
- **WHEN** se intenta agendar un horario que ya empezó
- **THEN** se rechaza con «El horario elegido ya no está disponible. Elija otro horario.» y no se crea ninguna cita

#### Scenario: Horario fuera de la agenda del médico
- **WHEN** se intenta agendar un horario que no es un slot de la disponibilidad del médico, por ejemplo a las 03:10 o con una
  duración distinta a la del slot
- **THEN** se rechaza con el mismo mensaje de horario no disponible y no se crea ninguna cita

#### Scenario: Horario dentro de un bloqueo o de un médico dado de baja
- **WHEN** se intenta agendar un horario cubierto por un bloqueo del médico, o de un médico con `activo = false`
- **THEN** se rechaza con el mensaje de horario no disponible y no se crea ninguna cita

#### Scenario: Datos incompletos
- **WHEN** se envía el formulario sin paciente, sin médico o sin horario
- **THEN** se rechaza en el servidor con un mensaje por campo, sin consultar la base de datos

#### Scenario: La cita nace reservada
- **WHEN** el administrativo agenda una cita
- **THEN** su estado es `reservada` y no `confirmada`

### Requirement: Un único punto de reserva para el administrativo y el paciente
La reserva SHALL hacerse mediante una sola operación de la base de datos que valide las condiciones del requisito anterior
y fije el origen según el rol: `administrativo` para el administrativo y `portal` para el paciente. Solo el administrativo y
el paciente SHALL poder reservar; un paciente SHALL reservar únicamente a su propio nombre.

#### Scenario: Paciente reserva a su nombre
- **WHEN** un paciente reserva un horario libre a su propio nombre
- **THEN** la cita se crea con origen `portal`

#### Scenario: Paciente reserva a nombre de otro (negativo)
- **WHEN** un paciente intenta reservar con el identificador de otro paciente
- **THEN** la base de datos rechaza la operación y no se crea ninguna cita

#### Scenario: Médico y enfermera no reservan (negativo)
- **WHEN** un médico, una enfermera o una sesión sin rol intenta reservar una cita
- **THEN** la base de datos rechaza la operación y no se crea ninguna cita

### Requirement: La doble reserva se bloquea en la base de datos con el mensaje exacto
La base de datos SHALL impedir que un médico tenga dos citas `reservada` o `confirmada` solapadas y que un paciente esté
en dos citas vigentes a la vez. Todo punto del sistema que inserte citas (agendar, reprogramar, reasignar) SHALL traducir
tanto el error de violación de exclusión (`23P01`) como el de deadlock detectado (`40P01`) al mensaje
`Registro de cita ya agendado`, escrito exactamente así, sin reformularlo ni traducirlo y sin añadir texto de la base de
datos. La validación previa de la aplicación solo mejora el mensaje: la garantía es la restricción de la base de datos.

#### Scenario: Segunda cita en el mismo horario del mismo médico
- **WHEN** el administrativo agenda un horario que otra cita vigente del mismo médico ya ocupa
- **THEN** se rechaza con `Registro de cita ya agendado` y la primera cita queda intacta

#### Scenario: El mismo paciente en dos citas a la vez
- **WHEN** se agenda para un paciente un horario que se solapa con otra cita vigente suya con un médico distinto
- **THEN** se rechaza con `Registro de cita ya agendado`

#### Scenario: Reservas simultáneas del mismo horario
- **WHEN** cinco sesiones independientes intentan reservar a la vez el mismo horario del mismo médico, repetido en 20 rondas
- **THEN** en cada ronda exactamente una cita queda creada y las demás reciben `Registro de cita ya agendado`, tanto si el
  motor respondió `23P01` como `40P01`, y ninguna deja una cita

#### Scenario: El deadlock se traduce igual que la violación de exclusión
- **WHEN** una inserción de cita falla con `40P01`
- **THEN** el usuario ve `Registro de cita ya agendado`, no un error genérico

#### Scenario: Horario ocupado mientras la pantalla estaba abierta
- **WHEN** dos administrativos tienen abierto el mismo horario libre, el primero confirma y luego el segundo confirma
- **THEN** el segundo ve `Registro de cita ya agendado` como alerta de error y la lista de horarios se actualiza sin ese
  horario

#### Scenario: Una cita cancelada libera el horario
- **WHEN** la cita que ocupaba un horario se cancela y se agenda otra en el mismo horario
- **THEN** la nueva cita se acepta

#### Scenario: El mensaje exacto no cambia entre pantallas
- **WHEN** el rechazo ocurre al agendar, al reprogramar o al reasignar
- **THEN** el texto mostrado es siempre exactamente `Registro de cita ya agendado`

### Requirement: La advertencia de la ventana de cancelación se muestra antes de confirmar
Antes de confirmar una reserva, la pantalla SHALL mostrar el resumen (médico, especialidad, fecha y hora en `America/Lima`)
y una advertencia de que la cita solo puede cancelarse hasta 1 hora antes, indicando la hora límite en hora de Lima. Si al
momento de agendar faltan menos de 1 hora para la cita, la advertencia SHALL decir que esa cita ya no podrá cancelarse.

#### Scenario: Cita a las 14:30
- **WHEN** el administrativo elige el horario de las 14:30 y aún no confirma
- **THEN** ve el resumen y la advertencia «Informe al paciente: la cita solo puede cancelarse hasta 1 hora antes, a las
  13:30.»

#### Scenario: Cita con menos de una hora de anticipación
- **WHEN** el administrativo elige un horario que empieza dentro de 40 minutos
- **THEN** la advertencia indica que esa cita no podrá cancelarse porque falta menos de 1 hora

#### Scenario: La hora límite no depende del navegador
- **WHEN** el navegador del administrativo está configurado en otra zona horaria
- **THEN** la hora límite mostrada sigue siendo la de `America/Lima`

### Requirement: La cancelación respeta la ventana de 1 hora para todos los roles
Una cita SHALL poder cancelarse solo si faltan 1 hora o más para su inicio, también cuando quien cancela es el
administrativo; la base de datos SHALL rechazar la cancelación con el mensaje «No es posible cancelar con menos de 1 hora
de anticipación». La única excepción es la cancelación que forma parte de una reasignación por baja médica, es decir, una
cita cubierta por un bloqueo del mismo médico. Cancelar SHALL pedir confirmación explícita, nunca borra la cita y registra
quién y cuándo cancela. Solo una cita `reservada` o `confirmada` SHALL poder cancelarse.

#### Scenario: Cancelación con más de una hora
- **WHEN** el administrativo confirma la cancelación de una cita que empieza dentro de 2 horas
- **THEN** la cita pasa a `cancelada`, queda registrado el administrativo y el instante, y el horario vuelve a ofrecerse

#### Scenario: Exactamente una hora
- **WHEN** se cancela una cita que empieza exactamente dentro de 1 hora
- **THEN** la cancelación se acepta

#### Scenario: Menos de una hora, aunque cancele el administrativo (negativo)
- **WHEN** el administrativo cancela una cita que empieza dentro de 59 minutos y no hay bloqueo del médico que la cubra
- **THEN** se rechaza con «No es posible cancelar con menos de 1 hora de anticipación» y la cita sigue vigente

#### Scenario: Cita cubierta por un bloqueo del médico
- **WHEN** se cancela, dentro de la hora previa, una cita cubierta por un bloqueo del mismo médico
- **THEN** la cancelación se acepta porque forma parte de la reasignación por baja

#### Scenario: Cita que no está vigente
- **WHEN** se intenta cancelar una cita `cancelada`, `atendida` o `no_asistio`, o que otro administrativo acaba de cancelar
- **THEN** se rechaza con «La cita ya no está vigente» y no cambia nada

#### Scenario: La pantalla guía cuando la ventana ya venció
- **WHEN** la cita empieza dentro de menos de 1 hora y no está cubierta por un bloqueo
- **THEN** la acción de cancelar se muestra deshabilitada con la explicación de la ventana y la indicación de registrar una
  baja de agenda si el médico no puede atender

#### Scenario: Confirmación explícita
- **WHEN** el administrativo pulsa «Cancelar cita»
- **THEN** se le pide confirmar antes de ejecutar, y la cita no cambia si lo descarta

### Requirement: Reprogramar cancela la cita original y crea la nueva en una sola transacción
Reprogramar SHALL cancelar la cita original y crear la nueva (otro horario y, opcionalmente, otro médico) dentro de una única
transacción: si cualquiera de los dos pasos falla, la original SHALL quedar intacta. La cita nueva SHALL aplicar las mismas
validaciones que agendar, nacer `reservada` y apuntar a la original mediante `reprogramada_de`. Como reprogramar cancela la
original, la ventana de 1 hora SHALL aplicarle.

#### Scenario: Reprogramación exitosa
- **WHEN** el administrativo mueve una cita de dentro de 3 horas a otro horario libre del mismo médico
- **THEN** la original queda `cancelada` y existe una cita nueva `reservada` con `reprogramada_de` igual a la original

#### Scenario: El nuevo horario está ocupado (atomicidad)
- **WHEN** el nuevo horario ya está ocupado cuando se confirma la reprogramación
- **THEN** se muestra `Registro de cita ya agendado` y la cita original sigue vigente y sin cancelar

#### Scenario: El nuevo horario no es válido (atomicidad)
- **WHEN** el nuevo horario está en el pasado o fuera de la agenda del médico
- **THEN** se rechaza con el mensaje de horario no disponible y la cita original sigue vigente

#### Scenario: La original empieza dentro de la hora previa (negativo)
- **WHEN** se intenta reprogramar una cita que empieza dentro de 30 minutos y no está cubierta por un bloqueo
- **THEN** se rechaza con un mensaje que indica que no se puede reprogramar con menos de 1 hora de anticipación, la original
  sigue vigente y no se crea ninguna cita nueva

#### Scenario: La cita nueva no hereda la confirmación
- **WHEN** se reprograma una cita que estaba `confirmada`
- **THEN** la cita nueva queda `reservada`

#### Scenario: Dos administrativos reprograman la misma cita
- **WHEN** dos administrativos reprograman a la vez la misma cita hacia horarios distintos
- **THEN** una reprogramación se aplica y la otra recibe «La cita ya no está vigente», sin que queden dos citas nuevas

### Requirement: La agenda del día muestra citas, estados y huecos libres
El administrativo SHALL ver, para una fecha (calendario de `America/Lima`) y un médico (o todos), las citas ordenadas por
hora con paciente (nombre y documento), médico, estado con etiqueta e icono, y los huecos libres de cada médico. Las acciones
SHALL aparecer solo cuando corresponden: «Confirmar» en las citas `reservada` que aún no terminaron, «No asistió» en las
`confirmada` cuya hora ya empezó, y «Reprogramar» y «Cancelar cita» en las vigentes; «Atendida» no se ofrece en esta
pantalla porque la marca el médico. Elegir un hueco libre SHALL llevar a agendar con el médico y
el horario ya elegidos. Sin citas ni huecos, la pantalla SHALL indicarlo y ofrecer la siguiente acción.

#### Scenario: Día con citas y huecos
- **WHEN** el administrativo abre la agenda de un médico para un día con dos citas y cuatro horarios libres
- **THEN** ve las dos citas con su estado y los huecos libres intercalados por hora, todo en hora de Lima

#### Scenario: Cita cancelada visible y sin acciones
- **WHEN** una cita del día está `cancelada`, `atendida` o `no_asistio`
- **THEN** se muestra con su estado y sin ninguna acción

#### Scenario: Acciones según el estado de la cita
- **WHEN** el día tiene una cita `reservada` que no terminó, una `confirmada` cuya hora ya empezó y una `confirmada` futura
- **THEN** la primera ofrece «Confirmar», «Reprogramar» y «Cancelar cita»; la segunda ofrece «No asistió», «Reprogramar» y
  «Cancelar cita» (esta última deshabilitada si falta menos de 1 hora); la tercera no ofrece «No asistió» todavía

#### Scenario: Agendar desde un hueco
- **WHEN** el administrativo elige «Agendar» en un hueco libre
- **THEN** el formulario de nueva cita se abre con ese médico y ese horario ya elegidos

#### Scenario: Día sin disponibilidad
- **WHEN** el médico no atiende el día elegido
- **THEN** la pantalla lo dice y ofrece cambiar de fecha o revisar los horarios del médico

### Requirement: Fechas y horas se guardan con zona y se muestran en America/Lima
Todo instante de una cita SHALL guardarse con zona horaria y mostrarse con fecha `dd/MM/yyyy` y hora `HH:mm` de 24 horas
en `America/Lima`, sin importar la zona del navegador o del servidor. Una fecha y hora elegidas en pantalla SHALL
interpretarse como hora de Lima. Un horario elegido de la lista de libres SHALL viajar al servidor como el instante exacto
que el servidor calculó, no reconstruido a partir de texto local.

#### Scenario: Cita de las 14:30 desde un navegador en otra zona
- **WHEN** el administrativo agenda el horario de las 14:30 hora de Lima desde un navegador configurado en Tokio
- **THEN** la cita se guarda en las 19:30 UTC y se muestra como `14:30`

#### Scenario: Cita de la noche en Lima
- **WHEN** una cita es el 14/10/2026 a las 23:30 hora de Lima, que en UTC ya es el 15/10
- **THEN** se muestra como `14/10/2026` y `23:30`, tanto con el servidor en UTC como en otra zona

### Requirement: Los errores se muestran como mensajes de negocio en español
Cada operación SHALL responder con un resultado tipado: éxito con sus datos, o fallo con un mensaje en español y un código de
error. Los errores esperados (doble reserva, cancelación tardía, horario no disponible, cita no vigente, transición de estado
no válida, falta de permiso, datos inválidos, documento duplicado, solape de horarios o ausencias) SHALL tener su propio mensaje. Un error inesperado SHALL
mostrar un mensaje genérico y no SHALL revelar texto, tablas ni restricciones de la base de datos. El botón que envía una
operación SHALL deshabilitarse mientras la operación está en curso.

#### Scenario: Cancelación tardía
- **WHEN** la base de datos rechaza una cancelación por la ventana de 1 hora
- **THEN** la pantalla muestra «No es posible cancelar con menos de 1 hora de anticipación» y no el texto técnico del error

#### Scenario: Error inesperado
- **WHEN** la base de datos devuelve un error que la aplicación no reconoce
- **THEN** el usuario ve «No se pudo completar la operación. Intente nuevamente.» sin texto de la base de datos, y el error
  queda registrado en el servidor sin datos personales del paciente

#### Scenario: Doble clic en el botón
- **WHEN** el administrativo pulsa dos veces «Reservar cita»
- **THEN** la operación se envía una sola vez y el botón muestra «Reservando…» mientras dura

### Requirement: Los cambios de una cita emiten eventos para las notificaciones
Después de confirmar en la base de datos una reserva, una cancelación, una reprogramación o una reasignación por baja, el
sistema SHALL emitir un evento de cita con su tipo, el identificador de la cita, el de la cita anterior cuando exista y el
motivo (`reprogramacion` o `baja_medica`). El evento SHALL contener solo identificadores, sin datos clínicos ni el motivo de
la cita. Un fallo al procesar el evento no SHALL revertir ni modificar el resultado de la operación. En este change el
procesamiento del evento no envía ningún correo; lo conecta el change de notificaciones.

#### Scenario: Reserva emite su evento
- **WHEN** se agenda una cita con éxito
- **THEN** se emite un evento de cita reservada con el identificador de la nueva cita

#### Scenario: Reprogramación emite un solo evento
- **WHEN** se reprograma una cita con éxito
- **THEN** se emite un evento de cita reprogramada con el identificador de la cita nueva y el de la original, y no uno de
  cancelación adicional

#### Scenario: El evento no lleva datos clínicos
- **WHEN** se emite cualquier evento de cita
- **THEN** no contiene el motivo de la cita, diagnósticos ni contenido clínico

#### Scenario: Un fallo del notificador no deshace la operación
- **WHEN** el procesamiento del evento lanza un error
- **THEN** la cita queda creada, cancelada o reprogramada y el administrativo recibe el resultado de éxito

### Requirement: El ciclo de estados de la cita admite solo transiciones definidas
Para toda operación hecha con una sesión de usuario, la base de datos SHALL admitir únicamente estas transiciones de estado de
una cita: `reservada → confirmada`, `confirmada → no_asistio`, `confirmada → atendida` y `reservada` o `confirmada →
cancelada` (esta última sujeta a la ventana de 1 hora). Cualquier otra transición SHALL rechazarse sin cambiar la cita, en
particular: desde `cancelada`, `atendida` o `no_asistio` (estados finales), `reservada → atendida`, `reservada → no_asistio`,
`confirmada → reservada` y cualquier regreso a `reservada`. Una cita insertada por un usuario SHALL nacer `reservada`. El
mensaje de rechazo SHALL estar en español y decir qué estado se esperaba. La única transición que no hace un usuario es
`reservada → no_asistio`, que ejecuta el sistema al cerrar las citas vencidas (requisito «Una cita reservada que terminó sin
confirmarse se cierra sola como «No asistió»»).

#### Scenario: Una cita cancelada no se confirma (negativo)
- **WHEN** se intenta confirmar una cita `cancelada`
- **THEN** se rechaza con «Solo se puede confirmar una cita reservada que aún no terminó» y la cita sigue `cancelada`

#### Scenario: Los estados finales no cambian (negativo)
- **WHEN** se intenta cambiar el estado de una cita `atendida`, `no_asistio` o `cancelada` a cualquier otro
- **THEN** la operación se rechaza y el estado no cambia

#### Scenario: Saltos de estado no permitidos (negativo)
- **WHEN** se intenta pasar una cita `reservada` directamente a `atendida` o a `no_asistio`, o una `confirmada` de vuelta a
  `reservada`
- **THEN** la operación se rechaza y el estado no cambia

#### Scenario: Una cita nueva solo nace reservada (negativo)
- **WHEN** un usuario inserta una cita ya `confirmada`, `atendida`, `no_asistio` o `cancelada`
- **THEN** la base de datos rechaza la inserción

#### Scenario: Las cargas del dueño de la base no pasan por esta regla
- **WHEN** una migración de datos o la siembra de demostración, ejecutadas por el dueño de la base y no por un usuario de la
  aplicación, insertan citas en estados históricos
- **THEN** la operación se acepta, porque esta restricción protege las operaciones de los usuarios de la aplicación

### Requirement: La recepción confirma una cita reservada
El administrativo SHALL poder confirmar una cita `reservada` que aún no ha terminado, ya sea por el ingreso del paciente a la
clínica o por confirmación telefónica; la cita pasa a `confirmada`. Confirmar es el hecho que, según ADR-0016, genera la
asignación paciente-médico con la que el médico accede a la historia del paciente: este requisito no cambia esa regla, solo
define quién la dispara y que no puede dispararse sobre una cita que ya terminó. Confirmar una cita ya `confirmada` SHALL
responder éxito sin cambiar nada ni duplicar la asignación. Solo el administrativo SHALL poder confirmar.

#### Scenario: Confirmación exitosa
- **WHEN** el administrativo confirma una cita `reservada` que empieza dentro de 2 horas
- **THEN** la cita pasa a `confirmada`, la agenda la muestra con su insignia y el médico de la cita queda con una asignación
  vigente sobre ese paciente

#### Scenario: Antes de confirmar no hay acceso a la historia (negativo)
- **WHEN** el médico de una cita `reservada`, aún sin confirmar, consulta las atenciones y antecedentes del paciente
- **THEN** no recibe ninguna fila, y solo la recibe cuando la recepción confirma la cita

#### Scenario: Una cita que ya terminó no se confirma (negativo)
- **WHEN** se intenta confirmar una cita `reservada` cuya hora de fin ya pasó
- **THEN** se rechaza con «Solo se puede confirmar una cita reservada que aún no terminó», la cita no cambia y no se
  concede ninguna asignación

#### Scenario: Doble clic en «Confirmar»
- **WHEN** el administrativo confirma dos veces seguidas la misma cita
- **THEN** ambas respuestas son de éxito y existe una sola asignación para esa cita

#### Scenario: Otros roles no confirman (negativo)
- **WHEN** un paciente, un médico (incluido el dueño de la cita), una enfermera o una sesión sin rol intenta confirmar una cita
- **THEN** la operación se rechaza o no afecta ninguna fila, y la cita sigue `reservada`

### Requirement: La recepción marca «No asistió» una cita confirmada cuya hora ya empezó
El administrativo SHALL poder marcar `no_asistio` una cita `confirmada` solo desde la hora de inicio de la cita. Antes de esa
hora, o sobre una cita que no esté `confirmada`, la operación SHALL rechazarse. Solo el administrativo SHALL poder hacerlo.

#### Scenario: Paciente que no se presentó
- **WHEN** el administrativo marca «No asistió» una cita `confirmada` que empezó hace 15 minutos
- **THEN** la cita pasa a `no_asistio` y no admite más cambios

#### Scenario: Antes de la hora de la cita (negativo)
- **WHEN** se intenta marcar «No asistió» una cita `confirmada` que empieza dentro de 30 minutos
- **THEN** se rechaza con «Solo se puede marcar «No asistió» una cita confirmada cuya hora ya empezó» y la cita no cambia

#### Scenario: Cita sin confirmar (negativo)
- **WHEN** se intenta marcar «No asistió» una cita `reservada`, `cancelada` o `atendida` aunque su hora ya haya pasado
- **THEN** se rechaza con el mismo mensaje y la cita no cambia

#### Scenario: Otros roles no marcan «No asistió» (negativo)
- **WHEN** un paciente, un médico, una enfermera o una sesión sin rol intenta marcar «No asistió» una cita
- **THEN** la operación se rechaza o no afecta ninguna fila, y la cita sigue `confirmada`

### Requirement: Una cita reservada que terminó sin confirmarse se cierra sola como «No asistió»
La base de datos SHALL ofrecer una operación del sistema que pase a `no_asistio` toda cita `reservada` cuya hora de fin ya
llegó (`fin <= now()`), cambiando únicamente su estado, de forma idempotente y devolviendo cuántas citas cerró. NO SHALL tocar las
citas `confirmada`, `cancelada` ni `atendida`, ni las `reservada` en curso o futuras. No SHALL depender de un cron: la aplicación
SHALL invocarla cuando el personal usa el sistema (al abrir la agenda del administrativo, antes de leerla), mediante una puerta que
exige el rol administrativo o médico y que SHALL rechazar al paciente, a la enfermera, a una sesión sin rol y a un anónimo. La
operación interna NO SHALL poder ejecutarla ningún rol de la aplicación, y ningún usuario SHALL poder pasar por su cuenta una cita
`reservada` a `no_asistio`. La auditoría SHALL registrar al usuario cuya sesión disparó el cierre (o sin actor si lo hizo el dueño
de la base). Una cita así cerrada SHALL dejar de dar al médico la lectura de los datos del paciente que daba mientras estaba
`reservada`.

#### Scenario: La cita reservada que terminó se cierra como «No asistió»
- **WHEN** el sistema ejecuta el cierre y existe una cita `reservada` cuyo fin fue hace 2 horas y 40 minutos
- **THEN** la cita pasa a `no_asistio`, no cambia ningún otro dato y queda un registro de auditoría

#### Scenario: Abrir la agenda cierra las vencidas antes de mostrarlas
- **WHEN** el administrativo abre la agenda del día y hay una cita `reservada` que terminó sin confirmarse
- **THEN** la agenda la muestra como «No asistió», sin que nadie la haya marcado ni haya corrido ningún cron

#### Scenario: El médico también lo dispara
- **WHEN** un médico abre su jornada y hay `reservada` vencidas
- **THEN** se cierran y la auditoría registra al médico como quien tenía la sesión

#### Scenario: Lo que no terminó o no está reservada no se toca
- **WHEN** el sistema ejecuta el cierre y hay una cita `reservada` en curso, otra `reservada` futura, una `confirmada` que ya
  terminó, una `cancelada` y una `atendida`
- **THEN** ninguna de las cinco cambia de estado

#### Scenario: El cierre es idempotente
- **WHEN** el sistema ejecuta el cierre dos veces seguidas sin citas nuevas vencidas
- **THEN** la segunda ejecución devuelve 0 y no cambia ninguna cita

#### Scenario: Solo el personal lo dispara y nadie lo hace a mano (negativo)
- **WHEN** una enfermera, un paciente o una sesión sin rol intenta cerrar las citas vencidas, o un usuario intenta ejecutar la
  operación interna, o el administrativo intenta pasar una cita `reservada` a `no_asistio` con una actualización directa
- **THEN** la operación se rechaza y ninguna cita cambia

#### Scenario: El médico pierde la lectura del paciente de una cita muerta
- **WHEN** el médico A leía a un paciente solo por una cita `reservada` que terminó, y el sistema ejecuta el cierre
- **THEN** el médico A deja de ver los datos de ese paciente, y sigue viendo a los que conservan citas `reservada` o `confirmada`
  vigentes con él

### Requirement: Solo el médico dueño de la cita la marca «Atendida», mediante una operación acotada
Solo el médico activo dueño de una cita SHALL poder marcarla `atendida`, y solo cuando está `confirmada` y su hora de inicio ya
llegó. La operación SHALL cambiar únicamente el estado de la cita, sin tocar ningún otro dato, y SHALL ser la única vía:
el médico NO SHALL tener permiso de actualización directa sobre las citas, y el administrativo, la enfermera y el paciente NO
SHALL poder marcar una cita como `atendida`. Para el médico, una cita ajena SHALL tratarse como inexistente, sin revelar de
quién es.

#### Scenario: El médico dueño marca la cita como atendida
- **WHEN** el médico dueño de una cita `confirmada` que empezó hace 20 minutos la marca «Atendida»
- **THEN** la cita pasa a `atendida` y no admite más cambios

#### Scenario: Solo cambia el estado
- **WHEN** el médico marca «Atendida» una cita
- **THEN** el paciente, el médico, el horario y el motivo de la cita siguen idénticos, y la auditoría registra al médico como
  autor del cambio

#### Scenario: Otro médico no puede (negativo)
- **WHEN** un médico distinto del dueño intenta marcar «Atendida» una cita ajena
- **THEN** se rechaza como si la cita no existiera y la cita no cambia

#### Scenario: Administrativo, enfermera, paciente y sesión sin rol no pueden (negativo)
- **WHEN** un administrativo, una enfermera, un paciente o una sesión sin rol intenta marcar «Atendida» una cita, por la
  operación acotada o con una actualización directa de la cita
- **THEN** la operación se rechaza y la cita no cambia

#### Scenario: El médico no actualiza citas directamente (negativo)
- **WHEN** el médico dueño ejecuta una actualización directa del estado, o de cualquier otro dato, de una cita suya
- **THEN** ninguna fila cambia

#### Scenario: Cita sin confirmar o antes de la hora (negativo)
- **WHEN** el médico dueño intenta marcar «Atendida» una cita `reservada`, o una `confirmada` que empieza dentro de 30 minutos
- **THEN** se rechaza con «Solo se puede marcar «Atendida» una cita confirmada cuya hora ya empezó» y la cita no cambia

#### Scenario: Médico dado de baja (negativo)
- **WHEN** un médico con `activo = false` intenta marcar «Atendida» una cita suya
- **THEN** se rechaza y la cita no cambia

### Requirement: Los cambios de estado se auditan y no generan notificaciones
Cada cambio de estado de una cita SHALL quedar en la auditoría con el perfil y el rol de quien lo hizo y el momento.
Confirmar, marcar «No asistió» y marcar «Atendida» no SHALL emitir eventos de cita, porque el sistema de notificaciones no
necesita avisar de ellos. Las tres operaciones SHALL responder con el resultado tipado habitual.

#### Scenario: Auditoría de quién cambió el estado
- **WHEN** la recepción confirma una cita y luego el médico la marca «Atendida»
- **THEN** la auditoría muestra dos cambios, el primero con rol `administrativo` y el segundo con rol `medico`

#### Scenario: Sin eventos de cita
- **WHEN** se confirma, se marca «No asistió» o se marca «Atendida» una cita
- **THEN** no se emite ningún evento de cita

#### Scenario: Resultado tipado ante un rechazo
- **WHEN** una de las tres operaciones es rechazada
- **THEN** la respuesta es un fallo con mensaje en español y código de error, sin texto de la base de datos
