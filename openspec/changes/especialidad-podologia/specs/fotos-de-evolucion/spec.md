# Spec Delta

## Purpose

Registrar las fotos de evolución de un paciente como parte de la atención de Podología que las toma, con su lado, zona, etapa y
consentimiento, vinculadas a un adjunto sin diseñar su almacenamiento, de modo que las lea todo profesional a cargo, las escriba
solo un podólogo y queden selladas al firmar.

## ADDED Requirements

### Requirement: Una foto de evolución es un registro de la atención con su metadato clínico
El sistema SHALL registrar cada foto de evolución como una fila de la atención de Podología que la toma, con el adjunto que
contiene el archivo, el lado (derecho o izquierdo), la zona, el dedo cuando la zona es uñas o dedos, la etapa (inicial, control
o final), una nota opcional, la confirmación de que el paciente fue informado y aceptó la foto, y la hora de toma sellada por el
servidor. El sistema SHALL NOT diseñar ni modificar el almacenamiento del archivo: la foto SHALL apuntar a un adjunto existente.
Una zona «otra» SHALL exigir la nota. El dedo SHALL ser obligatorio solo para uñas y dedos y estar entre 1 y 5.

#### Scenario: Foto de una uña
- **WHEN** un podólogo registra una foto del dedo 1 del pie derecho, zona uñas, etapa inicial, con el consentimiento confirmado
- **THEN** la foto queda registrada en su atención con la hora del servidor

#### Scenario: Dedo en una zona que no lo admite
- **WHEN** se registra una foto de la zona talón con un número de dedo
- **THEN** se rechaza indicando que el dedo no corresponde a la zona

#### Scenario: Uña sin dedo
- **WHEN** se registra una foto de la zona uñas sin indicar el dedo
- **THEN** se rechaza indicando el dedo

#### Scenario: Zona otra sin nota
- **WHEN** se registra una foto de zona «otra» sin nota
- **THEN** se rechaza indicando la nota

#### Scenario: Hora enviada por el cliente
- **WHEN** el cliente envía su propia hora de toma o el paciente de la foto
- **THEN** la base ignora o rechaza esos datos y usa la hora del servidor y el paciente de la atención

### Requirement: El consentimiento se confirma antes de registrar la foto
El sistema SHALL exigir que el podólogo confirme que el paciente fue informado y aceptó la foto, y SHALL NOT registrarla sin esa
confirmación. El sistema SHALL NOT guardar ningún documento ni imagen del consentimiento, y SHALL NOT afirmar que la confirmación
cumple una norma.

#### Scenario: Sin confirmación (negativo)
- **WHEN** un podólogo intenta registrar una foto sin confirmar el consentimiento
- **THEN** se rechaza con el mensaje de que debe confirmar que el paciente fue informado y aceptó, y no se guarda nada

#### Scenario: Sin documento de consentimiento
- **WHEN** se revisan los datos que guarda la foto
- **THEN** ninguno es un documento ni una imagen de consentimiento

### Requirement: Solo un podólogo registra y quita fotos, sobre una atención propia sin firmar
Registrar, modificar o quitar una foto SHALL estar permitido únicamente a un podólogo con el paciente a cargo, sobre una atención
suya, con la plantilla de Podología y todavía sin firmar. La profesión SHALL leerse de la base de datos. Ningún otro profesional,
ni el administrativo, la enfermera o el paciente, SHALL poder escribir fotos, y la restricción SHALL imponerla la base de datos
con dos barreras independientes.

#### Scenario: Podólogo autor registra y quita en el borrador
- **WHEN** el podólogo autor de una atención sin firmar registra una foto y después la quita
- **THEN** ambas operaciones se aceptan y quedan auditadas sin copiar la nota

#### Scenario: Otra profesión a cargo (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un psicólogo con el paciente a cargo intenta registrar una foto
- **THEN** se rechaza con el mensaje de que solo un podólogo puede registrarla

#### Scenario: Podólogo sin el paciente a cargo (negativo)
- **WHEN** un podólogo sin asignación vigente sobre el paciente, con la asignación vencida o con el perfil desactivado intenta registrar una foto
- **THEN** se rechaza y no se guarda nada

#### Scenario: Atención de otro autor (negativo)
- **WHEN** un podólogo intenta agregar una foto a una atención de otro podólogo
- **THEN** se rechaza indicando que la atención no admite cambios

#### Scenario: Atención ya firmada (negativo)
- **WHEN** cualquier rol, incluido el autor y el dueño de la base, intenta agregar, modificar o quitar una foto de una atención firmada
- **THEN** se rechaza y la corrección se hace con una addenda y una atención nueva

#### Scenario: Atención sin la plantilla de Podología (negativo)
- **WHEN** un podólogo intenta agregar una foto a una atención sin la plantilla de Podología
- **THEN** se rechaza

#### Scenario: Roles sin permiso (negativo)
- **WHEN** el administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intentan insertar, modificar o borrar una foto
- **THEN** se rechaza por falta de permiso o de privilegios

### Requirement: El adjunto de la foto debe ser válido
El sistema SHALL aceptar como adjunto de una foto solo un archivo vigente del mismo paciente que subió el mismo podólogo que lo
vincula y que no esté vinculado a otra foto. Anular después el adjunto SHALL NOT borrar la foto: el registro conserva su metadato
y la interfaz indica que el archivo está anulado.

#### Scenario: Adjunto de otro paciente (negativo)
- **WHEN** un podólogo vincula un adjunto que pertenece a otro paciente
- **THEN** se rechaza indicando que el archivo no es válido para este paciente

#### Scenario: Adjunto subido por otro profesional (negativo)
- **WHEN** un podólogo vincula un adjunto que subió otro profesional
- **THEN** se rechaza

#### Scenario: Adjunto anulado o ya usado (negativo)
- **WHEN** un podólogo vincula un adjunto anulado, o uno ya vinculado a otra foto
- **THEN** se rechaza

#### Scenario: Adjunto anulado después
- **WHEN** se anula el adjunto de una foto ya firmada
- **THEN** la foto conserva su metadato y se muestra como «archivo anulado»

### Requirement: El formato de las fotos depende de la decisión sobre imágenes
Mientras el sistema admita solo PDF como adjunto, la foto SHALL vincularse a un PDF; cuando se decida admitir imágenes, el mismo
modelo SHALL valer sin cambiar el registro de la foto. El sistema SHALL NOT mostrar una comparación visual de imágenes hasta que
los adjuntos admitan imágenes.

#### Scenario: Solo PDF
- **WHEN** un podólogo registra una foto y el sistema solo admite PDF como adjunto
- **THEN** la foto se vincula a un PDF y la comparación muestra el registro y el enlace al archivo, sin vista de imagen

#### Scenario: Imágenes admitidas
- **WHEN** se amplían los adjuntos para admitir imágenes
- **THEN** las fotos nuevas se vinculan a imágenes sin cambiar el registro de la foto

### Requirement: Todo profesional a cargo lee las fotos y nadie más
Las fotos de evolución SHALL poder leerlas todo profesional que tiene al paciente a cargo con una asignación vigente, y SHALL NOT
poder leerlas ningún otro rol. Obtener el archivo SHALL exigir leer antes la fila de la foto bajo estas reglas. Cada lectura
SHALL registrarse en la misma transacción que la lectura.

#### Scenario: Profesional a cargo
- **WHEN** un profesional de cualquier profesión con el paciente a cargo consulta las fotos de una atención firmada
- **THEN** ve su metadato y puede obtener el archivo vigente, y cada acceso queda registrado

#### Scenario: Sin el paciente a cargo (negativo)
- **WHEN** un profesional sin asignación vigente, con la asignación vencida o con el perfil desactivado consulta las fotos
- **THEN** no obtiene ninguna fila ni el archivo

#### Scenario: Administrativo, enfermera y paciente (negativo)
- **WHEN** el administrativo, una enfermera o el paciente titular intentan leer una foto o su archivo
- **THEN** no obtienen ningún dato

#### Scenario: Roles de servicio y sin rol (negativo)
- **WHEN** una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intentan leer fotos
- **THEN** no obtienen ninguna fila o se rechazan por falta de privilegios

### Requirement: Las fotos se sellan al firmar y su recuento forma parte de la firma
Al firmar la atención, el sistema SHALL comprobar que el recuento de fotos declarado en los datos de especialidad, que calcula el
servidor y que entra en la huella de la atención, coincide con las fotos de la atención, y SHALL rechazar la firma si no
coincide. Cada foto SHALL llevar una huella de su contenido, y una alteración posterior de una foto, o una foto agregada o
quitada, SHALL ser detectable.

#### Scenario: Recuento coincide
- **WHEN** un podólogo firma una atención con tres fotos registradas y recuento declarado de tres
- **THEN** la atención se firma

#### Scenario: Recuento desfasado (negativo)
- **WHEN** se intenta firmar una atención cuyo recuento declarado no coincide con sus fotos
- **THEN** la firma se rechaza indicando que el número de fotos no coincide

#### Scenario: Foto quitada después de firmar
- **WHEN** se borra una foto de una atención firmada con la protección desactivada solo dentro de una prueba
- **THEN** la verificación detecta que el recuento declarado y las fotos no coinciden

#### Scenario: Foto alterada después de firmar
- **WHEN** se altera el contenido de una foto firmada con la protección desactivada solo dentro de una prueba y se recalcula su huella
- **THEN** ya no coincide con la guardada

#### Scenario: Cambio de fotos contra la firma
- **WHEN** un podólogo agrega o quita una foto en el mismo instante en que la atención se firma
- **THEN** el cambio se rechaza por la atención firmada, o la huella ya lo incluye, nunca queda un sello desfasado

### Requirement: Auditoría de las fotos y guarda de datos reales
La escritura de fotos SHALL quedar en la auditoría con quién, cuándo y qué acción, sin copiar la nota ni ningún dato clínico, de
modo que el administrativo, que lee la auditoría, no obtenga contenido clínico por ella. El sistema SHALL aplicar la guarda de
datos reales: en modo de demostración solo se registran fotos de pacientes de demostración.

#### Scenario: Auditoría sin contenido
- **WHEN** un podólogo registra una foto con una nota que contiene un texto centinela
- **THEN** la auditoría registra la acción sin que aparezca el texto de la nota

#### Scenario: Paciente real en modo de demostración (negativo)
- **WHEN** se intenta registrar una foto de un paciente que no es de demostración con la base en modo de demostración
- **THEN** se rechaza con el mensaje de modo demostración

### Requirement: La copia de la historia incluye las fotos
La copia de la historia clínica SHALL incluir las fotos de las atenciones firmadas con su lado, zona, dedo, etapa, fecha, nota y
adjunto vigente, y SHALL declarar las anuladas como no incluidas. El administrativo SHALL NOT obtener la sección por otro camino.

#### Scenario: Fotos firmadas
- **WHEN** se compila la copia de un paciente con atenciones firmadas con fotos
- **THEN** la sección de Podología lista cada foto con su metadato y su adjunto vigente

#### Scenario: Archivo anulado
- **WHEN** el adjunto de una foto fue anulado
- **THEN** la copia declara el archivo como no incluido y conserva el metadato

#### Scenario: Función de la sección (negativo)
- **WHEN** cualquier rol de usuario intenta ejecutar directamente la función que arma la sección de Podología de la copia
- **THEN** se rechaza porque solo la invoca el compilado de la copia
