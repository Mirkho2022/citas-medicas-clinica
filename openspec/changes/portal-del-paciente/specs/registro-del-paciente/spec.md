# Spec Delta

## Purpose

Permitir que una persona cree por sí misma su cuenta de paciente y la vincule con su ficha en la clínica, identificándose
con DNI o Carné de Extranjería, sin duplicar fichas y sin poder unirse a la ficha de otra persona.

## ADDED Requirements

### Requirement: El paciente completa su registro antes de usar el portal
Después de crear su cuenta, el paciente SHALL completar sus datos de identificación antes de acceder a «Inicio»,
«Mis citas» o «Reservar». Mientras su cuenta no esté vinculada a una ficha de paciente, toda pantalla del portal SHALL
llevarlo a «Complete su registro». Una vez vinculada, no SHALL volver a pedírsele.

#### Scenario: Cuenta recién creada
- **WHEN** una persona termina de crear su cuenta en el registro público
- **THEN** ve la pantalla «Complete su registro» con el formulario de identificación, no la portada de visitantes

#### Scenario: Cuenta sin ficha abre otra pantalla del portal
- **WHEN** un paciente cuya cuenta aún no tiene ficha abre «Mis citas» o «Reservar»
- **THEN** es llevado a «Complete su registro» y no ve contenido del portal

#### Scenario: Paciente ya registrado
- **WHEN** un paciente con ficha vinculada abre «Complete su registro»
- **THEN** es llevado a su «Inicio» y no se le pide ningún dato otra vez

### Requirement: La cuenta nueva se prepara sin dejar al paciente perdido
Si la cuenta recién creada todavía no está lista (el sistema aún está asignándole el rol de paciente), el portal SHALL
mostrar un mensaje de espera en español y continuar por sí solo cuando esté lista, sin que el paciente recargue la página.
Si la espera supera los 30 segundos, SHALL ofrecer «Reintentar» y una indicación de qué hacer si el problema continúa. Una
persona con sesión iniciada no SHALL ver nunca la portada pensada para visitantes.

#### Scenario: Cuenta en preparación
- **WHEN** el paciente llega a «Complete su registro» antes de que su cuenta tenga rol
- **THEN** ve «Estamos preparando su cuenta» y, al estar lista, aparece el formulario sin intervención suya

#### Scenario: La preparación tarda demasiado
- **WHEN** pasan más de 30 segundos sin que la cuenta esté lista
- **THEN** ve el botón «Reintentar» y un texto que indica comunicarse con la clínica si persiste, y la pantalla no entra en un
  bucle de redirecciones

#### Scenario: Persona de personal abre la pantalla
- **WHEN** un usuario con rol administrativo, médico o enfermera abre «Complete su registro»
- **THEN** es llevado a su propia área y no ve el formulario

### Requirement: El documento de identidad se valida como DNI o Carné de Extranjería
El paciente SHALL elegir el tipo de documento (DNI o Carné de Extranjería) e indicar su número. Un DNI SHALL tener exactamente
8 dígitos numéricos; un Carné de Extranjería SHALL tener de 9 a 12 caracteres alfanuméricos. El número se SHALL aceptar sin
espacios sobrantes y el Carné de Extranjería sin distinguir mayúsculas de minúsculas. La validación SHALL ejecutarse en el
navegador para dar respuesta inmediata y, siempre, en el servidor antes de tocar la base de datos.

#### Scenario: DNI válido
- **WHEN** el paciente elige DNI e indica `72345678`
- **THEN** el documento se acepta

#### Scenario: DNI con siete dígitos
- **WHEN** el paciente indica un DNI de siete dígitos
- **THEN** ve bajo el campo, con icono, el mensaje «El DNI debe tener 8 dígitos» y no se guarda nada

#### Scenario: DNI con letras
- **WHEN** el paciente indica un DNI que contiene una letra o un símbolo
- **THEN** se rechaza con el mismo mensaje de formato y no se guarda nada

#### Scenario: Carné de Extranjería válido
- **WHEN** el paciente elige Carné de Extranjería e indica `ce1234567` (9 caracteres)
- **THEN** el documento se acepta y se guarda `CE1234567`

#### Scenario: Carné de Extranjería fuera de formato
- **WHEN** el paciente indica un Carné de Extranjería de 8 o de 13 caracteres, o con símbolos
- **THEN** se rechaza con un mensaje que explica que debe tener de 9 a 12 letras o números

#### Scenario: Validación del servidor sin la del navegador
- **WHEN** llega al servidor un envío con un documento inválido, aunque el navegador no lo haya validado
- **THEN** el servidor responde con el mismo error por campo y no se crea ni se modifica ninguna ficha

### Requirement: Los demás datos de identificación y contacto se validan
El formulario SHALL exigir nombres, apellidos, fecha de nacimiento y sexo, y SHALL permitir indicar teléfono y dirección como
datos opcionales. La fecha de nacimiento no SHALL ser futura ni de hace más de 120 años. Un teléfono indicado SHALL contener
de 7 a 15 dígitos, con o sin el signo «+» y espacios. El correo SHALL tomarse de la cuenta del paciente y mostrarse de solo
lectura con la etiqueta «Solo lectura»; el paciente no lo escribe. Los nombres y apellidos SHALL aparecer prellenados con los
de la cuenta y poder corregirse para que coincidan con su documento.

#### Scenario: Campos obligatorios vacíos
- **WHEN** el paciente envía el formulario con un campo obligatorio vacío o con solo espacios
- **THEN** cada campo faltante muestra su error y el primero recibe el foco

#### Scenario: Fecha de nacimiento imposible
- **WHEN** el paciente indica una fecha de nacimiento futura
- **THEN** se rechaza con un mensaje que pide revisar la fecha y no se guarda nada

#### Scenario: Correo de la cuenta
- **WHEN** el paciente ve el formulario
- **THEN** su correo aparece como dato de solo lectura, legible y seleccionable, y no hay un campo para escribir otro

#### Scenario: Teléfono opcional
- **WHEN** el paciente deja el teléfono en blanco
- **THEN** el registro continúa sin error

### Requirement: La cuenta se vincula con la ficha de la clínica sin duplicarla
Al completar el registro, el sistema SHALL crear la ficha del paciente vinculada a su cuenta cuando el documento no exista, o
SHALL vincular la ficha que la clínica ya tenía con ese documento y sin cuenta únicamente si el correo verificado de la
cuenta y la fecha de nacimiento coinciden con los de esa ficha. Al vincular, los datos de la ficha existente no SHALL
sobrescribirse con lo escrito en el formulario. Cuando no se pueda vincular, el sistema SHALL responder siempre el mismo
mensaje genérico, sin revelar si el documento existe, qué dato no coincidió ni ningún dato de la ficha.

#### Scenario: Documento nuevo
- **WHEN** el paciente completa el registro con un documento que no existe en el sistema
- **THEN** se crea su ficha vinculada a su cuenta, con los datos indicados y el correo de la cuenta, y llega a su «Inicio»

#### Scenario: Ficha registrada por la clínica, datos coincidentes
- **WHEN** el paciente indica el documento de una ficha sin cuenta creada por el administrativo, y su correo y fecha de
  nacimiento coinciden con los de esa ficha
- **THEN** la ficha queda vinculada a su cuenta, sin crear una segunda, y sus citas anteriores ya aparecen en «Mis citas»

#### Scenario: Ficha existente con datos que no coinciden
- **WHEN** el paciente indica el documento de una ficha existente pero su fecha de nacimiento o el correo de su cuenta no
  coinciden
- **THEN** no se vincula nada y ve «No pudimos completar su registro con estos datos. Si ya se atendió en la clínica,
  comuníquese con ella para que revisen su ficha», el mismo texto en todos los casos de rechazo

#### Scenario: Documento ya vinculado a otra cuenta
- **WHEN** el paciente indica un documento cuya ficha ya pertenece a otra cuenta
- **THEN** no se vincula nada y ve el mismo mensaje genérico, sin saber que el documento ya tiene cuenta

#### Scenario: Dos cuentas con el mismo documento nuevo a la vez
- **WHEN** dos cuentas distintas envían a la vez el mismo documento que no existía
- **THEN** existe una sola ficha con ese documento, vinculada a una de ellas, y la otra recibe el mensaje genérico

### Requirement: Un paciente tiene una sola ficha y solo el rol paciente puede usar el alta del portal
Una cuenta SHALL tener como máximo una ficha de paciente, y un documento SHALL pertenecer como máximo a una ficha. El alta de
autoservicio SHALL poder ejecutarla únicamente una sesión con rol paciente; ningún valor enviado desde el formulario (rol,
identificador de perfil o de paciente) SHALL cambiar el rol ni la identidad con la que se registra.

#### Scenario: Cuenta con ficha intenta registrar otro documento
- **WHEN** una cuenta que ya tiene ficha intenta completar el registro con otro documento
- **THEN** se rechaza con «Su cuenta ya está registrada» y no se crea una segunda ficha

#### Scenario: Otro rol intenta el alta del portal
- **WHEN** una sesión con rol administrativo, médico o enfermera, o sin rol, intenta ejecutar el alta de autoservicio
- **THEN** la base de datos la rechaza y no se crea ni se modifica ninguna ficha

#### Scenario: Campos adicionales en el envío
- **WHEN** el envío incluye campos que el formulario no tiene (por ejemplo `rol` o `perfil_id`)
- **THEN** el servidor los ignora y la ficha queda vinculada solo a la cuenta autenticada, con rol paciente

### Requirement: El alta no expone contenido clínico
El registro SHALL crear únicamente la ficha del paciente; la carpeta de historia clínica que el sistema abre para cada
paciente nuevo SHALL quedar vacía y fuera del alcance del paciente.

#### Scenario: Paciente recién registrado consulta su historia
- **WHEN** un paciente recién registrado consulta directamente las tablas de historia clínica
- **THEN** no obtiene ninguna fila, ni siquiera las de su propia carpeta
