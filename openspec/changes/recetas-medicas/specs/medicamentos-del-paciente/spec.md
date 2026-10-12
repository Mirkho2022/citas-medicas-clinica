# Spec Delta

## Purpose

Que todo profesional que tiene al paciente a cargo, de cualquier profesión y psicólogo incluido, vea los medicamentos de sus
recetas vigentes antes de recetar para evitar cruces y reacciones adversas, que nadie más los vea, y que esa lista no exponga
información de Psicología.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional».

## ADDED Requirements

### Requirement: Los medicamentos vigentes salen de las recetas emitidas y no anuladas
El sistema SHALL ofrecer, para cada paciente, la lista de sus medicamentos vigentes, construida únicamente a partir de las
recetas emitidas en el sistema que no estén anuladas. Un medicamento SHALL considerarse vigente hasta la fecha de emisión de su
receta, en `America/Lima`, más la duración en días del medicamento, inclusive; pasada esa fecha SHALL dejar de figurar en la
lista. Una receta anulada SHALL desaparecer de la lista de inmediato. <!-- REVISAR: la regla de «vigente» (incluye un día de margen sobre el último día nominal, no distingue tratamientos de uso continuo ni permite suspender antes de su término) es una propuesta del diseño; confirmar con el personal médico. -->

#### Scenario: Medicamento dentro de su duración
- **WHEN** se emitió ayer una receta con un medicamento de 7 días
- **THEN** el medicamento figura en la lista con su fecha de término

#### Scenario: Último día
- **WHEN** hoy es la fecha de emisión más la duración del medicamento
- **THEN** el medicamento todavía figura en la lista

#### Scenario: Medicamento terminado
- **WHEN** hoy es posterior a la fecha de emisión más la duración
- **THEN** el medicamento ya no figura en la lista

#### Scenario: Hoy es la fecha de Lima
- **WHEN** son las 19:30 en Lima, momento en que la fecha del servidor en UTC ya es la del día siguiente
- **THEN** la vigencia se calcula con la fecha de Lima

#### Scenario: Receta anulada
- **WHEN** el emisor anula una receta cuyos medicamentos figuraban en la lista
- **THEN** esos medicamentos dejan de figurar de inmediato

#### Scenario: Varias recetas
- **WHEN** el paciente tiene medicamentos vigentes de dos recetas de profesionales distintos
- **THEN** la lista los muestra juntos, ordenados por fecha de emisión descendente, indicando de qué receta, de qué fecha y de qué profesional vienen

#### Scenario: Datos que muestra cada medicamento
- **WHEN** se muestra un medicamento vigente
- **THEN** se ven su DCI, marca opcional, concentración, forma farmacéutica, vía, dosis, frecuencia, duración, indicaciones, fecha de emisión, fecha de término, número de receta y el nombre y la profesión del emisor

#### Scenario: Sin medicamentos vigentes
- **WHEN** el paciente no tiene medicamentos vigentes
- **THEN** la pantalla dice que no hay medicamentos vigentes registrados en el sistema y aclara que solo incluye recetas emitidas desde él, no las de papel ni las de otros establecimientos

### Requirement: Todo profesional a cargo ve los medicamentos del paciente, y nadie más
El sistema SHALL entregar la lista de medicamentos vigentes de un paciente a todo profesional con sesión válida que tenga a ese
paciente a su cargo, cualquiera sea su profesión, incluido el psicólogo. Ningún otro usuario SHALL obtenerla. La restricción
SHALL imponerla la base de datos, no la interfaz.

#### Scenario: Médico a cargo
- **WHEN** un médico con el paciente a su cargo consulta sus medicamentos vigentes
- **THEN** recibe la lista

#### Scenario: Psicólogo a cargo
- **WHEN** un psicólogo con el paciente a su cargo consulta sus medicamentos vigentes
- **THEN** recibe la misma lista que recibiría un médico a cargo

#### Scenario: Profesional sin el paciente a cargo (negativo)
- **WHEN** un profesional de cualquier profesión sin asignación vigente al paciente consulta sus medicamentos
- **THEN** no recibe ninguna fila ni un error que confirme que el paciente tiene recetas

#### Scenario: Asignación vencida o perfil desactivado (negativo)
- **WHEN** la asignación del profesional venció, o su perfil o su alta están desactivados
- **THEN** no recibe ninguna fila

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` consulta la lista, directamente o por la vista
- **THEN** no recibe ninguna fila y las lecturas directas se rechazan

#### Scenario: Consulta directa contra la base (negativo)
- **WHEN** un profesional intenta leer los medicamentos de un paciente ajeno saltándose la pantalla
- **THEN** la base de datos no le devuelve ninguna fila

### Requirement: La lista no expone información de Psicología
La lista de medicamentos SHALL derivarse solo de las recetas y de sus medicamentos. SHALL NO incluir ni permitir llegar desde ella
a identificadores de atenciones, diagnósticos, notas, evaluaciones, resultados de tests ni a ningún otro dato de la especialidad
de Psicología. Su conjunto de columnas SHALL estar fijado por la suite de pruebas, de modo que añadir una columna obligue a una
revisión explícita.

#### Scenario: Columnas fijas
- **WHEN** se compara el conjunto de columnas de la lista con el esperado por la suite de pruebas
- **THEN** coincide exactamente, y no incluye identificador de atención, huella, datos del establecimiento ni texto de ninguna nota

#### Scenario: Sin vínculos a contenido clínico
- **WHEN** se examinan las tablas de las que depende la lista
- **THEN** son solo las de recetas y sus medicamentos

#### Scenario: La lista no es una puerta a Psicología (negativo)
- **WHEN** existe información de Psicología de un paciente y un profesional que no es psicólogo consulta sus medicamentos
- **THEN** la lista no contiene ningún dato de esa información: las notas y resultados de Psicología se rigen por su propia regla de acceso

#### Scenario: Misma lista para todas las profesiones
- **WHEN** un médico y un psicólogo, ambos a cargo del mismo paciente, consultan sus medicamentos
- **THEN** obtienen exactamente las mismas filas

### Requirement: Los medicamentos se muestran antes de recetar y sin alertas automáticas
La pantalla de emisión de una receta SHALL mostrar los medicamentos vigentes del paciente antes del formulario, y la historia
clínica SHALL poder mostrarlos con el mismo componente. El sistema SHALL NO calcular ni mostrar alertas de interacción: SHALL
indicar que no detecta interacciones y que el profesional debe revisar la lista.

#### Scenario: Lista antes de recetar
- **WHEN** el profesional abre el formulario de una receta nueva
- **THEN** ve primero los medicamentos vigentes del paciente y después el formulario

#### Scenario: Aviso de revisión
- **WHEN** se muestra la lista
- **THEN** incluye el aviso «El sistema no detecta interacciones entre medicamentos: revise la lista antes de recetar»

#### Scenario: Se muestra en la historia
- **WHEN** el profesional abre la historia del paciente
- **THEN** la historia presenta el panel de medicamentos vigentes con el mismo componente y las mismas reglas

#### Scenario: Presentación accesible
- **WHEN** se muestra la lista en pantalla
- **THEN** cada dato tiene su etiqueta de texto, la fecha de término se escribe (por ejemplo «hasta el 16/10/2026») en lugar de indicarse solo con color, y la lista es operable por teclado
