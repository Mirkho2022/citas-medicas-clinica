# Proposal

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_actual()` y `profesional_tiene_paciente()`; si la ADR se
> rechaza, léase `medico`, `medicos`, `medico_actual()` y `medico_tiene_paciente()` (y la regla «solo un podólogo» pasa a
> leerse de la profesión que la ADR deje en su lugar).

## Why

El PRD del 2026-10-11 incluye **Podología** entre las cinco especialidades «completas» que se entregan juntas, y la define con
cuatro funciones: evaluación de pie, uñas, piel y pisada; plan de controles; protocolos por sesiones; y fotos de evolución.
Hoy `atenciones` es una nota genérica (motivo, anamnesis, examen físico, diagnósticos, plan) y no tiene dónde guardar una
evaluación podológica; tampoco existe un catálogo de protocolos ni forma de comparar cómo evoluciona un pie entre un control y
el siguiente. [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (aceptada) ya dejó el mecanismo —plantillas
versionadas y `datos_especialidad` validados en la base—, y el change `mecanismos-clinicos-comunes` (H6i) aporta los planes de
sesiones. Este change es el hito **H6h**: lo que Podología pone encima de ellos, con los mismos patrones que
`especialidad-odontologia` (H6e).

La seguridad de las historias (el riesgo principal) manda que la evaluación la escriba **solo** un podólogo y la lea **todo**
profesional que tiene al paciente a cargo, impuesto en la base de datos; y la métrica de carga rápida del profesional manda que
un control no exija llenar una evaluación completa.

## What Changes

**Este change toca acceso a historias clínicas y RLS (el riesgo principal del proyecto): crea tablas clínicas nuevas, un
disparador sobre `atenciones` que decide cuándo puede firmarse la evaluación (quién usa la plantilla lo decide `exige_profesion`, D15 de
`historias-clinicas`), y una lectura comparativa de
contenido clínico. Requiere revisión aparte con el agente `code-review` (hay una tarea de revisión al final de cada grupo que lo
toca y una final sobre todo el diff: `tasks.md`) y verificación por mutación de sus pruebas negativas.**

- **Evaluación podológica en `datos_especialidad`.** Una plantilla «Podología» versión 1 (migración de datos, sin tabla nueva
  para la evaluación) con 34 claves de pie, uñas (los diez dedos), piel y pisada, por lado. Solo `momento` (evaluación inicial o
  control) y el recuento de fotos son obligatorios mientras la atención es un borrador; **al firmar, la evaluación inicial exige
  los demás campos**, regla que impone un disparador propio porque el validador genérico no tiene campos condicionales. Los
  campos son una **propuesta que los podólogos deben validar** (`REVISAR`). La evaluación entra en la huella `v1` de la atención,
  queda inmutable al firmar y se corrige con una addenda.
- **Solo un podólogo la escribe; todo profesional a cargo la lee.** La plantilla de Podología v1 lleva `exige_profesion = 'podologo'` y la
  regla común de `historias-clinicas` (D15, dentro de su validador, `HC005`) rechaza que el autor de una atención con esa plantilla no sea
  un podólogo (la profesión sale de `profesionales.profesion`, nunca del cliente); este change no crea un disparador propio para ello. La lectura es la de `atenciones` (todo profesional a cargo, auditada);
  enfermera, administrativo y paciente no la leen.
- **Plan de controles y protocolos por sesiones.** Usan los **planes de sesiones** de H6i (con su contador de sesiones
  restantes) sin redefinirlos: la clave del protocolo va en `protocolo_clave`, su nombre en `descripcion`, y el total (1 a 60) y la
  frecuencia (1 a 90 días) respetan los límites de H6i. Podología aporta el catálogo **`protocolos_podologia`**, gestionado por migración, de lectura para
  los profesionales y sin escritura para nadie, con **cuatro protocolos y ninguno más**: hongos (6 sesiones cada 15 días),
  verruga plantar (4 sesiones semanales), ortonixia (3 controles) y pie diabético (controles mensuales). Salen de la web de una
  referencia comercial y **no están validados**: van marcados `REVISAR` y `por_validar`, con una puerta de revisión que impide que
  una base en modo `real` los conserve sin validar. No se inventan totales ni frecuencias que la fuente no da: el podólogo los
  indica al abrir el plan.
- **Fotos de evolución.** Tabla hija de la atención **`fotos_evolucion`**: el registro clínico de cada foto (lado, zona, dedo,
  etapa, nota, confirmación del consentimiento, hora del servidor) sobre un **adjunto de `adjuntos_historia`**, con sello propio
  porque la huella `v1` no cubre tablas hijas (recuento declarado dentro de la huella de la atención más una huella por fila).
  Editable en el borrador, inmutable al firmar; se escribe solo por un podólogo sobre una atención propia. **Hoy se vincula a un
  PDF**: admitir imágenes es la decisión abierta **P-15**; este change no diseña el almacenamiento y solo la vista de imágenes
  lado a lado queda bloqueada hasta que se decida.
- **Comparación de la evolución.** Una vista que alinea, campo a campo, las últimas evaluaciones **firmadas** del paciente
  (cinco como propuesta) marcando con texto e icono lo que cambió, y agrupa las fotos de una misma serie (lado, zona, dedo) de la
  primera a la última. **No** calcula puntajes, no clasifica mejoría o empeoramiento y no avisa: muestra y el profesional decide.
  Cada lectura queda en `accesos_historia` en la misma transacción (sin tipos nuevos).
- **Copia y auditoría.** Las tablas nuevas se clasifican en el compilado de la copia de la historia (H6d): `fotos_evolucion` aporta
  su sección con `copia_seccion_podologia()` (sin `EXECUTE` para ningún rol de usuario); `protocolos_podologia` figura como
  exclusión razonada (catálogo sin datos del paciente). La auditoría de escritura usa `registrar_auditoria_sin_contenido()` (H6b).
- **Recetas: no se diseñan aquí.** Si un podólogo puede recetar es una pregunta abierta (H6c lo deja en «no, sin confirmar»).

## Capabilities

### New Capabilities

- `evaluacion-podologica`: la plantilla de Podología (pie, uñas, piel y pisada), su validación, la evaluación inicial completa al
  firmar, quién la escribe y quién la lee, inmutabilidad al firmar, estabilidad de las claves entre versiones y su presencia en la
  copia de la historia.
- `protocolos-y-controles-podologicos`: el catálogo de protocolos por migración (cuatro, por validar), su acceso, la puerta de
  revisión del modo real, la apertura de un plan de controles o de un protocolo sobre los planes de sesiones y la visibilidad del
  plan.
- `fotos-de-evolucion`: el registro clínico de las fotos de la atención sobre un adjunto, quién las escribe y lee, el
  consentimiento, el sello al firmar, la auditoría y la copia. El formato de las imágenes depende de P-15.
- `comparacion-de-evolucion`: la vista que compara evaluaciones y fotos en el tiempo, sin interpretación, con acceso auditado.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/` (solo existe `autenticacion-roles`). Este change añade un disparador sobre `atenciones`, que
pertenece a `historias-clinicas` (aún no archivado), y fija el dato `exige_profesion` de su plantilla: no hay delta posible; se coordina en la tarea 0.7 y se declara en design.md,
D3 y D6. No se añade ningún valor a `tipo_acceso` de `accesos_historia`. -->

## Impact

- **Hito:** **H6h** (el orden fino lo fija `docs/BACKLOG.md`). **Depende de** H6 `historias-clinicas` (atenciones, plantillas
  clínicas, asignaciones, `accesos_historia`, `adjuntos_historia`, guarda de modo de datos y módulo único de acceso clínico), de
  H2c `profesionales-de-la-salud` (`profesion_actual()`, `profesionales.profesion`, rol `profesional`), de **H6i**
  `mecanismos-clinicos-comunes` (planes de sesiones; escrito y validado el 2026-10-12; este change lo usa por su interfaz, contrastada en `design.md` D4) y, **solo para la vista de
  imágenes lado a lado, de la decisión P-15**. Se apoya en H6b (`registrar_auditoria_sin_contenido()`), en H6d (compilado de la
  copia: cada tabla clínica nueva se clasifica) y sigue los patrones de H6e. Para las pantallas depende además de H2b
  (`sistema-de-diseno-ui`). No depende de H6c: **no emite ni modifica recetas**.
- **RLS y acceso a historias clínicas (revisión aparte):** tablas nuevas `protocolos_podologia` (catálogo; nadie escribe, lo leen
  los profesionales) y `fotos_evolucion` (lee todo profesional a cargo; escribe solo un podólogo con el paciente a cargo, sobre una
  atención propia sin firmar); un disparador en `atenciones` (`HC082`, `HC084`); una función de la sección de la copia.
  Casos negativos por rol (administrativo, profesional a cargo, otro profesional, enfermera, paciente, sin rol, `anonymous`,
  `cron_notificaciones`, `sync_identidad`) **y por profesión** (médico, odontólogo, fisioterapeuta, psicólogo): pruebas pgTAP
  **79** (sugerida, en dos archivos).
- **Decisión legal P-1 y marco de salud mental: no las resuelve ni las presupone.** La evaluación y las fotos son contenido
  clínico: **este change no puede pasar a producción con datos reales** hasta cerrar P-1; se apoya en la guarda de modo de H6
  (`exigir_paciente_admisible()` en `fotos_evolucion`, `exigir_modo_clinico()` en cada operación). No declara que ninguna
  plantilla, protocolo ni consentimiento cumpla una norma: **no se verificó ninguna norma de podología** ni la que rige la
  fotografía del paciente (queda para el asesor).
- **ADR:** aplica [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (aceptada) y respeta
  [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) y [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)
  (propuestas; Podología **no** es información restringida). **No requiere una ADR propia.** Sí requiere que quien resuelva P-15
  amplíe [ADR-0024](../../../docs/adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md) y D7 de `historias-clinicas` antes de la
  tarea 6.5.
- **Código nuevo:** `migrations/*.sql` (plantilla y disparadores; catálogo de protocolos; fotos; sellado de fotos; sección de la
  copia); `lib/podologia/` (grupos, evaluación inicial, comparación pura, protocolos, errores, repositorio),
  `lib/historias/podologia.ts` (lecturas con su registro de acceso), `lib/schemas/podologia.ts`;
  `app/profesional/pacientes/[pacienteId]/podologia/**`; `components/clinica/podologia/` (matriz de evolución, par de fotos,
  selector de protocolo, insignia «Por validar»); `tests/pgtap/79_podologia_rls.test.sql` y `79_podologia_reglas.test.sql`,
  `tests/concurrencia/` (sugerido 31), `tests/podologia/`, `e2e/podologia*.spec.ts`.
- **Base de datos:** tablas nuevas `protocolos_podologia` y `fotos_evolucion` (RLS y prueba pgTAP negativa cada una); filas nuevas
  en `plantillas_clinicas` (y en `especialidades`, si falta Podología); dos funciones y un disparador sobre `atenciones`, los
  disparadores propios de `fotos_evolucion` y `copia_seccion_podologia()`; SQLSTATE `HC080` a `HC084` (`HC085` a `HC089`
  reservados). **No se crea ninguna tabla para la evaluación ni para los planes, ni se amplía `accesos_historia`.**
- **Dependencias nuevas:** ninguna. **Infraestructura:** ninguna variable de entorno ni rol de Postgres nuevos.
- **Qué NO incluye (decisión del usuario o fuera de alcance):** recetas y la respuesta a si un podólogo puede recetar (H6c); el
  almacenamiento de imágenes y su decisión (P-15); los planes de sesiones y su contador (H6i); pagos, cobros, presupuestos y cuotas
  de tratamientos; inventario de insumos u órtesis; dictado por voz e IA; alertas automáticas, puntajes o clasificación de valores
  clínicos; analítica de BI; lesiones localizadas con seguimiento propio; acceso del paciente a su historia o a sus fotos desde el
  portal; la especialidad de Estética y Capilar.
- **Preguntas abiertas obligatorias (no se resuelven aquí):** imágenes (P-15); si un podólogo puede recetar; validación de los
  campos de la plantilla y de los cuatro protocolos con los podólogos; consentimiento para fotografiar y retención de las fotos
  (asesor legal); regla común de compatibilidad profesión–especialidad. Ver `design.md`, «Open Questions».
