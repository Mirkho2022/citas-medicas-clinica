# Spec Delta

## Purpose

La interfaz de la aplicación se ve y se comporta como define el sistema de diseño aprobado (docs/02-diseno/DESIGN.md): una sola
marca, estados de cita siempre legibles sin depender del color, accesibilidad WCAG 2.1 AA y textos en español, de modo
que un paciente use el portal sin ayuda y el personal trabaje rápido sobre la misma base visual.

## ADDED Requirements

### Requirement: La interfaz usa solo los valores del sistema de diseño
Todo color, tipografía, espaciado, radio de borde y sombra que se muestre en la aplicación SHALL provenir de los
tokens definidos en `docs/02-diseno/DESIGN.md`. Un cambio en esos tokens SHALL reflejarse en la interfaz regenerando el tema, sin
editar valores a mano en cada pantalla. La interfaz SHALL tener una sola marca (el verde azulado `primary`) y no
SHALL introducir otros colores de acento.

#### Scenario: El tema coincide con el documento
- **WHEN** se compara el tema aplicado en la aplicación con los tokens de `docs/02-diseno/DESIGN.md`
- **THEN** cada color, tamaño de texto, espaciado, radio y sombra del tema tiene el mismo valor que su token

#### Scenario: Un valor ajeno al sistema se detecta
- **WHEN** un componente o una página declara un color literal que no es un token del sistema
- **THEN** la verificación automática del repositorio falla y señala el archivo y el valor

#### Scenario: Tipografías del sistema
- **WHEN** se muestra cualquier pantalla
- **THEN** los títulos usan la familia de títulos del sistema (Plus Jakarta Sans), el resto del texto usa la familia de
  cuerpo (Inter) y las cifras de tablas, horas y documentos usan alineación tabular

### Requirement: Todo texto de la interfaz está en español con formato peruano
Todo texto de interfaz, etiqueta, ayuda y mensaje de error, incluidos los de los formularios de autenticación, SHALL
estar en español. Las fechas SHALL mostrarse como `dd/MM/yyyy` y las horas como `HH:mm` de 24 horas, siempre en la
zona `America/Lima`. Al paciente se le SHALL hablar de usted.

#### Scenario: Formularios de autenticación en español
- **WHEN** un visitante abre el inicio de sesión, el registro o la configuración de MFA
- **THEN** los títulos, etiquetas, botones y mensajes de error aparecen en español y con los colores del sistema

#### Scenario: Fecha y hora de una cita
- **WHEN** se muestra una cita del 14 de octubre de 2026 a las 14:30 hora de Lima, aunque el navegador esté en otra zona
- **THEN** se muestra `14/10/2026` y `14:30`

### Requirement: La interfaz siempre se muestra en tema claro
La interfaz SHALL mostrarse en el tema claro del sistema de diseño sin importar la preferencia de color del sistema
operativo o del navegador del usuario. Esta versión no SHALL ofrecer modo oscuro.

#### Scenario: Usuario con preferencia de modo oscuro
- **WHEN** el sistema operativo del usuario prefiere el modo oscuro y abre cualquier pantalla
- **THEN** la pantalla se muestra con el fondo `canvas` y el texto `ink` del tema claro

### Requirement: El estado de una cita nunca se comunica solo con color
Cada estado de cita (`reservada`, `confirmada`, `atendida`, `cancelada`, `no_asistio`) SHALL mostrarse como una insignia
con etiqueta de texto e icono, con el color que el sistema asigna a ese estado: reservada en tono informativo,
confirmada en éxito, atendida en neutro, cancelada en error y no asistió en aviso. Las etiquetas SHALL ser «Reservada»,
«Confirmada», «Atendida», «Cancelada» y «No asistió».

#### Scenario: Los cinco estados
- **WHEN** se muestran citas en cada uno de los cinco estados
- **THEN** cada una lleva su etiqueta de texto, su icono y su color, y las cinco son distinguibles sin percibir el color

#### Scenario: Estado desconocido
- **WHEN** a la insignia llega un estado que no es uno de los cinco
- **THEN** no se muestra una insignia con un color arbitrario; el error se detecta en desarrollo y en las pruebas

### Requirement: La interfaz cumple WCAG 2.1 AA
Todo par de texto y fondo SHALL tener un contraste de al menos 4,5:1 (3:1 para texto grande, bordes de controles,
anillos de foco e iconos que transmiten significado). Todo elemento interactivo SHALL mostrar un anillo de foco visible y
poder operarse solo con el teclado. En el portal del paciente los objetivos táctiles SHALL medir al menos 44 px (48 px
la acción principal); en la consola del personal, al menos 24 px.

#### Scenario: Pares de color del sistema
- **WHEN** se calcula el contraste de cada par de texto y fondo definido por los tokens y los componentes
- **THEN** todos alcanzan el mínimo que les corresponde y ninguno queda por debajo

#### Scenario: Revisión automática de accesibilidad
- **WHEN** se ejecuta la revisión de accesibilidad sobre la galería de componentes y sobre las páginas de cada área
- **THEN** no se reporta ninguna violación de nivel A ni AA de WCAG 2.1

#### Scenario: Recorrido con teclado
- **WHEN** un usuario recorre con la tecla de tabulación cualquier formulario o menú de la interfaz
- **THEN** el foco pasa por todos los controles en orden lógico, siempre visible, y nunca queda atrapado

### Requirement: Los formularios son accesibles y dicen cómo corregir
Cada campo SHALL tener su etiqueta visible encima del control (nunca solo texto de apoyo dentro del campo). La ayuda y
el mensaje de error SHALL mostrarse debajo y estar asociados al campo para los lectores de pantalla; un error SHALL
anunciarse como alerta, con icono, y SHALL decir qué pasó y cómo corregirlo. El campo de documento de identidad SHALL
permitir elegir DNI o Carné de Extranjería y mostrar el formato esperado de cada uno. Un dato de solo lectura SHALL
mostrarse legible y seleccionable, con la etiqueta «Solo lectura», sin deshabilitar el campo.

#### Scenario: Error en un campo
- **WHEN** un campo recibe un valor inválido, por ejemplo un DNI de siete dígitos
- **THEN** se muestra debajo del campo, con icono y anunciado como alerta, un mensaje como «El DNI debe tener 8 dígitos»,
  y el borde del campo cambia al color de error

#### Scenario: Dato del registro del paciente
- **WHEN** la historia clínica muestra los nombres y el documento que vienen del registro del paciente
- **THEN** se ven con la etiqueta «Solo lectura», no se pueden modificar y su texto sigue siendo legible y seleccionable

### Requirement: La interfaz hace visibles las reglas del dominio
Antes de confirmar una reserva, la interfaz SHALL mostrar médico, servicio, fecha y hora, y una advertencia de que la cita
solo puede cancelarse hasta 1 hora antes, indicando la hora límite en hora de Lima. Un rechazo por doble reserva SHALL
mostrar exactamente `Registro de cita ya agendado`. Una atención firmada SHALL mostrarse con la etiqueta «Firmada» y un
candado, sin ninguna acción de editarla; la única acción de corrección SHALL ser «Agregar addenda».

#### Scenario: Reserva de una cita a las 14:30
- **WHEN** el paciente elige el horario de las 14:30 antes de confirmar
- **THEN** ve el resumen con médico, servicio, fecha y hora y la advertencia «Podrá cancelar esta cita hasta 1 hora
  antes, a las 13:30.»

#### Scenario: Doble reserva rechazada
- **WHEN** la reserva es rechazada porque el horario ya fue tomado
- **THEN** se muestra, como alerta de error, el texto exacto `Registro de cita ya agendado`, sin reformularlo

#### Scenario: Atención firmada
- **WHEN** se muestra una atención ya firmada
- **THEN** lleva el sello «Firmada» con candado, no ofrece ningún botón para editarla y ofrece «Agregar addenda»

### Requirement: Cada área tiene su estructura de pantalla y conserva su protección
El portal del paciente SHALL mostrarse en una sola columna de hasta 640 px, pensada primero para móvil y con navegación
inferior de tres destinos («Inicio», «Mis citas», «Reservar»). La consola del personal SHALL mostrarse con una barra
lateral de 240 px y contenido de hasta 1280 px, con densidad compacta. Las páginas de `/paciente`, `/administrativo`,
`/medico` y `/enfermera` SHALL conservar su encabezado de primer nivel («Portal del paciente», «Panel administrativo»,
etc.) y la protección por sesión y rol que ya tenían.

#### Scenario: Portal del paciente en un teléfono
- **WHEN** un paciente abre el portal en una pantalla de 390 px de ancho
- **THEN** ve una sola columna sin desplazamiento horizontal, con la navegación inferior y botones de al menos 48 px

#### Scenario: Acceso a un área de otro rol
- **WHEN** un usuario con un rol abre la ruta del área de otro rol
- **THEN** el comportamiento de acceso es el mismo que antes del rediseño (no ve el contenido del otro rol)

### Requirement: La galería de componentes no está disponible al público ni en producción
La aplicación SHALL ofrecer una ruta de revisión de componentes solo en desarrollo y en los entornos de preview, solo para
usuarios con sesión. En producción esa ruta SHALL responder como una página inexistente. La galería SHALL usar
únicamente datos de ejemplo sintéticos y no SHALL mostrar datos reales de pacientes.

#### Scenario: Visitante sin sesión
- **WHEN** un visitante sin sesión abre la ruta de la galería
- **THEN** no ve ningún componente y es llevado a iniciar sesión

#### Scenario: Entorno de producción
- **WHEN** un usuario con sesión abre la ruta de la galería en producción
- **THEN** recibe una respuesta de página no encontrada

#### Scenario: Datos de ejemplo
- **WHEN** se muestran pacientes, documentos y atenciones en la galería
- **THEN** son sintéticos y están marcados como ejemplo (por ejemplo, DNI que empiezan por `99`)
