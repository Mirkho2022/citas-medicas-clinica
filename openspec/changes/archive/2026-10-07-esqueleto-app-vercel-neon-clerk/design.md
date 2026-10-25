# Design

## Context

Ver `proposal.md` - Why. Este documento cubre el cómo de H1: un esqueleto desplegable con
autenticación y roles, sin ningún esquema de base de datos todavía. Decisiones de stack ya
tomadas y no reabiertas aquí: Next.js 15/Vercel ([ADR-0020](../../../../docs/03-arquitectura/adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)),
Neon ([ADR-0021](../../../../docs/03-arquitectura/adrs/0021-base-de-datos-neon.md)), Clerk
([ADR-0022](../../../../docs/03-arquitectura/adrs/0022-autenticacion-y-sesion-clerk.md)), Neon RLS Authorize
([ADR-0023](../../../../docs/03-arquitectura/adrs/0023-contexto-de-usuario-para-rls.md)), `node-pg-migrate`
([ADR-0027](../../../../docs/03-arquitectura/adrs/0027-herramienta-de-migraciones.md)). El pipeline de CI ya está descrito
en TECH-DESIGN.md ("Entornos, CI/CD y pruebas"): GitHub Actions, PR → typecheck → lint → tests →
branch efímero de Neon → `node-pg-migrate up` + pgTAP → Playwright contra el preview de Vercel →
destruir el branch; merge a `main` → migrar → deploy.

## Goals / Non-Goals

**Goals:**
- Un despliegue real y accesible en Vercel, con Next.js 15 App Router y TypeScript.
- Autenticación funcional con Clerk y los 4 roles reconocibles en la sesión (capability
  `autenticacion-roles`).
- Pipeline de CI corriendo en cada PR, con la mecánica de branch efímero de Neon +
  `node-pg-migrate` ya cableada aunque todavía no haya migraciones reales que aplicar.

**Non-Goals:**
- Ningún esquema de base de datos, tabla, política RLS o función `SECURITY DEFINER` — eso es H2.
- Ninguna pantalla real de los módulos de negocio (agenda, historias clínicas, notificaciones,
  turnos) — los grupos de ruta por rol solo tienen una página de destino mínima (placeholder).
- Ninguna UI de gestión de personal (listar/editar/dar de baja) — solo el mecanismo de invitación
  mínimo necesario para crear cuentas de prueba de cada rol.

## Decisions

**El webhook `user.created` de Clerk, en H1, solo fija el rol en Clerk — no escribe en
Postgres.** ADR-0022 describe una tabla `perfiles` sincronizada por webhook, pero esa tabla nace
en H2 ("esquema completo"). Construirla ahora violaría el alcance de H1 (sin tablas de negocio).
Se opta por: en H1 el webhook llama a la API de Clerk para fijar `publicMetadata.rol = 'paciente'`
inmediatamente después de un alta pública, sin tocar Postgres. Cuando H2 cree `perfiles`, el mismo
webhook se extiende para además insertar/actualizar la fila correspondiente — no se rediseña el
mecanismo, se completa. Alternativa descartada: adelantar la tabla `perfiles` a H1 — se descarta
porque acopla este change a decisiones de esquema (tipos, constraints) que TECH-DESIGN asigna
explícitamente a H2.

**La configuración de Neon RLS Authorize (extensión `pg_session_jwt`, rol `authenticated`) se
difiere a H2, no se hace en H1.** Es una configuración de consola que solo tiene efecto sobre
tablas con RLS, y ninguna existe todavía; configurarla ahora no se puede probar end-to-end y
quedaría sin validar hasta H2 de todas formas. El helper `clienteAutenticado()` de ADR-0023
tampoco se escribe en H1 por la misma razón. La conexión a Neon en H1 se limita a un chequeo de
salud (`SELECT 1`) con una única variable `DATABASE_URL`, sin distinguir todavía entre el rol
`app_user` y `cron_notificaciones` de ADR-0020 (esa separación de roles de Postgres tampoco tiene
sentido sin tablas que proteger).

**Protección de las áreas por rol: a nivel de recurso (`await auth.protect()` en cada página),
no vía middleware con `createRouteMatcher`.** Clerk deprecó ese patrón explícitamente: el
path-matching en middleware puede divergir de cómo el framework resuelve las rutas, y ya produjo
un CVE real ([GHSA-vqx2-fgx2-5wq9](https://github.com/clerk/javascript/security/advisories/GHSA-vqx2-fgx2-5wq9))
más varios bypasses de middleware a nivel de framework divulgados en 2025 — exactamente el tipo
de falla que CLAUDE.md pide tratar con más cuidado al tocar control de acceso. Cada página de rol
(`/administrativo`, `/medico`, `/enfermera`, `/paciente`) llama `auth.protect()` en su propio
Server Component; el middleware vuelve a ser `clerkMiddleware()` sin lógica de autorización. Se
agrega `@clerk/eslint-plugin` (regla `require-auth-protection`, versión fijada por ser
experimental) con `protected: ['**']` y las rutas públicas explícitas (`/`, `/iniciar-sesion`,
`/registro`, `/api/salud`) para que cualquier página nueva sin protección falle el lint en vez de
quedar expuesta en silencio.

**Redirección por rol es UX, no control de acceso** — consistente con ADR-0022 ("no es
seguridad, la autoridad real sigue siendo RLS"). En H1 esto es literal: no hay ningún dato
sensible detrás de los placeholders por rol, así que la ausencia de una autoridad de datos real
(RLS) no es una brecha en este change — pasa a serlo recién en H2, donde si es obligatorio sin
excepción.

**CI en H1 ya incluye el paso de branch efímero de Neon + `node-pg-migrate up`, aunque no haya
migraciones que aplicar.** Alternativa descartada: posponer ese paso del pipeline hasta H2, para
no pagar el costo de configurarlo dos veces. Se descarta porque H2 lo va a necesitar de inmediato
y es más barato depurar la mecánica del pipeline (credenciales de la API de Neon, creación/destrucción
del branch) contra cero migraciones que hacerlo a la vez que se valida el primer esquema real.

## Risks / Trade-offs

- [Riesgo] El webhook de Clerk en H1 no deja registro en Postgres de las altas de usuario →
  Mitigación: aceptable para un esqueleto; Clerk es la fuente de verdad de identidad hasta que
  `perfiles` exista en H2.
- [Riesgo] Configurar branches efímeros de Neon en CI antes de tener migraciones reales que
  probar → Mitigación: decisión deliberada (ver Decisions); el costo de depuración es menor ahora
  que junto con el primer esquema.
- [Riesgo] Clerk aloja datos personales (nombre, email, teléfono) de pacientes peruanos fuera de
  Perú → Ya aceptado como trade-off en ADR-0022; no es un riesgo nuevo introducido por este change.

## Migration Plan

No hay datos de producción que migrar (proyecto sin código previo). Pasos de puesta en marcha:

1. Crear el proyecto en Vercel enlazado al repositorio; variables de entorno de Clerk (claves
   pública/secreta) y `DATABASE_URL` de Neon.
2. Crear el proyecto en Neon (sin tablas) para desarrollo/staging/producción según la tabla de
   entornos de TECH-DESIGN.md.
3. Crear la aplicación de Clerk: JWT template que exponga `publicMetadata.rol`, webhook
   `user.created` apuntando al Route Handler del proyecto, invitaciones habilitadas para personal.
4. Configurar el workflow de GitHub Actions (typecheck, lint, build, branch efímero de Neon +
   `node-pg-migrate up`) y los secretos que necesita (API key de Neon, credenciales de Clerk de
   test si aplican a Playwright).

**Rollback:** sin datos de producción en juego, revertir es simplemente no promover el deploy o
revertir el commit correspondiente — no aplica ninguna estrategia de rollback de datos.
