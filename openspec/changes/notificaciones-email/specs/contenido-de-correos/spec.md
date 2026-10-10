# Spec Delta

## Purpose

Los correos al paciente son claros, en español y tratan de usted, dicen lo necesario para llegar a la cita o cancelarla a
tiempo y nunca revelan información clínica ni más datos de los indispensables, porque un correo puede terminar en un buzón
compartido o en una pantalla de bloqueo.

## ADDED Requirements

### Requirement: Textos en español, de usted, con fechas de Lima
Todo correo SHALL estar redactado en español (`es-PE`), dirigido al paciente de usted, con un saludo por su nombre. Las
fechas SHALL mostrarse como `dd/MM/yyyy` y las horas como `HH:mm` de 24 horas, siempre en la zona `America/Lima`,
independientemente de la zona horaria del servidor que los genera.

#### Scenario: Cita vista desde un servidor en otra zona
- **WHEN** se genera el correo de una cita del 14/10/2026 a las 14:30 de Lima con el servidor en UTC o en Asia/Tokio
- **THEN** el correo dice `14/10/2026` y `14:30` en ambos casos

#### Scenario: Trato de usted
- **WHEN** se generan los cuatro tipos de correo
- **THEN** ninguno usa el trato de tú ni formas verbales de segunda persona informal, y todos se dirigen al paciente de usted

### Requirement: Contenido mínimo y sin datos clínicos
Cada correo SHALL contener solamente: el nombre del paciente, la fecha y la hora de la cita, el nombre del médico, la
especialidad, la hora límite para cancelar y el acceso al portal. Ningún correo SHALL contener diagnósticos, el motivo de la
cita, anamnesis, tratamientos, antecedentes, datos de la historia clínica, número de historia, documento de identidad,
teléfono, dirección, fecha de nacimiento ni sexo del paciente. El asunto SHALL ser neutro: no SHALL incluir el nombre del
médico ni la especialidad.

#### Scenario: Motivo de la cita con texto clínico
- **WHEN** la cita tiene un motivo escrito como «dolor de pecho desde ayer» y se generan los cuatro tipos de correo
- **THEN** ninguno contiene ese texto ni parte de él

#### Scenario: Asunto neutro
- **WHEN** se genera el recordatorio de una cita de Cardiología con un médico determinado
- **THEN** el asunto indica solo que es un recordatorio de la cita y su fecha, sin médico ni especialidad

#### Scenario: Datos de identidad ausentes
- **WHEN** se genera cualquier correo de un paciente con DNI, teléfono y dirección registrados
- **THEN** el correo no contiene ninguno de esos tres datos

### Requirement: Cada tipo de correo dice lo que el paciente necesita
La **confirmación de reserva** SHALL mostrar fecha, hora, médico y especialidad, y la advertencia de que la cita solo puede
cancelarse hasta 1 hora antes, con la hora límite. El **recordatorio** SHALL mostrar los mismos datos, la hora límite para
cancelar y cómo hacerlo. La **cancelación** SHALL mostrar la cita cancelada y cómo reservar otra. La **reprogramación** SHALL
mostrar la cita anterior y la nueva (fecha, hora, médico y especialidad de cada una).

#### Scenario: Confirmación
- **WHEN** se confirma la reserva de una cita el 14/10/2026 a las 14:30
- **THEN** el correo muestra la advertencia de cancelación y la hora límite `13:30` del mismo día

#### Scenario: Recordatorio
- **WHEN** se envía el recordatorio de esa cita
- **THEN** muestra la fecha, la hora, el médico, la especialidad, la hora límite `13:30` y el enlace para cancelar

#### Scenario: Reprogramación
- **WHEN** una cita se mueve a otro médico y otro horario
- **THEN** el correo muestra ambos horarios y ambos médicos, identificando cuál es el anterior y cuál el nuevo

### Requirement: El enlace para cancelar requiere iniciar sesión
Los correos que permiten gestionar la cita SHALL incluir un enlace al portal del paciente («Mis citas»). El enlace SHALL
requerir que el paciente inicie sesión y SHALL NOT contener identificadores de la cita, tokens ni datos del paciente en la
dirección; no SHALL existir ningún enlace que cancele una cita con un solo clic desde el correo.

#### Scenario: Enlace del recordatorio
- **WHEN** se revisa la dirección del enlace de un correo
- **THEN** apunta a «Mis citas» del portal, sin identificadores ni tokens, y abrirla sin sesión lleva al inicio de sesión

### Requirement: Correo legible y sin seguimiento
Cada correo SHALL enviarse con versión HTML y versión de texto plano, SHALL ser legible sin cargar imágenes ni estilos
externos, con contraste suficiente, y SHALL escapar el contenido variable (nombres) para que no pueda inyectar marcado. Esta
versión SHALL NOT incluir seguimiento de apertura ni de clics.

#### Scenario: Nombre con caracteres especiales
- **WHEN** el nombre del paciente contiene `<`, `&` o comillas
- **THEN** el HTML los muestra como texto, sin interpretarlos como marcado

#### Scenario: Sin seguimiento
- **WHEN** se inspecciona un correo enviado
- **THEN** no contiene píxeles de seguimiento ni enlaces redirigidos por el proveedor

### Requirement: Remitente propio y entregabilidad verificada a mano
Antes de enviar correo real, el dominio remitente SHALL estar verificado en el proveedor con SPF, DKIM y DMARC, y el equipo
SHALL comprobar a mano que un correo de cada tipo llega a la bandeja de entrada (no a spam) en al menos tres proveedores de
buzón de uso frecuente. Durante los primeros meses de uso, el equipo SHALL revisar a mano el panel del proveedor (entregas,
rebotes y quejas) con una periodicidad definida, y SHALL escalar al cliente la decisión de sumar otro canal si los rebotes o
las quejas superan los umbrales acordados (riesgo P-7 de TECH-DESIGN). Esa revisión y esa comprobación no se automatizan.

#### Scenario: Antes de salir a producción
- **WHEN** se prepara el primer envío real
- **THEN** existe constancia (fecha y capturas) del dominio verificado y de la llegada a bandeja de entrada de un correo de
  cada tipo en tres proveedores de buzón

#### Scenario: Revisión periódica
- **WHEN** transcurre la periodicidad de revisión definida durante los primeros meses
- **THEN** alguien del equipo revisa entregas, rebotes y quejas en el panel del proveedor y anota el resultado en el
  documento de operación

#### Scenario: Tasas fuera de umbral
- **WHEN** los rebotes o las quejas superan los umbrales acordados
- **THEN** el hallazgo se eleva al cliente como decisión de alcance nueva; el sistema no suma canales por su cuenta
