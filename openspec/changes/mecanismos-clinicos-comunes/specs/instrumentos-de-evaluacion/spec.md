# Spec Delta

## Purpose

Disponer de un catálogo de instrumentos de evaluación con puntaje (ítems, reglas de puntaje, interpretación, área y marca de uso
libre) que se gestiona solo por migración, con una definición mínima que la base de datos valida, versiones inmutables, un cálculo
de puntaje determinista y la exigencia de una licencia verificada y referenciada para todo instrumento vigente. El mecanismo no
incluye ningún instrumento concreto.

## ADDED Requirements

### Requirement: El catálogo se gestiona por migración y sus versiones son inmutables
El sistema SHALL guardar los instrumentos en una tabla de catálogo con clave, versión, nombre, área, ítems, escalas, fuente y licencia,
que ningún rol de usuario ni `anonymous`, `cron_notificaciones` o `sync_identidad` SHALL poder insertar, modificar ni borrar. Cada
versión SHALL ser inmutable: cambiar un instrumento es insertar la versión siguiente y marcar la anterior como no vigente, y la base
SHALL rechazar todo otro cambio y todo borrado, también para el dueño. Este mecanismo SHALL NOT incluir ningún instrumento concreto.

#### Scenario: Nueva versión
- **WHEN** una migración inserta la versión 2 de un instrumento y marca la 1 como no vigente
- **THEN** las aplicaciones ya registradas conservan la versión 1 y las nuevas usan la 2

#### Scenario: Edición de una versión (negativo)
- **WHEN** alguien, incluido el dueño, intenta cambiar los ítems, las escalas, el área o la licencia de una versión ya guardada, o reactivar una no vigente
- **THEN** la base lo rechaza

#### Scenario: Escritura por un usuario (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar un instrumento
- **THEN** se rechaza por falta de privilegios

#### Scenario: Base recién migrada
- **WHEN** se consulta el catálogo de una base recién migrada
- **THEN** no contiene ningún instrumento que no haya cargado una migración de una especialidad con su licencia referenciada

### Requirement: La definición de un instrumento se valida en la base de datos
El sistema SHALL validar, al insertar un instrumento y para todo rol incluido el dueño, que la definición cumple un esquema mínimo:
de 1 a 120 ítems con clave única y texto con contenido; ítems de tipo «opción» (2 a 12 opciones con valor entero y etiqueta distintos) o
«entero» (mínimo menor que máximo); de 1 a 8 escalas cuya operación es «suma» (con multiplicador entero de 1 a 10) o «porcentaje» (con
mínimo de respondidos), cuyos ítems existen y cuyos rangos de interpretación son contiguos desde el mínimo posible hasta el máximo
posible. Todo ítem SHALL pertenecer a alguna escala y solo las escalas de porcentaje SHALL admitir ítems opcionales.

#### Scenario: Definición válida
- **WHEN** una migración inserta un instrumento sintético con una escala de suma y rangos contiguos del mínimo al máximo posible
- **THEN** se acepta

#### Scenario: Rangos con hueco o solape (negativo)
- **WHEN** los rangos de una escala dejan un hueco, se solapan, no empiezan en el mínimo posible o no terminan en el máximo posible
- **THEN** la inserción se rechaza con el motivo

#### Scenario: Ítem inválido (negativo)
- **WHEN** hay una clave repetida, una opción con valor repetido, una de solo una opción, un entero con mínimo mayor o igual que el máximo, o un ítem que no está en ninguna escala
- **THEN** la inserción se rechaza

#### Scenario: Ítem opcional en una escala de suma (negativo)
- **WHEN** una escala de suma incluye un ítem no obligatorio
- **THEN** la inserción se rechaza

#### Scenario: Operación desconocida (negativo)
- **WHEN** una escala usa una operación que no es «suma» ni «porcentaje»
- **THEN** la inserción se rechaza

### Requirement: Solo se admiten instrumentos de uso libre con licencia verificada y referenciada
El sistema SHALL exigir que todo instrumento vigente esté marcado de uso libre, tenga la referencia de su licencia o permiso con
contenido y la fecha en que se verificó, y SHALL permitir como no vigente un instrumento descartado para documentarlo. Un
instrumento no vigente SHALL NOT poder aplicarse. El sistema SHALL NOT declarar de uso libre ningún instrumento sin esa
verificación.

#### Scenario: Instrumento vigente sin licencia (negativo)
- **WHEN** una migración inserta un instrumento vigente sin `uso_libre`, sin referencia de licencia o sin fecha de verificación
- **THEN** la inserción se rechaza

#### Scenario: Instrumento descartado
- **WHEN** una migración inserta un instrumento no libre como no vigente
- **THEN** se acepta como registro y no puede aplicarse a ningún paciente

### Requirement: El cálculo del puntaje es determinista y entero
El sistema SHALL calcular el puntaje de cada escala sin coma flotante: la «suma» es la suma de los valores de las opciones elegidas por
el multiplicador, y el «porcentaje» es el porcentaje del rango posible de los ítems respondidos, redondeado a un decimal con mitades
hacia arriba. El valor invertido de un ítem SHALL expresarse en los valores de sus opciones. La interpretación automática SHALL ser la
etiqueta del primer rango tal que desde ≤ puntaje < hasta, e incluir el límite superior en el último rango. El servidor y la base
SHALL producir el mismo resultado para los mismos datos.

#### Scenario: Suma con valores invertidos
- **WHEN** se responden los ítems de una escala de suma en los que algunos ítems tienen sus opciones con valores invertidos
- **THEN** el puntaje es la suma de los valores guardados de las opciones elegidas

#### Scenario: Porcentaje con un ítem omitido
- **WHEN** se omite un ítem opcional de una escala de porcentaje que admite un omitido
- **THEN** el puntaje se calcula sobre los ítems respondidos y el mismo resultado lo da el servidor y la base

#### Scenario: Mitad exacta
- **WHEN** el porcentaje cae exactamente en la mitad entre dos valores de un decimal
- **THEN** se redondea hacia arriba, igual en TypeScript y en SQL

#### Scenario: Límites de rangos
- **WHEN** el puntaje coincide con el `hasta` de un rango intermedio, y con el `hasta` del último
- **THEN** el primero pertenece al rango siguiente y el segundo pertenece al último rango

#### Scenario: Discrepancia entre las dos implementaciones (negativo)
- **WHEN** los vectores de prueba comunes producen un resultado distinto en TypeScript y en la base
- **THEN** la suite de pruebas falla

### Requirement: Quién lee el catálogo de instrumentos
El sistema SHALL permitir leer el catálogo únicamente a un profesional activo: todos los instrumentos de áreas distintas de
Psicología, y los de Psicología solo a un psicólogo. El administrativo, la enfermera, el paciente, una sesión sin rol, `anonymous`, el
rol del cron y el rol de sincronización SHALL NOT leerlo.

#### Scenario: Fisioterapeuta
- **WHEN** un fisioterapeuta consulta el catálogo
- **THEN** ve los instrumentos de áreas distintas de Psicología y ninguno de Psicología

#### Scenario: Psicólogo
- **WHEN** un psicólogo consulta el catálogo
- **THEN** ve todos los instrumentos

#### Scenario: Roles sin acceso (negativo)
- **WHEN** el administrativo, la enfermera, un paciente, una sesión sin rol o `anonymous` consulta el catálogo
- **THEN** no obtiene ninguna fila o se rechaza por falta de privilegios
