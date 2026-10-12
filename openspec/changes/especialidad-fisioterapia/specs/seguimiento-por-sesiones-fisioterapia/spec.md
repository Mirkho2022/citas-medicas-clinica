# Spec Delta

## Purpose

Que el tratamiento de Fisioterapia avance por sesiones con un plan que muestre cuántas quedan, y que cada sesión deje una nota
clínica breve, sellada al registrarse, que no se edita y que solo se corrige con otra nota.

## ADDED Requirements

### Requirement: El plan de sesiones pertenece a un episodio y usa el catálogo de planes de Fisioterapia
El sistema SHALL permitir al fisioterapeuta crear un plan de sesiones para un episodio abierto, a partir de una evaluación firmada
del episodio (inicial o reevaluación) y de un protocolo del catálogo de planes de Fisioterapia, usando el mecanismo común de planes de
sesiones. El plan SHALL quedar ligado a esa evaluación y por ella al episodio. El catálogo de planes SHALL aportar un nombre y valores
sugeridos de sesiones y frecuencia, que el fisioterapeuta puede ajustar dentro de los límites del mecanismo común, y SHALL describir la
duración del tratamiento y no su contenido terapéutico. Un plan de Fisioterapia sin protocolo del catálogo, sin evaluación firmada o de
un episodio cerrado SHALL ser rechazado. Un episodio SHALL poder tener varios planes en sucesión.

#### Scenario: Plan tras la evaluación
- **WHEN** el fisioterapeuta firma la evaluación inicial y crea un plan con un protocolo del catálogo
- **THEN** el plan queda ligado a esa evaluación y a su episodio, con sus sesiones por agendar

#### Scenario: Valores sugeridos
- **WHEN** el fisioterapeuta elige un protocolo del catálogo
- **THEN** la pantalla propone el total de sesiones y la frecuencia del catálogo y permite ajustarlos

#### Scenario: Protocolo fuera del catálogo (negativo)
- **WHEN** se intenta crear un plan de Fisioterapia con una clave de protocolo que no está en el catálogo o ya no está vigente
- **THEN** se rechaza y no se crea el plan

#### Scenario: Evaluación sin firmar (negativo)
- **WHEN** se intenta crear un plan ligado a una evaluación que sigue en borrador
- **THEN** se rechaza

#### Scenario: Episodio cerrado (negativo)
- **WHEN** se intenta crear un plan ligado a una evaluación de un episodio cerrado
- **THEN** se rechaza

#### Scenario: Plan sin evaluación (negativo)
- **WHEN** se intenta crear un plan de Fisioterapia sin una atención de evaluación
- **THEN** se rechaza

#### Scenario: Otra profesión (negativo)
- **WHEN** un profesional que no es fisioterapeuta intenta crear un plan de Fisioterapia
- **THEN** se rechaza por falta de permiso

#### Scenario: Planes en sucesión
- **WHEN** un plan se completa y, tras una reevaluación firmada, el fisioterapeuta crea otro del mismo episodio
- **THEN** ambos planes quedan ligados al episodio, cada uno a su evaluación

### Requirement: El contador de sesiones restantes es el del mecanismo común
La pantalla del episodio SHALL mostrar, para el plan vigente, el número de sesión y las sesiones restantes tal como las calcula el
mecanismo común de planes de sesiones, con texto y número y no solo con una barra. Este change SHALL NOT recalcular ni guardar un
contador propio. Una sesión no asistida, reprogramada, cancelada o abandonada SHALL tratarse como lo define el mecanismo común. Al
agotarse el plan, la pantalla SHALL sugerir la reevaluación sin exigirla.

#### Scenario: Contador visible
- **WHEN** el fisioterapeuta abre un episodio con un plan de 10 sesiones y 4 asistidas
- **THEN** ve «quedan 6» junto con el número de la próxima sesión

#### Scenario: Plan agotado
- **WHEN** se asiste la última sesión y el plan pasa a completado
- **THEN** la pantalla muestra el plan completado y ofrece registrar la reevaluación o el alta

#### Scenario: Sin contador propio
- **WHEN** se inspecciona el esquema de este change
- **THEN** ninguna de sus tablas guarda un contador de sesiones restantes

### Requirement: La nota por sesión registra evolución en cinco campos
El sistema SHALL registrar para cada sesión una nota con: dolor al entrar y dolor al salir (enteros de 0 a 10), técnicas o ejercicios
aplicados, respuesta del paciente e indicaciones para casa. Los tres textos SHALL tener contenido real (ni vacíos ni solo espacios o
caracteres invisibles) y ningún campo SHALL poder omitirse. La hora y el autor de la nota SHALL ser los del servidor y la sesión. Las
indicaciones para casa SHALL ser ejercicios y cuidados y no una receta; el sistema SHALL NOT tener ningún campo de medicamentos en la
nota.

#### Scenario: Nota válida
- **WHEN** el fisioterapeuta registra dolor de entrada 6, dolor de salida 4 y los tres textos
- **THEN** la nota queda guardada con su autor y hora, y sellada

#### Scenario: Campo vacío (negativo)
- **WHEN** falta alguno de los cinco campos, o un texto solo tiene espacios o caracteres invisibles
- **THEN** no se guarda nada y la respuesta indica el campo

#### Scenario: Dolor fuera de la escala (negativo)
- **WHEN** el dolor de entrada o de salida es 11 o -1
- **THEN** se rechaza

#### Scenario: Autor y hora enviados por el cliente (negativo)
- **WHEN** la solicitud incluye el autor, la hora o el paciente
- **THEN** se rechaza porque esos datos solo los fija el servidor

### Requirement: Cada nota corresponde a una sesión del plan del episodio, y hay una vigente por sesión
La nota SHALL referenciar una sesión de un plan de Fisioterapia ligado al episodio abierto, del mismo paciente, que esté agendada o
asistida. No SHALL admitirse la nota de una sesión por agendar. Para cada sesión SHALL existir como máximo una nota vigente, a prueba
de concurrencia. La nota SHALL poder registrarla cualquier fisioterapeuta que tenga al paciente a cargo, no solo el del plan. Registrar
la nota SHALL NOT cambiar el estado de la sesión ni de la cita.

#### Scenario: Nota de una sesión asistida
- **WHEN** el fisioterapeuta registra la nota de la sesión 3 de su plan, ya asistida
- **THEN** la nota queda ligada a esa sesión y a su episodio

#### Scenario: Nota de una sesión agendada
- **WHEN** registra la nota de una sesión agendada cuya cita aún no se marcó como atendida
- **THEN** la nota se acepta y la sesión no cambia de estado

#### Scenario: Sesión por agendar (negativo)
- **WHEN** intenta registrar una nota para una sesión que sigue por agendar
- **THEN** se rechaza

#### Scenario: Sesión de otro plan o de otro paciente (negativo)
- **WHEN** referencia una sesión de un plan que no es del episodio, de otro paciente o de un área distinta de Fisioterapia
- **THEN** se rechaza

#### Scenario: Segunda nota de la misma sesión (negativo)
- **WHEN** ya existe una nota vigente de la sesión y se registra otra que no es una corrección
- **THEN** se rechaza

#### Scenario: Dos notas simultáneas (negativo)
- **WHEN** dos fisioterapeutas registran a la vez la nota de la misma sesión
- **THEN** una se guarda y la otra se rechaza

#### Scenario: Episodio cerrado (negativo)
- **WHEN** se intenta registrar una nota en un episodio cerrado
- **THEN** se rechaza

#### Scenario: Fisioterapeuta de cobertura
- **WHEN** un fisioterapeuta que cubre al titular del plan y tiene al paciente a cargo registra la nota
- **THEN** la nota se acepta con su propia autoría

### Requirement: La nota queda sellada, no se edita y se corrige con otra nota
Al registrarse, el sistema SHALL sellar la nota con una huella y SHALL impedir, para todo rol incluido el dueño de la base, modificarla
o borrarla. Una corrección SHALL ser una nota nueva que referencia a la corregida, con un motivo de corrección con contenido; solo el
autor de la nota SHALL poder corregirla, una nota SHALL poder corregirse una sola vez (la corrección sí puede corregirse), y la nota
corregida SHALL seguir visible y marcada como corregida sin modificarse. La lectura SHALL tomar como vigente la última corrección.

#### Scenario: Editar o borrar una nota (negativo)
- **WHEN** cualquier rol, incluido el dueño, intenta modificar o borrar una nota registrada
- **THEN** se rechaza

#### Scenario: Corrección
- **WHEN** el autor registra una corrección con su motivo
- **THEN** la corrección es la nota vigente de la sesión y la original aparece como corregida, sin cambios

#### Scenario: Corrección sin motivo (negativo)
- **WHEN** se registra una corrección sin motivo, o con un motivo de solo espacios
- **THEN** se rechaza

#### Scenario: Corrección de una nota ajena (negativo)
- **WHEN** un fisioterapeuta que no es el autor intenta corregir una nota
- **THEN** se rechaza

#### Scenario: Dos correcciones de la misma nota (negativo)
- **WHEN** se intenta corregir dos veces la misma nota, o dos correcciones llegan a la vez
- **THEN** la segunda se rechaza

#### Scenario: Huella reproducible
- **WHEN** se recalcula la huella de una nota
- **THEN** coincide con la guardada, y deja de coincidir si se altera un campo con la protección desactivada solo dentro de una prueba

### Requirement: Las sesiones atendidas sin nota son visibles
La pantalla del episodio SHALL listar las sesiones asistidas que no tienen una nota vigente, de modo que el fisioterapeuta pueda
completarlas, sin avisos automáticos ni procesos programados.

#### Scenario: Sesión sin nota
- **WHEN** una sesión está asistida y no tiene nota
- **THEN** la pantalla del episodio la muestra como «Sin nota»

#### Scenario: Nota registrada
- **WHEN** se registra la nota de esa sesión
- **THEN** deja de aparecer en la lista
