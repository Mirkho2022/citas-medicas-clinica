# ADR 0009: Canal y programación de notificaciones

## Estado

Aceptado

## Contexto

El PRD exige un recordatorio/confirmación automático al paciente un día antes de la cita, y deja
explícitamente abierto el canal exacto (email, SMS, WhatsApp). Hace falta elegir un canal para
esta versión y un mecanismo de programación que no requiera infraestructura adicional a la ya
elegida (Cloudflare + Supabase).

## Decisión

**Email vía Resend** como único canal de esta versión, aislado tras la interfaz
`lib/notificaciones/proveedor.ts` para poder añadir otro canal después sin rediseñar. La
programación corre en **Cloudflare Cron Triggers**: al crear una cita se inserta una fila en
`notificaciones` con `programada_para = inicio - 1 día`; un cron diario a las 08:00
America/Lima envía las pendientes vencidas, y un cron horario reintenta las fallidas. La unicidad
`(cita_id, tipo)` garantiza que el paciente nunca reciba el mismo aviso duplicado.

## Consecuencias

- El cron vive junto al Worker sin infraestructura adicional (sin cola externa, sin servidor de
  jobs), lo que reduce el alcance de construcción con equipo reducido.
- Aislar el envío tras una interfaz de proveedor permite responder al riesgo P-7 (dependencia de
  un único canal) agregando WhatsApp o SMS más adelante sin tocar el resto del flujo de
  notificaciones.
- **Trade-off:** email es el único canal — si la tasa de apertura de correo del paciente es baja
  (buzón que no revisa, filtro de spam), el recordatorio no cumple su función y el objetivo del
  75% de autogestión del portal se ve afectado sin que el sistema lo detecte por sí solo. Mitigado
  parcialmente por exigir dominio propio con SPF/DKIM/DMARC verificado, pero no elimina el riesgo
  de que el paciente simplemente no lea el correo.

## Reemplazada (parcialmente)

**(2026-09-28):** Cloudflare Cron Triggers ya no aplica tras el cambio de despliegue a Vercel —
reemplazado por [ADR-0025](0025-notificaciones-cron-vercel.md) (Vercel Cron Jobs). El canal (email
vía Resend, tras `lib/notificaciones/proveedor.ts`) y el disparo transaccional de
[ADR-0017](0017-disparo-de-notificaciones-transaccionales.md) no cambian — solo el motor que
ejecuta el barrido diario y el reintento horario.
