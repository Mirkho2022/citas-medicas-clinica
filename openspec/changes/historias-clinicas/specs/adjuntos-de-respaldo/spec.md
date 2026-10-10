# Spec Delta

## Purpose

Guardar el escaneo (PDF) del expediente en papel como respaldo de la historia clínica, accesible solo para el médico a cargo,
sin URL pública ni permanente y con la misma exigencia de control y de auditoría que el resto del contenido clínico.

## ADDED Requirements

### Requirement: El médico a cargo adjunta escaneos PDF a la historia
El sistema SHALL permitir al médico que tiene al paciente a cargo adjuntar a su historia archivos PDF de respaldo,
registrando su nombre, tamaño, tipo, autor y fecha. SHALL rechazar archivos que no sean PDF o que superen el tamaño máximo
permitido, y SHALL comprobar en el servidor el tipo, el tamaño y la cabecera real del archivo ya subido antes de
registrarlo, sin fiarse de lo que declare el navegador.

#### Scenario: Adjuntar un PDF
- **WHEN** el médico a cargo sube un PDF válido a la historia de su paciente
- **THEN** el adjunto queda registrado como vigente, a su nombre, con la hora del servidor

#### Scenario: Archivo que no es PDF (negativo)
- **WHEN** el médico sube un archivo cuyo contenido no es un PDF, aunque se declare como tal
- **THEN** no se registra el adjunto y el archivo no queda accesible

#### Scenario: Archivo demasiado grande (negativo)
- **WHEN** el archivo supera el tamaño máximo permitido
- **THEN** se rechaza con un mensaje en español antes o después de subir, y no se registra

#### Scenario: Paciente que no tiene a cargo (negativo)
- **WHEN** un médico sin asignación vigente intenta adjuntar un archivo a la historia de ese paciente
- **THEN** no se emite permiso de subida ni se registra nada

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera o un paciente intentan adjuntar o consultar adjuntos
- **THEN** no reciben permiso de subida, ninguna fila ni ningún archivo

### Requirement: La fila de metadatos es la autoridad de acceso al archivo
El acceso a un archivo adjunto SHALL decidirlo la base de datos mediante la fila de sus metadatos protegida por las mismas
reglas que las atenciones, de modo que quien no pueda leer esa fila no pueda obtener el archivo. El nombre interno del
archivo en el almacenamiento SHALL ser aleatorio y no contener nombre, documento ni dato clínico alguno.

#### Scenario: Descarga por el médico a cargo
- **WHEN** el médico a cargo pide un adjunto vigente de su paciente
- **THEN** recibe el archivo con cabeceras que impiden su almacenamiento y su interpretación como otro tipo de contenido

#### Scenario: Adjunto de un paciente ajeno (negativo)
- **WHEN** un médico sin asignación vigente pide el identificador de un adjunto de otro paciente
- **THEN** recibe una respuesta de «no encontrado» idéntica a la de un adjunto inexistente

#### Scenario: Asignación vencida (negativo)
- **WHEN** la asignación del médico venció y pide un adjunto que antes podía ver
- **THEN** recibe «no encontrado»

#### Scenario: Administrativo, paciente y enfermera (negativo)
- **WHEN** un administrativo, un paciente o una enfermera piden un adjunto o consultan sus metadatos
- **THEN** no reciben el archivo ni ninguna fila

#### Scenario: Sin enlaces públicos ni permanentes
- **WHEN** se inspeccionan las respuestas y las páginas del sistema
- **THEN** no existe ningún enlace público o permanente al almacenamiento de los adjuntos

### Requirement: Cada descarga se audita en la misma operación
Obtener un adjunto SHALL registrar el acceso (médico, paciente, adjunto y hora) en la misma transacción en la que se
comprueba el derecho a verlo; si el registro no puede escribirse, el archivo no se entrega.

#### Scenario: Descarga auditada
- **WHEN** el médico a cargo descarga un adjunto
- **THEN** queda un registro de acceso de tipo adjunto con su identificador, y el archivo se entrega

#### Scenario: Registro imposible (negativo)
- **WHEN** el registro de acceso no puede escribirse
- **THEN** el archivo no se entrega

### Requirement: Un adjunto se anula, no se borra
Un adjunto SHALL poder anularse únicamente indicando un motivo, y SHALL dejar de mostrarse entre los vigentes sin eliminarse
de la base de datos. El sistema SHALL NO eliminar físicamente archivos mientras la decisión legal sobre retención (P-1)
siga abierta. Nadie SHALL poder modificar un adjunto salvo para anularlo.

#### Scenario: Anular con motivo
- **WHEN** el médico a cargo anula un adjunto indicando el motivo
- **THEN** deja de mostrarse entre los vigentes y la fila conserva su historial y su motivo

#### Scenario: Anular sin motivo (negativo)
- **WHEN** se intenta anular un adjunto sin motivo o con un motivo vacío
- **THEN** se rechaza

#### Scenario: Modificar o eliminar (negativo)
- **WHEN** cualquier usuario intenta cambiar el nombre, el tamaño o el archivo de un adjunto, o eliminar su fila
- **THEN** la base de datos rechaza la operación

### Requirement: La auditoría de escritura de adjuntos no copia su contenido
El registro de escrituras sobre adjuntos SHALL guardar quién, cuándo, qué acción y el identificador del registro, sin copiar
el nombre original del archivo ni ningún otro dato que pueda ser clínico.

#### Scenario: Registro sin nombre de archivo
- **WHEN** el administrativo consulta la auditoría de escritura tras la subida de un adjunto
- **THEN** ve al actor, la acción y el identificador, y no el nombre del archivo
