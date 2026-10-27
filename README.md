# Sistema de Gestión de Citas e Historias Clínicas Electrónicas

Sistema para una clínica en Perú que reemplaza el proceso actual (Excel + Google Forms para citas, papel para historias clínicas):
el paciente reserva y cancela su cita en un portal de autoservicio, el administrativo gestiona la agenda, y el aislamiento de los datos
clínicos por rol y por médico a cargo lo impone la base de datos (RLS), no la aplicación.

> Proyecto de muestra del curso. Solo usa **datos sintéticos de demostración**: los datos clínicos reales siguen bloqueados hasta resolver el
> marco legal peruano de historia clínica electrónica (ver [CLAUDE.md](CLAUDE.md), «Decisiones aún abiertas»).

**Producción (demostración):** https://citas-medicas-clinica.vercel.app

**¿Vas a revisarlo?** Las cuentas de prueba por rol y qué probar están en [`docs/09-deploy/acceso-del-profesor.md`](docs/09-deploy/acceso-del-profesor.md). Las contraseñas se entregan por separado. El segundo factor (TOTP) solo lo exige el rol médico.

## Qué hace hoy

| Rol | Puede |
|---|---|
| Paciente | Registrarse y vincular su ficha, buscar disponibilidad, reservar y cancelar **su** cita (hasta 1 hora antes) desde un portal pensado para el celular |
| Administrativo | Registrar pacientes, ver la agenda del día, agendar, reprogramar y cancelar citas de cualquier paciente, gestionar horarios y bajas médicas con reasignación, asignar turnos de enfermería |
| Médico | Ver su jornada y citas confirmadas, marcar atendida, abrir la historia clínica **solo de sus pacientes** (cada apertura queda auditada), registrar, firmar y complementar atenciones con diagnósticos |
| Enfermera | Ver su turno y con qué médico o servicio trabaja; nada más |

Reglas que el sistema hace cumplir en la base de datos: doble reserva imposible (mensaje exacto `Registro de cita ya agendado`), ventana de
cancelación de 1 hora para todos los roles, DNI o Carné de Extranjería como documento, fechas siempre en `America/Lima`.

## Estado por hito

| Hito | Contenido | Estado |
|---|---|---|
| H1 | Autenticación y roles | Hecho |
| H2 | Esquema, RLS, pruebas pgTAP y datos de demostración | Hecho |
| H2b | Sistema de diseño de la interfaz | Hecho |
| H3 | Agenda y reserva del administrativo | Hecho, en producción |
| H4 | Portal del paciente | Hecho, en producción; antes de abrirlo a pacientes reales faltan pasos de consola ([pasos-manuales-h4](docs/09-deploy/pasos-manuales-h4.md)) |
| H5 | Notificaciones por email | Especificado, sin implementar |
| H6 | Historias clínicas electrónicas | Parcial: lectura, registro y firma de atenciones con RLS, en producción. Sin adjuntos escaneados ni catálogo CIE-10 completo (hay un subconjunto de demostración) |
| H7 | Turnos de enfermería y dashboard | Parcial: turnos de enfermería y paneles del médico y la enfermera, en producción. Sin dashboard del administrativo |
| H8 | Importación, respaldo y capacitación | Pendiente |

## Stack

Next.js 15 (App Router) + TypeScript sobre **Vercel**, **Neon** (PostgreSQL serverless con RLS), **Clerk** (autenticación, sesión y MFA),
**Upstash Redis** y **Vercel BotID** (controles de borde). Notificaciones por email (Resend) y adjuntos (Vercel Blob) están previstos para H5 y H6 y aún no existen.

## Documentación

Todo está en [`docs/`](docs/README.md), ordenado en el orden en que se construyó el proyecto:

| # | Carpeta | Contenido |
|---|---|---|
| 01 | [`docs/01-producto/`](docs/01-producto/PRD.md) | PRD |
| 02 | [`docs/02-diseno/`](docs/02-diseno/DESIGN.md) | Sistema de diseño y revisión visual |
| 03 | [`docs/03-arquitectura/`](docs/03-arquitectura/TECH-DESIGN.md) | Tech Design y ADRs |
| 04 | [`docs/04-backlog/`](docs/04-backlog/BACKLOG.md) | Backlog de 35 ítems en 8 hitos |
| 05 | [`docs/05-specs/`](docs/05-specs/README.md) | Puente hacia las specs de [`openspec/`](openspec/) |
| 06 | [`docs/06-diagramas/`](docs/06-diagramas/) | Arquitectura y RLS, reserva, estados de la cita, registro del paciente |
| 07 | [`docs/07-testing/`](docs/07-testing/README.md) | Estrategia de pruebas y trazabilidad; [informe E2E con Playwright](docs/07-testing/informe-e2e-2026-10-26.md) |
| 08 | [`docs/08-seguridad/`](docs/08-seguridad/SECURITY-REPORT.md) | Informe de seguridad (`security-pass`) y [verificación previa a la presentación](docs/08-seguridad/VERIFICACION-2026-10-26.md) |
| 09 | [`docs/09-deploy/`](docs/09-deploy/DEPLOY-PLAN.md) | Plan de despliegue (`deploy-pass`) |

## Cómo correrlo en local

Requisitos: Node 24 y una cuenta de desarrollo en Neon y en Clerk.

```bash
npm ci
cp .env.example .env.local        # completar las variables (ver los comentarios del archivo)
npm run migrate -- up             # aplica las migraciones al branch de desarrollo de Neon
node scripts/sembrar-datos-demo.ts --confirmar   # datos sintéticos de demostración (ver docs/07-testing/datos-demo.md)
npm run dev
```

Pruebas y comprobaciones: `npm run typecheck`, `npm run lint`, `npm run test:portal`, `npm run test:pgtap`, `npm run test:e2e`.
La guía completa está en [`docs/07-testing/README.md`](docs/07-testing/README.md).

## Estructura del repositorio

```
app/            Next.js (App Router): áreas por rol, portal del paciente, rutas API
components/     Componentes de interfaz (components/clinica = los propios de la clínica)
lib/            Lógica de negocio, acceso a datos con la identidad del usuario, controles de borde
migrations/     Migraciones SQL hacia adelante (node-pg-migrate)
openspec/       Specs vigentes y changes (propuestos, en curso y archivados)
tests/          pgTAP, concurrencia, integración y pruebas unitarias
e2e/            Pruebas Playwright
scripts/        Tema, datos de demostración y runners de pruebas
docs/           Documentación en el orden del proceso (01 a 09)
.github/        CI, branch de Neon por PR, E2E contra el preview y migración de producción
```

## Cómo se construyó

El proyecto sigue un proceso guiado por especificaciones con agentes de IA: PRD → diseño → Tech Design con ADRs y revisión adversarial →
backlog → specs con OpenSpec → código con revisión de código → pruebas → informe de seguridad → plan de despliegue. El detalle de cada paso y
cómo se enlazan entre sí está en [`docs/README.md`](docs/README.md).
