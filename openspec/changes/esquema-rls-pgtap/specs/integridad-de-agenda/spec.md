# Spec Delta

## Purpose

Hacer imposible, en el motor de base de datos y bajo concurrencia real, que la agenda quede en un
estado inválido: doble reserva, cancelaciones fuera de ventana o rangos incoherentes, sin depender
de validaciones de la aplicación.

## ADDED Requirements

### Requirement: Un médico no tiene dos citas vigentes solapadas
La base de datos SHALL rechazar toda cita en estado `reservada` o `confirmada` cuyo rango de tiempo
se solape con otra cita vigente del mismo médico. El rechazo SHALL señalarse con el código
`23P01` (violación de exclusión), para que la aplicación lo traduzca al mensaje exacto
`Registro de cita ya agendado`.

#### Scenario: Segunda cita en el mismo horario
- **WHEN** se inserta una cita vigente para un médico en un horario que se solapa con otra cita
  vigente de ese mismo médico
- **THEN** la base de datos rechaza la inserción con el código `23P01`

#### Scenario: Reservas simultáneas del mismo horario
- **WHEN** dos o más transacciones concurrentes intentan reservar el mismo horario del mismo médico
- **THEN** exactamente una se confirma y las demás fallan con el código `23P01` (violación de exclusión) o `40P01`
  (deadlock detectado: el motor puede resolver el choque abortando una transacción), sin dejar ninguna cita

#### Scenario: Una cita cancelada libera el horario
- **WHEN** la cita vigente de un horario pasa a `cancelada` y luego se inserta otra cita en ese
  mismo horario con el mismo médico
- **THEN** la nueva cita se acepta

#### Scenario: Citas contiguas no se solapan
- **WHEN** una cita termina exactamente a la hora en que empieza otra del mismo médico
- **THEN** ambas se aceptan

### Requirement: Un paciente no tiene dos citas vigentes solapadas
La base de datos SHALL rechazar toda cita vigente cuyo rango se solape con otra cita vigente del
mismo paciente, aunque sea con médicos distintos.

#### Scenario: Mismo paciente, dos médicos, mismo horario
- **WHEN** se inserta una cita vigente para un paciente que ya tiene otra cita vigente solapada con
  un médico distinto
- **THEN** la base de datos rechaza la inserción con el código `23P01`

### Requirement: Rangos de tiempo coherentes
Toda cita SHALL terminar después de empezar, y toda disponibilidad SHALL tener hora de fin
posterior a la de inicio, día de la semana entre 0 y 6 y duración de slot positiva.

#### Scenario: Cita con fin anterior al inicio
- **WHEN** se inserta una cita con `fin` menor o igual a `inicio`
- **THEN** la base de datos rechaza la inserción

#### Scenario: Disponibilidad incoherente
- **WHEN** se inserta una disponibilidad con `hora_fin` menor o igual a `hora_inicio`, un
  `dia_semana` fuera de 0-6 o una duración de slot menor o igual a cero
- **THEN** la base de datos rechaza la inserción

### Requirement: Los bloqueos de agenda de un médico no se solapan
La base de datos SHALL rechazar un bloqueo de agenda cuyo rango se solape con otro bloqueo del
mismo médico.

#### Scenario: Bloqueos solapados del mismo médico
- **WHEN** se inserta un bloqueo para un médico cuyo rango se solapa con un bloqueo existente del
  mismo médico
- **THEN** la base de datos rechaza la inserción

#### Scenario: Bloqueos de médicos distintos
- **WHEN** se insertan dos bloqueos con el mismo rango para médicos distintos
- **THEN** ambos se aceptan

### Requirement: Ventana de cancelación de 1 hora para todos los roles
La base de datos SHALL rechazar la cancelación de una cita cuando falta menos de 1 hora para su
inicio, sin importar el rol de quien cancela, incluido el administrativo
([ADR-0012](../../../../../docs/adrs/0012-alcance-de-la-ventana-de-cancelacion.md)).

#### Scenario: Cancelación con más de una hora de anticipación
- **WHEN** se cancela una cita que empieza dentro de 2 horas
- **THEN** la cancelación se acepta

#### Scenario: Cancelación tardía por un paciente (negativo)
- **WHEN** un paciente cancela una cita que empieza dentro de 30 minutos
- **THEN** la base de datos rechaza la cancelación con el mensaje `No es posible cancelar con menos
  de 1 hora de anticipación`

#### Scenario: Cancelación tardía por el administrativo (negativo)
- **WHEN** un administrativo cancela una cita que empieza dentro de 30 minutos
- **THEN** la base de datos rechaza la cancelación con el mismo mensaje

### Requirement: Excepción de la ventana por baja médica
La ventana de 1 hora NO SHALL aplicarse cuando el rango de la cita está cubierto por un bloqueo de
agenda vigente del mismo médico, porque la cancelación forma parte de una reasignación por baja o
emergencia ([ADR-0011](../../../../../docs/adrs/0011-reasignacion-de-citas-por-baja-medica.md)).

#### Scenario: Cancelación dentro de la hora con bloqueo que cubre la cita
- **WHEN** se cancela una cita que empieza dentro de 30 minutos y existe un bloqueo de agenda del
  mismo médico que cubre su rango
- **THEN** la cancelación se acepta

#### Scenario: La excepción no depende del rol de quien cancela
- **WHEN** un paciente cancela, dentro de la hora previa, una cita cuyo rango está cubierto por un
  bloqueo de agenda del mismo médico que ese paciente no puede consultar
- **THEN** la cancelación se acepta, porque la excepción depende de los datos y no del rol

#### Scenario: Bloqueo de otro médico no habilita la excepción (negativo)
- **WHEN** se cancela una cita que empieza dentro de 30 minutos y el único bloqueo que cubre ese
  rango es de otro médico
- **THEN** la base de datos rechaza la cancelación

### Requirement: Trazabilidad de la cancelación
Al cancelarse una cita, la base de datos SHALL registrar el instante de la cancelación y el perfil
de quien la realizó.

#### Scenario: Cancelación registrada
- **WHEN** un usuario cancela una cita dentro de la ventana permitida
- **THEN** `cancelada_en` queda con el instante actual y `cancelada_por` con el perfil de ese usuario
