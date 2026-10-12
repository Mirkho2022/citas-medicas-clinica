# Spec Delta

## Purpose

Garantizar que solo el médico a cargo pueda abrir la historia clínica de un paciente, que la base de datos (no solo la
pantalla) lo haga cumplir para cada rol, y que el contenido clínico no se escape por canales laterales como la caché, los
títulos, las direcciones o los mensajes de error.

Nota (PRD del 2026-10-11; ADR-0030 y ADR-0031): la historia clínica es **compartida entre las especialidades** para todo
profesional a cargo del paciente, y la información de Psicología queda aparte de esa historia compartida. Esta capacidad no
implementa esa separación (la implementa `especialidad-psicologia`) ni el cambio de «médico» a «profesional» (lo implementa
`profesionales-de-la-salud`): los requisitos de abajo hablan del médico a cargo y se leerán como «profesional a cargo» cuando
H2c se aplique.

## ADDED Requirements

### Requirement: Solo el médico a cargo abre la historia clínica
El sistema SHALL mostrar el contenido de una historia clínica (ficha, antecedentes, atenciones, addendas y adjuntos
vigentes) únicamente al médico autenticado que tenga al paciente a cargo, es decir, con una asignación vigente a su nombre
mientras el médico esté activo. Ningún otro rol ni ningún otro médico SHALL poder leerlo, ni siquiera consultando
directamente las tablas, y la protección SHALL ser impuesta por la base de datos además de por la pantalla.

#### Scenario: Médico a cargo abre la historia
- **WHEN** un médico activo con una asignación vigente al paciente abre su historia clínica
- **THEN** ve la ficha del paciente, sus antecedentes vigentes, sus atenciones con sus addendas y sus adjuntos vigentes

#### Scenario: Médico sin asignación (negativo)
- **WHEN** un médico que no tiene al paciente a cargo intenta abrir su historia, por la pantalla o consultando las tablas
  directamente
- **THEN** no recibe ninguna fila ni dato, y la respuesta es indistinguible de la de un paciente que no existe

#### Scenario: Asignación vencida (negativo)
- **WHEN** la asignación del médico al paciente venció ayer (fecha de Lima) y el médico intenta abrir la historia
- **THEN** no accede a ningún dato clínico

#### Scenario: Médico dado de baja o con perfil desactivado (negativo)
- **WHEN** el médico está marcado como no activo, o su perfil está desactivado, aunque su asignación no haya vencido
- **THEN** no accede a ningún dato clínico

#### Scenario: Paciente con una cita solo reservada
- **WHEN** un médico abre desde su agenda a un paciente cuya cita aún está solo reservada y que no tiene asignación vigente
- **THEN** ve un aviso de que la historia se habilita al confirmarse la cita, y ningún dato clínico

#### Scenario: Administrativo (negativo)
- **WHEN** un administrativo abre la dirección de la historia de un paciente o consulta directamente las tablas clínicas
- **THEN** es redirigido a su propia área y las consultas devuelven cero filas

#### Scenario: Paciente, incluso sobre su propia historia (negativo)
- **WHEN** un paciente intenta abrir su propia historia clínica o consultar las tablas clínicas
- **THEN** no recibe ningún dato clínico

#### Scenario: Enfermera (negativo)
- **WHEN** una enfermera intenta abrir una historia clínica o consultar las tablas clínicas
- **THEN** no recibe ningún dato clínico

#### Scenario: Sin sesión (negativo)
- **WHEN** alguien sin sesión pide cualquier dirección de la historia clínica
- **THEN** es redirigido a iniciar sesión y no se devuelve contenido

### Requirement: Acceso condicionado a rol de médico y a MFA
Toda pantalla y toda ruta que sirva contenido clínico SHALL exigir sesión, rol de médico y autenticación de múltiple factor
activa, comprobados en el propio recurso y no solo en un filtro previo. Un médico sin MFA SHALL ser dirigido a
configurarlo antes de ver cualquier dato clínico.

#### Scenario: Médico sin MFA
- **WHEN** un médico sin MFA activo pide la lista de pacientes o una historia
- **THEN** es dirigido a configurar MFA y no se devuelve ningún dato clínico

#### Scenario: Ruta clínica nueva sin protección
- **WHEN** se añade una ruta que sirve contenido clínico sin comprobar sesión y rol
- **THEN** la verificación automática del repositorio falla

### Requirement: Lista de pacientes a cargo
El sistema SHALL ofrecer al médico una lista de los pacientes que tiene a cargo con asignación vigente, con búsqueda por
apellidos, nombres o documento dentro de esa lista. Un paciente con el que el médico solo tiene una cita reservada pero
ninguna asignación vigente SHALL NO aparecer en ella.

#### Scenario: Lista propia
- **WHEN** un médico abre su lista de pacientes
- **THEN** ve únicamente a los pacientes con asignación vigente a su nombre

#### Scenario: Pacientes de otro médico (negativo)
- **WHEN** el médico B busca a un paciente que solo tiene a cargo el médico A
- **THEN** no aparece en la lista de B, ni por nombre ni por documento

#### Scenario: Búsqueda dentro de la lista
- **WHEN** el médico busca por parte de un apellido o por el documento completo
- **THEN** la lista se reduce a los pacientes a su cargo que coinciden

### Requirement: La ficha del paciente es de solo lectura
Los datos que vienen del registro del paciente (nombres, apellidos, documento, fecha de nacimiento, sexo, contacto) SHALL
mostrarse en la historia clínica como información de solo lectura y SHALL NO existir en la historia clínica ningún control
ni operación capaz de modificarlos.

#### Scenario: Pantalla sin controles de edición
- **WHEN** el médico abre la historia o el formulario de una atención
- **THEN** los datos del registro del paciente se muestran como texto y no como campos editables

#### Scenario: Intento de enviar datos del registro del paciente
- **WHEN** una solicitud de registro de atención incluye campos del registro del paciente (por ejemplo, `nombres` o
  `numero_documento`)
- **THEN** la solicitud se rechaza y ningún dato del paciente cambia

### Requirement: El contenido clínico no se escapa por canales laterales
Las respuestas que contienen contenido clínico SHALL indicar que no deben guardarse en ninguna caché, SHALL llevar un
título genérico, y SHALL NO exponer nombres, documentos ni contenido clínico en la dirección, en el título de la pestaña,
en mensajes de error ni en los registros del servidor. La dirección SHALL identificar al paciente solo por su
identificador interno.

#### Scenario: Cabeceras de no almacenamiento
- **WHEN** el servidor responde con la historia clínica, una atención o un adjunto
- **THEN** la respuesta indica que es privada y que no se almacena

#### Scenario: Título y dirección genéricos
- **WHEN** el médico abre la historia de un paciente
- **THEN** el título de la pestaña es «Historia clínica» y la dirección no contiene nombre ni documento

#### Scenario: Error sin contenido
- **WHEN** falla la carga o el guardado de una atención
- **THEN** el mensaje mostrado y el registrado en el servidor no contienen texto clínico ni datos del paciente
