# Spec Delta

## Purpose

Que el odontólogo vincule a su atención las radiografías del paciente como adjuntos, con su tipo, las piezas involucradas y la
fecha de toma, sin diseñar el almacenamiento de imágenes, que depende de una decisión abierta del usuario.

## ADDED Requirements

### Requirement: Una radiografía es un adjunto vinculado a la atención odontológica
El sistema SHALL permitir al odontólogo autor de una atención sin firmar vincular a su sección odontológica un adjunto ya cargado
en la historia del paciente como radiografía, registrando su tipo (periapical, aleta de mordida, panorámica, oclusal u otra), las
piezas involucradas (ninguna si abarca toda la boca), la fecha de toma y una nota opcional. El sistema SHALL NOT guardar el
archivo en el registro de la radiografía ni definir su formato, tamaño o almacenamiento.

#### Scenario: Vincular una radiografía
- **WHEN** el odontólogo vincula un adjunto vigente que él subió, e indica tipo, piezas y fecha de toma
- **THEN** la radiografía queda registrada en su atención con esos datos

#### Scenario: Radiografía panorámica sin piezas
- **WHEN** el odontólogo vincula una radiografía panorámica sin indicar piezas
- **THEN** se guarda como una radiografía de toda la boca

#### Scenario: Pieza inválida o de otra dentición (negativo)
- **WHEN** la lista de piezas incluye un número que no es FDI, o una pieza que no corresponde a la dentición declarada
- **THEN** se rechaza y no se guarda nada

#### Scenario: Fecha de toma futura (negativo)
- **WHEN** la fecha de toma es posterior a hoy en hora de Lima
- **THEN** se rechaza

### Requirement: El adjunto debe ser válido para esa radiografía
El sistema SHALL exigir que el adjunto vinculado sea del mismo paciente, esté vigente, lo haya subido el odontólogo que lo vincula y
no esté ya vinculado a otra radiografía. Un adjunto de otro paciente, anulado, subido por otro profesional o ya vinculado SHALL
rechazarse.

#### Scenario: Adjunto de otro paciente (negativo)
- **WHEN** el odontólogo intenta vincular un adjunto que pertenece a otro paciente
- **THEN** se rechaza indicando que la radiografía debe vincularse a un archivo vigente de este paciente que él haya adjuntado

#### Scenario: Adjunto anulado (negativo)
- **WHEN** intenta vincular un adjunto anulado
- **THEN** se rechaza

#### Scenario: Adjunto subido por otro profesional (negativo)
- **WHEN** intenta vincular un adjunto que subió otro profesional
- **THEN** se rechaza

#### Scenario: Adjunto ya vinculado (negativo)
- **WHEN** intenta vincular un adjunto que ya es una radiografía
- **THEN** se rechaza

### Requirement: La admisión de imágenes es una decisión abierta
El sistema SHALL tratar como dependencia externa la decisión del usuario sobre si se admiten imágenes como adjuntos (P-15). Mientras
no se decida, la radiografía SHALL vincularse únicamente a lo que el almacén de adjuntos de la historia admita, que hoy es PDF. Si se
admiten imágenes ampliando ese almacén, el mismo modelo de radiografía SHALL seguir valiendo sin cambios de esquema; si se crea un
almacén aparte, una migración nueva repuntará el vínculo.

#### Scenario: Radiografía como PDF
- **WHEN** el odontólogo adjunta una radiografía exportada a PDF y la vincula
- **THEN** funciona con el almacén de adjuntos vigente

#### Scenario: Imagen no admitida todavía
- **WHEN** se intenta adjuntar un archivo de imagen mientras el almacén de adjuntos solo admite PDF
- **THEN** el adjunto se rechaza en el almacén de adjuntos y no existe nada que vincular; este change no lo acepta por su cuenta

#### Scenario: Pruebas sin imágenes
- **WHEN** se ejecutan las pruebas de este change
- **THEN** usan adjuntos PDF y no dependen de la decisión sobre imágenes

### Requirement: El acceso a la radiografía sigue las reglas del adjunto
El sistema SHALL permitir ver los metadatos de una radiografía a todo profesional que tenga al paciente a cargo y a nadie más, SHALL
entregar el archivo solo mediante el acceso auditado de los adjuntos de la historia, y SHALL permitir vincular, modificar o quitar una
radiografía únicamente a un odontólogo y solo mientras la atención no esté firmada.

#### Scenario: Otro profesional a cargo
- **WHEN** un médico a cargo del paciente consulta sus radiografías
- **THEN** ve el metadato de cada una y puede abrir el archivo por el acceso auditado de adjuntos, pero no puede vincular ni modificar radiografías

#### Scenario: Roles sin acceso (negativo)
- **WHEN** un administrativo, una enfermera, un paciente, una sesión sin rol o `anonymous` consultan radiografías
- **THEN** no reciben ninguna fila

#### Scenario: Profesional sin el paciente a cargo (negativo)
- **WHEN** un profesional sin asignación vigente, con la asignación vencida o con el perfil desactivado consulta las radiografías
- **THEN** no recibe ninguna fila

#### Scenario: Profesional que no es odontólogo escribe (negativo)
- **WHEN** un médico, fisioterapeuta, psicólogo o podólogo intenta vincular una radiografía
- **THEN** se rechaza indicando que solo un odontólogo puede registrarla

### Requirement: La radiografía firmada no cambia y la anulación del archivo no la borra
Firmada la atención, las radiografías vinculadas SHALL NOT poder modificarse ni eliminarse. Anular después el adjunto SHALL NOT
borrar el registro clínico de la radiografía: este conservará su metadato y la pantalla SHALL indicar que el archivo está anulado.

#### Scenario: Modificar tras la firma (negativo)
- **WHEN** cualquier rol intenta cambiar o quitar una radiografía de una atención firmada
- **THEN** se rechaza

#### Scenario: Adjunto anulado después
- **WHEN** el adjunto de una radiografía firmada se anula con su motivo
- **THEN** el registro de la radiografía sigue en la historia, con su metadato y la leyenda «archivo anulado»
