# Spec Delta

## Purpose

Que la información de Psicología (evaluaciones con sus diagnósticos, notas de sesión, resultados de tests y planes de sesiones) la
lea y la escriba únicamente un psicólogo que tiene al paciente a cargo, impuesto por la base de datos y no por la pantalla, con
falla cerrada, de modo que ningún cambio posterior pueda ampliar el acceso en silencio.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional» y `medico_tiene_paciente()`
> donde dice `profesional_tiene_paciente()`.
> <!-- REVISAR: las reglas de salud mental aplicables no están verificadas; se llevan al asesor legal. Este requisito no declara validez legal. -->

## ADDED Requirements

### Requirement: Solo un psicólogo con el paciente a cargo lee la información de Psicología
El sistema SHALL permitir leer la información de Psicología de un paciente únicamente a un profesional de profesión psicólogo que
tenga a ese paciente a cargo, es decir, con una asignación vigente a su nombre mientras el profesional y su perfil estén activos.
Ningún otro profesional, rol ni sesión SHALL poder leerla, ni por la pantalla ni consultando las tablas directamente ni
abriéndola por su dirección, y la restricción SHALL ser impuesta por la base de datos. La profesión SHALL provenir del registro
del profesional en la base, nunca del token ni del cliente.

#### Scenario: Psicólogo a cargo
- **WHEN** un psicólogo activo con una asignación vigente al paciente abre su información de Psicología
- **THEN** ve las evaluaciones, las notas de sesión, los resultados de tests y el plan de sesiones del paciente, incluidos los que escribió otro psicólogo a cargo

#### Scenario: Médico a cargo (negativo)
- **WHEN** un médico con el paciente a su cargo consulta las tablas de Psicología, las atenciones de autor psicólogo o abre una por su identificador
- **THEN** la base no le devuelve ninguna fila y la respuesta es indistinguible de la de un registro que no existe

#### Scenario: Odontólogo, fisioterapeuta o podólogo a cargo (negativo)
- **WHEN** un odontólogo, un fisioterapeuta o un podólogo con el paciente a su cargo hace lo mismo
- **THEN** no recibe ninguna fila de la información de Psicología, y sigue viendo el resto de la historia compartida

#### Scenario: Psicólogo sin el paciente a cargo (negativo)
- **WHEN** un psicólogo sin asignación al paciente, o con la asignación vencida ayer, o dado de baja, o con el perfil desactivado, intenta leer su información de Psicología
- **THEN** no recibe ninguna fila

#### Scenario: Administrativo (negativo)
- **WHEN** un administrativo consulta directamente cualquiera de esas tablas o abre su dirección
- **THEN** recibe cero filas o es dirigido a su área, y nunca ve contenido de Psicología (la copia al paciente es la única excepción, ver `canales-laterales-de-psicologia`)

#### Scenario: Enfermera (negativo)
- **WHEN** una enfermera consulta esas tablas o abre su dirección
- **THEN** recibe cero filas

#### Scenario: Paciente, incluso sobre su propia información (negativo)
- **WHEN** el paciente titular consulta esas tablas por cualquier medio
- **THEN** no recibe ninguna fila; su información le llega solo en la copia de su historia

#### Scenario: Sin rol y roles de servicio (negativo)
- **WHEN** una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta leer esas tablas
- **THEN** no recibe ninguna fila o la base rechaza la consulta por falta de privilegios

#### Scenario: La profesión no la dicta el cliente (negativo)
- **WHEN** un token de un médico trae un claim `profesion` con valor `psicologo`
- **THEN** el claim se ignora y no obtiene ninguna fila de Psicología

### Requirement: La reserva sigue al autor y cubre toda fila clínica de un psicólogo
El sistema SHALL tratar como información de Psicología toda fila clínica cuyo autor sea un psicólogo: la atención completa que
registra (motivo, anamnesis, examen, plan, datos de especialidad y **diagnósticos CIE-10**), sus addendas, los antecedentes y adjuntos
que registra, sus notas de sesión, sus aplicaciones de tests y sus planes de sesiones con sus sesiones. La fila de una atención
escrita por un psicólogo SHALL restringirse entera. Si el autor no se puede determinar como una profesión distinta de psicólogo,
la fila SHALL tratarse como reservada. Las filas de autores de otras profesiones SHALL seguir siendo legibles por todo
profesional a cargo, el psicólogo incluido.

#### Scenario: Atención de un psicólogo con diagnósticos (negativo para otras profesiones)
- **WHEN** un psicólogo firma una atención con un diagnóstico del capítulo F del CIE-10 y un médico, un odontólogo, un fisioterapeuta y un podólogo, todos a cargo del paciente, consultan las atenciones del paciente
- **THEN** ninguno de ellos recibe esa atención, ni sus textos, ni su diagnóstico, y el listado «Diagnósticos registrados» tampoco lo incluye

#### Scenario: Atención de otra profesión visible para el psicólogo
- **WHEN** un médico firma una atención del mismo paciente y el psicólogo a cargo la consulta
- **THEN** el psicólogo la ve (historia compartida): la restricción no bloquea de más

#### Scenario: Addenda de un psicólogo
- **WHEN** un psicólogo registra una addenda sobre su atención y un médico a cargo consulta las addendas
- **THEN** el médico no recibe esa addenda

#### Scenario: Addenda de otro autor sobre una atención reservada (negativo)
- **WHEN** existe una addenda de un médico adjunta a una atención de un psicólogo (insertada por el dueño en una prueba) y otro médico a cargo consulta las addendas
- **THEN** no la recibe, porque no puede ver la atención a la que pertenece

#### Scenario: Antecedente registrado por un psicólogo
- **WHEN** un psicólogo registra un antecedente de tipo `personal_patologico` y un médico a cargo consulta los antecedentes del paciente
- **THEN** el médico no recibe ese antecedente y sí los registrados por médicos

#### Scenario: Adjunto subido por un psicólogo
- **WHEN** un psicólogo registra un adjunto de respaldo y un odontólogo a cargo consulta los adjuntos del paciente
- **THEN** el odontólogo no recibe ese adjunto

#### Scenario: Autor no determinable (falla cerrada)
- **WHEN** se evalúa la reserva de una fila cuyo autor es nulo o no existe en los profesionales
- **THEN** la fila se trata como reservada y ningún no psicólogo la recibe

#### Scenario: El autor sin asignación no conserva acceso propio
- **WHEN** un psicólogo escribió una evaluación y su asignación al paciente venció
- **THEN** ya no la lee, igual que ocurre hoy con toda la historia, hasta que vuelva a tener al paciente a cargo
<!-- REVISAR: ADR-0031 dice «y su autor»; este requisito propone no crear una vía de acceso del autor independiente de la asignación (U4 de design.md). -->

### Requirement: La reserva se impone con una política restrictiva que ninguna política permisiva puede ampliar
La reserva SHALL implementarse como una política de seguridad por filas de tipo restrictivo en cada tabla reservada, combinada con
las políticas existentes mediante «y», y no reescribiendo las políticas permisivas. Una política permisiva añadida después sobre
cualquiera de esas tablas SHALL NOT ampliar la lectura de la información de Psicología. Las funciones de reserva SHALL ser
`SECURITY DEFINER` con ruta de búsqueda vacía y ejecutables solo por `authenticated`.

#### Scenario: Política permisiva añadida después (negativo)
- **WHEN** en una prueba se añade a `atenciones` una política permisiva que permite leer todo al administrativo
- **THEN** el administrativo sigue sin recibir las filas de autor psicólogo, y la prueba de catálogo marca la política añadida

#### Scenario: Política restrictiva eliminada (negativo)
- **WHEN** se elimina la política restrictiva de una tabla reservada
- **THEN** al menos una prueba negativa de la suite falla

#### Scenario: Cada tabla reservada tiene su política restrictiva
- **WHEN** se examina el catálogo de políticas de las tablas reservadas
- **THEN** cada una tiene una política restrictiva que llama a la función de reserva y ninguna política permisiva está dirigida a `anon`/`anonymous`

#### Scenario: Privilegios de las funciones
- **WHEN** se inspeccionan las funciones de reserva
- **THEN** `authenticated` puede ejecutarlas; `anonymous`, `cron_notificaciones`, `sync_identidad` y `PUBLIC` no; son `SECURITY DEFINER` con `search_path` vacío

#### Scenario: Las permisivas existentes no se tocan
- **WHEN** se comparan las políticas permisivas de `atenciones`, `addendas`, `antecedentes` y `adjuntos_historia` antes y después del cambio
- **THEN** son idénticas; lo único nuevo es una política restrictiva por tabla

### Requirement: Toda tabla con datos de paciente está clasificada
Toda tabla del esquema `public` con una columna `paciente_id`, `atencion_id` o `historia_id` SHALL figurar, con su razón, en una de tres
listas verificadas por la suite de pruebas: tablas reservadas (con política restrictiva), tablas compartidas por construcción (cuyo
autor nunca puede ser psicólogo) y tablas operativas. Una tabla nueva sin clasificar SHALL hacer fallar la suite.

#### Scenario: Tabla nueva sin clasificar (negativo)
- **WHEN** se crea en la transacción de prueba una tabla con `paciente_id` que no está en ninguna lista
- **THEN** la prueba de clasificación falla

#### Scenario: Tabla reservada sin política (negativo)
- **WHEN** una tabla figura como reservada pero no tiene política restrictiva
- **THEN** la prueba de clasificación falla

#### Scenario: Tablas de las especialidades siguientes
- **WHEN** un change posterior (odontología, fisioterapia, podología) crea sus tablas con datos de paciente
- **THEN** debe clasificarlas como compartidas u operativas en la prueba, con su razón

### Requirement: La información de Psicología solo la escribe un psicólogo con el paciente a cargo
El sistema SHALL permitir registrar información de Psicología únicamente a un psicólogo que tenga al paciente a cargo, con
autoría propia tomada de la sesión. Un profesional de otra profesión que intente registrarla SHALL ser rechazado por la base (`SQLSTATE HC070` en las notas y
en la plantilla de evaluación; `HC090` de los mecanismos comunes en los tests y los planes).

#### Scenario: Psicólogo a cargo registra
- **WHEN** un psicólogo con el paciente a cargo registra una evaluación, una nota, una aplicación de test o un plan
- **THEN** se guarda con su autoría

#### Scenario: Médico u otra profesión intenta registrar (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un podólogo intenta insertar una nota de sesión, una aplicación de un test de Psicología o un plan de Psicología
- **THEN** la base lo rechaza (`HC070` en la nota, `HC090` en el test y el plan) y no se guarda nada

#### Scenario: Psicólogo sin el paciente a cargo (negativo)
- **WHEN** un psicólogo sin asignación vigente intenta registrar información de Psicología de un paciente
- **THEN** la base lo rechaza por falta de permiso

#### Scenario: Autoría ajena (negativo)
- **WHEN** un psicólogo intenta registrar información a nombre de otro profesional
- **THEN** la base lo rechaza y no se guarda nada

#### Scenario: Otros roles (negativo)
- **WHEN** el administrativo, la enfermera, el paciente, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta insertar o modificar esas tablas
- **THEN** se rechaza por falta de permiso o de privilegios

### Requirement: No existe una vía de excepción en esta versión
El sistema SHALL NOT ofrecer ninguna función, rol ni bandera que permita leer la información de Psicología a quien no sea psicólogo a
cargo, ni siquiera con justificación o en una emergencia. Qué debe ocurrir en una emergencia es una pregunta abierta para el asesor
legal y SHALL NOT decidirse en este cambio.
<!-- REVISAR: emergencia o «romper el vidrio» (design.md D10) se lleva al asesor legal. -->

#### Scenario: Ningún atajo a la información reservada
- **WHEN** se examinan las funciones `SECURITY DEFINER` que leen las tablas reservadas
- **THEN** son exactamente las de la lista cerrada y ninguna está ejecutable por `authenticated` salvo las de reserva y las agregadas permitidas

#### Scenario: Otro profesional en una urgencia (negativo)
- **WHEN** un médico a cargo de un paciente necesita sus datos de Psicología y no es psicólogo
- **THEN** el sistema no se los entrega por ningún medio y el comportamiento es el mismo que en una consulta ordinaria

#### Scenario: Ausencia del psicólogo
- **WHEN** el psicólogo a cargo se da de baja y un administrativo asigna al paciente a otro psicólogo
- **THEN** el nuevo psicólogo, al tener al paciente a cargo, lee la información de Psicología, y la asignación queda en la auditoría
