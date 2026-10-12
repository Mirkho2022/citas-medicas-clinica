# Spec Delta

## Purpose

Permitir que cualquier profesional que tiene al paciente a cargo compare cómo evoluciona el pie entre controles, campo a campo y
foto a foto, mostrando las diferencias sin interpretarlas, y dejando registrada cada lectura de contenido clínico.

## ADDED Requirements

### Requirement: Matriz de evaluaciones firmadas, campo a campo
El sistema SHALL mostrar al profesional que tiene al paciente a cargo una matriz con las últimas cinco atenciones firmadas con la
plantilla de Podología, ordenadas por la fecha de firma, una columna por atención con su fecha y hora de Lima y su autor, y una
fila por clave de la plantilla, agrupadas en pie, uñas, piel y pisada. Una celda que difiere de la de la columna anterior SHALL
marcarse con texto e icono, no solo con color. Un campo sin valor en una atención SHALL mostrarse como «No registrado», sin
convertirlo ni suponerlo. Las atenciones con versiones distintas de la plantilla SHALL compararse por la clave de cada campo.

#### Scenario: Tres controles seguidos
- **WHEN** el paciente tiene una evaluación inicial y dos controles firmados y un profesional a cargo abre la comparación
- **THEN** ve tres columnas por fecha y las celdas que cambiaron entre columnas consecutivas marcadas como «Cambió»

#### Scenario: Campo sin valor
- **WHEN** un control no registró el estado de las uñas que la evaluación inicial sí registró
- **THEN** la celda del control muestra «No registrado» y se marca la diferencia

#### Scenario: Versiones distintas de la plantilla
- **WHEN** las atenciones comparadas usan dos versiones de la plantilla y una clave existe solo en la más reciente
- **THEN** la fila de esa clave muestra «No registrado» en las atenciones de la versión anterior y usa la etiqueta de la versión más reciente

#### Scenario: Más de cinco atenciones
- **WHEN** el paciente tiene siete atenciones firmadas de Podología
- **THEN** la matriz muestra solo las cinco más recientes

#### Scenario: Estado que no se comunica solo con color
- **WHEN** se revisa la marca de una celda que cambió
- **THEN** incluye un texto y un icono además de cualquier color

### Requirement: Solo se comparan atenciones firmadas
El sistema SHALL incluir en la comparación únicamente atenciones firmadas, y SHALL NOT incluir los borradores, ni siquiera los del
propio autor. La comparación SHALL declarar el número de borradores no incluidos.

#### Scenario: Borrador de Podología
- **WHEN** el paciente tiene dos atenciones firmadas y un borrador de Podología
- **THEN** la matriz muestra las dos firmadas y declara un borrador no incluido

### Requirement: La comparación muestra y no interpreta
El sistema SHALL NOT calcular puntajes, clasificar una diferencia como mejoría o empeoramiento, resaltar valores críticos, avisar
ni generar gráficos de tendencia. El profesional SHALL decidir qué significa cada diferencia.

#### Scenario: Una uña empeora en el registro
- **WHEN** el estado de una uña pasa de «sana» a «micótica» entre dos controles
- **THEN** la matriz marca «Cambió» y muestra los dos valores, sin etiqueta de empeoramiento ni alerta

#### Scenario: Sin puntajes
- **WHEN** se revisa la pantalla de comparación
- **THEN** no muestra ningún puntaje, porcentaje ni gráfico

### Requirement: Series de fotos por lado, zona y dedo
El sistema SHALL agrupar las fotos de las atenciones firmadas en series por lado, zona y dedo, ordenadas por la hora de toma,
y SHALL mostrar de cada serie el par formado por la primera y la más reciente y la línea de tiempo completa. Cuando los adjuntos
admitan imágenes, el par SHALL mostrarse lado a lado; mientras solo admitan PDF, SHALL mostrarse el registro con el enlace al
archivo. Una foto cuyo archivo fue anulado SHALL listarse como «archivo anulado».

#### Scenario: Serie con tres fotos
- **WHEN** hay tres fotos del dedo 1 del pie derecho en tres atenciones firmadas
- **THEN** la serie muestra la primera y la más reciente como par y las tres en la línea de tiempo por fecha

#### Scenario: Series distintas
- **WHEN** hay fotos del dedo 1 derecho y del talón izquierdo
- **THEN** forman dos series separadas

#### Scenario: Foto de una atención en borrador
- **WHEN** hay una foto en una atención sin firmar
- **THEN** no forma parte de ninguna serie

#### Scenario: Archivo anulado
- **WHEN** el adjunto de una foto de la serie fue anulado
- **THEN** la foto aparece como «archivo anulado» y conserva su fecha y su metadato

### Requirement: La comparación la leen los profesionales a cargo y cada lectura queda registrada
La comparación SHALL estar disponible únicamente para profesionales que tienen al paciente a cargo con una asignación vigente,
de cualquier profesión. La lectura SHALL ocurrir en una sola transacción que comprueba el modo de datos, registra un acceso por
cada atención incluida y después lee; si el registro falla, SHALL NOT entregar contenido. El administrativo, la enfermera, el
paciente, una sesión sin rol, `anonymous`, el rol del cron y el rol de sincronización SHALL NOT obtener ningún dato de la
comparación.

#### Scenario: Profesional de otra profesión a cargo
- **WHEN** un médico con el paciente a cargo abre la comparación
- **THEN** ve la matriz y las series, sin controles de edición, y quedan registrados los accesos a cada atención leída

#### Scenario: Sin el paciente a cargo (negativo)
- **WHEN** un profesional sin asignación vigente, con la asignación vencida o con el perfil desactivado abre la comparación
- **THEN** la pantalla responde como inexistente y no se entrega ningún dato

#### Scenario: Administrativo, enfermera y paciente (negativo)
- **WHEN** el administrativo, una enfermera o el paciente titular intentan abrir la comparación por su dirección
- **THEN** no obtienen ningún dato

#### Scenario: Registro de acceso que falla
- **WHEN** el registro de uno de los accesos falla
- **THEN** la transacción se revierte y no se devuelve ninguna evaluación ni foto

#### Scenario: Modo de datos inconsistente
- **WHEN** el modo de datos de la aplicación no coincide con el de la base
- **THEN** la comparación no está disponible y no se entrega contenido
