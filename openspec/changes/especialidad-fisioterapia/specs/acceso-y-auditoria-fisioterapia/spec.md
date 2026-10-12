# Spec Delta

## Purpose

Que la información de Fisioterapia la lea todo profesional que tiene al paciente a cargo y la escriba solo un fisioterapeuta, que
ningún otro rol la vea, que cada lectura y cada escritura queden registradas sin copiar contenido clínico, que no admita datos reales
mientras la decisión legal siga abierta y que la copia de la historia la incluya.

## ADDED Requirements

### Requirement: Todo profesional a cargo lee la información de Fisioterapia
El sistema SHALL permitir a todo profesional activo que tenga al paciente a cargo, de cualquier profesión, leer los episodios, las
evaluaciones, las mediciones, los objetivos y las notas de sesión de Fisioterapia de ese paciente, y las vistas de comparación y de
estado de objetivos, con la misma regla de acceso que las atenciones. Esto incluye a un psicólogo a cargo, porque la información de
Fisioterapia no es información restringida. Un profesional sin el paciente a cargo, con la asignación vencida o con el perfil
desactivado SHALL NOT leer ninguna fila. Los borradores de evaluación SHALL ser visibles para los profesionales a cargo, como las
demás atenciones en borrador.

#### Scenario: Fisioterapeuta a cargo
- **WHEN** un fisioterapeuta con el paciente a cargo consulta sus episodios, evaluaciones, mediciones, objetivos y notas
- **THEN** recibe todas las filas de ese paciente

#### Scenario: Otras profesiones a cargo
- **WHEN** un médico, un odontólogo, un psicólogo o un podólogo con el paciente a cargo consulta la información de Fisioterapia
- **THEN** la lee, sin controles de edición

#### Scenario: Sin el paciente a cargo (negativo)
- **WHEN** un profesional, incluso un fisioterapeuta, que no tiene al paciente a cargo consulta esas tablas
- **THEN** no recibe ninguna fila

#### Scenario: Asignación vencida o perfil desactivado (negativo)
- **WHEN** la asignación del profesional venció, o su perfil fue desactivado
- **THEN** no recibe ninguna fila

#### Scenario: Paciente que fue derivado
- **WHEN** un fisioterapeuta obtuvo al paciente por derivación y tiene la asignación vigente
- **THEN** lee la información de Fisioterapia de ese paciente igual que cualquier profesional a cargo

### Requirement: Solo un fisioterapeuta con el paciente a cargo escribe
El sistema SHALL permitir escribir en las tablas de Fisioterapia (cabecera de la evaluación, mediciones, objetivos y notas) solo a un
profesional activo cuya profesión sea fisioterapeuta, con el paciente a cargo, y para la cabecera, las mediciones y los objetivos solo
el autor de la atención y mientras esté sin firmar. La profesión SHALL tomarse de la base de datos y nunca del cliente. Esta regla SHALL
imponerse con dos barreras independientes (la política de acceso y un disparador), y los médicos, odontólogos, psicólogos y podólogos a
cargo SHALL NOT poder escribir. Los datos de identidad (paciente, autor, hora, huella) SHALL fijarlos el servidor y no el cliente.

#### Scenario: Fisioterapeuta autor
- **WHEN** el autor fisioterapeuta con el paciente a cargo inserta una medición en su atención sin firmar
- **THEN** se acepta

#### Scenario: Otra profesión a cargo (negativo)
- **WHEN** un médico, un odontólogo, un psicólogo o un podólogo con el paciente a cargo intenta insertar o modificar en cualquiera de esas tablas
- **THEN** se rechaza, tanto por la política como por el disparador de profesión

#### Scenario: Fisioterapeuta que no es el autor (negativo)
- **WHEN** un fisioterapeuta a cargo intenta modificar las mediciones o los objetivos de la atención sin firmar de otro
- **THEN** se rechaza

#### Scenario: Fisioterapeuta sin el paciente (negativo)
- **WHEN** un fisioterapeuta que no tiene al paciente a cargo, o con asignación vencida o perfil desactivado, intenta escribir
- **THEN** se rechaza

#### Scenario: Profesión enviada por el cliente (negativo)
- **WHEN** una solicitud trae una profesión, un autor, un paciente, una huella o una hora
- **THEN** se rechaza o se ignora, y el valor guardado es el de la base

#### Scenario: Escritura directa de episodios y catálogo (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar filas de los episodios o del catálogo
- **THEN** se rechaza por falta de privilegios

### Requirement: Los demás roles no leen ni escriben
El administrativo, la enfermera, el paciente (incluido el titular de la historia), una sesión sin rol, `anonymous`,
`cron_notificaciones` y `sync_identidad` SHALL NOT poder leer ni escribir ninguna tabla de Fisioterapia ni sus vistas, ni obtener su
contenido por otra vía que no sea la sección de la copia de la historia. Los tres últimos SHALL no tener ningún privilegio sobre ellas.

#### Scenario: Administrativo (negativo)
- **WHEN** un administrativo consulta cualquiera de las tablas o vistas de Fisioterapia
- **THEN** no recibe ninguna fila

#### Scenario: Enfermera (negativo)
- **WHEN** una enfermera consulta cualquiera de ellas
- **THEN** no recibe ninguna fila

#### Scenario: Paciente (negativo)
- **WHEN** un paciente, incluso sobre su propia información, las consulta
- **THEN** no recibe ninguna fila

#### Scenario: Sin rol, anónimo y roles de servicio (negativo)
- **WHEN** una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intenta leer o escribir
- **THEN** se deniega el privilegio

#### Scenario: Funciones de la copia (negativo)
- **WHEN** cualquier rol de usuario intenta ejecutar directamente la función que arma la sección de Fisioterapia de la copia
- **THEN** se deniega

### Requirement: Toda lectura de contenido de Fisioterapia queda registrada
El sistema SHALL registrar en el registro de accesos a historias clínicas cada lectura de contenido de Fisioterapia, en la misma
transacción que la lectura, de modo que si el registro falla no se devuelva contenido. El sistema SHALL fallar cerrado cuando el modo de
datos de la aplicación no coincida con el de la base. La lectura del catálogo no se registra.

#### Scenario: Lectura con registro
- **WHEN** un profesional a cargo abre el episodio de un paciente
- **THEN** queda una fila de acceso con su autor, el paciente y la hora, y recién entonces se devuelve el contenido

#### Scenario: Registro que falla (negativo)
- **WHEN** el registro del acceso falla por asignación vencida o perfil desactivado
- **THEN** no se devuelve ningún contenido de Fisioterapia

#### Scenario: Modo inconsistente (negativo)
- **WHEN** la aplicación opera con un modo de datos distinto del de la base
- **THEN** la operación falla cerrada con el aviso de configuración inconsistente

#### Scenario: Lectura sin pasar por el registro (negativo)
- **WHEN** una función del módulo de Fisioterapia intenta leer sin una transacción con acceso registrado
- **THEN** no compila o la prueba de acceso único falla

### Requirement: La escritura se audita sin copiar contenido clínico
Toda escritura en las tablas de Fisioterapia SHALL quedar en la auditoría con quién, cuándo, la acción, la tabla y el identificador,
pero sin copiar valores, textos, motivos ni notas, de modo que el administrativo, que lee la auditoría, no pueda leer contenido clínico
por esa vía.

#### Scenario: Auditoría de una nota
- **WHEN** un fisioterapeuta registra una nota de sesión con un texto distintivo
- **THEN** la auditoría registra la tabla, la acción, el autor y el identificador, y no contiene ese texto

#### Scenario: Auditoría de una medición borrada en borrador
- **WHEN** el autor borra una medición de un borrador
- **THEN** la auditoría registra el borrado sin el valor

#### Scenario: Lectura de la auditoría por el administrativo
- **WHEN** el administrativo consulta la auditoría tras varias escrituras de Fisioterapia
- **THEN** ninguna fila contiene valores de dolor, grados, fuerza, textos clínicos ni motivos

### Requirement: Datos clínicos reales prohibidos mientras la decisión legal siga abierta
El sistema SHALL aplicar a todas las tablas de Fisioterapia la misma guarda de datos clínicos reales del módulo de historias clínicas:
en modo demostración solo se admiten pacientes de demostración, y toda operación del módulo SHALL fallar si el modo de la aplicación no
coincide con el de la base.

#### Scenario: Paciente real en modo demostración (negativo)
- **WHEN** se intenta registrar una medición, un objetivo o una nota de un paciente que no es de demostración mientras la base está en modo demostración
- **THEN** se rechaza con el mensaje del modo demostración y no se guarda nada

#### Scenario: Paciente de demostración
- **WHEN** se registra una evaluación de un paciente de demostración
- **THEN** se acepta

### Requirement: La copia de la historia incluye Fisioterapia
Las tablas de Fisioterapia SHALL estar clasificadas en el compilado de la copia de la historia clínica: los episodios, las evaluaciones
firmadas con sus mediciones y objetivos, y todas las notas (las corregidas marcadas como tales) SHALL incluirse, y el catálogo SHALL
excluirse con su razón. Los borradores de evaluación SHALL NOT incluirse. La sección SHALL producirla una función de la base de datos
que solo ejecuta el compilado, de modo que el administrativo no obtenga contenido de Fisioterapia por ninguna otra vía. Añadir una tabla
clínica sin clasificarla SHALL hacer fallar la verificación de cobertura de la copia.

#### Scenario: Sección incluida
- **WHEN** se compila la copia de un paciente con una evaluación firmada, una reevaluación y varias notas, una de ellas corregida
- **THEN** la copia incluye el episodio, ambas evaluaciones con sus mediciones y objetivos, y todas las notas con la corregida marcada

#### Scenario: Borrador excluido
- **WHEN** el paciente tiene una evaluación en borrador
- **THEN** la copia no la incluye

#### Scenario: Cobertura
- **WHEN** se ejecuta la prueba de cobertura de la copia
- **THEN** cada tabla de Fisioterapia aparece en el compilado o en la lista de exclusiones con su razón, y la prueba falla si se retira una sección

#### Scenario: Administrativo sin lectura directa (negativo)
- **WHEN** el administrativo, que puede hacer generar la copia, consulta directamente las tablas de Fisioterapia
- **THEN** sigue sin recibir ninguna fila
