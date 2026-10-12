# Spec Delta

## Purpose

Hacer que cada sesión de un plan sea una cita de la agenda (con su doble reserva, su ventana de cancelación y sus recordatorios) o
quede por agendar; definir qué cuenta como sesión asistida sin cobros; mantener la sesión sincronizada con su cita ante
inasistencias, cancelaciones, reprogramaciones y reasignaciones; proponer una serie de sesiones recurrentes que recepción confirma;
y limitar lo que recepción ve de un plan.

## ADDED Requirements

### Requirement: Cada sesión es una cita o queda por agendar
El sistema SHALL representar cada sesión de un plan activo como «por agendar», «agendada» o «asistida», y SHALL permitir a recepción
agendar una sesión creando una cita con las mismas reglas de la agenda (disponibilidad, doble reserva y ventana de cancelación de 1
hora) y vinculándola a la sesión en una sola transacción. La cita SHALL ser del mismo paciente, estar reservada o confirmada, caer
dentro de la vigencia del plan y ser de un profesional de la especialidad del plan. El plan SHALL NOT reemplazar ni modificar las
citas, ni guardar saldos o pagos.

#### Scenario: Agendar una sesión
- **WHEN** recepción agenda la sesión 3 de un plan en un horario libre del profesional
- **THEN** se crea una cita reservada, la sesión pasa a agendada con la fecha y el profesional de la cita, y el contador de restantes no cambia

#### Scenario: Horario ya ocupado (negativo)
- **WHEN** recepción agenda una sesión en un horario que otro paciente ya ocupa
- **THEN** se muestra «Registro de cita ya agendado», no se crea ninguna cita y la sesión sigue por agendar

#### Scenario: Cita de otro paciente (negativo)
- **WHEN** se intenta vincular a una sesión una cita de otro paciente
- **THEN** se rechaza y la cita no cambia

#### Scenario: Fuera de la vigencia o de otra especialidad (negativo)
- **WHEN** la cita cae después de la vigencia del plan o es de un profesional de otra especialidad
- **THEN** se rechaza y, si se estaba agendando, tampoco se crea la cita

#### Scenario: Plan terminado o sesión ya agendada (negativo)
- **WHEN** se intenta agendar o vincular una sesión de un plan completado o cancelado, o una sesión que ya está agendada o asistida
- **THEN** se rechaza

#### Scenario: Cobertura por un colega
- **WHEN** recepción agenda la sesión con otro profesional de la misma especialidad porque el del plan está de baja
- **THEN** se acepta y la sesión muestra al profesional que la atiende

#### Scenario: Cita ya vinculada (negativo)
- **WHEN** se intenta vincular una misma cita a dos sesiones
- **THEN** solo la primera se acepta

### Requirement: Una sesión cuenta como asistida solo cuando su cita fue atendida
El sistema SHALL marcar una sesión como asistida únicamente cuando su cita pasa a atendida (la marca el profesional dueño de la
cita), SHALL descontarla entonces del contador de restantes y SHALL NOT considerar asistida una sesión por haber sido confirmada,
por la llegada del paciente ni por una marca manual. «Asistida» SHALL NOT implicar ningún cobro ni saldo.

#### Scenario: Cita atendida
- **WHEN** el profesional marca atendida la cita de una sesión agendada
- **THEN** la sesión pasa a asistida con su fecha y los restantes bajan en uno

#### Scenario: Cita confirmada que aún no se atendió
- **WHEN** la cita de la sesión está confirmada
- **THEN** la sesión sigue agendada y no cuenta como asistida

#### Scenario: Marca manual (negativo)
- **WHEN** cualquier rol intenta marcar una sesión como asistida sin que su cita esté atendida
- **THEN** la base lo rechaza

### Requirement: La sesión sigue a su cita ante una inasistencia, una cancelación o una reprogramación
El sistema SHALL mantener la sesión sincronizada con su cita sin intervención de nadie, cualquiera sea el camino (pantallas de la
agenda, portal del paciente, reasignación por baja o el dueño de la base). Una cita marcada «no asistió» SHALL devolver la sesión a
por agendar, sumar una inasistencia y no consumir la sesión. Una cita cancelada SHALL devolver la sesión a por agendar. Una cita
nueva creada al reprogramar o reasignar SHALL quedar vinculada a la misma sesión. Ninguna de estas SHALL cerrar el plan.

#### Scenario: El paciente no asiste
- **WHEN** recepción marca «no asistió» la cita de una sesión
- **THEN** la sesión vuelve a por agendar, muestra una inasistencia y el plan sigue activo con los mismos restantes

#### Scenario: Reprogramación
- **WHEN** recepción reprograma la cita de una sesión a otro día
- **THEN** la sesión queda agendada con la cita nueva y la anterior queda cancelada

#### Scenario: Cancelación sin reprogramar
- **WHEN** se cancela la cita de una sesión y no se agenda otra
- **THEN** la sesión vuelve a por agendar con el resultado «cancelada»

#### Scenario: Cancelación por el paciente desde el portal
- **WHEN** el paciente cancela su cita desde el portal
- **THEN** la sesión vuelve a por agendar aunque el paciente no tenga ningún permiso sobre el plan

#### Scenario: Baja del profesional
- **WHEN** las citas de un profesional de baja se reasignan a un colega de la misma especialidad
- **THEN** cada sesión sigue a su cita nueva y muestra al colega

#### Scenario: Ventana de cancelación
- **WHEN** faltan menos de 60 minutos para la cita de una sesión
- **THEN** la cita no se puede cancelar ni reprogramar (regla de la agenda) y la sesión no cambia

#### Scenario: Carga de citas por el dueño
- **WHEN** el dueño de la base cambia el estado de una cita vinculada a una sesión
- **THEN** la sesión se sincroniza igual

### Requirement: Cerrar el plan no cancela citas
El sistema SHALL NOT cancelar ni modificar ninguna cita al cerrar un plan; SHALL informar cuántas citas futuras de sesiones siguen
vigentes para que se cancelen desde la agenda con sus reglas.

#### Scenario: Cierre con citas futuras
- **WHEN** el profesional cierra por abandono un plan con dos sesiones agendadas a futuro
- **THEN** las dos citas siguen vigentes en la agenda y la pantalla indica que son dos

### Requirement: Las sesiones recurrentes se proponen y recepción las confirma
El sistema SHALL proponer, para las sesiones por agendar de un plan, una serie de fechas y horas según la frecuencia del plan y la
agenda del profesional, sin proponer ninguna antes de su fecha objetivo ni después de la vigencia, sin repetir un hueco ni cruzar otra
cita del paciente. El sistema SHALL NOT agendar nada hasta que recepción confirme las filas, y cada sesión confirmada SHALL agendarse
en su propia transacción, informando el resultado por fila. El sistema SHALL NOT agendar sesiones en segundo plano ni usar un proceso
programado nuevo.

#### Scenario: Serie propuesta
- **WHEN** recepción pide la serie de un plan de 6 sesiones por agendar con frecuencia de 7 días desde mañana
- **THEN** recibe seis propuestas espaciadas al menos 7 días, en huecos libres del profesional, y no se crea ninguna cita

#### Scenario: Sin hueco
- **WHEN** no hay hueco dentro de la tolerancia para una fecha, o esta cae después de la vigencia
- **THEN** esa sesión se devuelve sin fecha para agendarla a mano y las demás se proponen

#### Scenario: Confirmación parcial
- **WHEN** recepción confirma cinco filas y una colisiona con otra reserva hecha un instante antes
- **THEN** cuatro sesiones quedan agendadas, la que colisionó muestra «Registro de cita ya agendado» y queda por agendar

#### Scenario: Profesional de baja
- **WHEN** el profesional del plan está de baja y recepción elige un colega de la misma especialidad
- **THEN** la serie se propone con la agenda del colega; un profesional de otra especialidad se rechaza

### Requirement: Las carreras sobre un plan se resuelven en la base de datos
El sistema SHALL garantizar, con bloqueos y restricciones de la base y no con la aplicación, que dos operaciones simultáneas sobre un
mismo plan o una misma sesión no dejen un contador incorrecto, una cita huérfana, un plan completado dos veces ni un plan en dos
estados terminales.

#### Scenario: Dos recepciones agendan la misma sesión
- **WHEN** cinco recepciones agendan a la vez la misma sesión con horarios distintos
- **THEN** exactamente una cita queda vinculada, las demás se rechazan y ninguna de ellas deja una cita creada

#### Scenario: Dos profesionales marcan atendidas las dos últimas sesiones
- **WHEN** dos profesionales marcan a la vez atendidas las citas de las dos últimas sesiones sin asistir
- **THEN** ambas sesiones quedan asistidas y el plan pasa a completado una sola vez

#### Scenario: Cerrar contra una asistencia
- **WHEN** el profesional cierra el plan mientras se marca atendida la cita de una sesión
- **THEN** el plan queda en un solo estado terminal y la sesión queda asistida

### Requirement: Recepción ve lo mínimo para agendar
El sistema SHALL ofrecer a recepción dos funciones con lista blanca de columnas: los planes activos con sesiones por agendar (con
sus contadores, frecuencia, vigencia, profesional y especialidad) y las sesiones de un plan (número, estado, fecha de la cita,
resultado de la última cita e inasistencias). Estas funciones SHALL NOT devolver el protocolo, la descripción ni ningún dato clínico,
y SHALL NOT estar disponibles para otro rol. La lista exacta de columnas SHALL estar fijada por una prueba.

#### Scenario: Lista de planes por agendar
- **WHEN** recepción abre la lista de planes
- **THEN** ve los planes con sesiones por agendar y cuántas, y no ve el protocolo ni la descripción de ninguno, tampoco los de un psicólogo

#### Scenario: Recepción sin lectura directa (negativo)
- **WHEN** el administrativo consulta directamente las tablas del plan
- **THEN** no obtiene ninguna fila

#### Scenario: Otros roles (negativo)
- **WHEN** un profesional, la enfermera, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización ejecuta las funciones de recepción, o las de agendar y vincular
- **THEN** se rechaza por falta de permiso y no se crea ninguna cita

#### Scenario: Columna añadida por error
- **WHEN** se añade una columna a una de las funciones de lista blanca
- **THEN** la prueba de la lista exacta falla
