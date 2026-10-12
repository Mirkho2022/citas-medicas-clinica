# Spec Delta

## Purpose

Dar al personal administrativo una vista simple, en vivo y de solo lectura del día de la clínica (citas por estado, quién
espera y desde cuándo, huecos libres de cada médico, citas de mañana sin confirmar, citas por reasignar y notificaciones
por revisar) para reducir el tiempo de espera del paciente. No es un módulo analítico: no calcula promedios, históricos ni
tendencias, y no reemplaza la agenda completa, que es de otro módulo.

## ADDED Requirements

### Requirement: El dashboard es solo para el administrativo y es de solo lectura
El sistema SHALL ofrecer el dashboard operativo únicamente al rol administrativo. El dashboard SHALL ser de solo lectura:
no SHALL permitir cambiar el estado de una cita ni modificar datos desde él (la recepción confirma las citas y marca
«no asistió» desde la agenda, y el médico marca «atendida» desde su jornada). Los datos que muestra SHALL leerse con los
permisos de la persona que lo abre, de modo que la base de datos —y no solo la pantalla— niegue el acceso a los demás roles.

#### Scenario: Administrativo abre el dashboard
- **WHEN** un administrativo con sesión y MFA abre el dashboard
- **THEN** ve el panel con sus secciones y ningún control que cambie el estado de una cita

#### Scenario: Otros roles no lo ven (negativo)
- **WHEN** una enfermera, un médico o un paciente abre la ruta del dashboard
- **THEN** no ve su contenido y es llevado a su propia área

#### Scenario: Sin sesión (negativo)
- **WHEN** un visitante sin sesión abre la ruta del dashboard
- **THEN** no ve nada y es llevado a iniciar sesión

#### Scenario: La base de datos niega la lectura a otros roles (negativo)
- **WHEN** una enfermera, un médico, un paciente o una sesión sin rol consulta directamente en la base de datos la
  información operativa de citas del dashboard
- **THEN** no recibe ninguna fila

### Requirement: Citas de hoy por estado
El sistema SHALL mostrar el número de citas de hoy en cada uno de los cinco estados (`reservada`, `confirmada`,
`atendida`, `cancelada`, `no_asistio`), incluidos los estados con cero citas, y el total del día. «Hoy» SHALL ser el día
calendario de la zona `America/Lima`. Cada estado SHALL mostrarse con su etiqueta de texto, su icono y su color, nunca solo
con color.

#### Scenario: Conteo por estado
- **WHEN** hoy hay 3 citas reservadas, 5 confirmadas, 2 atendidas, 1 cancelada y 0 que no asistieron
- **THEN** el panel muestra «Reservada 3», «Confirmada 5», «Atendida 2», «Cancelada 1», «No asistió 0» y un total de 11

#### Scenario: Frontera del día en Lima
- **WHEN** hay una cita a las 23:30 de hoy en Lima (04:30 de mañana en UTC) y otra a las 00:15 de mañana en Lima
- **THEN** la primera cuenta como de hoy y la segunda no

#### Scenario: Día sin citas
- **WHEN** hoy no hay ninguna cita
- **THEN** el panel muestra los cinco estados en cero y el mensaje «Hoy no hay citas»

### Requirement: Pacientes en espera y minutos desde su llegada
El sistema SHALL listar a los pacientes en espera a partir de las **visitas** que registra el change `triaje-y-derivacion` (H6b),
no de la hora de la cita. Una visita está en espera mientras su estado sea `llegada` (espera su triaje), `con_triaje` sin cita
(espera que la enfermera la derive), `con_triaje` con cita o `derivada` (espera a un profesional); deja de estarlo al pasar a
`en_atencion` o a un estado terminal (`atendida`, `abandonada`, `anulada`). Por cada una SHALL mostrar el nombre, el documento, la
fase de la espera, el médico de la cita o la especialidad de destino cuando existan, la hora de llegada y los **minutos
transcurridos desde la llegada**, calculados con el reloj de la base de datos; el conteo se detiene cuando un profesional toma al
paciente. La lista SHALL ordenarse de mayor a menor espera. Cuando la espera supere los 20 minutos, la fila SHALL resaltarse con
el texto «Supera los 20 min» y un icono, además del color. El dashboard SHALL leer las visitas sin escribirlas y SHALL NO exponer
ningún dato de triaje ni de derivación.

#### Scenario: Paciente esperando su triaje
- **WHEN** hay una visita en estado `llegada` cuyo paciente llegó hace 25 minutos
- **THEN** aparece en la lista con «25 min», la fase «Espera su triaje» y la marca «Supera los 20 min»

#### Scenario: Paciente sin cita que espera derivación
- **WHEN** hay una visita sin cita en estado `con_triaje` que llegó hace 12 minutos
- **THEN** aparece con «12 min» y la fase «Espera derivación», sin la marca de exceso

#### Scenario: Paciente que espera a su profesional
- **WHEN** hay una visita con cita en estado `con_triaje`, o una visita `derivada` a una especialidad
- **THEN** aparece con la fase «Espera a su profesional» y, si está derivada, con la especialidad de destino

#### Scenario: Orden por espera
- **WHEN** hay tres pacientes en espera desde hace 8, 31 y 17 minutos
- **THEN** la lista los muestra en el orden 31, 17 y 8 minutos

#### Scenario: Quien ya fue tomado o terminó sale de la lista
- **WHEN** una visita que estaba en la lista pasa a `en_atencion`, `atendida`, `abandonada` o `anulada`
- **THEN** en la siguiente actualización el paciente ya no aparece

#### Scenario: Cita confirmada sin visita
- **WHEN** una cita de hoy está `confirmada` pero el paciente no ha llegado (no existe la visita)
- **THEN** no aparece entre los pacientes en espera y sigue contando por su estado en el resumen por estado

#### Scenario: Visita de otro día
- **WHEN** existe una visita no terminal de ayer que nunca se cerró
- **THEN** no aparece entre los pacientes en espera de hoy

#### Scenario: Nadie espera
- **WHEN** ninguna visita está en espera
- **THEN** la sección muestra «Nadie está esperando ahora»

#### Scenario: Sin datos de triaje ni de derivación (negativo)
- **WHEN** el administrativo consulta lo que alimenta la lista de espera, por la pantalla o directamente en la base de datos
- **THEN** no obtiene mediciones del triaje ni textos de derivación, y la vista no tiene columnas de `triajes` ni de `derivaciones`

#### Scenario: Otros roles (negativo)
- **WHEN** una enfermera, un médico, un paciente o una sesión sin rol consultan la vista que alimenta la lista de espera
- **THEN** no reciben ninguna fila

### Requirement: Resumen de la agenda del día por médico, con los huecos visibles
El sistema SHALL mostrar, por cada médico activo que hoy tiene horario de atención o citas, una fila de resumen con: su nombre
y especialidad; cuántas citas tiene hoy en cada estado; cuántos de sus pacientes con cita están en espera (visita en espera, según el requisito anterior) y la mayor espera en minutos;
los **huecos libres que le quedan hoy**, como rangos con hora de inicio y de fin (hasta cuatro, y «+N más» si hay más); y, si
tiene un bloqueo de agenda hoy, su rango horario sin el motivo. Un hueco es un horario que todavía es reservable según el mismo
cálculo de disponibilidad de la reserva, así que no SHALL mostrarse como hueco un horario ocupado por una cita `reservada` o
`confirmada`, ni uno cubierto por un bloqueo, ni uno que ya pasó. Los horarios libres contiguos SHALL agruparse en un solo
rango. Cada fila SHALL enlazar a la agenda completa del médico para hoy, que es donde se agenda, reprograma y cancela; el
dashboard no ofrece esas acciones. El administrativo SHALL poder filtrar el resumen por especialidad y por médico.

#### Scenario: Médico con citas y huecos
- **WHEN** un médico atiende hoy de 09:00 a 12:00 en horarios de 20 min, tiene citas a las 09:00 y a las 11:00, y son las
  08:00
- **THEN** su fila muestra sus citas por estado y el hueco libre «09:20–11:00» como un solo rango, con el enlace a su agenda

#### Scenario: Una cita cancelada libera el horario
- **WHEN** la cita de las 10:00 de un médico fue cancelada
- **THEN** esa hora vuelve a contarse dentro de un hueco libre y la cita cancelada cuenta en «Cancelada»

#### Scenario: Horarios que ya pasaron
- **WHEN** son las 10:30 y un médico tiene horas libres a las 09:00 y a las 11:00
- **THEN** su fila muestra solo el hueco de las 11:00

#### Scenario: Más de cuatro huecos
- **WHEN** un médico tiene seis huecos libres separados entre sí hoy
- **THEN** la fila muestra los cuatro primeros y «+2 más»

#### Scenario: Sin huecos
- **WHEN** a un médico no le queda ningún horario libre hoy
- **THEN** su fila muestra «Sin huecos libres hoy»

#### Scenario: Médico con bloqueo de agenda
- **WHEN** un médico tiene hoy un bloqueo de agenda de 15:00 a 17:00
- **THEN** su fila muestra «Bloqueo de agenda de 15:00 a 17:00» sin el motivo del bloqueo, y esas horas no cuentan como huecos

#### Scenario: Médico sin horario ni citas hoy
- **WHEN** un médico activo no tiene horario de atención ni citas hoy
- **THEN** no aparece en el resumen

#### Scenario: Filtrar por especialidad
- **WHEN** el administrativo filtra por «Pediatría»
- **THEN** el resumen muestra solo a los médicos de Pediatría, y los conteos por estado y la lista de espera siguen siendo de
  toda la clínica

### Requirement: Citas de mañana que siguen sin confirmar
El sistema SHALL listar las citas de mañana (día calendario de Lima) que siguen en estado `reservada`, con la hora, el
paciente, el documento y el médico, ordenadas por hora. Las citas de mañana en otro estado no SHALL aparecer.

#### Scenario: Citas sin confirmar
- **WHEN** mañana hay 2 citas `reservada` y 4 `confirmada`
- **THEN** la sección lista las 2 `reservada` y ninguna de las otras

#### Scenario: Todas confirmadas
- **WHEN** mañana no hay ninguna cita `reservada`
- **THEN** la sección muestra «Todas las citas de mañana están confirmadas»

### Requirement: Citas por reasignar por la baja de un médico
El sistema SHALL mostrar en el dashboard cuántas citas vigentes han quedado cubiertas por la baja o ausencia de un médico y
siguen pendientes de reasignar, y SHALL llevar a la pantalla donde el administrativo las resuelve. El dashboard NO SHALL
reasignar, cancelar ni proponer sustitutos: ese flujo pertenece a la agenda.

#### Scenario: Hay citas por reasignar
- **WHEN** 3 citas vigentes están cubiertas por el bloqueo de agenda de un médico y aún no se reasignaron
- **THEN** el panel muestra «3 citas esperan reasignación» con un enlace a la pantalla de bajas médicas

#### Scenario: Ninguna por reasignar
- **WHEN** ninguna cita vigente está cubierta por un bloqueo
- **THEN** el panel muestra «Sin citas por reasignar»

#### Scenario: Otros roles no leen esa información (negativo)
- **WHEN** una enfermera, un paciente o una sesión sin rol consulta las citas por reasignar
- **THEN** no recibe ninguna fila

### Requirement: Notificaciones fallidas pendientes de revisión
El sistema SHALL mostrar en el dashboard cuántas notificaciones tienen estado fallido con 3 o más intentos, que son las
que esperan revisión manual. El recuento SHALL llevar a la vista de revisión de notificaciones fallidas del administrativo cuando esa
vista exista; mientras no exista, SHALL mostrarse solo el recuento. El dashboard no duplica esa vista. El dashboard NO SHALL mostrar el contenido de los correos.

#### Scenario: Hay notificaciones por revisar
- **WHEN** 4 notificaciones están fallidas con 3 o más intentos
- **THEN** el panel muestra «4 notificaciones esperan revisión»

#### Scenario: Ninguna por revisar
- **WHEN** no hay notificaciones fallidas con 3 o más intentos
- **THEN** el panel muestra «Sin notificaciones por revisar»

#### Scenario: Una fallida con menos de 3 intentos
- **WHEN** una notificación está fallida con 2 intentos
- **THEN** no se cuenta, porque todavía se reintenta sola

#### Scenario: Otros roles no leen notificaciones (negativo)
- **WHEN** una enfermera, un médico o un paciente consulta `notificaciones`
- **THEN** no recibe ninguna fila

### Requirement: Conteo opcional de copias de historia vencidas
Cuando el change `copia-de-historia-clinica` (H6d) esté aplicado y se haya pedido incluirlo, el dashboard SHALL poder mostrar un
único número con las solicitudes de copia vencidas y un enlace a la pantalla de seguimiento de H6d. El conteo SHALL NO mostrar
nombres, documentos ni contenido de las solicitudes, y el dashboard SHALL NO crear, cerrar ni modificar ninguna solicitud.

#### Scenario: Conteo de vencidas
- **WHEN** hay dos solicitudes de copia vencidas y la opción está incluida
- **THEN** el panel muestra «2 copias vencidas» con un enlace a la pantalla de H6d, sin datos de pacientes

#### Scenario: Sin la opción
- **WHEN** la opción no está incluida o el change de copias no está aplicado
- **THEN** el panel no muestra ninguna sección de copias

### Requirement: El dashboard no expone datos clínicos ni el motivo de la cita
El dashboard SHALL mostrar solo datos logísticos: nombre y documento del paciente, médico, especialidad, hora y estado. NO
SHALL mostrar diagnósticos, notas de atención, antecedentes ni el motivo de la cita. El título de la pestaña, la dirección
(URL) y los mensajes de error NO SHALL contener nombres, documentos ni datos de pacientes.

#### Scenario: Una cita con motivo
- **WHEN** una cita de hoy tiene un motivo registrado, por ejemplo «dolor en el pecho»
- **THEN** ningún bloque del dashboard muestra ese texto

#### Scenario: El administrativo sigue sin acceso clínico (negativo)
- **WHEN** un administrativo consulta, directamente en la base de datos, `atenciones`, `addendas`, `antecedentes` o
  `historias_clinicas`
- **THEN** no recibe ninguna fila

#### Scenario: Título y dirección
- **WHEN** el dashboard muestra a un paciente en espera
- **THEN** el título de la pestaña es siempre «Dashboard operativo» y la dirección no incluye ningún dato del paciente

### Requirement: Los datos se mantienen al día y el usuario conserva el control
El dashboard SHALL actualizarse solo cada 60 segundos mientras la pestaña esté visible, SHALL mostrar «Actualizado a las
HH:mm» en hora de Lima, y SHALL ofrecer un botón «Actualizar ahora» y un control para pausar y reanudar la actualización
automática. La actualización no SHALL mover el foco del teclado ni la posición de desplazamiento. Si la carga falla, el
sistema SHALL mostrar «No se pudo cargar el panel. Intente de nuevo.» con una acción para reintentar y nunca el error de la
base de datos.

#### Scenario: Actualización automática
- **WHEN** el dashboard lleva 60 segundos abierto con la pestaña visible
- **THEN** los datos se vuelven a leer y «Actualizado a las HH:mm» muestra la nueva hora

#### Scenario: Pausar la actualización
- **WHEN** el usuario activa «Pausar actualización»
- **THEN** los datos dejan de actualizarse solos hasta que active «Reanudar actualización», y el control indica su estado
  con texto

#### Scenario: Pestaña oculta
- **WHEN** el usuario cambia a otra pestaña del navegador
- **THEN** el dashboard no consulta la base de datos y, al volver, se actualiza de inmediato

#### Scenario: Foco estable
- **WHEN** el usuario navega con el teclado y ocurre una actualización automática
- **THEN** el foco permanece en el mismo control

#### Scenario: Fallo de lectura
- **WHEN** la base de datos no responde al cargar el panel
- **THEN** se muestra «No se pudo cargar el panel. Intente de nuevo.» con un botón «Reintentar» y ningún texto de error
  interno

### Requirement: El dashboard es accesible
El dashboard SHALL cumplir WCAG 2.1 AA: tablas con encabezados y título asociados, estados con texto e icono, el resalte de
espera con texto además de color, contraste suficiente, operación completa con teclado, objetivos táctiles de al menos 24 px
en la consola, y uso sin pérdida de contenido con texto ampliado al 200 % y sin desplazamiento horizontal de la página
(las tablas anchas se desplazan dentro de su contenedor). La actualización automática SHALL poder pausarse.

#### Scenario: Revisión automática
- **WHEN** se ejecuta la revisión automática de accesibilidad sobre el dashboard con datos de cada sección
- **THEN** no se reporta ninguna violación de nivel A ni AA de WCAG 2.1

#### Scenario: Pantalla de 1280 px y ampliada
- **WHEN** el dashboard se abre a 1280 px y con el texto ampliado al 200 %
- **THEN** no hay desplazamiento horizontal de la página y todas las secciones siguen legibles y operables

### Requirement: El dashboard se carga con un número acotado de consultas
El dashboard SHALL obtener sus datos en una sola transacción por carga y apoyarse en los índices existentes de las citas,
de modo que con el volumen de un día de la clínica (cientos de citas) responda dentro del objetivo de TECH-DESIGN (p95 por
debajo de 500 ms en carga de agenda).

#### Scenario: Volumen de un día cargado
- **WHEN** el día tiene 500 citas repartidas entre 20 médicos
- **THEN** la consulta de citas de hoy y de mañana usa los índices de citas y no recorre la tabla completa

#### Scenario: Una carga, una transacción
- **WHEN** el dashboard se carga
- **THEN** todas sus lecturas se hacen dentro de una única transacción de la sesión del usuario
