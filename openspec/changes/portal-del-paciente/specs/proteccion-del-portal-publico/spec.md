# Spec Delta

## Purpose

Proteger la superficie pública del portal contra automatización abusiva y fuerza bruta (ADR-0026) sin molestar a los
pacientes legítimos y sin que estos controles sustituyan jamás a las reglas de acceso y de integridad de la base de datos.

## ADDED Requirements

### Requirement: El envío de los datos de registro y de la reserva se protege contra bots
El envío de los datos de registro del paciente y la confirmación de una reserva SHALL pasar por una verificación anti-bots
sin pedir al paciente resolver un desafío visible. Una solicitud clasificada como automatizada SHALL rechazarse con un mensaje
genérico en español y SHALL NOT crear ni modificar ningún dato. Las solicitudes de personas reales SHALL procesarse con
normalidad.

#### Scenario: Solicitud automatizada en la reserva
- **WHEN** la verificación anti-bots clasifica como automatizada una confirmación de reserva
- **THEN** se rechaza con «No pudimos verificar su solicitud. Intente de nuevo» y no se crea ninguna cita

#### Scenario: Solicitud automatizada en el registro
- **WHEN** la verificación anti-bots clasifica como automatizado el envío de los datos de registro
- **THEN** se rechaza con el mismo mensaje y no se crea ni se vincula ninguna ficha

#### Scenario: Paciente real
- **WHEN** una persona real, con un navegador común, confirma una reserva o envía sus datos
- **THEN** la verificación no le muestra ningún desafío y la operación continúa

#### Scenario: Pruebas automáticas legítimas
- **WHEN** las pruebas de extremo a extremo del proyecto ejercen el registro y la reserva en un entorno de pruebas
- **THEN** existe un mecanismo documentado y limitado a ese entorno para que no sean tratadas como bots, y ese mecanismo no
  está activo en producción

### Requirement: Las rutas de autenticación limitan los intentos por dirección
Los intentos de inicio de sesión y de registro que recibe la aplicación SHALL limitarse a 5 en una ventana de 15 minutos por
dirección IP. Superado el límite, la solicitud SHALL rechazarse con el código HTTP 429, un mensaje en español que indica
cuántos minutos esperar y la cabecera `Retry-After`. Las lecturas simples de las páginas SHALL tener un límite más holgado
para no bloquear a varias personas que comparten la misma red (por ejemplo, la sala de espera de la clínica).

#### Scenario: Sexto intento en 15 minutos
- **WHEN** una misma dirección IP envía un sexto intento de inicio de sesión dentro de 15 minutos
- **THEN** recibe 429 con «Demasiados intentos. Espere N minutos e intente de nuevo» y `Retry-After`

#### Scenario: Pasada la ventana
- **WHEN** transcurren los 15 minutos desde el primer intento
- **THEN** la dirección vuelve a poder intentar con normalidad

#### Scenario: Varias personas en la misma red leyendo la página
- **WHEN** seis personas de la misma red abren la página de inicio de sesión en pocos minutos, sin enviar credenciales
- **THEN** ninguna es bloqueada

### Requirement: Las acciones del portal tienen límites propios por usuario
El registro de datos, la búsqueda de horarios, la reserva y la cancelación SHALL tener un límite de peticiones por usuario
autenticado y por dirección IP, calculado en el servidor antes de consultar la base de datos. Superado el límite, la acción SHALL
responder «Demasiados intentos. Espere unos minutos e intente de nuevo.» sin ejecutar la operación. Los límites SHALL ser
holgados para el uso normal de un paciente que se equivoca o reintenta.

#### Scenario: Ráfaga de reservas
- **WHEN** una misma cuenta envía reservas a un ritmo muy superior al de una persona
- **THEN** a partir del límite, las siguientes reciben el mensaje de demasiados intentos y no llegan a la base de datos

#### Scenario: Paciente que se equivoca y reintenta
- **WHEN** un paciente cancela y vuelve a reservar varias veces en pocos minutos
- **THEN** no alcanza ningún límite

### Requirement: La caída de los controles de borde no tumba el portal ni debilita la base de datos
Si el almacén de contadores del límite de peticiones no está disponible, el portal SHALL seguir funcionando, SHALL dejar
constancia del fallo en el registro del servidor y SHALL mantener todas las reglas de la base de datos. Ningún control de este
requisito SHALL ser la barrera que impida ver datos ajenos, la doble reserva o la cancelación fuera de ventana: esas reglas
SHALL cumplirse aunque los controles de borde estén desactivados.

#### Scenario: Almacén de contadores no disponible
- **WHEN** el servicio de contadores no responde
- **THEN** el paciente puede reservar y cancelar con normalidad y el fallo queda registrado sin datos personales

#### Scenario: Controles de borde desactivados
- **WHEN** se desactivan la verificación anti-bots y los límites de peticiones
- **THEN** un paciente sigue sin poder ver citas ajenas, la doble reserva sigue rechazada con `Registro de cita ya agendado` y
  la cancelación a menos de 1 hora sigue rechazada
