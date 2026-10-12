# Spec Delta

## Purpose

Que un psicólogo registre una evaluación estructurada y aplique tests de uso libre con puntaje calculado por el sistema, con las
mismas garantías del resto del registro clínico (sin campos vacíos, firmada e inmutable, validada en la base) y con el resultado
legible solo por los psicólogos que tienen al paciente a cargo.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional».
> <!-- REVISAR: los campos de la plantilla, sus opciones y los instrumentos del catálogo son una propuesta a validar con los psicólogos de la clínica; las licencias de los tests no están verificadas. -->

## ADDED Requirements

### Requirement: La evaluación estructurada usa la plantilla de Psicología y solo la registra un psicólogo
El sistema SHALL registrar la evaluación inicial y las reevaluaciones de Psicología como atenciones con la plantilla vigente de
Psicología, cuyos campos obligatorios (tipo de evaluación, origen de la consulta, tratamientos previo y actual, antecedentes
familiares de salud mental, consumo de sustancias, orientación, ánimo y afecto, pensamiento, juicio y riesgo de autolesión) SHALL tener contenido
real, tipo, rango y opciones válidos, validados por el servidor y por la base. La atención SHALL incluir de uno a diez diagnósticos
CIE-10 con su tipo. La plantilla SHALL poder usarla únicamente un psicólogo, y un psicólogo SHALL usar solo la plantilla vigente de
Psicología; si no se cumple, la base SHALL rechazar la atención con `SQLSTATE HC070` o `HC074`.

#### Scenario: Evaluación completa
- **WHEN** un psicólogo a cargo envía una evaluación con todos los campos de la plantilla y al menos un diagnóstico CIE-10
- **THEN** la evaluación se guarda y puede firmarse

#### Scenario: Campo obligatorio vacío
- **WHEN** falta un campo obligatorio de la plantilla, o solo tiene espacios o caracteres invisibles, o el riesgo de autolesión no se indica
- **THEN** no se guarda nada y la respuesta indica ese campo

#### Scenario: Valor fuera de las opciones
- **WHEN** un campo de opción llega con un valor que no está en la lista, o un campo de sí/no llega como texto
- **THEN** se rechaza indicando el campo, sin convertir el valor

#### Scenario: Médico u otra profesión usa la plantilla de Psicología (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo, aunque esté registrado en la especialidad Psicología por error, envía una atención con la plantilla de Psicología
- **THEN** la base lo rechaza con `HC070` y no se guarda la atención

#### Scenario: Psicólogo sin la plantilla de Psicología (negativo)
- **WHEN** un psicólogo envía una atención sin plantilla o con la plantilla de otra especialidad
- **THEN** la base lo rechaza con `HC074`

#### Scenario: Rótulos de Psicología
- **WHEN** el psicólogo abre el formulario de la evaluación
- **THEN** los cuatro textos genéricos se rotulan «Motivo de consulta», «Historia del problema y antecedentes personales», «Examen mental» y «Plan terapéutico», sin cambiar sus reglas de «sin campos vacíos»

#### Scenario: Marcar riesgo alto no dispara alertas
- **WHEN** el psicólogo registra `riesgo_alto`
- **THEN** el sistema guarda el dato y no envía alertas ni avisos a nadie

### Requirement: La evaluación firmada es inmutable y su lectura es reservada
Una evaluación firmada SHALL quedar inmutable, con sello de hora del servidor y huella que cubra la plantilla y sus datos; se corrige
con una addenda. La evaluación, sus addendas y sus diagnósticos SHALL poder leerlos solo los psicólogos que tienen al paciente a cargo, con el
caso negativo para cada rol y profesión de `aislamiento-de-informacion-de-psicologia`.

#### Scenario: Modificar tras la firma (negativo)
- **WHEN** alguien intenta cambiar los datos de especialidad o los diagnósticos de una evaluación firmada
- **THEN** se rechaza y la corrección se hace con una addenda

#### Scenario: Hora de firma del servidor
- **WHEN** el cliente envía una hora de firma distinta de la actual
- **THEN** la base guarda la hora del servidor

#### Scenario: Lectura de la evaluación por otras profesiones (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo a cargo, el administrativo, una enfermera o el paciente intentan leer la evaluación o sus diagnósticos
- **THEN** no reciben ninguna fila

#### Scenario: Otro psicólogo a cargo
- **WHEN** otro psicólogo con el paciente a cargo consulta la evaluación firmada
- **THEN** la ve

#### Scenario: Borrador de otro psicólogo
- **WHEN** un psicólogo a cargo consulta un borrador de evaluación de otro psicólogo
- **THEN** lo ve, igual que ocurre con los borradores de la historia compartida
<!-- REVISAR: U6 de design.md; los borradores de nota de sesión, en cambio, son visibles solo para su autor. -->

### Requirement: Los tests con puntaje automático son de uso libre y solo se cargan con licencia verificada
El sistema SHALL ofrecer tests de Psicología a través del mecanismo común de instrumentos de evaluación con `area = psicologia`, y SHALL
permitir aplicar únicamente instrumentos marcados de uso libre cuya referencia de licencia esté escrita. Los instrumentos propuestos
(PHQ-9, GAD-7, AUDIT y PCL-5) SHALL NOT cargarse en la base hasta que la licencia de cada uno se verifique y se escriba su referencia y la fecha de verificación. El sistema SHALL NOT incluir
instrumentos de licencia comercial.

#### Scenario: Instrumento sin licencia verificada (negativo)
- **WHEN** se intenta cargar o aplicar un instrumento de Psicología sin uso libre, sin referencia de licencia o sin fecha de verificación
- **THEN** la base lo rechaza y no se guarda la aplicación

#### Scenario: Instrumento verificado
- **WHEN** una migración carga un instrumento con la referencia de su licencia y la fecha de verificación
- **THEN** el psicólogo puede aplicarlo y la referencia consta en el catálogo

#### Scenario: Catálogo
- **WHEN** se examina el catálogo de Psicología
- **THEN** cada instrumento tiene clave, ítems, regla de puntaje, interpretación y referencia de licencia, y no figuran BDI-II, BAI, STAI, HADS ni MMPI

### Requirement: El puntaje lo calculan el servidor y la base y no se puede alterar
Al aplicar un test, el sistema SHALL exigir todas las respuestas dentro del rango del instrumento y SHALL calcular el puntaje en el
servidor y en la base a partir de ellas; el cliente SHALL NOT poder enviar ni modificar el puntaje. El profesional SHALL poder ajustar la
interpretación pero NO el puntaje. Una respuesta omitida SHALL rechazarse y nunca puntuarse parcialmente.

#### Scenario: Puntaje calculado
- **WHEN** el psicólogo envía todas las respuestas de un instrumento habilitado
- **THEN** el sistema guarda las respuestas y el puntaje calculado, y muestra la interpretación habitual

#### Scenario: Casos de borde por instrumento
- **WHEN** se aplican un test con todas las respuestas en el mínimo y otro con todas en el máximo
- **THEN** los puntajes son el mínimo y el máximo de su regla, y coinciden el cálculo del servidor y el de la base

#### Scenario: Respuesta omitida o fuera de rango (negativo)
- **WHEN** falta una respuesta o un valor está fuera del rango
- **THEN** se rechaza y no se guarda nada

#### Scenario: El cliente envía un puntaje (negativo)
- **WHEN** una solicitud incluye un puntaje distinto del que resulta de las respuestas
- **THEN** se ignora o se rechaza y se guarda el calculado

#### Scenario: Ajuste de la interpretación
- **WHEN** el psicólogo ajusta la interpretación de un resultado
- **THEN** la interpretación queda ajustada, el puntaje no cambia y el ajuste queda atribuido

#### Scenario: Ítem de riesgo
- **WHEN** un test incluye un ítem de ideación o autolesión y se responde de forma positiva
- **THEN** el resultado muestra el ítem destacado al psicólogo, sin alertas ni avisos automáticos

### Requirement: Solo un psicólogo aplica tests de Psicología y solo los psicólogos a cargo leen el resultado
Aplicar un instrumento de `area = psicologia` SHALL ser exclusivo de un psicólogo que tenga al paciente a cargo, y la base SHALL
rechazar a cualquier otro con `SQLSTATE HC090` (mecanismo común de instrumentos). Las respuestas, los puntajes y las interpretaciones SHALL poder leerlos solo los
psicólogos que tienen al paciente a cargo. Un instrumento de otra área aplicado por un psicólogo SHALL quedar igualmente reservado.

#### Scenario: Otra profesión aplica el test (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo a cargo intenta aplicar un instrumento de Psicología
- **THEN** la base lo rechaza con `HC090`

#### Scenario: Otras profesiones leen el resultado (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo a cargo consulta las aplicaciones de un paciente con tests de Psicología
- **THEN** no recibe ninguna fila

#### Scenario: Otros roles (negativo)
- **WHEN** el administrativo, una enfermera, el paciente, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta leer o escribir aplicaciones de tests
- **THEN** recibe cero filas o la base lo rechaza

#### Scenario: Psicólogo a cargo
- **WHEN** un psicólogo a cargo consulta los tests del paciente
- **THEN** ve las respuestas, el puntaje y la interpretación, incluidos los aplicados por otro psicólogo a cargo

#### Scenario: Psicólogo sin el paciente a cargo (negativo)
- **WHEN** un psicólogo sin asignación vigente intenta aplicar o consultar un test del paciente
- **THEN** la base lo rechaza o no devuelve ninguna fila
