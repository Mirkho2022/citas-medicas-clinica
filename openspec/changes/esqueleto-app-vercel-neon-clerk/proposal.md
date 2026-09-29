# Proposal

## Why

El proyecto no tiene código de aplicación todavía (solo PRD, Tech Design y ADR). Este es **H1**
del "Plan de implementación sugerido" de TECH-DESIGN.md: el esqueleto del que dependen todos los
demás hitos (H2 en adelante) — sin un proyecto desplegable, con autenticación y reconocimiento de
rol funcionando, ningún módulo de negocio (agenda, historias clínicas, notificaciones) tiene
dónde apoyarse. En particular, el mecanismo de RLS decidido en
[ADR-0023](../../../adrs/0023-contexto-de-usuario-para-rls.md) exige un JWT de sesión de Clerk
adjunto a cada consulta autenticada — eso solo existe si la autenticación ya está integrada.

## What Changes

- Bootstrap de un proyecto Next.js 15 (App Router) + TypeScript, desplegado en Vercel como
  target nativo, sin adaptador ([ADR-0020](../../../adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)).
- Conexión a Neon vía `@neondatabase/serverless` ([ADR-0021](../../../adrs/0021-base-de-datos-neon.md)),
  verificada con un chequeo de salud simple. **Sin esquema de negocio todavía** — las tablas
  (`perfiles`, `pacientes`, `medicos`, etc.) y las políticas RLS llegan en H2 ("esquema completo +
  RLS + suite pgTAP"); este change no las crea ni las anticipa.
- Integración de Clerk (`@clerk/nextjs`) para autenticación, sesión y MFA
  ([ADR-0022](../../../adrs/0022-autenticacion-y-sesion-clerk.md)):
  - Rol de aplicación (`administrativo`, `medico`, `enfermera`, `paciente`) en
    `publicMetadata.rol`, expuesto en `sessionClaims` vía JWT template.
  - Webhook `user.created` que fija `rol = 'paciente'` para todo alta por `/registro` — ninguna
    ruta de autorregistro puede producir otro rol.
  - Mecanismo de invitación (API de invitaciones de Clerk) para crear cuentas de personal
    (`administrativo`, `medico`, `enfermera`); la superficie completa de gestión de personal
    (listar, editar, dar de baja) queda fuera de este change.
  - Revocación de acceso (baneo + invalidación de sesión) para el caso "personal que deja la
    clínica" — el flujo de reasignación de sus pacientes ([ADR-0011](../../../adrs/0011-reasignacion-de-citas-por-baja-medica.md))
    no es parte de este change porque depende del esquema de agenda (H2/H3).
  - Grupos de ruta protegidos con una página de destino mínima por rol (placeholder), para
    probar el flujo de redirección — no las pantallas reales de cada módulo.
- Pipeline de CI (lint, typecheck, build) con un branch efímero de Neon por PR y el paso
  `node-pg-migrate up` ya cableado ([ADR-0027](../../../adrs/0027-herramienta-de-migraciones.md)),
  aunque todavía no aplique ninguna migración real — el "hook" para la futura suite pgTAP de H2
  queda listo pero vacío.

## Capabilities

### New Capabilities

- `autenticacion-roles`: inicio de sesión vía Clerk, asignación de exactamente uno de los 4
  roles del sistema por usuario, restricción del autorregistro a rol paciente, creación de
  personal solo por invitación, bloqueo de acceso a usuarios no autenticados, y revocación de
  acceso de un usuario.

### Modified Capabilities

_(ninguna — es el primer change del proyecto, no hay specs previas que modificar)_

## Impact

- **Código nuevo:** estructura completa del proyecto Next.js (`app/`, middleware de Clerk,
  configuración de build/lint/typecheck), sin ningún módulo de dominio.
- **Infraestructura:** proyecto de Vercel, proyecto de Neon (sin esquema todavía), aplicación de
  Clerk (roles, JWT template, webhooks, invitaciones), pipeline de CI. Estas piezas no generan
  una capability propia porque no tienen comportamiento observable de negocio — quedan descritas
  en `design.md`, no en `specs/`.
- **Sin impacto en RLS todavía:** no hay tablas en `public`, por lo que no aplica la regla de
  "toda tabla nueva nace con RLS + prueba pgTAP negativa" en este change; sí aplica desde H2.
- **Bloqueos:** ninguno — H1 no depende de otro change ni de la decisión legal peruana (esa
  decisión solo bloquea el módulo de historias clínicas, H6).
