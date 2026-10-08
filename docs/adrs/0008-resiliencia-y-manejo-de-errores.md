# ADR 0008: Resiliencia y manejo de errores

## Estado

Aceptado

## Contexto

El sistema depende de Postgres (constraints que pueden rechazar una operación por diseño, como la
`EXCLUDE` de doble reserva) y de un proveedor externo (Resend) para notificaciones, que puede
fallar transitoriamente. Hace falta definir qué ve el usuario cuando una regla de negocio rechaza
su operación, y qué pasa cuando el envío de un correo falla.

## Decisión

- Toda Server Action captura los `SQLSTATE` de Postgres esperables (`23P01` = doble reserva,
  `P0001` = cancelación tardía, `42501` = violación de inmutabilidad o de cambio de rol) y los
  traduce a un mensaje de negocio en español; nunca deja pasar la excepción cruda de Postgres al
  usuario.
- Las notificaciones fallidas quedan en `estado='fallida'` con contador de `intentos`; un segundo
  Cron Trigger horario reintenta las que tengan menos de 3 intentos, con backoff.
- Si al reasignar citas por baja médica no hay médico sustituto disponible, la cita queda marcada
  para contacto manual — el sistema nunca cancela una cita en silencio.

## Consecuencias

- El usuario siempre recibe un mensaje accionable en español, nunca un error interno de base de
  datos, lo que sostiene el requisito de que el portal sea usable sin ayuda.
- Un fallo transitorio de Resend (caída puntual, rate limit) se autocorrige sin intervención manual
  gracias al reintento con backoff, y la unicidad `(cita_id, tipo)` evita que un reintento duplique
  un envío ya exitoso.
- **Trade-off:** el mapeo de `SQLSTATE` a mensaje vive en cada Server Action que puede disparar esa
  excepción; si se agrega una nueva restricción en base de datos (un nuevo `CHECK` o `EXCLUDE`) y
  no se replica su mapeo en la Server Action correspondiente, el usuario vuelve a ver el error
  crudo de Postgres hasta que alguien lo note.

**Nota (2026-09-28):** la cadencia "horaria" del reintento de notificaciones fallidas queda
desactualizada para el alcance de MVP académico — pasa a ser diaria (mismo cron que envía los
recordatorios) para no requerir plan de pago de Vercel. Ver
[ADR-0028](0028-notificaciones-cron-unico-plan-hobby.md). La lógica de reintento en sí (contador
`intentos`, backoff, tope de 3 intentos) no cambia.

**Nota (2026-10-08, H2):** «doble reserva» corresponde a `23P01` **y** a `40P01` (`deadlock_detected`), que Postgres puede
devolver cuando varias reservas del mismo horario chocan a la vez; ambos se traducen al mismo mensaje de negocio. Ver
[ADR-0005](0005-modelo-de-datos-y-prevencion-de-doble-reserva.md) y [TECH-DESIGN.md](../TECH-DESIGN.md), «Doble reserva».
