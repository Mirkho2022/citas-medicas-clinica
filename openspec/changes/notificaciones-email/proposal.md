# Proposal

## Why

El PRD promete que el paciente reciba un recordatorio y una confirmación automáticos **un día antes** de su cita, y el
proyecto lo sostiene con dos metas: bajar los cruces y las ausencias y llegar al 75 % de citas gestionadas por el propio
paciente. Hoy H2 dejó la tabla `notificaciones` y el rol `cron_notificaciones` con su `GRANT` mínimo, pero **nada
programa, envía ni reintenta un correo**. H3 (agenda y reserva) crea las citas; sin H5 el paciente no se entera de nada.

Al leer los documentos contra el esquema real aparecen tres huecos que hay que cerrar para que el recordatorio funcione de
verdad (detalle y alternativas en `design.md`):

1. **«Un día antes» no se cumple con la regla escrita.** TECH-DESIGN y ADR-0017 fijan `programada_para = inicio - 1 día` y
   ADR-0028 deja un único cron diario a las 08:00 de Lima. Con ambas, una cita de mañana a las 15:00 tiene
   `programada_para` hoy a las 15:00, el cron de hoy a las 08:00 todavía no la ve y el de mañana a las 08:00 la envía **7 horas
   antes**: el recordatorio llega el mismo día, no el anterior. Ocurre con toda cita posterior a las 08:00.
2. **Nadie con permiso puede escribir la fila.** TECH-DESIGN dice que la Server Action inserta el recordatorio y registra
   la confirmación y la cancelación, pero H2 solo concede a `authenticated` la lectura del administrativo sobre
   `notificaciones`, y el rol del cron no puede usarse en el código que sirve tráfico de usuario. Falta un camino acotado.
3. **El cron no puede armar el correo.** Su rol solo lee `citas` y `notificaciones`; no lee `pacientes`, `medicos` ni
   `perfiles`, así que no puede resolver el nombre del paciente, el médico ni la especialidad que el recordatorio lleva.

## What Changes

- **Recordatorio un día antes (H5):** al crearse una cita vigente, un disparador de base de datos deja una fila
  `recordatorio_24h` programada para las **08:00 de Lima del día calendario anterior** a la cita, con una copia mínima de los
  datos logísticos del aviso. El cron diario la envía por Resend.
- **Envío por Resend detrás de una interfaz de proveedor** (`lib/notificaciones/proveedor.ts`, ADR-0017): implementación de
  Resend y un proveedor simulado. Sin clave y sin modo explícito se usa el simulado, de modo que ninguna prueba ni preview
  envía correo real.
- **Cron único y diario** (`GET /api/cron/notificaciones`, ADR-0028) protegido con `CRON_SECRET`, que envía los
  recordatorios vencidos y reintenta las fallidas con tope de 3 intentos, **idempotente también bajo ejecución simultánea**
  (reserva de cada fila antes de enviarla) y con reintento clasificado en transitorio o permanente.
- **Credencial mínima:** el cron se conecta con `DATABASE_CRON_URL` (rol `cron_notificaciones`), una conexión que solo se
  puede importar desde el cron (regla de lint y prueba). Su alcance no crece: la migración no le concede nada nuevo.
- **Avisos transaccionales (ADR-0017):** confirmación de reserva, cancelación y reprogramación se envían en la propia
  Server Action después de confirmar la operación; un fallo no la revierte. El resultado se registra con una función de
  base de datos acotada (`registrar_aviso_transaccional`), que sustituye al `INSERT` directo que `authenticated` no tiene.
- **Tipo nuevo `reprogramacion`** (pregunta que H2 dejó a H5, ADR-0011): un solo correo cuando una cita se mueve o se
  reasigna por baja, en lugar de una cancelación y una confirmación sueltas.
- **Qué pasa si la cita cambia antes del envío:** cada tipo de aviso tiene una condición de vigencia (cita activa y futura
  para recordatorio y confirmación; cancelada y futura para cancelación y reprogramación). Lo que no la cumple se omite sin
  llamar a Resend, con el motivo registrado.
- **Contenido:** plantillas en español (`es-PE`) con trato de usted, fechas en `America/Lima`, el aviso de la ventana de
  cancelación de 1 hora y **ningún dato clínico** (tampoco el motivo de la cita, que es texto libre).
- **Visibilidad de fallidas (ADR-0018):** vista de solo lectura para el administrativo con las notificaciones de 3 o más
  intentos fallidos.
- **Cambios de esquema (migraciones nuevas, nada editado):** columnas `contenido` y `ultimo_intento_en`; tipo
  `reprogramacion` en el `CHECK`; disparador `AFTER INSERT` sobre `citas` (programa el recordatorio) y `AFTER UPDATE OF
  email` sobre `pacientes` (rehabilita avisos al corregir el correo); funciones internas `armar_contenido_aviso` y
  `programar_recordatorio_de_cita`, la función de decisión `motivo_de_omision` (solo para el rol del cron, sin leer tablas)
  y `registrar_aviso_transaccional` (la única que `authenticated` ejecuta). Ninguna tabla nueva y ningún `GRANT` nuevo de
  escritura sobre `notificaciones`.
- **Pruebas sin correo real:** proveedor simulado inyectable, pruebas de integración del cron con el rol real en una
  transacción que se revierte, prueba de concurrencia y pgTAP (positivas y negativas). La entregabilidad real se revisa a
  mano en el panel de Resend (riesgo P-7), con una lista de comprobación y sin automatizarla.
- **Alcance tras el PRD del 2026-10-11 (sin cambios de comportamiento).** Siguen siendo solo correo: WhatsApp y SMS quedan fuera
  de alcance por decisión del usuario, y el riesgo P-7 (entregabilidad del correo) se conserva tal cual, con su vía de
  reactivación de otros canales a través de la interfaz de proveedor ya prevista. **Ninguna notificación nueva:** ni las visitas,
  ni las recetas ni las copias de la historia envían avisos. Pregunta abierta de `especialidad-psicologia` (U9): si el recordatorio
  de una cita de Psicología puede nombrar la especialidad (hoy el correo la incluye); ver `design.md`, D17.
- **Fuera de alcance:** WhatsApp/SMS (decisión del usuario; solo queda la interfaz de proveedor ya prevista), correos al médico o a la
  enfermera, reenvío manual desde la interfaz (ADR-0018), analítica de apertura, reprogramación automática de recordatorios
  y cualquier contenido clínico.

## Capabilities

### New Capabilities
- `recordatorio-de-cita`: cuándo se programa el recordatorio «un día antes», qué se guarda, cuándo se omite y cómo
  responde a una cita cancelada, reprogramada, reasignada o reservada con poca anticipación.
- `avisos-transaccionales-de-cita`: confirmación de reserva, cancelación y reprogramación enviadas en la operación, su
  registro con una función acotada y el reintento posterior si fallaron.
- `proceso-programado-de-notificaciones`: el cron: autenticación con `CRON_SECRET`, credencial de Postgres de alcance
  mínimo, idempotencia, reintentos con tope, errores permanentes y transitorios, modo del proveedor y comprobaciones
  operativas.
- `contenido-de-correos`: plantillas, datos permitidos y prohibidos, trato de usted, formato de fechas, advertencia de
  cancelación y entregabilidad.
- `revision-de-notificaciones-fallidas`: vista del administrativo (ADR-0018) y aislamiento de `notificaciones` frente a los
  demás roles.

### Modified Capabilities
<!-- Ninguna. `autenticacion-roles` no cambia. El requisito «Notificaciones visibles solo al administrativo, y cron con
privilegio mínimo» vive en el change `esquema-rls-pgtap` (aún no archivado, no existe en openspec/specs/); este change lo
respeta y lo amplía con requisitos propios en vez de modificarlo. -->

## Impact

- **Hito:** H5 de TECH-DESIGN («Notificaciones por email + cron», depende de H3). Usa además la base visual de H2b
  (`sistema-de-diseno-ui`) para la vista de fallidas; si H2b no está aplicada, la vista usa marcado simple y se alinea después.
- **Riesgo principal (RLS y datos de paciente):** el change **crea y modifica objetos de seguridad**: un disparador y dos
  funciones `SECURITY DEFINER` que leen `pacientes`, `medicos`, `perfiles` y `especialidades`, y una función invocable por
  `authenticated` que escribe `notificaciones`. **No toca historias clínicas**: ninguna función lee `atenciones`,
  `antecedentes`, `addendas`, `historias_clinicas` ni `asignaciones_paciente_medico` (tampoco `visitas`, `triajes`, `derivaciones`, `recetas` ni `solicitudes_copia_historia`, que llegan después), y el contenido del aviso excluye
  `citas.motivo`. Aun así, por tocar RLS y privilegios, merece revisión explícita aparte (agente `code-review`) y cada objeto
  nuevo trae su prueba pgTAP negativa.
- **Decisión legal (P-1):** no depende de ella. Sin datos clínicos en el correo ni en el cron, H5 puede llegar a
  producción sin esperar a H6. Sí hay datos personales de identidad (nombre y correo del paciente) que viajan a Resend; se
  menciona junto con la consulta legal ya abierta sobre Clerk (nota 2026-09-28 de P-1) y no la bloquea.
- **ADR:** implementa [ADR-0017](../../../docs/adrs/0017-disparo-de-notificaciones-transaccionales.md),
  [ADR-0018](../../../docs/adrs/0018-visibilidad-de-notificaciones-fallidas.md),
  [ADR-0028](../../../docs/adrs/0028-notificaciones-cron-unico-plan-hobby.md) y
  [ADR-0020](../../../docs/adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md); toca
  [ADR-0008](../../../docs/adrs/0008-resiliencia-y-manejo-de-errores.md) (reintento) y
  [ADR-0011](../../../docs/adrs/0011-reasignacion-de-citas-por-baja-medica.md) (aviso de reprogramación). **Dos puntos
  rozan lo ya decidido y no se resuelven aquí:** (a) la regla de `programada_para` (08:00 del día anterior en vez de
  `inicio - 1 día`) y (b) escribir `notificaciones` con un disparador y una función en lugar de un `INSERT` de la Server
  Action. Ninguno cambia una garantía (idempotencia, credencial mínima, envío síncrono); se proponen como una ADR nueva (el 0029 ya lo ocupa «datos clínicos por especialidad») y notas
  fechadas en ADR-0017 y TECH-DESIGN, para revisión humana (grupo 10 de `tasks.md`). No se reabre ningún ADR en silencio.
- **Código nuevo:** `lib/notificaciones/` (proveedor, plantillas, avisos, cron), `lib/db/cliente-cron.ts`,
  `app/api/cron/notificaciones/route.ts`, `app/administrativo/notificaciones/page.tsx`, `vercel.json`, `migrations/` (3
  archivos nuevos), `tests/` (pgTAP, integración, concurrencia), `docs/pasos-manuales-h5.md`.
- **Código existente que se toca:** las Server Actions de reserva, cancelación, reprogramación y reasignación de H3/H4 (una
  llamada tras confirmar la operación), `eslint.config.mjs` (restricción de imports), `.env.example` y el pgTAP
  `51_notificaciones.test.sql` (el disparador ya crea el recordatorio que esa prueba insertaba a mano).
- **Dependencias nuevas:** `resend`, `@react-email/components` solo si se decide usarlo (por defecto, HTML en cadenas
  tipadas sin dependencia extra), `date-fns` y `date-fns-tz` si H2b aún no los instaló. Todas con autorización explícita del
  usuario antes de instalar.
- **Configuración fuera del repositorio:** variables `CRON_SECRET`, `RESEND_API_KEY`, `NOTIFICACIONES_PROVEEDOR`,
  `NOTIFICACIONES_REMITENTE`, `APP_URL` y `DATABASE_CRON_URL` en Vercel (Production), `LOGIN` y contraseña de
  `cron_notificaciones` y dominio verificado en Resend (SPF, DKIM, DMARC); pasos en `docs/pasos-manuales-h5.md`.
- **Supuestos sobre H3:** estados y eventos que debe exponer, en `design.md` (D13).
- **Nombres (ADR-0030):** el disparador y las funciones `armar_contenido_aviso` y `programar_recordatorio_de_cita` leen `medicos`
  (y `perfiles`, `especialidades`), y la prueba 3.3 vigila que no lean `asignaciones_paciente_medico`; con
  `profesionales-de-la-salud` (H2c) pasan a `profesionales` y `asignaciones_paciente_profesional`. Este change conserva `medico`
  (ver `design.md`, D17).
