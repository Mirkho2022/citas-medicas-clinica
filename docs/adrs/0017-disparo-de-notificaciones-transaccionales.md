# ADR 0017: Disparo de notificaciones transaccionales y guarda de recordatorios vencidos

## Estado

Aceptado — a partir de un hallazgo de revisión adversarial del diseño sobre la decisión original de
canal y programación de notificaciones (ver `git log` — ese ADR ya no se mantiene como activo).

## Contexto

`notificaciones.tipo` incluye `'recordatorio_24h'`, `'confirmacion_reserva'` y `'cancelacion'`,
pero el «Flujo» descrito originalmente y en
[TECH-DESIGN.md](../TECH-DESIGN.md) solo detalla la programación de `recordatorio_24h`
(`programada_para = inicio - 1 día`, barrido por el cron diario de las 08:00). No queda
especificado cómo se disparan `confirmacion_reserva` y `cancelacion` — si dependieran del mismo
cron, un paciente podría esperar hasta una hora (cron horario de reintentos) o un día (cron
diario) por la confirmación de su propia reserva, lo que contradice el propósito de una
confirmación inmediata.

Relacionado: para una cita reservada con **menos de 24 horas** de anticipación,
`programada_para` (`inicio - 1 día`) queda en el pasado desde el momento de la inserción. El cron
diario la recoge como "pendiente vencida" sin distinguir si la cita ya ocurrió o es inminente — no
hay guarda que evite enviar un "recordatorio" de una cita que ya pasó.

## Decisión

- `confirmacion_reserva` y `cancelacion` se envían **síncronamente** desde la propia Server
  Action (`reservarCita`, `cancelarCita`, `reprogramarCita`) mediante una llamada directa a
  `lib/notificaciones/proveedor.ts`, inmediatamente después de que la operación sobre `citas` se
  confirma. Un fallo del envío **no revierte** la transacción de la cita — reservar o cancelar ya
  es válido independientemente de si el correo se entrega.
- Cada intento (síncrono o no) deja una fila en `notificaciones`, para mantener un solo lugar de
  historial y reutilizar la infraestructura de reintento que ya existe:
  - `recordatorio_24h`: se inserta como `pendiente` con `programada_para = inicio - 1 día` — sin
    cambios respecto al diseño original, la sigue enviando el cron diario.
  - `confirmacion_reserva` / `cancelacion`: se insertan **después** de intentar el envío síncrono,
    con `programada_para = now()` y el `estado` ya resuelto — `'enviada'` (con `proveedor_id`) si
    el envío tuvo éxito, o `'fallida'` (con `error`, `intentos = 1`) si no. Nunca se insertan como
    `'pendiente'`. Si quedan en `'fallida'`, el cron horario de reintentos ya existente las
    recoge automáticamente sin lógica adicional — mismo mecanismo que ADR-0008 define para
    cualquier notificación fallida.
- El cron diario que procesa `recordatorio_24h` agrega una condición: excluye (y marca
  `estado='fallida'` con `error='cita ya ocurrida, recordatorio omitido'`, sin llamar a Resend)
  cualquier notificación cuya cita asociada ya tenga `inicio <= now()`. Así, una reserva de último
  momento nunca dispara un "recordatorio" de una cita que ya pasó; si la cita todavía es futura
  pero `programada_para` ya venció por la cercanía de la reserva, el recordatorio se envía igual
  (tarde, pero útil).

```sql
-- Guarda del cron diario: nunca enviar un recordatorio de una cita que ya ocurrió.
select n.*
from public.notificaciones n
join public.citas c on c.id = n.cita_id
where n.tipo = 'recordatorio_24h'
  and n.estado = 'pendiente'
  and n.programada_para <= now()
  and c.inicio > now();          -- guarda: la cita todavía no ocurrió
```

## Consecuencias

- El paciente recibe la confirmación de su reserva y el aviso de cancelación de forma inmediata,
  no en el siguiente barrido de cron — cierra la ambigüedad que dejaba el diseño original.
- Un fallo de Resend en el envío síncrono no bloquea ni revierte la operación de negocio, y se
  recupera solo vía el mismo reintento horario que ya cubre `recordatorio_24h` — no se duplica
  lógica de reintento.
- **Trade-off:** el envío síncrono agrega la latencia de la llamada a Resend dentro del tiempo de
  respuesta de la Server Action (`reservarCita`, `cancelarCita`); si Resend responde lento, el
  usuario espera más por la confirmación en pantalla. Se acepta porque el objetivo de latencia
  (p95 < 500ms, ver «Requisitos no funcionales» en TECH-DESIGN.md) se mide sobre navegación de
  agenda y búsqueda de slots, no sobre la escritura de una reserva puntual.
