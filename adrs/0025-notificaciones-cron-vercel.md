# ADR 0025: Notificaciones: cron en Vercel Cron Jobs

## Estado

Aceptado — reemplaza la parte de programación de
[ADR-0009](0009-canal-y-programacion-de-notificaciones.md) (el canal — email vía Resend, aislado
tras `lib/notificaciones/proveedor.ts` — y el diseño de disparo transaccional de
[ADR-0017](0017-disparo-de-notificaciones-transaccionales.md) no cambian).

## Contexto

El diseño necesita dos frecuencias de cron distintas: diario a las 08:00 America/Lima
(`recordatorio_24h`) y horario (reintentos de notificaciones `fallida`, ver
[ADR-0008](0008-resiliencia-y-manejo-de-errores.md) y
[ADR-0017](0017-disparo-de-notificaciones-transaccionales.md)). Cloudflare Cron Triggers ya no
aplica; hace falta un mecanismo equivalente en Vercel.

## Decisión

**Vercel Cron Jobs**, plan Pro (el plan Hobby limita los cron jobs a una ejecución diaria, insuficiente
para el reintento horario), configurados en `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/recordatorios", "schedule": "0 13 * * *" },
    { "path": "/api/cron/reintentos",    "schedule": "0 * * * *" }
  ]
}
```

Ambos *Route Handlers* verifican el header `Authorization: Bearer $CRON_SECRET` que Vercel agrega
automáticamente a sus propias invocaciones de cron, para que nadie más pueda dispararlos llamando a
la URL directamente. Ambos usan el rol de Postgres `cron_notificaciones`
([ADR-0020](0020-arquitectura-de-componentes-y-hosting-vercel.md)), no el `app_user` sujeto a RLS
de paciente/médico, porque el cron necesita leer/escribir notificaciones y citas de cualquier
paciente sin estar autenticado como nadie en particular.

## Alternativas consideradas

- **Vercel Cron Jobs solo diario (plan Hobby) + reintentos por un scheduler externo** (ej. Upstash
  QStash) — evita pagar el plan Pro únicamente por el cron. Se descartó porque divide la
  programación entre dos sistemas de scheduling distintos, más piezas que coordinar y monitorear
  para un beneficio de costo menor frente al resto de la operación.
- **Upstash QStash (u otro scheduler externo) para ambas frecuencias** — un solo proveedor de
  scheduling, independiente del plan de Vercel contratado. Se descartó porque agrega otro
  vendor/cuenta externa solo para esta pieza, cuando Vercel Cron Jobs ya resuelve ambas frecuencias
  de forma nativa una vez que el plan Pro está contratado (necesario de todas formas para un
  despliegue de producción de este tamaño).

## Consecuencias

- El mecanismo de scheduling queda dentro del mismo proveedor que el resto del despliegue, sin
  cuenta externa adicional.
- La guarda contra recordatorios de citas ya ocurridas y el envío síncrono de confirmación/
  cancelación (ambos de [ADR-0017](0017-disparo-de-notificaciones-transaccionales.md)) no cambian
  — solo cambia qué motor dispara el barrido diario y el reintento horario.
- **Trade-off:** el proyecto queda condicionado a mantener el plan Pro (o superior) de Vercel
  específicamente por necesitar dos frecuencias de cron distintas — si en algún momento se
  evaluara bajar de plan por costo, el cron horario de reintentos sería lo primero en verse
  afectado.

## Reemplazada

**(2026-09-28):** el cliente confirmó que este proyecto es un MVP académico y no requiere plan de
pago de Vercel. Reemplazada por [ADR-0028](0028-notificaciones-cron-unico-plan-hobby.md) (un solo
cron diario, plan Hobby). Esta ADR queda documentada como la opción a retomar si el proyecto pasara
a producción real para la clínica.
