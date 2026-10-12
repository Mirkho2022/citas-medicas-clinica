# Spec Delta

## Purpose

Derivar al paciente a una especialidad sin dar acceso a nadie, y conceder el acceso a su historia solo cuando un profesional de
esa especialidad lo toma, mediante una asignación trazable y de vigencia acotada, de modo que la enfermera nunca elija a
quién se asigna un paciente y que dos profesionales no puedan tomar al mismo paciente.

## ADDED Requirements

### Requirement: Se deriva a una especialidad, nunca a un profesional
El sistema SHALL permitir derivar una visita a una especialidad, indicando la especialidad de destino y un motivo, y SHALL NOT
permitir indicar un profesional como destino en ningún caso. La enfermera SHALL poder derivar una visita sin cita que tenga al
menos un triaje; un profesional SHALL poder derivar una visita que tiene en atención. Al derivar, la visita SHALL quedar en
estado «derivada» a la espera de que un profesional de esa especialidad la tome. El motivo SHALL ser obligatorio y con
contenido, con un máximo de 300 caracteres, salvo cuando quien deriva es psicólogo (ver más abajo).

#### Scenario: La enfermera deriva a una especialidad
- **WHEN** la enfermera deriva a Odontología una visita sin cita que ya tiene triaje, con un motivo
- **THEN** la derivación queda pendiente, la visita pasa a «derivada» a Odontología y nadie obtiene acceso a la historia

#### Scenario: Derivar sin triaje previo (negativo)
- **WHEN** la enfermera intenta derivar una visita que no tiene ningún triaje
- **THEN** se rechaza con «Registre el triaje antes de derivar al paciente»

#### Scenario: Derivar a un profesional concreto (negativo)
- **WHEN** una solicitud intenta indicar un profesional como destino de la derivación
- **THEN** el sistema no ofrece esa opción: no existe ese dato en la derivación y la solicitud se rechaza

#### Scenario: La enfermera deriva a un paciente con cita (negativo)
- **WHEN** la enfermera intenta derivar una visita que está asociada a una cita
- **THEN** se rechaza: ese paciente ya tiene al profesional de su cita, y solo ese profesional puede derivarlo después

#### Scenario: Motivo vacío (negativo)
- **WHEN** se deriva sin motivo, con solo espacios o con más de 300 caracteres
- **THEN** se rechaza con un mensaje por campo

#### Scenario: Otros roles no derivan (negativo)
- **WHEN** el administrativo, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intenta derivar
- **THEN** se rechaza por falta de permiso

#### Scenario: Escritura directa (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar derivaciones con una sentencia directa
- **THEN** se rechaza por falta de privilegios

### Requirement: Derivar no da acceso a la historia clínica
Crear una derivación SHALL NOT conceder acceso a ningún dato clínico del paciente a ningún profesional, ni siquiera a los de la
especialidad de destino, ni a la enfermera que derivó. Mientras nadie tome al paciente, ningún profesional SHALL tenerlo a cargo.

#### Scenario: Profesionales de la especialidad destino antes de tomar (negativo)
- **WHEN** se deriva un paciente a una especialidad con tres profesionales y todos intentan leer su historia, atenciones,
  antecedentes y triajes
- **THEN** ninguno recibe ninguna fila y ninguno lo tiene a cargo

#### Scenario: La enfermera tras derivar (negativo)
- **WHEN** la enfermera que derivó intenta leer la historia o las atenciones del paciente
- **THEN** no recibe ninguna fila

#### Scenario: Recepción tras derivar (negativo)
- **WHEN** el administrativo intenta leer el motivo de la derivación o el contenido clínico del paciente
- **THEN** no recibe ninguna fila; solo ve el estado de la visita y la especialidad que espera

### Requirement: Los profesionales de la especialidad ven quién espera, sin contenido clínico
El sistema SHALL mostrar a un profesional activo las derivaciones pendientes y vigentes de su propia especialidad, con
únicamente el nombre y apellidos del paciente, la hora de llegada, la hora de la derivación y si la hizo la enfermera o un
profesional. El sistema SHALL NOT mostrarle documento, fecha de nacimiento, sexo, motivo, triaje ni las derivaciones de otras
especialidades, ni a ningún rol distinto de profesional.

#### Scenario: Bandeja de la especialidad
- **WHEN** un odontólogo abre su bandeja con una derivación pendiente a Odontología
- **THEN** ve el nombre del paciente, cuánto lleva esperando y quién lo derivó, y nada más

#### Scenario: Derivaciones de otra especialidad (negativo)
- **WHEN** un fisioterapeuta consulta la bandeja mientras hay una derivación pendiente a Odontología
- **THEN** no la ve

#### Scenario: Derivación vencida o de una visita cerrada (negativo)
- **WHEN** la derivación pendiente venció o su visita se cerró
- **THEN** no aparece en la bandeja

#### Scenario: Otros roles (negativo)
- **WHEN** una enfermera, un administrativo, un paciente, una sesión sin rol o `anonymous` pide la bandeja de derivaciones
- **THEN** se rechaza por falta de permiso

### Requirement: Tomar al paciente concede el acceso mediante una asignación acotada
Un profesional activo de la especialidad de destino SHALL poder tomar una derivación pendiente y vigente. Al tomarla, la
derivación SHALL pasar a tomada, la visita a «en atención» con ese profesional, y el sistema SHALL registrar en las asignaciones
paciente-profesional una única fila nueva, que no se puede editar ni borrar, con motivo `derivacion:` seguido del identificador de
la derivación, vigente desde hoy (fecha de `America/Lima`) hasta una fecha límite fija. La vigencia propuesta es de 7 días desde
el día de la toma, y es la decisión abierta de este change. Esa asignación SHALL seguir siendo la única fuente de acceso a la
historia: no SHALL existir otra vía por la que una derivación conceda lectura.

#### Scenario: Toma por un profesional de la especialidad
- **WHEN** un odontólogo toma una derivación pendiente a Odontología
- **THEN** la visita queda en atención con él, la derivación queda tomada, existe exactamente una asignación con motivo
  `derivacion:<id>` a su nombre con la vigencia acordada, y desde ese momento tiene al paciente a cargo

#### Scenario: Los demás profesionales no ganan acceso (negativo)
- **WHEN** un profesional toma al paciente
- **THEN** sus colegas de la especialidad que no lo tomaron siguen sin tenerlo a cargo ni leer su historia

#### Scenario: Vigencia acotada
- **WHEN** pasa la fecha límite de la asignación por derivación
- **THEN** el profesional deja de tener al paciente a cargo y no puede leer su historia ni editar ni firmar un borrador

#### Scenario: La asignación no se revoca al terminar la visita
- **WHEN** el profesional termina la atención o deriva al paciente a otra especialidad
- **THEN** la asignación sigue vigente hasta su fecha límite

#### Scenario: Tomar un paciente que ya tiene otra asignación vigente
- **WHEN** el profesional ya tenía al paciente a cargo por una cita y además toma una derivación
- **THEN** se registra igualmente la asignación por derivación y el acceso no se interrumpe

#### Scenario: Asignación por derivación escrita a mano (negativo)
- **WHEN** el administrativo, un profesional o la enfermera intenta insertar una asignación con motivo que empieza por
  `derivacion:`
- **THEN** se rechaza; solo la toma de una derivación puede crearla

#### Scenario: La asignación es append-only (negativo)
- **WHEN** cualquier rol de usuario intenta modificar o borrar la asignación creada al tomar
- **THEN** se rechaza

### Requirement: Solo un profesional de la especialidad destino puede tomar
El sistema SHALL rechazar la toma de una derivación por cualquiera que no sea un profesional activo, con perfil activo, de la
especialidad de destino. La enfermera, el administrativo, el paciente, una sesión sin rol, `anonymous`, el rol del cron y el rol de
sincronización SHALL NOT poder tomar. El rechazo SHALL aplicarse en la base de datos y no solo en la pantalla.

#### Scenario: Profesional de otra especialidad (negativo)
- **WHEN** un fisioterapeuta intenta tomar una derivación a Odontología, aun conociendo el identificador de la visita
- **THEN** se rechaza con «Este paciente no está derivado a su especialidad ni corresponde a su cita» y no se crea ninguna
  asignación

#### Scenario: Profesional dado de baja o con perfil desactivado (negativo)
- **WHEN** un odontólogo inactivo o con el perfil desactivado intenta tomar
- **THEN** se rechaza por falta de permiso

#### Scenario: La enfermera no elige a quién se asigna (negativo)
- **WHEN** la enfermera intenta tomar una visita, asignarla a un profesional o insertar una asignación
- **THEN** se rechaza en todos los casos y no existe ninguna operación que reciba un profesional como destino

#### Scenario: Visita sin cita que no fue derivada (negativo)
- **WHEN** un profesional intenta tomar a un paciente sin cita que aún no fue derivado
- **THEN** se rechaza; la enfermera deriva primero

### Requirement: Un solo profesional toma a cada paciente
El sistema SHALL garantizar, a prueba de concurrencia, que si dos o más profesionales intentan tomar a la vez la misma visita,
exactamente uno prospera y los demás reciben «Otro profesional ya tomó a este paciente»; solo el que prospera recibe la
asignación.

#### Scenario: Cinco profesionales toman a la vez
- **WHEN** cinco profesionales de la especialidad intentan tomar la misma visita en el mismo instante
- **THEN** uno la toma, los otros cuatro reciben el mensaje de concurrencia y existe una sola asignación por derivación

#### Scenario: Tomar una visita ya tomada (negativo)
- **WHEN** un profesional intenta tomar una visita que ya está en atención con otro
- **THEN** se rechaza con el mismo mensaje

#### Scenario: Derivar y tomar a la vez
- **WHEN** la enfermera anula la derivación mientras un profesional intenta tomarla
- **THEN** solo una de las dos operaciones prospera y el estado final es coherente

### Requirement: Toma de un paciente que llegó con cita
El sistema SHALL permitir al profesional de la cita tomar una visita con cita que esté en estado llegada o con triaje, siempre que
la cita siga confirmada o atendida y el profesional tenga al paciente a cargo. Esta toma SHALL NOT crear una asignación nueva (la
cita ya la concedió) y SHALL NOT exigir que exista un triaje, aunque la falta de triaje SHALL quedar visible y contarse en los
indicadores. Otro profesional SHALL NOT poder tomar una visita con cita.

#### Scenario: Toma por el profesional de la cita
- **WHEN** el profesional de la cita toma a su paciente tras el triaje
- **THEN** la visita queda en atención, se fija la hora de inicio de la atención y no se crea ninguna asignación nueva

#### Scenario: Toma sin triaje
- **WHEN** el profesional de la cita toma a su paciente sin que haya triaje
- **THEN** la toma prospera, la bandeja muestra «sin triaje» y el indicador cuenta una atención sin triaje previo

#### Scenario: Otro profesional (negativo)
- **WHEN** un profesional que no es el de la cita intenta tomar la visita
- **THEN** se rechaza

#### Scenario: Cita cancelada o reprogramada después de la llegada (negativo)
- **WHEN** la cita de la visita fue cancelada o reprogramada tras la llegada y el profesional intenta tomarla
- **THEN** se rechaza y recepción debe cerrar la visita y registrar una llegada nueva

### Requirement: Derivación entre profesionales
Un profesional SHALL poder derivar a otra especialidad a un paciente que tiene en atención, indicando el motivo. Al hacerlo, su
derivación tomada SHALL cerrarse, la visita SHALL volver a «derivada» a la nueva especialidad, y el profesional de destino SHALL
obtener acceso solo al tomarla. El profesional SHALL NOT poder derivar a su propia especialidad (para un colega de su misma
especialidad existe la asignación manual del módulo de historias clínicas), ni a un paciente que no tiene en atención.

#### Scenario: Odontólogo deriva a Fisioterapia
- **WHEN** un odontólogo que tiene a un paciente en atención lo deriva a Fisioterapia con un motivo
- **THEN** su derivación se cierra, la visita queda derivada a Fisioterapia y los fisioterapeutas no tienen acceso hasta que uno
  la tome

#### Scenario: Derivar a la propia especialidad (negativo)
- **WHEN** un odontólogo intenta derivar a Odontología un paciente que tiene en atención
- **THEN** se rechaza con una indicación de usar la asignación manual para un colega

#### Scenario: Derivar a un paciente que no tiene en atención (negativo)
- **WHEN** un profesional intenta derivar a un paciente que está en la sala de espera o que atiende otro profesional
- **THEN** se rechaza, aunque conozca el identificador de la visita

#### Scenario: Corregir una derivación equivocada
- **WHEN** quien derivó anula su derivación mientras sigue pendiente
- **THEN** la derivación queda anulada, la visita vuelve al estado anterior a derivar y puede derivarse a otra especialidad

#### Scenario: Corregir la derivación de otra persona (negativo)
- **WHEN** alguien distinto de quien derivó intenta anular una derivación
- **THEN** se rechaza

### Requirement: La información de Psicología sigue aparte
Una derivación hecha por un psicólogo SHALL NOT llevar texto libre, para que ningún detalle de sus sesiones llegue a otras
especialidades por esa vía. Derivar hacia Psicología SHALL funcionar como cualquier otra derivación, y el acceso que obtiene el
psicólogo al tomar SHALL quedar sujeto al aislamiento de la información de Psicología, que se aplica por encima del acceso.
Este módulo SHALL NOT crear ni leer resultados de tests ni notas de sesión.

#### Scenario: Derivación desde Psicología sin motivo
- **WHEN** un psicólogo deriva a un paciente que tiene en atención a otra especialidad
- **THEN** la derivación se crea sin motivo y el profesional destino no recibe texto del psicólogo

#### Scenario: Psicólogo escribe un motivo (negativo)
- **WHEN** un psicólogo intenta derivar con un motivo escrito
- **THEN** se rechaza con la indicación de que los detalles de Psicología no se comparten al derivar

#### Scenario: Derivar hacia Psicología
- **WHEN** la enfermera deriva a Psicología a un paciente sin cita y un psicólogo lo toma
- **THEN** el psicólogo obtiene la asignación por derivación y su información de Psicología sigue accesible solo a los psicólogos

### Requirement: Casos borde de la derivación
El sistema SHALL resolver en la base de datos estos casos: una especialidad sin profesional activo, una derivación pendiente que
venció, un paciente derivado dos veces, una visita abandonada con derivación pendiente y una asignación cuya vigencia terminó.

#### Scenario: Especialidad sin profesional activo (negativo)
- **WHEN** se deriva a una especialidad en la que ningún profesional está activo
- **THEN** se rechaza con «No hay profesionales activos en esa especialidad. Elija otra» y no se crea la derivación

#### Scenario: Profesional dado de baja después de derivar
- **WHEN** el único profesional de la especialidad se da de baja con una derivación pendiente
- **THEN** la derivación sigue pendiente, recepción la ve marcada como sin profesional disponible y vence al terminar el día

#### Scenario: Derivación pendiente vencida (negativo)
- **WHEN** un profesional intenta tomar una derivación que venció al terminar el día de la derivación
- **THEN** se rechaza con «La derivación venció. Pida a enfermería que derive de nuevo»

#### Scenario: Paciente derivado dos veces
- **WHEN** la enfermera deriva una visita que ya tiene una derivación pendiente
- **THEN** se rechaza con «Ya hay una derivación pendiente. Anúlela para elegir otra especialidad», y tras anularla puede derivar
  a otra

#### Scenario: Visita abandonada con derivación pendiente
- **WHEN** la visita se cierra como abandonada
- **THEN** su derivación pendiente queda vencida y no se puede tomar

#### Scenario: Derivación a una especialidad en la que el paciente ya fue derivado antes
- **WHEN** un paciente fue derivado a Odontología en una visita anterior ya terminada y hoy llega de nuevo y se deriva a Odontología
- **THEN** se crea una derivación nueva ligada a la visita de hoy, sin tocar la anterior

#### Scenario: Asignación por derivación vencida
- **WHEN** la fecha límite de la asignación por derivación pasó y el paciente vuelve sin cita
- **THEN** el profesional no lo tiene a cargo y debe tomarlo de nuevo mediante una derivación nueva

### Requirement: El profesional termina su atención
El profesional que tiene una visita en atención SHALL poder terminarla, con lo que la visita pasa a atendida con su hora de
finalización y la derivación tomada se cierra. Ningún otro rol, ni otro profesional, SHALL poder terminarla. Terminar la atención
SHALL NOT cambiar el estado de la cita ni revocar la asignación.

#### Scenario: Terminar la atención
- **WHEN** el profesional termina la atención de su paciente
- **THEN** la visita queda atendida, la derivación tomada queda cerrada y el estado de la cita no cambia

#### Scenario: Otro profesional o la enfermera (negativo)
- **WHEN** un profesional que no tiene la visita, la enfermera o el administrativo intenta terminarla
- **THEN** se rechaza

### Requirement: Rastro de las derivaciones sin contenido
Toda derivación creada, tomada, anulada o cerrada SHALL quedar en la auditoría con quién, cuándo y qué registro, sin copiar el
motivo, para que el administrativo, que lee la auditoría, no acceda a texto clínico por esa vía. Quién puede leer las
derivaciones SHALL limitarse a quien las creó y al profesional que las tomó.

#### Scenario: Auditoría sin motivo
- **WHEN** la enfermera crea una derivación con un motivo
- **THEN** la auditoría registra el actor, la acción y el identificador, pero no el motivo

#### Scenario: Quién lee las derivaciones
- **WHEN** un profesional consulta directamente las derivaciones
- **THEN** solo ve las que creó o tomó; el administrativo, la enfermera, el paciente, `anonymous`, el rol del cron y el rol de
  sincronización no reciben ninguna fila
