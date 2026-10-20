# Spec Delta

## Purpose

Permitir que el administrativo defina cuándo atiende cada médico (plantilla semanal y ausencias) y que el sistema calcule
en consulta los horarios libres, sin duplicar horarios y sin exponer a los pacientes las citas de otros ni los motivos de
las ausencias.

## ADDED Requirements

### Requirement: El administrativo gestiona la disponibilidad semanal de cada médico
El administrativo SHALL poder crear, modificar y eliminar las disponibilidades de un médico. Cada disponibilidad define un
día de la semana (0 = domingo a 6 = sábado), una hora de inicio anterior a la de fin, una duración de slot positiva (20
minutos por defecto) y una vigencia con fecha de inicio y fecha de fin opcional. La fecha de inicio por defecto SHALL ser
la fecha de hoy en `America/Lima`. Solo el administrativo SHALL poder escribir disponibilidades; los demás roles solo las
leen.

#### Scenario: Alta de una disponibilidad
- **WHEN** el administrativo registra para un médico los lunes de 08:00 a 12:00 con slots de 20 minutos
- **THEN** la disponibilidad se guarda y el médico ofrece slots los lunes vigentes desde la fecha de inicio indicada

#### Scenario: Datos incoherentes
- **WHEN** el administrativo envía una hora de fin igual o anterior a la de inicio, un día de la semana fuera de 0 a 6 o una
  duración de slot igual o menor que cero
- **THEN** la operación se rechaza con un mensaje en español que indica qué campo corregir y no se guarda nada

#### Scenario: La vigencia por defecto es la fecha de Lima
- **WHEN** se registra una disponibilidad sin fecha de inicio a las 21:00 hora de Lima (02:00 UTC del día siguiente)
- **THEN** la vigencia empieza el día calendario de Lima en que se registró, no el del servidor

#### Scenario: Otros roles no escriben disponibilidades (negativo)
- **WHEN** un paciente, un médico, una enfermera o una sesión sin rol intenta insertar, modificar o eliminar una
  disponibilidad
- **THEN** la base de datos rechaza la operación

#### Scenario: Advertencia al recortar una disponibilidad con citas futuras
- **WHEN** el administrativo elimina o acorta una disponibilidad y existen citas vigentes futuras que quedarían fuera del
  nuevo horario
- **THEN** el sistema informa cuántas son y no cancela ninguna: quedan para que el administrativo las atienda

### Requirement: Los horarios de un mismo médico no se solapan
La base de datos SHALL rechazar una disponibilidad cuyo tramo horario se solape, el mismo día de la semana y con vigencias
que se cruzan, con otra del mismo médico. El mensaje al usuario SHALL ser propio de esta situación y no SHALL ser el de la
doble reserva de citas.

#### Scenario: Tramos solapados el mismo día
- **WHEN** se registra para un médico los lunes de 10:00 a 14:00 teniendo ya los lunes de 08:00 a 12:00 vigentes
- **THEN** la operación se rechaza con un mensaje como «Este horario se cruza con otro ya definido para el médico»

#### Scenario: Tramos contiguos
- **WHEN** se registra los lunes de 12:00 a 16:00 teniendo ya los lunes de 08:00 a 12:00
- **THEN** ambas disponibilidades se aceptan

#### Scenario: Mismo tramo en otro día o para otro médico
- **WHEN** se registra el mismo tramo horario para un día de la semana distinto, o para otro médico
- **THEN** la disponibilidad se acepta

#### Scenario: Vigencias que no se cruzan
- **WHEN** se registra el mismo tramo y día con una vigencia que empieza después de que termina la de la existente
- **THEN** la disponibilidad se acepta

#### Scenario: El mensaje no es el de doble reserva
- **WHEN** se rechaza una disponibilidad por solape
- **THEN** el mensaje mostrado es distinto de `Registro de cita ya agendado`

### Requirement: El administrativo registra las ausencias del médico como bloqueos de agenda
El administrativo SHALL poder crear, modificar y eliminar bloqueos de agenda de un médico con fecha y hora de inicio, fecha
y hora de fin obligatoria posterior al inicio, y un motivo con contenido. Dos bloqueos del mismo médico no SHALL
solaparse, y el mensaje de rechazo SHALL ser propio («Ya existe una ausencia registrada que se cruza con ese periodo»).
Solo el administrativo SHALL escribir bloqueos; solo él y el médico dueño SHALL leerlos. Toda creación, modificación o
eliminación SHALL quedar en la auditoría con quién y cuándo, porque un bloqueo habilita la excepción de la ventana de
cancelación.

#### Scenario: Alta de un bloqueo
- **WHEN** el administrativo registra una ausencia del médico del 20/10/2026 08:00 al 24/10/2026 18:00 (hora de Lima) con
  motivo «Licencia»
- **THEN** el bloqueo se guarda con esas fechas interpretadas en `America/Lima` y el médico deja de ofrecer slots en ese
  periodo

#### Scenario: Fin anterior al inicio o motivo vacío
- **WHEN** se envía un bloqueo con fin igual o anterior al inicio, sin fecha de fin, o con el motivo vacío o solo espacios
- **THEN** la operación se rechaza con un mensaje que indica qué corregir y no se guarda nada

#### Scenario: Bloqueos solapados del mismo médico
- **WHEN** se registra una ausencia que se cruza con otra ya registrada para el mismo médico
- **THEN** se rechaza con el mensaje propio de ausencias y no con `Registro de cita ya agendado`

#### Scenario: Cambios de bloqueos auditados
- **WHEN** el administrativo crea, modifica o elimina un bloqueo
- **THEN** la auditoría registra la acción, el perfil de quien la hizo y el momento

#### Scenario: Paciente y enfermera no ven los bloqueos (negativo)
- **WHEN** un paciente, una enfermera o una sesión sin rol consulta los bloqueos de agenda
- **THEN** no recibe ninguna fila, ni siquiera de un médico con quien tiene cita

#### Scenario: Un médico solo ve sus propios bloqueos (negativo)
- **WHEN** un médico consulta los bloqueos de agenda
- **THEN** recibe únicamente los suyos y ninguno de otro médico

#### Scenario: Otros roles no escriben bloqueos (negativo)
- **WHEN** un paciente, un médico o una enfermera intenta insertar, modificar o eliminar un bloqueo
- **THEN** la base de datos rechaza la operación

### Requirement: Los horarios libres se calculan en consulta
Para un médico y una fecha de calendario de `America/Lima`, el sistema SHALL calcular los slots libres a partir de la
disponibilidad vigente ese día de la semana, sin almacenar slots. Un slot SHALL ofrecerse solo si cabe completo dentro del
tramo, empieza en el futuro, no se solapa con ninguna cita `reservada` o `confirmada` del médico y no se solapa con ningún
bloqueo del médico. Un médico dado de baja (`activo = false`) no SHALL ofrecer ningún slot. Cualquier cambio de
disponibilidad, bloqueo o cita SHALL reflejarse en la siguiente consulta sin ningún proceso de resincronización.

#### Scenario: Slots de un tramo
- **WHEN** un médico tiene los lunes de 08:00 a 10:00 con slots de 20 minutos y se consulta un lunes futuro sin citas ni
  bloqueos
- **THEN** se devuelven seis slots: 08:00, 08:20, 08:40, 09:00, 09:20 y 09:40

#### Scenario: Un tramo que no es múltiplo de la duración
- **WHEN** el tramo es de 08:00 a 09:50 con slots de 20 minutos
- **THEN** el último slot ofrecido empieza a las 09:20 y no se ofrece uno que termine después de las 09:50

#### Scenario: Una cita vigente oculta su slot y una cancelada lo libera
- **WHEN** existe una cita `reservada` de 08:20 a 08:40 y luego se cancela
- **THEN** mientras estuvo vigente el slot de 08:20 no se ofreció, y tras cancelarla vuelve a ofrecerse

#### Scenario: Un bloqueo oculta los slots que toca
- **WHEN** un bloqueo cubre de 08:30 a 09:10 del mismo día
- **THEN** no se ofrecen los slots de 08:20, 08:40 y 09:00, aunque el bloqueo solo cubra parte de alguno

#### Scenario: Los slots pasados no se ofrecen
- **WHEN** se consulta el día de hoy a las 08:50 hora de Lima
- **THEN** no se devuelve ningún slot que empiece a las 08:50 o antes

#### Scenario: Día sin disponibilidad o fuera de vigencia
- **WHEN** se consulta un día de la semana sin disponibilidad, o una fecha anterior al inicio o posterior al fin de la
  vigencia
- **THEN** no se devuelve ningún slot

#### Scenario: Médico dado de baja
- **WHEN** se consulta un médico con `activo = false` que tiene disponibilidad vigente
- **THEN** no se devuelve ningún slot

#### Scenario: Cambio visible de inmediato
- **WHEN** el administrativo crea un bloqueo que cubre un slot que se estaba ofreciendo y se consulta de nuevo
- **THEN** ese slot ya no aparece

#### Scenario: Tramo vespertino en la frontera con UTC
- **WHEN** un médico atiende los lunes de 18:00 a 20:00 hora de Lima, que en UTC cae entre las 23:00 del lunes y las 01:00 del
  martes, y se consulta ese lunes
- **THEN** se devuelven los slots de ese tramo para el lunes de Lima, sin importar la zona horaria del servidor

### Requirement: El cálculo de horarios no expone datos de otras citas ni los motivos de ausencias
La consulta de slots libres SHALL estar disponible para el administrativo y para el paciente (que reserva) y SHALL devolver
solamente el inicio y el fin de cada horario libre. No SHALL devolver identificadores de citas, datos de otros pacientes ni
motivos de bloqueos, y no SHALL dar al paciente permiso de lectura sobre `bloqueos_agenda` ni sobre citas ajenas. Para un
médico, una enfermera o una sesión sin rol, la consulta SHALL devolver vacío.

#### Scenario: El paciente ve horarios libres pero no los bloqueos (negativo)
- **WHEN** un paciente consulta los slots libres de un médico que tiene un bloqueo y citas de otros pacientes, y luego
  consulta directamente `bloqueos_agenda` y las citas de ese médico
- **THEN** la primera consulta devuelve los horarios libres, y las consultas directas no devuelven ninguna fila

#### Scenario: Un horario ocupado por la cita de otro paciente no se ofrece (negativo)
- **WHEN** un paciente consulta los slots libres de un médico cuyo horario de las 08:20 está ocupado por la cita de otro paciente,
  y ese paciente no tiene permiso para leer esa cita
- **THEN** el horario de las 08:20 no aparece como libre, porque el cálculo considera todas las citas vigentes aunque quien
  consulta no pueda leerlas, y la respuesta no revela de quién es la cita

#### Scenario: Médico, enfermera y sesión sin rol no obtienen horarios (negativo)
- **WHEN** un médico, una enfermera o una sesión sin rol consulta los slots libres de cualquier médico
- **THEN** la consulta devuelve vacío

#### Scenario: Solo inicio y fin
- **WHEN** el administrativo o el paciente consulta los slots libres
- **THEN** cada fila contiene únicamente el inicio y el fin del horario, sin motivo de bloqueo ni datos de cita
