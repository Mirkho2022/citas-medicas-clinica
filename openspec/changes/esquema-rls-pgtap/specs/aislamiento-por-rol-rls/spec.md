# Spec Delta

## Purpose

Garantizar en la base de datos, y no solo en la aplicación, que cada rol vea y modifique únicamente
los datos que le corresponden, con especial rigor sobre las historias clínicas, y que las
credenciales de servicio (cron e identidad) tengan el alcance mínimo indispensable.

## ADDED Requirements

### Requirement: RLS activa y denegación por defecto en todo el esquema público
Toda tabla del esquema `public` SHALL tener RLS activada. Una tabla sin política que conceda
acceso a un rol SHALL negarle toda fila y toda escritura a ese rol.

#### Scenario: Ninguna tabla queda sin RLS
- **WHEN** se inspeccionan todas las tablas del esquema `public`
- **THEN** todas tienen RLS activada

#### Scenario: Consulta sin sesión no devuelve datos
- **WHEN** se consulta cualquier tabla del esquema `public` sin adjuntar el token de sesión
- **THEN** la consulta no devuelve ninguna fila

#### Scenario: Tabla sin política para el rol
- **WHEN** un usuario autenticado consulta una tabla para la cual ninguna política le concede acceso
- **THEN** la consulta no devuelve ninguna fila y las escrituras son rechazadas

### Requirement: Identidad del usuario validada por la base de datos
La base de datos SHALL derivar la identidad y el rol del usuario de un token de sesión cuya firma
valida ella misma contra la clave pública del proveedor de identidad, sin depender de que la
aplicación declare correctamente quién consulta.

#### Scenario: Token válido identifica al usuario
- **WHEN** se ejecuta una consulta con un token de sesión válido de un médico
- **THEN** las políticas de RLS reconocen a ese médico y su rol

#### Scenario: Token inválido se trata como no autenticado
- **WHEN** se ejecuta una consulta con un token expirado, mal formado o firmado con una clave no
  registrada
- **THEN** la consulta se trata como no autenticada y no devuelve ninguna fila

### Requirement: Historias clínicas solo para el médico a cargo
El contenido clínico (`historias_clinicas`, `atenciones`, `addendas`, `antecedentes`) SHALL ser
legible y escribible únicamente por el médico que tiene al paciente a su cargo con una asignación
vigente. Ningún otro rol, ni siquiera el administrativo, SHALL poder leer ni escribir ese
contenido.

#### Scenario: Médico a cargo lee la atención de su paciente
- **WHEN** un médico con asignación vigente sobre un paciente consulta las atenciones de ese paciente
- **THEN** recibe sus filas

#### Scenario: Médico sin asignación no ve la historia (negativo)
- **WHEN** un médico que no tiene a un paciente a su cargo consulta las atenciones, antecedentes o
  addendas de ese paciente
- **THEN** no recibe ninguna fila

#### Scenario: Administrativo no accede a contenido clínico (negativo)
- **WHEN** un usuario con rol `administrativo` consulta `atenciones`, `antecedentes`, `addendas` o
  `historias_clinicas`
- **THEN** no recibe ninguna fila

#### Scenario: Paciente no accede a historias clínicas (negativo)
- **WHEN** un usuario con rol `paciente` consulta `atenciones`, `antecedentes`, `addendas` o
  `historias_clinicas`, incluidas las de su propio registro
- **THEN** no recibe ninguna fila

#### Scenario: Enfermera no accede a contenido clínico (negativo)
- **WHEN** un usuario con rol `enfermera` consulta cualquiera de esas tablas
- **THEN** no recibe ninguna fila

#### Scenario: Médico no registra atenciones a nombre de otro (negativo)
- **WHEN** un médico intenta insertar una atención con el `medico_id` de otro médico, o de un
  paciente que no tiene a su cargo
- **THEN** la base de datos rechaza la inserción

### Requirement: El acceso a la historia expira con la asignación
El acceso de un médico a la historia de un paciente SHALL existir solo mientras una asignación
paciente-médico esté vigente, y SHALL perderse automáticamente al vencer.

#### Scenario: Asignación vencida (negativo)
- **WHEN** la única cita de un médico con un paciente fue atendida hace más de 6 meses y no existe
  asignación manual ni cita posterior
- **THEN** ese médico no recibe ninguna fila de la historia de ese paciente

#### Scenario: Nueva cita con otro médico no revive el acceso anterior (negativo)
- **WHEN** se confirma una cita nueva del paciente con un médico distinto
- **THEN** el nuevo médico obtiene acceso y el médico cuya asignación venció no lo recupera

### Requirement: Citas visibles según el rol
Las citas SHALL ser visibles para el paciente solo si son suyas, para el médico solo si son de su
agenda, y para el administrativo en su totalidad. La enfermera SHALL NO tener acceso a las citas.

#### Scenario: Paciente ve solo sus citas
- **WHEN** un paciente consulta `citas`
- **THEN** recibe únicamente las citas cuyo `paciente_id` es el suyo

#### Scenario: Paciente no ve citas ajenas (negativo)
- **WHEN** un paciente consulta una cita de otro paciente por su identificador
- **THEN** no recibe ninguna fila

#### Scenario: Médico ve solo su agenda (negativo)
- **WHEN** un médico consulta `citas`
- **THEN** no recibe citas de otros médicos

#### Scenario: Enfermera no ve citas (negativo)
- **WHEN** un usuario con rol `enfermera` consulta `citas`
- **THEN** no recibe ninguna fila

#### Scenario: Paciente solo reserva a su nombre y en el futuro (negativo)
- **WHEN** un paciente intenta insertar una cita con el `paciente_id` de otro, con `origen`
  distinto de `portal` o con `inicio` en el pasado
- **THEN** la base de datos rechaza la inserción

#### Scenario: Administrativo gestiona todas las citas
- **WHEN** un administrativo inserta, actualiza o consulta citas de cualquier paciente
- **THEN** la operación se permite

### Requirement: Datos de identidad visibles según el rol
Los datos demográficos de `pacientes` SHALL ser accesibles al propio paciente (lectura), al
administrativo (gestión) y al médico solo cuando tiene relación con ese paciente (cita en su
agenda o asignación vigente). `perfiles` SHALL ser legible por su propio titular y por el
administrativo. La enfermera SHALL NO acceder a `pacientes`.

#### Scenario: Paciente ve solo su registro
- **WHEN** un paciente consulta `pacientes`
- **THEN** recibe únicamente su propia fila

#### Scenario: Médico sin relación no ve datos del paciente (negativo)
- **WHEN** un médico consulta un paciente con el que no tiene cita ni asignación vigente
- **THEN** no recibe ninguna fila

#### Scenario: Enfermera no ve pacientes (negativo)
- **WHEN** un usuario con rol `enfermera` consulta `pacientes`
- **THEN** no recibe ninguna fila

#### Scenario: Un usuario no lee el perfil de otro (negativo)
- **WHEN** un usuario con rol `paciente`, `medico` o `enfermera` consulta `perfiles`
- **THEN** recibe únicamente su propia fila, salvo los datos públicos de nombre de los médicos
  necesarios para elegir o identificar al profesional

### Requirement: Catálogos y personal legibles, solo administrables por el administrativo
`especialidades`, `medicos`, `disponibilidades` y `cie10` SHALL ser legibles por cualquier usuario
autenticado, porque el paciente reserva, la enfermera identifica a su médico y el médico
diagnostica. Su escritura SHALL estar reservada al administrativo (y `cie10` solo a migraciones).

#### Scenario: Cualquier rol autenticado lee los catálogos
- **WHEN** un usuario autenticado, de cualquier rol, consulta `especialidades` o `medicos`
- **THEN** recibe sus filas

#### Scenario: Paciente no modifica catálogos (negativo)
- **WHEN** un paciente, médico o enfermera intenta insertar o modificar `especialidades`, `medicos`
  o `disponibilidades`
- **THEN** la base de datos rechaza la operación

#### Scenario: CIE-10 no se escribe desde la aplicación (negativo)
- **WHEN** cualquier rol autenticado intenta insertar o modificar `cie10`
- **THEN** la base de datos rechaza la operación

### Requirement: Turnos de enfermería acotados a la enfermera
Cada enfermera SHALL poder consultar únicamente sus propios turnos y el médico o especialidad con
el que trabaja. El administrativo SHALL poder gestionar todos los turnos.

#### Scenario: Enfermera ve solo sus turnos
- **WHEN** una enfermera consulta `turnos_enfermeria`
- **THEN** recibe únicamente sus propios turnos

#### Scenario: Enfermera no ve turnos ajenos (negativo)
- **WHEN** una enfermera consulta el turno de otra enfermera
- **THEN** no recibe ninguna fila

#### Scenario: Otros roles no ven turnos (negativo)
- **WHEN** un paciente o un médico consulta `turnos_enfermeria`
- **THEN** no recibe ninguna fila

### Requirement: Notificaciones visibles solo al administrativo, y cron con privilegio mínimo
`notificaciones` SHALL ser legible solo por el administrativo (para revisar fallidas). El proceso de
envío programado SHALL conectarse con un rol de base de datos dedicado cuyos privilegios se limitan
a `notificaciones` (lectura y escritura) y `citas` (solo lectura).

#### Scenario: Paciente, médico o enfermera no leen notificaciones (negativo)
- **WHEN** un usuario con rol `paciente`, `medico` o `enfermera` consulta `notificaciones`
- **THEN** no recibe ninguna fila

#### Scenario: El cron no accede a contenido clínico (negativo)
- **WHEN** el rol del proceso de envío intenta leer `atenciones`, `antecedentes`,
  `accesos_historia` o `historias_clinicas`
- **THEN** la base de datos rechaza la consulta por falta de privilegios

#### Scenario: El cron no modifica citas (negativo)
- **WHEN** el rol del proceso de envío intenta insertar, actualizar o eliminar filas de `citas`
- **THEN** la base de datos rechaza la operación

### Requirement: Auditoría de lectura de historias solo-agregar
`accesos_historia` SHALL aceptar el registro de accesos hechos por el médico autenticado como
actor, y SHALL NO permitir a ningún rol de usuario modificar ni eliminar registros existentes.
`auditoria` SHALL ser alimentada solo por la base de datos y consultable solo por el administrativo.

#### Scenario: Médico registra su propio acceso
- **WHEN** un médico inserta un registro de acceso con su propio perfil como actor
- **THEN** el registro se guarda

#### Scenario: Médico no registra accesos a nombre de otro (negativo)
- **WHEN** un médico inserta un registro de acceso con otro actor
- **THEN** la base de datos rechaza la inserción

#### Scenario: La auditoría no se altera (negativo)
- **WHEN** cualquier rol de usuario intenta actualizar o eliminar filas de `accesos_historia` o
  `auditoria`
- **THEN** la base de datos rechaza la operación

#### Scenario: Paciente, médico y enfermera no leen la auditoría de escritura (negativo)
- **WHEN** un usuario con rol `paciente`, `medico` o `enfermera` consulta `auditoria`
- **THEN** no recibe ninguna fila

#### Scenario: La auditoría de escritura no filtra contenido clínico al administrativo (negativo)
- **WHEN** se escribe o modifica una atención, addenda o antecedente y un administrativo consulta
  `auditoria`
- **THEN** el registro muestra quién, cuándo, qué acción y qué tabla y registro, pero
  `datos_antes` y `datos_despues` no contienen el contenido clínico

### Requirement: Bloqueo de escalada de privilegios
El rol y el estado activo de un perfil SHALL poder cambiarse únicamente por el administrativo o por
el proceso de sincronización de identidad. Cualquier otro intento SHALL dejar el perfil sin cambios
y, cuando el usuario tuviera permiso de actualización sobre su propia fila, SHALL ser rechazado con
un error de no autorizado: RLS no filtra por columna, así que este bloqueo no puede depender solo
de las políticas.

#### Scenario: Paciente intenta ascender su rol (negativo)
- **WHEN** un paciente ejecuta un `UPDATE` de `perfiles.rol` sobre su propia fila
- **THEN** el rol no cambia: la operación se rechaza o no afecta ninguna fila

#### Scenario: Médico o enfermera intenta cambiar un rol (negativo)
- **WHEN** un usuario con rol `medico` o `enfermera` ejecuta un `UPDATE` de `perfiles.rol`
- **THEN** el rol no cambia: la operación se rechaza o no afecta ninguna fila

#### Scenario: El bloqueo se mantiene aunque se conceda actualización sobre la propia fila (negativo)
- **WHEN** a un paciente, médico o enfermera se le concede permiso y política de actualización sobre
  su propia fila (por ejemplo, por un futuro flujo de edición de perfil) y ejecuta un `UPDATE` de
  `perfiles.rol` o `perfiles.activo`
- **THEN** la operación falla con error de no autorizado (`42501`)

#### Scenario: Administrativo cambia el rol de un usuario
- **WHEN** un administrativo actualiza `perfiles.rol`
- **THEN** el cambio se aplica

#### Scenario: El proceso de sincronización de identidad cambia el rol
- **WHEN** el rol de base de datos de sincronización de identidad actualiza `perfiles.rol` a
  partir de un cambio notificado por el proveedor de identidad
- **THEN** el cambio se aplica, aunque esa conexión no lleve token de sesión de usuario

### Requirement: Rol de sincronización de identidad acotado
El proceso que sincroniza usuarios desde el proveedor de identidad SHALL conectarse con un rol de
base de datos dedicado cuyos privilegios se limitan a `perfiles`.

#### Scenario: La sincronización escribe perfiles
- **WHEN** el rol de sincronización inserta o actualiza una fila de `perfiles`
- **THEN** la operación se permite

#### Scenario: La sincronización no toca datos clínicos ni de agenda (negativo)
- **WHEN** el rol de sincronización intenta leer o escribir `atenciones`, `antecedentes`, `citas` o
  `pacientes`
- **THEN** la base de datos rechaza la operación por falta de privilegios
