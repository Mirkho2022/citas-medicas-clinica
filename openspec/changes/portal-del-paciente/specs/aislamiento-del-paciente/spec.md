# Spec Delta

## Purpose

Garantizar que el rol paciente solo ve y modifica lo suyo, que no tiene ningún camino hacia historias clínicas ni hacia
funciones administrativas, y que su identidad en cada operación la fija el servidor y no un dato que el cliente controle.

## ADDED Requirements

### Requirement: El paciente solo ve su propia ficha y sus propias citas
Una sesión con rol paciente SHALL poder leer únicamente su propia ficha de paciente y sus propias citas. Las fichas y las citas
de otros pacientes SHALL ser invisibles para ella, tanto en el portal como en una consulta directa a la base de datos con su
identidad.

#### Scenario: Citas de otro paciente
- **WHEN** el paciente A consulta directamente las citas de la base de datos
- **THEN** no obtiene ninguna cita del paciente B, aunque filtre por su identificador

#### Scenario: Ficha de otro paciente
- **WHEN** el paciente A consulta directamente la tabla de pacientes
- **THEN** solo obtiene su propia ficha; no obtiene la de B ni la de una ficha sin cuenta

#### Scenario: Datos personales de otro paciente en perfiles
- **WHEN** el paciente A consulta directamente los perfiles
- **THEN** obtiene su propio perfil y los nombres de los médicos, y no el de ningún otro paciente ni el de otro personal

### Requirement: El paciente no accede a contenido clínico
El rol paciente SHALL NOT poder leer ni escribir historias clínicas, atenciones, addendas, antecedentes ni el registro de
accesos a historias, ni siquiera los que corresponden a su propia ficha. El portal SHALL NOT contener enlaces, rutas ni
consultas hacia ese contenido.

#### Scenario: Consulta directa a tablas clínicas
- **WHEN** un paciente consulta directamente `historias_clinicas`, `atenciones`, `addendas`, `antecedentes` o `accesos_historia`
- **THEN** cada consulta devuelve cero filas, también para los datos de su propia ficha

#### Scenario: Escritura en tablas clínicas
- **WHEN** un paciente intenta insertar o modificar una atención, un antecedente o una addenda
- **THEN** la base de datos lo rechaza

#### Scenario: El portal no consulta contenido clínico
- **WHEN** se revisa el código del portal (páginas, acciones y consultas del paciente)
- **THEN** ninguno de sus archivos referencia las tablas clínicas, y una prueba automática falla si alguien las añade

#### Scenario: Rutas de personal
- **WHEN** un paciente abre en el navegador una ruta de las áreas administrativa, médica o de enfermería
- **THEN** es llevado a su área y no ve contenido de esas áreas

### Requirement: El paciente no accede a funciones administrativas
El rol paciente SHALL NOT poder leer notificaciones, auditoría, bloqueos de agenda, asignaciones paciente-médico ni turnos de
enfermería, ni crear o modificar fichas de pacientes por su cuenta, ni crear citas con origen administrativo, ni cambiar su
propio rol.

#### Scenario: Tablas administrativas
- **WHEN** un paciente consulta directamente `notificaciones`, `auditoria`, `bloqueos_agenda`, `asignaciones_paciente_medico` o
  `turnos_enfermeria`
- **THEN** cada consulta devuelve cero filas

#### Scenario: Alta o corrección de fichas fuera del alta del portal
- **WHEN** un paciente intenta insertar o modificar una ficha de paciente (la suya o la de otro) directamente en la tabla
- **THEN** la base de datos lo rechaza; el único camino de alta para el paciente es el registro de autoservicio

#### Scenario: Cita con origen administrativo
- **WHEN** un paciente intenta crear una cita con origen `administrativo`
- **THEN** la base de datos la rechaza

#### Scenario: Cambio del propio rol
- **WHEN** un paciente intenta cambiar el rol de su perfil a administrativo
- **THEN** la base de datos lo rechaza

### Requirement: La identidad del paciente en cada operación la fija el servidor
Toda operación del portal (registrarse, reservar, cancelar, consultar) SHALL ejecutarse con el paciente de la sesión autenticada.
Ningún identificador de paciente, perfil o rol recibido desde el cliente SHALL determinar a nombre de quién se actúa. Las
operaciones SHALL ejecutarse con la identidad del usuario ante la base de datos, de modo que las reglas de acceso las aplique
la propia base y no solo el código de la aplicación.

#### Scenario: Solicitud con identificadores manipulados
- **WHEN** el cliente envía una reserva o una cancelación con un identificador de paciente distinto del suyo
- **THEN** el servidor lo ignora o rechaza la operación; nunca actúa a nombre de otra persona

#### Scenario: Consulta sin sesión
- **WHEN** una consulta a la base de datos se ejecuta sin la identidad de una sesión
- **THEN** la base de datos no devuelve ninguna fila de pacientes ni de citas

### Requirement: Los datos personales no aparecen en direcciones, títulos ni registros
El número de documento, el correo, los nombres y la fecha de nacimiento del paciente SHALL NOT aparecer en la URL, en el
título de la pestaña, en mensajes de error ni en los registros del servidor. Los identificadores en la URL se limitan a los
de médico, especialidad, día y horario, que no son datos del paciente.

#### Scenario: URL durante el registro y la reserva
- **WHEN** el paciente completa su registro y recorre la reserva
- **THEN** ninguna URL visitada contiene su documento, correo, nombres ni fecha de nacimiento

#### Scenario: Error del servidor
- **WHEN** una operación del portal falla por un error inesperado
- **THEN** el paciente ve un mensaje genérico en español sin detalles internos, y el registro del servidor no contiene su
  documento ni su correo
