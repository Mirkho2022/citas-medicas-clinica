# Spec Delta

## Purpose

Que firmar una atención la vuelva un registro inalterable con fecha y huella fijadas por el servidor, que la corrección
posterior sea siempre una addenda con su propia autoría, y que el mecanismo de firma pueda reemplazarse sin rediseñar el
flujo si la decisión legal P-1 exige una firma certificada.

## ADDED Requirements

### Requirement: Firmar una atención la vuelve inmutable con sello del servidor
El sistema SHALL permitir al médico autor firmar su atención no firmada y completa. Al firmar, la fecha y hora de la firma
SHALL fijarlas el servidor con su propio reloj, ignorando cualquier valor enviado por el cliente, y la atención SHALL
guardar el método de firma empleado y una huella del contenido firmado. Desde ese momento ninguna operación de usuario
SHALL poder modificarla ni eliminarla.

#### Scenario: Firma por el autor
- **WHEN** el médico autor firma su borrador completo y confirma
- **THEN** la atención queda firmada con la hora del servidor, su método de firma y su huella, y deja de ser editable

#### Scenario: Hora de firma manipulada
- **WHEN** una solicitud intenta firmar con una hora de firma del pasado o del futuro
- **THEN** la atención queda firmada con la hora del servidor

#### Scenario: Huella verificable
- **WHEN** se recalcula la huella a partir del contenido guardado de una atención firmada
- **THEN** coincide con la huella guardada al firmar

#### Scenario: Confirmación explícita
- **WHEN** el médico pulsa «Firmar atención»
- **THEN** el sistema pide una confirmación que advierte que la atención ya no podrá editarse y que las correcciones se hacen con una addenda

#### Scenario: Modificar una atención firmada (negativo)
- **WHEN** cualquier usuario, por la pantalla o directamente, intenta modificar el contenido o la firma de una atención firmada
- **THEN** la operación se rechaza con el mensaje «Atención firmada: use una addenda para corregir»

#### Scenario: Eliminar una atención (negativo)
- **WHEN** cualquier usuario intenta eliminar una atención, firmada o no
- **THEN** la operación se rechaza

#### Scenario: Firmar la atención de otro médico (negativo)
- **WHEN** un médico que no es el autor, aunque tenga al paciente a cargo, intenta firmar la atención
- **THEN** la firma no se aplica

#### Scenario: Firmar sin tener ya al paciente a cargo (negativo)
- **WHEN** la asignación del autor venció antes de firmar su borrador
- **THEN** la firma no se aplica y el sistema indica que ya no tiene acceso a esa historia

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera o un paciente intentan firmar una atención
- **THEN** la firma no se aplica

#### Scenario: Firma y edición simultáneas
- **WHEN** el autor firma desde una pestaña mientras guarda un cambio desde otra
- **THEN** el cambio posterior a la firma se rechaza y el contenido firmado no varía

### Requirement: La firma está detrás de un proveedor reemplazable
El sistema SHALL aislar el acto de firmar detrás de una interfaz de proveedor de firma, de modo que sustituir la firma lógica
por una firma certificada no cambie el flujo de atención ni sus datos. El sistema SHALL NO afirmar, en pantalla ni en
documentos, que la firma lógica satisface la normativa peruana mientras la decisión legal P-1 siga abierta.

#### Scenario: Firma lógica por defecto
- **WHEN** se firma una atención en la versión actual
- **THEN** el método de firma guardado es «lógica» y no interviene ningún servicio externo

#### Scenario: Cambio de proveedor
- **WHEN** se sustituye el proveedor de firma por otro que cumpla la misma interfaz
- **THEN** el formulario, las pantallas y el modelo de la atención no requieren rediseño

#### Scenario: Sin afirmaciones legales
- **WHEN** se muestra una atención firmada
- **THEN** la pantalla indica «Firmada», fecha, hora de Lima y autor, sin declarar validez legal

### Requirement: La corrección posterior a la firma es una addenda
El sistema SHALL permitir a un médico que tenga al paciente a cargo agregar una addenda a una atención firmada, con texto
con contenido real, su autor y la hora fijada por el servidor, sin alterar la atención original. Una addenda SHALL NO poder
editarse ni eliminarse; una corrección de la addenda es otra addenda.

#### Scenario: Addenda sobre una atención firmada
- **WHEN** un médico a cargo agrega una addenda a una atención firmada
- **THEN** la addenda se guarda con su autor y su hora, y el texto original de la atención no cambia

#### Scenario: Addenda vacía (negativo)
- **WHEN** el texto de la addenda está vacío, es solo espacios o solo caracteres invisibles
- **THEN** se rechaza

#### Scenario: Addenda sobre una atención sin firmar (negativo)
- **WHEN** se intenta agregar una addenda a un borrador
- **THEN** se rechaza indicando que el borrador se edita directamente

#### Scenario: Addenda a nombre de otro médico (negativo)
- **WHEN** una solicitud intenta registrar la addenda con el identificador de otro médico
- **THEN** se rechaza

#### Scenario: Addenda sobre un paciente ajeno (negativo)
- **WHEN** un médico sin asignación vigente al paciente intenta agregar una addenda
- **THEN** se rechaza sin revelar que la atención existe

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera o un paciente intentan agregar o leer addendas
- **THEN** no se guarda nada y no reciben ninguna fila

#### Scenario: Editar o eliminar una addenda (negativo)
- **WHEN** cualquier usuario intenta modificar o eliminar una addenda existente
- **THEN** la operación se rechaza con el mensaje «Las addendas no se modifican ni se eliminan: registre una nueva»

### Requirement: Firmar no cambia el estado de la cita
Firmar una atención SHALL NO modificar el estado de la cita vinculada, y un fallo al marcar la cita como atendida SHALL NO
afectar a una atención ya firmada. Marcar la cita como atendida SHALL ser una acción separada, de la agenda, que el médico
dueño de la cita puede invocar desde la pantalla de la atención.

#### Scenario: Firma sin cambio de estado
- **WHEN** el médico firma una atención vinculada a una cita confirmada
- **THEN** la atención queda firmada y la cita sigue confirmada

#### Scenario: Marcar atendida es aparte
- **WHEN** el médico pulsa «Marcar cita como atendida» en la pantalla de una atención vinculada a una cita confirmada
- **THEN** se ejecuta la acción de la agenda y su resultado se muestra por separado, sin alterar la atención

#### Scenario: Falla el cambio de estado
- **WHEN** la acción de marcar la cita como atendida falla (por ejemplo, la cita ya no está confirmada)
- **THEN** se muestra el mensaje de esa acción y la atención firmada permanece sin cambios

#### Scenario: Atención sin cita
- **WHEN** la atención no está vinculada a ninguna cita
- **THEN** la pantalla no ofrece «Marcar cita como atendida»

### Requirement: Presentación de la atención firmada
La atención firmada SHALL mostrarse con la etiqueta «Firmada» y un candado, la fecha y hora en `America/Lima` con formato
`dd/MM/yyyy HH:mm`, el nombre del autor, sus addendas en orden cronológico con su propio autor y fecha, y SHALL NO ofrecer
ningún botón de editar; la única acción de corrección es «Agregar addenda». Un borrador SHALL mostrarse claramente como
«Borrador sin firmar».

#### Scenario: Atención firmada en pantalla
- **WHEN** el médico abre una atención firmada
- **THEN** ve la etiqueta «Firmada», la fecha y hora de Lima, el autor, sus addendas y el botón «Agregar addenda», y ningún control de edición

#### Scenario: Borrador de otro médico
- **WHEN** un médico a cargo ve el borrador de un colega
- **THEN** aparece como «Borrador sin firmar» con el nombre de su autor y sin controles de edición
