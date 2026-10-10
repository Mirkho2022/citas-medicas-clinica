# Spec Delta

## Purpose

Que el personal administrativo organice quién trabaja con quién y cuándo en enfermería, sin choques de turno, y que cada
enfermera consulte su turno y con qué médico o servicio trabaja, y nada más. Un turno es una enfermera en una fecha y una
franja (mañana, tarde o noche) asignada a un médico o a un servicio.

## ADDED Requirements

### Requirement: El administrativo asigna turnos de enfermería
El sistema SHALL permitir al administrativo asignar a una enfermera activa un turno en una fecha (hoy o posterior) y una
franja (mañana, tarde o noche), indicando **exactamente una** de dos cosas: el médico activo con el que trabajará, o el
servicio (especialidad) en el que trabajará. Los turnos se organizan por semana y la fecha es un día calendario en la zona
`America/Lima`.

#### Scenario: Asignar una enfermera a un médico
- **WHEN** el administrativo asigna a una enfermera activa el turno de la mañana del próximo lunes con un médico activo
- **THEN** el turno queda guardado y aparece en la semana de ese lunes, en la fila de esa enfermera, con el nombre del
  médico y su especialidad

#### Scenario: Asignar una enfermera a un servicio
- **WHEN** el administrativo asigna el turno de la tarde de una fecha futura a una enfermera indicando solo la
  especialidad «Pediatría»
- **THEN** el turno queda guardado y se muestra como «Servicio: Pediatría»

#### Scenario: Sin médico ni servicio
- **WHEN** el administrativo intenta guardar un turno sin médico y sin servicio
- **THEN** no se guarda nada y se muestra «Indique el médico o el servicio con el que trabajará la enfermera»

#### Scenario: Médico y servicio a la vez
- **WHEN** el administrativo intenta guardar un turno con un médico y además con un servicio
- **THEN** no se guarda nada y se muestra «Elija solo una opción: un médico o un servicio»

#### Scenario: Fecha anterior a hoy
- **WHEN** el administrativo intenta asignar un turno en una fecha anterior al día de hoy en Lima
- **THEN** no se guarda nada y se muestra «La fecha del turno no puede ser anterior a hoy»

#### Scenario: Hoy es el día de Lima, no el del servidor
- **WHEN** en Lima son las 23:30 del 14/10/2026 (ya es 15/10/2026 en UTC) y el administrativo asigna un turno para el
  14/10/2026
- **THEN** el turno se acepta, porque el 14/10/2026 todavía es hoy en Lima

#### Scenario: Personal dado de baja
- **WHEN** el administrativo intenta asignar un turno a una enfermera dada de baja, o con un médico dado de baja
- **THEN** no se guarda nada y se muestra «La enfermera está dada de baja» o «El médico está dado de baja», según el caso

### Requirement: Una enfermera no tiene dos turnos iguales el mismo día
El sistema SHALL impedir que una enfermera tenga más de un turno en la misma fecha y franja, incluso cuando dos
administrativos intentan asignarlo a la vez. Cuando el choque ocurre, el sistema SHALL mostrar «La enfermera ya tiene un
turno asignado en esa fecha y franja» y no SHALL mostrar errores internos de la base de datos.

#### Scenario: Misma fecha y franja
- **WHEN** el administrativo asigna a una enfermera la mañana de una fecha en la que ya tiene turno de mañana
- **THEN** el segundo turno no se guarda, el primero queda intacto y se muestra «La enfermera ya tiene un turno asignado
  en esa fecha y franja»

#### Scenario: Otra franja el mismo día
- **WHEN** el administrativo asigna a una enfermera la tarde de una fecha en la que ya tiene turno de mañana
- **THEN** el turno de la tarde se guarda

#### Scenario: Dos asignaciones simultáneas
- **WHEN** dos administrativos asignan a la vez a la misma enfermera la misma fecha y franja
- **THEN** exactamente un turno queda guardado y el otro administrativo recibe «La enfermera ya tiene un turno asignado
  en esa fecha y franja»

### Requirement: El administrativo modifica y quita turnos futuros
El sistema SHALL permitir al administrativo cambiar la franja, el médico o el servicio de un turno de hoy o futuro, y
quitarlo. Los turnos de fechas anteriores a hoy SHALL conservarse como registro de quién trabajó y no SHALL poder
modificarse ni quitarse desde la aplicación. Un cambio SHALL respetar las mismas reglas de la asignación (sin choques, un
médico o un servicio, personal activo).

#### Scenario: Cambiar el médico de un turno
- **WHEN** el administrativo cambia el médico de un turno futuro por otro médico activo
- **THEN** el turno se muestra con el nuevo médico y la enfermera lo ve así la próxima vez que consulte su turno

#### Scenario: Quitar un turno
- **WHEN** el administrativo quita un turno futuro
- **THEN** el turno desaparece de la semana y de la vista de la enfermera

#### Scenario: Cambio que choca con otro turno
- **WHEN** el administrativo cambia la franja de un turno a una franja en la que esa enfermera ya tiene turno ese día
- **THEN** el cambio no se guarda y se muestra «La enfermera ya tiene un turno asignado en esa fecha y franja»

#### Scenario: Turno de una fecha pasada
- **WHEN** el administrativo intenta modificar o quitar un turno de una fecha anterior a hoy
- **THEN** no se cambia nada y se muestra «Los turnos de fechas pasadas no se modifican»

#### Scenario: Turno que otro administrativo ya quitó
- **WHEN** el administrativo guarda un cambio sobre un turno que otra persona acaba de quitar
- **THEN** no se crea ni se modifica nada y se muestra «El turno ya no existe. Actualice la pantalla»

### Requirement: Solo el administrativo gestiona los turnos
Solo un usuario con rol administrativo SHALL poder asignar, modificar o quitar turnos de enfermería. Esta restricción SHALL
cumplirse en la base de datos y no solo en la pantalla: un intento directo de otro rol, sin pasar por la interfaz, SHALL
ser rechazado o no afectar ninguna fila.

#### Scenario: La enfermera intenta crear un turno (negativo)
- **WHEN** una enfermera intenta insertar un turno, aun a su nombre, saltándose la interfaz
- **THEN** la base de datos rechaza la operación y la acción informa «No tiene permiso para gestionar turnos de
  enfermería»

#### Scenario: La enfermera intenta cambiar o quitar su turno (negativo)
- **WHEN** una enfermera intenta modificar o eliminar uno de sus turnos
- **THEN** el turno queda sin cambios

#### Scenario: Médico o paciente intentan escribir turnos (negativo)
- **WHEN** un usuario con rol médico o paciente intenta insertar, modificar o eliminar un turno
- **THEN** la operación es rechazada y no se altera ninguna fila

#### Scenario: Pantalla de gestión de otro rol (negativo)
- **WHEN** una enfermera, un médico o un paciente abre la pantalla de gestión de turnos
- **THEN** no ve su contenido y es llevado a su propia área

### Requirement: La enfermera ve su turno y con quién trabaja, y nada más
El sistema SHALL mostrar a cada enfermera, en su área, sus turnos de hoy y de los próximos 14 días, con la fecha
(`dd/MM/yyyy` y día de la semana en español), la franja y el médico (nombre y especialidad) o el servicio con el que
trabaja. La pantalla SHALL limitarse a eso: no SHALL mostrar pacientes, citas, historias clínicas, turnos de otras
enfermeras ni enlaces a funciones administrativas.

#### Scenario: Turno de hoy con un médico
- **WHEN** una enfermera con turno de la mañana de hoy con un médico de Cardiología abre su área
- **THEN** ve «Hoy», la fecha, la franja «Mañana» y el nombre del médico con su especialidad «Cardiología»

#### Scenario: Turno en un servicio
- **WHEN** una enfermera tiene un turno asignado solo a un servicio
- **THEN** ve «Servicio: » seguido de la especialidad, sin nombre de médico

#### Scenario: Sin turnos
- **WHEN** una enfermera no tiene ningún turno en los próximos 14 días
- **THEN** ve «No tiene turnos asignados en los próximos 14 días»

#### Scenario: No ve turnos ajenos (negativo)
- **WHEN** una enfermera consulta el turno de otra enfermera, por la pantalla o directamente en la base de datos
- **THEN** no recibe ninguna fila

#### Scenario: No ve citas ni pacientes (negativo)
- **WHEN** una enfermera consulta, directamente en la base de datos, `citas` o `pacientes`
- **THEN** no recibe ninguna fila

#### Scenario: No ve historias clínicas (negativo)
- **WHEN** una enfermera consulta `historias_clinicas`, `atenciones`, `addendas` o `antecedentes`
- **THEN** no recibe ninguna fila

#### Scenario: Otros roles no ven turnos de enfermería (negativo)
- **WHEN** un médico o un paciente consulta `turnos_enfermeria`
- **THEN** no recibe ninguna fila

#### Scenario: No abre áreas de otros roles (negativo)
- **WHEN** una enfermera abre las rutas del administrativo, del médico o del paciente
- **THEN** no ve su contenido y vuelve a su propia área

### Requirement: Las franjas se muestran sin inventar horarios
El sistema SHALL mostrar las franjas con las etiquetas «Mañana», «Tarde» y «Noche». Mientras la clínica no defina las
horas exactas de cada franja, el sistema NO SHALL mostrar ni calcular horarios para ellas.

#### Scenario: Etiqueta de franja
- **WHEN** se muestra un turno de cualquier franja en cualquier pantalla
- **THEN** aparece solo su etiqueta («Mañana», «Tarde» o «Noche») y ninguna hora de inicio o de fin

### Requirement: El administrativo ve los turnos afectados por la ausencia de un médico o la baja de personal
El sistema SHALL avisar al administrativo, en la pantalla de turnos, de cada turno de hoy o futuro que esté en una de
estas situaciones: el médico asignado tiene un bloqueo de agenda que alcanza esa fecha, el médico asignado está dado de
baja, o la enfermera está dada de baja. El aviso SHALL indicar la causa y llevar a la modificación del turno. El sistema
NO SHALL modificar ni quitar turnos por su cuenta: la decisión de reasignar a la enfermera es del administrativo. La
reasignación de las **citas** del médico ausente sigue siendo el flujo de la agenda, que este requisito no cambia.

#### Scenario: Médico con bloqueo de agenda
- **WHEN** existe un bloqueo de agenda de un médico que cubre el 20/10/2026 y una enfermera tiene turno con ese médico ese
  día
- **THEN** el administrativo ve ese turno en los avisos con la causa «El médico tiene un bloqueo de agenda ese día» y un
  acceso para modificarlo, y el turno sigue guardado sin cambios

#### Scenario: Médico dado de baja
- **WHEN** un médico es dado de baja y tiene turnos de enfermería futuros
- **THEN** cada uno de esos turnos aparece en los avisos con la causa «El médico está dado de baja»

#### Scenario: Enfermera dada de baja
- **WHEN** una enfermera es dada de baja y tiene turnos futuros
- **THEN** cada uno de esos turnos aparece en los avisos con la causa «La enfermera está dada de baja»

#### Scenario: El aviso desaparece al corregirlo
- **WHEN** el administrativo cambia el médico de un turno en aviso por un médico sin bloqueos
- **THEN** el turno deja de aparecer en los avisos

#### Scenario: Solo el administrativo ve los avisos (negativo)
- **WHEN** una enfermera, un médico o un paciente consulta la información de turnos con aviso
- **THEN** no recibe ninguna fila

#### Scenario: No expone el motivo del bloqueo
- **WHEN** se muestra un aviso causado por un bloqueo de agenda
- **THEN** no se muestra el motivo registrado en el bloqueo (puede ser información personal del médico), solo la causa
  genérica

### Requirement: La gestión y la vista de turnos son accesibles
Las pantallas de turnos SHALL cumplir WCAG 2.1 AA: la semana se presenta como una tabla con encabezados de fila (enfermera)
y de columna (día), todo control se opera con teclado con el foco visible, las acciones y errores se anuncian a los
lectores de pantalla, la franja y la causa de un aviso no se comunican solo con color, y la pantalla se usa sin pérdida de
contenido con el texto ampliado al 200 %. Los mensajes de error SHALL decir qué pasó y cómo corregirlo.

#### Scenario: Revisión automática
- **WHEN** se ejecuta la revisión automática de accesibilidad sobre la pantalla de turnos del administrativo y sobre la de
  la enfermera
- **THEN** no se reporta ninguna violación de nivel A ni AA de WCAG 2.1

#### Scenario: Error en el formulario de turno
- **WHEN** el administrativo envía un turno inválido
- **THEN** el mensaje aparece junto al campo con icono, asociado al campo y anunciado como alerta, y el foco queda en el
  primer campo con error
