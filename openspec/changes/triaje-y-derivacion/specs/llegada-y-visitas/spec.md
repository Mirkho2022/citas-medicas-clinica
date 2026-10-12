# Spec Delta

## Purpose

Registrar la llegada del paciente a la clínica, con cita o sin ella, como una visita con estados y marcas de tiempo
sellados por el servidor, de modo que el personal sepa quién espera y desde cuándo, la clínica pueda medir esperas y
cobertura del triaje, y los pacientes sin cita no contaminen el indicador de citas del portal.

## ADDED Requirements

### Requirement: Recepción registra la llegada de un paciente, con cita o sin ella
El sistema SHALL permitir al personal administrativo registrar la llegada de un paciente ya registrado, creando una visita en
estado «llegada» con la hora de llegada fijada por el servidor y el nombre del usuario que la registró. Una llegada SHALL poder
asociarse a una cita o no. Ningún otro rol SHALL poder registrar una llegada. El paciente nuevo se registra y su historia se
abre en el flujo de agenda (con la filiación mínima de la NTS 139); este requisito parte de un paciente existente.

#### Scenario: Llegada de un paciente sin cita
- **WHEN** el administrativo registra la llegada de un paciente existente sin indicar cita
- **THEN** se crea una visita «sin cita» en estado «llegada», con la hora del servidor, y no se crea ninguna cita

#### Scenario: Llegada de un paciente con cita confirmada de hoy
- **WHEN** el administrativo registra la llegada de un paciente indicando su cita confirmada de hoy
- **THEN** se crea una visita «con cita» en estado «llegada» asociada a esa cita, y el estado de la cita no cambia

#### Scenario: La hora de llegada no la fija el cliente
- **WHEN** una solicitud intenta indicar la hora de llegada o el usuario que registra
- **THEN** la hora y el usuario son los del servidor y de la sesión, y el valor enviado se ignora o se rechaza

#### Scenario: Otros roles no registran llegadas (negativo)
- **WHEN** una enfermera, un profesional, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización
  intenta registrar una llegada
- **THEN** la operación se rechaza por falta de permiso y no se crea ninguna visita

#### Scenario: Escritura directa denegada (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar visitas directamente en la base de datos
- **THEN** la operación se rechaza por falta de privilegios

### Requirement: La cita de una llegada debe ser válida
Cuando la llegada se asocia a una cita, el sistema SHALL exigir que la cita sea del mismo paciente, esté confirmada, sea de
hoy (día de `America/Lima`) y no tenga ya otra visita no anulada. Si la cita está solo reservada, la persona SHALL poder
confirmarla primero con la acción de confirmación de la agenda y registrar después la llegada. Una cita reservada cuyo horario ya
terminó SHALL tratarse como llegada sin cita.

#### Scenario: Cita de otro paciente (negativo)
- **WHEN** el administrativo registra la llegada del paciente A indicando la cita del paciente B
- **THEN** se rechaza con «La cita no corresponde a este paciente, no está confirmada o no es de hoy»

#### Scenario: Cita reservada o cancelada (negativo)
- **WHEN** se indica una cita reservada, cancelada, atendida o marcada «no asistió»
- **THEN** se rechaza con el mismo mensaje y no se crea la visita

#### Scenario: Cita de otro día (negativo)
- **WHEN** se indica una cita confirmada de ayer o de mañana
- **THEN** se rechaza y la persona puede registrar la llegada sin cita

#### Scenario: Cita que ya tiene una visita
- **WHEN** se registra una segunda llegada para una cita que ya tiene una visita no anulada
- **THEN** se rechaza sin crear una segunda visita

#### Scenario: Cita reservada que se confirma en el momento
- **WHEN** la cita está reservada y su horario no ha terminado, y la recepción la confirma y registra la llegada
- **THEN** la cita queda confirmada (con el acceso del profesional que eso concede) y la visita queda asociada a ella

### Requirement: Un paciente tiene a lo sumo una visita en curso
El sistema SHALL impedir, en la base de datos y a prueba de concurrencia, que un paciente tenga dos visitas en curso (en
estado llegada, con triaje, derivada o en atención). El intento SHALL rechazarse con un mensaje que indique que el paciente ya
tiene una visita en curso. Una visita de un día anterior que sigue en curso SHALL cerrarse automáticamente al registrar una nueva
llegada del mismo paciente.

#### Scenario: Segunda llegada el mismo día
- **WHEN** el administrativo registra una llegada para un paciente que ya tiene una visita en curso hoy
- **THEN** se rechaza con «Este paciente ya tiene una visita en curso» y no se crea una segunda visita

#### Scenario: Dos recepciones registran a la vez
- **WHEN** dos administrativos registran a la vez la llegada del mismo paciente
- **THEN** una prospera y la otra recibe el mensaje de visita en curso; queda una sola visita

#### Scenario: Visita de ayer sin cerrar
- **WHEN** un paciente tiene una visita en curso de un día anterior y hoy se registra una llegada nueva
- **THEN** la visita anterior se cierra sola (como abandonada, o como atendida si ya estaba en atención), queda marcada como
  cierre automático, y la visita nueva se crea

#### Scenario: Paciente que vuelve después de ser atendido
- **WHEN** el paciente termina su atención y horas después vuelve el mismo día
- **THEN** se puede registrar una visita nueva, porque la anterior ya no está en curso

### Requirement: Los estados de la visita cambian solo por operaciones acotadas
El sistema SHALL mantener cada visita en uno de estos estados: llegada, con triaje, derivada, en atención, atendida,
abandonada y anulada, y SHALL permitir únicamente las transiciones definidas (llegada a con triaje, o a en atención solo si
es una visita con cita; con triaje a derivada o en atención; derivada a en atención o de vuelta a con triaje; en atención a derivada o atendida;
cierre sin atención desde llegada, con triaje o derivada). Los estados atendida, abandonada y anulada SHALL ser finales. Ninguna
persona SHALL poder cambiar el estado escribiendo directamente en la base de datos, y la base SHALL rechazar toda transición no
permitida aunque la origine una operación defectuosa.

#### Scenario: Estado final no se reabre (negativo)
- **WHEN** se intenta pasar una visita atendida, abandonada o anulada a cualquier otro estado
- **THEN** la operación se rechaza y la visita no cambia

#### Scenario: Salto de estado no permitido (negativo)
- **WHEN** se intenta pasar una visita de «llegada» a «atendida», o de «derivada» a «atendida»
- **THEN** la operación se rechaza

#### Scenario: Cambiar el estado escribiendo directamente (negativo)
- **WHEN** un administrativo, una enfermera o un profesional intenta actualizar el estado de una visita con una sentencia directa
- **THEN** la operación se rechaza por falta de privilegios

#### Scenario: Incoherencia entre estado y datos (negativo)
- **WHEN** se intenta dejar una visita en atención sin profesional, derivada sin especialidad de destino, o terminada sin hora
  de finalización
- **THEN** la base de datos lo rechaza

### Requirement: Cierre de una visita sin atención
El personal administrativo SHALL poder cerrar una visita en curso que no fue tomada como abandonada, indicando uno de un conjunto
cerrado de motivos (el paciente se retiró, no respondió al llamado, cita cancelada), y SHALL poder anularla solo si fue un error de
registro y aún no tiene triaje ni derivación. La enfermera SHALL poder marcar como abandonada una visita que aún no fue tomada.
El cierre SHALL registrar quién lo hizo y cuándo, y SHALL vencer las derivaciones pendientes de esa visita. El motivo SHALL ser
un código y no texto libre.

#### Scenario: Paciente que se fue antes del triaje
- **WHEN** el administrativo cierra como abandonada una visita en estado «llegada»
- **THEN** la visita queda abandonada con su hora de finalización y el paciente puede registrar una llegada nueva

#### Scenario: Paciente que se fue después de ser derivado
- **WHEN** se cierra como abandonada una visita derivada que nadie tomó
- **THEN** la derivación pendiente queda vencida y ningún profesional puede tomarla

#### Scenario: Anular una visita que ya tiene triaje (negativo)
- **WHEN** el administrativo intenta anular una visita que tiene un triaje registrado
- **THEN** se rechaza; solo puede cerrarla como abandonada

#### Scenario: Cerrar una visita ya tomada (negativo)
- **WHEN** se intenta cerrar como abandonada una visita en atención
- **THEN** se rechaza; la termina el profesional que la tiene

#### Scenario: Motivo libre (negativo)
- **WHEN** se intenta cerrar una visita con un texto libre como motivo
- **THEN** se rechaza: solo se admiten los motivos del conjunto cerrado

### Requirement: Quién lee las visitas
El personal administrativo SHALL poder leer todas las visitas, que contienen solo datos logísticos (paciente, estado, horas,
especialidad esperada) y ningún dato clínico. Un profesional SHALL leer únicamente las visitas que tiene en atención o que
corresponden a una cita suya. La enfermera, el paciente, una sesión sin rol, `anonymous`, el rol del cron y el rol de sincronización
SHALL NOT leer la tabla de visitas; la enfermera obtiene su lista por una lectura acotada (ver «triaje-por-enfermeria»).

#### Scenario: Administrativo lee la lista del día
- **WHEN** el administrativo consulta las visitas
- **THEN** ve todas las visitas, con su estado y horas, y ningún dato clínico

#### Scenario: Profesional ve solo las suyas
- **WHEN** un profesional consulta las visitas
- **THEN** ve las visitas que tiene en atención y las de sus citas, y no ve las de otros profesionales ni las derivadas a su
  especialidad que aún no tomó

#### Scenario: Enfermera, paciente y roles de servicio (negativo)
- **WHEN** una enfermera, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización consulta
  directamente las visitas
- **THEN** no recibe ninguna fila o se le deniega el privilegio

#### Scenario: Visitas sin cerrar de días anteriores
- **WHEN** el administrativo consulta las visitas en curso de días anteriores
- **THEN** ve cuáles siguen abiertas para cerrarlas manualmente

### Requirement: Las marcas de tiempo de la visita las fija el servidor y permiten medir la espera
El sistema SHALL registrar en cada visita la hora de llegada, la hora en que un profesional la tomó por primera vez y la hora de
finalización, todas con el reloj del servidor. La espera de un paciente SHALL medirse desde la hora de llegada hasta la hora en
que un profesional lo toma. El sistema SHALL entregar, para cada estado, si el paciente está esperando y a quién: esperando el
triaje (llegada), esperando a la enfermera para derivar (con triaje y sin cita), o esperando a un profesional (con triaje y con
cita, o derivada).

#### Scenario: Espera medida desde la llegada
- **WHEN** un paciente llega a las 09:00 y un profesional lo toma a las 09:18
- **THEN** la espera registrada es de 18 minutos

#### Scenario: Una cita confirmada sin visita no es una espera
- **WHEN** una cita está confirmada pero el paciente aún no llegó
- **THEN** no existe visita y el paciente no cuenta como persona en espera

#### Scenario: Visita sin tomar en un día anterior
- **WHEN** una visita de ayer sigue en curso
- **THEN** no cuenta como espera de hoy y aparece como visita sin cerrar

### Requirement: Los pacientes sin cita no cuentan para el indicador del portal
Registrar la llegada de un paciente sin cita SHALL NO crear una cita ni modificar ninguna. El indicador de citas reservadas o
canceladas por el propio paciente SHALL seguir calculándose solo sobre citas, de modo que los pacientes sin cita queden fuera de
su denominador. Una visita asociada a una cita SHALL NO contarse como una cita más.

#### Scenario: Llegada sin cita y conteo de citas
- **WHEN** llegan diez pacientes sin cita en un día
- **THEN** el número de citas y la proporción de citas hechas por el portal no cambian

#### Scenario: Atención sin cita no se convierte en cita
- **WHEN** un paciente sin cita es derivado y atendido
- **THEN** no se crea ninguna cita ni ninguna fila de origen «administrativo»

### Requirement: Indicadores de visitas de solo conteo
El sistema SHALL ofrecer al personal administrativo, y solo a él, conteos de visitas por rango de fechas: total, con cita, sin cita,
atenciones iniciadas, atenciones con triaje previo y atenciones iniciadas dentro de 20 minutos de la llegada. Los conteos SHALL NOT
incluir identificadores ni textos.

#### Scenario: Cobertura del triaje
- **WHEN** en un día hubo 20 atenciones iniciadas y 18 tenían un triaje registrado antes de iniciarse
- **THEN** el indicador informa 20 atenciones y 18 con triaje previo

#### Scenario: Otros roles (negativo)
- **WHEN** una enfermera, un profesional, un paciente o `anonymous` pide los indicadores
- **THEN** se rechaza por falta de permiso y no recibe ningún conteo

### Requirement: Rastro de las visitas
Toda creación o cambio de una visita SHALL quedar en la auditoría con quién, cuándo, qué acción y qué registro, y una visita SHALL
NOT poder borrarse.

#### Scenario: Cambio de estado auditado
- **WHEN** una visita cambia de estado
- **THEN** la auditoría registra la acción, el actor y la hora

#### Scenario: Borrado (negativo)
- **WHEN** cualquier rol, incluido el dueño de la base, intenta borrar una visita
- **THEN** la operación se rechaza
