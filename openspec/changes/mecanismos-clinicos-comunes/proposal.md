# Proposal

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_actual()` y `profesional_tiene_paciente()`; si la ADR se
> rechaza, léase `medico`, `medicos`, `medico_actual()` y `medico_tiene_paciente()`. Las ADR-0030 y
> [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) siguen en estado **Propuesto**: este change
> no se aplica hasta que el usuario las acepte.

## Why

El PRD del 2026-10-11 pide cinco especialidades «completas», y tres de ellas necesitan **lo mismo dos veces**:

- **Un plan de sesiones con contador de las restantes.** Fisioterapia («plan de sesiones con contador de las restantes»),
  Podología («plan de controles, protocolos por sesiones») y Psicología («sesiones recurrentes»). Hoy ese seguimiento vive en la
  cabeza de recepción o en el Excel: nadie sabe cuántas sesiones le quedan a un paciente, cuáles faltan por agendar ni cuándo
  abandonó el tratamiento.
- **Un instrumento de evaluación con puntaje automático.** Psicología («tests con puntaje automático de uso libre») y
  Fisioterapia (el «test funcional» y la escala de dolor de la evaluación inicial). Un puntaje que se suma a mano se suma mal, y
  uno que el profesional pudiera editar deja de ser un resultado.

Construirlos tres veces (una por especialidad) triplica las tablas con RLS, las pruebas negativas y los errores posibles en el
núcleo de seguridad del proyecto. Este change es el hito **H6i**: **dueño único** de los dos mecanismos, que se construye
**antes** que H6e a H6h para que cada especialidad los **use** con su propio catálogo de protocolos o de instrumentos, sin
redefinirlos. También fija, una sola vez, el mecanismo que [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)
necesita para aislar los tests y las sesiones de Psicología, de modo que H6g solo lo use.

## What Changes

**Este change toca RLS y el acceso a historias clínicas (el riesgo principal del proyecto): crea cuatro tablas clínicas nuevas,
funciones `SECURITY DEFINER` que escriben contenido clínico y dos disparadores sobre `citas` (tabla de H3). Exige la revisión
aparte del agente `code-review` (hay una tarea de revisión al final de cada grupo que lo toca y una final sobre todo el diff) y la
verificación por mutación de sus pruebas negativas (`tasks.md`).**

- **Planes de sesiones** (`planes_de_sesiones`, `sesiones_del_plan`): un plan de un paciente con un profesional (protocolo o
  descripción, total de sesiones, frecuencia en días, vigencia) con estado `activo`, `completado` o `cancelado`. Cada sesión es
  una fila que **se apoya en una cita de H3** (una cita por sesión, creada **al agendar**, no al crear el plan) o **queda por
  agendar**; las citas conservan su doble reserva (`Registro de cita ya agendado`), su ventana de cancelación de 1 hora y sus
  recordatorios. El plan **no reemplaza a las citas** ni guarda saldos en dinero.
- **Contador de sesiones restantes calculado en la base** (no una columna que se desincronice): una sesión cuenta como
  **asistida** solo cuando su cita pasa a `atendida` (la marca el profesional con la acción de H3). Una inasistencia, una
  cancelación o una reprogramación **no cierran el plan** ni consumen la sesión; el paciente que abandona se registra cerrando
  el plan como `cancelado`; agotar las sesiones lo pasa a `completado` solo.
- **Sesiones recurrentes «programadas solas» sin cron nuevo** (ADR-0028): la base **propone** una serie de fechas según la
  frecuencia y la agenda del profesional, y recepción la **confirma** (una transacción por sesión, como la reasignación de H3).
- **Concurrencia resuelta en la base:** dos recepciones que agendan la misma sesión, dos profesionales que marcan «atendida» a la
  vez o un cierre contra una asistencia no pueden dejar el contador mal ni una cita huérfana (orden de bloqueo fijo, `design.md` D8).
- **Instrumentos de evaluación con puntaje** (`instrumentos_evaluacion`, `aplicaciones_instrumento`): un **catálogo
  gestionado por migración** (clave, versión inmutable, nombre, `area`, ítems, reglas de puntaje, interpretación, `uso_libre`
  y la referencia de su licencia) con un **esquema mínimo validable en SQL** (como D15 de `historias-clinicas`: sin extensiones
  ni JSON Schema completo), y **aplicaciones** con las respuestas y un puntaje que **calcula el servidor y verifica la base**:
  una aplicación cuyo puntaje no coincide con el recalculado en la base se rechaza, incluso para el dueño. El profesional puede
  **ajustar la interpretación** (con historial), **nunca el puntaje**.
- **Aislamiento de Psicología como mecanismo reutilizable** (ADR-0031): el tipo `area_clinica`, la función de acceso por área
  `acceso_clinico_por_area(area, paciente)` y la **función única** `psicologo_tiene_paciente(paciente uuid)` (psicólogo, perfil
  activo, paciente a cargo, falla cerrada), que `especialidad-psicologia` (H6g) **reutiliza** en lugar de crear
  `es_psicologo_a_cargo()`; la reserva por autoría sobre `atenciones` y sus tablas propias sigue siendo de H6g (`design.md` D2,
  «Contrato con H6g»). Las aplicaciones con `area = psicologia` y los planes de un psicólogo los lee y escribe solo un
  **psicólogo a cargo**; lo de las demás áreas lo lee todo profesional a cargo y lo escribe solo un profesional de la profesión
  que corresponde (`profesion_actual()`, H2c). Casos negativos por rol **y por profesión**.
- **Recepción solo ve lo mínimo:** una función con lista blanca de columnas le muestra qué planes tienen sesiones por agendar
  y cuántas, sin protocolo ni descripción. Las cuatro tablas **no tienen `GRANT` de escritura** para ningún rol de usuario.
- **Auditoría:** las escrituras con `registrar_auditoria_sin_contenido()` (H6b) y toda lectura de contenido clínico de estos
  mecanismos en `accesos_historia`, en la misma transacción que la lectura (tipos nuevos `plan_sesiones` e `instrumento`).
- **Copia de la historia (H6d):** tarea explícita para clasificar las tablas nuevas y escribir su sección en el compilado.
- **Pantallas mínimas y componentes comunes** para que las especialidades los monten: agenda de sesiones de recepción, plan y
  contador en la historia, y aplicación y resultado de un instrumento.

## Capabilities

### New Capabilities

- `planes-de-sesiones`: crear un plan (solo profesiones autorizadas), su contador de sesiones restantes calculado en la base,
  estados y cierre, vigencia, quién lo lee y quién lo escribe (con el aislamiento de Psicología) y su auditoría.
- `sesiones-y-citas`: cada sesión es una cita de H3 o queda por agendar; qué cuenta como asistida; inasistencia, reprogramación,
  cancelación, baja del profesional y abandono; serie propuesta y confirmada; concurrencia; lo que ve recepción.
- `instrumentos-de-evaluacion`: el catálogo por migración, su definición mínima validable en la base, versiones inmutables,
  solo instrumentos de uso libre con licencia referenciada, y quién los lee.
- `aplicaciones-de-instrumentos`: registrar una aplicación con el puntaje calculado por el servidor y verificado por la base,
  ajustar la interpretación sin tocar el puntaje, anular, restringir `area = psicologia` a los psicólogos a cargo y auditar cada lectura.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/` (solo existe `autenticacion-roles`, que no cambia). Este change *amplía* la restricción de
`tipo_acceso` de `accesos_historia` (de `historias-clinicas`, aún sin archivar) y añade dos disparadores sobre `citas` (de
`agenda-y-reserva`): no hay delta posible sobre requisitos no archivados; se coordina en las tareas 0.5 y 0.6 y se declara en
design.md, D4 y D15. -->

## Impact

- **Hito:** H6i de `docs/TECH-DESIGN.md` («Plan de implementación sugerido»; el orden fino lo fija `docs/BACKLOG.md`). **Depende
  de** H2c `profesionales-de-la-salud` (`profesion_actual()`, `profesional_actual()`, `profesional_tiene_paciente()`, tipo
  `profesion_salud`), de H3 `agenda-y-reserva` (`citas`, sus estados, `reservar_cita()`, `reprogramar_cita()`,
  `marcar_cita_atendida()`, `slots_disponibles()`), de H6 `historias-clinicas` (`atenciones`, `accesos_historia` y su
  `tipo_acceso`, la guarda de datos reales, el módulo único `lib/historias/`) y de H6b `triaje-y-derivacion`
  (`registrar_auditoria_sin_contenido()`). **No depende de** H6c (recetas) ni de H6d. **Habilita** H6e a H6h: cada una los usa
  (`design.md`, D1). Se coordina con H6d: el compilado de la copia gana dos secciones (tarea 6.5).
- **RLS y acceso a historias clínicas (revisión aparte):** tablas `planes_de_sesiones`, `sesiones_del_plan`,
  `instrumentos_evaluacion` y `aplicaciones_instrumento`, todas con RLS activada y sin `GRANT` de escritura; las funciones
  `psicologo_tiene_paciente()` y `acceso_clinico_por_area()` que usan las políticas; funciones `SECURITY DEFINER` de escritura y
  de lectura con lista blanca; y dos disparadores sobre `citas` (`AFTER`, `SECURITY DEFINER`, solo escriben en las tablas de
  este change). Casos negativos por rol (administrativo, profesional a cargo, otro profesional, enfermera, paciente, sin rol,
  `anonymous`, `cron_notificaciones`, `sync_identidad`) **y por profesión** (médico, odontólogo, fisioterapeuta, psicólogo,
  podólogo): pruebas pgTAP 80 y 81.
- **Decisión legal P-1 y puntos nuevos:** planes e instrumentos son datos de salud, y los de Psicología son datos de salud
  mental. **El change no puede pasar a producción con datos reales** hasta cerrar P-1 (retención, firma, alojamiento fuera de
  Perú), la acreditación ante el MINSA (P-11), el registro ante la ANPD (P-12) y las reglas de salud mental (P-14). Se apoya en
  la guarda de datos reales de H6 (`exigir_paciente_admisible()` y `exigir_modo_clinico()`); con datos sintéticos no hay bloqueo.
- **Licencias (P-18): sin verificar.** El PRD pide tests «de uso libre», pero el proyecto **no verificó la licencia de ningún
  instrumento**. Este change entrega el mecanismo y **ningún instrumento concreto**; el catálogo no admite un instrumento vigente
  sin `uso_libre`, sin la referencia de su licencia y sin la fecha en que se verificó. No se declara que ninguna escala sea libre.
- **ADR:** respeta [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (aceptada: mismo patrón de catálogo por
  migración y validación mínima en la base), [ADR-0012](../../../docs/adrs/0012-alcance-de-la-ventana-de-cancelacion.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md), [ADR-0028](../../../docs/adrs/0028-notificaciones-cron-unico-plan-hobby.md),
  y las propuestas ADR-0030 y ADR-0031. **Hace falta una ADR nueva** —*Mecanismos clínicos comunes: planes de sesiones sobre las
  citas y puntaje de instrumentos verificado en la base*— para las decisiones de `design.md` D4 a D6 y D11 a D12: no se decide
  dentro de este proposal; la crea la tarea 0.2 (Propuesto) y la acepta el usuario.
- **Código nuevo:** `migrations/*.sql` (siete archivos y uno condicional, `design.md` D19); `lib/historias/planes.ts` y
  `lib/historias/instrumentos.ts` (dentro del módulo único de acceso clínico), `lib/instrumentos/` (definición y puntaje en
  TypeScript), `lib/sesiones/` (estados y errores), `lib/schemas/plan-sesiones.ts` y `lib/schemas/instrumento.ts`;
  `app/administrativo/planes-de-sesiones/**` y `app/profesional/pacientes/[pacienteId]/{planes,instrumentos}/**`;
  `components/clinica/` (contador, fila de sesión, formulario y resultado de instrumento); `tests/pgtap/80_*` y `81_*`,
  `tests/instrumentos/`, `tests/sesiones/`, `tests/concurrencia/`, `e2e/planes-y-sesiones.spec.ts`.
- **Base de datos:** cuatro tablas, tres tipos (`area_clinica`, `estado_plan_sesiones`, `estado_sesion_plan`), una vista
  `security_invoker` con el contador, SQLSTATE `HC090` a `HC098` (`HC099` reservado), ampliación de `accesos_historia`.
- **Dependencias nuevas:** ninguna. **Infraestructura:** ninguna variable de entorno ni rol de Postgres nuevos; **sin cron
  nuevo** (la serie se propone y se confirma; nada se agenda solo en segundo plano).
- **Qué NO incluye:** los **catálogos concretos de protocolos e instrumentos** de cada especialidad (los aportan H6f, H6g y
  H6h); **cobros, saldos, paquetes prepagados, presupuestos y cuotas** (fuera de alcance del PRD); cualquier instrumento cuya
  licencia no esté verificada; las notas de sesión, la evaluación estructurada y las demás tablas de cada especialidad;
  alertas automáticas por respuestas o puntajes (reglas de salud mental y de emergencia: asesor legal, P-14); que el paciente
  vea o reserve sus sesiones desde el portal (el PRD excluye su acceso a la historia; reservarlas es una pregunta abierta);
  baremos por edad o sexo, ponderaciones estadísticas y puntajes estandarizados; texto libre dentro de un instrumento;
  recetas (H6c) y telemedicina, laboratorios, inventario, multi-sede y analítica de BI.
- **Preguntas abiertas obligatorias** (`design.md`, «Open Questions»): qué profesiones pueden crear planes (propuesta: las tres
  del PRD), si la inasistencia consume la sesión (propuesta: no), si las citas de sesiones cuentan en el 75 % del portal, y la
  verificación de licencias antes de cargar el primer instrumento.
