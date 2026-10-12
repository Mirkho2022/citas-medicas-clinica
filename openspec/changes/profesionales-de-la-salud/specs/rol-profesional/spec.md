# Spec Delta

> Nombres: sujetos a ADR-0030; si se rechaza, léase `medico`/`medicos`.

## Purpose

Generalizar el rol «médico» al rol «profesional» de la salud en la base de datos, la sesión y la aplicación sin cambiar a quién se
le concede ni se le niega el acceso, sin dejar sin acceso a ningún usuario existente durante el cambio y sin dejar residuos del
vocabulario anterior en el esquema.

## ADDED Requirements

### Requirement: El rol profesional reemplaza al rol médico en toda la superficie
El sistema SHALL usar el rol `profesional` en lugar de `medico` en la base de datos, en el claim de la sesión, en el perfil
sincronizado, en el área de la aplicación, en la invitación de personal y en las pruebas. Los roles `administrativo`, `enfermera` y
`paciente` SHALL conservar su significado. El área del profesional SHALL estar en `/profesional`.

#### Scenario: Un profesional invitado aterriza en su área
- **WHEN** un usuario con rol `profesional` y MFA activa inicia sesión
- **THEN** el sistema lo dirige a `/profesional` y muestra el panel del profesional

#### Scenario: Otro rol no entra al área del profesional (negativo)
- **WHEN** un usuario con rol `paciente`, `administrativo` o `enfermera` abre `/profesional`
- **THEN** el sistema lo redirige a su propia área y no muestra contenido del profesional

#### Scenario: Sin sesión no hay acceso (negativo)
- **WHEN** una persona sin sesión abre `/profesional`
- **THEN** el sistema la redirige a iniciar sesión y no expone contenido

#### Scenario: La dirección anterior sigue funcionando durante la transición
- **WHEN** una persona abre una dirección que empieza por `/medico`
- **THEN** el sistema la redirige a la dirección equivalente bajo `/profesional`, donde se aplican la sesión, el rol y el MFA

#### Scenario: El perfil sincronizado refleja el rol nuevo
- **WHEN** el webhook de Clerk sincroniza a un usuario cuyo rol es `profesional`
- **THEN** su perfil queda con rol `profesional` y los perfiles de profesionales existentes antes del cambio ya tienen ese rol

### Requirement: El acceso a historias clínicas por profesional a cargo se conserva idéntico
Un profesional SHALL poder leer la historia clínica, las atenciones, las addendas y los antecedentes de un paciente solo si lo tiene
a su cargo con una asignación vigente (fechas en `America/Lima`) y su registro de profesional está activo. La base de datos SHALL
imponerlo con RLS, no solo la aplicación. Ningún otro rol SHALL obtener esos datos. El cambio de nombres SHALL NOT conceder ni
retirar ningún acceso respecto del esquema anterior.

#### Scenario: El profesional a cargo ve la historia de su paciente
- **WHEN** un profesional con asignación vigente sobre un paciente consulta sus atenciones, historia, antecedentes y addendas
- **THEN** recibe esas filas

#### Scenario: Otro profesional no ve la historia (negativo)
- **WHEN** un profesional sin asignación sobre ese paciente, o con una asignación vencida, o cuyo registro está dado de baja,
  consulta esas tablas
- **THEN** no recibe ninguna fila y no puede insertar ni modificar registros de ese paciente

#### Scenario: El administrativo no ve contenido clínico (negativo)
- **WHEN** el administrativo consulta atenciones, addendas, antecedentes o historias clínicas
- **THEN** no recibe ninguna fila, y la auditoría que sí puede leer no contiene contenido clínico

#### Scenario: La enfermera no ve contenido clínico (negativo)
- **WHEN** una enfermera consulta atenciones, addendas, antecedentes o historias clínicas
- **THEN** no recibe ninguna fila

#### Scenario: El paciente no ve su propia historia (negativo)
- **WHEN** un paciente consulta atenciones, addendas, antecedentes o historias clínicas, incluidas las suyas
- **THEN** no recibe ninguna fila

#### Scenario: Sesión sin rol y roles de servicio (negativo)
- **WHEN** una sesión con un token válido pero sin rol, el rol `anonymous`, `cron_notificaciones` o `sync_identidad` consultan esas
  tablas
- **THEN** no reciben ninguna fila y, en los tres roles sin sesión de usuario, la base rechaza la consulta por falta de privilegios

#### Scenario: Un profesional solo registra atenciones propias
- **WHEN** un profesional a cargo registra una atención a su nombre sin firmar
- **THEN** la base la acepta
- **AND** si intenta registrarla a nombre de otro profesional, de un paciente que no tiene a cargo o ya firmada, la base la rechaza

### Requirement: La agenda, las asignaciones y los turnos conservan sus reglas con los nombres nuevos
Las citas, la disponibilidad, los bloqueos de agenda, las asignaciones paciente-profesional automáticas y manuales, los turnos de
enfermería y el registro de accesos SHALL conservar sus reglas y sus políticas, referidos ahora al profesional en lugar de al médico.

#### Scenario: Cada profesional ve solo su agenda (negativo)
- **WHEN** un profesional consulta las citas
- **THEN** recibe únicamente las suyas y no las de otro profesional
- **AND** un paciente solo recibe las suyas, y la enfermera no recibe ninguna

#### Scenario: La doble reserva sigue bloqueada por profesional
- **WHEN** se intenta registrar una segunda cita vigente que se cruza con otra del mismo profesional
- **THEN** la base la rechaza con `23P01`, que la aplicación traduce a «Registro de cita ya agendado»

#### Scenario: La ventana de cancelación de 1 hora sigue vigente
- **WHEN** cualquier rol intenta cancelar una cita con menos de 1 hora de anticipación sin que exista un bloqueo de agenda que la alcance
- **THEN** la base la rechaza con el mensaje «No es posible cancelar con menos de 1 hora de anticipación»

#### Scenario: Confirmar una cita sigue otorgando el acceso
- **WHEN** una cita pasa por primera vez a confirmada o atendida
- **THEN** se crea una asignación paciente-profesional con vigencia de 6 meses desde la cita, una sola vez por cita, con fechas de Lima

#### Scenario: Las asignaciones siguen siendo solo-agregar (negativo)
- **WHEN** cualquier rol de usuario intenta modificar o eliminar una asignación existente, o un profesional intenta crearla
- **THEN** la base lo rechaza

### Requirement: Las funciones centrales conservan sus privilegios y su forma
La función que decide si el profesional autenticado tiene a un paciente a su cargo y la que resuelve al profesional autenticado SHALL
ser ejecutables solo por `authenticated`, ejecutarse con los privilegios de su dueño con una ruta de búsqueda vacía, y no existir
con los nombres anteriores. Ninguna función con el nombre anterior SHALL quedar como puerta de acceso alterna.

#### Scenario: Privilegios de las funciones renombradas
- **WHEN** se inspeccionan `profesional_actual()` y `profesional_tiene_paciente()`
- **THEN** `authenticated` puede ejecutarlas, `anonymous` y `PUBLIC` no, y ambas son `SECURITY DEFINER` con `search_path` vacío

#### Scenario: Los nombres anteriores no existen (negativo)
- **WHEN** se busca `medico_actual()` o `medico_tiene_paciente()` en el esquema `public`
- **THEN** no existen

### Requirement: El valor heredado `medico` se tolera de forma transitoria y acotada
Mientras exista la tolerancia, la base de datos y la aplicación SHALL tratar un claim de rol exactamente igual a `medico` como
`profesional`, y cualquier otro valor no reconocido SHALL no conceder ningún acceso. La tolerancia SHALL retirarse cuando ya no haya
usuarios ni invitaciones con el valor heredado; desde entonces un claim `medico` SHALL NOT conceder ningún acceso.

#### Scenario: Un token anterior sigue funcionando
- **WHEN** un usuario con una sesión emitida antes del cambio, con claim `medico`, consulta lo que su rol permite
- **THEN** obtiene exactamente lo que obtiene un profesional con claim `profesional`, y la aplicación lo dirige a `/profesional`

#### Scenario: Valores no reconocidos no conceden acceso (negativo)
- **WHEN** un token trae el claim `Medico`, `MEDICO`, `medicos`, una cadena vacía u otro valor no definido
- **THEN** la base lo trata como sin rol: no recibe ninguna fila de datos protegidos y la aplicación no lo dirige a ningún área

#### Scenario: La tolerancia no se extiende a otros roles (negativo)
- **WHEN** un token trae el claim `administrativo`, `enfermera` o `paciente`
- **THEN** su rol se lee tal cual, sin transformación alguna

#### Scenario: La escritura auditada con un token anterior funciona
- **WHEN** un profesional con claim `medico` realiza una escritura auditada
- **THEN** la escritura se confirma y la auditoría registra su rol como `profesional`

#### Scenario: Después de retirar la tolerancia, `medico` no concede nada (negativo)
- **WHEN**, tras aplicar la migración que retira la tolerancia, un token trae el claim `medico`
- **THEN** la base lo trata como sin rol y la aplicación no lo dirige a ningún área

### Requirement: La migración de los usuarios existentes no deja a nadie sin acceso
El sistema SHALL ofrecer un procedimiento que actualice el rol `medico` de los usuarios existentes en Clerk a `profesional`, que sea
idempotente, que permita ver su efecto sin aplicarlo, que no imprima datos personales y que informe qué queda pendiente. El orden de
despliegue SHALL ser tal que ningún usuario, con sesión abierta o sin ella, pierda acceso en ningún momento.

#### Scenario: Simulación sin escribir
- **WHEN** se ejecuta el procedimiento en modo de simulación
- **THEN** informa cuántos usuarios tienen el rol heredado y cuántos ya están migrados, y no modifica ningún usuario

#### Scenario: Ejecución idempotente
- **WHEN** se ejecuta con confirmación una vez y otra vez más
- **THEN** la primera actualiza a los usuarios con el rol heredado y la segunda no encuentra ninguno ni cambia nada

#### Scenario: Sin datos personales en la salida
- **WHEN** el procedimiento imprime su resultado
- **THEN** contiene solo recuentos e identificadores de Clerk, ningún correo ni nombre

#### Scenario: Verificación antes de retirar la tolerancia
- **WHEN** queda al menos un usuario o una invitación pendiente con el rol heredado
- **THEN** la verificación termina con error e identifica cuántos son, y la tolerancia no se retira

#### Scenario: Una invitación anterior aceptada después del cambio
- **WHEN** una persona acepta una invitación emitida antes del cambio con rol `medico`
- **THEN** su perfil queda con rol `profesional` y su metadato en Clerk se corrige a `profesional`

#### Scenario: El procedimiento no empieza hasta que el despliegue nuevo esté listo
- **WHEN** el despliegue de la aplicación con el rol nuevo todavía no está disponible en producción
- **THEN** el procedimiento de migración de usuarios no se ejecuta, porque la aplicación anterior no reconoce el rol nuevo

### Requirement: El cambio de nombres es atómico y no deja residuos
La base de datos SHALL aplicar el renombre completo (tipo, tablas, columnas, restricciones, índices, funciones, políticas y cuerpos de
función) como una sola unidad: o se aplica entero o no se aplica. Después de aplicarlo, el esquema `public` SHALL no contener
objetos, expresiones de política ni cuerpos de función con el vocabulario anterior, salvo la tolerancia transitoria del claim.

#### Scenario: Una sesión concurrente nunca ve un estado intermedio
- **WHEN** una sesión autenticada consulta tablas clínicas mientras se aplica el renombre
- **THEN** obtiene el esquema anterior completo o espera y obtiene el nuevo completo, nunca un error de objeto inexistente ni filas que su rol no debe ver

#### Scenario: Un residuo revierte todo el cambio (negativo)
- **WHEN** al terminar el renombre queda una política, función u objeto con el vocabulario anterior
- **THEN** el cambio se revierte por completo y el esquema queda como estaba

#### Scenario: Ningún objeto conserva el nombre anterior
- **WHEN** se buscan tablas, columnas, funciones, políticas, restricciones, índices, disparadores y etiquetas de tipo con `medico` en el esquema `public`
- **THEN** no hay ninguno, con la sola excepción de la función que lee el rol y mapea el valor heredado mientras la tolerancia exista

#### Scenario: La semántica de las políticas no cambió
- **WHEN** se compara la definición normalizada de las políticas antes y después del renombre
- **THEN** la diferencia es vacía, salvo la lista de cambios intencionales documentada

#### Scenario: Las claves foráneas y los privilegios siguen intactos
- **WHEN** se comparan las claves foráneas y los privilegios de tabla y de columna antes y después
- **THEN** son los mismos, y `cron_notificaciones` y `sync_identidad` no ganan ni pierden ningún privilegio
