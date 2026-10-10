# Spec Delta

## Purpose

Que el médico registre y consulte en tiempo real los antecedentes del paciente sin perder nunca lo ya escrito, y que la
clínica pueda medir de forma objetiva cuántas historias están digitalizadas sin que esa medición exponga contenido clínico.

## ADDED Requirements

### Requirement: Registro y consulta de antecedentes por el médico a cargo
El sistema SHALL permitir al médico que tiene al paciente a cargo registrar antecedentes de los tipos personal patológico,
quirúrgico, alérgico, familiar y hábito nocivo, cada uno con una descripción con contenido real, y consultar los vigentes
agrupados por tipo. El registro SHALL quedar a nombre del médico autenticado y con la hora fijada por el servidor.

#### Scenario: Registrar un antecedente
- **WHEN** el médico a cargo registra una alergia con su descripción
- **THEN** el antecedente queda vigente, a su nombre, y aparece en la historia agrupado en «Alérgico»

#### Scenario: Descripción vacía (negativo)
- **WHEN** la descripción está vacía, es solo espacio en blanco o solo caracteres invisibles
- **THEN** se rechaza y no se guarda nada

#### Scenario: Tipo no permitido (negativo)
- **WHEN** una solicitud trae un tipo de antecedente que no es uno de los permitidos
- **THEN** se rechaza

#### Scenario: A nombre de otro médico (negativo)
- **WHEN** una solicitud intenta registrar el antecedente con el identificador de otro médico
- **THEN** se rechaza

#### Scenario: Paciente que no tiene a cargo (negativo)
- **WHEN** un médico sin asignación vigente intenta registrar o leer antecedentes de ese paciente
- **THEN** se rechaza o no recibe filas, sin revelar si el paciente existe

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera o un paciente intentan leer o registrar antecedentes, incluidos los propios
- **THEN** no reciben ninguna fila y las inserciones se rechazan

### Requirement: Un antecedente no se sobrescribe ni se elimina
Un antecedente SHALL conservar su tipo y su descripción originales. Cuando deja de aplicar SHALL marcarse como no vigente,
y una corrección SHALL consistir en marcar el antecedente anterior como no vigente y registrar uno nuevo, en una sola
operación que se aplica completa o no se aplica.

#### Scenario: Marcar como no vigente
- **WHEN** el médico a cargo marca un antecedente como resuelto
- **THEN** deja de mostrarse entre los vigentes, sigue existiendo con su descripción original y queda en el historial

#### Scenario: Corregir un antecedente
- **WHEN** el médico corrige la descripción de un antecedente
- **THEN** el original queda no vigente y se registra uno nuevo vigente, o no cambia nada si alguno de los pasos falla

#### Scenario: Reescribir o eliminar (negativo)
- **WHEN** cualquier usuario intenta modificar el tipo o la descripción de un antecedente, o eliminarlo
- **THEN** la base de datos rechaza la operación

### Requirement: Medición objetiva de historias digitalizadas
El sistema SHALL calcular cuántas historias clínicas cuentan como digitalizadas según ADR-0013: una historia está
digitalizada cuando tiene al menos un antecedente vigente o al menos una atención firmada con diagnósticos. El cálculo SHALL
devolver únicamente conteos (total de historias y digitalizadas) y SHALL ser accesible solo al administrativo.

#### Scenario: Historia con un antecedente vigente
- **WHEN** una historia tiene un antecedente vigente y ninguna atención
- **THEN** cuenta como digitalizada

#### Scenario: Historia con una atención firmada
- **WHEN** una historia tiene una atención firmada y ningún antecedente
- **THEN** cuenta como digitalizada

#### Scenario: Historia solo con un borrador
- **WHEN** una historia solo tiene una atención sin firmar y ningún antecedente vigente
- **THEN** no cuenta como digitalizada

#### Scenario: Historia vacía
- **WHEN** una historia no tiene antecedentes vigentes ni atenciones firmadas
- **THEN** no cuenta como digitalizada

#### Scenario: El adjunto por sí solo no digitaliza
- **WHEN** una historia solo tiene un adjunto de respaldo
- **THEN** no cuenta como digitalizada

#### Scenario: Solo conteos
- **WHEN** el administrativo consulta el indicador
- **THEN** recibe únicamente el total de historias y las digitalizadas, sin pacientes, textos ni identificadores

#### Scenario: Médico, enfermera y paciente (negativo)
- **WHEN** un médico, una enfermera o un paciente intentan obtener el indicador
- **THEN** la operación se rechaza y no reciben ningún conteo
