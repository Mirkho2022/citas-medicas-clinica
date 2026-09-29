# ADR 0007: Manejo de estado y sesión

## Estado

Aceptado

## Contexto

Con cuatro superficies (portal, panel administrativo, panel clínico, panel de turnos) sobre la
misma base de datos, hace falta definir dónde vive el estado de la aplicación (sesión, datos de
agenda, historias clínicas) y cómo se mantiene consistente, dado que ningún dato clínico debe
resolverse ni cachearse en el cliente.

## Decisión

El estado autoritativo vive en el servidor: Postgres (vía Supabase) es la única fuente de verdad
de citas, historias y turnos; no hay caché de datos clínicos en el cliente. La sesión se mantiene
por cookies mediante `@supabase/ssr`, usando siempre la clave anónima en el Worker de aplicación
(nunca `service_role`). Cada grupo de rutas (`(publico)`, `(paciente)`, `(personal)`) lleva un
`layout.tsx` que verifica el rol en servidor y redirige si no corresponde — como comprobación de
usabilidad, no de seguridad: la autoridad real de acceso a los datos es RLS
([ADR 0003](0003-control-de-acceso-a-historias-clinicas.md)), no esta redirección.

## Consecuencias

- No hay estado clínico duplicado que pueda desincronizarse entre pestañas, dispositivos o
  usuarios: cada carga de página o Server Action lee directamente de Postgres bajo RLS.
- Separar la comprobación de rol en el layout (usabilidad) de la política RLS (seguridad) evita
  que un bug en el layout se convierta en una filtración de datos: aunque el layout fallara en
  redirigir, RLS seguiría bloqueando la fila.
- **Trade-off:** al no cachear nada en cliente, cada navegación entre vistas de agenda o historia
  clínica implica una consulta de servidor; en redes lentas (parte del portal es uso móvil, ver
  «Requisitos no funcionales» en [TECH-DESIGN.md](../TECH-DESIGN.md)) esto se traduce en latencia
  percibida más alta que con un estado de cliente optimista, lo que pone presión sobre el objetivo
  de p95 < 500ms.

## Reemplazada

**(2026-09-28):** la sesión por cookies vía `@supabase/ssr` ya no aplica tras el cambio a Neon (sin
Auth propia). Reemplazada por [ADR-0022](0022-autenticacion-y-sesion-clerk.md) (sesión vía Clerk).
El principio de fondo de esta ADR — estado autoritativo en el servidor, RLS como autoridad real de
acceso y no la redirección del layout — no cambia.
