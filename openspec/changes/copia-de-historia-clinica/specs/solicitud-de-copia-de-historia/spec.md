# Spec Delta

## Purpose

Registrar cada solicitud de copia de la historia clínica (del paciente, de su representante legal o de una autoridad) con
trazabilidad completa y sin contenido clínico, y llevarla por un ciclo de estados cerrado que solo recepción puede ver y
gestionar, para poder demostrar el cumplimiento del plazo de la NTS 139.

> Nombres: sujetos a ADR-0030 (aún no aceptada); si se rechaza, léase `medico` donde dice `profesional`.

## ADDED Requirements

### Requirement: Solo recepción registra y ve las solicitudes de copia
El sistema SHALL permitir únicamente al administrativo registrar, consultar y gestionar solicitudes de copia de la historia
clínica. Ningún otro rol SHALL poder leerlas, crearlas ni modificarlas, ni siquiera consultando directamente las tablas, y la
protección SHALL ser impuesta por la base de datos además de por la pantalla. El paciente titular de la historia SHALL NO ver
el estado de su propia solicitud en el portal.

#### Scenario: Recepción registra y consulta
- **WHEN** un administrativo con sesión y MFA registra una solicitud y abre la lista
- **THEN** la solicitud aparece con su número, su paciente, su solicitante y su fecha límite

#### Scenario: Profesional a cargo u otro profesional (negativo)
- **WHEN** un profesional, aunque tenga al paciente a cargo, intenta leer, crear, modificar o eliminar una solicitud, por la pantalla o consultando las tablas
- **THEN** no recibe ninguna fila y nada se guarda

#### Scenario: Enfermera (negativo)
- **WHEN** una enfermera intenta leer o crear una solicitud
- **THEN** no recibe ninguna fila y nada se guarda

#### Scenario: Paciente, incluso sobre su propia solicitud (negativo)
- **WHEN** un paciente intenta leer o crear una solicitud de copia, incluida una a su nombre
- **THEN** no recibe ninguna fila y nada se guarda

#### Scenario: Sin rol, anónimo y roles de servicio (negativo)
- **WHEN** un usuario sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta leer o escribir la tabla
- **THEN** la operación se rechaza por falta de privilegios

#### Scenario: Sin sesión o sin MFA (negativo)
- **WHEN** alguien sin sesión, o un administrativo sin MFA activa, pide cualquier dirección de copias de historia
- **THEN** es redirigido a iniciar sesión o a configurar MFA y no se devuelve ningún dato

### Requirement: Datos mínimos de la solicitud, fijados por el servidor
Al registrar una solicitud, el sistema SHALL exigir el paciente, el tipo de solicitante (paciente, representante legal o
autoridad), los nombres, apellidos y documento del solicitante (DNI, Carné de Extranjería o pasaporte, con el formato válido de
cada uno) y, si el solicitante no es el paciente, su vínculo. La fecha de solicitud, el vencimiento, el estado inicial y el
perfil que la registra SHALL fijarlos el servidor, ignorando cualquier valor enviado por el cliente. Los textos SHALL tener
contenido real (no vacíos, no solo espacios ni caracteres invisibles).

#### Scenario: Registro válido por el propio paciente
- **WHEN** recepción registra la solicitud de un paciente mayor de edad con su documento
- **THEN** queda en estado `solicitada`, con la fecha y hora del servidor, el perfil de quien la registró y su fecha límite

#### Scenario: Campos vacíos o inválidos (negativo)
- **WHEN** falta un dato obligatorio, un nombre es solo espacios o invisibles, o el documento no cumple el formato de su tipo
- **THEN** la solicitud se rechaza, se indican los campos y no se guarda nada

#### Scenario: Fecha, estado o autor enviados por el cliente (negativo)
- **WHEN** una solicitud llega con una fecha de solicitud, un vencimiento, un estado distinto de `solicitada` o el perfil de otro administrativo
- **THEN** el servidor ignora esos valores o rechaza la operación, y la solicitud queda con sus valores propios

#### Scenario: Paciente inexistente (negativo)
- **WHEN** se intenta registrar una solicitud para un paciente que no existe
- **THEN** se rechaza sin crear la solicitud

#### Scenario: Paciente cuya historia no registra nada
- **WHEN** se registra una solicitud para un paciente que no tiene atenciones, antecedentes ni adjuntos
- **THEN** la solicitud se acepta, porque la clínica debe poder responder también a esa petición

#### Scenario: Datos reales en modo demostración (negativo)
- **WHEN** el sistema está en modo demostración y se intenta registrar la solicitud de un paciente que no es de demostración (o a la inversa en modo real)
- **THEN** la operación se rechaza con el mensaje de modo de datos clínicos

### Requirement: Ciclo de estados cerrado y definitivo
Cada solicitud SHALL recorrer únicamente estos estados: `solicitada`, `verificada`, `emitida` y `rechazada`. Solo SHALL poder
pasar de `solicitada` a `verificada` o `rechazada`, y de `verificada` a `emitida` o `rechazada`. Los estados `emitida` y
`rechazada` SHALL ser definitivos. El estado SHALL cambiar únicamente mediante las operaciones de verificar, rechazar y confirmar
la entrega, nunca por una edición directa.

#### Scenario: Camino normal
- **WHEN** una solicitud se registra, se verifica y se confirma su entrega
- **THEN** pasa por `solicitada`, `verificada` y `emitida`, y cada paso guarda quién lo hizo y cuándo

#### Scenario: Saltar un paso (negativo)
- **WHEN** se intenta confirmar la entrega de una solicitud que está solo `solicitada`
- **THEN** la operación se rechaza indicando que la solicitud no está en un estado que lo permita

#### Scenario: Reabrir una solicitud cerrada (negativo)
- **WHEN** se intenta verificar, rechazar o confirmar una solicitud `rechazada` o `emitida`
- **THEN** la operación se rechaza y la solicitud no cambia

#### Scenario: Edición directa del estado (negativo)
- **WHEN** un administrativo, o cualquier usuario, intenta actualizar el estado u otro campo de la solicitud directamente
- **THEN** la operación se rechaza

#### Scenario: Dos personas actúan a la vez
- **WHEN** dos administrativos confirman o verifican la misma solicitud al mismo tiempo
- **THEN** solo una operación se aplica y la otra recibe el aviso de que la solicitud ya cambió

### Requirement: Las solicitudes son solo-agregar
Los registros de solicitud SHALL ser inalterables en su historia: ningún usuario, ni siquiera el dueño de la base de datos,
SHALL poder eliminarlos, ni cambiar el solicitante, el paciente, la fecha de solicitud, el vencimiento ni los datos de una
etapa ya cumplida.

#### Scenario: Eliminar una solicitud (negativo)
- **WHEN** cualquier usuario intenta eliminar una solicitud, de cualquier estado
- **THEN** la operación se rechaza

#### Scenario: Cambiar el solicitante o las fechas (negativo)
- **WHEN** cualquier usuario intenta cambiar el solicitante, el paciente, la fecha de solicitud o el vencimiento de una solicitud existente
- **THEN** la operación se rechaza

#### Scenario: Trazabilidad completa
- **WHEN** se revisa una solicitud cerrada
- **THEN** muestra quién la registró, quién la verificó, quién la rechazó o entregó, y la fecha y hora de Lima de cada paso

#### Scenario: Auditoría de escritura sin contenido clínico
- **WHEN** el administrativo consulta la auditoría tras actividad sobre solicitudes
- **THEN** encuentra quién, cuándo y qué acción, y ningún texto clínico

### Requirement: Una sola solicitud abierta por paciente y solicitante
El sistema SHALL impedir que existan dos solicitudes abiertas (`solicitada` o `verificada`) para el mismo paciente y el mismo
documento de solicitante, incluso si se registran al mismo tiempo, e informar el número de la ya abierta. Otro solicitante distinto
SHALL poder tener su propia solicitud, y tras cerrarse una (`emitida` o `rechazada`) SHALL poder registrarse otra.

#### Scenario: Solicitud duplicada
- **WHEN** recepción registra una segunda solicitud del mismo solicitante para el mismo paciente mientras la primera sigue abierta
- **THEN** se rechaza y el mensaje indica el número de la solicitud abierta

#### Scenario: Registros simultáneos
- **WHEN** dos administrativos registran a la vez la misma solicitud
- **THEN** solo una se crea y la otra recibe el aviso de duplicada

#### Scenario: Otro solicitante
- **WHEN** el otro progenitor del mismo menor solicita su propia copia mientras la del primero está abierta
- **THEN** se acepta, porque el documento del solicitante es distinto

#### Scenario: Nueva solicitud tras cerrarse la anterior
- **WHEN** una solicitud fue rechazada o entregada y el mismo solicitante registra otra
- **THEN** se acepta y ambas quedan en el historial
