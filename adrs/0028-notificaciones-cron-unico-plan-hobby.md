# ADR 0028: Notificaciones: un solo cron diario (plan Hobby)

## Estado

Aceptado — a partir de una corrección de alcance del cliente: el proyecto es un MVP académico, no
un despliegue de producción para la clínica, y no debe requerir un plan de pago de Vercel.

## Contexto

Un diseño anterior (ver `git log` — ese ADR ya no se mantiene como activo) exigía plan Pro de
Vercel específicamente porque necesitaba dos frecuencias de cron (diaria a las 08:00 para
recordatorios, horaria para reintentos) — el plan Hobby limita los *cron jobs* a una ejecución
diaria. Para un MVP de clase, esa exigencia de plan de pago no es proporcional al alcance real del
proyecto.

## Decisión

Un único Vercel Cron Job diario (`0 13 * * *` UTC, 08:00 America/Lima), compatible con el plan
Hobby, que ejecuta ambas tareas en el mismo Route Handler:

```json
{
  "crons": [
    { "path": "/api/cron/notificaciones", "schedule": "0 13 * * *" }
  ]
}
```

```ts
// app/api/cron/notificaciones/route.ts
export async function GET(request: Request) {
  verificarCronSecret(request); // Authorization: Bearer $CRON_SECRET

  await enviarRecordatorios24h();   // pendientes vencidas, con guarda de ADR-0017
  await reintentarFallidas();       // estado='fallida', intentos < 3, con backoff

  return new Response('ok');
}
```

Sigue usando el rol de Postgres `cron_notificaciones`
([ADR-0020](0020-arquitectura-de-componentes-y-hosting-vercel.md)) y el resto del diseño de
[ADR-0017](0017-disparo-de-notificaciones-transaccionales.md) (envío síncrono de confirmación/
cancelación, guarda contra recordatorios vencidos) no cambia.

## Alternativas consideradas

- **Mantener las dos frecuencias con un scheduler externo gratuito** (ej. Upstash QStash, que
  tiene un nivel gratuito) en vez de pagar Vercel Pro — se descartó por desproporcionado para un
  MVP de clase: agrega una cuenta/proveedor más (con su propia curva de configuración) solo para
  conservar una cadencia de reintento que, a esta escala, no aporta un beneficio observable frente
  a un reintento diario.
- **Plan Pro de Vercel de todas formas** — la opción del diseño anterior. Se descartó porque el
  cliente confirmó explícitamente que no necesita ni quiere una cuenta de pago para este proyecto.

## Consecuencias

- El proyecto corre enteramente en niveles gratuitos de Vercel — sin costo de infraestructura para
  el MVP.
- **Trade-off:** el reintento de una notificación fallida pasa de cadencia horaria a diaria — si el
  primer envío de Resend falla, el paciente puede esperar hasta ~24h (en vez de ~1h) para el
  reintento automático. Aceptable para un MVP de clase; si este proyecto pasara a producción real
  para la clínica, este es exactamente el punto a reconsiderar junto con el plan Pro.
- La descripción de "reintento horario" en [ADR-0008](0008-resiliencia-y-manejo-de-errores.md)
  queda desactualizada para el alcance de MVP — la lógica de reintento (contador `intentos`,
  backoff, tope de 3 intentos) no cambia, solo la frecuencia con la que se ejecuta.
