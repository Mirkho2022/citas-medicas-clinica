# ADR 0018: Visibilidad operativa de notificaciones fallidas

## Estado

Aceptado — a partir de un hallazgo de revisión adversarial del diseño sobre
[ADR-0008](0008-resiliencia-y-manejo-de-errores.md).

## Contexto

[ADR-0008](0008-resiliencia-y-manejo-de-errores.md) y los criterios de aceptación de
[TECH-DESIGN.md](../TECH-DESIGN.md) prometen que una notificación que supera 3 reintentos "queda
visible para revisión manual". Ni las rutas de «Superficie de la aplicación» ni los bullets del
«Dashboard operativo» exponen esa información — tal como está especificado, la única forma de
verla sería consultando la base de datos directamente, lo que hace el criterio de aceptación no
verificable contra la aplicación real.

## Decisión

Agregar una vista dentro del panel administrativo, `app/(personal)/dashboard/notificaciones/`,
que lista las notificaciones con `estado='fallida'` e `intentos >= 3`, ordenadas por antigüedad,
con el nombre/documento del paciente, el tipo y el error registrado. Sin acción de reintento
automático desde la UI en esta versión — es una vista de revisión, no un panel de reenvío; el
reenvío manual, si se decide, es un problema de soporte fuera del alcance de esta versión.

La tabla `notificaciones` no tenía política RLS definida. Se agrega, restringida a
administrativo (igual que el resto de operaciones administrativas de agenda):

```sql
alter table notificaciones enable row level security;

create policy "administrativo lee notificaciones"
on notificaciones for select to authenticated
using ((select auth.session() ->> 'rol') = 'administrativo');

-- Ningún otro rol tiene política de lectura. Los Route Handlers de cron usan el rol
-- de Postgres cron_notificaciones (ver ADR-0020), con GRANT directo sobre esta tabla —
-- no pasan por RLS porque no son un usuario autenticado de la aplicación.
```

## Consecuencias

- El criterio de aceptación "queda visible para revisión manual" ahora tiene una ruta concreta que
  lo cumple, verificable en un test E2E.
- El administrativo tiene un lugar único para detectar recordatorios o confirmaciones que no
  llegaron, en vez de depender de que un paciente llame para avisar que no recibió nada.
- **Trade-off:** es una vista de solo lectura sin acción de reintento manual — si el volumen de
  fallidas crece (por ejemplo, si el riesgo P-7 de TECH-DESIGN se materializa y la tasa de rebote
  de un dominio es alta), el administrativo puede ver el problema pero no resolverlo desde la UI;
  la única vía de recuperación sigue siendo el reintento automático horario ya existente
  (ADR-0008).
