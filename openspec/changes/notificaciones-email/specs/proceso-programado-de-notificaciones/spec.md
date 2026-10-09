# Spec Delta

## Purpose

Un único proceso diario envía los recordatorios vencidos y reintenta los avisos fallidos, con una credencial de base de
datos de alcance mínimo, sin enviar nunca dos veces el mismo aviso y sin que una configuración incompleta lo vuelva
peligroso. Corre en el plan gratuito de la plataforma de despliegue (ADR-0028).

## ADDED Requirements

### Requirement: Solo el programador de la plataforma puede ejecutar el proceso
El proceso SHALL ejecutarse únicamente cuando la petición trae el secreto compartido configurado para el programador de
tareas. Una petición sin secreto, con un secreto distinto o sin sesión SHALL recibir una respuesta de no autorizado sin tocar
la base de datos ni el proveedor de correo. Si el secreto no está configurado en el entorno, el proceso SHALL negarse a
ejecutar (falla cerrado) y no SHALL aceptar peticiones.

#### Scenario: Petición legítima del programador
- **WHEN** el programador de tareas invoca el proceso con el secreto correcto
- **THEN** el proceso se ejecuta y responde con un resumen de lo realizado

#### Scenario: Petición anónima (negativo)
- **WHEN** cualquier visitante, con o sin sesión de la aplicación, invoca el proceso sin el secreto o con uno incorrecto
- **THEN** recibe una respuesta de no autorizado, no se lee ni se escribe ninguna notificación y no se llama al proveedor

#### Scenario: Secreto no configurado
- **WHEN** el entorno no tiene definido el secreto del programador
- **THEN** el proceso responde con error de configuración y no ejecuta nada, incluso si la petición trae una cabecera de
  autorización vacía

### Requirement: Una sola ejecución diaria, a las 08:00 de Lima
El proyecto SHALL declarar un único trabajo programado que invoque el proceso una vez al día a las 13:00 UTC (08:00 de
Lima), compatible con el plan gratuito de la plataforma (ADR-0028). En esa misma ejecución el proceso SHALL enviar los
recordatorios vencidos y reintentar los avisos fallidos con intentos disponibles. La hora de ejecución real PUEDE variar
dentro de la hora programada; el diseño no SHALL depender de la precisión del minuto.

#### Scenario: Declaración del trabajo programado
- **WHEN** se revisa la configuración de despliegue
- **THEN** existe exactamente un trabajo programado, con frecuencia diaria a las 13:00 UTC, y la hora coincide con la hora
  de envío con la que se programan los recordatorios

#### Scenario: Ejecución un poco tardía
- **WHEN** la plataforma ejecuta el trabajo a las 08:40 de Lima en lugar de a las 08:00
- **THEN** envía los mismos recordatorios que habría enviado a las 08:00

### Requirement: La credencial del proceso tiene el alcance mínimo
El proceso SHALL conectarse a la base de datos solamente con el rol de servicio de notificaciones, que puede leer y escribir
las notificaciones y solo leer las citas. Este change SHALL NOT ampliar los privilegios de ese rol. Ese rol SHALL NOT poder
leer pacientes, perfiles, médicos, especialidades ni ningún dato clínico, ni modificar, crear o borrar citas, ni ejecutar las
funciones que arman el contenido de un aviso. La conexión con ese rol SHALL poder importarse únicamente desde el proceso
programado, nunca desde el código que atiende a usuarios.

#### Scenario: El proceso hace su trabajo con ese rol
- **WHEN** el proceso lee los avisos vencidos, consulta el estado de las citas y actualiza el resultado de cada aviso
- **THEN** todas esas operaciones tienen éxito con el rol de servicio de notificaciones

#### Scenario: El rol no lee datos de personas ni clínicos (negativo)
- **WHEN** el rol de servicio intenta leer pacientes, perfiles, médicos, especialidades, atenciones, antecedentes, historias
  clínicas o asignaciones
- **THEN** cada intento es rechazado por falta de privilegio

#### Scenario: El rol no altera la agenda (negativo)
- **WHEN** el rol de servicio intenta crear, modificar o borrar una cita, o borrar una notificación
- **THEN** cada intento es rechazado por falta de privilegio

#### Scenario: El rol no arma contenido (negativo)
- **WHEN** el rol de servicio intenta ejecutar la función que construye el contenido de un aviso a partir de una cita
- **THEN** el intento es rechazado, de modo que su acceso a datos de personas sigue siendo solo la copia guardada con cada aviso

#### Scenario: La conexión no llega al código de usuario (negativo)
- **WHEN** un módulo fuera del proceso programado importa la conexión del rol de servicio
- **THEN** la verificación automática del repositorio (regla de lint y prueba) falla señalando el archivo

### Requirement: Envío idempotente, también bajo ejecución simultánea
Un mismo aviso SHALL enviarse como máximo una vez por intento, aunque el proceso se ejecute dos veces seguidas, la plataforma
lo invoque por duplicado o dos ejecuciones se solapen. Antes de llamar al proveedor, el proceso SHALL reservar cada aviso de
forma atómica de modo que otra ejecución simultánea no pueda tomarlo. Al llamar al proveedor SHALL enviar una clave de
idempotencia derivada del tipo de aviso y de la cita, para que un reintento tras un resultado no registrado no duplique el
correo dentro de la ventana que el proveedor garantiza.

#### Scenario: Dos ejecuciones seguidas
- **WHEN** el proceso corre dos veces seguidas con un recordatorio vencido
- **THEN** el proveedor recibe un solo mensaje para ese recordatorio y la segunda ejecución no lo toma

#### Scenario: Dos ejecuciones simultáneas
- **WHEN** dos ejecuciones del proceso arrancan a la vez sobre los mismos avisos vencidos
- **THEN** cada aviso se envía una sola vez en total, repartido entre las dos

#### Scenario: Intento interrumpido sin resultado registrado
- **WHEN** una ejecución reservó un aviso y terminó (por tiempo agotado o caída) sin registrar su resultado
- **THEN** el aviso se vuelve a tomar en una ejecución posterior, después de la espera mínima, mientras le queden intentos, y
  el proveedor no duplica el correo si la clave de idempotencia sigue vigente

#### Scenario: Intentos agotados sin resultado
- **WHEN** un aviso acumula 3 intentos reservados sin ningún resultado registrado
- **THEN** pasa a estado fallido con un motivo que lo explica, de modo que queda visible para revisión manual

### Requirement: Reintentos con tope de 3 intentos y espera mínima
Un aviso fallido con menos de 3 intentos SHALL reintentarse en una ejecución posterior, siempre que hayan pasado al menos 2
horas desde su último intento y que el aviso siga teniendo sentido. El conteo de intentos incluye el primero. Al llegar a 3
intentos fallidos el aviso SHALL dejar de reintentarse automáticamente y quedar visible para revisión manual. Un aviso nunca
SHALL tomarse más de una vez en la misma ejecución.

#### Scenario: Reintento tras un fallo transitorio
- **WHEN** un recordatorio falló ayer por un error transitorio y la cita sigue vigente
- **THEN** la ejecución de hoy lo reintenta, y si el proveedor lo acepta queda enviado con su identificador

#### Scenario: Espera mínima
- **WHEN** un aviso falló hace 30 minutos y el proceso corre
- **THEN** ese aviso no se toma en esta ejecución

#### Scenario: Tercer fallo
- **WHEN** un aviso falla por tercera vez
- **THEN** queda en estado fallido con 3 intentos y no se vuelve a tomar

### Requirement: Errores permanentes, transitorios y de configuración
El proceso SHALL clasificar cada fallo del proveedor. Un error **permanente** (por ejemplo, una dirección de correo
inválida o de un dominio reservado) SHALL agotar los intentos del aviso de inmediato, sin llamar de nuevo al proveedor. Un
error **transitorio** (límite de envíos, error del servidor del proveedor, falta de red o tiempo agotado) SHALL consumir un
intento y permitir el reintento. Un error de **configuración** (credenciales rechazadas, dominio remitente no verificado,
proveedor no configurado) SHALL interrumpir la ejecución, devolver a su estado anterior los avisos reservados en ella sin
consumir sus intentos y hacer que el proceso responda con error visible en el registro de la plataforma.

#### Scenario: Dirección inválida
- **WHEN** el proveedor rechaza un destinatario por dirección inválida
- **THEN** el aviso queda fallido con los 3 intentos agotados y aparece en la revisión de notificaciones fallidas

#### Scenario: Dirección de dominio reservado
- **WHEN** el destinatario es una dirección de un dominio reservado para pruebas (por ejemplo `@demo.invalid`)
- **THEN** el proceso no llama al proveedor y el aviso queda fallido con los intentos agotados y el motivo «destinatario no
  entregable»

#### Scenario: Límite de envíos del proveedor
- **WHEN** el proveedor responde que se superó el límite de envíos
- **THEN** el aviso queda fallido con un intento consumido y se reintenta en una ejecución posterior

#### Scenario: Clave del proveedor mal configurada
- **WHEN** el proveedor rechaza las credenciales
- **THEN** la ejecución se interrumpe, los avisos reservados recuperan sus intentos, la respuesta del proceso es de error y
  una ejecución posterior, ya corregida la configuración, los envía

### Requirement: El proveedor simulado nunca finge un envío en producción
El sistema SHALL elegir el proveedor de correo por configuración explícita. Sin clave del proveedor real ni modo explícito,
SHALL usar un proveedor simulado que no envía correos reales, de modo que ninguna prueba, vista previa ni entorno de
desarrollo envíe correo real por omisión. En el entorno de producción el proceso SHALL negarse a ejecutar con el proveedor
simulado, y los avisos inmediatos que encuentren esa configuración SHALL registrarse como fallidos por error de
configuración, nunca como enviados.

#### Scenario: Entorno de desarrollo sin configuración
- **WHEN** se ejecuta una reserva o el proceso programado sin clave del proveedor
- **THEN** no se envía ningún correo real y el resultado se registra como enviado por el proveedor simulado

#### Scenario: Producción mal configurada
- **WHEN** el proceso programado corre en producción con el proveedor simulado
- **THEN** responde con error de configuración y no marca ningún aviso como enviado

#### Scenario: Pruebas deterministas
- **WHEN** una prueba automática inyecta un proveedor simulado que falla de forma programada
- **THEN** puede verificar el reintento, el tope de intentos y la clasificación de errores sin enviar correo real ni usar
  la red

### Requirement: Resumen y registro sin datos personales
La respuesta del proceso y su registro técnico SHALL resumir lo hecho (avisos enviados, fallidos, omitidos, recuperados y
restantes) sin incluir correos, nombres ni documentos de pacientes. Cuando una ejecución llegue a su tope de avisos y queden
avisos vencidos sin procesar, el resumen SHALL indicarlo.

#### Scenario: Resumen de una ejecución
- **WHEN** el proceso termina
- **THEN** su respuesta indica cuántos avisos se enviaron, fallaron, se omitieron y quedaron pendientes, sin datos
  personales

#### Scenario: Más avisos que el tope
- **WHEN** hay más avisos vencidos que el tope por ejecución
- **THEN** el resumen informa cuántos quedaron pendientes y esos avisos se toman en la siguiente ejecución
