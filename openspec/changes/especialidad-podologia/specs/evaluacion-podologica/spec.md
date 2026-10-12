# Spec Delta

## Purpose

Permitir que un podólogo registre la evaluación de pie, uñas, piel y pisada de un paciente con una plantilla clínica propia de
Podología, validada en el servidor y en la base de datos, que solo un podólogo escribe, que lee todo profesional que tiene al
paciente a cargo y que queda inmutable al firmar la atención.

## ADDED Requirements

### Requirement: Plantilla de Podología con la evaluación de pie, uñas, piel y pisada
El sistema SHALL ofrecer una plantilla clínica vigente de la especialidad Podología con los campos de la evaluación del pie
(tipo, pulsos, sensibilidad y deformidades), de las uñas (el estado de cada uno de los diez dedos), de la piel (hallazgos por pie)
y de la pisada (tipo por pie), más las observaciones de cada grupo. El único campo de contenido obligatorio SHALL ser el momento
de la atención (evaluación inicial o control); los demás SHALL ser opcionales mientras la atención es un borrador y, si se
envían, SHALL validarse por tipo, rango, largo y opciones como el resto de las plantillas. Las claves que la plantilla no define
SHALL descartarse. Las atenciones de Podología SHALL seguir exigiendo los campos genéricos de la historia clínica, y la plantilla
SHALL NOT guardar antecedentes, receta ni signos vitales.

#### Scenario: Control con lo mínimo
- **WHEN** un podólogo registra un control con solo el momento «control» y los campos genéricos de la atención
- **THEN** la atención se guarda con sus datos de especialidad y puede firmarse

#### Scenario: Evaluación inicial completa
- **WHEN** un podólogo registra una evaluación inicial con todos los campos de pie, uñas, piel y pisada
- **THEN** la atención se guarda y los datos de cada pie y de cada dedo quedan identificados por su lado

#### Scenario: Opción que no existe
- **WHEN** se envía un estado de uña o un tipo de pisada que no está entre las opciones de la plantilla
- **THEN** se rechaza indicando el campo y no se guarda nada

#### Scenario: Valor de otro tipo
- **WHEN** un campo de sí o no llega como texto, o el momento llega vacío
- **THEN** se rechaza sin convertir el valor y la respuesta indica ese campo

#### Scenario: Clave ajena
- **WHEN** los datos incluyen una clave que la plantilla no define
- **THEN** la clave se descarta y no se guarda

#### Scenario: Sin signos vitales ni receta
- **WHEN** se revisan los campos de la plantilla de Podología
- **THEN** ninguno corresponde a signos vitales, antecedentes ni a indicaciones de receta

#### Scenario: Plantilla de otra especialidad (negativo)
- **WHEN** un podólogo intenta usar la plantilla de otra especialidad
- **THEN** se rechaza y no se guarda la atención

### Requirement: La evaluación inicial se firma completa
Cuando el momento de la atención es «evaluación inicial», el sistema SHALL exigir al firmar que estén presentes todos los campos
de la plantilla salvo el momento, el recuento de fotos y las observaciones. La regla SHALL imponerla la base de datos al firmar
y SHALL anticiparla el servidor con un mensaje por campo. Un borrador incompleto SHALL poder guardarse. Un control SHALL poder
firmarse sin esos campos.

#### Scenario: Evaluación inicial incompleta no se firma
- **WHEN** un podólogo intenta firmar una evaluación inicial a la que le falta el estado de una uña
- **THEN** la firma se rechaza indicando que debe completarse la evaluación inicial y la atención sigue siendo un borrador

#### Scenario: Borrador incompleto
- **WHEN** un podólogo guarda como borrador una evaluación inicial a medias
- **THEN** el borrador se guarda y puede completarse después

#### Scenario: Observaciones opcionales
- **WHEN** un podólogo firma una evaluación inicial con todos los campos y sin ninguna observación
- **THEN** la atención se firma

#### Scenario: Control sin evaluación completa
- **WHEN** un podólogo firma un control sin los campos de pie, uñas, piel y pisada
- **THEN** la atención se firma

#### Scenario: Servidor omitido (negativo)
- **WHEN** una solicitud que se salta la validación del servidor intenta firmar una evaluación inicial vacía
- **THEN** la base de datos rechaza la firma

### Requirement: Solo un podólogo escribe la evaluación podológica
Registrar o modificar una atención con la plantilla de Podología SHALL estar permitido únicamente a un profesional cuya
profesión, leída de la base de datos, sea podólogo. Un médico, un odontólogo, un fisioterapeuta o un psicólogo, aunque tenga al
paciente a cargo, SHALL NOT poder usar la plantilla, y la profesión SHALL NOT depender de ningún dato que envíe el cliente. Un
podólogo SHALL poder registrar una atención genérica sin plantilla. Ni el administrativo, ni la enfermera, ni el paciente, ni una
sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización SHALL poder registrar atenciones.

#### Scenario: Podólogo a cargo registra la evaluación
- **WHEN** un podólogo que tiene al paciente a cargo registra una atención con la plantilla de Podología
- **THEN** la atención se guarda a su nombre

#### Scenario: Otra profesión con la plantilla (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un psicólogo que tiene al paciente a cargo intenta guardar una atención con la plantilla de Podología
- **THEN** se rechaza con el mensaje de que solo un podólogo puede registrarla y no se guarda nada

#### Scenario: Profesional de otra profesión registrado en Podología (negativo)
- **WHEN** un profesional que no es podólogo, pero cuya especialidad registrada es Podología, intenta usar la plantilla
- **THEN** se rechaza porque la profesión del autor no es podólogo

#### Scenario: Podólogo sin plantilla
- **WHEN** un podólogo registra una atención genérica sin plantilla
- **THEN** la atención se guarda con datos de especialidad vacíos

#### Scenario: Administrativo, enfermera y paciente (negativo)
- **WHEN** el administrativo, una enfermera o un paciente intentan registrar una atención con la plantilla de Podología
- **THEN** se rechaza por falta de permiso y no se guarda nada

#### Scenario: Sesión sin rol y roles de servicio (negativo)
- **WHEN** una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intentan escribir una atención
- **THEN** se rechaza por falta de privilegios

### Requirement: Todo profesional a cargo lee la evaluación y nadie más
La evaluación podológica SHALL poder leerla todo profesional que tiene al paciente a cargo con una asignación vigente (médico,
odontólogo, fisioterapeuta, psicólogo y podólogo), porque la historia es compartida entre especialidades, y SHALL NOT poder
leerla ningún otro rol. La restricción SHALL imponerla la base de datos. Cada lectura SHALL quedar registrada en el registro de
accesos en la misma transacción que la lectura.

#### Scenario: Profesional de otra profesión a cargo
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un psicólogo con el paciente a cargo abre una atención firmada de Podología
- **THEN** ve la evaluación y su lectura queda registrada

#### Scenario: Profesional sin el paciente a cargo (negativo)
- **WHEN** un profesional sin asignación vigente sobre el paciente, o con la asignación vencida, o con el perfil desactivado, consulta sus atenciones
- **THEN** no obtiene ninguna fila

#### Scenario: Administrativo, enfermera y paciente (negativo)
- **WHEN** el administrativo, una enfermera o el paciente titular intentan leer una atención de Podología, directamente o por la dirección de su pantalla
- **THEN** no obtienen ningún dato y la dirección responde como inexistente

#### Scenario: Roles de servicio y sin rol (negativo)
- **WHEN** una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intentan leer una atención de Podología
- **THEN** no obtienen ninguna fila o se rechazan por falta de privilegios

#### Scenario: Registro de acceso que falla
- **WHEN** el registro de la lectura falla
- **THEN** no se entrega ningún dato de la evaluación

### Requirement: Lo firmado es inmutable y entra en la huella de la atención
Los datos de especialidad de una atención de Podología SHALL quedar inmutables al firmarla y SHALL estar cubiertos por la huella
de la firma, igual que el resto de la atención. Una corrección SHALL hacerse con una addenda y, si procede, con una atención
nueva; nunca editando lo firmado.

#### Scenario: Modificar tras la firma (negativo)
- **WHEN** alguien, incluido el autor, intenta cambiar los datos de especialidad de una atención de Podología firmada
- **THEN** se rechaza y la corrección se hace con una addenda

#### Scenario: Huella que cubre la evaluación
- **WHEN** se altera un dato de la evaluación de una atención firmada (con la protección desactivada solo dentro de una prueba) y se recalcula la huella
- **THEN** ya no coincide con la guardada al firmar

### Requirement: Las claves de la plantilla no cambian de significado entre versiones
Cada versión nueva de la plantilla de Podología SHALL conservar el significado y el tipo de toda clave que ya existía; un cambio
de significado SHALL ser una clave nueva. Las atenciones ya firmadas SHALL conservar la versión de plantilla con la que se
registraron.

#### Scenario: Versión nueva que conserva las claves
- **WHEN** una migración publica la versión siguiente de la plantilla y marca la anterior como no vigente
- **THEN** las atenciones nuevas usan la versión vigente, las existentes conservan la suya y toda clave común tiene el mismo tipo

#### Scenario: Clave que cambia de tipo (negativo)
- **WHEN** una versión nueva redefine una clave existente con otro tipo
- **THEN** la prueba de estabilidad falla y la migración no puede darse por buena

### Requirement: La copia de la historia incluye la evaluación podológica
La copia de la historia clínica SHALL incluir la evaluación podológica de las atenciones firmadas con las etiquetas de su
plantilla, y SHALL NOT incluir la de los borradores.

#### Scenario: Atención firmada
- **WHEN** se compila la copia de un paciente con una atención firmada de Podología
- **THEN** la sección de atenciones incluye sus datos de especialidad con las etiquetas de la plantilla

#### Scenario: Borrador (negativo)
- **WHEN** se compila la copia de un paciente con un borrador de Podología
- **THEN** el borrador no se incluye y la copia declara solo el número de borradores no incluidos
