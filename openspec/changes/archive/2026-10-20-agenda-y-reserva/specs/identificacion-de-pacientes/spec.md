# Spec Delta

## Purpose

Identificar a cada paciente por un documento peruano válido (DNI o Carné de Extranjería) y permitir que el administrativo lo
busque y lo registre para agendarle citas, sin duplicar documentos ni exponer datos clínicos.

## ADDED Requirements

### Requirement: El documento de identidad es un DNI o un Carné de Extranjería válido
Todo documento de paciente SHALL indicar su tipo (DNI o Carné de Extranjería) y validarse en el servidor, antes de consultar
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
mostrar datos clínicos.

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
- **WHEN** el administrativo registra un paciente, lo que crea su carpeta de historia clínica vacía, y luego consulta
  historias clínicas, atenciones o antecedentes
- **THEN** no recibe ninguna fila

### Requirement: El administrativo busca pacientes por documento o apellido
El administrativo SHALL poder buscar pacientes por número de documento exacto o por el inicio de los apellidos, sin
distinguir mayúsculas. La búsqueda SHALL devolver como máximo 20 resultados con solo datos de identificación y contacto
(documento, nombres, apellidos, fecha de nacimiento, correo y teléfono), sin datos clínicos. Los caracteres comodín del
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
