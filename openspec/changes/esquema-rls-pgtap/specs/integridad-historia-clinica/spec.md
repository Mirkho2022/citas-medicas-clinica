# Spec Delta

## Purpose

Garantizar desde la estructura y las reglas de la base de datos que la historia clínica sea un
registro completo, inalterable una vez firmado y trazable, y que el acceso del médico a cada
paciente tenga una vigencia definida.

## ADDED Requirements

### Requirement: Atención clínica sin campos vacíos
La base de datos SHALL rechazar toda atención cuyo motivo de consulta, anamnesis, examen físico o
plan de tratamiento esté vacío o contenga solo espacios, o que no incluya al menos un diagnóstico.

#### Scenario: Campo en blanco
- **WHEN** se inserta una atención con el motivo de consulta compuesto solo de espacios
- **THEN** la base de datos rechaza la inserción

#### Scenario: Sin diagnósticos
- **WHEN** se inserta una atención con la lista de diagnósticos vacía
- **THEN** la base de datos rechaza la inserción

#### Scenario: Atención completa
- **WHEN** un médico a cargo inserta una atención con todos los campos con contenido y al menos un
  diagnóstico
- **THEN** la atención se guarda

### Requirement: Atención firmada inmutable y no eliminable
Una atención con `firmada_en` informado SHALL NO poder modificarse. Ninguna atención, firmada o
no, SHALL poder eliminarse. La corrección posterior a la firma SHALL hacerse mediante una addenda.

#### Scenario: Modificar una atención firmada (negativo)
- **WHEN** cualquier usuario intenta actualizar una atención con `firmada_en` informado
- **THEN** la base de datos rechaza la operación con el mensaje `Atención firmada: use una addenda
  para corregir`

#### Scenario: Eliminar una atención (negativo)
- **WHEN** cualquier usuario intenta eliminar una atención
- **THEN** la base de datos rechaza la operación con el mensaje `Las atenciones clínicas no se
  eliminan`

#### Scenario: Editar una atención no firmada
- **WHEN** el médico autor actualiza una atención que aún no está firmada
- **THEN** el cambio se aplica

### Requirement: Addendas como corrección con autoría
Una addenda SHALL registrar su texto (no vacío), su médico autor y su fecha, y SHALL NO alterar la
atención original.

#### Scenario: Addenda sobre una atención firmada
- **WHEN** el médico a cargo inserta una addenda sobre una atención firmada
- **THEN** la addenda se guarda con autor y fecha, y el texto original de la atención no cambia

#### Scenario: Addenda vacía
- **WHEN** se inserta una addenda con el texto vacío o solo espacios
- **THEN** la base de datos rechaza la inserción

### Requirement: Datos demográficos fuera de la atención
La tabla de atenciones SHALL NO contener columnas de datos demográficos del paciente (nombres,
apellidos, documento, fecha de nacimiento, contacto), de modo que ninguna ruta de código pueda
modificarlos desde la historia clínica.

#### Scenario: La atención no tiene columnas demográficas
- **WHEN** se inspeccionan las columnas de `atenciones`
- **THEN** ninguna corresponde a datos demográficos del paciente; solo hay referencias por
  identificador

### Requirement: Una carpeta de historia por paciente
Cada paciente SHALL tener exactamente una historia clínica, creada automáticamente al registrarlo,
con un número correlativo único y visible.

#### Scenario: Registro de un paciente crea su historia
- **WHEN** se registra un paciente
- **THEN** existe exactamente una historia clínica para él, con número único

#### Scenario: Segunda historia para el mismo paciente
- **WHEN** se intenta crear una segunda historia clínica para un paciente que ya tiene una
- **THEN** la base de datos rechaza la inserción

### Requirement: Antecedentes que no se sobrescriben ni se eliminan
Un antecedente SHALL conservar su tipo y descripción originales. Cuando deja de aplicar, SHALL
marcarse como no vigente y, si corresponde, registrarse uno nuevo con el estado actualizado. Ningún
rol de usuario SHALL poder eliminarlo.

#### Scenario: Antecedente resuelto
- **WHEN** el médico a cargo marca un antecedente como no vigente
- **THEN** el antecedente permanece con su descripción original y `vigente = false`

#### Scenario: Reescribir la descripción (negativo)
- **WHEN** se intenta modificar el tipo o la descripción de un antecedente existente
- **THEN** la base de datos rechaza la operación

#### Scenario: Eliminar un antecedente (negativo)
- **WHEN** un médico intenta eliminar un antecedente
- **THEN** la base de datos rechaza la operación

### Requirement: Asignación automática paciente-médico al confirmar una cita
Cuando una cita entra por primera vez al estado `confirmada` o `atendida`, la base de datos SHALL
crear una asignación paciente-médico vigente desde ese día hasta 6 meses después del inicio de la
cita ([ADR-0016](../../../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md)). No SHALL
duplicarla en transiciones posteriores ni revocarla al cancelar la cita.

#### Scenario: Primera confirmación otorga acceso
- **WHEN** una cita pasa de `reservada` a `confirmada`
- **THEN** existe una asignación del paciente a ese médico con `vigente_hasta` seis meses después
  del inicio de la cita

#### Scenario: Confirmada y luego atendida no duplica
- **WHEN** una cita pasa de `confirmada` a `atendida`
- **THEN** no se crea una segunda asignación para esa cita

#### Scenario: Cancelar no revoca el acceso ya otorgado
- **WHEN** una cita confirmada se cancela
- **THEN** la asignación ya otorgada permanece hasta su vencimiento natural

#### Scenario: Citas reservadas no otorgan acceso (negativo)
- **WHEN** existe una cita solo en estado `reservada`
- **THEN** no existe asignación para ese médico y paciente por esa cita

### Requirement: Asignaciones solo-agregar
Las filas de asignación paciente-médico SHALL tratarse como append-only: un cambio se expresa
insertando una fila nueva, no editando una existente, salvo por el administrativo en la gestión
manual.

#### Scenario: Un médico no edita sus propias asignaciones (negativo)
- **WHEN** un médico intenta insertar, modificar o eliminar una fila de asignación
- **THEN** la base de datos rechaza la operación

#### Scenario: El administrativo asigna manualmente
- **WHEN** un administrativo inserta una asignación manual con o sin fecha de vencimiento
- **THEN** la asignación se guarda y concede acceso al médico mientras esté vigente
