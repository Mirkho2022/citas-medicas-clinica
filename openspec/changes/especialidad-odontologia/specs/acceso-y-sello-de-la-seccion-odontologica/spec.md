# Spec Delta

## Purpose

Que toda la sección odontológica de una atención la lea cualquier profesional que tenga al paciente a cargo, la escriba solo un
odontólogo autor mientras la atención no esté firmada, quede inmutable y verificable al firmar, se audite sin copiar contenido, no
admita datos clínicos reales mientras la decisión legal siga abierta y se incluya en la copia de la historia.

## ADDED Requirements

### Requirement: Todo profesional a cargo lee la sección odontológica
El sistema SHALL permitir leer la cabecera, los registros, los tratamientos y las radiografías de una atención a todo profesional
activo que tenga al paciente a cargo, sea cual sea su profesión, con las mismas reglas de acceso que las atenciones. La
información de Odontología SHALL NOT estar restringida por el aislamiento de Psicología.

#### Scenario: Odontólogo a cargo
- **WHEN** un odontólogo con asignación vigente consulta el odontograma de su paciente
- **THEN** recibe los registros, tratamientos y radiografías

#### Scenario: Profesional de otra profesión a cargo
- **WHEN** un médico, un fisioterapeuta, un psicólogo o un podólogo con asignación vigente consulta el odontograma de su paciente
- **THEN** lo ve completo, sin controles de edición

#### Scenario: Profesional sin el paciente a cargo (negativo)
- **WHEN** un odontólogo o cualquier profesional sin asignación vigente consulta el odontograma de ese paciente
- **THEN** no recibe ninguna fila y la respuesta no revela si el paciente tiene registros

#### Scenario: Asignación vencida o perfil desactivado (negativo)
- **WHEN** la asignación del profesional venció, o su perfil fue desactivado
- **THEN** no recibe ninguna fila de la sección odontológica

#### Scenario: Roles sin acceso (negativo)
- **WHEN** un administrativo, una enfermera, un paciente (incluso sobre su propio odontograma) o una sesión sin rol consultan estas tablas directamente
- **THEN** no reciben ninguna fila

#### Scenario: Roles de servicio (negativo)
- **WHEN** `anonymous`, `cron_notificaciones` o `sync_identidad` intentan leerlas o escribirlas
- **THEN** se les deniega el privilegio

### Requirement: Solo el odontólogo autor escribe, mientras la atención no esté firmada
El sistema SHALL permitir insertar, modificar y eliminar registros, tratamientos, radiografías y la cabecera de la sección
únicamente a un profesional cuya profesión sea odontólogo, que sea el autor de la atención, tenga al paciente a cargo y use la
plantilla de Odontología, y solo mientras la atención no esté firmada. La profesión SHALL provenir de la base de datos y nunca de lo
que envíe el cliente. Estas reglas SHALL imponerse con dos barreras independientes: la política de la tabla y un disparador.

#### Scenario: Odontólogo autor
- **WHEN** el odontólogo autor de una atención sin firmar registra su sección
- **THEN** los registros se guardan

#### Scenario: Profesional que no es odontólogo (negativo)
- **WHEN** un médico, un fisioterapeuta, un psicólogo o un podólogo a cargo intenta escribir en la sección odontológica, directamente en la base de datos o por la aplicación
- **THEN** se rechaza indicando que solo un odontólogo puede registrarla, y no se guarda nada

#### Scenario: Odontólogo que no es el autor (negativo)
- **WHEN** un odontólogo a cargo intenta escribir en la atención sin firmar de otro odontólogo
- **THEN** se rechaza indicando que la atención no admite cambios

#### Scenario: Odontólogo sin el paciente a cargo (negativo)
- **WHEN** un odontólogo sin asignación vigente, con asignación vencida o con perfil desactivado intenta escribir
- **THEN** se rechaza y no se guarda nada

#### Scenario: Administrativo, enfermera y paciente (negativo)
- **WHEN** un administrativo, una enfermera o un paciente intentan escribir
- **THEN** se rechaza por falta de permiso

#### Scenario: Atención sin plantilla de Odontología (negativo)
- **WHEN** se intenta escribir la sección en una atención sin plantilla o con la plantilla de otra especialidad
- **THEN** se rechaza

#### Scenario: Columnas que el cliente no controla (negativo)
- **WHEN** una solicitud incluye el paciente, la huella, la fecha de sello o el identificador del registro
- **THEN** la base de datos rechaza la columna o la ignora, y el paciente del registro es siempre el de la atención

#### Scenario: Profesión enviada por el cliente
- **WHEN** una sesión trae una profesión falsa en su token o en la solicitud
- **THEN** se ignora y rige la profesión registrada en la base de datos

### Requirement: Plantilla de Odontología
El sistema SHALL incluir una plantilla de Odontología versionada y gestionada por migración, con la declaración obligatoria
«registra odontograma, tratamientos o radiografías», observaciones odontológicas y fecha de próxima cita, ambas opcionales, y SHALL
rechazar que un profesional que no sea odontólogo use esa plantilla. Una atención de un odontólogo sin plantilla SHALL poder
registrarse con los campos genéricos y sin sección odontológica. El contenido de la plantilla SHALL quedar marcado como propuesta
pendiente de revisión.

#### Scenario: Declaración obligatoria
- **WHEN** un odontólogo envía una atención con la plantilla de Odontología sin indicar si registra la sección
- **THEN** se rechaza indicando ese campo

#### Scenario: Plantilla de Odontología usada por otra profesión (negativo)
- **WHEN** un profesional que no es odontólogo registra una atención con la plantilla de Odontología
- **THEN** se rechaza y no se guarda la atención

#### Scenario: Atención genérica de un odontólogo
- **WHEN** un odontólogo registra una atención sin plantilla
- **THEN** se guarda con los campos genéricos y no admite sección odontológica

### Requirement: La sección coincide con lo declarado al firmar
Al firmar una atención con la plantilla de Odontología, el sistema SHALL comprobar en la base de datos que la sección coincide con la
declaración: si declara que registra, SHALL existir la cabecera y al menos un registro, tratamiento o radiografía; si declara que
no, SHALL NOT existir cabecera. También SHALL revalidar las piezas contra la dentición declarada. Si no coincide, la firma SHALL
rechazarse y la atención seguir siendo un borrador.

#### Scenario: Declara registrar y no registra nada (negativo)
- **WHEN** el odontólogo firma una atención que declara registrar la sección pero no tiene ningún registro, tratamiento ni radiografía
- **THEN** la firma se rechaza y la atención sigue sin firmar

#### Scenario: Declara no registrar y tiene sección (negativo)
- **WHEN** firma una atención que declara no registrar pero tiene cabecera
- **THEN** la firma se rechaza

#### Scenario: Declaración coherente
- **WHEN** firma una atención cuya sección coincide con su declaración
- **THEN** la atención queda firmada y la sección sellada

#### Scenario: Pieza incompatible con la dentición al firmar (negativo)
- **WHEN** al firmar existe un registro con una pieza que no corresponde a la dentición declarada
- **THEN** la firma se rechaza

### Requirement: Inmutabilidad y sello del odontograma al firmar
Al firmar la atención, el sistema SHALL calcular y guardar una huella propia de la sección odontológica (dentición, registros,
tratamientos y radiografías) y SHALL impedir a todo rol, incluido el dueño de la base, modificar o eliminar la cabecera, los
registros, los tratamientos y las radiografías. El sistema SHALL poder recalcular la huella y compararla con la guardada. La
huella de la sección SHALL NOT depender de la hora de la firma.

#### Scenario: Huella verificable
- **WHEN** se recalcula la huella de una atención firmada a partir del contenido guardado
- **THEN** coincide con la guardada al firmar

#### Scenario: Alteración detectada
- **WHEN** se altera un registro de una atención firmada (con la protección desactivada solo dentro de una prueba) y se recalcula la huella
- **THEN** ya no coincide con la guardada

#### Scenario: Desaparición de la sección detectada
- **WHEN** se borra la cabecera de una atención firmada que declaraba registrar la sección (con la protección desactivada solo dentro de una prueba)
- **THEN** la verificación indica que falta una sección declarada

#### Scenario: Modificar tras la firma (negativo)
- **WHEN** cualquier usuario o el dueño de la base intenta insertar, modificar o eliminar filas de la sección de una atención firmada
- **THEN** se rechaza indicando que debe usarse una addenda

#### Scenario: Orden de los disparadores
- **WHEN** se inspeccionan los disparadores de las tablas de la sección
- **THEN** se ejecutan en el orden identidad, protección, validación y guarda de datos reales

### Requirement: Firma y edición simultáneas
El sistema SHALL garantizar que una edición de la sección concurrente con la firma de su atención no deje un sello desfasado: o la
edición se rechaza por estar la atención firmada, o la huella ya la incluye.

#### Scenario: Editar mientras se firma
- **WHEN** el autor firma desde una pestaña mientras modifica un registro desde otra
- **THEN** la edición posterior a la firma se rechaza y el contenido sellado no varía

#### Scenario: Edición que llega primero
- **WHEN** la edición se confirma antes que la firma
- **THEN** la huella calculada al firmar incluye esa edición

### Requirement: Auditoría de escritura y de lectura sin copiar contenido
El sistema SHALL registrar en la auditoría quién, cuándo, qué acción, en qué tabla y el identificador de cada inserción,
modificación o eliminación de la sección, sin copiar el detalle, la nota ni ningún dato clínico. Toda lectura de contenido
odontológico SHALL registrarse en el registro de accesos a la historia en la misma transacción en que se lee, y si ese registro
falla no se devolverá contenido. Todo el acceso a estas tablas SHALL pasar por un único módulo.

#### Scenario: Auditoría sin contenido
- **WHEN** el administrativo consulta la auditoría tras una escritura de la sección
- **THEN** ve al actor, la acción, la tabla y el identificador, y no el detalle ni la nota

#### Scenario: Lectura registrada
- **WHEN** un profesional a cargo abre el odontograma de su paciente
- **THEN** queda un registro de acceso a la historia, escrito en la misma transacción que la lectura

#### Scenario: Registro imposible (negativo)
- **WHEN** el registro de acceso no puede escribirse
- **THEN** no se devuelve ningún contenido odontológico

#### Scenario: Acceso fuera del módulo (negativo)
- **WHEN** un archivo de la aplicación fuera del módulo de odontología contiene SQL contra estas tablas
- **THEN** la verificación automática del código falla

### Requirement: Datos clínicos reales prohibidos mientras la decisión legal siga abierta
El sistema SHALL aplicar a las tablas de la sección odontológica la guarda de datos clínicos reales del módulo de historias
clínicas: en modo demostración solo se admiten pacientes de demostración, y toda operación SHALL fallar si el modo de la aplicación
no coincide con el de la base de datos.

#### Scenario: Paciente real en modo demostración (negativo)
- **WHEN** se intenta registrar la sección de un paciente que no es de demostración mientras la base está en modo demostración
- **THEN** se rechaza con el mensaje del modo demostración y no se guarda nada

#### Scenario: Modo inconsistente (negativo)
- **WHEN** la aplicación opera con un modo distinto del de la base de datos
- **THEN** las operaciones de odontología fallan cerradas con el aviso de configuración inconsistente

### Requirement: La copia de la historia incluye la sección odontológica
El sistema SHALL clasificar las tablas de Odontología en el compilado de la copia de la historia y SHALL incluir, de las
atenciones firmadas hasta el corte, la sección de cada una, el odontograma actual al corte y los tratamientos pendientes. Los
borradores SHALL NOT incluirse. El rol administrativo SHALL NOT obtener esta información por ninguna otra vía, y la sección SHALL
NOT poder invocarse directamente por ningún rol de usuario.

#### Scenario: Sección incluida en la copia
- **WHEN** se compila la copia de un paciente con atenciones odontológicas firmadas
- **THEN** el compilado incluye, por atención, la dentición, los registros con el nombre del hallazgo, los tratamientos, las radiografías con su metadato y la huella, además del odontograma actual al corte

#### Scenario: Borradores excluidos
- **WHEN** el paciente tiene una atención odontológica sin firmar
- **THEN** sus registros no figuran en la copia

#### Scenario: Radiografía con adjunto anulado
- **WHEN** la copia incluye una radiografía cuyo adjunto fue anulado
- **THEN** figura su metadato con la leyenda de archivo anulado y el archivo no se anexa

#### Scenario: Lectura directa por el administrativo (negativo)
- **WHEN** el administrativo consulta directamente las tablas de la sección o intenta ejecutar la función que produce la sección
- **THEN** no recibe ninguna fila y se le deniega la ejecución

#### Scenario: Tabla nueva sin clasificar
- **WHEN** se crea una tabla clínica de Odontología que no está clasificada en el compilado
- **THEN** la prueba de cobertura de la copia falla

#### Scenario: Contenido ausente de los registros de control
- **WHEN** se genera una copia con un texto centinela en el detalle de un registro
- **THEN** el texto aparece en el compilado y no aparece en la solicitud, en el registro de accesos ni en la auditoría
