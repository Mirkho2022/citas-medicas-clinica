# Spec Delta

## Purpose

Permitir que el administrativo conceda acceso clínico a un médico en casos especiales (interconsulta, cobertura, médico de
cabecera) de forma trazable y sin posibilidad de editar o suplantar las asignaciones automáticas que nacen de las citas.

## ADDED Requirements

### Requirement: El administrativo asigna manualmente un paciente a un médico
El sistema SHALL permitir al administrativo registrar una asignación manual de un paciente a un médico activo, con un
motivo obligatorio y una fecha de vencimiento opcional (sin vencimiento significa acceso indefinido). Mientras la
asignación esté vigente, el médico SHALL tener ese paciente a cargo. El administrativo SHALL NO obtener acceso a ningún
contenido clínico por asignar.

#### Scenario: Asignación con vencimiento
- **WHEN** el administrativo asigna un paciente a un médico activo con motivo y una fecha de vencimiento futura
- **THEN** la asignación queda registrada y el médico ve al paciente en su lista hasta esa fecha inclusive

#### Scenario: Asignación sin vencimiento
- **WHEN** el administrativo asigna a un médico de cabecera sin fecha de vencimiento
- **THEN** el médico mantiene el acceso hasta que la dirección clínica decida no renovarlo con una asignación posterior

#### Scenario: Motivo vacío (negativo)
- **WHEN** el administrativo intenta asignar sin motivo, o con un motivo de solo espacios
- **THEN** la asignación se rechaza y no se crea ninguna fila

#### Scenario: Vencimiento anterior a hoy (negativo)
- **WHEN** el administrativo indica una fecha de vencimiento anterior a la de hoy en Lima
- **THEN** la asignación se rechaza con un mensaje en español

#### Scenario: Médico dado de baja
- **WHEN** se asigna un paciente a un médico que no está activo
- **THEN** la asignación no concede acceso mientras el médico siga inactivo

#### Scenario: El administrativo no ve contenido clínico
- **WHEN** el administrativo termina de asignar un paciente
- **THEN** sigue sin poder leer atenciones, antecedentes, addendas ni adjuntos de ese paciente

### Requirement: Las asignaciones automáticas no se pueden suplantar
Una asignación manual SHALL NO poder presentarse como asignación automática de una cita: un motivo que empiece por `cita:`
SHALL ser rechazado por la base de datos aunque la aplicación fallara en validarlo.

#### Scenario: Motivo con prefijo reservado (negativo)
- **WHEN** el administrativo intenta insertar una asignación con motivo `cita:` seguido de cualquier texto
- **THEN** la base de datos rechaza la inserción

#### Scenario: La asignación automática por cita sigue funcionando
- **WHEN** una cita pasa por primera vez a confirmada
- **THEN** se crea la asignación automática de esa cita sin intervención del administrativo

### Requirement: Las asignaciones son solo-agregar y trazables
Las asignaciones SHALL NO poder editarse ni eliminarse; un cambio se expresa con una asignación nueva y el acceso concedido
se deja vencer. Cada asignación manual SHALL quedar en la auditoría de escritura con su autor y la hora.

#### Scenario: Editar o eliminar (negativo)
- **WHEN** cualquier rol de usuario intenta modificar o eliminar una asignación existente
- **THEN** la operación se rechaza

#### Scenario: Rastro de quién concedió el acceso
- **WHEN** el administrativo registra una asignación manual
- **THEN** la auditoría de escritura registra quién la creó, cuándo y qué paciente y médico involucra, sin contenido clínico

### Requirement: Quién puede ver y crear asignaciones
Solo el administrativo SHALL poder crear asignaciones y consultarlas todas; un médico SHALL poder consultar únicamente las
suyas; el paciente y la enfermera SHALL NO poder consultarlas ni crearlas.

#### Scenario: Médico crea una asignación (negativo)
- **WHEN** un médico intenta asignarse un paciente a sí mismo o a otro médico
- **THEN** la base de datos rechaza la operación

#### Scenario: Médico lee asignaciones ajenas (negativo)
- **WHEN** un médico consulta las asignaciones de otro médico
- **THEN** no recibe ninguna fila

#### Scenario: Paciente y enfermera (negativo)
- **WHEN** un paciente o una enfermera consultan o intentan crear asignaciones
- **THEN** no reciben ninguna fila y las inserciones se rechazan
