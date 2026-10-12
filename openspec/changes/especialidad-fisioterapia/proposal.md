# Proposal

> **Nombres: sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada); si se rechaza, léase
> `medico`/`medicos`.** Este change escribe `profesional`, `profesionales`, `profesional_actual()`,
> `profesional_tiene_paciente()`, `profesion_actual()` y `app/profesional/**`. La ADR sigue en estado **Propuesto**: este
> change no se aplica hasta que el usuario la acepte.

## Why

El PRD del 2026-10-11 pide que la clínica atienda **Fisioterapia** con funciones propias: evaluación inicial (escala de dolor,
goniometría, fuerza, pruebas especiales y un test funcional), nota por sesión, plan de sesiones con contador de las restantes,
y reevaluación y alta. Hoy nada de eso existe: la historia clínica de H6 guarda una atención genérica (motivo, anamnesis,
examen físico, diagnósticos CIE-10 y plan) y un fisioterapeuta no podría registrar ni comparar una medición, ni saber cuántas
sesiones le quedan a un paciente, ni demostrar si el tratamiento cumplió sus objetivos.

Lo que hace difícil este módulo no es la pantalla sino el dato: la evaluación repite mediciones que **se comparan en el tiempo**
(el mismo movimiento, del mismo lado, antes y después), las sesiones forman una serie, y todo es información clínica que debe
quedar sellada con la firma. La plantilla por especialidad de [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md)
(un `jsonb` con tipos simples) no puede representar mediciones repetidas, así que el cambio decide con alternativas qué va en
`datos_especialidad` y qué en tablas propias. Es el hito **H6f**.

## What Changes

**Este change toca RLS y el acceso a historias clínicas (el riesgo principal del proyecto): crea seis tablas clínicas nuevas, dos
vistas y disparadores sobre `atenciones` que completan y sellan la firma. Requiere revisión aparte con el agente `code-review`
(hay una tarea de revisión al final de cada grupo que toca políticas, funciones o disparadores, y una revisión final sobre todo el
diff; `tasks.md`) y verificación por mutación de sus pruebas negativas (tarea 8.2).**

- **Evaluación inicial = una atención de Fisioterapia más tablas hijas.** La evaluación es una `atención` (acto clínico firmado,
  con su huella) que usa la plantilla `Fisioterapia v1` en `datos_especialidad` solo para lo escalar que identifica el acto
  (`tipo_registro`, `zona`, `motivo_alta`). Lo repetible y comparable va en tablas propias: `mediciones_fisioterapia` (escala de
  dolor EVA 0–10 con localización; goniometría con articulación, movimiento, lado y grados; fuerza 0–5 por grupo muscular y lado;
  pruebas especiales positivas o negativas por lado; y el puntaje del test funcional), `objetivos_fisioterapia` (objetivos
  medibles con su valor inicial) y `evaluaciones_fisioterapia` (el vínculo de la atención con el episodio, las omisiones
  declaradas y el sello).
- **Episodio de fisioterapia** (`episodios_fisioterapia`): el tratamiento de un paciente por una zona, desde la evaluación inicial
  firmada hasta el alta. Es el hilo que une la evaluación inicial, las reevaluaciones, el plan de sesiones, las notas y el alta, y
  hace posible comparar. Nace al firmar la evaluación inicial; nadie lo escribe directamente.
- **Vocabularios cerrados por migración** (`catalogo_fisioterapia`): zonas y localizaciones, movimientos de goniometría con su
  rango de grados, grupos musculares y pruebas especiales. Lo gestiona una migración revisada por los fisioterapeutas de la
  clínica (`REVISAR`), no el usuario; así «el mismo movimiento del mismo lado» tiene una identidad estable para comparar.
- **Test funcional según la zona**, como `instrumentos_evaluacion` con `area = fisioterapia` de `mecanismos-clinicos-comunes`
  (H6i): Oswestry (lumbar), NDI (cuello), QuickDASH (miembro superior) y Lysholm (rodilla). **Las licencias de esos instrumentos
  no están verificadas** (`REVISAR`): este change no copia ningún ítem y solo asocia a una zona un instrumento que H6i haya
  cargado con licencia verificada.
- **Plan de sesiones con contador**, usando `planes_de_sesiones` de H6i (que es dueño del contador, de las citas y de los casos de
  inasistencia, reprogramación y abandono). Este change aporta el **catálogo de planes de Fisioterapia**, asocia el plan al
  episodio y exige que cada nota apunte a una sesión del plan.
- **Nota por sesión** (`notas_sesion_fisioterapia`): dolor al entrar y al salir (0–10), técnicas o ejercicios aplicados, respuesta
  del paciente e indicaciones para casa. Se registra una vez, queda sellada al instante y no se edita; una corrección es otra nota
  que la reemplaza y conserva la anterior.
- **Reevaluación y alta.** Una reevaluación **repite las mediciones de la evaluación inicial** y se compara con ella; el alta
  cierra el episodio con un motivo de lista cerrada. La comparación vive en dos vistas `security_invoker`
  (`comparacion_fisioterapia` y `objetivos_estado_fisioterapia`) que solo consideran evaluaciones firmadas y no interpretan
  clínicamente el cambio (sin umbrales ni alertas). El resumen de alta es una pantalla; **quién recibe un informe de alta es
  pregunta abierta y este change no lo entrega a nadie**.
- **Visibilidad.** Lo **lee todo profesional que tiene al paciente a cargo** (cualquier profesión) y lo **escribe solo un
  fisioterapeuta** (`profesion_actual()`) que también lo tiene a cargo. Administrativo, enfermera, paciente, sin rol,
  `anonymous`, `cron_notificaciones` y `sync_identidad` no leen ni escriben. Casos negativos por rol y por profesión en cada tabla.
- **Auditoría.** Cada lectura de contenido de Fisioterapia se registra en `accesos_historia` (tipo nuevo `fisioterapia`) en la
  misma transacción que la lectura; la escritura se audita **sin copiar contenido** con `registrar_auditoria_sin_contenido()`
  (H6b).
- **Copia de la historia (H6d).** Las seis tablas se clasifican y la sección de Fisioterapia se añade al compilado de la copia;
  la prueba de cobertura de H6d falla si falta.
- **Pantallas** (sobre el sistema de diseño de H2b): historia de Fisioterapia del paciente, evaluación (inicial, reevaluación y
  alta), episodio con plan y contador, comparación, y nota por sesión.
- **Pruebas:** pgTAP `76` (sugerida), concurrencia (dos firmas de evaluación inicial de la misma zona, dos notas de la misma
  sesión), `node:test`, E2E con Playwright y accesibilidad con axe.

## Capabilities

### New Capabilities

- `evaluacion-fisioterapia`: la evaluación inicial como atención de Fisioterapia; escala de dolor, goniometría, fuerza, pruebas
  especiales y test funcional con sus vocabularios cerrados y rangos; objetivos medibles con su valor inicial; completitud antes
  de firmar con omisiones declaradas por tipo; sello de lo firmado; y apertura del episodio.
- `seguimiento-por-sesiones-fisioterapia`: el plan de sesiones asociado al episodio con el catálogo de planes y el contador de las
  restantes, y la nota por sesión (campos, sesión del plan, una nota vigente por sesión, inmutabilidad y corrección).
- `reevaluacion-y-alta-fisioterapia`: la reevaluación que repite las mediciones iniciales, la comparación en el tiempo, el estado
  de los objetivos, el alta que cierra el episodio y el resumen de alta.
- `acceso-y-auditoria-fisioterapia`: quién lee y quién escribe cada tabla con el caso negativo por rol y por profesión, la lectura
  auditada, la escritura sin contenido, la guarda de datos reales y la sección en la copia de la historia.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/` (solo existe `autenticacion-roles`). Este change añade disparadores sobre `atenciones` y un tipo de
acceso a `accesos_historia` (ambos de `historias-clinicas`, aún sin archivar): no hay delta posible; se coordina en la tarea 0.6 y se
declara en design.md, D8 y D14. -->

## Impact

- **Hito:** **H6f** de `docs/BACKLOG.md` (el orden fino lo fija el backlog). **Depende de** H2c `profesionales-de-la-salud`
  (`profesion_actual()`, la profesión `fisioterapeuta`), de H6 `historias-clinicas` (atenciones, firma y huella, plantillas,
  asignaciones, `accesos_historia`, guarda de modo de datos, módulo único de acceso) y de **H6i `mecanismos-clinicos-comunes`**
  (planes de sesiones e instrumentos de evaluación; aún en redacción: se usa por su interfaz, `design.md` D1). Usa además
  `registrar_auditoria_sin_contenido()` de H6b y añade su sección al compilado de H6d. Las pantallas dependen de H2b.
- **RLS y acceso a historias clínicas (revisión aparte):** tablas nuevas `catalogo_fisioterapia`, `episodios_fisioterapia`,
  `evaluaciones_fisioterapia`, `mediciones_fisioterapia`, `objetivos_fisioterapia` y `notas_sesion_fisioterapia`; dos vistas
  `security_invoker`; funciones `SECURITY DEFINER` acotadas; y **dos disparadores sobre `atenciones`** que reaccionan solo al
  firmar una atención con la plantilla de Fisioterapia (comprobar que está completa y sellarla). Casos negativos por rol
  (administrativo, profesional a cargo, otro profesional, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones`,
  `sync_identidad`) **y por profesión** (médico, odontólogo, psicólogo y podólogo a cargo leen pero no escriben): pruebas pgTAP `76`
  (sugerida).
- **Decisión legal P-1 y puntos nuevos (acreditación ante el MINSA, registro ante la ANPD):** lo que este change guarda son datos
  clínicos. **No puede pasar a producción con datos reales de pacientes** mientras sigan abiertos; se apoya en la guarda de datos
  reales de H6 (`exigir_paciente_admisible()`, `HC002`; `exigir_modo_clinico()`, `HC004`). Con datos sintéticos de demostración
  no hay bloqueo. No declara validez legal de la firma, del sello ni de ningún instrumento.
- **ADR:** respeta [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (aceptada),
  [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) y
  [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (propuestas; Fisioterapia **no** es
  información restringida: la lee todo profesional a cargo), [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md) y
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md). **Hace falta una ADR nueva** —*Tablas hijas de una
  especialidad selladas con la firma de la atención*— porque es un patrón de arquitectura que también necesitarán Odontología
  (odontograma) y Podología; no se decide dentro de este proposal: la crea la tarea 0.2 (Propuesto) coordinada con H6e y H6h.
- **Código nuevo:** `migrations/*.sql` (ocho archivos nuevos, `design.md` D17); `lib/historias/fisioterapia.ts` (dentro del
  módulo único de acceso clínico), `lib/fisioterapia/` (errores, etiquetas, sentido de mejora), `lib/schemas/fisioterapia.ts`;
  `app/profesional/pacientes/[pacienteId]/fisioterapia/**` con sus `acciones.ts`; `components/clinica/` (formulario de mediciones,
  escala de dolor, contador de sesiones, comparación, nota de sesión); `tests/pgtap/76_*`, `tests/concurrencia/`,
  `tests/fisioterapia/`, `e2e/fisioterapia*.spec.ts`.
- **Base de datos:** tablas y vistas de arriba; tipos `tipo_medicion_fisioterapia`, `lado_fisioterapia` y
  `estado_episodio_fisioterapia`; SQLSTATE `HC060` a `HC067` (`HC068` y `HC069` reservados); una fila de plantilla `Fisioterapia v1`
  en `plantillas_clinicas` y, si no existe, la especialidad `Fisioterapia`; ampliación de `tipo_acceso` de `accesos_historia`.
  **No se añade ninguna columna a `atenciones`.**
- **Dependencias nuevas:** ninguna. **Infraestructura:** ninguna variable de entorno ni rol de Postgres nuevos.
- **Fuera de alcance (no se construye ni se sugiere):** **recetas** (los fisioterapeutas no recetan según la guía comercial de
  Saniape, dato **no verificado**, `REVISAR`; si H6c los autorizara, usarían `recetas-medicas` sin cambios aquí); **imágenes**
  (fotos posturales, radiografías) y cualquier almacenamiento de archivos nuevo (P-15 no afecta a este change); la **entrega o
  impresión del informe de alta** a paciente, médico derivante u otra persona; alertas, semáforos o umbrales clínicos de cambio;
  protocolos terapéuticos con respaldo clínico (los planes son de duración, no de contenido); videos o programas de ejercicios; el
  portal del paciente para ver su evolución; los ítems de los tests funcionales (no se copian); pagos, cobros, presupuestos y
  saldos de sesiones; dictado por voz e IA; telerehabilitación; y analítica de BI.
- **Preguntas abiertas obligatorias (no se deciden aquí):** (1) **quién recibe un informe de alta** y en qué forma
  (`design.md`, D15); (2) la **licencia y la versión validada en español** de los cuatro tests funcionales (`REVISAR`,
  `design.md`, D6): sin licencia verificada no se carga el instrumento; (3) si el fisioterapeuta registra un **diagnóstico CIE-10**
  como el resto de las atenciones (H6 lo exige en toda atención); (4) si se admite atender **sin plan de sesiones**.
