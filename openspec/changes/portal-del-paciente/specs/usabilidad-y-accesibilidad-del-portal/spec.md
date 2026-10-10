# Spec Delta

## Purpose

Asegurar que un paciente, incluido un adulto mayor sin ayuda, pueda registrarse, reservar y cancelar su cita desde el teléfono,
con criterios de usabilidad y accesibilidad (WCAG 2.1 AA) que se puedan comprobar, y que la autogestión quede medible para la
métrica de éxito del 75 % de citas hechas por el propio paciente.

## ADDED Requirements

### Requirement: Lenguaje claro, en español y de usted
Todo texto del portal del paciente (títulos, etiquetas, ayudas, botones, avisos y mensajes de error) SHALL estar en español, en
trato de usted, con frases cortas y sin jerga técnica ni códigos de error. Cada mensaje de error SHALL decir qué pasó y cómo
corregirlo o qué hacer a continuación. Ningún mensaje SHALL mostrar errores internos de la base de datos.

#### Scenario: Error de validación
- **WHEN** el paciente deja un campo con un valor inválido
- **THEN** el mensaje dice qué está mal y cómo corregirlo (por ejemplo «El DNI debe tener 8 dígitos»), nunca un código ni un
  texto técnico

#### Scenario: Error inesperado
- **WHEN** una operación falla por un problema que el paciente no puede resolver
- **THEN** ve «Algo salió mal de nuestro lado. Intente de nuevo en unos minutos» y la opción de reintentar, sin detalles internos

### Requirement: Cada tarea se completa en pocos pasos, de a una por pantalla
Desde «Inicio», reservar una cita SHALL requerir como máximo 5 elecciones o toques (especialidad, médico, día, horario y
confirmar). Desde «Mis citas», cancelar una cita SHALL requerir como máximo 2 toques (cancelar y confirmar). El retroceso del
navegador SHALL conservar la selección ya hecha, y cada pantalla SHALL pedir una sola decisión.

#### Scenario: Reservar desde el inicio
- **WHEN** un paciente registrado reserva una cita partiendo de «Inicio»
- **THEN** la completa con no más de 5 elecciones o toques, una decisión por pantalla

#### Scenario: Cancelar desde «Mis citas»
- **WHEN** el paciente cancela una cita partiendo de «Mis citas»
- **THEN** lo logra con no más de 2 toques

#### Scenario: Volver atrás
- **WHEN** el paciente retrocede con el navegador desde la confirmación hasta el horario
- **THEN** conserva el médico y el día elegidos y no pierde su avance

### Requirement: El portal está pensado primero para el teléfono
El portal SHALL usar una sola columna de hasta 640 px, con navegación inferior de tres destinos («Inicio», «Mis citas»,
«Reservar») en móvil, texto base de 18 px y la acción principal de al menos 48 px de alto. SHALL poder usarse a 320 px de ancho
sin desplazamiento horizontal y con el texto ampliado hasta 200 % sin perder contenido ni funciones.

#### Scenario: Teléfono de 390 px
- **WHEN** el paciente abre cualquier pantalla del portal en un ancho de 390 px
- **THEN** ve una sola columna sin desplazamiento horizontal, con la navegación inferior de tres destinos

#### Scenario: Reflujo a 320 px
- **WHEN** se abre cualquier pantalla del portal a 320 px de ancho
- **THEN** no hay desplazamiento horizontal y todo el contenido y las acciones son alcanzables

#### Scenario: Zoom al 200 %
- **WHEN** el paciente amplía el texto al 200 %
- **THEN** ningún contenido se corta ni se superpone y todas las funciones siguen disponibles

### Requirement: El portal cumple WCAG 2.1 AA y se verifica automáticamente
Todas las pantallas del portal, en cada uno de sus estados (vacío, con datos, con errores de validación, diálogo de
confirmación, error de reserva), SHALL cumplir las pautas de nivel A y AA de WCAG 2.1. La revisión automática de accesibilidad
SHALL ejecutarse sobre cada una de ellas y no SHALL reportar ninguna violación. Los pares de texto y fondo SHALL cumplir
4,5:1 (3:1 para texto grande, bordes de controles, foco e iconos con significado).

#### Scenario: Revisión automática por pantalla y estado
- **WHEN** se ejecuta la revisión automática sobre «Complete su registro», «Inicio», «Mis citas», cada paso de «Reservar», la
  confirmación y los diálogos
- **THEN** no se reporta ninguna violación de nivel A ni AA

#### Scenario: Formulario con errores
- **WHEN** se revisa «Complete su registro» con varios errores de validación visibles
- **THEN** no se reporta ninguna violación y cada error está asociado a su campo

### Requirement: El portal se opera completo con teclado y con lector de pantalla
Toda función del portal SHALL poder operarse solo con el teclado, con el foco siempre visible y en orden lógico, sin quedar
atrapado. Al cambiar de paso o de pantalla, el foco SHALL pasar al título de la nueva pantalla. Los errores SHALL anunciarse
como alertas y los avisos de éxito como mensajes de estado, sin robar el foco. Los botones de acción SHALL indicar en texto el
estado de carga («Reservando…», «Buscando horarios…»).

#### Scenario: Reservar solo con teclado
- **WHEN** una persona recorre con la tecla de tabulación y las teclas de acción toda la reserva
- **THEN** completa la reserva sin ratón, con el foco visible en cada control

#### Scenario: Anuncio de un error de reserva
- **WHEN** la reserva es rechazada por doble reserva
- **THEN** un lector de pantalla anuncia la alerta con el texto exacto `Registro de cita ya agendado`

#### Scenario: Cambio de paso
- **WHEN** el paciente avanza de «Elija un médico» a «Elija un día»
- **THEN** el foco queda en el título del nuevo paso

### Requirement: Objetivos táctiles amplios y estados de carga claros
Los controles interactivos del portal SHALL medir al menos 44 × 44 px (48 px la acción principal). Mientras se cargan listas o
horarios, el portal SHALL mostrar un esqueleto con la forma del contenido y un texto de estado, no un indicador giratorio a
pantalla completa. Los estados vacíos SHALL decir qué pasa y ofrecer la acción siguiente.

#### Scenario: Tamaño de los controles
- **WHEN** se mide el área de cada botón, opción y enlace del portal en móvil
- **THEN** ninguno es menor de 44 × 44 px y «Reservar cita» y «Confirmar cita» miden al menos 48 px de alto

#### Scenario: Carga de horarios
- **WHEN** el paciente elige un día y los horarios aún se están cargando
- **THEN** ve un esqueleto de la cuadrícula y el texto «Buscando horarios…», y la región queda marcada como ocupada para los
  lectores de pantalla

### Requirement: La autogestión del paciente queda registrada y es medible
Cada cita reservada desde el portal SHALL quedar con origen `portal` y cada cancelación hecha por el paciente SHALL quedar con
el perfil del paciente como quien cancela, de modo que se pueda calcular qué porción de las reservas y cancelaciones hace el
propio paciente. Este requisito no incluye pantallas de análisis: solo exige que el dato exista y sea consultable.

#### Scenario: Reserva del paciente
- **WHEN** un paciente reserva una cita en el portal
- **THEN** la cita queda con origen `portal` y con su perfil como creador

#### Scenario: Cancelación del paciente
- **WHEN** un paciente cancela su cita en el portal
- **THEN** queda registrado su perfil como quien cancela, distinguible de una cancelación hecha por el administrativo

### Requirement: La usabilidad con personas mayores se prueba antes de dar el portal por listo
Antes de considerar terminado el portal, el equipo SHALL ejecutar y documentar una prueba de usabilidad moderada de las tareas
«registrarse», «reservar una cita» y «cancelar una cita» con al menos cinco personas de 60 años o más (o, si no es posible
reclutarlas, dejar constancia de por qué y de qué se hizo en su lugar). El protocolo SHALL fijar el criterio de éxito: al menos
4 de cada 5 personas completan cada tarea sin ayuda. Los hallazgos SHALL registrarse y los de gravedad alta corregirse.

#### Scenario: Prueba realizada
- **WHEN** se completa la prueba con cinco personas de 60 años o más
- **THEN** existe un registro con el resultado por tarea y persona, los hallazgos y las correcciones aplicadas, y cada tarea
  cumple el criterio de 4 de 5 o queda con un plan de corrección

#### Scenario: Prueba no realizable
- **WHEN** no es posible reclutar a las personas indicadas
- **THEN** el registro lo declara de forma explícita, indica la alternativa usada y deja la prueba pendiente para antes de
  abrir el portal a pacientes reales
