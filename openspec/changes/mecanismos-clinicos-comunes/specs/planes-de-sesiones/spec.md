# Spec Delta

## Purpose

Permitir que un profesional de la salud autorizado registre un plan de sesiones de un paciente (protocolo o descripción, total,
frecuencia y vigencia) con un contador de sesiones restantes calculado en la base de datos, sin cobros ni saldos, con un ciclo de
vida cerrado (`activo`, `completado`, `cancelado`) y con el aislamiento de la información de Psicología impuesto por la base.

## ADDED Requirements

### Requirement: Un profesional autorizado crea el plan de un paciente a su cargo
El sistema SHALL permitir crear un plan de sesiones únicamente a un profesional activo cuya profesión esté autorizada a planificar
sesiones (fisioterapeuta, psicólogo y podólogo, como dato de la base) y que tenga al paciente a cargo. El plan SHALL indicar el
total de sesiones (1 a 60), la frecuencia en días (1 a 90), la vigencia, y un protocolo o una descripción con contenido. Al crearlo,
la base SHALL fijar la profesión del autor, el área, la especialidad, la fecha de inicio y la hora de creación, y SHALL crear en la
misma transacción tantas sesiones «por agendar» como el total. Ningún cliente SHALL poder indicar la profesión, el área ni el
autor.

#### Scenario: Plan de fisioterapia
- **WHEN** un fisioterapeuta con el paciente a cargo crea un plan de 10 sesiones cada 7 días con una vigencia de 90 días
- **THEN** queda un plan activo con 10 sesiones por agendar, el área «fisioterapia» y el contador de restantes en 10

#### Scenario: Profesión no autorizada (negativo)
- **WHEN** un médico o un odontólogo con el paciente a cargo intenta crear un plan de sesiones
- **THEN** se rechaza por profesión no autorizada y no se guarda nada

#### Scenario: Paciente que no está a cargo (negativo)
- **WHEN** un fisioterapeuta que no tiene al paciente a cargo, o cuya asignación venció o cuyo perfil está desactivado, intenta crear su plan
- **THEN** se rechaza sin confirmar si el paciente existe y no se guarda nada

#### Scenario: Roles que no crean planes (negativo)
- **WHEN** el administrativo, la enfermera, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intenta crear un plan
- **THEN** se rechaza por falta de permiso y no se guarda nada

#### Scenario: Datos inválidos (negativo)
- **WHEN** el plan tiene 0 o 61 sesiones, una frecuencia de 0 o 91 días, una vigencia anterior a la fecha de inicio o mayor de 365 días,
  o no trae ni protocolo ni descripción con contenido real
- **THEN** se rechaza en el servidor y, si la solicitud llegara a la base, esta también lo rechaza

#### Scenario: Envío repetido
- **WHEN** el mismo formulario se envía dos veces con el mismo identificador
- **THEN** existe un solo plan con sus sesiones, y un identificador que pertenece a otro autor o a otro paciente se rechaza

### Requirement: El contador de sesiones restantes se calcula en la base de datos
El sistema SHALL calcular las sesiones asistidas, agendadas, por agendar y restantes de cada plan en la base de datos a partir de
las sesiones, sin almacenar un contador. Las sesiones restantes SHALL ser las que no están asistidas, y la base SHALL garantizar que
el número de sesiones de un plan es igual a su total. El sistema SHALL mostrar además las sesiones sin cerrar (agendadas cuya hora
ya pasó) y si el plan está vencido, y SHALL NOT guardar saldos, montos ni pagos.

#### Scenario: Plan recién creado
- **WHEN** se consulta un plan de 10 sesiones sin ninguna agendada
- **THEN** muestra 0 asistidas, 0 agendadas, 10 por agendar y 10 restantes

#### Scenario: Sesión asistida
- **WHEN** una de las sesiones pasa a asistida
- **THEN** el plan muestra 9 restantes y el contador no depende de ninguna columna editable

#### Scenario: Invariante del total
- **WHEN** una operación dejaría un plan con un número de sesiones distinto de su total
- **THEN** la transacción no se confirma, también para el dueño de la base

#### Scenario: Sesión sin cerrar
- **WHEN** una sesión agendada tiene una cita cuya hora de fin ya pasó y la cita no se marcó como atendida ni como «no asistió»
- **THEN** el plan la muestra como «sin cerrar» y no la cuenta como asistida

#### Scenario: Plan vencido
- **WHEN** un plan activo pasa su fecha de vigencia con sesiones pendientes
- **THEN** se muestra como vencido, sigue activo y no se pueden vincular citas posteriores a su vigencia

### Requirement: El plan tiene un ciclo de vida cerrado
El sistema SHALL mantener el estado del plan en `activo`, `completado` o `cancelado`. Un plan activo SHALL pasar solo a `completado`
cuando no quede ninguna sesión sin asistir (motivo `sesiones_cumplidas`, sin intervención de nadie) o por alta anticipada (motivo
`alta_anticipada`), y a `cancelado` con un motivo de un conjunto cerrado (`abandono`, `indicacion_clinica`, `error_de_registro`,
`reemplazado`). `completado` y `cancelado` SHALL ser terminales. Solo un profesional activo con el paciente a cargo y de la profesión
del plan SHALL poder cerrarlo.

#### Scenario: Se cumplen todas las sesiones
- **WHEN** se marca atendida la cita de la última sesión sin asistir
- **THEN** el plan pasa a completado en la misma transacción, con el motivo «sesiones cumplidas»

#### Scenario: El paciente abandona
- **WHEN** el profesional cierra el plan como cancelado por abandono
- **THEN** el plan queda cancelado, conserva sus sesiones y la pantalla indica cuántas citas futuras siguen vigentes sin cancelarlas

#### Scenario: Alta anticipada
- **WHEN** el profesional cierra como completado con alta anticipada un plan con sesiones restantes
- **THEN** el plan queda completado y conserva las restantes como dato

#### Scenario: Cierre terminal (negativo)
- **WHEN** se intenta reabrir o volver a cerrar un plan completado o cancelado
- **THEN** se rechaza por estado no permitido

#### Scenario: Motivo fuera del conjunto (negativo)
- **WHEN** se intenta cancelar con un motivo que no es uno de los cuatro o con texto libre
- **THEN** se rechaza

#### Scenario: Cierre por una profesión ajena (negativo)
- **WHEN** un podólogo con el paciente a cargo intenta cerrar el plan de un fisioterapeuta
- **THEN** se rechaza por profesión no autorizada

#### Scenario: Cobertura por un colega
- **WHEN** un fisioterapeuta distinto del autor, con el paciente a cargo, cierra el plan del autor que está de baja
- **THEN** el cierre se acepta y consta quién lo hizo

### Requirement: La vigencia y el total solo pueden aumentar
El sistema SHALL permitir ampliar la vigencia (hasta 365 días desde el inicio) y el total (hasta 60 sesiones) de un plan activo, y SHALL
crear en la misma transacción las sesiones nuevas. SHALL NOT permitir reducirlos, cambiar el paciente, el autor, el área ni el
protocolo, ni modificar un plan terminado.

#### Scenario: Ampliar el total
- **WHEN** el profesional amplía un plan de 10 sesiones en 2
- **THEN** el total es 12, existen 12 sesiones y las dos nuevas están por agendar

#### Scenario: Reducir (negativo)
- **WHEN** se intenta reducir el total o acortar la vigencia
- **THEN** se rechaza

#### Scenario: Pasar el máximo (negativo)
- **WHEN** la ampliación llevaría el total a más de 60
- **THEN** se rechaza y no se crea ninguna sesión

#### Scenario: Plan terminado (negativo)
- **WHEN** se intenta ampliar un plan completado o cancelado
- **THEN** se rechaza

### Requirement: Las tablas del plan no se escriben directamente
El sistema SHALL escribir `planes_de_sesiones` y `sesiones_del_plan` únicamente mediante funciones acotadas y los disparadores del
propio mecanismo. Ningún rol de usuario ni `anonymous`, `cron_notificaciones` o `sync_identidad` SHALL tener privilegios de
inserción, modificación o borrado, y la base SHALL rechazar todo borrado y toda modificación fuera de las transiciones permitidas,
también para el dueño.

#### Scenario: Escritura directa (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar un plan o una sesión con una sentencia directa
- **THEN** se rechaza por falta de privilegios

#### Scenario: El dueño no puede corromper un plan (negativo)
- **WHEN** el dueño de la base intenta borrar un plan, cambiar su paciente o su autor, o saltarse una transición de estado
- **THEN** la base lo rechaza

#### Scenario: Una sesión no puede ser de otro paciente ni de otra área (negativo)
- **WHEN** se intenta insertar una sesión con un paciente o un área distinta de los de su plan
- **THEN** la clave foránea compuesta lo rechaza

### Requirement: Quién lee los planes y el aislamiento de Psicología
El sistema SHALL permitir leer los planes y sus sesiones y el contador únicamente a un profesional activo que tenga al paciente a cargo.
Los planes de un psicólogo (área `psicologia`) SHALL ser leídos únicamente por un psicólogo que tenga al paciente a cargo, impuesto en
la base de datos y no en la interfaz; los planes de las demás áreas SHALL ser leídos por todo profesional a cargo. El administrativo
SHALL NOT leer las tablas del plan.

#### Scenario: Plan de fisioterapia visto por otro profesional
- **WHEN** un médico que tiene al paciente a cargo consulta los planes del paciente
- **THEN** ve el plan del fisioterapeuta con su contador

#### Scenario: Plan de Psicología (negativo por profesión)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo que tiene al paciente a cargo consulta los planes, o abre la dirección directa del plan de un psicólogo
- **THEN** no obtiene ninguna fila y la pantalla responde «no existe», sin confirmar su existencia

#### Scenario: Psicólogo sin el paciente a cargo (negativo)
- **WHEN** un psicólogo que no tiene al paciente a cargo, con asignación vencida o con perfil desactivado, consulta el plan
- **THEN** no obtiene ninguna fila

#### Scenario: Psicólogo a cargo
- **WHEN** un psicólogo que tiene al paciente a cargo consulta los planes de Psicología del paciente
- **THEN** ve el plan y su contador

#### Scenario: Roles sin acceso (negativo)
- **WHEN** el administrativo, la enfermera, el paciente (incluido el titular), una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización consulta las tablas del plan o la vista del contador
- **THEN** no obtiene ninguna fila o se rechaza por falta de privilegios

### Requirement: Escrituras y lecturas de los planes quedan auditadas
El sistema SHALL registrar cada escritura de las tablas del plan en la auditoría con quién, cuándo y qué fila, sin copiar el
contenido clínico, y SHALL registrar en `accesos_historia`, dentro de la misma transacción que la lectura, cada lectura de planes
que haga un profesional. Si el registro de acceso falla, la lectura no SHALL devolver contenido.

#### Scenario: Escritura sin contenido
- **WHEN** se crea o se cierra un plan
- **THEN** la auditoría que lee el administrativo muestra la tabla, la acción, el actor y el identificador, sin protocolo ni descripción

#### Scenario: Lectura registrada
- **WHEN** un profesional abre los planes de un paciente
- **THEN** queda un registro de acceso de tipo «plan_sesiones» atribuido a él, en la misma transacción

#### Scenario: Acceso que no se puede registrar (negativo)
- **WHEN** la asignación del profesional venció y el registro de acceso es rechazado
- **THEN** la transacción se revierte y no se devuelve ningún contenido

### Requirement: No se admiten datos reales mientras la decisión legal siga abierta
El sistema SHALL aplicar a los planes de sesiones la guarda de datos reales de las historias clínicas: en modo de demostración solo
se admiten planes de pacientes de demostración, y toda operación de la aplicación SHALL comprobar que el modo de la aplicación
coincide con el de la base.

#### Scenario: Paciente real en modo demostración (negativo)
- **WHEN** se intenta crear un plan para un paciente que no es de demostración mientras la base está en modo demostración
- **THEN** se rechaza y no se guarda nada
