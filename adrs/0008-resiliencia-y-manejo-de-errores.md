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
