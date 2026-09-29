# ADR 0020: Arquitectura de componentes y hosting en Vercel

## Estado

Aceptado — reemplaza [ADR-0001](0001-arquitectura-de-componentes-y-hosting.md), a partir de un
cambio de stack decidido por el cliente (despliegue en Vercel en vez de Cloudflare Workers).

## Contexto

[ADR-0001](0001-arquitectura-de-componentes-y-hosting.md) resolvía dos problemas a la vez: dónde
corren las cuatro superficies de la aplicación, y cómo aislar la clave `service_role` de Supabase
(que bypasea RLS) del tráfico de usuario — con un segundo Worker de Cloudflare dedicado solo al
cron. Con el cambio de stack (base de datos Neon, sin Supabase), ya no existe el concepto de
`service_role`, pero el problema de fondo sigue vigente en otra forma: el cron de notificaciones
necesita leer y escribir `notificaciones`/`citas` de **cualquier** paciente, sin estar autenticado
como un médico o paciente específico — necesita más alcance que el rol de Postgres que usa la
aplicación (sujeto a RLS).

## Decisión

Un único proyecto de Vercel (Next.js 15 App Router, sin adaptador — Vercel es el target nativo de
Next.js) sirve las cuatro superficies bajo el mismo despliegue. El aislamiento de la credencial con
más alcance ya no se hace separando procesos/despliegues, sino separando **roles de Postgres**:

- `app_user` — el rol que usa la aplicación para servir tráfico de usuario. Sujeto a RLS en todas
  las tablas de `public`, sin excepción.
- `cron_notificaciones` — el rol que usan los Route Handlers de cron
  ([ADR-0025](0025-notificaciones-cron-vercel.md)). Tiene `GRANT` explícito y mínimo solo sobre
  `notificaciones` (lectura/escritura completa) y `citas` (solo lectura, para el join que verifica
  si la cita ya ocurrió) — **no** tiene ningún privilegio sobre `atenciones`, `antecedentes` ni
  `accesos_historia`. No bypasea RLS de forma general como hacía `service_role`; simplemente no
  necesita acceder a esas tablas para su trabajo.

```
Internet
   │
Vercel (proyecto único)
   ├─ Next.js App Router — RSC / Server Actions — rol Postgres: app_user (RLS aplicada)
   └─ Vercel Cron Jobs → Route Handlers /api/cron/* — rol Postgres: cron_notificaciones
                    │
                    └──► Neon (Postgres + RLS) ──► Resend (correo) / Vercel Blob (adjuntos)
```

## Alternativas consideradas

- **Dos proyectos de Vercel separados (app + cron)** — replica el aislamiento por despliegue del
  diseño original con Cloudflare. Se descartó porque duplica el pipeline de deploy y las variables
  de entorno compartidas sin necesidad: el aislamiento por rol de Postgres (GRANTs mínimos) da la
  misma garantía de fondo — que el cron no pueda leer historias clínicas — sin ese costo operativo.
- **Un solo proyecto sin separar credenciales** (la app y el cron usan el mismo rol de Postgres) —
  es lo más simple de configurar, pero repite exactamente el riesgo que ADR-0001 buscaba evitar: si
  el rol único tiene que poder escribir `notificaciones` para cualquier paciente, ese mismo alcance
  queda disponible a cualquier código que corra en el proceso de la aplicación, incluida una
  vulnerabilidad de inyección en una Server Action.

## Consecuencias

- Un solo repositorio y un solo pipeline de deploy, igual que el diseño original — no se pierde esa
  ventaja al cambiar de Cloudflare a Vercel.
- El cron de notificaciones no puede leer contenido clínico ni siquiera si su código tuviera un
  bug, porque su rol de Postgres no tiene `GRANT` sobre esas tablas — la garantía es por permisos
  de base de datos, no por disciplina de código.
- **Trade-off:** a diferencia del `service_role` de Supabase (una sola clave que se aísla o no se
  aísla), este mecanismo requiere mantener los `GRANT` de `cron_notificaciones` sincronizados cada
  vez que el cron necesite tocar una tabla nueva — un `GRANT` olvidado rompe el cron con un error de
  permisos (fallo visible), pero un `GRANT` de más otorgado por error es un hueco de seguridad
  silencioso; los `GRANT` de este rol deben revisarse en cualquier PR que modifique
  `lib/cron/*` o el esquema de `notificaciones`/`citas`.
