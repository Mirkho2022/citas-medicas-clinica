# Proposal

## Why

Este change es **H2** del "Plan de implementación sugerido" de TECH-DESIGN.md (esquema completo +
RLS + suite pgTAP; depende de H1, ya cerrado). Hoy la base de Neon no tiene ninguna tabla: H1 dejó
la autenticación, los cuatro roles y el CI, y difirió a este hito todo lo que necesita tablas con
RLS. Sin el esquema no se puede construir agenda (H3), portal (H4), notificaciones (H5), historias
clínicas (H6) ni turnos de enfermería (H7).

**Este change toca RLS y el aislamiento de historias clínicas, el riesgo principal declarado del
proyecto, y merece revisión explícita aparte.** Además, el mecanismo que lleva la identidad del
usuario hasta las políticas RLS (Neon RLS Authorize: `pg_session_jwt` + JWT de Clerk,
[ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md)) se decidió solo por
documentación y **nunca se ha ejecutado**: ni la extensión, ni el rol `authenticated`, ni
`clienteAutenticado()` existen en el repositorio, y las pruebas pgTAP no tienen aún una receta
confirmada para inyectar un JWT firmado. Por eso la primera tarea es un spike que lo valide antes
de escribir el esquema grande.

## What Changes

- **Spike de validación de ADR-0023 (primera tarea, con punto de parada).** Tabla mínima con RLS;
  activar `pg_session_jwt`; registrar la JWKS de Clerk en Neon; comprobar que una consulta con
  `authToken` ve los datos y una sin él no ve nada; comprobar qué claim del JWT de Clerk lleva el
  rol; y montar en pgTAP un JWT de prueba firmado contra una JWKS de test, confirmando en la
  documentación de `pg_session_jwt` el nombre y la forma exactos de la función de inicialización
  de sesión (no se inventa). **Si el spike falla, se detiene el change y se consulta al
  usuario**: el plan B (`SET LOCAL` casero) reabre ADR-0023 y no se adopta por cuenta propia.
- **Esquema completo** como migraciones nuevas en `migrations/*.sql` ([ADR-0027](../../../docs/adrs/0027-herramienta-de-migraciones.md)),
  según el modelo de datos de TECH-DESIGN: extensiones y tipos; identidad (`perfiles`,
  `pacientes`, `especialidades`, `medicos`, `enfermeras`); agenda (`disponibilidades`,
  `bloqueos_agenda`, `citas` con las dos restricciones `EXCLUDE`); historias clínicas
  (`historias_clinicas`, `atenciones`, `addendas`, `asignaciones_paciente_medico`,
  `antecedentes`, `cie10`); `turnos_enfermeria`; `notificaciones`, `auditoria` y
  `accesos_historia`.
- **Reglas de negocio ancladas en la base de datos**: doble reserva por `EXCLUDE` (médico y
  paciente), `validar_cancelacion()` ([ADR-0012](../../../docs/adrs/0012-alcance-de-la-ventana-de-cancelacion.md)),
  inmutabilidad de atenciones firmadas, `extender_asignacion_por_cita()` ([ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md))
  y `bloquear_cambio_de_rol()`; `CHECK` de formato DNI/Carné de Extranjería y de campos clínicos
  no vacíos.
- **RLS activada en todas las tablas de `public`** con sus políticas por rol, las funciones de
  apoyo (`perfil_actual()`, `paciente_actual()`, `medico_actual()`, `medico_tiene_paciente()`) y
  **una prueba pgTAP negativa por tabla** (el rol equivocado no ve el dato), más las pruebas de
  los criterios transversales de «Control de acceso a historias clínicas».
- **Roles de Postgres**: el rol sujeto a RLS para tráfico de usuario, `cron_notificaciones`
  (`GRANT` mínimo solo sobre `notificaciones`/`citas`) y `sync_identidad` (`GRANT` solo sobre
  `perfiles`), con pruebas de que el cron no puede leer contenido clínico.
- **Helper `clienteAutenticado()`** (`lib/db/cliente-autenticado.ts`), que adjunta el `authToken`
  de la sesión de Clerk a la conexión (conveniencia de código, no el límite de seguridad).
- **Webhook de Clerk extendido**: además de fijar el rol `paciente` (H1), el webhook crea y
  actualiza la fila de `perfiles`, como se anticipó en el design de H1.
- **CI**: el workflow de branch efímero de Neon corre la suite pgTAP después de `migrate up`.
- **Datos de demostración (mock).** Al ser un proyecto de muestra, se siembran datos
  **sintéticos** con un script aparte (no una migración) para poder probar el sistema con roles,
  citas e historias de ejemplo; marcadores `mock_` y `@demo.invalid`, idempotente y con
  confirmación explícita (`design.md`, D10).
- **Coherencia entre documentos.** Las correcciones al SQL y a los ADR se acompañan de un barrido
  entre PRD, TECH-DESIGN, ADR, CLAUDE.md y `openspec/config.yaml` para que cuenten la misma historia
  (invariantes repetidos, roles de Postgres, referencias obsoletas a Supabase/Cloudflare).
- **Alcance de las políticas.** TECH-DESIGN solo trae SQL de políticas para 5 de las ~17 tablas. Se
  aplican esas tal cual; para el resto se derivan únicamente las **lecturas** evidentes de la
  matriz de roles y todo lo demás queda denegado hasta que el hito que construye el flujo añada su
  política con su prueba negativa. Las lecturas derivadas son supuestos conservadores marcados
  para revisión humana (ver `design.md`, D3).
- **Correcciones al SQL de TECH-DESIGN detectadas al diseñar** (`design.md`, D6): el trigger
  `bloquear_cambio_de_rol()` bloquearía al propio webhook de sincronización, `validar_cancelacion()`
  necesita `security definer` para que la excepción por baja médica no dependa del rol, y la
  auditoría de escritura filtraría contenido clínico al administrativo si copiara las filas.
- **Correcciones de documentación por deriva detectada** (sin cambiar decisiones): el SQL de
  ADR-0015 todavía usa `auth.jwt()`/`auth.uid()` de Supabase y un claim `user_role`; se
  alinea con ADR-0023 una vez confirmada en el spike la ruta real del claim del rol.

**Fuera de alcance:** interfaz de usuario; lógica de agenda y cálculo de slots (H3);
registro y vinculación del paciente por documento (H4); notificaciones y cron (H5);
formularios y firma de historias clínicas (H6); turnos y dashboard (H7); carga del catálogo
CIE-10 completo y migración de datos reales (H6/H8). Las tablas de historias clínicas se crean y
se protegen aquí, pero **no pueden recibir datos clínicos reales hasta resolver la decisión legal
P-1** (NTS del MINSA: retención, firma lógica vs. certificada y hosting fuera de Perú). Los datos
sintéticos de demostración sí se permiten; no hay ni habrá datos reales en este hito.

## Capabilities

### New Capabilities

- `aislamiento-por-rol-rls`: qué rol puede leer y escribir cada tabla, con el caso negativo de
  cada una; aislamiento de historias clínicas por médico a cargo con vigencia; el cron y la
  sincronización de identidad con privilegios mínimos; bloqueo de la escalada de privilegios.
- `integridad-de-agenda`: doble reserva imposible a nivel de motor (mensaje `Registro de cita ya
  agendado` queda en la capa de aplicación), ventana de cancelación de 1 h para todos los roles
  con la excepción por baja médica, y bloqueos de agenda sin traslape.
- `integridad-historia-clinica`: atenciones sin campos vacíos, inmutables una vez firmadas
  (corrección solo por addenda), datos demográficos fuera de la atención, antecedentes que no se
  sobrescriben y asignación paciente-médico con vigencia automática.
- `identidad-de-personas`: perfil interno sincronizado desde Clerk con rol fijado solo por vías
  autorizadas, y validación de DNI y Carné de Extranjería como documentos del paciente.

### Modified Capabilities

_(ninguna — `autenticacion-roles` no cambia sus requisitos; el webhook ya cumple el autorregistro
como `paciente`, aquí solo se le suma la sincronización de `perfiles`)_

## Impact

- **Código nuevo:** `migrations/*.sql`; `tests/pgtap/*.test.sql`; `lib/db/cliente-autenticado.ts`;
  extensión de `app/api/webhooks/clerk/route.ts`; ajuste del workflow `neon-branch-pr.yml` y
  posiblemente de `ci.yml` para correr pgTAP.
- **Infraestructura:** Neon (extensión `pg_session_jwt`, rol `authenticated`, JWKS de Clerk y una
  JWKS de test, extensión `pgtap`, roles `cron_notificaciones` y `sync_identidad`); Clerk (claim
  del rol en el JWT, eventos `user.updated` del webhook); nuevas variables de entorno
  (`DATABASE_AUTHENTICATED_URL` y las de los roles dedicados).
- **Documentación:** ADR-0015 (SQL desactualizado) y, si el spike lo exige, aclaración de la
  relación entre `authenticated` y `app_user` en ADR-0020; cualquier cambio de decisión de fondo
  pasa por revisión humana, no se hace en silencio.
- **Riesgos:** el éxito del change depende del spike (ver arriba); el plan Free de Neon ya limitó
  los branches `schema-only` (412 en el PR #3), lo que afecta a los branches efímeros que corren
  pgTAP.
