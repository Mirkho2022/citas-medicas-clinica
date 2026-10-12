# Spec Delta

> Nombres: sujetos a ADR-0030; si se rechaza, léase `medico`/`medicos` (con `profesion` añadida a `medicos`).

## Purpose

Registrar la profesión y la colegiatura de cada profesional de la salud como datos de la base de datos que el cliente no puede fijar
ni modificar, con un único punto de lectura de la profesión del usuario autenticado, para que las plantillas clínicas, el permiso de
recetar y el aislamiento de Psicología de los changes siguientes se apoyen en un dato confiable.

## ADDED Requirements

### Requirement: Cada profesional tiene una profesión y una colegiatura
Cada registro de profesional SHALL tener exactamente una profesión, de entre `medico`, `odontologo`, `fisioterapeuta`, `psicologo` y
`podologo`, y una colegiatura con contenido. La profesión SHALL ser obligatoria y no tener valor por defecto en altas nuevas. La
colegiatura SHALL ser única dentro de su profesión. Los profesionales anteriores al cambio SHALL quedar con profesión `medico`.

#### Scenario: Alta con profesión y colegiatura válidas
- **WHEN** el administrativo registra a un profesional con una de las cinco profesiones, una colegiatura y una especialidad
- **THEN** el registro queda creado

#### Scenario: Alta sin profesión (negativo)
- **WHEN** se intenta registrar a un profesional sin profesión
- **THEN** la base lo rechaza

#### Scenario: Profesión fuera de la lista (negativo)
- **WHEN** se intenta registrar a un profesional con una profesión que no es una de las cinco
- **THEN** la base lo rechaza

#### Scenario: Colegiatura vacía o repetida en la misma profesión (negativo)
- **WHEN** se intenta registrar a un profesional con la colegiatura vacía o solo con espacios, o con la colegiatura de otro profesional de la misma profesión
- **THEN** la base lo rechaza

#### Scenario: El mismo número en otra profesión
- **WHEN** se registra a un profesional cuya colegiatura coincide con la de un profesional de otra profesión
- **THEN** la base lo acepta

#### Scenario: Los profesionales existentes quedan como médicos
- **WHEN** se aplica el cambio sobre una base con profesionales registrados antes
- **THEN** cada uno conserva su colegiatura anterior y queda con profesión `medico`

#### Scenario: Un perfil no tiene dos registros de profesional (negativo)
- **WHEN** se intenta registrar un segundo profesional para el mismo perfil
- **THEN** la base lo rechaza

### Requirement: Solo el administrativo registra profesionales y todo rol con sesión válida los consulta
El administrativo SHALL poder registrar y actualizar profesionales; ningún otro rol SHALL poder hacerlo. Cualquier sesión con un rol
válido SHALL poder consultar la profesión, la colegiatura y la especialidad de los profesionales; una sesión sin rol y los roles
`anonymous`, `cron_notificaciones` y `sync_identidad` SHALL NOT poder consultarlos. Nadie SHALL poder eliminar registros de profesionales.

#### Scenario: El administrativo registra y actualiza
- **WHEN** el administrativo registra a un profesional y luego actualiza su colegiatura, su especialidad o su estado activo
- **THEN** los cambios se aplican

#### Scenario: Un profesional no registra ni edita profesionales (negativo)
- **WHEN** un profesional intenta registrar a otro, o editar su propio registro o el de otro
- **THEN** el registro nuevo se rechaza y la edición no modifica ninguna fila

#### Scenario: Enfermera y paciente no escriben (negativo)
- **WHEN** una enfermera o un paciente intenta registrar o editar un profesional
- **THEN** la base lo rechaza

#### Scenario: Lectura por rol válido
- **WHEN** un administrativo, profesional, enfermera o paciente consulta los profesionales
- **THEN** recibe sus filas

#### Scenario: Sin rol y roles de servicio no leen (negativo)
- **WHEN** una sesión sin rol consulta los profesionales
- **THEN** no recibe ninguna fila
- **AND** `anonymous`, `cron_notificaciones` y `sync_identidad` no tienen ningún privilegio sobre la tabla

#### Scenario: Nadie elimina profesionales (negativo)
- **WHEN** cualquier rol de usuario intenta eliminar un profesional
- **THEN** la base lo rechaza; el profesional se da de baja con el estado activo

### Requirement: La profesión no la fija el cliente
La profesión de un profesional SHALL tener como única fuente el registro de profesional en la base de datos. NO SHALL viajar en el
token de sesión, en los metadatos de Clerk ni en la invitación, y ninguna operación de un usuario con rol `profesional` SHALL aceptarla
como entrada. Un claim de profesión presente en un token SHALL ser ignorado.

#### Scenario: Un claim de profesión falso se ignora (negativo)
- **WHEN** un token de un profesional registrado como `psicologo` trae un claim de profesión `medico`
- **THEN** la profesión del usuario autenticado sigue siendo `psicologo`

#### Scenario: La invitación no lleva profesión
- **WHEN** se emite una invitación a una persona con rol `profesional`
- **THEN** la invitación no incluye profesión y el profesional no tiene profesión registrada hasta que el administrativo lo registre

#### Scenario: Un profesional no puede enviar su profesión (negativo)
- **WHEN** una operación ejecutada por un profesional recibe un campo de profesión
- **THEN** el sistema rechaza el campo y no modifica ninguna profesión

### Requirement: La profesión y el perfil de un profesional no se modifican después del alta
Ningún rol de usuario SHALL poder cambiar la profesión ni el perfil asociado de un profesional ya registrado, con dos barreras
independientes: ningún privilegio de actualización sobre esas columnas y un disparador que lo rechaza con `SQLSTATE HC010` si alguien
ampliara los privilegios. Una profesión mal registrada SHALL corregirse con una migración revisada.

#### Scenario: El administrativo no cambia la profesión (negativo)
- **WHEN** el administrativo intenta actualizar la profesión de un profesional
- **THEN** la base lo rechaza por falta de privilegio sobre esa columna

#### Scenario: El profesional no cambia su propia profesión (negativo)
- **WHEN** un profesional intenta actualizar su propia profesión
- **THEN** la base lo rechaza y su profesión no cambia

#### Scenario: El disparador resiste una ampliación de privilegios (negativo)
- **WHEN** en una prueba se concede temporalmente el privilegio de actualizar la profesión a `authenticated` y el administrativo la cambia
- **THEN** la base lo rechaza con `HC010` y la profesión no cambia

#### Scenario: Reasignar el perfil de un profesional (negativo)
- **WHEN** un usuario de la aplicación intenta cambiar el perfil asociado a un profesional
- **THEN** la base lo rechaza (privilegio o `HC010`)

#### Scenario: Una migración sí puede corregir
- **WHEN** una migración revisada corrige la profesión de un profesional
- **THEN** el cambio se aplica y queda en la auditoría

### Requirement: Un profesional solo se registra sobre un perfil con rol profesional
El alta de un profesional SHALL exigir que el perfil indicado tenga el rol `profesional`. Si no, la base SHALL rechazarla con
`SQLSTATE HC011`.

#### Scenario: Perfil de paciente o de administrativo (negativo)
- **WHEN** el administrativo intenta registrar como profesional a un perfil con rol `paciente`, `administrativo` o `enfermera`
- **THEN** la base lo rechaza con `HC011`

#### Scenario: Perfil con rol profesional
- **WHEN** el administrativo registra como profesional a un perfil con rol `profesional`
- **THEN** el alta se acepta

### Requirement: Los cambios en profesionales quedan en la auditoría
Todo alta, actualización o baja de un registro de profesional SHALL quedar en la auditoría de escritura con quién la hizo, su rol,
cuándo y los estados anterior y nuevo. La auditoría SHALL ser solo-agregar y solo la lee el administrativo.

#### Scenario: Alta y cambio auditados
- **WHEN** el administrativo registra a un profesional y luego cambia su especialidad
- **THEN** la auditoría contiene dos registros con el actor, su rol `administrativo` y los datos de cada cambio

#### Scenario: Otros roles no leen la auditoría (negativo)
- **WHEN** un profesional, una enfermera o un paciente consulta la auditoría
- **THEN** no recibe ninguna fila

### Requirement: Una sola lectura de la profesión del usuario autenticado
El sistema SHALL ofrecer una única función para obtener la profesión del profesional autenticado, ejecutable solo por `authenticated`,
con los privilegios de su dueño y una ruta de búsqueda vacía. Devuelve la profesión del registro del profesional asociado a la sesión
y nulo si el usuario no es profesional. Los changes que dependen de la profesión (plantillas, recetas, aislamiento de Psicología) SHALL
usarla en lugar de leer la tabla por su cuenta.

#### Scenario: Cada profesional obtiene su profesión
- **WHEN** un profesional registrado como `odontologo` consulta su profesión
- **THEN** obtiene `odontologo`, y uno registrado como `psicologo` obtiene `psicologo`

#### Scenario: Quien no es profesional obtiene nulo (negativo)
- **WHEN** un administrativo, una enfermera, un paciente o una sesión sin rol consulta la profesión
- **THEN** obtiene nulo

#### Scenario: Privilegios de la función
- **WHEN** se inspecciona la función
- **THEN** `authenticated` puede ejecutarla, `anonymous`, `cron_notificaciones` y `PUBLIC` no, y es `SECURITY DEFINER` con `search_path` vacío

### Requirement: Los datos de demostración declaran la profesión
El procedimiento de siembra de datos de demostración SHALL registrar la profesión y la colegiatura de cada profesional sintético y SHALL
poder ejecutarse más de una vez sin duplicar registros. Los datos de demostración SHALL seguir siendo los únicos admisibles mientras
la decisión legal P-1 siga abierta.

#### Scenario: Siembra idempotente con profesión
- **WHEN** se ejecuta la siembra de demostración dos veces sobre una base ya migrada
- **THEN** los conteos no cambian entre la primera y la segunda ejecución y cada profesional de demostración tiene profesión `medico`

#### Scenario: El aislamiento de la demostración se mantiene
- **WHEN** se ejecuta la comprobación de aislamiento de los datos de demostración
- **THEN** cada profesional ve solo a sus pacientes y el resto de roles mantiene sus cero filas en las tablas clínicas
