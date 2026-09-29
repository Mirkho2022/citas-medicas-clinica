# ADR 0021: Base de datos: Neon

## Estado

Aceptado — reemplaza la parte de base de datos de
[ADR-0002](0002-base-de-datos-y-autenticacion.md), a partir de un cambio de stack decidido por el
cliente.

## Contexto

El cliente decidió cambiar de Supabase a Neon como proveedor de PostgreSQL. A diferencia de
Supabase, Neon es **solo** base de datos — no trae Auth ni Storage integrados (ver
[ADR-0022](0022-autenticacion-y-sesion-clerk.md) y
[ADR-0024](0024-almacenamiento-de-adjuntos-vercel-blob.md) para esas piezas por separado). Hace
falta confirmar que el motor sigue siendo compatible con todo lo que el diseño ya asume (RLS,
`EXCLUDE USING gist`, funciones `SECURITY DEFINER`, triggers), y decidir cómo la aplicación se
conecta desde funciones serverless de Vercel sin agotar conexiones.

## Decisión

**Neon** (PostgreSQL 15+, serverless, con branching y point-in-time recovery nativos) como base de
datos. Es Postgres estándar: `btree_gist`, `pgcrypto`, `citext`, RLS, `EXCLUDE USING gist`,
triggers y funciones `SECURITY DEFINER` — todo lo que el modelo de datos ya usa sigue funcionando
sin cambios en esa parte del diseño.

- **Conexión:** driver serverless de Neon (`@neondatabase/serverless`, HTTP o WebSocket) desde
  Route Handlers y Server Actions — evita el agotamiento de conexiones típico de invocar Postgres
  desde funciones serverless de vida corta, sin tener que operar un pooler externo.
- **Staging:** un branch de Neon por entorno de *preview* de Vercel (análogo a los branches de
  Supabase que reemplaza) — se crea/destruye junto con el deployment de preview.
- **Backups:** point-in-time recovery de Neon, con retención mínima de 7 días — mismo objetivo que
  tenía el diseño original con Supabase.

## Alternativas consideradas

- **Cliente `pg` estándar + pooler integrado de Neon (PgBouncer)** — más portable a otro proveedor
  de Postgres si hiciera falta migrar de nuevo, pero requiere configurar y monitorear el pool
  explícitamente para no agotar conexiones bajo los picos de tráfico serverless que el portal de
  pacientes puede generar. Se descartó porque el driver serverless de Neon resuelve el mismo
  problema sin esa carga operativa adicional, a cambio de un acoplamiento algo mayor a Neon
  específicamente.

## Consecuencias

- Todo el modelo de datos, las políticas RLS (con el mecanismo de contexto que reemplaza
  [ADR-0023](0023-contexto-de-usuario-para-rls.md)) y las restricciones `EXCLUDE` de doble reserva
  se mantienen sin cambios — Neon no impone ninguna limitación nueva sobre las features de Postgres
  que el diseño ya usa.
- El branching de Neon para *staging* es más rápido de crear/destruir que los branches de Supabase
  que reemplaza, lo que favorece un pipeline de CI con un branch efímero por PR
  ([ADR-0027](0027-herramienta-de-migraciones.md)).
- **Trade-off:** se pierde el "custom access token hook" y las funciones `auth.jwt()`/`auth.uid()`
  que Supabase daba integradas — el mecanismo para que las políticas RLS sepan quién está
  consultando ya no viene resuelto por el proveedor de base de datos, hay que construirlo
  explícitamente (ver [ADR-0023](0023-contexto-de-usuario-para-rls.md)).
