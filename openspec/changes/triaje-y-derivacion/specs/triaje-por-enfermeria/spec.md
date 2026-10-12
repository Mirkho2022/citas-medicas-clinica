# Spec Delta

## Purpose

Permitir que la enfermera registre los signos vitales del paciente (triaje) antes de la consulta, con valores validados y un
IMC calculado por la base de datos, sin que por ello pueda leer historias clínicas ni datos clínicos, y que el profesional
vea ese triaje solo de los pacientes que tiene a su cargo.

## ADDED Requirements

### Requirement: La enfermera registra el triaje de una visita
El sistema SHALL permitir a una enfermera activa registrar un triaje para una visita de hoy que esté en estado llegada, con
triaje o derivada, con presión arterial (sistólica y diastólica), frecuencia cardíaca, frecuencia respiratoria, temperatura,
saturación de oxígeno y, opcionalmente como par, peso y talla. El sistema SHALL calcular el IMC en la base de datos a partir
del peso y la talla, sin aceptar un IMC enviado por el cliente. Al registrar el primer triaje de una visita, esta SHALL pasar al
estado «con triaje». El autor y la hora del registro SHALL ser los del servidor y la sesión.

#### Scenario: Primer triaje de una visita
- **WHEN** una enfermera registra valores válidos para una visita en estado «llegada»
- **THEN** el triaje queda guardado con su autor y hora, la visita pasa a «con triaje» y el IMC aparece calculado

#### Scenario: IMC calculado por la base
- **WHEN** se registra un peso de 70 kg y una talla de 170 cm
- **THEN** el IMC guardado es 24,2 y ningún valor de IMC enviado por el cliente se acepta

#### Scenario: Peso y talla ausentes
- **WHEN** la enfermera registra las cinco constantes vitales sin peso ni talla
- **THEN** el triaje se guarda y el IMC queda vacío

#### Scenario: Solo uno de peso y talla (negativo)
- **WHEN** se envía el peso sin la talla, o la talla sin el peso
- **THEN** se rechaza con un mensaje por campo y no se guarda nada

#### Scenario: Visita ya tomada o cerrada (negativo)
- **WHEN** se intenta registrar un triaje para una visita en atención, atendida, abandonada o anulada
- **THEN** se rechaza y no se guarda el triaje

#### Scenario: Visita de otro día (negativo)
- **WHEN** se intenta registrar un triaje para una visita de un día anterior que sigue en curso
- **THEN** se rechaza

#### Scenario: Enfermera inactiva (negativo)
- **WHEN** una enfermera cuyo perfil o registro está desactivado intenta registrar un triaje
- **THEN** se rechaza por falta de permiso

### Requirement: Solo la enfermera registra triajes
Registrar un triaje SHALL estar permitido únicamente a una enfermera. El administrativo, el profesional, el paciente, una sesión
sin rol, `anonymous`, el rol del cron y el rol de sincronización SHALL NOT poder registrar triajes, y ninguno SHALL poder
insertar, modificar ni borrar triajes escribiendo directamente en la base de datos.

#### Scenario: Recepción no registra triajes (negativo)
- **WHEN** el administrativo intenta registrar un triaje
- **THEN** se rechaza por falta de permiso y no se guarda nada

#### Scenario: Profesional, paciente y roles de servicio (negativo)
- **WHEN** un profesional, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intenta
  registrar un triaje
- **THEN** se rechaza y no se guarda nada

#### Scenario: Escritura directa (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar un triaje con una sentencia directa
- **THEN** se rechaza por falta de privilegios

### Requirement: Los valores imposibles se rechazan en el servidor y en la base de datos
El sistema SHALL rechazar un triaje cuyos valores estén fuera de lo físicamente posible, tanto al validar la solicitud en el
servidor como en la base de datos. Los rangos aceptados (propuesta por validar con el personal clínico) son: presión sistólica
50–260 mmHg; presión diastólica 30–160 mmHg y menor que la sistólica; frecuencia cardíaca 20–250 lpm; frecuencia respiratoria
4–70 rpm; temperatura 30,0–43,0 °C; saturación de oxígeno 50–100 %; peso 0,5–400 kg; talla 30–250 cm; IMC calculado 5–100. El
mensaje SHALL indicar que el triaje tiene valores fuera de lo posible, y el formulario SHALL conservar lo escrito. El sistema
SHALL NOT marcar, avisar ni clasificar valores anormales dentro de esos rangos.

#### Scenario: Valor en el límite del rango
- **WHEN** se registra una saturación de oxígeno de 50 % o una temperatura de 43,0 °C
- **THEN** el triaje se acepta, y no se muestra ninguna alerta

#### Scenario: Valor fuera del rango (negativo)
- **WHEN** se registra una frecuencia cardíaca de 300, una temperatura de 3,7 o una saturación de 101
- **THEN** se rechaza en el servidor y, si la solicitud llegara a la base de datos, esta también lo rechaza; no se guarda nada

#### Scenario: Presión diastólica mayor que la sistólica (negativo)
- **WHEN** se registra una presión de 80/120
- **THEN** se rechaza

#### Scenario: Peso y talla incompatibles (negativo)
- **WHEN** se registra un peso de 90 kg y una talla de 70 cm
- **THEN** se rechaza porque el IMC resultante es imposible

#### Scenario: Campos vacíos o no numéricos (negativo)
- **WHEN** falta una constante vital obligatoria o se envía un valor no numérico
- **THEN** se rechaza con un mensaje por campo y el formulario conserva lo escrito

#### Scenario: Clave ajena (negativo)
- **WHEN** la solicitud incluye un campo que no es una medición (por ejemplo, el autor o la hora)
- **THEN** se rechaza

### Requirement: Varios triajes por visita, conservando los anteriores
El sistema SHALL permitir registrar más de un triaje por visita. Cada triaje SHALL conservarse tal como se registró: no SHALL
poder editarse ni borrarse por ningún rol, ni siquiera por el dueño de la base. Corregir un valor SHALL consistir en registrar
otro triaje, y el último registrado SHALL ser el vigente.

#### Scenario: Repetir el triaje
- **WHEN** la enfermera registra un segundo triaje para la misma visita
- **THEN** ambos quedan guardados y el último es el vigente

#### Scenario: Editar o borrar un triaje (negativo)
- **WHEN** cualquier rol, incluido el dueño de la base, intenta modificar o borrar un triaje existente
- **THEN** la operación se rechaza

#### Scenario: Triaje de la visita de otro paciente (negativo)
- **WHEN** se intenta guardar un triaje cuyo paciente no es el de la visita
- **THEN** la base de datos lo rechaza

### Requirement: La enfermera ve solo el mínimo de identidad de las visitas activas de hoy
El sistema SHALL mostrar a la enfermera, para triar, únicamente las visitas de hoy (día de `America/Lima`) en estado llegada, con
triaje o derivada, con exactamente estos datos: nombres, apellidos, tipo y número de documento, fecha de nacimiento, estado,
hora de llegada, si tiene cita (sí o no), cuántos triajes tiene y, si está derivada, la especialidad. Esto SHALL imponerse en la
base de datos y no solo en la pantalla. La enfermera SHALL NOT recibir sexo, correo, teléfono, dirección ni ninguna otra columna
de la ficha del paciente, ni datos de visitas de otros días, ni el motivo de la cita.

#### Scenario: Lista de pacientes por triar
- **WHEN** la enfermera abre su lista
- **THEN** ve las visitas de hoy sin tomar, con esos datos y ordenadas por hora de llegada

#### Scenario: Visita ya tomada
- **WHEN** un profesional toma a un paciente
- **THEN** la visita desaparece de la lista de la enfermera y ella deja de poder leer sus triajes

#### Scenario: Paciente sin visita activa (negativo)
- **WHEN** la enfermera busca a un paciente que no tiene una visita activa hoy
- **THEN** no obtiene ningún dato de él

#### Scenario: Lectura directa de la ficha del paciente (negativo)
- **WHEN** la enfermera consulta directamente en la base de datos los pacientes, las citas, las historias clínicas, las
  atenciones, las addendas, los antecedentes, las asignaciones paciente-profesional, los triajes, las derivaciones o las visitas
- **THEN** no recibe ninguna fila (o se le deniega el privilegio) en todas ellas

#### Scenario: Columnas que no se pueden ampliar sin revisión
- **WHEN** alguien añade una columna a la lectura acotada de la enfermera
- **THEN** la verificación automática de la lista exacta de columnas falla hasta que el cambio se revise

#### Scenario: Otros roles no usan esa lectura (negativo)
- **WHEN** un administrativo, un profesional, un paciente, una sesión sin rol o `anonymous` invoca la lectura acotada de la enfermera
- **THEN** se rechaza por falta de permiso

### Requirement: Recepción crea visitas pero no lee triajes
El administrativo SHALL NOT poder leer triajes, directamente ni por ninguna pantalla, es decir, ninguno de los valores de las
mediciones, aunque haya creado la visita. Sí SHALL ver el estado de la visita (por ejemplo «con triaje») y su hora de llegada.

#### Scenario: Administrativo consulta triajes (negativo)
- **WHEN** el administrativo consulta triajes directamente en la base de datos
- **THEN** no recibe ninguna fila

#### Scenario: Recepción ve el estado
- **WHEN** el administrativo abre la lista de llegadas
- **THEN** ve el estado de cada visita (por ejemplo «con triaje») sin ningún valor de signos vitales

### Requirement: El profesional lee el triaje de los pacientes que tiene a cargo
Un profesional activo SHALL poder leer los triajes de los pacientes que tiene a cargo, es decir, con asignación vigente a su
nombre, incluidos los de visitas anteriores. Un profesional sin asignación vigente, con la asignación vencida o con perfil
desactivado SHALL NOT leer ningún triaje. La pantalla de la historia clínica que lo muestra pertenece al módulo de historias
clínicas; este requisito fija quién puede leerlo.

#### Scenario: Profesional a cargo lee el triaje
- **WHEN** un profesional con asignación vigente consulta los triajes de su paciente
- **THEN** recibe todos los triajes de ese paciente, con el más reciente primero

#### Scenario: Otro profesional (negativo)
- **WHEN** un profesional que no tiene al paciente a cargo consulta sus triajes
- **THEN** no recibe ninguna fila

#### Scenario: Profesional de la especialidad destino que aún no tomó (negativo)
- **WHEN** un paciente fue derivado a una especialidad y un profesional de ella, que aún no lo tomó, consulta sus triajes
- **THEN** no recibe ninguna fila

#### Scenario: Asignación vencida o perfil desactivado (negativo)
- **WHEN** la asignación del profesional venció, o su perfil fue desactivado
- **THEN** no recibe ningún triaje

#### Scenario: Paciente, sin rol y roles de servicio (negativo)
- **WHEN** un paciente (incluso sobre su propio triaje), una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización
  consulta triajes
- **THEN** no recibe ninguna fila o se le deniega el privilegio

### Requirement: Datos clínicos reales prohibidos mientras la decisión legal siga abierta
El sistema SHALL aplicar a los triajes y a las derivaciones la misma guarda de datos clínicos reales del módulo de historias
clínicas: en modo demostración solo se admiten pacientes de demostración, y toda operación clínica de este módulo SHALL fallar si
el modo de la aplicación no coincide con el de la base de datos.

#### Scenario: Paciente real en modo demostración (negativo)
- **WHEN** se intenta registrar un triaje de un paciente que no es de demostración mientras la base está en modo demostración
- **THEN** se rechaza con el mensaje del modo demostración y no se guarda nada

#### Scenario: Modo inconsistente (negativo)
- **WHEN** la aplicación opera con un modo distinto del de la base de datos
- **THEN** las operaciones de triaje y derivación fallan cerradas con el aviso de configuración inconsistente

### Requirement: Rastro del triaje sin contenido
Todo triaje registrado SHALL quedar en la auditoría con autor, hora y registro, pero sin copiar las mediciones, de modo que el
personal administrativo, que lee la auditoría, no pueda leer signos vitales por esa vía.

#### Scenario: Auditoría de un triaje
- **WHEN** una enfermera registra un triaje
- **THEN** la auditoría registra quién, cuándo y el identificador del triaje, y no contiene presión, frecuencia, temperatura,
  saturación, peso ni talla
