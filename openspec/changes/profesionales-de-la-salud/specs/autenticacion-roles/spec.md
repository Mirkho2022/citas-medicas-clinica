# Spec Delta

> Nombres: sujetos a ADR-0030; si se rechaza, léase `medico`. Los tres requisitos de abajo reemplazan por completo a los de
> `openspec/specs/autenticacion-roles/spec.md`. «Autorregistro restringido a rol paciente» no cambia. Al archivar el change, la
> sección «Purpose» de la especificación vigente («administrativo, médico, enfermera, paciente») se corrige a mano a
> «administrativo, profesional, enfermera, paciente» (un delta no puede modificarla).

## MODIFIED Requirements

### Requirement: Un único rol por usuario
Todo usuario autenticado SHALL tener asignado exactamente uno de los cuatro roles del sistema
(`administrativo`, `profesional`, `enfermera`, `paciente`), disponible en los claims de su sesión. El rol `profesional`
reemplaza al rol `medico` y reúne a los médicos y a los demás profesionales de la salud colegiados; la profesión
concreta de cada profesional NO SHALL formar parte del rol ni de los claims de la sesión.

#### Scenario: Rol disponible en la sesión
- **WHEN** un usuario autenticado realiza cualquier solicitud al sistema
- **THEN** los claims de su sesión incluyen exactamente uno de los cuatro roles definidos

#### Scenario: La profesión no viaja en la sesión
- **WHEN** un profesional de la salud, sea cual sea su profesión, inicia sesión
- **THEN** su rol en la sesión es `profesional` y la sesión no incluye ningún dato de profesión

### Requirement: Personal creado solo por invitación
Las cuentas con rol `administrativo`, `profesional` o `enfermera` SHALL crearse únicamente mediante
invitación. No SHALL existir ninguna ruta de autorregistro capaz de producir esos roles.

#### Scenario: No existe autorregistro de personal
- **WHEN** una persona intenta autorregistrarse solicitando rol `administrativo`, `profesional` o
  `enfermera`
- **THEN** el sistema no ofrece ese camino; la única forma de obtener esos roles es una
  invitación previa

#### Scenario: Invitación crea la cuenta con el rol correcto
- **WHEN** se invita a una persona con rol `profesional` (o `administrativo`/`enfermera`)
- **THEN** al aceptar la invitación, su cuenta queda creada con ese rol exacto

#### Scenario: La invitación no fija la profesión
- **WHEN** se invita a una persona con rol `profesional`
- **THEN** la invitación no lleva ninguna profesión y la profesión se registra después, solo por el administrativo

### Requirement: MFA obligatorio para personal
Todo usuario con rol `administrativo`, `profesional` o `enfermera` SHALL tener autenticación de
múltiple factor (MFA) activa para acceder a su área. El rol `paciente` no SHALL estar obligado a
configurar MFA.

#### Scenario: Personal sin MFA es dirigido a configurarlo
- **WHEN** un usuario con rol `administrativo`, `profesional` o `enfermera` inicia sesión sin tener
  MFA configurado
- **THEN** el sistema lo dirige a configurar MFA antes de darle acceso a su área

#### Scenario: Paciente no requiere MFA
- **WHEN** un usuario con rol `paciente` inicia sesión
- **THEN** el sistema no le exige configurar MFA
