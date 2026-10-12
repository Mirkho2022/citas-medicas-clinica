# Design

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales` y `profesional_tiene_paciente()`; si la ADR se rechaza, léase `medico`, `medicos` y
> `medico_tiene_paciente()`.

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (cuatro capacidades). Estado de partida, verificado
en el repositorio y en los documentos del 2026-10-11 (no supuesto):

- **Base de datos (H2, en producción):** `pacientes` (filiación; el administrativo la lee y la escribe), `historias_clinicas`
  (una por paciente, creada por disparador; **el administrativo no la lee**, ni siquiera `numero`), `perfiles` y
  `accesos_historia` (`id` bigserial, `actor_id`, `paciente_id`, `atencion_id`, `creado_en`; solo-agregar para todos, incluido
  el dueño; `INSERT` solo del médico a cargo con `actor_id` = su perfil; `SELECT` solo del administrativo). `auditoria` la lee
  solo el administrativo y `registrar_auditoria()` no copia contenido clínico. La función `rol_actual()` y `perfil_actual()`
  leen el JWT de Clerk (ADR-0023). Hoy no existe nada que entregue una copia.
- **Lo que traen los changes en paralelo (aún no aplicados):** `historias-clinicas` (H6): lectura atómica con registro de acceso
  (D2), guarda de modo `demostracion`/`real` con `HC002` y `HC004` (D1), huella `v1:` de las atenciones firmadas (D5),
  `adjuntos_historia` (D7), `tipo_acceso` en `accesos_historia` (tarea 4.1) y la regla «todo SQL clínico vive en
  `lib/historias/`». H2c (profesionales), H6b (triaje y derivaciones), H6c (recetas), H6e a H6h (especialidades, con la
  información de Psicología aislada por [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)) y
  H3, ítem 5 (columnas de filiación en `pacientes`).
- **Restricciones que fijan el diseño (PRD del 2026-10-11 y ADR):**
  1. La copia al paciente **incluye Psicología** (decisión del usuario; PRD y ADR-0031).
  2. Un profesional que no es psicólogo no puede ver los resultados ni las notas de Psicología «ni abriéndolos por la dirección
     directa ni de ninguna otra forma» (PRD, caso borde).
  3. El administrativo y la enfermera no ven contenido clínico (CLAUDE.md, roles). El paciente no consulta su historia por el
     portal: «la recibe en copia mediante solicitud» (PRD, No alcance).
  4. El acceso de un profesional nace de una asignación vigente que vence a los 6 meses
     ([ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md)): un paciente antiguo puede no tener hoy
     ningún profesional con acceso.
  5. La historia es **híbrida** ([ADR-0013](../../../docs/adrs/0013-definicion-de-historia-clinica-digitalizada.md)): lo
     estructurado está en el sistema y el resto del expediente es papel con escaneo de respaldo.
- **Norma (nivel A de `docs/investigacion-marco-legal-y-saniape.md`):** NTS 139, numeral 4.2.14 y literal h): copia
  **autenticada** al paciente en un máximo de **5 días**. La investigación no dice si son hábiles o calendario y no define qué
  autentica la copia. El costo de reproducción a cargo del solicitante figura en el encargo de este change y no en la tabla
  verificada de la investigación: por validar con el asesor.
  <!-- REVISAR: «autoridad judicial o Ministerio Público» como solicitante lo pide el encargo de este change; el PRD solo habla de paciente o representante legal, y la investigación solo verificó la entrega al paciente. Confirmar con el asesor quién puede solicitar la copia y con qué documento. -->
- **Plataforma:** Vercel Hobby con un solo cron diario ([ADR-0028](../../../docs/adrs/0028-notificaciones-cron-unico-plan-hobby.md));
  Neon por HTTP: `transaccionAutenticada()` es una transacción en **lote** (no interactiva) con el token de la sesión;
  CLAUDE.md reserva la credencial de Postgres con más alcance (`cron_notificaciones`) a cron y CI, «nunca al código que sirve
  tráfico de usuario». El PRD no confirmó que haya impresora en recepción (supuesto abierto).

## Goals / Non-Goals

**Goals:**
- Entregar la copia **completa**, con Psicología, sin que ninguna pantalla de la aplicación muestre contenido clínico a un rol
  que no puede verlo, y sin depender de que exista un profesional con acceso vigente.
- Que cada paso (solicitud, verificación, generación, entrega, rechazo) quede registrado, atribuido y sea inalterable, y que
  ninguna generación ocurra sin su registro de acceso.
- Que el plazo sea visible para recepción y que cumplirlo o no quede registrado, sin analítica ni cron nuevo.
- Que añadir una tabla clínica no deje la copia incompleta sin que una prueba lo note.
- Que el mecanismo que autentica la copia sea reemplazable si el asesor exige firma digital (P-5).

**Non-Goals:**
- Resolver P-1, P-5 o el marco legal de la copia; declarar que el documento cumple «copia autenticada».
- Portal, descarga, entrega a distancia, exportación masiva, cobro o registro del costo, copia de documentos solo en papel,
  aviso al paciente (ver «Preguntas abiertas»).
- Modificar las políticas de las tablas clínicas, `profesional_tiene_paciente()` o la asignación de pacientes.

## Decisions

### D1. Una solicitud, un ciclo cerrado, escrito solo por funciones

Tabla `solicitudes_copia_historia` (dueño: este change), con RLS activada. Una fila por solicitud:

| Grupo | Columnas |
|---|---|
| Identidad | `id`, `numero` (identity, correlativo visible; es también el **folio** de la copia), `paciente_id` → `pacientes` (`on delete restrict`) |
| Solicitante | `solicitante_tipo` (`paciente`, `representante_legal`, `autoridad`), `solicitante_nombres`, `solicitante_apellidos`, `solicitante_documento_tipo` (`DNI`, `CE`, `PASAPORTE`) y `solicitante_documento_numero`, `solicitante_vinculo` (solo si no es el paciente) |
| Alta (la fija el servidor) | `registrada_por` → `perfiles`, `solicitada_en` (`timestamptz`), `vence_en` (D5) |
| Verificación | `estado`, `verificada_por`, `verificada_en`, `identidad_metodo`, `identidad_nota`, `acreditacion_tipo`, `acreditacion_referencia` |
| Rechazo | `rechazada_por`, `rechazada_en`, `motivo_rechazo`, `detalle_rechazo` |
| Emisión | `generaciones` (0 a 3), `huella_contenido`, `secciones_incluidas` (`text[]`), `conteos` (`jsonb`), `incluye_psicologia`, `contenido_hasta` (las cinco, escritas por la generación; D3), `emitida_por`, `emitida_en`, `motivo_demora` |

- **Estados almacenados:** `solicitada` → `verificada` → `emitida`, y `rechazada` desde `solicitada` o `verificada`. `emitida` y
  `rechazada` son definitivos. **`vencida` no se almacena:** es una condición derivada (`estado in ('solicitada','verificada')`
  y `now() > vence_en`). *Por qué:* un estado almacenado exigiría un proceso que lo cambie a medianoche, y el plan Hobby tiene
  un solo cron ocupado por las notificaciones (ADR-0028); además una solicitud vencida **sigue abierta y debe atenderse**, no
  se cierra sola. El encargo de este change listaba `vencida` entre los estados: se resuelve como estado *visible*, no
  almacenado. *Alternativa descartada:* estado almacenado con un segundo cron o un job en el cron actual.
- **Sin estado `entregada` aparte:** `emitida` significa «generada **y entregada** (confirmada) al solicitante en persona»
  (D3, D9). Generar es una lectura auditada que no cambia el estado; confirmar la entrega lo cierra.
- **Escritura.** `authenticated` recibe `SELECT` y `INSERT` **por columnas** (solo las del solicitante, la acreditación y
  `paciente_id`). `registrada_por`, `solicitada_en`, `vence_en` y `estado` los fija un disparador `BEFORE INSERT` cuando
  `current_user = 'authenticated'` (mismo criterio que `bloquear_cambio_de_rol()` y D5 de H6): el cliente no puede enviarlos
  ni suplantar a otro perfil; el dueño (siembra de demostración) puede fijar fechas antiguas. **No hay `UPDATE` ni `DELETE`
  para ningún rol de usuario**: las transiciones las hacen las funciones de D3 y D4.
- **Protección de la fila, incluido el dueño** (patrón de `accesos_historia_solo_agregar`): un disparador rechaza todo
  `DELETE` y todo `UPDATE` que cambie el solicitante, el paciente, las fechas de alta, `vence_en` o campos ya escritos de una
  etapa anterior, o que no siga la máquina de estados. Un defecto de una función no puede reescribir la historia de la solicitud.
- **Una solicitud abierta por paciente y solicitante:** índice único parcial sobre `(paciente_id, solicitante_documento_tipo,
  solicitante_documento_numero)` donde `estado in ('solicitada','verificada')`. Es a prueba de concurrencia (misma idea que la
  doble reserva): el segundo registro falla con `23505`, y la aplicación responde con el número de la abierta. Otro
  solicitante (p. ej. el otro progenitor) sí puede tener la suya; tras `emitida` o `rechazada` se admite una nueva.
- **Auditoría de escritura:** se engancha `registrar_auditoria()` a la tabla (quién y cuándo de cada transición). No contiene
  contenido clínico; sí datos del solicitante, que solo lee el administrativo.
- **Guarda de datos reales:** el disparador `exigir_paciente_admisible()` de H6 (D1) también protege el `INSERT`: en modo
  `demostracion` solo se registran solicitudes de pacientes `@demo.invalid`, y al revés en modo `real`.
- **RLS:** `SELECT` e `INSERT` únicamente para `rol_actual() = 'administrativo'`. Ninguna política para profesional, enfermera,
  paciente ni `anonymous`; sin `GRANT` a `cron_notificaciones` ni `sync_identidad`. El paciente **no** ve el estado de su
  propia solicitud (no hay portal para esto).

### D2. Quién genera la copia y cómo llega al solicitante (el problema central)

**Las restricciones se combinan así.** Por (1) la copia lleva Psicología; por (2) un no psicólogo no puede verla «de ninguna
otra forma»; por (3) recepción y enfermera no ven contenido. Luego **ningún miembro del personal, salvo un psicólogo que tenga
al paciente a cargo, puede leer la copia completa**. Ni siquiera un psicólogo a cargo es una vía general: por (4) el paciente
puede no tener a nadie con acceso vigente. Cualquier alternativa en la que una persona lea el documento para generarlo,
revisarlo o autenticarlo contradice una decisión ya tomada, salvo que el usuario cree una excepción expresa.

**Alternativas evaluadas**

| | A. Un profesional a cargo la genera | **B. Función acotada + documento cerrado que recepción solo imprime y entrega** (recomendada) | C1. Perfil o rol dedicado con lectura total («responsable de historias») | C2. Rol de Postgres dedicado, como `cron_notificaciones` |
|---|---|---|---|---|
| Quién puede leer el contenido | El profesional. Si no es psicólogo, no puede ver Psicología: la copia saldría incompleta o se rompería la regla | Nadie por pantalla: el servidor arma el documento en memoria | La persona titular del perfil, con todo, Psicología incluida | El proceso del servidor |
| Psicología en la copia | Solo si lo genera un psicólogo a cargo | Sí | Sí, pero un tercero lee salud mental: excepción nueva al PRD y a ADR-0031 | Sí |
| Cumplir 5 días | Depende de que haya un profesional con asignación vigente (6 meses, baja, ausencia) y con tiempo; el atajo sería una asignación manual, que concede acceso clínico para un trámite | No depende de ninguna asignación | Depende de una sola persona | No depende |
| Auditoría | Acceso normal del profesional | Un registro `copia` por generación, en la misma transacción, atribuido al usuario real | Igual | La sesión del usuario no es quien lee: atribución más débil |
| «Copia autenticada» | El profesional conoce lo que autentica | Sello del sistema + responsable de la clínica (D7); su suficiencia la decide el asesor | Firma de esa persona | Sello del sistema |
| Qué cuesta o qué rompe | Carga clínica en un plazo de 5 días; riesgo para la meta de 100 % | Una función `SECURITY DEFINER` acotada que merece revisión explícita; un límite honesto de la garantía (abajo) | Reabre la tabla de roles de CLAUDE.md («no reabrir sin pedido del cliente») y crea la cuenta más sensible del sistema | Rompe la regla de CLAUDE.md: la credencial amplia no se usa en tráfico de usuario |
| Veredicto | Descartada | **Recomendada** | Descartada salvo decisión expresa del usuario | Descartada |

**Recomendación: B.** Es la única que satisface a la vez las decisiones (1), (2), (3) y (4). Funciona así:

1. Recepción registra la solicitud y verifica la identidad (D4). Nadie ve contenido.
2. Recepción pide generar la copia. Una función `SECURITY DEFINER` (D3) comprueba el rol y el estado, deja el registro de
   acceso y entrega el contenido **solo al servidor**, que lo convierte en un PDF. El PDF es el «documento cerrado».
3. Recepción lo imprime frente al solicitante, lo introduce en un sobre que se cierra y se sella, y confirma la entrega.
   Las pantallas de la aplicación muestran únicamente metadatos: folio, paciente, solicitante, número de páginas, huella.

**Alcance real de la garantía (declarado, no escondido).** B garantiza que **ninguna pantalla ni consulta de la aplicación**
entrega contenido clínico al personal que no puede verlo, que cada generación queda atribuida y auditada, y que la ventana es
mínima (D3). **No** garantiza que una persona que tiene el PDF o el papel en la mano no pueda leerlo: el archivo pasa por el
navegador y la impresora de recepción. Ninguna técnica razonable lo impide mientras el documento deba imprimirse en
recepción. Mitigaciones de la propuesta: el documento se entrega con `Cache-Control: private, no-store` y sin guardarse en
Blob; se genera y se imprime con el solicitante presente (no se prepara por adelantado); tope de 3 generaciones por solicitud;
toda generación aparece en la revisión de accesos del administrativo, con la marca «generada sin confirmar la entrega»; y se
señala cuando quien verificó es quien confirmó.

**Decisión que necesita el usuario (antes de aplicar).**
(i) ¿Acepta que el documento impreso transite por el navegador y la impresora de recepción, con las mitigaciones de arriba?
Si la respuesta es no, la única forma de no pasar por recepción es entregar al dispositivo del solicitante, lo que exige una
identidad ligada a una cuenta (portal) y contradice «no incluye que el paciente consulte su historia desde el portal»: habría
que enmendar el PRD.
(ii) Endurecimientos opcionales, ninguno incluido salvo el tope y la marca: **doble control** (que verificar y confirmar la entrega
los hagan personas distintas, forzado por la base con un `CHECK` o un disparador `HC045`, que impide operar a una clínica con
un solo administrativo), **reverificación de la sesión** al generar (a verificar con Clerk y el plan, P-10) y **aviso al
paciente** por correo, sin datos clínicos, cuando se emite su copia (sería una notificación nueva fuera del alcance actual).
<!-- REVISAR: el doble control, la reverificación y el aviso al paciente son propuestas del agente, no decisiones del usuario. -->

*Alternativa descartada, dentro de B:* guardar el PDF generado en Blob para que lo recoja otra persona. Deja un expediente
completo, cifrado o no, esperando en un almacén, y agrega retención (P-1) y otra superficie que blindar.

### D3. Generar y confirmar son dos pasos; generar es una lectura auditada

- **`compilar_copia_historia(solicitud, modo)`** (`SECURITY DEFINER`, `search_path` vacío, `EXECUTE` solo a `authenticated`,
  revocado a `PUBLIC`). Dentro de una sola transacción: (1) `exigir_modo_clinico(modo)` (H6 D1, `HC004`); (2) exige
  `rol_actual() = 'administrativo'` (`42501` si no); (3) bloquea la fila de la solicitud (`for update`) y exige
  `estado = 'verificada'` (`HC040`) y `generaciones < 3` (`HC044`); (4) comprueba que el paciente es admisible en el modo
  vigente (`HC002`); (5) **inserta el registro de acceso** (D8) y aumenta `generaciones`; (6) compila el contenido (D6) con un
  `corte` = `now()` y calcula la huella; (7) devuelve un `jsonb` con el contenido, la huella, las secciones y los conteos. Si
  cualquier paso falla se revierte todo: **no se entrega contenido sin su registro** (misma regla que D2 de H6).
  Los adjuntos viajan como claves de Blob, no como bytes.
- **Dónde termina el contenido:** en memoria del Route Handler que genera el PDF (D12). No se escribe en ninguna tabla, en ningún
  registro del servidor ni en Blob. Esta función es la **única** del sistema por la que el rol administrativo obtiene contenido
  clínico; por eso se revisa con el rigor de una política RLS.
- **Qué queda en la solicitud al generar:** en cada generación, y mientras la solicitud siga `verificada`, la función escribe
  en ella `huella_contenido`, `secciones_incluidas`, `conteos`, `incluye_psicologia` y `contenido_hasta`. **La última
  generación prevalece**; el historial de generaciones (quién, cuándo, qué huella) queda en `accesos_historia` (D8). Esas
  columnas se congelan al pasar a `emitida`.
- **`confirmar_entrega_copia(solicitud, huella, documento_cotejado, motivo_demora)`** (mismo régimen): exige `verificada`,
  `generaciones > 0` y que `huella` sea la de la **última generación** guardada en la solicitud (`HC043` si no hay generación o
  la huella no coincide), y `documento_cotejado = true` (el solicitante exhibió su documento original y coincide con el
  verificado). Pasa a `emitida` y fija `emitida_por` y `emitida_en`; el contenido declarado de la copia (huella, secciones,
  conteos, corte) es el que la propia función de generación escribió, **no lo que diga el cliente**. Si `emitida_en > vence_en`
  exige `motivo_demora` con contenido (`CHECK`).
- **Por qué dos pasos y no uno:** el PDF se arma *después* de la transacción (Neon por HTTP no mantiene una transacción abierta
  mientras se renderiza). Si generar marcara `emitida` y el PDF fallara, la solicitud diría «entregada» sin haberlo sido. Así,
  una generación fallida o abandonada deja el estado en `verificada` y se puede reintentar (hasta 3) sin perder el rastro.
- **Por qué con el solicitante presente:** el documento no se prepara por adelantado. Una copia impresa y olvidada en el
  mostrador sería la peor filtración posible. Consecuencia: el solicitante debe estar en recepción cuando se genera; el plazo
  de 5 días se cumple porque la clínica **puede** generarla en el acto (D5).
- *Alternativas descartadas:* (a) una sola función que genere y cierre: falla en el caso del PDF; (b) un rol de Postgres con
  `GRANT` de lectura amplio llamado desde un Route Handler (C2): rompe la regla de credenciales de CLAUDE.md y pierde la
  atribución al usuario; (c) tabla de «copias generadas» aparte: ver D8.

### D4. Identidad del solicitante y acreditación de la representación (propuesta)

<!-- REVISAR: todo este cuadro es una propuesta del agente. La NTS 139 pide la entrega «al paciente»; el PRD añade al representante legal. Qué documentos acreditan la representación, si basta una carta poder simple o legalizada y cómo se trata a una autoridad, lo decide el asesor legal. -->

| Solicitante | Qué se verifica (en persona, documento original vigente) | Qué se acredita | Se registra |
|---|---|---|---|
| `paciente` (mayor de 18 años) | Su DNI, CE o pasaporte coincide con el documento registrado del paciente y con su foto | Nada más | Método, documento, verificador, hora |
| `paciente` sin documento registrado (número provisional, NTS 139 4.2.23) | Un documento oficial cuyos nombres, apellidos y fecha de nacimiento coinciden con la filiación | Nada más | Igual, más `identidad_nota` (qué se cotejó) |
| `representante_legal` | Su propio documento | Su vínculo (`padre_o_madre`, `tutor`, `curador`, `apoderado`) con: partida de nacimiento del menor, resolución judicial, poder notarial o carta poder con firma legalizada | Tipo y referencia del documento de acreditación (número, fecha, entidad) |
| `autoridad` | Documento de quien recibe | Oficio o resolución, con número y entidad | Igual |

- **Menor de edad:** una solicitud `paciente` de alguien con menos de 18 años (a la fecha de solicitud, hora de Lima) se rechaza
  en la base (`HC042`): la solicita su representante. <!-- REVISAR: el corte de 18 años, y si un adolescente puede pedir su copia, es del asesor. -->
- **Coherencia en la base (`HC041`):** para `paciente` el documento del solicitante debe ser el registrado; el vínculo y el
  tipo de acreditación deben corresponder al tipo de solicitante; para cualquier verificación el método y la identidad son
  obligatorios. Un solicitante con un familiar o cónyuge de un adulto que no es su representante no cumple ninguna fila: se
  rechaza.
- **Método único en esta versión:** `documento_original_presencial`. La consulta a RENIEC (el DS 009-2017-SA la menciona para
  acreditar el sistema) no está disponible en el stack y no se promete.
- **Qué NO se guarda:** imagen del documento ni de la acreditación; solo su tipo y referencia. *Alternativa descartada:* escanear
  y archivar los documentos en Blob: suma datos personales sensibles de un tercero, una tienda más con su control de acceso y
  una retención sin definir. El asesor puede exigirlo (pregunta abierta); añadirlo es otro change.
- **Rechazo:** `rechazada` con `motivo_rechazo` (`identidad_no_verificada`, `representacion_no_acreditada`,
  `solicitante_sin_legitimacion`, `desistimiento`, `duplicada`, `otro`) y `detalle_rechazo` obligatorio con `otro`. Es definitivo y
  queda registrado con quién y cuándo (PRD). Quien vuelve con los documentos correctos abre una solicitud nueva.
- **Datos de terceros:** el nombre y el documento de un representante son datos personales de quien quizá no es paciente. Solo
  los lee el administrativo y se incluyen en la inscripción del banco de datos ante la ANPD (pregunta abierta).

### D5. Plazo de 5 días: regla propuesta, parametrizada

- **Regla propuesta:** **5 días calendario** contados desde el día de la solicitud (hora de Lima). El día de la solicitud es el
  día 0; `vence_en` es el último instante del día 5. Ejemplo: solicitada un lunes a las 23:30 de Lima → vence el sábado a las
  23:59:59 de Lima, aunque en UTC ya sea martes. Es la lectura más exigente para la clínica (no se alarga por fines de semana ni
  feriados), así que no deja un incumplimiento oculto si la norma resulta ser en días hábiles.
  <!-- REVISAR: el texto leído de la NTS 139 (4.2.14 y literal h) no precisa si son días hábiles o calendario. Pregunta abierta para el asesor. -->
- **Parametrizada, no codificada en cada fila:** `calcular_vencimiento_copia(timestamptz)` es una función; el disparador de
  alta la usa y guarda el resultado en `vence_en`, que **no cambia después**. Si el asesor dice «hábiles», una migración
  reemplaza la función y solo afecta a las solicitudes nuevas.
- **Cuándo se «cumple»:** cuando se confirma la entrega (`emitida_en`). Una solicitud abierta con `now() > vence_en` es
  **vencida**; no se cierra sola y debe atenderse (D10). Si se entrega tarde, `motivo_demora` es obligatorio. Una rechazada no
  cuenta como incumplimiento. Las solicitudes no entregadas por no presentarse el solicitante siguen abiertas: ver «Preguntas
  abiertas».
- **Sin analítica:** la meta de 100 % se lee en la lista de cerradas («En plazo» / «Fuera de plazo»), no en un tablero.

### D6. Qué contiene la copia, qué no, y cómo no olvidar tablas

| Sección | Se incluye | No se incluye / nota |
|---|---|---|
| Filiación y número de historia | Los datos de `pacientes` de la filiación mínima de la NTS 139 (H3, ítem 5) y el `numero` de la historia | |
| Antecedentes | Todos, con tipo, fecha y vigencia | |
| Atenciones | Solo las **firmadas**: autor, colegiatura, fecha y hora de Lima, método de firma, `firma_huella`, diagnósticos CIE-10 y los `datos_especialidad` con las etiquetas de su plantilla | **Borradores sin firmar: no entran.** La copia declara «N borradores sin firmar no incluidos» (solo el número) |
| Addendas | Todas, después de su atención | |
| Triajes (H6b) | Todos | |
| Recetas (H6c) | Emitidas y anuladas (estas marcadas «Anulada») | |
| Secciones de especialidad (H6e, H6f, H6h) | Las que defina cada una | Pendiente del detalle de esos changes |
| **Psicología (H6g)** | Evaluaciones, resultados de tests y notas de sesión | Solo si el paciente tiene registros; la solicitud guarda `incluye_psicologia` y **no** los conteos de esa sección |
| Adjuntos (`adjuntos_historia`) | Los vigentes, anexados al final con su nombre y su página | Los anulados no; la copia declara «N adjuntos anulados no incluidos» |
| Derivaciones, visitas, citas, asignaciones, notificaciones, auditoría, `accesos_historia` | No | Son operativos o de control, no el registro clínico <!-- REVISAR: si `derivaciones` (H6b) lleva un motivo clínico, pasa a incluirse. --> |

- **Por qué se excluyen los borradores:** son trabajo en curso, no registro firmado; incluirlos entregaría texto que el
  profesional no ha dado por válido. Costo: la consulta de ayer sin firmar no sale. La copia lo declara y `contenido_hasta`
  fija el corte; el asesor y la clínica pueden preferir otra regla (pregunta abierta).
- **Historia sin registros:** se emite igualmente una copia con la filiación y la constancia «La historia clínica no registra
  atenciones, antecedentes ni adjuntos a la fecha»; la clínica no puede dejar sin respuesta a un solicitante verificado.
  <!-- REVISAR: confirmar con el asesor. -->
- **Alcance declarado en la carátula:** «Copia de los registros electrónicos de la historia clínica. No incluye documentos que
  obren solo en el archivo físico.» La historia híbrida (ADR-0013) hace que parte del expediente esté en papel; copiar esa
  parte se hace fuera del sistema y, si la clínica quiere cerrar la solicitud solo cuando ambas partes salieron, es una
  pregunta abierta.
- **Adjuntos como anexos:** la propuesta es anexarlos al PDF (carátula por adjunto, numeración continua). Puede no caber en la
  memoria o la duración de una función del plan Hobby: la tarea 0.5 mide el peor caso y, si no cabe, el adjunto se entrega como
  archivo aparte, listado en el índice con su huella (sigue sin pasar por Blob de salida ni por pantalla).
- **Prueba de cobertura (clave).** El compilado es una función con una sección escrita por cada tabla clínica; cada change que
  crea una tabla clínica añade su sección con un `create or replace` en su propia migración. La prueba `74` recorre todas las
  tablas de `public` y falla si alguna no está **mencionada en el compilado** ni figura en una lista de exclusiones escrita en
  la propia prueba **con su razón** (misma idea que `99_rls_en_todas_las_tablas`). Así, olvidar una tabla nueva rompe la
  suite en vez de entregar copias incompletas en silencio. *Alternativa descartada:* un registro de secciones en una tabla con
  despacho dinámico: otra tabla con RLS y SQL dinámico dentro de una función `SECURITY DEFINER`.
- **Orden de construcción:** lo ideal es construir H6d al final del grupo H6, con el compilado completo; si no, cada change
  (H6b, H6c, H6e a H6h) añade su sección y la prueba lo exige. Este change entrega las secciones de H6 y las de los changes ya
  aplicados.

### D7. Qué autentica la copia

| Elemento | Qué hace | En esta versión |
|---|---|---|
| Folio | `numero` de la solicitud, impreso en **cada página** con «Página n de N» | Sí |
| Huella del contenido | `'v1:'` + SHA-256 del `jsonb` canónico compilado (mismo método que D5 de H6) | Sí; ver límite abajo |
| Texto de autenticación | «Copia emitida por el sistema de historias clínicas de [clínica] el [fecha y hora de Lima], a pedido de [solicitante], bajo la responsabilidad de [responsable]» | Sí; el responsable (nombre y cargo) viene de configuración y lo define la clínica |
| Sello de la clínica | Imagen o sello en la carátula | Sí, estático |
| Firma manuscrita del responsable en la solapa del sobre | Manual, fuera del sistema | Opcional, a decidir con el asesor |
| Firma digital del responsable | Reemplaza al sello del sistema | Fuera de esta versión (P-5) |
| Índice de lo incluido y lo excluido | Secciones, conteos y exclusiones declaradas | Sí |

- **Interfaz reemplazable:** `lib/copias/sellador.ts` define `SelladorCopia` (`sellar(compilado, solicitud) → ConstanciaDeCopia`) y
  `sello-sistema.ts` lo implementa sin servicio externo, como `ProveedorFirma` de H6 (D5). Cambiar a una firma digital no
  cambia el flujo ni el modelo.
- **Qué prueba la huella y qué no (límite declarado).** Prueba que el registro de la solicitud y el documento emitido
  corresponden entre sí y permite verificar un **archivo** presentado. **No** permite comprobar el cuerpo de una copia **en
  papel** años después: el contenido no se conserva y la huella no puede recomputarse porque parte de la historia (antecedentes
  vigentes, adjuntos) cambia legítimamente. Conservar el documento emitido (cifrado) lo resolvería y depende de la retención
  (P-1): por defecto **no se conserva** (pregunta abierta). La función `verificar_autenticidad_copia(numero, huella)` solo
  responde si el par existe, su estado y su fecha, sin contenido.
- **Sin declaración legal.** Ninguna pantalla ni el documento afirma que cumple la NTS 139: dice qué es y quién lo emitió.
  Que un sello del sistema baste como «copia autenticada» lo decide el asesor.

### D8. Auditoría: un tipo de acceso `copia` en `accesos_historia`

- **Qué se agrega:** el valor `copia` en `tipo_acceso` (columna que añade H6, tarea 4.1), una columna `solicitud_copia_id`
  (FK a la solicitud) y `huella_contenido`. Una fila **por generación**, escrita por `compilar_copia_historia` (que es
  `SECURITY DEFINER`, así que no hace falta cambiar la política de inserción de `accesos_historia`, que sigue siendo solo del
  profesional a cargo). Contiene: `actor_id` = perfil del administrativo, `paciente_id`, tipo, solicitud, huella y hora. El
  detalle de secciones y conteos queda en la solicitud (D3), no en esta tabla. **Nunca contenido.**
- **Quién la ve:** el administrativo, en la revisión de accesos de H6 (tarea 4.5), que debe mostrar las filas `copia` con la
  solicitud enlazada y dos marcas: «generada sin confirmar la entrega» y «verificó y entregó la misma persona».
- *Alternativas:* (a) una tabla `generaciones_copia`: aísla el cambio pero deja la lectura más amplia del sistema fuera de la
  tabla donde se audita «quién vio qué historia», que es justo la que el administrativo revisa; (b) auditar solo en la solicitud:
  pierde el rastro de las generaciones que no terminaron en entrega. Se elige ampliar `accesos_historia`.
- **Acoplamiento con H6:** la migración de este change depende de la de H6 que crea `tipo_acceso`; si la prueba `56` de H6
  enumera los tipos permitidos, se actualiza a propósito (tarea 3.1).

### D9. Entrega presencial; la descarga se descarta

| Opción | Decisión |
|---|---|
| **Presencial: copia impresa en sobre cerrado, con constancia de entrega firmada por el solicitante** | **Propuesta.** La constancia (sin contenido clínico: folio, paciente, solicitante, fecha, páginas y huella) la imprime el sistema y la clínica la archiva en papel; el sistema no guarda su imagen (pregunta abierta) |
| Descarga desde el portal del paciente | Excluida por el PRD («no incluye que el paciente consulte su historia clínica desde el portal») |
| Enlace de un solo uso por correo | Descartada: correo sin cifrar, identidad débil y las notificaciones del sistema no llevan datos clínicos (H5) |
| Descarga asistida en el mostrador (QR o código) | Descartada: exige una ruta pública que sirva la historia completa a quien tenga el código, y el código lo vería recepción |
| Soporte digital cifrado (USB) | Descartada: soporte extraviable, gestión de claves y el archivo pasa por el equipo de recepción |
| Entrega por mensajería o tercero | Fuera de esta versión; un tercero se atiende como `representante_legal` con su acreditación |

### D10. Seguimiento del plazo en pantalla

Ruta `app/administrativo/copias-historia/`. La **lista de pendientes** es la vista por defecto: solicitudes abiertas ordenadas
por `vence_en` ascendente. Cada fila muestra número, paciente (nombre y documento), tipo de solicitante, solicitada (fecha y hora
de Lima), **fecha límite** y una etiqueta con icono **y texto**, nunca solo color (DESIGN.md): «Vence en 3 días», «Vence hoy»,
«Vencida hace 2 días». Encabezado con dos números: pendientes y vencidas. Una segunda pestaña, **cerradas**, lista las
`emitida` y `rechazada` con «En plazo» / «Fuera de plazo» y el motivo de la demora. Sin gráficos, sin porcentaje agregado, sin
exportación: es una lista de trabajo. Si H7 (`turnos-y-dashboard`) quiere un conteo de vencidas en el dashboard operativo,
lo consume de aquí; este change no lo construye. No hay aviso por correo al personal (las notificaciones son del paciente).

### D11. Privilegios, funciones y matriz por rol

| Objeto | administrativo | profesional (a cargo u otro) | enfermera | paciente | sin rol / `anonymous` | `cron_notificaciones` | `sync_identidad` |
|---|---|---|---|---|---|---|---|
| `solicitudes_copia_historia` `SELECT` / `INSERT` | Sí / Sí (columnas) | No | No | No (ni la propia) | No | Sin `GRANT` | Sin `GRANT` |
| `UPDATE` / `DELETE` de la tabla | No (solo por funciones) | No | No | No | No | No | No |
| `compilar_copia_historia`, `confirmar_entrega_copia`, `verificar_solicitud_copia`, `rechazar_solicitud_copia`, `verificar_autenticidad_copia` | Sí (comprueban el rol dentro) | `42501` | `42501` | `42501` | Sin `EXECUTE` | Sin `EXECUTE` | Sin `EXECUTE` |
| Filas `copia` de `accesos_historia` | Lee | No | No | No | No | Sin `GRANT` | Sin `GRANT` |
| Contenido clínico, directamente | Cero filas (nada cambia) | Lo que ya le dan sus políticas | Cero filas | Cero filas | Cero filas | Sin `GRANT` | Sin `GRANT` |

Todas las funciones: `SECURITY DEFINER`, `search_path` vacío, `REVOKE ALL … FROM PUBLIC`, `EXECUTE` solo a `authenticated`, y el
cuerpo rechaza con `42501` a quien no sea administrativo. Ninguna acepta como parámetro el actor ni las fechas del servidor.

### D12. Aplicación: rutas, módulo único, errores y acciones

| Ruta | Rol | Contenido |
|---|---|---|
| `app/administrativo/copias-historia/page.tsx` | administrativo | Lista de pendientes y cerradas (D10) |
| `.../nueva/page.tsx` | administrativo | Alta: buscar al paciente por documento y datos del solicitante |
| `.../[solicitudId]/page.tsx` | administrativo | Detalle: verificar, rechazar, generar, confirmar entrega, constancia |
| `.../[solicitudId]/documento/route.ts` | administrativo | `POST` que genera el PDF (`GET` responde 405) |

- Toda página y ruta repite `auth.protect()`, `exigirRol("administrativo")` y MFA mediante el ayudante de guardia de H6.
  Cabeceras `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff` en el documento; título genérico «Copia de
  historia clínica»; direcciones solo con `uuid`; páginas dinámicas. El PDF se muestra en una vista de impresión sin guardarse
  en el equipo.
- **Módulo único:** todo SQL de la tabla y de `compilar_copia_historia` vive en `lib/historias/copias.ts`; la prueba
  `acceso-unico` de H6 se amplía para cubrirlo. Cada operación empieza con `exigir_modo_clinico` (H6 D1).
- **Acciones** (devuelven `{ ok: true, datos } | { ok: false, mensaje, errores? }`): `registrarSolicitudCopia`,
  `verificarSolicitudCopia`, `rechazarSolicitudCopia`, `confirmarEntregaCopia`. La generación es el Route Handler (devuelve
  un archivo). Esquemas Zod en `lib/schemas/copia-historia.ts`; documento de identidad con las reglas de formato de H3.
- **Registros del servidor sin contenido:** el handler solo registra el SQLSTATE y la operación.

| Origen en la base | Mensaje al usuario |
|---|---|
| `HC040` | «La solicitud ya no está en un estado que permita esta operación. Actualice la pantalla.» |
| `HC041` | «No se pudo verificar la identidad: revise el documento del solicitante y su acreditación.» |
| `HC042` | «Una persona menor de edad no puede pedir su historia por sí misma: la solicita su representante legal.» |
| `HC043` | «Primero genere la copia; después confirme su entrega.» |
| `HC044` | «Se alcanzó el máximo de generaciones de esta copia. Consulte al responsable de la clínica.» |
| `HC002`, `HC004` (H6) | Los mensajes de H6 |
| `23505` sobre la abierta | «Ya existe una solicitud abierta de este solicitante para este paciente (N.º …).» |
| `23514` | «Hay campos vacíos o inválidos. Indique también el motivo de la demora si corresponde.» |
| `42501` | «No tiene permiso para esta operación.» |
| otros | «No se pudo completar la operación. Intente de nuevo.» |

`HC045` queda reservado para el doble control (D2) y `HC046` a `HC049` libres.

### D13. Pruebas y verificación

- **pgTAP** (numeración sugerida): `73_solicitudes_copia_rls` y `74_copia_historia_emision`.
  - `73`: RLS activada; el administrativo lee e inserta; **negativos por rol** (profesional a cargo, otro profesional,
    enfermera, paciente incluido el titular, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`) para `SELECT`,
    `INSERT`, `UPDATE` y `DELETE`; `has_table_privilege` de lo que no se concede; campos del servidor no suplantables; vencimiento
    (lunes 23:30 de Lima, domingo, cliente que envía fechas); índice de duplicadas; solo-agregar incluido el dueño.
  - `74`: ciclo y transiciones inválidas (`HC040`), menor (`HC042`), coherencia (`HC041`), tope (`HC044`), confirmación sin
    generación (`HC043`), motivo de demora; compilado: lo incluido y lo excluido (borrador, adjunto anulado, Psicología),
    **ni la solicitud ni `accesos_historia` ni `auditoria` contienen texto clínico** (se busca un texto centinela), el administrativo
    sigue sin leer las tablas clínicas directamente, cada rol ajeno no ejecuta las funciones, historia vacía, huella
    reproducible, guarda de modo; y la **cobertura** (D6).
  - No asumen tablas vacías. Si la prueba `56` de H6 enumera los tipos de acceso, se actualiza a propósito.
- **Verificación por mutación** (como en H2 y H6): para cada política, disparador y función nuevos se debilita temporalmente en
  un branch de desarrollo (quitar la comprobación de rol de `compilar_copia_historia`, aceptar `emitir` sin `verificada`, quitar la
  inserción del acceso, quitar el índice de duplicadas, permitir `UPDATE` directo, sacar Psicología del compilado, quitar el
  tope) y se comprueba que alguna prueba negativa falla; se anota en el PR.
- **`node:test`:** esquemas Zod, mapeo de errores, orden de sentencias con ejecutor simulado (modo primero, luego la operación;
  si el acceso falla no se devuelve contenido), huella y sellador, documento sobre un compilado sintético (folio y «Página n de N»
  en cada página, exclusiones declaradas, ninguna afirmación de validez legal), y la ampliación del acceso único.
- **Concurrencia:** dos confirmaciones o dos verificaciones simultáneas de la misma solicitud, y dos altas duplicadas a la vez.
- **E2E (Playwright, datos de demostración):** alta, verificación, generación e impresión con confirmación; rechazo por
  representación no acreditada; duplicada; vencida visible con su etiqueta; la pantalla **no contiene** el texto clínico
  centinela en ningún paso; profesional, enfermera y paciente no abren las rutas; axe sobre las pantallas.
- Antes de cerrar: agente `code-review` sobre todo el diff, con la lectura más estricta.

## Risks / Trade-offs

- [El PDF pasa por el navegador y la impresora de recepción: una persona con el papel puede leerlo] → Es el límite declarado de
  D2, no un defecto oculto. Mitigaciones: sin Blob, `no-store`, generación con el solicitante presente, tope de 3, revisión de
  accesos, marca de «verificó y entregó la misma persona». Requiere decisión explícita del usuario (D2, punto i).
- [Una solicitud falsa con un documento falso permite sacar el expediente completo, incluida salud mental] → Es el riesgo
  principal de este change. Controles: verificación presencial con documento original, atribución de cada paso, doble control
  opcional, revisión de accesos y, si el usuario lo decide, aviso al paciente. Ningún control técnico detecta un documento
  falsificado: la defensa final es la verificación humana y el rastro.
- [La función `compilar_copia_historia` devuelve contenido a una sesión de administrativo; un defecto en la aplicación podría
  filtrarlo a un navegador] → Es la única vía; se revisa como una política RLS (`code-review`, mutación), el handler no
  escribe el contenido en ningún registro y las pruebas E2E buscan un texto centinela en cada pantalla.
- [El compilado omite una tabla clínica nueva y la copia sale incompleta sin que nadie lo vea] → Prueba de cobertura (D6): falla
  al crear una tabla no clasificada.
- [La huella no permite verificar el cuerpo de una copia en papel] → Se declara (D7). Si el asesor lo exige, se conserva el
  documento cifrado o se pasa a firma digital detrás de `SelladorCopia`.
- [El PDF con adjuntos de 25 MB no cabe en la memoria o el tiempo de una función del plan Hobby] → Medición en la tarea 0.5;
  fallback: adjuntos como archivos aparte listados en el índice.
- [No hay impresora en recepción (supuesto del PRD sin confirmar)] → Tarea 0.4. Sin impresora no hay entrega por esta vía y
  habría que replantear D9.
- [Se genera la copia y el solicitante se va sin recogerla] → La solicitud queda `verificada` con generaciones sin confirmar y
  aparece marcada en la revisión de accesos; el papel impreso se destruye según el procedimiento de la clínica (a escribir en el
  manual de H8).
- [El plazo en días calendario resulta ser más exigente que la norma] → Es el lado seguro; cambiarlo es reemplazar una función
  (D5).
- [Datos personales de representantes y autoridades en una tabla nueva] → RLS solo administrativo, solo-agregar, incluidos en
  la inscripción ante la ANPD (pregunta abierta); retención junto con P-1.
- [`accesos_historia` es de H6 y esta migración la modifica] → Orden de migraciones fijado en el plan; la tarea 0.6 lo coordina;
  no cambia ninguna política existente.
- [Los nombres `profesional` dependen de ADR-0030] → Nota al inicio; este change usa los nombres propuestos.

## Migration Plan

1. Grupo 0: ADR de la emisión (decisión del usuario sobre D2), consulta al asesor, datos de la clínica, medición del documento y
   coordinación con los demás changes, antes de escribir código.
2. Migraciones nuevas, en este orden y cada una con su prueba: `solicitudes-copia-historia` (tipos, tabla, índice, disparadores,
   RLS, `GRANT`) → `ciclo-de-solicitudes-copia` (verificar, rechazar, confirmar, autenticidad) → `accesos-historia-copia`
   (tipo y columnas; requiere la migración de H6 que crea `tipo_acceso`) → `compilado-de-copia-historia`. Los changes que
   añadan tablas clínicas después reemplazan el compilado con `create or replace` en su propia migración. Nunca se edita una
   migración aplicada.
3. Suite pgTAP, concurrencia e integración completas en un branch de desarrollo; PR con branch efímero y los mismos pasos.
4. Aplicación: lógica y repositorio primero, luego documento y pantallas (estas esperan a H2b si no está aplicado).
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones. El modo de datos queda en `demostracion`; este change
   **no** lo cambia.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027); un defecto se corrige con una migración nueva, y está prohibido restaurar
   el branch principal de Neon. Para desactivar la función basta revocar el `EXECUTE` de `compilar_copia_historia` en una
   migración nueva.

## Open Questions

Para el asesor legal (la propuesta de este change se mantiene mientras tanto, siempre con datos de demostración):

- **¿Días hábiles o calendario?** (D5). Define el vencimiento; la función es reemplazable.
- **¿Quién puede solicitar y qué lo acredita?** Representante legal (qué instrumentos), tutores y curadores, apoderados con carta
  poder simple o legalizada, herederos de un paciente fallecido (hoy no previstos: se rechazan como sin legitimación), mayoría de
  edad y adolescentes, y autoridad judicial o Ministerio Público (flujo propio o este).
- **¿Qué hace «autenticada» a la copia?** Sello del sistema y responsable (D7), firma manuscrita del responsable, o firma digital
  (P-5). ¿Basta con un documento cuyo contenido nadie del personal revisó?
- **Psicología:** ¿puede entregarse completa al paciente o a un representante, o hay notas de psicoterapia o datos que la norma
  protege aún más? ¿Qué cambia en una emergencia? (ADR-0031). El compilado tiene una lista de secciones: excluirla sería una
  migración de una línea.
- **Retención** del documento emitido, de las solicitudes y de los datos de terceros; inscripción de esos datos ante la ANPD.
- **Costo de reproducción:** el encargo lo atribuye al solicitante (NTS 139); pagos y cobros están fuera de alcance. ¿Se cobra
  fuera del sistema o se registra el monto?

Para el usuario o la clínica:

- **D2, punto (i) y (ii):** aceptar el límite de la garantía y elegir endurecimientos (doble control, reverificación, aviso al
  paciente).
- **Quién es «el responsable»** que figura en la copia; si hay **impresora** en recepción; cómo trabaja hoy recepción la copia
  en papel.
- **Borradores sin firmar:** ¿se excluyen (propuesta) o se incluyen marcados?
- **Solicitante que no se presenta:** ¿cuándo se cierra una solicitud que sigue abierta sin que él vuelva? Hoy no se cierra
  sola; se rechaza con `desistimiento` por recepción.
- **Documentos solo en papel:** ¿la solicitud se cierra recién cuando se entregó también esa parte, y cómo se anota?
- **Constancia de entrega firmada:** ¿se guarda su imagen? Hoy se archiva en papel.
- **Solicitudes recibidas por escrito** antes de registrarse: ¿el plazo cuenta desde la recepción? Hoy cuenta desde el registro.
- **Biblioteca de PDF** y cómo se reparte la impresión con las recetas de H6c (tarea 0.5).
