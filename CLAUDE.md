# CLAUDE.md

Sistema de Gestión de Citas e Historias Clínicas Electrónicas para una clínica en Perú.
Reemplaza el proceso actual (Excel + Google Forms para citas, papel para historias clínicas).

**Estado actual: existen [PRD.md](docs/PRD.md), [TECH-DESIGN.md](docs/TECH-DESIGN.md), la aplicación base con
autenticación y roles (H1) y el esquema de base de datos con RLS, sus pruebas y los datos de demostración (H2,
ver [spike-rls-h2.md](docs/spike-rls-h2.md), [pruebas-sql.md](docs/pruebas-sql.md) y
[datos-demo.md](docs/datos-demo.md)). El resto de módulos (agenda, portal, notificaciones, historias clínicas,
turnos) llegan en H3–H8.**
Antes de escribir código, lee ambos: el PRD tiene el qué y el porqué, el Tech Design el cómo (junto
con los ADR en [docs/adrs/](docs/adrs/)). Este archivo resume las reglas que el código debe respetar, no las
sustituye.

## Stack (decidido)

Next.js 15 (App Router) + TypeScript sobre **Vercel** (target nativo, sin adaptador), con **Neon**
(PostgreSQL serverless) como base de datos, **Clerk** para autenticación/sesión/MFA y **Vercel
Blob** para adjuntos clínicos. Notificaciones **solo por email** vía Resend, disparadas por Vercel
Cron Jobs. Detalle completo y justificación en docs/TECH-DESIGN.md y en los ADR 0020–0028. Solo se
mantienen como ADRs activos los que describen el stack vigente — el diseño pasó antes por
Cloudflare Workers + Supabase; ese historial vive en `git log`, no en ADRs sueltos.

No existe un equivalente directo a `service_role` de Supabase: el aislamiento de la credencial con
más alcance se hace por rol de Postgres (`cron_notificaciones`, `GRANT` mínimo solo sobre
`notificaciones`/`citas`), usado solo en los Route Handlers de cron y en CI — nunca en el código
que sirve tráfico de usuario. El contexto de usuario para RLS (rol, ID) llega vía Neon RLS
Authorize (`pg_session_jwt` + JWT de Clerk, funciones `auth.user_id()`/`auth.session()` — ver
[ADR-0023](docs/adrs/0023-contexto-de-usuario-para-rls.md)) — ninguna consulta autenticada debe abrirse
sin el `authToken` de la sesión de Clerk adjunto.

## Decisiones aún abiertas (no las inventes: pregunta)

- **Marco legal peruano** de historia clínica electrónica (NTS del MINSA): plazo de retención,
  si la firma lógica basta o se exige firma electrónica certificada, y si es admisible alojar
  datos clínicos fuera de Perú. Pendiente de asesor legal. **Bloquea la puesta en producción del
  módulo de historias clínicas**, y si la respuesta exige datos en territorio peruano, reabre la
  decisión de hosting. Este bloqueo es sobre datos **reales** de pacientes: al ser un proyecto de muestra, se
  permiten datos **sintéticos** de demostración (script `scripts/sembrar-datos-demo.ts`, ver
  [datos-demo.md](docs/datos-demo.md)), nunca mezclados con datos reales.
- **Acreditación del sistema ante el MINSA y otros puntos legales nuevos** (PRD del 2026-10-11): acreditación del sistema de
  historia clínica electrónica (DS 009-2017-SA y Directiva 373-MINSA/OGTI-2025, plazos ampliados por la RM 188-2026-MINSA),
  registro del banco de datos ante la ANPD, reglas de salud mental (Psicología aparte y su copia al paciente) y qué
  profesiones pueden recetar. Hallazgos verificados y dudas para el asesor en
  [investigacion-marco-legal-y-saniape.md](docs/investigacion-marco-legal-y-saniape.md). Tampoco se deciden sin el asesor.
- **ADR propuestas por la actualización del PRD** (no están aceptadas: no las des por hechas):
  [ADR-0030](docs/adrs/0030-profesional-de-la-salud.md) (profesional de la salud),
  [ADR-0031](docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (Psicología aparte),
  [ADR-0032](docs/adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md) (pacientes sin cita),
  [ADR-0033](docs/adrs/0033-visita-del-paciente-llegada-y-estados.md) (visita del paciente),
  [ADR-0034](docs/adrs/0034-emision-de-la-copia-de-la-historia-clinica.md) (emisión de la copia) y
  [ADR-0035](docs/adrs/0035-recetas-funciones-acotadas-numeracion-y-medicamentos.md) (recetas).

Las demás decisiones que estaban abiertas ya se resolvieron con el cliente y quedaron
formalizadas como ADR — no las reabras sin que el cliente lo pida:

- **Ventana de cancelación de 1 h**: aplica a **todos los roles**, incluido el administrativo
  ([ADR-0012](docs/adrs/0012-alcance-de-la-ventana-de-cancelacion.md)).
- **Definición de "historia clínica digitalizada"**: híbrido — antecedentes y diagnósticos
  activos estructurados en el sistema, el resto del expediente en papel como escaneo de respaldo
  ([ADR-0013](docs/adrs/0013-definicion-de-historia-clinica-digitalizada.md)).
- **Catálogo CIE-10**: catálogo completo, fuente MINSA/SUSALUD con la OMS como respaldo, cargado
  por migración de datos ([ADR-0014](docs/adrs/0014-catalogo-cie-10.md)).

La lista completa (incluidos riesgos aceptados o excluidos a propósito, como P-6 y P-7) está en
"Riesgos técnicos abiertos" de docs/TECH-DESIGN.md. Si una tarea depende de uno de estos puntos,
plantéalo y termina el resto del trabajo.

## Roles y permisos (invariante central del sistema)

| Rol | Puede |
|---|---|
| Administrativo (recepción) | Registrar al paciente nuevo, con o sin cita, y abrir su historia clínica con la filiación de la NTS 139; agendar, reprogramar y cancelar citas de cualquier paciente; entregar la copia de la historia al paciente o a su representante tras verificar su identidad |
| Profesional de la salud (médico, odontólogo, fisioterapeuta, psicólogo, podólogo) | Ver sus turnos y citas confirmadas; registrar y consultar historias clínicas **solo de los pacientes a su cargo** (compartidas entre especialidades, **salvo la información de Psicología**, que solo ve el psicólogo a cargo); derivar a otra especialidad; emitir recetas solo si su profesión puede recetar |
| Enfermera | Registrar el triaje (signos vitales) y derivar al paciente a una especialidad; consultar su turno y con qué especialidad trabaja. **Sin acceso a historias clínicas** |
| Paciente | Reservar y cancelar **su propia** cita vía portal de autoservicio. Sin acceso a historias clínicas ni a funciones administrativas |

«Profesional de la salud» reemplaza a «Médico» en el PRD (2026-10-11). El rol técnico se renombra solo si se acepta la
[ADR-0030](docs/adrs/0030-profesional-de-la-salud.md); hasta entonces el esquema y el código vigentes siguen usando `medico`.

El aislamiento de historias clínicas por profesional a cargo debe aplicarse **en la base de datos**
(RLS), no solo en la capa de aplicación; la información de Psicología queda aparte incluso entre profesionales a cargo
([ADR-0031](docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md), propuesta). La seguridad de las historias clínicas es el riesgo
principal declarado del proyecto: cualquier cambio que toque acceso a historias clínicas merece
revisión explícita.

## Reglas de negocio que el código debe hacer cumplir

- **Doble reserva**: validar disponibilidad al agendar y bloquear el duplicado con el mensaje
  exacto `Registro de cita ya agendado`. La validación debe ser a prueba de concurrencia
  (constraint en BD, no solo chequeo previo en aplicación).
- **Cancelación tardía**: solo se permite cancelar hasta **1 hora antes** de la cita. Al
  reservar, mostrar la advertencia de esta restricción.
- **Historia clínica**: no se guarda con campos vacíos o datos inválidos. Los datos que vienen
  del registro del paciente son **de solo lectura** desde la historia clínica.
- **Profesional de baja o emergencia**: los pacientes agendados con ese profesional se reasignan a otro
  de la misma especialidad; debe existir un flujo para ello.
- **Notificación**: recordatorio/confirmación automática al paciente **un día antes** de la cita.
- **Identificación del paciente**: DNI o Carné de Extranjería (documentos peruanos) — valida
  ambos formatos, no solo DNI. La NTS 139 admite además pasaporte (extranjero en tránsito) y un número correlativo
  provisional (sin documento) hasta confirmar la identidad.
- **Apertura de la historia**: recepción registra al paciente nuevo, con o sin cita, y abre una historia única con el
  formato de filiación mínimo de la NTS 139; si el documento ya existe, no se abre otra.
- **Pacientes sin cita y derivación**: la enfermera hace el triaje y deriva a una **especialidad**; un profesional también
  puede derivar a otra especialidad. Derivar no da acceso a la historia por sí solo: un profesional de la especialidad
  «toma» al paciente ([ADR-0032](docs/adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md), propuesta).
- **Triaje**: presión arterial, frecuencia cardíaca, frecuencia respiratoria, temperatura, saturación de oxígeno, peso y
  talla (IMC calculado), visible para el profesional que atiende.
- **Recetas**: solo receta común impresa desde una plantilla, numerada y guardada como datos estructurados; una receta emitida
  no se edita (se anula y se emite otra). Sin receta electrónica ni especial, y sin alertas automáticas de interacción.
- **Psicología aparte**: resultados y notas de sesión solo los ven los psicólogos a cargo; los demás profesionales ven los
  medicamentos (que salen de las recetas). Se impone en la base de datos.
- **Copia de la historia** (NTS 139): se entrega al paciente o a su representante legal en 5 días como máximo, verificando la
  identidad del solicitante y registrando quién la emite; incluye la información de Psicología.

## Alcance — no lo amplíes

Incluido: agendar/reprogramar/cancelar citas, portal de autoservicio del paciente, atención de pacientes con y sin
cita (registro y apertura de la historia con filiación), triaje por enfermería y derivación entre especialidades,
historias clínicas electrónicas compartidas entre especialidades (Psicología aparte), recetas comunes impresas, copia de
la historia al paciente, las cinco especialidades completas entregadas juntas (Medicina general, Odontología,
Fisioterapia, Psicología y Podología), notificaciones automáticas, dashboard operativo (vista de agenda y estado),
gestión de turnos de enfermería.

**Fuera de alcance de esta versión** (no lo construyas ni lo sugieras como parte del trabajo):
pagos y facturación en línea (incluidos presupuestos y cuotas de tratamientos), telemedicina, integración con
laboratorios o farmacias, inventario de insumos, multi-sede, reportes/analítica de BI, receta electrónica y especial,
alertas automáticas de interacción de medicamentos, WhatsApp y SMS, dictado por voz e IA, la especialidad de Estética y
Capilar y el acceso del paciente a su historia desde el portal. El dashboard es una vista operativa simple, no un
módulo analítico.

## Métricas que definen el éxito (a 4-5 meses de uso)

- 75% de citas reservadas o canceladas por el propio paciente vía portal.
- 60% de historias clínicas digitalizadas.
- Tiempo de espera del paciente ≤ 20 minutos (hoy ~1 hora).
- 90 % o más de las recetas se emiten e imprimen desde el sistema.
- 90 % o más de las atenciones tienen el triaje registrado antes de la consulta, con y sin cita.
- 100 % de las solicitudes de copia de la historia se entregan en 5 días o menos.

(El 75 % se mide sobre citas: los pacientes sin cita no cuentan para ese porcentaje.)

Al diseñar, favorece lo que mueve estas métricas: el portal de autoservicio debe ser lo
suficientemente simple para que un paciente lo use sin ayuda, y la carga de historias clínicas
debe ser rápida para el profesional.

## Convenciones

- El PRD, la documentación y la UI están en **español**. Mantén ese idioma en textos de cara al
  usuario y mensajes de error.
- El PRD se genera y edita con la skill `generar-prd-conversacional` — si hay que actualizarlo,
  úsala en lugar de editarlo a mano.
- Los documentos de referencia (`PRD.md`, `TECH-DESIGN.md`, `adrs/`) viven en [docs/](docs/). Las
  skills (`generar-prd-conversacional`, `generar-tech-design`, `generar-backlog`, `auditar-drift`,
  `revision-adversarial`) asumen esos archivos en la raíz: al usarlas, indícales la ruta `docs/`.
- Las migraciones viven en `migrations/*.sql` (`node-pg-migrate`, ver
  [ADR-0027](docs/adrs/0027-herramienta-de-migraciones.md)), versionadas en git y solo hacia adelante.
  Nunca cambios manuales en producción, y nunca restaurar el branch principal de Neon a un estado
  previo en producción: destruye datos clínicos.
- Toda tabla nueva en el esquema `public` nace con RLS activada y con su prueba pgTAP negativa
  (que el rol equivocado *no* ve el dato). Una tabla sin RLS aquí es una filtración de datos
  clínicos.
- Fechas y horas: siempre `timestamptz` en BD, siempre renderizadas en `America/Lima` en la UI.
- Para decisiones de arquitectura backend (límites de servicios, esquema de BD, contratos de
  API) existe el agente `backend-architect` en [.claude/agents/](.claude/agents/); úsalo solo si
  el usuario lo pide.
