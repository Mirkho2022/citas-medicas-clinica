# Spec Delta

## Purpose

Que quede un rastro verificable de quién vio qué historia clínica y cuándo, escrito en la misma operación que la lectura para
que no pueda omitirse, y que el administrativo pueda revisarlo sin acceder nunca al contenido clínico.

## ADDED Requirements

### Requirement: Toda lectura de contenido clínico se registra antes de entregarse
Cada vez que el sistema entregue a un médico contenido clínico de un paciente (la historia, una atención o un adjunto), SHALL
registrar el acceso con el médico que lo hizo, el paciente, el tipo de recurso (historia, atención o adjunto), el
identificador de la atención o del adjunto cuando corresponda y la hora, en la misma transacción de base de datos que la
lectura. Si el registro no puede escribirse, el contenido SHALL NO entregarse.

#### Scenario: Apertura de la historia
- **WHEN** el médico a cargo abre la historia de su paciente
- **THEN** queda un registro de acceso de tipo historia con su identificador, el del paciente y la hora, y se entrega el contenido

#### Scenario: Apertura de una atención
- **WHEN** el médico abre el detalle de una atención
- **THEN** queda un registro de acceso de tipo atención con el identificador de esa atención

#### Scenario: El registro falla y no se entrega nada (negativo)
- **WHEN** el registro del acceso es rechazado (por ejemplo, porque el médico ya no tiene al paciente a cargo)
- **THEN** la operación completa se revierte y no se devuelve ningún contenido clínico

#### Scenario: Registro a nombre de otro (negativo)
- **WHEN** una solicitud intenta registrar un acceso a nombre de otro médico o de un paciente que no tiene a cargo
- **THEN** la base de datos lo rechaza

#### Scenario: Cada solicitud cuenta
- **WHEN** el médico recarga la historia o pide más atenciones de la misma
- **THEN** cada solicitud que devuelve contenido clínico deja su propio registro

### Requirement: Los registros de acceso no se alteran
Los registros de acceso SHALL ser solo-agregar: ningún usuario, ni siquiera el dueño de la base de datos, SHALL poder
modificarlos ni eliminarlos.

#### Scenario: Modificar o eliminar (negativo)
- **WHEN** cualquier usuario intenta actualizar o eliminar un registro de acceso
- **THEN** la operación se rechaza

### Requirement: El administrativo revisa los accesos sin ver contenido
El sistema SHALL permitir al administrativo consultar los registros de acceso (médico, paciente, tipo de recurso y hora en
`America/Lima`) filtrados por paciente, por médico y por rango de fechas, con paginación. La consulta SHALL NO mostrar ni
permitir llegar a contenido clínico. Ningún otro rol SHALL poder leerlos.

#### Scenario: Revisión por paciente
- **WHEN** el administrativo busca los accesos a la historia de un paciente por su documento
- **THEN** ve la lista de médicos que accedieron, el tipo de acceso y la hora, y ningún dato clínico

#### Scenario: Médico (negativo)
- **WHEN** un médico intenta leer los registros de acceso, incluidos los de sus propios pacientes
- **THEN** no recibe ninguna fila

#### Scenario: Paciente y enfermera (negativo)
- **WHEN** un paciente o una enfermera intentan leer los registros de acceso
- **THEN** no reciben ninguna fila

#### Scenario: Hora de Lima
- **WHEN** se muestra un acceso ocurrido a las 19:30 de Lima
- **THEN** la pantalla muestra `19:30` con la fecha de Lima

### Requirement: Un único punto de acceso a las tablas clínicas
Todo el código de la aplicación que lea o escriba contenido clínico SHALL hacerlo a través de un único módulo de acceso a
datos clínicos, y una verificación automática SHALL fallar si cualquier otro archivo de la aplicación consulta directamente
esas tablas.

#### Scenario: Consulta clínica fuera del módulo
- **WHEN** un archivo de la aplicación ajeno al módulo contiene una consulta a atenciones, addendas, antecedentes, historias
  clínicas o adjuntos
- **THEN** la verificación automática falla y señala el archivo

#### Scenario: Cambio legítimo
- **WHEN** todo el acceso clínico se concentra en el módulo
- **THEN** la verificación automática pasa

### Requirement: La auditoría de escritura no copia contenido clínico
Los registros de escritura sobre atenciones, addendas, antecedentes y adjuntos SHALL contener quién, cuándo, qué acción y el
identificador del registro, sin copiar su contenido, de modo que el administrativo que lee la auditoría no acceda a contenido
clínico por esa vía.

#### Scenario: Firma de una atención
- **WHEN** un médico firma una atención
- **THEN** la auditoría registra al actor, la acción y el identificador, sin motivo, anamnesis, diagnósticos ni plan

#### Scenario: Administrativo lee la auditoría
- **WHEN** el administrativo consulta la auditoría de escritura tras actividad clínica
- **THEN** no encuentra ningún texto clínico en ella

#### Scenario: Médico, paciente y enfermera (negativo)
- **WHEN** un médico, un paciente o una enfermera consultan la auditoría de escritura
- **THEN** no reciben ninguna fila
