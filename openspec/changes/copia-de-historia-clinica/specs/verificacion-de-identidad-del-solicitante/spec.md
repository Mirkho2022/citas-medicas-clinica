# Spec Delta

## Purpose

Asegurar que la copia de la historia clínica solo se entregue a quien demuestre ser el paciente, su representante legal o una
autoridad con el documento correspondiente, dejando registrado cómo se verificó, y que toda solicitud que no se pueda verificar
se rechace con motivo y quede registrada.

> Nombres: sujetos a ADR-0030 (aún no aceptada). Todo el contenido de esta capacidad sobre qué documentos se aceptan y cómo se
> acredita la representación es una **propuesta** pendiente del asesor legal.

<!-- REVISAR: qué documentos acreditan la representación, la edad de corte y el trato a una autoridad son propuestas del agente (design.md, D4). Validar con el asesor legal antes de usar datos reales. -->

## ADDED Requirements

### Requirement: La identidad se verifica contra el documento original y se registra cómo
El sistema SHALL exigir, para pasar una solicitud a `verificada`, que recepción confirme haber cotejado en persona el
documento de identidad original y vigente del solicitante, y SHALL registrar el método de verificación, el documento (tipo y
número), quién verificó y cuándo. Cuando el solicitante es el paciente y este tiene un documento registrado, el documento del
solicitante SHALL coincidir con el registrado.

#### Scenario: Paciente que acredita su identidad
- **WHEN** un paciente mayor de edad exhibe su DNI, que coincide con el registrado, y recepción verifica la solicitud
- **THEN** la solicitud pasa a `verificada` con el método, el documento, el verificador y la hora de Lima

#### Scenario: Documento que no coincide (negativo)
- **WHEN** el documento del solicitante `paciente` no coincide con el registrado del paciente
- **THEN** la verificación se rechaza indicando que no se pudo verificar la identidad y la solicitud sigue como estaba

#### Scenario: Sin confirmar el cotejo (negativo)
- **WHEN** recepción intenta verificar sin indicar el método o sin confirmar que cotejó el documento original
- **THEN** la verificación se rechaza y la solicitud no cambia

#### Scenario: Paciente con número provisional
- **WHEN** el paciente fue registrado con un número provisional y exhibe un documento oficial cuyos nombres, apellidos y fecha de nacimiento coinciden con su filiación
- **THEN** recepción puede verificar la solicitud anotando qué se cotejó, y esa nota queda registrada

#### Scenario: Otros roles no verifican (negativo)
- **WHEN** un profesional, una enfermera o un paciente intenta verificar o rechazar una solicitud
- **THEN** la operación se rechaza por falta de permiso y la solicitud no cambia

### Requirement: El representante legal y la autoridad acreditan su calidad
Cuando el solicitante no es el paciente, el sistema SHALL exigir su vínculo (padre o madre, tutor, curador o apoderado, en el caso
de un representante legal) y el documento que lo acredita (partida de nacimiento, resolución judicial, poder notarial o carta poder
con firma legalizada), con su referencia (número, fecha y entidad). Para una autoridad, SHALL exigir el oficio o la resolución con su
número y entidad. El tipo de acreditación SHALL ser coherente con el tipo de solicitante. El sistema SHALL NO conservar la imagen
de los documentos, solo su tipo y referencia.

#### Scenario: Madre de un menor
- **WHEN** la madre de un paciente menor de edad exhibe su DNI y la partida de nacimiento del menor y recepción la verifica
- **THEN** la solicitud pasa a `verificada` con el vínculo `padre_o_madre`, la acreditación «partida de nacimiento» y su referencia

#### Scenario: Representante sin acreditación (negativo)
- **WHEN** quien dice representar al paciente no presenta ningún documento que acredite su calidad
- **THEN** no se puede verificar la solicitud y recepción la rechaza con el motivo «representación no acreditada»

#### Scenario: Acreditación incoherente (negativo)
- **WHEN** se intenta verificar una solicitud de `representante_legal` sin vínculo o con una acreditación propia de otro tipo de solicitante (por ejemplo, un oficio)
- **THEN** la verificación se rechaza y la solicitud no cambia

#### Scenario: Autoridad con oficio
- **WHEN** una autoridad judicial o del Ministerio Público presenta un oficio con número y entidad y recepción verifica a quien lo recibe
- **THEN** la solicitud pasa a `verificada` con la acreditación «oficio» y su referencia

#### Scenario: Familiar de un adulto sin representación (negativo)
- **WHEN** un cónyuge o familiar de un paciente adulto, sin poder ni resolución, pide la copia
- **THEN** no cumple ninguna acreditación, la solicitud se rechaza con el motivo «solicitante sin legitimación» y queda registrada

#### Scenario: Sin imagen del documento
- **WHEN** una solicitud queda verificada
- **THEN** solo se guardan el tipo, el número y la referencia de los documentos, no su imagen

### Requirement: El paciente menor de edad no solicita por sí mismo
El sistema SHALL rechazar una solicitud de tipo paciente cuando el paciente es menor de 18 años a la fecha de la solicitud (hora de
Lima), indicando que la solicita su representante legal.

#### Scenario: Menor que se presenta solo (negativo)
- **WHEN** un paciente de 15 años intenta solicitar su propia historia como paciente
- **THEN** se rechaza indicando que la solicita su representante legal

#### Scenario: Cumple 18 años
- **WHEN** el paciente cumplió 18 años ayer
- **THEN** su solicitud como paciente se acepta

#### Scenario: Representante de un menor
- **WHEN** el padre del mismo menor de 15 años presenta su solicitud con su acreditación
- **THEN** se acepta

### Requirement: El rechazo queda registrado y es definitivo
Cuando no se puede verificar la identidad del solicitante, un representante no acredita serlo o el solicitante no tiene
legitimación, el sistema SHALL permitir a recepción rechazar la solicitud con un motivo (identidad no verificada,
representación no acreditada, solicitante sin legitimación, desistimiento, duplicada u otro; con detalle obligatorio cuando es
«otro»), y SHALL registrar quién la rechazó y cuándo. Una solicitud rechazada SHALL NO reabrirse ni dar acceso a ningún
contenido; quien reúna los documentos correctos abre una solicitud nueva.

#### Scenario: Rechazo por identidad no verificable
- **WHEN** el solicitante no puede exhibir un documento de identidad y recepción rechaza la solicitud
- **THEN** la solicitud queda `rechazada` con el motivo, quién la rechazó y la hora de Lima, y no se genera ninguna copia

#### Scenario: Rechazo sin motivo (negativo)
- **WHEN** se intenta rechazar sin indicar un motivo válido, o con «otro» sin detalle
- **THEN** la operación se rechaza y la solicitud no cambia

#### Scenario: Generar una copia de una solicitud rechazada (negativo)
- **WHEN** se intenta generar la copia de una solicitud rechazada
- **THEN** la operación se rechaza y no se entrega contenido

#### Scenario: Nueva solicitud con los documentos correctos
- **WHEN** quien fue rechazado vuelve con la acreditación completa y recepción registra una solicitud nueva
- **THEN** la solicitud nueva sigue su propio ciclo y la rechazada permanece en el historial

### Requirement: La verificación no expone contenido clínico
Las pantallas de registro, verificación y rechazo SHALL mostrar solo la filiación del paciente (nombres, apellidos y documento) y
los datos del solicitante, y SHALL NO mostrar ni dar acceso a ningún dato clínico.

#### Scenario: Pantalla de verificación
- **WHEN** recepción abre una solicitud para verificarla
- **THEN** ve la filiación del paciente y los datos del solicitante, y ningún dato clínico

#### Scenario: Cabeceras y título
- **WHEN** el servidor responde con una pantalla de copias
- **THEN** la respuesta indica que es privada y que no se almacena, el título es «Copia de historia clínica» y la dirección usa solo identificadores internos
