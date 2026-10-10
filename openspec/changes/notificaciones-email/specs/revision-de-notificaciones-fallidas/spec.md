# Spec Delta

## Purpose

El administrativo tiene un lugar único para ver qué avisos no llegaron a un paciente, sin tener que consultar la base de
datos ni esperar la llamada de un paciente que no recibió nada (ADR-0018), y ningún otro rol ve ni escribe notificaciones.

## ADDED Requirements

### Requirement: Vista de notificaciones fallidas para el administrativo
El panel administrativo SHALL ofrecer una vista de solo lectura que liste las notificaciones en estado fallido con 3 o más
intentos, ordenadas de la más antigua a la más reciente. Cada fila SHALL mostrar el nombre y el documento del paciente, el
correo destinatario, el tipo de aviso (con su nombre legible), la fecha y hora de la cita en `America/Lima`, el número de
intentos y el motivo del error registrado. La vista SHALL NOT incluir acciones de reenvío ni de reintento (ADR-0018) ni datos
clínicos.

#### Scenario: Hay notificaciones por revisar
- **WHEN** el administrativo abre la vista y existen 3 notificaciones fallidas con 3 intentos
- **THEN** ve las 3 filas ordenadas de la más antigua a la más reciente, con paciente, documento, correo, tipo, cita,
  intentos y motivo

#### Scenario: Más filas que una página
- **WHEN** existen más de 25 notificaciones por revisar
- **THEN** la vista las reparte en páginas de 25, indica cuántas hay en total y permite recorrerlas todas sin ocultar
  ninguna

#### Scenario: No hay nada por revisar
- **WHEN** no existe ninguna notificación fallida con 3 o más intentos
- **THEN** la vista lo dice con un mensaje claro en español («No hay notificaciones fallidas por revisar») y no muestra una
  tabla vacía

#### Scenario: Solo lo que espera revisión
- **WHEN** existen notificaciones enviadas, pendientes, fallidas con menos de 3 intentos y omitidas por cita cancelada o ya
  ocurrida
- **THEN** ninguna de ellas aparece en la vista

#### Scenario: Sin acciones de reenvío
- **WHEN** el administrativo revisa cualquier fila
- **THEN** no hay ningún botón ni enlace que reenvíe o reintente el aviso desde la interfaz

#### Scenario: Sin datos clínicos
- **WHEN** se muestra cualquier fila
- **THEN** no aparece diagnóstico, motivo de la cita, nota de atención ni contenido de la historia clínica

### Requirement: Solo el administrativo accede a la vista y a las notificaciones
La vista SHALL ser accesible solo para el rol administrativo con sesión iniciada. El paciente, el médico, la enfermera y una
sesión sin rol SHALL NOT poder abrirla ni obtener filas de notificaciones consultando la base de datos directamente. Solo el
administrativo SHALL poder leer notificaciones; el paciente, el médico, la enfermera y los demás roles de aplicación SHALL
NOT poder leerlas ni escribirlas.

#### Scenario: Visitante sin sesión (negativo)
- **WHEN** alguien sin sesión abre la dirección de la vista
- **THEN** es llevado al inicio de sesión

#### Scenario: Otro rol abre la vista (negativo)
- **WHEN** un paciente, un médico o una enfermera con sesión abre la dirección de la vista
- **THEN** es devuelto a su propia área y no ve ninguna notificación

#### Scenario: Consulta directa de otro rol (negativo)
- **WHEN** un paciente, un médico, una enfermera o una sesión sin rol consulta las notificaciones directamente en la base de
  datos, existiendo notificaciones fallidas
- **THEN** no obtiene ninguna fila

#### Scenario: Escritura directa del administrativo (negativo)
- **WHEN** el administrativo intenta insertar, modificar o borrar una notificación directamente
- **THEN** la operación es rechazada: las notificaciones solo las crea y actualiza el sistema por sus vías acotadas

### Requirement: Cómo se recupera un aviso fallido sin reenvío manual
La única vía de recuperación de un aviso fallido SHALL ser el reintento automático del proceso programado, más la
rehabilitación al corregir el correo del paciente (ver `recordatorio-de-cita`). El resumen que el administrativo ve SHALL
indicar el motivo del error para que pueda actuar sobre su causa (por ejemplo, corregir la dirección del paciente).

#### Scenario: El administrativo corrige la dirección
- **WHEN** el administrativo corrige el correo de un paciente con una notificación fallida de una cita futura
- **THEN** en la siguiente ejecución diaria el aviso se reintenta con el correo nuevo y, si se envía, deja de aparecer en la
  vista

#### Scenario: Cita ya pasada
- **WHEN** el administrativo corrige el correo de un paciente cuya notificación fallida corresponde a una cita que ya ocurrió
- **THEN** la notificación no se reintenta y sigue visible en la vista
