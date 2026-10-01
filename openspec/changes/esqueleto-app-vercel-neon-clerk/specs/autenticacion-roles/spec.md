# Spec Delta

## Purpose

Autenticar a cada usuario del sistema y reconocerle exactamente uno de los cuatro roles de
aplicación (administrativo, médico, enfermera, paciente), como base sobre la que se apoya todo
control de acceso posterior del sistema.

## ADDED Requirements

### Requirement: Inicio de sesión
El sistema SHALL permitir a un usuario registrado autenticarse mediante Clerk y establecer una
sesión.

#### Scenario: Inicio de sesión exitoso
- **WHEN** un usuario con credenciales válidas inicia sesión
- **THEN** el sistema establece una sesión y lo dirige al área correspondiente a su rol

#### Scenario: Credenciales inválidas
- **WHEN** un usuario intenta iniciar sesión con credenciales inválidas
- **THEN** el sistema rechaza el intento y no establece sesión

### Requirement: Un único rol por usuario
Todo usuario autenticado SHALL tener asignado exactamente uno de los cuatro roles del sistema
(`administrativo`, `medico`, `enfermera`, `paciente`), disponible en los claims de su sesión.

#### Scenario: Rol disponible en la sesión
- **WHEN** un usuario autenticado realiza cualquier solicitud al sistema
- **THEN** los claims de su sesión incluyen exactamente uno de los cuatro roles definidos

### Requirement: Autorregistro restringido a rol paciente
El registro público SHALL producir siempre `rol = paciente`, sin importar qué valor envíe el
cliente. La asignación del rol ocurre del lado del servidor, nunca a partir de un dato que el
cliente controle.

#### Scenario: Registro público asigna rol paciente
- **WHEN** una persona completa el registro público
- **THEN** su cuenta queda creada con `rol = paciente`

#### Scenario: Intento de manipular el rol en el registro
- **WHEN** una solicitud de registro público incluye un valor de rol distinto de `paciente`
- **THEN** el sistema ignora ese valor y asigna `rol = paciente` de todas formas

### Requirement: Personal creado solo por invitación
Las cuentas con rol `administrativo`, `medico` o `enfermera` SHALL crearse únicamente mediante
invitación. No SHALL existir ninguna ruta de autorregistro capaz de producir esos roles.

#### Scenario: No existe autorregistro de personal
- **WHEN** una persona intenta autorregistrarse solicitando rol `administrativo`, `medico` o
  `enfermera`
- **THEN** el sistema no ofrece ese camino; la única forma de obtener esos roles es una
  invitación previa

#### Scenario: Invitación crea la cuenta con el rol correcto
- **WHEN** se invita a una persona con rol `medico` (o `administrativo`/`enfermera`)
- **THEN** al aceptar la invitación, su cuenta queda creada con ese rol exacto

### Requirement: MFA obligatorio para personal
Todo usuario con rol `administrativo`, `medico` o `enfermera` SHALL tener autenticación de
múltiple factor (MFA) activa para acceder a su área. El rol `paciente` no SHALL estar obligado a
configurar MFA.

#### Scenario: Personal sin MFA es dirigido a configurarlo
- **WHEN** un usuario con rol `administrativo`, `medico` o `enfermera` inicia sesión sin tener
  MFA configurado
- **THEN** el sistema lo dirige a configurar MFA antes de darle acceso a su área

#### Scenario: Paciente no requiere MFA
- **WHEN** un usuario con rol `paciente` inicia sesión
- **THEN** el sistema no le exige configurar MFA

### Requirement: Acceso bloqueado sin autenticación
Un usuario no autenticado no SHALL poder acceder a ninguna área protegida de la aplicación.

#### Scenario: Acceso denegado sin sesión
- **WHEN** un usuario sin sesión activa intenta acceder a un área protegida
- **THEN** el sistema lo redirige a iniciar sesión y no expone contenido de esa área

### Requirement: Revocación de acceso
El sistema SHALL permitir revocar el acceso de un usuario, invalidando su sesión activa e
impidiendo que vuelva a autenticarse mientras la revocación esté vigente.

#### Scenario: Revocación invalida la sesión activa
- **WHEN** se revoca el acceso de un usuario con sesión activa
- **THEN** esa sesión deja de ser válida y sus siguientes solicitudes son tratadas como no
  autenticadas

#### Scenario: Usuario revocado no puede volver a iniciar sesión
- **WHEN** un usuario cuyo acceso fue revocado intenta autenticarse de nuevo
- **THEN** el sistema rechaza el intento
