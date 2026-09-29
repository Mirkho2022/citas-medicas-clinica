# ADR 0002: Base de datos y autenticación

## Estado

Aceptado

## Contexto

El riesgo principal declarado del proyecto (PRD, "Supuestos y riesgos abiertos") es la seguridad
de las historias clínicas. El PRD exige explícitamente que el aislamiento de historias por médico
a cargo se implemente "mediante RLS (Row Level Security)" — es decir, ya viene resuelto a nivel de
mecanismo, no solo de resultado. Se necesita una base de datos con RLS nativo, autenticación
integrada y almacenamiento de adjuntos, sin construir cada pieza por separado con un equipo de una
persona.

## Decisión

**Supabase** (PostgreSQL 15+, Auth, Storage) como base de datos, autenticación y almacenamiento de
adjuntos clínicos.

## Reemplazada

**(2026-09-28):** el cliente decidió cambiar de Supabase a Neon. Esta ADR queda como registro
histórico de la decisión original; las decisiones vigentes están separadas por pieza:
[ADR-0021](0021-base-de-datos-neon.md) (base de datos), [ADR-0022](0022-autenticacion-y-sesion-clerk.md)
(autenticación) y [ADR-0024](0024-almacenamiento-de-adjuntos-vercel-blob.md) (almacenamiento) — Neon,
a diferencia de Supabase, no agrupa las tres en un solo proveedor.

## Alternativas consideradas

*(agregado retroactivamente el 2026-09-23, a partir de un hallazgo de revisión adversarial: esta
ADR no dejaba registro de qué otras opciones se evaluaron)*

- **Postgres autoalojado + autenticación propia (ej. Auth.js) y RLS manual** — da control total
  sobre dónde residen físicamente los datos, lo cual es directamente relevante para el riesgo P-1
  (si la norma peruana exige territorio nacional). Se descartó como opción por defecto porque
  implica construir desde cero MFA, gestión de sesión, backups con PITR y el propio mecanismo de
  RLS que Supabase entrega listo — con un equipo reducido y 4-5 meses de plazo, ese trabajo de
  infraestructura compite directamente con el tiempo disponible para las reglas de negocio del
  PRD. Queda como la alternativa concreta a reconsiderar si P-1 se resuelve exigiendo datos en
  Perú (ver Trade-off más abajo).
- **Firebase (Firestore + Auth)** — autenticación y hosting gestionados igual de rápidos de
  adoptar. Se descartó porque Firestore no tiene control de acceso a nivel de fila relacional
  equivalente a RLS de Postgres — el PRD exige explícitamente "RLS (Row Level Security)" para el
  aislamiento de historias clínicas, y construir ese aislamiento en la capa de aplicación sobre
  Firestore es exactamente lo que [CLAUDE.md](../CLAUDE.md) prohíbe para datos clínicos.

## Consecuencias

- RLS de PostgreSQL es exactamente el mecanismo que el PRD pide para aislar historias clínicas; no
  hay que reconstruirlo a mano ni confiar en una capa de aplicación.
- Auth, Storage, backups gestionados (PITR) y branches de base de datos para staging reducen el
  alcance de construcción propio, lo que importa con equipo reducido y plazo de 4-5 meses.
- **Trade-off:** acopla el proyecto al modelo de RLS y auth de Supabase; migrar de proveedor más
  adelante implicaría reescribir políticas, funciones `security definer` y el custom access token
  hook. Y si el marco legal peruano (riesgo P-1 en TECH-DESIGN.md) exige que los datos clínicos
  residan en territorio peruano, esta decisión se reabre — Supabase aloja por defecto fuera de
  Perú.
