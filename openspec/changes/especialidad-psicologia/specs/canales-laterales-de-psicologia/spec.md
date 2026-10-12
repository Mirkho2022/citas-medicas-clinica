# Spec Delta

## Purpose

Que la excepción de Psicología no tenga canales laterales: que ninguna pantalla, conteo, mensaje de error, registro de auditoría,
derivación, lista de medicamentos o función del servidor delate o entregue información de Psicología a quien no puede verla, que
los demás profesionales vean los medicamentos y no los diagnósticos, y que la copia al paciente sea la única ventana.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional».
> <!-- REVISAR: la existencia de la atención psicológica no se oculta (citas, asignaciones, derivaciones, accesos); ocultarla es una decisión del usuario que reabriría H3, H6b y H6. Las reglas de salud mental se llevan al asesor legal. -->

## ADDED Requirements

### Requirement: Los demás profesionales ven los medicamentos, no los diagnósticos de Psicología
El sistema SHALL mostrar a todo profesional a cargo, de cualquier profesión, los medicamentos vigentes del paciente que salen de las
recetas, y SHALL NOT mostrarle los diagnósticos, las atenciones, las notas ni los resultados de Psicología. La lista de medicamentos
SHALL derivarse solo de las recetas y no depender de ninguna tabla de Psicología. El psicólogo a cargo SHALL ver la misma lista de
medicamentos que cualquier otro profesional a cargo.

#### Scenario: Médico con un paciente en Psicología
- **WHEN** un médico a cargo abre la historia de un paciente que tiene una evaluación de Psicología con un diagnóstico del capítulo F
- **THEN** ve los medicamentos vigentes y el resto de la historia compartida, y no ve ningún diagnóstico, ni marcador, ni aviso de información reservada

#### Scenario: Misma lista para el psicólogo
- **WHEN** un médico y un psicólogo, ambos a cargo del mismo paciente, consultan los medicamentos vigentes
- **THEN** obtienen exactamente las mismas filas

#### Scenario: La lista de medicamentos no es una puerta (negativo)
- **WHEN** se examinan las tablas de las que depende la lista de medicamentos y sus columnas
- **THEN** son solo las de recetas y sus medicamentos, no incluye identificador de atención ni texto de nota, y ninguna vista del esquema depende de una tabla de Psicología

#### Scenario: Una receta no se vincula a una atención de Psicología (negativo)
- **WHEN** un profesional intenta emitir una receta vinculada a una atención de un psicólogo, o un psicólogo intenta emitir una receta
- **THEN** la emisión se rechaza (la atención no corresponde a su autor; la profesión de psicólogo no está autorizada a recetar)

### Requirement: Ninguna pantalla delata lo que no puede mostrar
La interfaz SHALL NOT mostrar a un profesional que no es psicólogo ningún indicio de la información de Psicología del paciente:
ni filas vacías, ni «N registros reservados», ni mensajes de «sin permiso». Los contadores de la interfaz SHALL calcularse
bajo las mismas reglas de acceso y contar solo lo visible. La navegación SHALL ofrecer «Psicología» únicamente a un psicólogo,
determinado por la base. Una dirección de Psicología abierta por quien no es psicólogo, o por un psicólogo sin el paciente a
cargo, SHALL responder igual que una dirección inexistente.

#### Scenario: Historia de un no psicólogo
- **WHEN** un odontólogo a cargo abre la historia de un paciente con información de Psicología
- **THEN** ve el mismo número de atenciones que ve cualquier otro no psicólogo y ningún indicio de lo oculto

#### Scenario: Dirección directa (negativo)
- **WHEN** un médico abre la dirección de una nota o evaluación de Psicología de un paciente a su cargo
- **THEN** recibe la misma respuesta que ante un identificador inexistente, sin confirmar que existe

#### Scenario: Navegación
- **WHEN** un médico y un psicólogo abren su panel
- **THEN** solo el psicólogo ve la opción «Psicología»

#### Scenario: Administrativo, enfermera y paciente (negativo)
- **WHEN** el administrativo, una enfermera o un paciente abren cualquier dirección de Psicología
- **THEN** son dirigidos a su área o reciben la respuesta de «no existe», sin contenido

#### Scenario: Cabeceras y título
- **WHEN** el servidor responde con información de Psicología a un psicólogo
- **THEN** la respuesta indica que es privada y que no se almacena, el título de la pestaña es genérico («Historia clínica») y la dirección contiene solo identificadores

### Requirement: La auditoría y los conteos no filtran contenido
La auditoría de escritura y el registro de accesos SHALL registrar quién, cuándo, qué acción y qué identificadores, y SHALL NOT
copiar contenido de Psicología (textos, diagnósticos, respuestas, puntajes). Toda lectura de información de Psicología SHALL
registrarse en la misma transacción que la lectura, con su tipo de acceso (`psicologia` para las tablas de Psicología de este cambio; `plan_sesiones` e `instrumento` para las de los mecanismos comunes), y SHALL fallar cerrada si el registro falla.
Nadie SHALL poder fabricar un registro de acceso a Psicología sin ser psicólogo a cargo. Los indicadores y agregados existentes SHALL NOT
desglosar por especialidad, profesión del autor ni paciente lo reservado, y SHALL NOT construirse búsquedas, listados ni
estadísticas de Psicología entre pacientes.

#### Scenario: Texto centinela en la auditoría
- **WHEN** un psicólogo registra una nota, una evaluación y una aplicación de test con un texto centinela
- **THEN** ni `auditoria` ni `accesos_historia` ni ninguna solicitud de copia contienen el texto centinela

#### Scenario: Lectura atómica con registro
- **WHEN** un psicólogo abre la información de Psicología de un paciente y el registro de acceso falla (asignación vencida o perfil desactivado)
- **THEN** la transacción se revierte y no se devuelve contenido

#### Scenario: Acceso fabricado (negativo)
- **WHEN** un médico a cargo, el administrativo o un psicólogo sin el paciente a cargo intenta insertar un registro de acceso de tipo Psicología
- **THEN** la base lo rechaza

#### Scenario: Solo-agregar
- **WHEN** cualquier rol, incluido el dueño, intenta modificar o borrar un registro de acceso a Psicología
- **THEN** se rechaza

#### Scenario: Indicadores globales
- **WHEN** el administrativo consulta el indicador de digitalización o los indicadores de visitas
- **THEN** recibe solo totales globales, sin desglose por especialidad ni por psicólogo

#### Scenario: Revisión de accesos del administrativo
- **WHEN** el administrativo revisa los accesos a historias
- **THEN** ve los accesos a información reservada con una etiqueta genérica, sin saber si fue una nota, un test o una evaluación, y sin ningún contenido

### Requirement: Los mensajes de error no revelan existencia ni contenido
Los errores de la base y de la aplicación sobre información de Psicología SHALL traducirse a mensajes en español sin texto de la
base, sin nombres de tablas ni valores, y SHALL ser los mismos para «no existe» y «no autorizado». Un profesional que no es
psicólogo SHALL NOT poder distinguir, por un error de unicidad o de clave foránea, que existe una fila reservada.

#### Scenario: Reutilizar la cita de una sesión de Psicología (negativo)
- **WHEN** un médico intenta registrar una atención con el identificador de una cita de Psicología
- **THEN** recibe un error de coherencia o de permiso, nunca un error de unicidad que confirme que esa cita ya tiene una nota

#### Scenario: Mensaje uniforme
- **WHEN** un no psicólogo intenta abrir, modificar o crear una fila de Psicología
- **THEN** el mensaje es el mismo que ante un registro inexistente, sin mencionar Psicología ni la tabla

#### Scenario: Registro del servidor
- **WHEN** falla una operación sobre información de Psicología
- **THEN** el registro del servidor contiene solo el código SQLSTATE y la operación

### Requirement: Las funciones del servidor que leen información de Psicología son una lista cerrada
Las únicas funciones `SECURITY DEFINER` que SHALL leer las tablas reservadas son las de reserva, los disparadores propios, las
agregadas globales permitidas y la compilación de la copia de la historia; las funciones de huella no SHALL ser ejecutables por
`authenticated`. Ninguna vista ni estadística del planificador SHALL exponer filas reservadas a un rol sujeto a la reserva.

#### Scenario: Función nueva que lee una tabla reservada (negativo)
- **WHEN** se añade una función `SECURITY DEFINER` que menciona una tabla reservada y no está en la lista
- **THEN** la prueba de catálogo falla

#### Scenario: Función de huella
- **WHEN** un profesional intenta ejecutar la función que calcula la huella de una atención
- **THEN** la base rechaza la ejecución por falta de privilegios

#### Scenario: Estadísticas del planificador
- **WHEN** un médico a cargo consulta las estadísticas de columnas de las tablas reservadas
- **THEN** no recibe ninguna fila

#### Scenario: Vistas
- **WHEN** se buscan las vistas que dependen de tablas reservadas
- **THEN** no existe ninguna

### Requirement: La derivación de un psicólogo no lleva texto libre
Una derivación creada por un psicólogo SHALL NOT incluir motivo ni ningún texto libre, y ningún dato de Psicología SHALL viajar en la
derivación, la visita o el triaje. Derivar hacia Psicología SHALL ser una derivación ordinaria: el psicólogo que toma al paciente obtiene
acceso por la asignación, y el aislamiento se aplica por encima de ese acceso.

#### Scenario: Psicólogo deriva con motivo (negativo)
- **WHEN** un psicólogo que tiene a un paciente en atención deriva a otra especialidad con un motivo
- **THEN** la base lo rechaza

#### Scenario: Psicólogo deriva sin motivo
- **WHEN** el mismo psicólogo deriva sin motivo
- **THEN** la derivación se crea sin texto clínico y el profesional que la toma no recibe información de Psicología

#### Scenario: Derivar hacia Psicología no da acceso al resto
- **WHEN** un médico deriva a un paciente a Psicología y un psicólogo lo toma
- **THEN** el psicólogo lee la historia compartida del paciente y su propia información de Psicología, y el médico no obtiene acceso a lo que escriba el psicólogo

### Requirement: La copia al paciente incluye Psicología y es la única ventana
La copia de la historia que se entrega al paciente o a su representante legal SHALL incluir la información de Psicología firmada (evaluaciones
con sus diagnósticos, notas de sesión y resultados de tests) en su propia sección. El compilado de la copia SHALL ser la única vía por la que el
rol administrativo obtiene contenido de Psicología, sin mostrarlo en pantalla. La solicitud SHALL guardar solo que la copia incluye Psicología,
sin conteos ni contenido de esa sección, y la cuenta de borradores excluidos SHALL ser un agregado de todas las secciones.

#### Scenario: Copia con Psicología
- **WHEN** se compila la copia de un paciente con una evaluación y notas firmadas de Psicología
- **THEN** el compilado incluye una sección de Psicología con ellas, y las filas de autor psicólogo no aparecen además en la sección de atenciones

#### Scenario: Borradores
- **WHEN** el paciente tiene una nota de Psicología sin firmar
- **THEN** no entra en la copia, y la copia declara solo una cuenta total de borradores excluidos, sin separarla por Psicología

#### Scenario: La solicitud no guarda contenido
- **WHEN** se genera la copia
- **THEN** la solicitud guarda `incluye_psicologia` sin conteos de esa sección, y ni la solicitud ni la auditoría ni los accesos contienen el texto centinela

#### Scenario: El administrativo sigue sin leer las tablas (negativo)
- **WHEN** el administrativo consulta directamente las tablas de Psicología después de generar una copia
- **THEN** recibe cero filas

#### Scenario: Clasificación de las tablas
- **WHEN** la prueba de cobertura de la copia recorre las tablas del esquema
- **THEN** `notas_sesion_psicologia` y las tablas de Psicología de los mecanismos comunes figuran en el compilado
<!-- REVISAR: si el asesor determina que parte de la información de Psicología no puede entregarse completa, excluir una sección es una migración de una línea. -->
