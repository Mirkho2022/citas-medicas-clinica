# ADR 0001: Arquitectura de componentes y hosting

## Estado

Aceptado

## Contexto

El PRD exige exponer un portal de autoservicio a internet abierto (pacientes) además de tres
paneles internos (administrativo, médico, enfermera), más un job programado para el recordatorio
de "un día antes". Hay que definir cuántos componentes desplegables existen, qué responsabilidad
tiene cada uno y cómo se aísla la clave `service_role` (que omite RLS) del tráfico de usuario.

## Decisión

Un único monolito **Next.js 15 (App Router) + TypeScript**, desplegado como Cloudflare Worker vía
`@opennextjs/cloudflare`, que sirve las cuatro superficies (portal del paciente, panel
administrativo, panel clínico, panel de turnos) bajo el mismo despliegue — con renderizado en
servidor y Server Actions para toda mutación, de forma que ningún dato clínico se resuelva en el
cliente. Un **segundo Worker independiente** ejecuta únicamente los Cloudflare Cron Triggers de
notificaciones y es el único lugar donde vive la clave `service_role`. Cloudflare se coloca
delante de ambos como borde: WAF, rate limiting y Turnstile.

```
Internet → Cloudflare (WAF, rate limiting, Turnstile)
              ├─→ Worker: Next.js (RSC/Server Actions, sesión por cookies, clave anónima)
              └─→ Worker: cron (recordatorios, reintentos, clave service_role)
                        ambos → Supabase (Postgres + RLS, Auth, Storage) → Resend
```

## Alternativas consideradas

*(agregado retroactivamente el 2026-09-23, a partir de un hallazgo de revisión adversarial: esta
ADR no dejaba registro de qué otras opciones se evaluaron)*

- **Worker separado para el portal de pacientes, distinto de los paneles internos** — aísla la
  carga del tráfico público del portal del tráfico del personal, resolviendo de raíz el trade-off
  de acoplamiento de carga que esta misma ADR reconoce más abajo. Se descartó porque duplica el
  pipeline de deploy y complica compartir tipos/validaciones Zod entre ambas superficies, un costo
  desproporcionado para el volumen actual (50 usuarios internos concurrentes + picos moderados del
  portal, ver «Requisitos no funcionales» en TECH-DESIGN.md) con un equipo reducido.
- **Runtime Node.js tradicional (Vercel, Railway, un VPS) en vez de Cloudflare Workers** — es el
  target "nativo" de Next.js, sin las restricciones de runtime de Workers (límites de CPU,
  compatibilidad de APIs de Node). Se descartó porque no cambia el argumento de fondo de esta ADR
  (aislar `service_role` en un proceso separado sigue siendo necesario con cualquier runtime) y
  pierde la integración de borde ya decidida para el resto del stack (WAF, rate limiting, Turnstile
  de Cloudflare delante de la aplicación).

## Consecuencias

- Un solo repositorio y un solo pipeline de deploy simplifican un equipo pequeño; no hay contratos
  de red que mantener entre paneles internos y portal porque son el mismo despliegue.
- La clave `service_role` nunca convive con el código que atiende tráfico de usuario, porque el
  cron es un Worker separado — esto es lo que hace cumplible la regla no negociable de
  [CLAUDE.md](../CLAUDE.md) sobre esa clave.
- **Trade-off:** al ser un monolito, un pico de tráfico del portal de pacientes comparte el mismo
  Worker que los paneles internos del personal; no hay aislamiento de carga entre superficies. Es
  aceptable al volumen actual (50 usuarios de personal concurrentes + picos de portal, ver
  «Requisitos no funcionales» en [TECH-DESIGN.md](../TECH-DESIGN.md)), pero si la clínica crece en
  tráfico de portal, un incidente de carga en el portal puede degradar también los paneles internos.
