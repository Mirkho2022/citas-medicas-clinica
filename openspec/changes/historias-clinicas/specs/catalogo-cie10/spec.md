# Spec Delta

## Purpose

Disponer del catálogo oficial completo de diagnósticos CIE-10, cargado de forma versionada y repetible, para que el médico
elija diagnósticos buscando por código o por texto y para que el sistema rechace cualquier diagnóstico que no exista.

## ADDED Requirements

### Requirement: El catálogo completo se carga por migración de datos versionada
El catálogo CIE-10 completo SHALL cargarse en la base de datos mediante una migración de datos versionada y repetible, a partir
de una fuente oficial cuyo origen, versión, fecha de obtención y huella de contenido queden documentados en el repositorio.
Cargar la migración dos veces SHALL NO duplicar filas. Una actualización futura del catálogo SHALL aplicarse como una
migración adicional, nunca editando la de la carga inicial. Los códigos de demostración ya sembrados SHALL seguir conviviendo
con el catálogo sin duplicarse.

#### Scenario: Catálogo completo tras migrar
- **WHEN** se aplican todas las migraciones sobre una base nueva
- **THEN** el catálogo contiene los códigos de la fuente documentada, incluidos los de uso habitual como R51, I10 y E11.9

#### Scenario: Carga repetible
- **WHEN** la migración de carga se ejecuta sobre una base que ya tiene el catálogo
- **THEN** el número de filas no cambia

#### Scenario: Fuente documentada
- **WHEN** se revisa el repositorio
- **THEN** existen el archivo de origen, su huella, la fuente oficial y la fecha en que se obtuvo

#### Scenario: Fuente no oficial (negativo)
- **WHEN** la única fuente descargable no es oficial (MINSA/SUSALUD u OMS)
- **THEN** no se carga el catálogo y se consulta al responsable del proyecto

### Requirement: Nadie escribe en el catálogo desde la aplicación
Todos los roles autenticados SHALL poder consultar el catálogo y ninguno SHALL poder insertar, modificar ni eliminar sus
filas; el catálogo solo cambia mediante migración de datos.

#### Scenario: Consulta por cualquier rol
- **WHEN** un médico, un administrativo, una enfermera o un paciente consultan el catálogo
- **THEN** reciben sus filas

#### Scenario: Escritura de usuario (negativo)
- **WHEN** cualquier rol de usuario, incluido el administrativo, intenta insertar, modificar o eliminar un código
- **THEN** la operación se rechaza

#### Scenario: Sesión sin rol (negativo)
- **WHEN** una sesión sin rol válido consulta el catálogo
- **THEN** no recibe ninguna fila

### Requirement: Búsqueda de diagnósticos por código o por texto
El sistema SHALL ofrecer al médico una búsqueda de diagnósticos por código o por parte de la descripción, sin distinguir
mayúsculas de minúsculas ni tildes, que devuelva como máximo 20 resultados con los coincidencias de código primero, y que
exija al menos dos caracteres. La búsqueda SHALL responder dentro del objetivo de latencia del sistema.

#### Scenario: Búsqueda por código
- **WHEN** el médico escribe `i10`
- **THEN** el primer resultado es el código I10

#### Scenario: Búsqueda por texto sin tildes
- **WHEN** el médico escribe `hipertension`
- **THEN** los resultados incluyen las descripciones que contienen «hipertensión»

#### Scenario: Consulta demasiado corta
- **WHEN** el médico escribe un solo carácter
- **THEN** no se ejecuta la búsqueda

#### Scenario: Límite de resultados
- **WHEN** la consulta coincide con cientos de códigos
- **THEN** se devuelven como máximo 20

#### Scenario: Sin sesión o con rol no médico (negativo)
- **WHEN** alguien sin sesión, o con un rol distinto de médico, pide la búsqueda
- **THEN** no recibe resultados

### Requirement: La base de datos valida cada diagnóstico de la atención
La base de datos SHALL rechazar toda atención cuyos diagnósticos no sean una lista de entradas con un código existente en el
catálogo, un tipo permitido cuando se informe, sin códigos repetidos y sin claves ajenas. La descripción de cada diagnóstico
SHALL guardarse como la del catálogo en ese momento, y un cambio posterior del catálogo SHALL NO alterar atenciones ya
guardadas. La validación SHALL aplicarse también cuando se edita el borrador, pero SHALL NO sustituir las reglas existentes
de campos vacíos y de lista de diagnósticos no vacía.

#### Scenario: Código inexistente (negativo)
- **WHEN** se inserta o actualiza una atención con un diagnóstico cuyo código no existe en el catálogo
- **THEN** la base de datos rechaza la operación

#### Scenario: Descripción normalizada
- **WHEN** se guarda un diagnóstico con una descripción distinta de la del catálogo
- **THEN** queda guardada la del catálogo

#### Scenario: Claves ajenas descartadas
- **WHEN** el diagnóstico trae claves distintas de código, descripción y tipo
- **THEN** solo se conservan las permitidas

#### Scenario: Lista vacía sigue rechazada por la regla existente
- **WHEN** se inserta una atención con la lista de diagnósticos vacía o que no es una lista
- **THEN** se rechaza por la regla de «al menos un diagnóstico», igual que antes

#### Scenario: Catálogo actualizado después
- **WHEN** una migración posterior cambia la descripción de un código del catálogo
- **THEN** las atenciones ya guardadas conservan la descripción con que se firmaron
