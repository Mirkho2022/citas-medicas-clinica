# Spec Delta

## Purpose

Que el psicólogo registre una nota por cada sesión, reservada, firmada e inmutable y corregible solo por rectificación, y que lleve procesos
de sesiones recurrentes mediante el plan de sesiones común, sin que la agenda, las citas ni el plan delaten contenido clínico.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional».
> <!-- REVISAR: los campos de la nota y sus límites son una propuesta a validar con los psicólogos de la clínica. Las reglas de salud mental, la retención y la entrega de estas notas se llevan al asesor legal. -->

## ADDED Requirements

### Requirement: La nota de sesión es obligatoria en sus cuatro campos y es reservada
El sistema SHALL guardar cada nota de sesión con cuatro campos obligatorios con contenido real (tema, desarrollo, evolución y plan
para la siguiente sesión), la fecha de la sesión, el paciente, la autoría del psicólogo y, si corresponde, la cita y la sesión del
plan. La nota SHALL poder escribirla únicamente un psicólogo que tenga al paciente a cargo, y SHALL poder leerla solo un psicólogo a
cargo. La tabla SHALL nacer con RLS activada, sin privilegios para `anonymous`, `cron_notificaciones` ni `sync_identidad`.

#### Scenario: Nota completa
- **WHEN** un psicólogo a cargo guarda una nota con sus cuatro campos y la fecha de la sesión
- **THEN** la nota queda guardada como borrador de su autor

#### Scenario: Campo vacío o inválido
- **WHEN** falta un campo, o solo tiene espacios o caracteres invisibles, o la fecha de la sesión es futura
- **THEN** no se guarda nada y la respuesta indica el campo

#### Scenario: Médico u otra profesión (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo intenta insertar una nota de sesión
- **THEN** la base lo rechaza con `HC070` y no se guarda nada

#### Scenario: Lectura por otras profesiones (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo con el paciente a cargo consulta las notas de sesión, o abre una por su identificador
- **THEN** no recibe ninguna fila

#### Scenario: Psicólogo sin el paciente a cargo (negativo)
- **WHEN** un psicólogo sin asignación vigente, con la asignación vencida o con el perfil desactivado intenta leer o escribir una nota
- **THEN** no recibe ninguna fila y no se guarda nada

#### Scenario: Otros roles (negativo)
- **WHEN** el administrativo, una enfermera, el paciente titular, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta leer, insertar, modificar o borrar notas
- **THEN** recibe cero filas o la base lo rechaza por falta de privilegios

#### Scenario: Autoría ajena (negativo)
- **WHEN** un psicólogo intenta registrar una nota a nombre de otro psicólogo
- **THEN** la base lo rechaza

#### Scenario: Otro psicólogo a cargo lee la nota firmada
- **WHEN** otro psicólogo con el paciente a cargo consulta una nota firmada
- **THEN** la ve
<!-- REVISAR: U7 de design.md; si las notas deben ser privadas de su autor, se estrecha la política. -->

### Requirement: El borrador de una nota es visible solo para su autor
Una nota sin firmar SHALL ser legible y editable únicamente por su autor mientras tenga al paciente a cargo. Otro psicólogo a cargo
SHALL NOT leer el borrador.

#### Scenario: Borrador de un colega (negativo)
- **WHEN** un psicólogo a cargo consulta las notas del paciente y existe un borrador de otro psicólogo
- **THEN** no recibe ese borrador y sí las notas firmadas

#### Scenario: El autor edita su borrador
- **WHEN** el autor modifica su borrador antes de firmar
- **THEN** los cambios se guardan

#### Scenario: Otro psicólogo intenta editar el borrador (negativo)
- **WHEN** otro psicólogo a cargo intenta modificar el borrador de un colega
- **THEN** la base no modifica ninguna fila

### Requirement: Una nota firmada es inmutable, sellada por el servidor y se corrige por rectificación
Al firmar, la hora y la huella de la nota SHALL fijarlas la base con la hora del servidor, y la nota SHALL quedar inmutable para todo
rol, incluido el dueño: modificarla o eliminarla SHALL rechazarse con `SQLSTATE HC072`. Una corrección SHALL registrarse como una nota nueva
que rectifica a la anterior, del mismo paciente y autor, solo si la anterior está firmada y no fue rectificada ya; en otro caso la base
SHALL rechazarla con `HC073`. Dos rectificaciones simultáneas de la misma nota SHALL resolverse en una sola.

#### Scenario: Firma sellada
- **WHEN** el autor firma su nota y el cliente envía otra hora de firma
- **THEN** la nota queda con la hora del servidor, el método y la huella calculados por la base

#### Scenario: Modificar una nota firmada (negativo)
- **WHEN** alguien intenta modificar un campo de una nota firmada
- **THEN** se rechaza con `HC072` y la nota no cambia

#### Scenario: Eliminar una nota (negativo)
- **WHEN** cualquier rol, incluido el dueño, intenta eliminar una nota firmada o un borrador
- **THEN** se rechaza

#### Scenario: Rectificar una nota firmada
- **WHEN** el autor registra una nota que rectifica a una nota firmada propia
- **THEN** ambas quedan visibles para los psicólogos a cargo y la rectificada se muestra como rectificada

#### Scenario: Rectificación inválida (negativo)
- **WHEN** se intenta rectificar un borrador, una nota de otro paciente, una nota de otro autor o una nota ya rectificada
- **THEN** la base lo rechaza con `HC073`

#### Scenario: Rectificaciones simultáneas
- **WHEN** dos sesiones intentan rectificar la misma nota a la vez
- **THEN** solo una prospera y la otra recibe `HC073`

#### Scenario: Huella que cubre el contenido
- **WHEN** se altera un campo de una nota firmada, con la protección desactivada solo dentro de una prueba, y se recalcula la huella
- **THEN** ya no coincide con la guardada al firmar

#### Scenario: Firmar no cambia la cita ni la sesión
- **WHEN** el autor firma la nota de una sesión
- **THEN** el estado de la cita y el contador de sesiones del plan no cambian; la pantalla ofrece aparte las acciones de marcar la sesión como realizada y la cita como atendida

### Requirement: La nota se vincula solo a una cita o sesión del mismo paciente y psicólogo
Si la nota indica una cita, esta SHALL ser del mismo paciente y del mismo psicólogo, y una cita SHALL tener a lo sumo una nota; si indica una
sesión de un plan, SHALL ser del mismo paciente y de un plan del mismo psicólogo. En otro caso la base SHALL rechazarla con `SQLSTATE HC071`. Un
profesional que no puede escribir notas SHALL recibir el error de permiso antes que cualquier error de unicidad.

#### Scenario: Cita de otro paciente (negativo)
- **WHEN** el psicólogo indica la cita de otro paciente o de otro psicólogo
- **THEN** la base lo rechaza con `HC071`

#### Scenario: Segunda nota para la misma cita
- **WHEN** el psicólogo intenta registrar otra nota con la misma cita
- **THEN** se rechaza con un mensaje en español sin texto de la base

#### Scenario: Un médico reutiliza la cita de una sesión (negativo)
- **WHEN** un médico intenta insertar una nota con la cita de una sesión de Psicología
- **THEN** recibe el error de permiso, no el de unicidad

### Requirement: Las sesiones recurrentes se llevan con el plan de sesiones y son reservadas
Un psicólogo a cargo SHALL poder crear un plan de sesiones del paciente con frecuencia semanal por omisión (editable), total de sesiones y vigencia
según el mecanismo común de planes de sesiones, con contador de sesiones restantes y estados activo, completado y cancelado. El plan y sus sesiones
SHALL ser información reservada: solo los psicólogos a cargo los leen y solo un psicólogo los crea o cierra. Las citas de las sesiones SHALL NOT
llevar motivo clínico. La ventana de cancelación de una hora SHALL aplicar a todos los roles. El plan SHALL NOT incluir cobros ni saldos.

#### Scenario: Plan semanal
- **WHEN** un psicólogo a cargo crea un plan de 12 sesiones con frecuencia semanal
- **THEN** el plan queda activo con 12 sesiones restantes y sus citas se programan según el mecanismo común

#### Scenario: Sesión a la que no asiste, reprogramada o abandono
- **WHEN** el paciente no asiste, la sesión se reprograma o el paciente abandona el proceso
- **THEN** el contador y el estado del plan reflejan el caso según el mecanismo común, sin leer ninguna nota

#### Scenario: Plan visible solo para psicólogos a cargo (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo a cargo consulta los planes de sesiones del paciente
- **THEN** no recibe el plan de Psicología ni sus sesiones, y sí los planes de su propia profesión

#### Scenario: Otros roles y profesionales sin el paciente (negativo)
- **WHEN** el administrativo, una enfermera, el paciente, una sesión sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` o un psicólogo sin el paciente a cargo intenta leer o crear el plan
- **THEN** recibe cero filas o la base lo rechaza

#### Scenario: Recepción ve las citas y lo mínimo para agendar, no el plan
- **WHEN** el administrativo consulta la agenda y la lista de sesiones por agendar
- **THEN** ve las citas de las sesiones con su hora y profesional, sin motivo clínico, y cuántas sesiones faltan por agendar, y no ve el protocolo, la descripción ni ninguna nota

#### Scenario: Médico crea un plan de Psicología (negativo)
- **WHEN** un profesional que no es psicólogo intenta crear un plan de Psicología
- **THEN** la base lo rechaza con `HC090` (mecanismo común de planes)

#### Scenario: Ventana de cancelación
- **WHEN** cualquier rol intenta cancelar la cita de una sesión dentro de la hora previa
- **THEN** la cancelación se rechaza como para cualquier otra cita

#### Scenario: Continuidad del acceso
- **WHEN** se confirma la cita de una sesión
- **THEN** la asignación del psicólogo al paciente se renueva según la regla de las citas y conserva su acceso a la información de Psicología
