# Spec Delta

## Purpose

Que cada especialidad pueda aportar campos propios a la atención sin cambiar la estructura de `atenciones` y con las mismas
garantías que el resto del registro clínico: validación en el servidor y en la base de datos, ningún campo obligatorio
vacío y nada modificable después de firmar.

## ADDED Requirements

### Requirement: Catálogo de plantillas versionadas y de solo lectura para el médico
El sistema SHALL guardar las plantillas clínicas de cada especialidad como versiones inmutables y SHALL permitir leerlas
únicamente al médico. Ningún rol de usuario SHALL poder crear, modificar ni borrar una plantilla: se gestionan por
migración. Una versión nueva SHALL reemplazar a la anterior para las atenciones nuevas sin alterar las ya registradas.

#### Scenario: Lectura por el médico
- **WHEN** un médico consulta las plantillas vigentes
- **THEN** obtiene las de las especialidades definidas, con sus campos

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera, un paciente o una sesión sin rol intentan leer las plantillas
- **THEN** no obtienen ninguna fila

#### Scenario: Escritura por cualquier rol (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar una plantilla
- **THEN** se rechaza y el catálogo no cambia

#### Scenario: Versión nueva
- **WHEN** una migración publica la versión siguiente de una plantilla y marca la anterior como no vigente
- **THEN** las atenciones nuevas usan la versión vigente y las existentes conservan la suya

### Requirement: Datos de especialidad validados contra su plantilla
Cuando una atención lleva una plantilla, el servidor y la base de datos SHALL validar sus datos de especialidad contra los
campos de esa plantilla: cada campo obligatorio SHALL tener contenido real (con el mismo criterio que los textos clínicos),
el valor SHALL ser del tipo definido y estar dentro de su rango, largo y opciones, y las claves que la plantilla no define
SHALL descartarse. Una atención sin plantilla SHALL guardar datos de especialidad vacíos. La plantilla SHALL existir, estar
vigente al registrar la atención y ser de la especialidad del médico autor. El servidor SHALL leer la plantilla por su
cuenta y no confiar en la definición que envíe el cliente.

#### Scenario: Atención con plantilla completa
- **WHEN** el médico envía una atención con la plantilla de su especialidad y todos sus campos obligatorios completos
- **THEN** la atención se guarda con sus datos de especialidad

#### Scenario: Campo obligatorio vacío
- **WHEN** falta un campo obligatorio de la plantilla, o solo contiene espacios o caracteres invisibles
- **THEN** no se guarda nada y la respuesta indica ese campo

#### Scenario: Valor de otro tipo o fuera de rango
- **WHEN** un campo numérico llega como texto o fuera de su rango, o una opción no está en la lista
- **THEN** se rechaza indicando el campo, sin convertir el valor

#### Scenario: Clave ajena
- **WHEN** los datos incluyen una clave que la plantilla no define
- **THEN** la clave se descarta y no se guarda

#### Scenario: Datos sin plantilla (negativo)
- **WHEN** una atención sin plantilla trae datos de especialidad no vacíos
- **THEN** se rechaza

#### Scenario: Plantilla de otra especialidad (negativo)
- **WHEN** un médico usa una plantilla que no es de su especialidad
- **THEN** se rechaza y no se guarda la atención

#### Scenario: Plantilla inexistente o no vigente (negativo)
- **WHEN** una atención nueva se registra con una plantilla que no existe o que ya no está vigente
- **THEN** se rechaza

#### Scenario: Borrador con una plantilla que ya no es la vigente
- **WHEN** el autor guarda un borrador creado con una versión anterior de su plantilla
- **THEN** el borrador conserva su plantilla y se valida contra ella

#### Scenario: Base de datos como segunda barrera
- **WHEN** una solicitud lograra saltarse la validación del servidor con un dato inválido de especialidad
- **THEN** la base de datos rechaza la fila y el usuario recibe un mensaje en español, nunca el error interno

### Requirement: Los datos de especialidad se sellan con la firma
Los datos de especialidad y la plantilla usada SHALL ser parte del contenido firmado: al firmar la atención SHALL quedar
inmutables y SHALL estar cubiertos por la huella.

#### Scenario: Modificar tras la firma (negativo)
- **WHEN** alguien intenta cambiar los datos de especialidad de una atención firmada
- **THEN** se rechaza, y la corrección se hace con una addenda

#### Scenario: Huella que cubre los datos
- **WHEN** se altera un dato de especialidad de una atención firmada (con la protección desactivada solo dentro de una prueba) y se recalcula la huella
- **THEN** ya no coincide con la guardada al firmar

### Requirement: Plantilla inicial de Medicina general
El sistema SHALL incluir una plantilla de Medicina general con los campos de la primera consulta de la NTS 139-MINSA/2018
(numeral 5.2.1) que la atención genérica no cubre: tiempo de enfermedad (obligatorio), funciones biológicas, exámenes
auxiliares, referencia y fecha de la próxima cita. La plantilla SHALL NOT guardar signos vitales ni indicaciones de receta.

#### Scenario: Tiempo de enfermedad obligatorio
- **WHEN** un médico de Medicina general envía una atención sin el tiempo de enfermedad
- **THEN** se rechaza indicando ese campo

#### Scenario: Sin signos vitales ni receta
- **WHEN** se revisan los campos de la plantilla de Medicina general
- **THEN** ninguno corresponde a signos vitales ni a la receta

### Requirement: La interfaz presenta los campos de la plantilla
El formulario de la atención SHALL mostrar los campos de la plantilla de la especialidad del médico con su etiqueta y su
error por campo, operables por teclado, y SHALL conservar lo escrito cuando el servidor rechaza el envío. Un médico cuya
especialidad aún no tiene plantilla SHALL poder registrar la atención con los campos genéricos.

#### Scenario: Campos de la plantilla
- **WHEN** un médico de Medicina general abre el formulario de una atención nueva
- **THEN** ve los campos de su plantilla junto a los genéricos, cada uno con su etiqueta

#### Scenario: Error por campo
- **WHEN** el servidor rechaza un campo de la plantilla
- **THEN** el error aparece junto a ese campo y el resto de lo escrito se conserva

#### Scenario: Especialidad sin plantilla
- **WHEN** el médico pertenece a una especialidad sin plantilla
- **THEN** puede registrar la atención con los campos genéricos y sin datos de especialidad
