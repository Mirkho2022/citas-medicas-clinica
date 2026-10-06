# ADR 0027: Herramienta de migraciones: node-pg-migrate

## Estado

Aceptado — reemplaza el flujo de migraciones vía Supabase CLI mencionado en TECH-DESIGN.md y
[CLAUDE.md](../../CLAUDE.md), a partir de un cambio de stack decidido por el cliente.

## Contexto

`supabase/migrations/*.sql` aplicado con `supabase db push`/`supabase db reset` ya no aplica sin
Supabase. El esquema depende fuertemente de SQL avanzado de Postgres que no es genérico entre
herramientas: `EXCLUDE USING gist`, funciones `SECURITY DEFINER`, triggers, políticas RLS con
subconsultas envueltas para forzar `InitPlan`. Hace falta una herramienta de migraciones para Neon
que no obligue a re-expresar esas piezas en un DSL que no las modele.

## Decisión

**`node-pg-migrate`**: migraciones SQL puro (archivos `up`/`down`) en `migrations/`, sin opiniones
de ORM. Se conserva la regla ya establecida en CLAUDE.md — migraciones versionadas en git, solo
hacia adelante, nunca cambios manuales en producción.

- **CI (por PR):** crear un branch efímero de Neon para el PR, aplicar las migraciones pendientes
  con `node-pg-migrate up`, correr la suite pgTAP y Playwright contra ese branch, y destruirlo al
  cerrar el PR.
- **Merge a `main`:** aplicar migraciones al branch principal de Neon (`node-pg-migrate up`) seguido
  del deploy de Vercel.

## Alternativas consideradas

- **Drizzle ORM + Drizzle Kit** — *schema-as-code* en TypeScript con migraciones SQL generadas,
  buena integración oficial con el driver serverless de Neon y con el `strict: true` del resto del
  stack. Viable y genuinamente competitiva: las migraciones generadas siguen siendo SQL editable a
  mano para lo que Drizzle no modela (RLS, triggers). Se descartó en favor de `node-pg-migrate` por
  continuidad más directa con la convención ya establecida (SQL versionado sin capa intermedia),
  dado que este proyecto no necesita un *query builder* — casi toda la lógica ya vive en SQL
  (funciones, triggers, RLS), no en código de aplicación que se beneficiaría de un ORM.
- **Prisma Migrate** — el más popular y con mejor ecosistema. Se descartó porque no modela RLS ni
  triggers dentro de `schema.prisma` — esas piezas, que son justamente el núcleo de seguridad de
  historias clínicas, quedarían como SQL paralelo fuera de Prisma: dos mecanismos de migración a
  mantener sincronizados en vez de uno, con riesgo real de que diverjan sin que nada lo detecte.

## Consecuencias

- Continuidad casi total con la convención ya establecida en CLAUDE.md (SQL versionado, solo hacia
  adelante) — el cambio de proveedor no obliga a re-pensar cómo se escriben las migraciones, solo
  con qué CLI se aplican.
- Un branch de Neon efímero por PR da un entorno de prueba real (no un mock) para pgTAP y
  Playwright, igual que daban los branches de Supabase.
- **Trade-off:** sin capa de ORM, no hay generación automática de tipos TypeScript a partir del
  esquema — los tipos de las filas de cada tabla se mantienen a mano (o con un generador de tipos
  aparte a partir del esquema de Postgres), una tarea más que un ORM como Drizzle habría resuelto
  de forma incidental.
