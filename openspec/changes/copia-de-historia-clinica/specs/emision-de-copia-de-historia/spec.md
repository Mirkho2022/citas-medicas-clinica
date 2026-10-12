# Spec Delta

## Purpose

Generar la copia completa de la historia clínica, incluida la información de Psicología, sin que ninguna pantalla muestre
contenido clínico al personal que no puede verlo, dejando un rastro auditable que no copia el contenido, autenticando el
documento y entregándolo en persona al solicitante verificado.

> Nombres: sujetos a ADR-0030 (aún no aceptada). Esta capacidad no declara que el documento cumpla el requisito de «copia
> autenticada» de la NTS 139: eso lo decide el asesor legal (P-1, P-5).

<!-- REVISAR: el mecanismo de generación y entrega (design.md, D2) es una propuesta que necesita decisión del usuario: el documento impreso transita por el navegador y la impresora de recepción. -->

## ADDED Requirements

### Requirement: La copia se genera sin mostrar contenido clínico en pantalla
El sistema SHALL generar la copia como un documento cerrado, armado por el servidor, y SHALL NO mostrar su contenido clínico en
ninguna pantalla de la aplicación. Las pantallas de copias SHALL mostrar solo metadatos: folio, paciente, solicitante, número de
páginas y huella. Solo el administrativo SHALL poder pedir la generación, y solo de una solicitud `verificada`. El documento
SHALL NO guardarse en ningún almacenamiento del sistema ni en los registros del servidor.

#### Scenario: Generación de una solicitud verificada
- **WHEN** recepción pide generar la copia de una solicitud `verificada`
- **THEN** el sistema devuelve un documento para imprimir y la pantalla muestra solo folio, paciente, solicitante, número de páginas y huella

#### Scenario: La pantalla no muestra contenido
- **WHEN** recepción recorre todas las pantallas de una solicitud, antes y después de generar la copia
- **THEN** ninguna contiene texto clínico (motivo, anamnesis, diagnósticos, notas ni resultados)

#### Scenario: Solicitud no verificada o cerrada (negativo)
- **WHEN** se intenta generar la copia de una solicitud `solicitada`, `rechazada` o `emitida`
- **THEN** la operación se rechaza indicando que la solicitud no está en un estado que lo permita y no se entrega contenido

#### Scenario: Profesional, enfermera, paciente o sin rol (negativo)
- **WHEN** un profesional (aunque tenga al paciente a cargo), una enfermera, un paciente, un usuario sin rol o `anonymous` intenta generar una copia
- **THEN** la operación se rechaza por falta de permiso y no se entrega contenido

#### Scenario: Recepción sigue sin leer las tablas clínicas (negativo)
- **WHEN** el administrativo consulta directamente las tablas clínicas del paciente, antes o después de haber generado su copia
- **THEN** recibe cero filas

#### Scenario: Pedir el documento por una dirección directa
- **WHEN** alguien abre con una petición simple (no una orden de generar) la dirección del documento
- **THEN** no recibe contenido

#### Scenario: Cabeceras de no almacenamiento
- **WHEN** el servidor responde con el documento
- **THEN** la respuesta indica que es privada, que no se almacena y que no debe interpretarse como otro tipo de archivo

#### Scenario: Máximo de generaciones
- **WHEN** una solicitud ya fue generada tres veces sin confirmarse la entrega y se pide una cuarta
- **THEN** la operación se rechaza indicando que se alcanzó el máximo y que debe consultarse al responsable de la clínica

#### Scenario: Datos reales en modo demostración (negativo)
- **WHEN** la configuración de la aplicación no coincide con el modo de datos de la base, o el paciente no corresponde al modo vigente
- **THEN** la generación se rechaza sin entregar contenido

### Requirement: La copia incluye toda la historia, con la información de Psicología
La copia SHALL contener la filiación del paciente y toda la historia clínica registrada en el sistema: antecedentes (con su
vigencia), atenciones firmadas con sus addendas, adjuntos vigentes como anexos y, cuando existan, triajes, recetas (las anuladas
marcadas como tales), las secciones propias de cada especialidad y la información de Psicología (evaluaciones, resultados de
tests y notas de sesión). La información de Psicología SHALL incluirse aunque ningún usuario del personal, salvo un psicólogo a
cargo, pueda verla en pantalla.

#### Scenario: Paciente con atenciones de varias especialidades
- **WHEN** se genera la copia de un paciente atendido en Medicina general, Odontología y Fisioterapia
- **THEN** el documento contiene las atenciones firmadas de las tres, con autor, fecha de Lima, método de firma y sus addendas

#### Scenario: Paciente con información de Psicología
- **WHEN** se genera la copia de un paciente que tiene evaluaciones y notas de sesión de Psicología
- **THEN** el documento incluye esa información en su propia sección

#### Scenario: Paciente sin información de Psicología
- **WHEN** se genera la copia de un paciente sin registros de Psicología
- **THEN** el documento no tiene sección de Psicología y la solicitud registra que no se incluyó

#### Scenario: Un profesional que no es psicólogo sigue sin ver Psicología (negativo)
- **WHEN** se genera la copia de un paciente con Psicología y un profesional que no es psicólogo y lo tiene a cargo consulta las tablas de Psicología
- **THEN** no recibe ninguna fila: generar la copia no abre Psicología a nadie

#### Scenario: Historia sin registros
- **WHEN** se genera la copia de un paciente cuya historia no tiene atenciones, antecedentes ni adjuntos
- **THEN** el documento contiene la filiación y la constancia «La historia clínica no registra atenciones, antecedentes ni adjuntos a la fecha»

#### Scenario: Alcance declarado
- **WHEN** se genera cualquier copia
- **THEN** la carátula declara que contiene los registros electrónicos de la historia y que no incluye los documentos que obren solo en el archivo físico

### Requirement: Qué se excluye queda declarado
La copia SHALL NO incluir las atenciones sin firmar (borradores) ni los adjuntos anulados, y SHALL declarar en su índice cuántos
borradores y cuántos adjuntos anulados no se incluyeron, sin mostrar su contenido. El documento SHALL indicar el instante de
corte del contenido incluido.

#### Scenario: Borrador sin firmar
- **WHEN** el paciente tiene una atención sin firmar y se genera su copia
- **THEN** esa atención no aparece y el índice dice que hay un borrador sin firmar no incluido

#### Scenario: Atención firmada después del corte
- **WHEN** un profesional firma una atención después de generarse la copia
- **THEN** esa atención no figura en esa copia, cuyo corte es anterior

#### Scenario: Adjunto anulado
- **WHEN** el paciente tiene un adjunto anulado y uno vigente
- **THEN** el documento anexa solo el vigente y el índice declara un adjunto anulado no incluido

### Requirement: Toda tabla clínica queda cubierta por la copia
Una verificación automática SHALL fallar si existe en el sistema una tabla que no esté contemplada por el compilado de la copia
ni figure en una lista de exclusiones con su razón, de modo que una tabla clínica nueva no pueda quedar fuera de la copia sin que
nadie lo decida.

#### Scenario: Tabla clínica nueva sin clasificar
- **WHEN** se agrega a la base una tabla que ni el compilado ni la lista de exclusiones mencionan
- **THEN** la verificación automática falla y señala la tabla

#### Scenario: Todas clasificadas
- **WHEN** toda tabla está en el compilado o en la lista de exclusiones con su razón
- **THEN** la verificación automática pasa

### Requirement: Toda generación se registra sin copiar el contenido
El sistema SHALL registrar cada generación de una copia como un acceso de tipo copia, con quién la generó, el paciente, la
solicitud, la huella del contenido y la hora, en la misma transacción que la lectura. Si el registro no puede escribirse, el
contenido SHALL NO entregarse. Ningún registro (de acceso, de auditoría ni de la solicitud) SHALL contener texto clínico, y de la
información de Psicología SHALL registrarse solo que se incluyó, no cuánta ni cuál.

#### Scenario: Generación registrada
- **WHEN** recepción genera la copia de una solicitud verificada
- **THEN** queda un registro de acceso de tipo copia con el administrativo, el paciente, la solicitud, la huella y la hora, y se entrega el contenido

#### Scenario: El registro falla y no se entrega nada (negativo)
- **WHEN** el registro del acceso es rechazado
- **THEN** la operación completa se revierte, no se devuelve contenido y la solicitud no cambia

#### Scenario: Sin contenido en los registros
- **WHEN** se busca texto clínico del paciente en la solicitud, en los accesos y en la auditoría tras una generación
- **THEN** no se encuentra ninguno

#### Scenario: Revisión por el administrativo
- **WHEN** el administrativo revisa los accesos del paciente
- **THEN** ve las generaciones de copia con la solicitud enlazada, quién las hizo y cuándo, la marca «generada sin confirmar la entrega» cuando corresponda y la marca «verificó y entregó la misma persona» cuando corresponda

#### Scenario: Médico, paciente o enfermera (negativo)
- **WHEN** un profesional, un paciente o una enfermera intentan leer los accesos de tipo copia
- **THEN** no reciben ninguna fila

### Requirement: La copia lleva elementos de autenticación y no afirma validez legal
Cada página de la copia SHALL llevar el folio (el número de la solicitud) y «Página n de N». La carátula SHALL incluir el texto
de autenticación (clínica, fecha y hora de Lima, solicitante y responsable de la clínica), el sello, el índice de lo incluido y lo
excluido y la huella del contenido. El sistema SHALL guardar la misma huella en la solicitud y SHALL permitir comprobar, con el
folio y la huella, si un documento corresponde a una copia emitida, sin revelar contenido. El documento y las pantallas SHALL NO
declarar que la copia cumple la normativa peruana.

#### Scenario: Cada página identificada
- **WHEN** se genera una copia de varias páginas
- **THEN** todas llevan el folio y su numeración «Página n de N»

#### Scenario: Huella coherente
- **WHEN** se confirma la entrega de la copia
- **THEN** la huella guardada en la solicitud es la misma que se registró al generarla y la misma que imprime el documento

#### Scenario: Comprobación por folio y huella
- **WHEN** recepción comprueba un folio y una huella que corresponden a una copia emitida
- **THEN** el sistema responde que corresponde, con el estado y la fecha de emisión, y sin ningún contenido clínico

#### Scenario: Folio o huella que no corresponden (negativo)
- **WHEN** se comprueba un folio con una huella distinta de la emitida
- **THEN** el sistema responde que no corresponde

#### Scenario: Sin declaración legal
- **WHEN** se muestra o se imprime la copia
- **THEN** el texto dice qué es y quién la emitió, sin afirmar validez legal

### Requirement: La entrega es presencial y se confirma
La copia SHALL entregarse impresa, en persona, al solicitante verificado, y la entrega SHALL confirmarse en el sistema solo
después de haberse generado, indicando que el solicitante exhibió su documento original y que coincide con el verificado.
Confirmar SHALL pasar la solicitud a `emitida`, registrar quién la entregó y cuándo, y guardar las secciones incluidas, el
instante de corte y la huella de la generación. El sistema SHALL NO ofrecer descarga, enlace ni envío de la copia al paciente, ni
mostrarla en el portal.

#### Scenario: Entrega confirmada
- **WHEN** recepción imprime la copia ante el solicitante, este exhibe su documento y recepción confirma la entrega
- **THEN** la solicitud pasa a `emitida` con quién la entregó, la hora de Lima, las secciones incluidas y la huella

#### Scenario: Confirmar sin haber generado (negativo)
- **WHEN** se intenta confirmar la entrega de una solicitud `verificada` que nunca se generó
- **THEN** la operación se rechaza indicando que primero debe generarse la copia

#### Scenario: Confirmar sin cotejar el documento (negativo)
- **WHEN** se intenta confirmar sin declarar que el solicitante exhibió su documento original
- **THEN** la operación se rechaza y la solicitud no cambia

#### Scenario: Confirmar una huella que no se generó (negativo)
- **WHEN** se intenta confirmar con una huella distinta de las generadas para esa solicitud
- **THEN** la operación se rechaza

#### Scenario: Generada y no confirmada
- **WHEN** se generó la copia y el solicitante se fue sin recibirla
- **THEN** la solicitud sigue `verificada`, aparece marcada como generada sin confirmar en la revisión de accesos y puede volver a generarse hasta el máximo

#### Scenario: Paciente sin acceso por el portal (negativo)
- **WHEN** un paciente busca su historia o su copia en el portal
- **THEN** no existe ninguna pantalla ni descarga para ello y solo puede pedirla en recepción

#### Scenario: Constancia de entrega
- **WHEN** se confirma la entrega
- **THEN** el sistema ofrece imprimir una constancia sin contenido clínico (folio, paciente, solicitante, fecha, páginas y huella) para la firma del solicitante
