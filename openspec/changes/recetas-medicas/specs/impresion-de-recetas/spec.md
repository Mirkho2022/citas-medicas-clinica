# Spec Delta

## Purpose

Que el profesional imprima la receta desde el sistema con una plantilla clara, numerada y con espacio para su firma y sello
manuscritos, y que cada impresión quede registrada (quién y cuándo) sin copiar el contenido de la receta en la auditoría.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional».

## ADDED Requirements

### Requirement: La hoja de impresión sigue una plantilla fija y legible
El sistema SHALL presentar la receta en una hoja de impresión con distribución fija que incluya: los datos del establecimiento; el
número de la receta, visible; el lugar y la fecha de emisión en `America/Lima` con formato `dd/MM/yyyy`; la fecha hasta la que es
válida; el nombre, el documento y la edad del paciente a la fecha de emisión; cada medicamento con su DCI, marca opcional,
concentración, forma farmacéutica, vía, dosis, frecuencia, duración e indicaciones; las indicaciones generales cuando existan; el
nombre, la profesión, la especialidad y la colegiatura del profesional; y un espacio en blanco para su **firma y sello
manuscritos**. La hoja SHALL NO imprimir el diagnóstico ni ningún dato clínico ajeno a la receta. La receta SHALL caber en una
sola hoja. <!-- REVISAR: si el diagnóstico debe imprimirse, el formato de papel (A5 o media hoja A4) y la edad en meses para menores de dos años se deciden con la clínica y el asesor; la impresora de los consultorios no está confirmada (PRD). -->

#### Scenario: Contenido de la hoja
- **WHEN** el profesional abre la hoja de impresión de una receta emitida
- **THEN** ve el establecimiento, el número, el lugar y la fecha, la validez, el paciente con su edad, los medicamentos, los datos del profesional y el recuadro vacío de firma y sello

#### Scenario: Edad a la fecha de emisión
- **WHEN** se reimprime una receta meses después de su emisión
- **THEN** la edad impresa es la que el paciente tenía el día de la emisión

#### Scenario: Sin diagnóstico
- **WHEN** la receta está vinculada a una atención con diagnósticos
- **THEN** la hoja no imprime ni el diagnóstico ni la atención

#### Scenario: Una sola hoja con el contenido máximo
- **WHEN** se imprime una receta con ocho medicamentos y los textos en su largo máximo
- **THEN** la hoja ocupa una sola página del formato elegido y no se corta contenido

#### Scenario: Legible sin color
- **WHEN** la hoja se imprime en blanco y negro
- **THEN** conserva su legibilidad: nada depende del color para entenderse

#### Scenario: Sin encabezados del navegador ni menú
- **WHEN** se imprime la hoja
- **THEN** salen solo los datos de la receta, sin el menú de la aplicación ni el título o la dirección de la página en los márgenes

#### Scenario: Título sin datos clínicos
- **WHEN** se abre la hoja de impresión
- **THEN** el título de la pestaña no contiene el nombre del paciente ni medicamentos

### Requirement: Solo el profesional emisor imprime, y solo recetas emitidas
El sistema SHALL permitir imprimir una receta únicamente al profesional que la emitió, mientras tenga al paciente a cargo y
mientras la receta esté emitida. Una receta anulada SHALL NO imprimirse. Ningún otro profesional ni rol SHALL poder imprimirla.

#### Scenario: El emisor imprime
- **WHEN** el profesional que emitió la receta la imprime
- **THEN** la hoja se genera y la impresión se registra

#### Scenario: Otro profesional a cargo (negativo)
- **WHEN** otro profesional con el paciente a cargo intenta imprimir la receta
- **THEN** se rechaza: puede ver la receta en pantalla, no imprimirla

#### Scenario: Receta anulada (negativo)
- **WHEN** el emisor intenta imprimir una receta anulada
- **THEN** se rechaza con un mensaje en español que indica que está anulada

#### Scenario: Sin tener ya al paciente a cargo (negativo)
- **WHEN** el emisor ya no tiene al paciente a cargo e intenta imprimir
- **THEN** se rechaza sin revelar información de la historia

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta imprimir o registrar la impresión de una receta
- **THEN** se rechaza y no se registra nada

### Requirement: Cada impresión queda registrada sin copiar el contenido
El sistema SHALL registrar cada solicitud de impresión con la receta, el profesional que la hizo, la hora del servidor y un
número de secuencia por receta. El registro SHALL NO copiar el contenido de la receta, ni en su propia tabla ni en la auditoría de
escritura. La primera impresión SHALL rotularse «Original» y las siguientes «Duplicado», con su número. Si el registro falla, la
hoja SHALL NO imprimirse. Abrir la vista previa SHALL NO registrar una impresión. El registro prueba que se solicitó imprimir; el
navegador no confirma que el papel haya salido.

#### Scenario: Primera impresión
- **WHEN** el emisor pulsa «Imprimir» por primera vez
- **THEN** queda registrado quién y cuándo, con secuencia 1, y la hoja sale rotulada «Original»

#### Scenario: Reimpresión
- **WHEN** el emisor imprime otra vez la misma receta
- **THEN** queda registrada la secuencia siguiente y la hoja sale rotulada «Duplicado» con su número

#### Scenario: Vista previa sin registro
- **WHEN** el profesional solo abre la vista previa o recarga la página
- **THEN** no se registra ninguna impresión y la hoja lleva la marca «Vista previa: no válida como receta» si se imprime sin pasar por «Imprimir»

#### Scenario: Falla el registro
- **WHEN** el registro de la impresión es rechazado o la conexión falla
- **THEN** no se abre el diálogo de impresión y el profesional ve un mensaje en español

#### Scenario: Impresiones simultáneas
- **WHEN** el emisor solicita dos impresiones a la vez desde dos pestañas
- **THEN** reciben secuencias distintas y consecutivas

#### Scenario: La auditoría no copia el contenido
- **WHEN** el administrativo consulta la auditoría de escritura tras emitir, anular e imprimir recetas
- **THEN** encuentra quién, cuándo, qué acción y el identificador del registro, y ningún medicamento, dosis ni dato del paciente

#### Scenario: Registros de impresión solo-agregar (negativo)
- **WHEN** cualquier usuario intenta modificar o eliminar el registro de una impresión
- **THEN** la operación se rechaza

#### Scenario: Lectura del registro (negativo)
- **WHEN** un administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`, un profesional que no emitió la receta o un profesional sin el paciente a cargo intenta leer los registros de impresión
- **THEN** no recibe ninguna fila

### Requirement: Una receta incompleta o sin establecimiento no se imprime
El sistema SHALL negarse a generar la hoja de impresión si falta cualquiera de los datos que la plantilla exige, incluidos los del
establecimiento y los del paciente, y SHALL indicar qué falta sin mostrar contenido clínico.

#### Scenario: Faltan datos del establecimiento
- **WHEN** la configuración del establecimiento está incompleta
- **THEN** la hoja no se genera y la pantalla indica que el módulo no está disponible

#### Scenario: Faltan datos del paciente
- **WHEN** el registro del paciente no tiene un dato que la plantilla exige
- **THEN** la hoja no se genera y se indica el dato faltante para que recepción lo complete

#### Scenario: Configuración inconsistente del modo de datos (negativo)
- **WHEN** el módulo opera con una configuración inconsistente de modo de datos
- **THEN** la hoja no se genera
