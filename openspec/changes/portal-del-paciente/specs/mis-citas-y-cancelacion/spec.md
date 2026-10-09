# Spec Delta

## Purpose

Permitir que el paciente vea sus citas, próximas y anteriores, y cancele las suyas por sí mismo respetando la ventana de 1 hora
que rige para todos los roles, sin poder tocar las citas de otras personas ni cambiar nada que no sea cancelar.

## ADDED Requirements

### Requirement: «Mis citas» muestra solo las citas del paciente, separadas en próximas y anteriores
«Mis citas» SHALL listar únicamente las citas del paciente de la sesión. Las **próximas** SHALL ser las citas en estado
`reservada` o `confirmada` que todavía no terminaron, ordenadas de la más cercana a la más lejana. Las **anteriores** SHALL ser
todas las demás (atendidas, canceladas, no asistió y las que ya pasaron), de la más reciente a la más antigua, con la opción
«Ver más» cuando haya más de 20. Cada cita SHALL mostrar médico, especialidad, fecha, hora y su estado como insignia con
etiqueta de texto e icono (Reservada, Confirmada, Atendida, Cancelada, No asistió), en hora de Lima con formato `dd/MM/yyyy`
y `HH:mm`.

#### Scenario: Paciente con citas
- **WHEN** un paciente con dos citas futuras y tres pasadas abre «Mis citas»
- **THEN** ve las dos futuras en «Próximas», de la más cercana a la más lejana, y las tres pasadas en «Anteriores»

#### Scenario: Estados distinguibles sin color
- **WHEN** se muestran citas en los cinco estados
- **THEN** cada una lleva su etiqueta de texto y su icono, y las cinco se distinguen sin percibir el color

#### Scenario: Paciente sin citas
- **WHEN** un paciente sin citas abre «Mis citas»
- **THEN** ve el mensaje «Todavía no tiene citas» y el botón «Reservar cita»

#### Scenario: Citas de otra persona
- **WHEN** existen citas de otros pacientes en el sistema
- **THEN** ninguna aparece en «Mis citas» ni en «Inicio», ni siquiera con un identificador conocido en la dirección

### Requirement: La cancelación solo se ofrece mientras sea posible
En cada cita próxima, el portal SHALL ofrecer el botón «Cancelar cita» únicamente si faltan 1 hora o más para su inicio, junto
con el texto «Puede cancelar hasta las HH:mm» en hora de Lima. Si faltan menos de 1 hora, SHALL mostrar en su lugar
«Ya no se puede cancelar por el portal» y no ofrecer el botón. Las citas que no están en estado `reservada` o `confirmada` no
SHALL ofrecer cancelación.

#### Scenario: Cita con tiempo suficiente
- **WHEN** una cita empieza a las 14:30 y son las 11:00
- **THEN** la tarjeta muestra «Puede cancelar hasta las 13:30» y el botón «Cancelar cita»

#### Scenario: Cita demasiado cercana
- **WHEN** una cita empieza dentro de 40 minutos
- **THEN** la tarjeta muestra «Ya no se puede cancelar por el portal» y no hay botón de cancelar

#### Scenario: Cita ya cancelada o atendida
- **WHEN** la cita está en estado `cancelada`, `atendida` o `no_asistio`
- **THEN** no se ofrece cancelar

### Requirement: Cancelar una cita requiere confirmación y deja constancia
Al pulsar «Cancelar cita», el portal SHALL pedir confirmación mostrando médico, fecha y hora, y aclarando que la acción no se
puede deshacer y que podrá reservar otra. Al confirmar, la cita SHALL pasar a `cancelada`, el sistema SHALL registrar el
momento y el perfil de quien cancela (el propio paciente), y la cita SHALL pasar a «Anteriores» con la insignia «Cancelada».
El horario liberado SHALL volver a estar disponible para otros pacientes.

#### Scenario: Cancelación confirmada
- **WHEN** el paciente cancela una cita que empieza en más de 1 hora y confirma el diálogo
- **THEN** la cita queda `cancelada` con la marca de tiempo y el perfil del paciente, aparece en «Anteriores», y su horario
  vuelve a aparecer como libre en la búsqueda

#### Scenario: El paciente se arrepiente en la confirmación
- **WHEN** el paciente abre el diálogo de cancelación y elige «No cancelar»
- **THEN** la cita sigue sin cambios

#### Scenario: Doble envío de la cancelación
- **WHEN** la misma cancelación se envía dos veces
- **THEN** la cita queda cancelada una sola vez y el paciente ve que ya está cancelada, no un error confuso

### Requirement: La ventana de 1 hora se aplica con el reloj del servidor, aunque la pantalla esté desactualizada
Cancelar una cita con menos de 1 hora de anticipación SHALL ser imposible para el paciente, aun si su pantalla seguía mostrando
el botón. A 61 minutos se SHALL permitir y a 59 minutos se SHALL rechazar; el límite es exacto y se mide con la hora del
servidor y el inicio guardado de la cita, nunca con la del navegador. El mensaje SHALL decir qué pasó y qué hacer, sin
prometer una cancelación que la clínica tampoco puede hacer.

#### Scenario: Pantalla abierta desde hace rato
- **WHEN** el paciente pulsa «Cancelar cita» y confirma cuando ya faltan 59 minutos
- **THEN** la cita no se cancela y ve «Ya no es posible cancelar esta cita porque falta menos de 1 hora. Si no puede asistir,
  avise a la clínica.»

#### Scenario: Límite exacto
- **WHEN** faltan 61 minutos para la cita
- **THEN** la cancelación se acepta; a 59 minutos se rechaza

#### Scenario: Reloj del navegador adelantado o atrasado
- **WHEN** el reloj del dispositivo del paciente está desfasado respecto de la hora real
- **THEN** la decisión de aceptar o rechazar la cancelación sigue la hora del servidor

### Requirement: El paciente no cancela citas ajenas
El paciente SHALL poder cancelar únicamente sus propias citas. Una solicitud de cancelación con el identificador de la cita de
otra persona SHALL no cambiar nada y SHALL recibir la respuesta «No encontramos esa cita», idéntica a la de una cita
inexistente, sin revelar si pertenece a alguien más.

#### Scenario: Identificador de una cita ajena
- **WHEN** el paciente A envía la cancelación con el identificador de una cita del paciente B
- **THEN** la cita de B permanece sin cambios y A ve «No encontramos esa cita»

#### Scenario: Identificador inexistente
- **WHEN** el paciente envía la cancelación con un identificador que no existe
- **THEN** ve el mismo mensaje «No encontramos esa cita»

### Requirement: El paciente solo puede cancelar, no modificar la cita
En el portal el paciente SHALL poder únicamente cancelar sus citas; no SHALL poder cambiar el médico, el horario, el
paciente, el estado a otro distinto de `cancelada`, ni ningún otro dato, ni desde la pantalla ni con una solicitud construida a
mano. Para cambiar de horario el paciente cancela y reserva una nueva cita; reprogramar sigue siendo función del administrativo.

#### Scenario: Intento de mover la cita
- **WHEN** una solicitud del paciente intenta, además de cancelar o en lugar de ello, cambiar el inicio, el médico o el
  paciente de su cita
- **THEN** la base de datos rechaza el cambio y la cita queda como estaba

#### Scenario: Intento de cambiar el estado a confirmada o atendida
- **WHEN** una solicitud del paciente intenta poner su cita en `confirmada`, `atendida` o `no_asistio`
- **THEN** se rechaza y el estado no cambia

#### Scenario: El portal no ofrece reprogramar
- **WHEN** el paciente ve cualquier cita en «Mis citas»
- **THEN** no existe una acción «Reprogramar»
