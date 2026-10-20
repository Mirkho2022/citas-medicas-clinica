# Spec Delta

## Purpose

Que el médico a cargo registre la atención de un paciente de forma rápida y sin errores, y que ninguna atención se guarde
con campos vacíos o datos inválidos aunque el cliente sea manipulado, con la base de datos como segunda barrera.

## ADDED Requirements

### Requirement: Solo el médico a cargo registra atenciones, a su propio nombre
El sistema SHALL permitir registrar una atención únicamente a un médico que tenga al paciente a cargo, y SHALL registrarla
siempre a nombre del médico autenticado. Registrar una atención a nombre de otro médico, o de un paciente que no se tiene
a cargo, SHALL ser rechazado por la base de datos.

#### Scenario: Registro por el médico a cargo
- **WHEN** un médico con asignación vigente envía una atención completa de su paciente
- **THEN** la atención se guarda como borrador a su nombre, sin firmar

#### Scenario: A nombre de otro médico (negativo)
- **WHEN** una solicitud intenta registrar la atención con el identificador de otro médico
- **THEN** se rechaza y no se guarda ninguna atención

#### Scenario: Paciente que no tiene a cargo (negativo)
- **WHEN** un médico intenta registrar una atención de un paciente sin asignación vigente
- **THEN** se rechaza con un mensaje que no confirma si el paciente existe

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera o un paciente intentan registrar una atención
- **THEN** se rechaza y no se guarda nada

### Requirement: Validación en el servidor de campos obligatorios y datos válidos
El servidor SHALL validar la atención antes de tocar la base de datos, con independencia de lo que haya validado el
navegador. El motivo de consulta, la anamnesis, el examen físico y el plan de tratamiento SHALL tener contenido real: un
texto vacío, de solo espacios, tabuladores o saltos de línea, o de solo caracteres invisibles (como el espacio de ancho
cero), SHALL rechazarse. SHALL exigirse al menos un diagnóstico, y los textos SHALL respetar longitudes máximas y no
contener caracteres que la base no pueda guardar. Los errores SHALL indicarse por campo y en español. Cuando la atención lleve una plantilla de especialidad, sus campos
SHALL validarse además según la capacidad `plantillas-clinicas-por-especialidad`.

#### Scenario: Campo vacío
- **WHEN** se envía una atención con la anamnesis vacía
- **THEN** no se guarda nada y la respuesta indica que la anamnesis es obligatoria

#### Scenario: Solo espacios, tabuladores o saltos de línea
- **WHEN** un campo obligatorio contiene únicamente espacio en blanco
- **THEN** se rechaza como vacío

#### Scenario: Solo caracteres invisibles
- **WHEN** un campo obligatorio contiene únicamente caracteres invisibles de ancho cero
- **THEN** se rechaza como vacío

#### Scenario: Sin diagnósticos
- **WHEN** se envía una atención con la lista de diagnósticos vacía
- **THEN** se rechaza indicando que debe registrarse al menos un diagnóstico

#### Scenario: Validación del cliente omitida
- **WHEN** una solicitud llega al servidor sin haber pasado por el formulario (por ejemplo, enviada directamente)
- **THEN** el servidor aplica las mismas reglas y rechaza lo inválido igualmente

#### Scenario: Base de datos como segunda barrera
- **WHEN** una solicitud lograra saltarse la validación del servidor con un campo vacío
- **THEN** la base de datos rechaza la fila y el usuario recibe un mensaje en español, nunca el error interno

#### Scenario: Atención completa
- **WHEN** todos los campos tienen contenido y hay al menos un diagnóstico válido
- **THEN** la atención se guarda

### Requirement: Diagnósticos del catálogo CIE-10
Cada diagnóstico SHALL referirse a un código existente del catálogo CIE-10 y llevar un tipo permitido. La descripción
guardada SHALL ser la del catálogo en el momento del registro, no la que envíe el cliente. No SHALL repetirse un mismo
código dentro de una atención.

#### Scenario: Código inexistente
- **WHEN** se envía un diagnóstico con un código que no existe en el catálogo
- **THEN** la atención no se guarda y el mensaje indica qué diagnóstico revisar

#### Scenario: Descripción tomada del catálogo
- **WHEN** el cliente envía un diagnóstico con una descripción distinta de la del catálogo
- **THEN** la atención guarda la descripción del catálogo

#### Scenario: Código repetido
- **WHEN** se envía dos veces el mismo código en una atención
- **THEN** se rechaza indicando el diagnóstico repetido

#### Scenario: Tipo no permitido
- **WHEN** se envía un diagnóstico con un tipo que no es uno de los permitidos
- **THEN** se rechaza

### Requirement: Vínculo opcional con la cita
Una atención PODRÁ vincularse a una cita; si lo hace, la cita SHALL ser del mismo paciente y del mismo médico y SHALL tener
como máximo una atención. La hora de creación de la atención SHALL fijarla el servidor y no el cliente.

#### Scenario: Cita de otro médico (negativo)
- **WHEN** un médico vincula su atención a una cita que pertenece a otro médico
- **THEN** se rechaza y no se guarda la atención

#### Scenario: Cita de otro paciente (negativo)
- **WHEN** un médico vincula la atención de un paciente a la cita de un paciente distinto
- **THEN** se rechaza

#### Scenario: Segunda atención para la misma cita
- **WHEN** ya existe una atención para esa cita y se registra otra
- **THEN** se rechaza con el mensaje «Ya existe una atención registrada para esa cita»

#### Scenario: Atención sin cita
- **WHEN** un médico registra una atención sin cita vinculada
- **THEN** se guarda con normalidad

#### Scenario: Fecha de creación manipulada
- **WHEN** el cliente envía una fecha de creación del pasado o del futuro
- **THEN** la atención se guarda con la hora del servidor

### Requirement: Borrador editable solo por su autor hasta firmar
Mientras no esté firmada, una atención SHALL poder editarse únicamente por el médico que la escribió y SHALL conservar la
validación completa en cada guardado. Otro médico a cargo SHALL poder verla, marcada como borrador sin firmar, pero no
editarla.

#### Scenario: El autor edita su borrador
- **WHEN** el autor corrige la anamnesis de su borrador y guarda
- **THEN** el cambio se aplica

#### Scenario: Otro médico a cargo edita el borrador (negativo)
- **WHEN** otro médico que también tiene al paciente a cargo intenta modificar el borrador
- **THEN** el cambio no se aplica

#### Scenario: Edición que deja un campo vacío
- **WHEN** el autor guarda su borrador dejando el motivo de consulta vacío
- **THEN** se rechaza y el borrador conserva su contenido anterior

#### Scenario: Pacientes ajenos (negativo)
- **WHEN** un médico intenta editar el borrador de una atención de un paciente que no tiene a cargo
- **THEN** no se aplica ningún cambio ni se revela que la atención existe

### Requirement: Carga rápida de una atención
El formulario SHALL permitir cargar una atención completa en una sola pantalla, con la acción de guardar siempre visible, la
ficha del paciente y sus antecedentes vigentes a la vista, la búsqueda de diagnósticos operable por teclado, y los datos ya
escritos conservados cuando el servidor rechaza el envío. SHALL poder guardarse como borrador o firmarse en un solo paso.
El texto clínico sin guardar SHALL NO persistirse en el almacenamiento del navegador.

#### Scenario: Error del servidor conserva lo escrito
- **WHEN** el servidor rechaza el envío por un campo inválido
- **THEN** el formulario muestra el error junto al campo y conserva el resto de lo escrito

#### Scenario: Guardar y firmar en un paso
- **WHEN** el médico elige firmar desde el formulario de una atención nueva y confirma
- **THEN** la atención se guarda y se firma en una sola operación, o no se guarda nada

#### Scenario: Diagnósticos con teclado
- **WHEN** el médico escribe parte de un código o de un nombre de diagnóstico y navega con el teclado
- **THEN** puede elegir un resultado sin usar el puntero y el lector de pantalla anuncia las opciones

#### Scenario: Nada clínico en el almacenamiento del navegador
- **WHEN** el médico escribe en el formulario y abandona la página sin guardar
- **THEN** el texto no queda guardado en el navegador

#### Scenario: Motivo prellenado desde la cita
- **WHEN** el médico abre el formulario desde una cita suya con motivo registrado
- **THEN** el motivo de consulta aparece prellenado y es editable

### Requirement: El texto clínico se muestra tal como se escribió y sin riesgos
El sistema SHALL mostrar los textos clínicos conservando sus saltos de línea y SHALL tratarlos siempre como texto, nunca
como contenido ejecutable.

#### Scenario: Texto con marcado
- **WHEN** una anamnesis contiene `<script>` o caracteres de marcado
- **THEN** se muestra como texto literal y no se ejecuta
