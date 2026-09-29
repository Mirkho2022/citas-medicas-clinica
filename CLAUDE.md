# CLAUDE.md

Sistema de Gestión de Citas e Historias Clínicas Electrónicas para una clínica en Perú.
Reemplaza el proceso actual (Excel + Google Forms para citas, papel para historias clínicas).

**Estado actual: existen [PRD.md](PRD.md), [TECH-DESIGN.md](TECH-DESIGN.md) y repositorio git
inicializado. Todavía no hay código de aplicación.**
Antes de escribir código, lee ambos: el PRD tiene el qué y el porqué, el Tech Design el cómo (junto
con los ADR en [adrs/](adrs/)). Este archivo resume las reglas que el código debe respetar, no las
sustituye.

## Stack (decidido)

Next.js 15 (App Router) + TypeScript sobre **Vercel** (target nativo, sin adaptador), con **Neon**
(PostgreSQL serverless) como base de datos, **Clerk** para autenticación/sesión/MFA y **Vercel
Blob** para adjuntos clínicos. Notificaciones **solo por email** vía Resend, disparadas por Vercel
Cron Jobs. Detalle completo y justificación en TECH-DESIGN.md y en los ADR 0020–0027 (reemplazan
el stack original sobre Cloudflare Workers + Supabase, registrado en ADR-0001, 0002, 0007 y 0009
como histórico).

No existe un equivalente directo a `service_role` de Supabase: el aislamiento de la credencial con
más alcance se hace por rol de Postgres (`cron_notificaciones`, `GRANT` mínimo solo sobre
`notificaciones`/`citas`), usado solo en los Route Handlers de cron y en CI — nunca en el código
que sirve tráfico de usuario. El contexto de usuario para RLS (rol, ID) ya no llega vía
`auth.jwt()`/`auth.uid()` de Supabase, sino por `SET LOCAL` a través de un único wrapper de acceso
a datos (ver [ADR-0023](adrs/0023-contexto-de-usuario-para-rls.md)) — ningún código debe consultar
Postgres sin pasar por ese wrapper.

## Decisiones aún abiertas (no las inventes: pregunta)

- **Marco legal peruano** de historia clínica electrónica (NTS del MINSA): plazo de retención,
  si la firma lógica basta o se exige firma electrónica certificada, y si es admisible alojar
  datos clínicos fuera de Perú. Pendiente de asesor legal. **Bloquea la puesta en producción del
  módulo de historias clínicas**, y si la respuesta exige datos en territorio peruano, reabre la
  decisión de hosting.

Las demás decisiones que estaban abiertas ya se resolvieron con el cliente y quedaron
formalizadas como ADR — no las reabras sin que el cliente lo pida:

- **Ventana de cancelación de 1 h**: aplica a **todos los roles**, incluido el administrativo
  ([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)).
- **Definición de "historia clínica digitalizada"**: híbrido — antecedentes y diagnósticos
  activos estructurados en el sistema, el resto del expediente en papel como escaneo de respaldo
  ([ADR-0013](adrs/0013-definicion-de-historia-clinica-digitalizada.md)).
- **Catálogo CIE-10**: catálogo completo, fuente MINSA/SUSALUD con la OMS como respaldo, cargado
  por migración de datos ([ADR-0014](adrs/0014-catalogo-cie-10.md)).

La lista completa (incluidos riesgos aceptados o excluidos a propósito, como P-6 y P-7) está en
"Riesgos técnicos abiertos" de TECH-DESIGN.md. Si una tarea depende de uno de estos puntos,
plantéalo y termina el resto del trabajo.

## Roles y permisos (invariante central del sistema)

| Rol | Puede |
|---|---|
| Administrativo | Agendar, reprogramar y cancelar citas de cualquier paciente |
| Médico | Ver sus turnos y citas confirmadas; registrar y consultar historias clínicas **solo de los pacientes a su cargo** |
| Enfermera | Consultar su turno y con qué médico/servicio trabaja. Acceso limitado: nada más |
| Paciente | Reservar y cancelar **su propia** cita vía portal de autoservicio. Sin acceso a historias clínicas ni a funciones administrativas |

El aislamiento de historias clínicas por médico a cargo debe aplicarse **en la base de datos**
(RLS), no solo en la capa de aplicación. La seguridad de las historias clínicas es el riesgo
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
- **Doctor de baja o emergencia**: los pacientes agendados con ese doctor se reasignan a otro
  médico; debe existir un flujo para ello.
- **Notificación**: recordatorio/confirmación automática al paciente **un día antes** de la cita.
- **Identificación del paciente**: DNI o Carné de Extranjería (documentos peruanos) — valida
  ambos formatos, no solo DNI.

## Alcance — no lo amplíes

Incluido: agendar/reprogramar/cancelar citas, portal de autoservicio del paciente, historias
clínicas electrónicas, notificaciones automáticas, dashboard operativo (vista de agenda y
estado), gestión de turnos de enfermería.

**Fuera de alcance de esta versión** (no lo construyas ni lo sugieras como parte del trabajo):
pagos y facturación en línea, telemedicina, integración con laboratorios o farmacias,
inventario de insumos, multi-sede, reportes/analítica de BI. El dashboard es una vista
operativa simple, no un módulo analítico.

## Métricas que definen el éxito (a 4-5 meses de uso)

- 75% de citas reservadas o canceladas por el propio paciente vía portal.
- 60% de historias clínicas digitalizadas.
- Tiempo de espera del paciente ≤ 20 minutos (hoy ~1 hora).

Al diseñar, favorece lo que mueve estas métricas: el portal de autoservicio debe ser lo
suficientemente simple para que un paciente lo use sin ayuda, y la carga de historias clínicas
debe ser rápida para el médico.

## Convenciones

- El PRD, la documentación y la UI están en **español**. Mantén ese idioma en textos de cara al
  usuario y mensajes de error.
- El PRD se genera y edita con la skill `generar-prd-conversacional` — si hay que actualizarlo,
  úsala en lugar de editarlo a mano.
- Las migraciones viven en `migrations/*.sql` (`node-pg-migrate`, ver
  [ADR-0027](adrs/0027-herramienta-de-migraciones.md)), versionadas en git y solo hacia adelante.
  Nunca cambios manuales en producción, y nunca restaurar el branch principal de Neon a un estado
  previo en producción: destruye datos clínicos.
- Toda tabla nueva en el esquema `public` nace con RLS activada y con su prueba pgTAP negativa
  (que el rol equivocado *no* ve el dato). Una tabla sin RLS aquí es una filtración de datos
  clínicos.
- Fechas y horas: siempre `timestamptz` en BD, siempre renderizadas en `America/Lima` en la UI.
- Para decisiones de arquitectura backend (límites de servicios, esquema de BD, contratos de
  API) existe el agente `backend-architect` en [.claude/agents/](.claude/agents/); úsalo solo si
  el usuario lo pide.
