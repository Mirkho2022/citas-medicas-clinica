# Spec Delta

## Purpose

Permitir que un profesional aplique a un paciente a su cargo un instrumento de su área, con un puntaje que calcula el servidor y verifica
la base de datos y que nadie puede alterar; que ajuste la interpretación con historial pero nunca el puntaje; que anule un registro
equivocado; y que las aplicaciones de Psicología sean información restringida a los psicólogos a cargo, con cada lectura auditada.

## ADDED Requirements

### Requirement: El profesional registra una aplicación con el puntaje calculado por el servidor y verificado por la base
El sistema SHALL permitir registrar una aplicación únicamente a un profesional activo con el paciente a cargo y de la profesión del
área del instrumento, con un instrumento vigente. El servidor SHALL calcular el puntaje con la definición leída de la base y la base
SHALL recalcularlo y compararlo; si no coinciden, SHALL rechazar el registro sin guardar nada. El valor guardado SHALL ser el de la
base. La fecha, el autor, el área y la profesión SHALL ser los del servidor y la sesión, nunca los del cliente.

#### Scenario: Aplicación válida
- **WHEN** un profesional del área responde todos los ítems obligatorios de un instrumento vigente
- **THEN** se guarda la aplicación con las respuestas, los puntajes, la interpretación automática de cada escala, el autor y la hora del servidor

#### Scenario: Puntaje que no coincide (negativo)
- **WHEN** el puntaje que envía el servidor no coincide con el que recalcula la base
- **THEN** se rechaza y no se guarda nada

#### Scenario: Respuestas inválidas (negativo)
- **WHEN** falta un ítem obligatorio, hay una clave ajena, un valor que no es una opción del ítem, un entero fuera de rango o un número no entero
- **THEN** se rechaza en el servidor y, si llegara a la base, esta también lo rechaza; el formulario conserva lo escrito

#### Scenario: Instrumento no vigente o sin licencia (negativo)
- **WHEN** se intenta aplicar un instrumento no vigente o inexistente
- **THEN** se rechaza como instrumento no disponible

#### Scenario: Profesión que no corresponde al área (negativo)
- **WHEN** un fisioterapeuta intenta aplicar un instrumento de Psicología, o un psicólogo uno de Fisioterapia
- **THEN** se rechaza por profesión no autorizada y no se guarda nada

#### Scenario: Paciente que no está a cargo (negativo)
- **WHEN** el profesional no tiene al paciente a cargo, su asignación venció o su perfil está desactivado
- **THEN** se rechaza sin confirmar si el paciente existe

#### Scenario: Roles que no aplican instrumentos (negativo)
- **WHEN** el administrativo, la enfermera, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intenta registrar una aplicación
- **THEN** se rechaza y no se guarda nada

#### Scenario: Envío repetido
- **WHEN** el mismo formulario se envía dos veces con el mismo identificador
- **THEN** existe una sola aplicación

### Requirement: El puntaje y las respuestas no se pueden alterar
El sistema SHALL rechazar, para todo rol incluido el dueño de la base, toda modificación de las respuestas, los puntajes y la
interpretación automática de una aplicación, todo borrado, y todo intento de insertar una fila cuyos puntajes no coincidan con el
recálculo de las respuestas con el instrumento. Ningún rol de usuario SHALL tener privilegios de escritura directa sobre la tabla.

#### Scenario: Edición del puntaje (negativo)
- **WHEN** alguien intenta actualizar el puntaje, las respuestas o la interpretación automática de una aplicación
- **THEN** la base lo rechaza como registro inmutable

#### Scenario: Inserción con un puntaje distinto, incluso del dueño (negativo)
- **WHEN** el dueño de la base inserta una aplicación cuyo puntaje no coincide con las respuestas
- **THEN** la base lo rechaza

#### Scenario: Recálculo de lo guardado
- **WHEN** la prueba recalcula todas las aplicaciones guardadas con la versión inmutable de su instrumento
- **THEN** todas coinciden con lo almacenado

#### Scenario: Escritura directa (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar una aplicación con una sentencia directa
- **THEN** se rechaza por falta de privilegios

### Requirement: El profesional puede ajustar la interpretación con historial, nunca el puntaje
El sistema SHALL permitir al profesional que registró la aplicación escribir una interpretación propia al registrar y revisarla después,
mientras tenga al paciente a cargo. Cada texto SHALL agregarse a un historial solo-agregar con su autor y hora, la interpretación
automática SHALL conservarse al lado y ninguna revisión SHALL modificar el puntaje, las respuestas ni los textos anteriores.

#### Scenario: Revisión de la interpretación
- **WHEN** el profesional revisa su interpretación
- **THEN** el historial tiene un elemento más con el texto nuevo, quién y cuándo, la interpretación vigente es la nueva y el puntaje no cambia

#### Scenario: Otro profesional (negativo)
- **WHEN** otro profesional, aunque tenga al paciente a cargo, intenta ajustar la interpretación
- **THEN** se rechaza

#### Scenario: Cambio del historial (negativo)
- **WHEN** se intenta quitar o editar un elemento del historial, o agregar dos a la vez
- **THEN** la base lo rechaza

#### Scenario: Texto vacío (negativo)
- **WHEN** la interpretación está vacía, tiene solo espacios o caracteres invisibles
- **THEN** se rechaza

### Requirement: Una aplicación equivocada se anula, no se borra
El sistema SHALL permitir al profesional que la registró anular una aplicación vigente con un motivo con contenido, conservando todo su
contenido y marcándola como anulada, y SHALL NOT mostrarla como último resultado.

#### Scenario: Anular
- **WHEN** el profesional anula una aplicación registrada al paciente equivocado
- **THEN** queda marcada como anulada con motivo, autor y hora, sigue existiendo y puede registrarse otra

#### Scenario: Anular sin motivo o una ya anulada (negativo)
- **WHEN** se intenta anular sin motivo con contenido, o una aplicación ya anulada
- **THEN** se rechaza

### Requirement: Las aplicaciones de Psicología son información restringida
El sistema SHALL permitir leer las aplicaciones de un instrumento de área Psicología únicamente a un psicólogo activo que tenga al
paciente a cargo, impuesto por la política de la base de datos y no por la interfaz; las de las demás áreas SHALL poder leerlas todos
los profesionales que tengan al paciente a cargo. El área de una aplicación SHALL salir del instrumento. El administrativo, la
enfermera, el paciente y los demás roles SHALL NOT leer ninguna aplicación.

#### Scenario: Psicólogo a cargo
- **WHEN** un psicólogo que tiene al paciente a cargo consulta sus aplicaciones
- **THEN** ve las de Psicología y las de las demás áreas

#### Scenario: Otras profesiones a cargo (negativo por profesión)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo que tiene al paciente a cargo consulta las aplicaciones, o abre la dirección directa de una de Psicología
- **THEN** no obtiene ninguna fila de Psicología y la pantalla responde «no existe»; las de su área y las de otras áreas distintas de Psicología sí las ve

#### Scenario: Psicólogo sin el paciente a cargo (negativo)
- **WHEN** un psicólogo sin el paciente a cargo, con asignación vencida o con perfil desactivado consulta las aplicaciones
- **THEN** no obtiene ninguna fila

#### Scenario: Roles sin acceso (negativo)
- **WHEN** el administrativo, la enfermera, el paciente (incluido el titular), una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización consulta la tabla
- **THEN** no obtiene ninguna fila o se rechaza por falta de privilegios

#### Scenario: Declarar otra área (negativo)
- **WHEN** un cliente intenta registrar una aplicación de un instrumento de Psicología declarando otra área para esquivar la restricción
- **THEN** no existe parámetro para hacerlo y la clave foránea compuesta con el instrumento lo impide

### Requirement: Existe una sola definición de «psicólogo a cargo» y falla cerrada
El sistema SHALL definir en la base de datos una única función de acceso a la información de Psicología,
`psicologo_tiene_paciente(paciente)`, verdadera solo para un profesional con rol `profesional`, profesión psicólogo, perfil activo y el
paciente a cargo, y una función genérica `acceso_clinico_por_area(area, paciente)` que la usa para el área Psicología. Ambas SHALL
devolver falso ante cualquier dato ausente, nulo o inconsistente, y SHALL NOT estar disponibles para `anonymous`, el rol del cron ni el rol de
sincronización. Ninguna otra función con el mismo propósito SHALL existir.

#### Scenario: Falla cerrada
- **WHEN** se consulta con un paciente nulo o inexistente, con un token sin rol, con un perfil desactivado o con una asignación vencida
- **THEN** el resultado es falso y no se lanza un error ni se concede acceso

#### Scenario: Reutilización por Psicología
- **WHEN** las tablas propias de Psicología declaran su política
- **THEN** usan la misma función, y una política restrictiva adicional por autoría nunca amplía lo que permite la política por área (prevalece la más estricta)

#### Scenario: Función duplicada (negativo)
- **WHEN** el catálogo de funciones de la base contiene una segunda función con el propósito de «psicólogo a cargo», como `es_psicologo_a_cargo`
- **THEN** la prueba de catálogo falla

### Requirement: Cada lectura y cada escritura de aplicaciones queda auditada sin contenido
El sistema SHALL registrar cada escritura de aplicaciones en la auditoría sin copiar respuestas, puntajes ni textos, y SHALL registrar en
`accesos_historia`, en la misma transacción que la lectura, cada lectura de aplicaciones de un profesional. Si el registro de acceso
falla, la lectura no SHALL devolver contenido.

#### Scenario: Auditoría sin contenido
- **WHEN** se registra, se ajusta o se anula una aplicación
- **THEN** la auditoría que lee el administrativo muestra la tabla, la acción, el actor y el identificador, sin respuestas, puntajes ni textos

#### Scenario: Lectura registrada
- **WHEN** un psicólogo a cargo abre una aplicación de Psicología
- **THEN** queda un registro de acceso de tipo «instrumento» con su identificador, atribuido a él, en la misma transacción

#### Scenario: Acceso que no se puede registrar (negativo)
- **WHEN** el registro de acceso es rechazado porque la asignación venció
- **THEN** la transacción se revierte y no se devuelve contenido

### Requirement: No se admiten datos reales mientras la decisión legal siga abierta
El sistema SHALL aplicar a las aplicaciones de instrumentos la guarda de datos reales de las historias clínicas: en modo de demostración
solo se admiten aplicaciones de pacientes de demostración, y toda operación de la aplicación SHALL comprobar que el modo de la
aplicación coincide con el de la base.

#### Scenario: Paciente real en modo demostración (negativo)
- **WHEN** se intenta registrar una aplicación para un paciente que no es de demostración mientras la base está en modo demostración
- **THEN** se rechaza y no se guarda nada

#### Scenario: Configuración inconsistente (negativo)
- **WHEN** el modo de la aplicación no coincide con el de la base
- **THEN** la operación falla antes de leer o escribir y se muestra que el módulo no está disponible
