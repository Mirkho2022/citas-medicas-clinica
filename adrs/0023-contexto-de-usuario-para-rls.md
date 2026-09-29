# ADR 0023: Contexto de usuario para RLS: Neon RLS (Clerk)

## Estado

Aceptado — revisión del 2026-09-28. La primera versión de esta ADR proponía un mecanismo casero
(`SET LOCAL` vía un wrapper de aplicación); se reemplaza aquí por la integración nativa de Neon con
Clerk, tras confirmar por investigación que es compatible con el resto del stack ya elegido. La
lógica de negocio de [ADR-0003](0003-control-de-acceso-a-historias-clinicas.md) —
`medico_tiene_paciente()`, las políticas de `atenciones`, la vigencia de
[ADR-0016](0016-vigencia-de-asignacion-paciente-medico.md) — sigue vigente sin cambios; esta ADR
solo define cómo Postgres sabe quién está preguntando.

## Contexto

Todas las políticas RLS del diseño original leían `auth.jwt() ->> 'user_role'` y `auth.uid()` —
funciones que Supabase expone porque su capa PostgREST inyecta el JWT verificado en cada conexión.
Neon es Postgres puro y no las tiene. La primera versión de esta ADR resolvía esto con `SET LOCAL`
poblado por un wrapper de aplicación (`withUserContext()`) — funcional, pero código propio nunca
probado, exactamente en el punto de mayor criticidad de seguridad del proyecto.

Una revisión posterior (skill `architecture`, veredicto sobre el stack Neon/Vercel/Clerk) encontró
que **Neon tiene una integración nativa con Clerk para esto** ("Neon RLS Authorize", ahora parte de
"Neon Data API"): la extensión de Postgres `pg_session_jwt` valida el JWT de Clerk contra su JWKS
directamente en la base de datos, y expone `auth.user_id()`/`auth.session()` para usar en políticas
RLS — casi idéntico en espíritu a `auth.uid()`/`auth.jwt()` de Supabase. Se confirmó además que el
driver ya elegido en [ADR-0021](0021-base-de-datos-neon.md) (`@neondatabase/serverless`) soporta un
parámetro `authToken` diseñado exactamente para pasar este JWT.

## Decisión

**Neon RLS Authorize con Clerk como proveedor JWT**, vía la extensión `pg_session_jwt`.

Configuración (consola de Neon, una sola vez): `Settings → RLS Authorize` (o `Data API`) → agregar
Clerk pegando su JWKS URL. Esto crea automáticamente un rol de Postgres `authenticated` con acceso
sujeto a RLS, distinto del rol de migraciones.

```sql
create extension if not exists pg_session_jwt;
```

Las políticas RLS usan `auth.user_id()` (el `sub` del JWT de Clerk, texto) y `auth.session()`
(claims completos del JWT, para leer el rol de aplicación). Como `auth.user_id()` es el ID de
Clerk y no el `perfiles.id` interno (uuid) que el resto del esquema referencia, se agrega una capa
fina de funciones de resolución:

```sql
create or replace function public.perfil_actual()
returns uuid language sql stable security definer set search_path = ''
as $$ select pf.id from public.perfiles pf where pf.clerk_user_id = auth.user_id(); $$;

create or replace function public.paciente_actual()
returns uuid language sql stable security definer set search_path = ''
as $$ select p.id from public.pacientes p where p.perfil_id = public.perfil_actual(); $$;

create or replace function public.medico_actual()
returns uuid language sql stable security definer set search_path = ''
as $$ select m.id from public.medicos m where m.perfil_id = public.perfil_actual(); $$;
```

Cada Server Action/Route Handler obtiene un cliente de Postgres con el JWT de la sesión de Clerk
ya adjunto, sin construirlo a mano en cada sitio:

```ts
// lib/db/cliente-autenticado.ts
export async function clienteAutenticado() {
  const { getToken } = auth(); // Clerk
  const authToken = await getToken();
  return neon(process.env.DATABASE_AUTHENTICATED_URL!, { authToken });
}
```

A diferencia de la versión anterior de esta ADR, este helper es una conveniencia de código (evita
repetir `neon(url, { authToken })` en cada Server Action) — **no** es el límite de seguridad. La
verificación del JWT ocurre dentro de Postgres vía `pg_session_jwt` contra la JWKS de Clerk,
independientemente de si el código de aplicación arma bien el cliente o no. Si el helper tuviera un
bug, la consecuencia es una consulta sin `authToken` — Postgres la trata como no autenticada y RLS
la deniega, no un bypass.

## Alternativas consideradas

- **Mantener el wrapper `SET LOCAL` casero** (versión anterior de esta ADR) — es un mecanismo
  sólido y ya estaba diseñado con cuidado (fail-safe por defecto, wrapper único). Se descartó a
  favor de la opción nativa porque reemplaza código propio nunca probado, en el punto de mayor
  riesgo de seguridad del proyecto, por una extensión mantenida por el proveedor de la base de
  datos — y porque ya se confirmó que es compatible con el driver serverless ya elegido, sin costo
  adicional. Sigue siendo una alternativa razonable si el spike de validación (ver «Riesgos»)
  revela fricción real.
- **Roles nativos de Postgres por tipo de usuario** (`CREATE ROLE administrativo`, etc.) — mismo
  argumento de la versión anterior: no elimina la necesidad de resolver el usuario específico
  (`medico_tiene_paciente()` necesita saber qué médico, no solo que es médico), así que no aporta
  sobre lo que Neon RLS Authorize ya resuelve.

## Consecuencias

- El mecanismo de mayor criticidad de seguridad del proyecto pasa de ser código propio a una
  extensión mantenida por Neon — mismo beneficio que daba `auth.jwt()`/`auth.uid()` de Supabase.
- Todas las políticas RLS ya escritas cambian solo la función que leen (`auth.user_id()`/
  `auth.session()` en vez de `current_setting()`) — la lógica de negocio de cada política no se
  toca.
- **Trade-off (pruebas):** las pruebas pgTAP ya no pueden simular el contexto con un simple
  `set_config('app.current_user_id', ...)` — `pg_session_jwt` valida una firma real. Las pruebas
  necesitan un JWT de prueba firmado contra una JWKS de test registrada aparte en Neon (no la de
  Clerk de producción). El mecanismo exacto para inicializar la sesión con ese JWT dentro de un
  test pgTAP queda pendiente de confirmar en la documentación de `pg_session_jwt` al implementar
  H2 — es más trabajo de setup que el `set_config()` directo que tenía la versión anterior.
- **Trade-off (verificación pendiente):** esta ADR se escribe con la integración confirmada por
  documentación y por la compatibilidad declarada del driver, pero **sin una ejecución real
  todavía** — el spike preparado (Neon + Clerk + `@neondatabase/serverless` con datos reales) no se
  ha corrido aún. Si al ejecutarlo aparece fricción real (el nombre del producto ya cambió una vez,
  de "Neon Authorize" a "Neon Data API"), la alternativa del `SET LOCAL` casero queda documentada
  arriba como plan B, no hay que rediseñar desde cero.
- Se pierde algo de portabilidad: el esquema ahora depende de una extensión específica de Neon
  (`pg_session_jwt`), no solo de Postgres estándar — coherente con el resto del stack, que ya
  depende de features específicas de Neon (branching, PITR).
