# Spec Delta

## Purpose

Identificar a cada paciente por un documento válido (DNI, Carné de Extranjería, pasaporte o número provisional), permitir que
el administrativo lo busque y lo registre —con o sin cita— con la filiación mínima de la NTS 139, y que abra su historia
clínica con una acción explícita, sin duplicar documentos ni historias y sin exponer datos clínicos.

## ADDED Requirements

### Requirement: El documento de identidad es un DNI o un Carné de Extranjería válido
Todo documento de paciente SHALL indicar su tipo (DNI, Carné de Extranjería, pasaporte o número provisional) y validarse en el
servidor, antes de consultar
la base de datos, según ese tipo. Un DNI SHALL tener exactamente 8 dígitos. Un Carné de Extranjería SHALL tener entre 9 y 12
caracteres alfanuméricos. Los espacios al inicio y al final SHALL descartarse, y las letras del Carné de Extranjería SHALL
normalizarse a mayúsculas. El mensaje de error SHALL decir qué formato se espera. La base de datos conserva su propia
validación de formato como segunda barrera.

#### Scenario: DNI válido
- **WHEN** se envía el tipo DNI con el número `12345678`
- **THEN** el documento se acepta

#### Scenario: DNI con menos o más dígitos, o con letras
- **WHEN** se envía el tipo DNI con `1234567`, `123456789` o `1234567A`
- **THEN** se rechaza en el servidor con «El DNI debe tener 8 dígitos» y no se consulta la base de datos

#### Scenario: Carné de Extranjería válido
- **WHEN** se envía el tipo Carné de Extranjería con `CE0000001` (9 caracteres) o con `AB1234567890` (12 caracteres)
- **THEN** el documento se acepta

#### Scenario: Carné de Extranjería fuera de rango o con símbolos
- **WHEN** se envía el tipo Carné de Extranjería con 8 caracteres, con 13 caracteres o con un guion o un espacio en medio
- **THEN** se rechaza con «El Carné de Extranjería debe tener entre 9 y 12 caracteres, solo letras y números»

#### Scenario: Normalización
- **WHEN** se envía un Carné de Extranjería `ce0000001 ` en minúsculas y con un espacio al final
- **THEN** se guarda como `CE0000001`

#### Scenario: Un número de 8 dígitos solo es válido como DNI
- **WHEN** se envía el tipo Carné de Extranjería con el número `12345678`
- **THEN** se rechaza, porque tiene menos de 9 caracteres

### Requirement: El administrativo registra pacientes sin documentos duplicados
El administrativo SHALL poder registrar un paciente con nombres, apellidos, documento, fecha de nacimiento (no futura), sexo
(M, F o X), correo electrónico válido, y teléfono y dirección opcionales, sin que el paciente tenga cuenta en el portal.
Dos pacientes no SHALL compartir el mismo tipo y número de documento: el intento duplicado SHALL rechazarse con «Ya existe un
paciente con ese documento» ofreciendo abrir el existente, y no SHALL crear una segunda fila. El registro no SHALL pedir ni
mostrar datos clínicos. El registro SHALL poder hacerse sin cita y no SHALL crearla ni exigirla; la filiación mínima de la NTS
139 SHALL poder capturarse en el mismo registro o completarse después (requisito de filiación). Registrar un paciente no SHALL
abrir su historia clínica.

#### Scenario: Registro exitoso sin cuenta de portal
- **WHEN** el administrativo registra un paciente con todos los datos obligatorios válidos
- **THEN** el paciente queda registrado sin cuenta de portal y puede elegirse de inmediato para agendarle una cita

#### Scenario: Documento duplicado
- **WHEN** el administrativo registra un paciente con un tipo y número de documento ya registrados
- **THEN** se rechaza con «Ya existe un paciente con ese documento», se ofrece abrir el paciente existente y no se crea otra
  fila

#### Scenario: Registros simultáneos del mismo documento
- **WHEN** dos administrativos registran a la vez el mismo documento
- **THEN** uno lo registra y el otro recibe el mensaje de documento duplicado

#### Scenario: Datos inválidos
- **WHEN** falta un campo obligatorio, el correo no es válido, el sexo no es M, F o X, o la fecha de nacimiento es futura
- **THEN** se rechaza en el servidor con un mensaje por campo y no se consulta la base de datos

#### Scenario: El administrativo no ve contenido clínico del paciente que registró (negativo)
- **WHEN** el administrativo registra un paciente, le crea su historia clínica y luego consulta
  historias clínicas, atenciones o antecedentes
- **THEN** no recibe ninguna fila

### Requirement: El administrativo busca pacientes por documento o apellido
El administrativo SHALL poder buscar pacientes por número de documento exacto o por el inicio de los apellidos, sin
distinguir mayúsculas. La búsqueda SHALL devolver como máximo 20 resultados con solo datos de identificación y contacto
(documento, nombres, apellidos, fecha de nacimiento, correo y teléfono) y, si el paciente tiene historia clínica, su número (el
único dato de la historia que el administrativo ve), sin datos clínicos ni datos sensibles. Los caracteres comodín del
texto de búsqueda no SHALL interpretarse. Solo el administrativo SHALL poder buscar pacientes; un paciente SHALL ver
únicamente su propio registro y el médico solo los pacientes con quienes tiene relación vigente.

#### Scenario: Búsqueda por documento
- **WHEN** el administrativo busca el DNI `99000001`
- **THEN** obtiene el paciente con ese documento, con sus datos de identificación y contacto

#### Scenario: Búsqueda por apellido
- **WHEN** el administrativo busca «quis» y existen pacientes con apellidos «Quispe» y «Quispe Rojas»
- **THEN** obtiene ambos, sin distinguir mayúsculas, hasta un máximo de 20 resultados

#### Scenario: Los comodines no se interpretan
- **WHEN** el administrativo busca el texto `%` o `_`
- **THEN** no obtiene todos los pacientes: el texto se trata como literal y la búsqueda devuelve solo coincidencias literales

#### Scenario: Resultado sin datos clínicos
- **WHEN** el administrativo busca un paciente que tiene historia clínica
- **THEN** el resultado no incluye ningún dato clínico

#### Scenario: Otros roles no buscan pacientes (negativo)
- **WHEN** un paciente, una enfermera o una sesión sin rol invoca la búsqueda de pacientes
- **THEN** la operación se rechaza o no devuelve ninguna fila, y un paciente que consulta `pacientes` directamente recibe
  únicamente su propio registro

#### Scenario: Un médico sin relación con el paciente no lo encuentra (negativo)
- **WHEN** un médico consulta un paciente con quien no tiene cita vigente ni asignación vigente
- **THEN** no recibe ninguna fila

#### Scenario: Resultado con el número de historia
- **WHEN** el administrativo busca un paciente que tiene historia clínica abierta y otro que no la tiene
- **THEN** el primero muestra su número de historia y el segundo «Sin historia clínica», y ningún resultado incluye otro dato de la historia

### Requirement: El pasaporte y el número provisional también identifican a un paciente
Un pasaporte SHALL tener entre 6 y 20 caracteres alfanuméricos, con las letras normalizadas a mayúsculas; el mensaje de error
SHALL decir qué formato se espera. Un paciente que no tiene documento SHALL registrarse con un número provisional que **genera el
sistema** (`PROV-` seguido de al menos seis dígitos), único e irrepetible; el usuario no SHALL poder escribirlo ni elegirlo, y una
solicitud que lo traiga como dato de entrada SHALL rechazarse en el servidor. El número provisional SHALL verse como tal en la
ficha del paciente hasta que se confirme su identidad.

#### Scenario: Pasaporte válido
- **WHEN** se envía el tipo pasaporte con `ab123456` (8 caracteres)
- **THEN** el documento se acepta y se guarda como `AB123456`

#### Scenario: Pasaporte fuera de rango o con símbolos
- **WHEN** se envía el tipo pasaporte con 5 caracteres, con 21 caracteres o con un guion
- **THEN** se rechaza con «El pasaporte debe tener entre 6 y 20 caracteres, solo letras y números»

#### Scenario: Paciente sin documento
- **WHEN** el administrativo registra un paciente sin documento
- **THEN** el sistema le asigna un número provisional nuevo con el formato `PROV-000001` y el paciente queda identificado como provisional

#### Scenario: Dos registros provisionales simultáneos
- **WHEN** dos administrativos registran a la vez un paciente sin documento
- **THEN** cada uno recibe un número provisional distinto

#### Scenario: Número provisional escrito a mano (negativo)
- **WHEN** una solicitud trae el tipo provisional con un número escrito por el usuario
- **THEN** se rechaza en el servidor y no se crea el paciente

### Requirement: El administrativo confirma la identidad de un paciente con número provisional
El administrativo SHALL poder reemplazar el documento provisional de un paciente por su documento definitivo (DNI, Carné de
Extranjería o pasaporte válido) **sobre el mismo paciente**, de modo que su historia clínica, sus citas y sus asignaciones no se
dupliquen ni cambien de dueño. El cambio SHALL quedar registrado en la auditoría con su autor. El documento de un paciente que
no es provisional no SHALL poder modificarse, ni por la aplicación ni por una consulta directa, y ningún documento SHALL volver
a ser provisional. Si el documento definitivo ya pertenece a otro paciente, la operación SHALL rechazarse con «Ya existe un
paciente con ese documento» sin cambiar nada.

#### Scenario: Confirmación de identidad
- **WHEN** el administrativo confirma con el DNI `99000123` a un paciente que tiene número provisional y una historia clínica
- **THEN** el paciente conserva su identificador y su historia, su documento pasa a ser el DNI y la auditoría registra el cambio con el administrativo como autor

#### Scenario: Documento definitivo ya registrado
- **WHEN** el documento definitivo pertenece a otro paciente
- **THEN** se rechaza con «Ya existe un paciente con ese documento» y el paciente provisional sigue igual

#### Scenario: Cambiar el documento de un paciente no provisional (negativo)
- **WHEN** el administrativo intenta cambiar el documento de un paciente con DNI, por la aplicación o con una consulta directa
- **THEN** se rechaza con «El documento de este paciente no se puede modificar» y no cambia ninguna fila

#### Scenario: Otros roles no confirman identidades (negativo)
- **WHEN** un médico, una enfermera, un paciente o una sesión sin rol intenta confirmar una identidad
- **THEN** se rechaza por falta de permiso y no cambia ningún dato

### Requirement: El registro captura la filiación mínima del formato de la NTS 139
El registro del paciente SHALL poder capturar, en el mismo acto o después, la filiación mínima del formato de la NTS 139
(numeral 5.2.2): nombres y apellidos, fecha y lugar de nacimiento, sexo, grupo sanguíneo y factor Rh, domicilio actual y de
procedencia, teléfono, documento, número de seguro, estado civil, grado de instrucción, ocupación y datos de la persona
acompañante o responsable (nombre, documento, domicilio y parentesco). La edad SHALL calcularse a partir de la fecha de
nacimiento y no guardarse. Los campos que no se exigen para abrir la historia (grupo sanguíneo, factor Rh, domicilio de
procedencia, teléfono y número de seguro) SHALL poder quedar sin informar. Para un paciente mayor de 18 años SHALL ser
obligatorio informar estado civil, grado de instrucción y ocupación; para un menor de 18 años SHALL ser obligatorio el
responsable (nombre, documento y domicilio). Los valores de grupo sanguíneo, factor Rh, estado civil, grado de instrucción y tipo
de seguro SHALL pertenecer a listas cerradas, y un texto con solo espacios SHALL tratarse como vacío.

#### Scenario: Registro con la filiación completa
- **WHEN** el administrativo registra a un paciente mayor de 18 años con todos los datos obligatorios
- **THEN** el paciente queda registrado y su ficha indica que la filiación está completa

#### Scenario: Registro sin cita
- **WHEN** el administrativo registra a un paciente sin elegir ninguna cita
- **THEN** el paciente queda registrado, no se crea ninguna cita y no cuenta en el indicador de citas reservadas o canceladas por el propio paciente

#### Scenario: Registro con la filiación incompleta
- **WHEN** el administrativo registra a un paciente sin completar la filiación
- **THEN** el paciente queda registrado, la ficha muestra qué falta y no se abre ninguna historia clínica

#### Scenario: Menor de edad sin responsable
- **WHEN** se intenta abrir la historia de un paciente menor de 18 años sin los datos del responsable
- **THEN** se rechaza indicando que faltan el nombre, el documento y el domicilio del responsable

#### Scenario: Valor fuera de lista o texto vacío
- **WHEN** se envía un estado civil que no está en la lista, o un domicilio compuesto solo por espacios
- **THEN** se rechaza en el servidor con un mensaje por campo y la base de datos conserva su propia validación

### Requirement: La religión y la pertenencia étnica son datos sensibles con acceso restringido
La religión y la pertenencia étnica (datos sensibles según la NTS 139) SHALL ser siempre opcionales y SHALL guardarse aparte del
resto de la filiación, con acceso solo para el administrativo. Ningún otro rol SHALL leerlas ni modificarlas. No SHALL aparecer
en los resultados de búsqueda de pacientes, en el portal, en los correos, en los registros del servidor ni como valor copiado a
la auditoría.

#### Scenario: Registro sin datos sensibles
- **WHEN** el administrativo registra a un paciente sin informar religión ni pertenencia étnica
- **THEN** el registro es válido y la historia puede abrirse igual

#### Scenario: Solo el administrativo los lee y los modifica
- **WHEN** el administrativo guarda la religión de un paciente y luego la consulta
- **THEN** la recibe, y un médico a cargo del paciente, una enfermera, el propio paciente y una sesión sin rol no reciben ninguna fila y no pueden escribir (negativo)

#### Scenario: No se copian a la auditoría ni a la búsqueda
- **WHEN** se guarda o modifica la religión de un paciente y se busca a ese paciente
- **THEN** ningún registro de auditoría contiene el valor y el resultado de la búsqueda no lo incluye

### Requirement: Crear la historia clínica es una acción explícita, única por paciente y con la filiación completa
La historia clínica de un paciente SHALL abrirse solo con la acción explícita «Crear historia clínica» del administrativo, nunca
como efecto de registrar al paciente. SHALL exigir la filiación mínima completa (según el requisito anterior) y asignar el
número correlativo de historia. Un paciente SHALL tener como máximo una historia: si ya la tiene, la acción SHALL mostrar la
existente con su número y no crear otra ni consumir un número nuevo, también ante dos solicitudes simultáneas. Solo el
administrativo SHALL poder abrirla y, al hacerlo, solo SHALL ver el número de la historia, no su contenido. El alta SHALL quedar
auditada con el administrativo como autor. La filiación SHALL ser de solo lectura desde la historia clínica: solo se corrige
desde el registro del paciente.

#### Scenario: Abrir la historia de un paciente con la filiación completa
- **WHEN** el administrativo crea la historia de un paciente que no la tiene y cuya filiación está completa
- **THEN** se crea una historia con el siguiente número correlativo, la acción muestra ese número y el administrativo no recibe ningún contenido de la historia

#### Scenario: Registrar un paciente no abre su historia
- **WHEN** se registra un paciente, por recepción o por el portal
- **THEN** el paciente existe sin historia clínica hasta que el administrativo la crea

#### Scenario: Filiación incompleta
- **WHEN** el administrativo intenta crear la historia de un paciente con la filiación incompleta
- **THEN** se rechaza con «Falta completar la filiación del paciente para abrir su historia clínica», indicando qué falta, y no se crea ninguna historia

#### Scenario: Documento ya registrado, historia ya abierta
- **WHEN** el administrativo registra un paciente con un documento que ya existe y que ya tiene historia
- **THEN** se rechaza con «Ya existe un paciente con ese documento», se muestra la ficha existente con el número de su historia y no se crea ni un segundo paciente ni una segunda historia

#### Scenario: Dos aperturas simultáneas
- **WHEN** dos administrativos crean a la vez la historia del mismo paciente
- **THEN** existe una sola historia y ambos reciben el mismo número

#### Scenario: Otros roles no abren historias (negativo)
- **WHEN** un médico, una enfermera, un paciente o una sesión sin rol intenta abrir una historia
- **THEN** se rechaza por falta de permiso y no se crea ninguna fila

#### Scenario: La filiación no se edita desde la historia (negativo)
- **WHEN** un médico a cargo del paciente intenta modificar un dato de filiación del paciente
- **THEN** no cambia ninguna fila; la corrección solo se hace desde el registro de pacientes del administrativo
