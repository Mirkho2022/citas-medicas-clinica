# Spec Delta

## Purpose

Mantener en la base de datos una identidad interna por cada usuario de Clerk, con el rol fijado
solo por vías autorizadas, y registrar a los pacientes con documentos peruanos válidos y únicos.

## ADDED Requirements

### Requirement: Perfil interno por cada usuario de Clerk
Por cada usuario creado en Clerk SHALL existir exactamente un perfil interno, identificado por el
identificador de Clerk, con su rol, nombres y apellidos. El autorregistro público SHALL producir un
perfil con rol `paciente`; la invitación de personal SHALL producir un perfil con el rol invitado.

#### Scenario: Autorregistro crea perfil de paciente
- **WHEN** Clerk notifica la creación de un usuario por registro público
- **THEN** existe un perfil con `rol = paciente` para ese identificador de Clerk

#### Scenario: Invitación crea perfil con el rol invitado
- **WHEN** Clerk notifica la creación de un usuario aceptado por invitación con rol `medico`
- **THEN** existe un perfil con `rol = medico` para ese identificador de Clerk

#### Scenario: Dos perfiles para el mismo usuario (negativo)
- **WHEN** se intenta crear un segundo perfil con el mismo identificador de Clerk
- **THEN** la base de datos rechaza la inserción

### Requirement: Sincronización idempotente y reintentable
El procesamiento de las notificaciones de Clerk (`user.created`, `user.updated`) SHALL ser
idempotente: recibir el mismo evento más de una vez no SHALL duplicar perfiles ni alterar su
contenido. Si la sincronización falla, la respuesta al proveedor SHALL permitir el reintento.

#### Scenario: Evento repetido
- **WHEN** Clerk entrega dos veces el mismo evento `user.created`
- **THEN** sigue existiendo un único perfil con los mismos datos

#### Scenario: Actualización de datos
- **WHEN** Clerk notifica un `user.updated` con nombres o rol modificados
- **THEN** el perfil refleja los nuevos valores

#### Scenario: Fallo de la base de datos
- **WHEN** la escritura del perfil falla durante el procesamiento de un evento
- **THEN** el webhook responde con un error que provoca el reintento del evento

#### Scenario: Firma inválida
- **WHEN** llega una solicitud al webhook con una firma inválida
- **THEN** se rechaza sin tocar la base de datos

### Requirement: El rol del perfil no lo fija el cliente
El rol de un perfil SHALL provenir únicamente de los metadatos controlados por el servidor del
proveedor de identidad o de una acción del administrativo, nunca de datos enviados por el cliente.

#### Scenario: Cliente intenta enviar un rol en el registro (negativo)
- **WHEN** un registro público incluye un valor de rol distinto de `paciente`
- **THEN** el perfil resultante tiene `rol = paciente`

### Requirement: Documento de identidad peruano válido
Todo paciente SHALL identificarse con un tipo de documento `DNI` o `CE` y un número válido para
ese tipo: 8 dígitos numéricos para DNI; 9 a 12 caracteres alfanuméricos para Carné de Extranjería.

#### Scenario: DNI válido
- **WHEN** se registra un paciente con tipo `DNI` y número de 8 dígitos
- **THEN** el paciente se guarda

#### Scenario: DNI con letras o longitud incorrecta (negativo)
- **WHEN** se registra un paciente con tipo `DNI` y un número con letras, o con menos o más de 8
  dígitos
- **THEN** la base de datos rechaza el registro

#### Scenario: Carné de Extranjería válido
- **WHEN** se registra un paciente con tipo `CE` y un número alfanumérico de 9 a 12 caracteres
- **THEN** el paciente se guarda

#### Scenario: Carné de Extranjería fuera de formato (negativo)
- **WHEN** se registra un paciente con tipo `CE` y un número de menos de 9 o más de 12 caracteres,
  o con símbolos
- **THEN** la base de datos rechaza el registro

### Requirement: Un documento identifica a un solo paciente
No SHALL existir dos pacientes con el mismo tipo y número de documento.

#### Scenario: Documento duplicado (negativo)
- **WHEN** se registra un paciente con un tipo y número de documento ya registrados
- **THEN** la base de datos rechaza el registro y no se crea una segunda fila

### Requirement: Paciente sin cuenta de portal
Un paciente SHALL poder existir sin perfil asociado (registrado por el administrativo), y un perfil
SHALL asociarse como máximo a un paciente.

#### Scenario: Paciente registrado por el administrativo
- **WHEN** el administrativo registra un paciente sin cuenta de portal
- **THEN** el paciente se guarda con `perfil_id` nulo

#### Scenario: Dos pacientes para un mismo perfil (negativo)
- **WHEN** se intenta asociar un perfil a un segundo paciente
- **THEN** la base de datos rechaza la operación

### Requirement: Un perfil de personal por profesional
Cada médico y cada enfermera SHALL corresponder a exactamente un perfil, y un perfil SHALL no
asociarse a más de un médico ni a más de una enfermera. Un médico SHALL tener un número de
colegiatura único.

#### Scenario: Colegiatura duplicada (negativo)
- **WHEN** se registra un médico con un número de colegiatura ya existente
- **THEN** la base de datos rechaza el registro

#### Scenario: Perfil asociado a dos médicos (negativo)
- **WHEN** se intenta asociar un mismo perfil a un segundo médico
- **THEN** la base de datos rechaza la operación
