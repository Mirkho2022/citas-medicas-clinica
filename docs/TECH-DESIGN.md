---
title: "Technical Design Document — Sistema de Gestión de Citas e Historias Clínicas Electrónicas"
documento_fuente: "PRD.md"
fecha: "2026-09-21"
actualizado: "2026-10-11"
---

# Technical Design Document: Sistema de Gestión de Citas e Historias Clínicas Electrónicas

**Tipo de proyecto:** Greenfield — no existe código ni repositorio git todavía (ver
[CLAUDE.md](../CLAUDE.md)). Este documento define arquitectura, modelo de datos, seguridad, reglas de
negocio, superficie de la aplicación y plan de implementación, y formaliza las decisiones de
arquitectura como ADRs trazables.

**Design.md disponible:** No. No existe un documento de diseño de interfaz; el modelo de datos se
derivó directamente del PRD (esquema SQL detallado en «Modelo de datos» más abajo).

> Este documento especifica el **cómo**. El **qué** y el **por qué** están en el PRD; ante
> cualquier contradicción, manda el PRD.

> **Actualización del 2026-10-11 (PRD del mismo día).** El PRD añadió el perfil «Profesional de la salud» (reemplaza a
> «Médico»), cinco especialidades, el triaje por enfermería, la atención de pacientes sin cita, las recetas y la copia de
> la historia al paciente. Convenciones de esta actualización:
>
> - **Nombres técnicos.** `medico`, `medicos` y `medico_tiene_paciente()` siguen siendo los nombres **vigentes** del
>   esquema y del código (H1 y H2). `profesional` es una **propuesta** sujeta a
>   [ADR-0030](adrs/0030-profesional-de-la-salud.md) (estado Propuesto): donde aparece junto a un nombre vigente se indica
>   «hoy `medico`, ADR-0030»; si la ADR se rechaza, léase `medico`/`medicos` y la profesión pasa a ser una columna de
>   `medicos`. En el texto de producto se escribe «profesional».
> - **«Propuesta».** Marca un diseño que no viene del PRD ni de una ADR aceptada (de las nuevas, solo ADR-0029 lo está).
>   Los comentarios `REVISAR` (HTML) marcan un supuesto del autor. Ambos se confirman con el usuario antes de construir.
> - **Dueño del detalle.** Las tablas nuevas se describen aquí a nivel esquemático (columnas clave y RLS en prosa); el
>   diseño fino, las migraciones y las pruebas viven en el change de OpenSpec de cada hito (ver «Plan de implementación
>   sugerido»). Ante cualquier diferencia de nombres de columna, manda el change.

## Resumen

Se construirá una aplicación web multi-rol (administrativo o recepción, profesional de la salud, enfermera, paciente) que
reemplaza la gestión actual por Excel/Google Forms (citas) y papel (historias clínicas), con cuatro
superficies sobre una misma base de datos:

| Superficie | Rol | Función principal |
|---|---|---|
| Panel administrativo | Administrativo (recepción) | Agendar, reprogramar y cancelar citas; registrar pacientes y abrir su historia con la filiación de la NTS 139; registrar la llegada (con o sin cita); entregar la copia de la historia; dashboard operativo |
| Panel clínico | Profesional de la salud (hoy rol `medico`, ADR-0030) | Ver agenda propia; registrar y consultar historias clínicas de sus pacientes a cargo (compartidas entre especialidades, salvo Psicología); tomar pacientes derivados; emitir recetas si su profesión puede recetar |
| Panel de triaje y turnos | Enfermera | Registrar el triaje y derivar al paciente a una especialidad; consultar turno asignado y especialidad con la que trabaja. Sin acceso a historias clínicas |
| Portal de autoservicio | Paciente | Reservar y cancelar su propia cita; recibir recordatorios por email |

**El paso de un paciente por la clínica** (PRD, 2026-10-11): llega (con o sin cita) → recepción lo registra y abre su
historia con la filiación mínima de la NTS 139 → la enfermera hace el triaje (signos vitales) y lo deriva a una
especialidad → un profesional de esa especialidad lo toma y lo atiende, con la historia compartida entre especialidades
(salvo Psicología) → si corresponde, emite la receta, que se imprime desde el sistema → a solicitud, recepción entrega la
copia de la historia en 5 días como máximo. El paciente con cita sigue el mismo camino, pero llega con el profesional ya
a cargo (la cita confirmada le da el acceso, [ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)) y no
necesita derivación.

El diseño se ordena alrededor de dos exigencias del PRD: la doble reserva debe bloquearse a prueba
de concurrencia, y el acceso a historias clínicas debe aislarse por profesional a cargo **en la base de
datos** mediante Row Level Security (RLS) de PostgreSQL, no solo en la aplicación — es el riesgo
principal declarado del proyecto y toda la arquitectura se ordena alrededor de él.

Ese aislamiento tiene una excepción deliberada: la información de Psicología (resultados de tests y notas de sesión) solo
la ven los psicólogos a cargo, no los demás profesionales a cargo
([ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md), propuesta), y también se impone en la base de datos.

## Arquitectura de componentes

**Stack vigente** (Vercel + Neon + Clerk) — decisiones registradas en ADR-0020 a 0028. El diseño
pasó antes por Cloudflare Workers + Supabase; ese historial vive en `git log`, no en ADRs activos,
para mantener el conjunto de ADRs alineado con lo que realmente se va a construir.

- **Proyecto Vercel** (Next.js 15 App Router, sin adaptador — Vercel es el target nativo de
  Next.js): sirve las cuatro superficies — portal de autoservicio del paciente, panel
  administrativo, panel clínico, panel de triaje y turnos — bajo un único despliegue. Entra a Postgres
  como el rol `authenticator` y cambia a `authenticated` en cada petición; RLS es la autoridad de acceso a datos
  ([ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)).
- **Vercel Cron Jobs**: un solo cron diario ejecuta el Route Handler de notificaciones
  (recordatorio 24h y reintentos), usando el rol de Postgres `cron_notificaciones` — sin
  privilegios sobre `atenciones`/`antecedentes` ni sobre ninguna tabla clínica nueva (triaje, recetas, copias, Psicología)
  ([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)).
- **Clerk**: autenticación, MFA/TOTP de personal, invitaciones, sesión por cookies
  ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)).
- **Vercel BotID + Upstash Ratelimit**: anti-bots en registro/reserva y límite de intentos en rutas
  de autenticación ([ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md)).
- **Neon**: PostgreSQL 15+ con RLS, branching (staging) y PITR (backups)
  ([ADR-0021](adrs/0021-base-de-datos-neon.md)).
- **Vercel Blob**: adjuntos clínicos (escaneos de respaldo), acceso vía URL firmada de corta
  duración generada tras verificar `medico_tiene_paciente()` (hoy; `profesional_tiene_paciente()` si se acepta ADR-0030).
  Hoy solo PDF: admitir imágenes (radiografías, fotos de evolución) es una decisión pendiente (P-15)
  ([ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md)).
- **Resend**: envío de correo transaccional, detrás de una interfaz de proveedor (sin cambios).
- **Áreas por rol** (áreas planas fijadas en H1): `/administrativo`, `/profesional` (propuesta de ADR-0030; hoy
  `/medico`), `/enfermera` (triaje, derivación y turnos) y `/paciente`. Cada área verifica el rol en servidor, pero la
  autoridad de acceso sigue siendo RLS. Las tablas clínicas nuevas (triaje, recetas, Psicología) no reciben `GRANT` para
  `cron_notificaciones` ni para `sync_identidad`.

```
                   Internet
                      │
        ┌─────────────▼──────────────┐
        │  Vercel BotID (registro,   │
        │  reserva) + Upstash        │
        │  Ratelimit (rutas de auth) │
        └─────────────┬──────────────┘
                      │
     ┌────────────────▼─────────────────┐        ┌───────────────────┐
     │  Proyecto Vercel: Next.js        │        │  Vercel Cron Jobs │
     │  - RSC / Server Actions          │        │  - recordatorios  │
     │  - sesión por cookies (Clerk)    │        │  - reintentos     │
     │  - rol Postgres: authenticated   │        │  rol: cron_notif. │
     └────────┬─────────────────────────┘        └────────┬──────────┘
              │ driver serverless de Neon                 │ driver serverless
              │ (RLS + Neon RLS Authorize/Clerk)          │ (GRANT y RLS mínimos) 
     ┌────────▼───────────────────────────────────────────▼─────────┐
     │  Neon — PostgreSQL (RLS, branching, PITR)                     │
     └───────────────────────────────────────────────────────────────┘
                      │                              │
                      └──► Resend (correo)           └──► Vercel Blob (adjuntos)
```

**Regla no negociable (equivalente a la de `service_role` en el diseño original):** el rol de
Postgres `cron_notificaciones` solo existe en los Route Handlers de cron y en CI. Nunca se usa en
el código que sirve tráfico de usuario, y sus `GRANT` y políticas RLS se limitan estrictamente a `notificaciones`
y `citas` (esta, solo lectura) — ver [ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md).

Todo el sistema es nuevo; no hay componentes heredados de otro sistema (el reemplazo de Excel/papel
es un problema de migración de datos, ver «Migración desde Excel y papel», no de integración con un
sistema existente).

## Stack y dependencias

| Capa | Tecnología | Nota |
|---|---|---|
| Runtime / hosting | Vercel | Target nativo de Next.js, sin adaptador ([ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)) |
| App | Next.js 15 App Router, React 19, TypeScript estricto | `strict: true`; sin `any` en la capa de datos |
| Datos | `@neondatabase/serverless` | Driver serverless de Neon; nunca cliente de navegador para datos clínicos ([ADR-0021](adrs/0021-base-de-datos-neon.md)) |
| Autenticación | `@clerk/nextjs` | MFA/TOTP, invitaciones, sesión ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)) |
| Almacenamiento | `@vercel/blob` | Adjuntos clínicos vía URL firmada ([ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md)) |
| Anti-bots / rate limiting | Vercel BotID, Upstash Ratelimit + Redis | ([ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md)) |
| UI | Tailwind CSS, shadcn/ui, `react-hook-form` | |
| Validación | Zod | Esquemas en `lib/schemas/`, compartidos |
| Fechas | `date-fns` + `date-fns-tz` | Formateo siempre con zona `America/Lima` |
| Correo | Resend SDK | Detrás de `lib/notificaciones/proveedor.ts` |
| Cron | Vercel Cron Jobs (`vercel.json`) | Un solo cron diario, plan Hobby ([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)) |
| Migraciones | `node-pg-migrate` (`migrations/*.sql`) | Versionadas en git; nunca cambios manuales en producción ([ADR-0027](adrs/0027-herramienta-de-migraciones.md)) |
| Tests | pgTAP, `node:test`, Playwright (Vitest para unitarias cuando haya lógica de aplicación) | pgTAP es obligatorio para políticas RLS ([pruebas-sql.md](pruebas-sql.md)) |

## Decisiones de arquitectura

| # | Decisión | Estado |
|---|---|---|
| [ADR-0003](adrs/0003-control-de-acceso-a-historias-clinicas.md) | Control de acceso a historias clínicas (RLS) | Aceptado |
| [ADR-0004](adrs/0004-stack-de-frontend-y-validacion.md) | Stack de frontend y validación | Aceptado |
| [ADR-0005](adrs/0005-modelo-de-datos-y-prevencion-de-doble-reserva.md) | Modelo de datos y prevención de doble reserva | Aceptado |
| [ADR-0006](adrs/0006-contratos-de-api-via-server-actions.md) | Contratos de API vía Server Actions | Aceptado |
| [ADR-0008](adrs/0008-resiliencia-y-manejo-de-errores.md) | Resiliencia y manejo de errores | Aceptado |
| [ADR-0010](adrs/0010-calculo-de-disponibilidad-de-slots.md) | Cálculo de disponibilidad de slots | Aceptado |
| [ADR-0011](adrs/0011-reasignacion-de-citas-por-baja-medica.md) | Reasignación de citas por baja médica | Aceptado |
| [ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md) | Alcance de la ventana de cancelación de 1 hora | Aceptado |
| [ADR-0013](adrs/0013-definicion-de-historia-clinica-digitalizada.md) | Definición de "historia clínica digitalizada" | Aceptado |
| [ADR-0014](adrs/0014-catalogo-cie-10.md) | Fuente y alcance del catálogo CIE-10 | Aceptado |
| [ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md) | Modelo de datos de antecedentes del paciente | Aceptado |
| [ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md) | Vigencia temporal de la asignación paciente-médico | Aceptado |
| [ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md) | Disparo de notificaciones transaccionales y guarda de recordatorios vencidos | Aceptado |
| [ADR-0018](adrs/0018-visibilidad-de-notificaciones-fallidas.md) | Visibilidad operativa de notificaciones fallidas | Aceptado |
| [ADR-0019](adrs/0019-migracion-de-datos-excel-y-papel.md) | Migración de datos desde Excel y papel | Aceptado |
| [ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md) | Arquitectura de componentes y hosting en Vercel | Aceptado |
| [ADR-0021](adrs/0021-base-de-datos-neon.md) | Base de datos: Neon | Aceptado |
| [ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md) | Autenticación y sesión: Clerk | Aceptado |
| [ADR-0023](adrs/0023-contexto-de-usuario-para-rls.md) | Contexto de usuario para RLS: Neon RLS (Clerk) | Aceptado |
| [ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md) | Almacenamiento de adjuntos clínicos: Vercel Blob | Aceptado |
| [ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md) | Controles de borde: anti-bots y rate limiting | Aceptado |
| [ADR-0027](adrs/0027-herramienta-de-migraciones.md) | Herramienta de migraciones: node-pg-migrate | Aceptado |
| [ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md) | Notificaciones: un solo cron diario (plan Hobby) | Aceptado |
| [ADR-0029](adrs/0029-datos-clinicos-por-especialidad.md) | Datos clínicos por especialidad: plantillas versionadas y datos validados en la base | Aceptado |
| [ADR-0030](adrs/0030-profesional-de-la-salud.md) | Profesional de la salud: generalizar el rol «médico» | **Propuesto** |
| [ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) | Aislamiento de la información de Psicología | **Propuesto** |
| [ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md) | Acceso a la historia de pacientes sin cita: derivación | **Propuesto** |
| [ADR-0033](adrs/0033-visita-del-paciente-llegada-y-estados.md) | Visita del paciente: llegada, estados y quién transiciona | **Propuesto** |
| [ADR-0034](adrs/0034-emision-de-la-copia-de-la-historia-clinica.md) | Emisión de la copia de la historia clínica | **Propuesto** |
| [ADR-0035](adrs/0035-recetas-funciones-acotadas-numeracion-y-medicamentos.md) | Recetas: escritura por funciones acotadas, numeración correlativa y lectura de medicamentos | **Propuesto** |

Solo se listan los ADR vigentes — los que describen lo que realmente se va a construir (más las propuestas 0030–0035, marcadas como tales). El diseño
pasó antes por un stack distinto (Cloudflare Workers + Supabase, con planes de pago de Vercel para
el cron); esas decisiones descartadas no se mantienen como ADRs activos, pero siguen accesibles en
el historial de git (`git log --all -- adrs/ docs/adrs/`) para quien necesite el porqué de un número salteado
en la numeración.

Los ADR 0003–0006, 0008 y 0010–0011 registran las decisiones de arquitectura base del proyecto que
no dependen del proveedor de hosting/base de datos (control de acceso, stack de frontend, modelo de
datos, contratos de API, resiliencia, disponibilidad, reasignación por baja médica). Los ADR
0012–0014 resuelven, con decisión explícita del cliente, tres puntos que quedaban abiertos en el
diseño inicial: el alcance por rol de la ventana de cancelación, la definición operativa de
"historia clínica digitalizada" y la fuente del catálogo CIE-10. El ADR 0015 resuelve una brecha de
modelo de datos detectada al combinar 0012–0014 entre sí (ver «Riesgos técnicos abiertos»). Los ADR
0016–0019 cierran los hallazgos de una revisión adversarial del diseño: vigencia del acceso a
historias clínicas (0016), disparo y guarda de notificaciones (0017), visibilidad de notificaciones
fallidas (0018), y formalización de la migración de datos (0019).

Los ADR 0020–0028 registran el stack de infraestructura vigente (Vercel + Neon + Clerk): hosting,
base de datos, autenticación, contexto de RLS, almacenamiento, cron, controles de borde y
migraciones, cada uno con sus propias alternativas consideradas. ADR-0028 (un solo cron diario, sin
plan de pago) refleja que este proyecto es un MVP académico, no un despliegue de producción para la
clínica. ADR-0023 pasó por su propia revisión: la primera versión proponía un mecanismo casero
(`SET LOCAL`); la vigente usa la integración nativa de Neon con Clerk (`pg_session_jwt`).

El ADR 0029 (**aceptado** el 2026-10-10) fija el mecanismo de datos clínicos por especialidad: un catálogo de plantillas
versionadas por migración y un `jsonb` validado en la base, antes de que existan la firma y la huella. Los ADR 0030–0035
nacen del PRD del 2026-10-11 y están **propuestos**: el 0030 generaliza el rol «médico» a «profesional de la salud»; el
0031 aísla la información de Psicología con RLS; el 0032 da acceso a la historia de los pacientes sin cita mediante
derivaciones que un profesional «toma», y modifica el modelo de acceso de
[ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md); el 0033 introduce la visita del paciente (la llegada, con sus
estados) de la que cuelgan triaje y derivación; el 0034 fija cómo se emite la copia de la historia sin abrir contenido clínico
a recepción; y el 0035, cómo se escriben las recetas (funciones acotadas, numeración correlativa) y se leen los medicamentos. Se listan para que el diseño que depende de ellas sea
trazable, pero tocan el acceso a historias clínicas y el esquema ya en producción: no se implementan sin decisión
explícita del usuario y revisión con el agente `code-review`.

## Modelo de datos

### Extensiones y tipos

```sql
create extension if not exists btree_gist;   -- requerido por las restricciones EXCLUDE
-- pgcrypto no se instala: gen_random_uuid() es nativa desde PostgreSQL 13.
create extension if not exists citext;       -- emails sin sensibilidad a mayúsculas

create type rol_usuario         as enum ('administrativo','medico','enfermera','paciente');
create type tipo_documento      as enum ('DNI','CE');
create type estado_cita         as enum ('reservada','confirmada','atendida','cancelada','no_asistio');
create type tipo_turno          as enum ('manana','tarde','noche');
create type estado_notificacion as enum ('pendiente','enviada','fallida');
create type tipo_antecedente    as enum ('personal_patologico','quirurgico','alergico','familiar','habito_nocivo');
```

Tipos que el PRD del 2026-10-11 obliga a ampliar (**Propuesta**; cada uno se crea con una migración nueva del hito
indicado, nunca editando una migración aplicada):

| Tipo | Cambio | Hito |
|---|---|---|
| `rol_usuario` | `medico` pasa a `profesional` ([ADR-0030](adrs/0030-profesional-de-la-salud.md)); los demás valores no cambian | H2c |
| `profesion_salud` (nuevo) | `medico`, `odontologo`, `fisioterapeuta`, `psicologo`, `podologo` | H2c |
| `tipo_documento` | Se añaden `PAS` (pasaporte) y `PROV` (número correlativo provisional que genera el sistema): la NTS 139, numeral 4.2.23, los admite junto al DNI y el Carné de Extranjería | H3 |

Los estados de las tablas nuevas se modelan como enumeraciones (`estado_visita`, `estado_derivacion`) o como `text` con
`CHECK`; lo decide el change de cada hito.

### Identidad y personas

```sql
-- Sincronizada desde Clerk vía webhook (user.created/user.updated), no un espejo de
-- auth.users de Supabase. clerk_user_id es el id que Clerk asigna (string, no uuid).
create table perfiles (
  id             uuid primary key default gen_random_uuid(),
  clerk_user_id  text unique not null,
  rol            rol_usuario not null default 'paciente',
  nombres        text not null,
  apellidos      text not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

-- clerk_user_id ya tiene índice por su restricción UNIQUE.

create table pacientes (
  id               uuid primary key default gen_random_uuid(),
  perfil_id        uuid unique references perfiles(id) on delete set null,
  tipo_documento   tipo_documento not null,
  numero_documento text not null,
  nombres          text not null,
  apellidos        text not null,
  fecha_nacimiento date not null,
  sexo             text not null check (sexo in ('M','F','X')),
  telefono         text,
  email            citext not null,
  direccion        text,
  creado_en        timestamptz not null default now(),

  constraint pacientes_documento_unico unique (tipo_documento, numero_documento),
  constraint pacientes_documento_formato check (
    (tipo_documento = 'DNI' and numero_documento ~ '^[0-9]{8}$') or
    (tipo_documento = 'CE'  and numero_documento ~ '^[A-Za-z0-9]{9,12}$')
  )
);

create table especialidades (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table medicos (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid not null unique references perfiles(id) on delete restrict,
  cmp             text not null unique,          -- colegiatura médica
  especialidad_id uuid not null references especialidades(id),
  activo          boolean not null default true
);

create table enfermeras (
  id        uuid primary key default gen_random_uuid(),
  perfil_id uuid not null unique references perfiles(id) on delete restrict,
  activo    boolean not null default true
);
```

`pacientes.perfil_id` es nulo a propósito: el administrativo puede registrar a un paciente que
nunca cree cuenta en el portal. Cuando el paciente se registra, se vincula por
`(tipo_documento, numero_documento)`.

**Propuestas del PRD del 2026-10-11 para esta sección** (cada una con su hito; los nombres sujetos a
[ADR-0030](adrs/0030-profesional-de-la-salud.md) siguen la convención de la nota inicial):

- **`profesionales`** (**Propuesta**, ADR-0030; hoy `medicos`; hito H2c, change `profesionales-de-la-salud`). Reemplaza a
  `medicos`. Columnas clave: `id`, `perfil_id` (único, `on delete restrict`), `profesion` (`profesion_salud`), `colegiatura`
  (reemplaza a `cmp`, que era la colegiatura médica; único junto con la profesión, porque colegios distintos pueden repetir un
  número), `especialidad_id` y `activo`. Las especialidades de la clínica son cinco: Medicina general, Odontología,
  Fisioterapia, Psicología y Podología (los datos de demostración de H2 traen otras, solo sintéticas).
  - `profesion` es un dato de la base, nunca del cliente: de ella dependen la plantilla clínica
    ([ADR-0029](adrs/0029-datos-clinicos-por-especialidad.md)), el permiso de recetar (H6c) y el aislamiento de Psicología
    ([ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)). Por eso **no se cambia con un `UPDATE`**: el
    privilegio de actualización no incluye `profesion` y un disparador (`proteger_profesional()`, SQLSTATE `HC010`) lo rechaza
    aunque alguien ampliara el `GRANT`. Una profesión mal registrada se corrige con una migración revisada, no con una pantalla.
    La función `profesion_actual()` es el único punto de lectura de la profesión.
  - El renombre es coherente en todo el esquema: `citas.profesional_id`, `disponibilidades.profesional_id`,
    `bloqueos_agenda.profesional_id`, `atenciones.profesional_id`, `addendas.profesional_id`, `antecedentes.registrado_por`,
    `turnos_enfermeria.profesional_id`, `asignaciones_paciente_profesional`, `profesional_actual()` y
    `profesional_tiene_paciente()`, sin alias de los nombres viejos (ver P-13). Si ADR-0030 se rechaza, la alternativa es
    conservar `medicos` y añadirle `profesion`.
  <!-- REVISAR: la coherencia entre `profesion` y `especialidad_id` (p. ej. un psicólogo solo en Psicología) no la fija el PRD; proponer un CHECK o un disparador por migración. -->
- **Filiación mínima en `pacientes`** (**Propuesta**; el dueño del detalle es `agenda-y-reserva`, H3, ítem 5). Para abrir la
  historia con el formato de filiación de la NTS 139, `pacientes` gana columnas que hoy no tiene: lugar de nacimiento,
  estado civil, grado de instrucción, ocupación, domicilio (hoy `direccion`) y, para menores o personas con representante,
  el responsable y su parentesco; el tipo de documento admite `PAS` y `PROV` (y `pacientes_documento_formato` se amplía a
  ellos). El documento sigue siendo único: si ya está registrado, no se abre una segunda historia
  (`pacientes_documento_unico` y `historias_clinicas.paciente_id` único).
  - El número provisional (`PROV`) lo genera el sistema, nunca el usuario. Al confirmar la identidad, el documento definitivo
    reemplaza al provisional sobre el mismo `paciente_id`, de modo que la historia no se duplica ni cambia de dueño; el
    cambio queda en `auditoria`.
  <!-- REVISAR: la lista exacta de campos del formato de filiación de la NTS 139 no se verificó en la investigación (solo el numeral 4.2.23 sobre la identificación y el art. 22.g del DS 009-2017-SA); la fija `agenda-y-reserva` con el texto de la norma. -->

### Agenda y citas

```sql
-- Disponibilidad recurrente del médico (plantilla semanal).
create table disponibilidades (
  id                uuid primary key default gen_random_uuid(),
  medico_id         uuid not null references medicos(id) on delete cascade,
  dia_semana        smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  hora_inicio       time not null,
  hora_fin          time not null,
  duracion_slot_min smallint not null default 20 check (duracion_slot_min > 0),
  vigente_desde     date not null default current_date,
  vigente_hasta     date,
  check (hora_fin > hora_inicio)
);

-- Ausencias: vacaciones, licencia, emergencia (caso borde "doctor de baja").
create table bloqueos_agenda (
  id        uuid primary key default gen_random_uuid(),
  medico_id uuid not null references medicos(id) on delete cascade,
  rango     tstzrange not null,
  motivo    text not null,
  creado_en timestamptz not null default now(),
  exclude using gist (medico_id with =, rango with &&)
);

create table citas (
  id              uuid primary key default gen_random_uuid(),
  paciente_id     uuid not null references pacientes(id) on delete restrict,
  medico_id       uuid not null references medicos(id)   on delete restrict,
  inicio          timestamptz not null,
  fin             timestamptz not null,
  rango           tstzrange generated always as (tstzrange(inicio, fin, '[)')) stored,
  estado          estado_cita not null default 'reservada',
  motivo          text,
  origen          text not null check (origen in ('portal','administrativo')),
  creada_por      uuid references perfiles(id),
  reprogramada_de uuid references citas(id),
  cancelada_en    timestamptz,
  cancelada_por   uuid references perfiles(id),
  creada_en       timestamptz not null default now(),
  check (fin > inicio),

  -- Caso borde "doble reserva": un médico no puede tener dos citas vigentes solapadas.
  constraint citas_sin_cruce_medico
    exclude using gist (medico_id with =, rango with &&)
    where (estado in ('reservada','confirmada')),

  -- Un paciente tampoco puede estar en dos sitios a la vez.
  constraint citas_sin_cruce_paciente
    exclude using gist (paciente_id with =, rango with &&)
    where (estado in ('reservada','confirmada'))
);

create index citas_medico_inicio_idx   on citas (medico_id, inicio);
create index citas_paciente_inicio_idx on citas (paciente_id, inicio desc);
create index citas_estado_inicio_idx   on citas (estado, inicio);
```

La restricción `EXCLUDE` es el punto crítico del módulo de agenda: resuelve la doble reserva **en
el motor**, bajo concurrencia real. Un `SELECT` de "¿está libre?" seguido de un `INSERT` no lo
resuelve — dos administrativos reservando el mismo slot en el mismo instante pasarían ambos el
chequeo. No sustituyas la restricción por validación en la aplicación; la validación previa existe
solo para mostrar un mensaje amable antes de intentar el insert.

### Historias clínicas

```sql
-- «No se guarda con campos vacíos»: btrim() solo recorta espacios y deja pasar un campo con tabuladores o saltos de
-- línea; se exige al menos un carácter que no sea espacio en blanco.
create function public.texto_con_contenido(p_texto text) returns boolean
language sql immutable parallel safe as $$ select p_texto ~ '[^[:space:]]' $$;

-- Carpeta: una por paciente, creada al registrar al paciente (disparador crear_historia_clinica(), SECURITY DEFINER).
create table historias_clinicas (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete restrict,
  numero      text not null unique,              -- correlativo visible de historia (HC-000001)
  creado_en   timestamptz not null default now(),
  constraint historias_clinicas_id_paciente_unico unique (id, paciente_id)   -- para la clave compuesta de atenciones
);

-- Nota de atención: una por consulta. Inmutable una vez firmada (disparador proteger_atencion_firmada()).
create table atenciones (
  id               uuid primary key default gen_random_uuid(),
  historia_id      uuid not null,
  paciente_id      uuid not null references pacientes(id) on delete restrict,  -- denormalizado para RLS
  cita_id          uuid unique references citas(id) on delete set null,
  medico_id        uuid not null references medicos(id) on delete restrict,
  motivo_consulta  text not null check (public.texto_con_contenido(motivo_consulta)),
  anamnesis        text not null check (public.texto_con_contenido(anamnesis)),
  examen_fisico    text not null check (public.texto_con_contenido(examen_fisico)),
  diagnosticos     jsonb not null default '[]'::jsonb,  -- [{cie10, descripcion, tipo}]
  plan_tratamiento text not null check (public.texto_con_contenido(plan_tratamiento)),
  firmada_en       timestamptz,
  creado_en        timestamptz not null default now(),
  check (jsonb_typeof(diagnosticos) = 'array' and jsonb_array_length(diagnosticos) > 0),
  -- paciente_id está denormalizado porque la política RLS se apoya en él: esta clave compuesta garantiza que
  -- coincida con el paciente dueño de la historia.
  constraint atenciones_historia_del_paciente
    foreign key (historia_id, paciente_id) references historias_clinicas (id, paciente_id) on delete restrict
);

create index atenciones_paciente_idx on atenciones (paciente_id, creado_en desc);
create index atenciones_medico_idx   on atenciones (medico_id, creado_en desc);

-- Corrección posterior a la firma: nunca se edita la nota original.
create table addendas (
  id          uuid primary key default gen_random_uuid(),
  atencion_id uuid not null references atenciones(id) on delete restrict,
  medico_id   uuid not null references medicos(id) on delete restrict,
  texto       text not null check (public.texto_con_contenido(texto)),
  creado_en   timestamptz not null default now()
);

-- Única fuente de verdad de "paciente a cargo" (ADR-0016). Append-only: nunca se
-- edita una fila existente, se inserta una nueva (mismo principio que atenciones/antecedentes).
create table asignaciones_paciente_medico (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references pacientes(id) on delete cascade,
  medico_id     uuid not null references medicos(id) on delete cascade,
  vigente_desde date not null default public.hoy_lima(),
  vigente_hasta date,
  motivo        text
  -- sin CHECK de orden entre fechas: una cita pasada ya vencida genera una asignación que nace vencida
);

create index asignaciones_paciente_idx on asignaciones_paciente_medico (paciente_id, medico_id);
-- Una asignación por cita aunque la cita cambie de estado varias veces.
create unique index asignaciones_motivo_cita_unico on asignaciones_paciente_medico (motivo) where motivo like 'cita:%';
```

Una fila se crea de dos formas: automáticamente cuando una cita alcanza `confirmada`/`atendida`
por primera vez (`vigente_hasta = inicio + 6 meses`, sin necesidad de que nadie la gestione a
mano), o manualmente por el administrativo vía `asignarPacienteAMedico` para casos especiales
(interconsulta, cobertura de colega, médico de cabecera con `vigente_hasta` nulo = sin
vencimiento). Ver [ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md) para la
justificación completa, incluidas las alternativas descartadas.

```sql
-- Otorga acceso automáticamente al confirmar o atender una cita (ADR-0016).
-- security definer: no depende de que quien confirma la cita tenga permiso de escritura
-- directa sobre asignaciones_paciente_medico. Usa TG_OP (en un disparador de INSERT, `old` no existe), las fechas
-- de Lima y no duplica la asignación de una misma cita (índice único parcial sobre `motivo` 'cita:%').
create or replace function public.extender_asignacion_por_cita()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado in ('confirmada','atendida')
     and (tg_op = 'INSERT' or old.estado not in ('confirmada','atendida'))
     and not exists (select 1 from public.asignaciones_paciente_medico a where a.motivo = 'cita:' || new.id) then
    insert into public.asignaciones_paciente_medico
      (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo)
    values
      (new.paciente_id, new.medico_id, public.hoy_lima(),
       ((new.inicio at time zone 'America/Lima')::date + interval '6 months')::date,
       'cita:' || new.id);
  end if;
  return new;
end;
$$;

create trigger citas_extender_asignacion
  after insert or update on citas
  for each row execute function public.extender_asignacion_por_cita();
```

Dispara una sola vez por cita (al entrar por primera vez a `confirmada` o `atendida`, no en cada
transición posterior), así `confirmada → atendida` no duplica la fila. Cancelar la cita **no**
revoca el acceso ya otorgado — se deja expirar de forma natural a los 6 meses; es una
simplificación deliberada (ver trade-off en ADR-0016), mitigada por la auditoría de lecturas en
`accesos_historia`.

**Los datos demográficos del paciente no están en `atenciones`.** La regla del PRD ("los datos ya
cargados desde el registro del paciente no son editables desde la historia clínica") se cumple por
estructura, no por validación: el formulario de historia clínica no tiene esas columnas que
escribir, así que no existe ruta de código capaz de modificarlas.
Esa misma separación entre `pacientes` (filiación) y `atenciones` (información clínica) es la que el art. 22.g del
DS 009-2017-SA pide a los sistemas acreditables (ver P-11); la comprobación formal contra la norma queda pendiente.

Los antecedentes del paciente son datos persistentes del **paciente** (no de una atención puntual)
y deben ser consultables en tiempo real, por eso viven en su propia tabla en vez de en un campo de
`atenciones` ([ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md)):

```sql
create table antecedentes (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references pacientes(id) on delete restrict,
  tipo           tipo_antecedente not null,
  descripcion    text not null check (public.texto_con_contenido(descripcion)),
  vigente        boolean not null default true,
  registrado_por uuid not null references medicos(id) on delete restrict,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index antecedentes_paciente_idx on antecedentes (paciente_id) where vigente;
```

Un antecedente resuelto no se elimina ni se sobrescribe: se marca `vigente = false` y, si
corresponde, se inserta uno nuevo con el estado actualizado — mismo principio de no-destrucción que
rige `atenciones`. Las políticas RLS de `antecedentes` son las mismas que las de `atenciones` (ver
«Seguridad y control de acceso»).

El catálogo de diagnósticos respalda `atenciones.diagnosticos`
([ADR-0014](adrs/0014-catalogo-cie-10.md)):

```sql
create table cie10 (
  codigo      text primary key,
  descripcion text not null,
  capitulo    text
);
```

Cada entrada de `atenciones.diagnosticos` debe referenciar un `codigo` existente en `cie10`; la
validación exacta (`CHECK`, trigger o `FOREIGN KEY` funcional sobre el `jsonb`) se define al
construir el formulario de diagnóstico (hito H6), junto con la carga inicial del catálogo por
migración de datos (ver [ADR-0014](adrs/0014-catalogo-cie-10.md) para fuente y mecanismo de carga).

**Datos por especialidad** ([ADR-0029](adrs/0029-datos-clinicos-por-especialidad.md), Aceptado el 2026-10-10; detalle en
`openspec/changes/historias-clinicas/design.md`, D15). No se crea una tabla por especialidad:

- `plantillas_clinicas`: catálogo con una fila inmutable por versión de la plantilla de una especialidad
  (`especialidad_id`, `version`, `nombre`, `campos` en `jsonb` con los tipos `texto`, `entero`, `decimal`, `opcion`,
  `si_no` y `fecha`, y `vigente`). Se gestiona **por migración**: solo la lee el profesional (hoy, el médico) y ningún rol
  de usuario escribe. Cambiar una plantilla es publicar la versión siguiente.
- `atenciones.plantilla_id` (la versión exacta con que se llenó la atención) y `atenciones.datos_especialidad` (`jsonb`,
  objeto, vacío por defecto), validados por un disparador de la base (SQLSTATE `HC005`) contra la plantilla vigente de la
  especialidad del autor, inmutables al firmar y dentro de la huella desde su primera versión. La regla «especialidad del
  autor» se reescribe sobre `profesionales` si se acepta ADR-0030.
- H6 entrega el mecanismo y la plantilla de **Medicina general**. Las otras cuatro especialidades añaden su plantilla en
  H6e–H6h (migración de datos, no de esquema) y, donde la plantilla no basta (odontograma, plan de sesiones, tests con
  puntaje), tablas propias de su change.

### Turnos de enfermería

```sql
create table turnos_enfermeria (
  id              uuid primary key default gen_random_uuid(),
  enfermera_id    uuid not null references enfermeras(id) on delete cascade,
  fecha           date not null,
  turno           tipo_turno not null,
  medico_id       uuid references medicos(id) on delete set null,
  especialidad_id uuid references especialidades(id) on delete set null,
  creado_en       timestamptz not null default now(),
  unique (enfermera_id, fecha, turno),
  check (medico_id is not null or especialidad_id is not null)
);
```

Con el PRD del 2026-10-11 el turno de la enfermera no cambia de estructura (`medico_id`, o `profesional_id` si se acepta
ADR-0030): ella consulta su turno y con qué especialidad trabaja, que `especialidad_id` ya cubre. El turno no concede
lectura clínica alguna; lo nuevo que la enfermera escribe es el triaje y la derivación de la sección siguiente.

### Visitas, triaje y derivaciones

> **Propuesta** — hito H6b, change `triaje-y-derivacion` (su `design.md` fija el detalle y este resumen lo sigue);
> [ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md) está Propuesta. Esquema a nivel de columnas clave. Toda
> tabla de esta sección nace con RLS activada y con su prueba pgTAP negativa por rol.

Hoy la unidad de la agenda es la cita; la **llegada** del paciente (con o sin cita) no existe en el modelo. El PRD atiende
a ambos y exige medir la espera y el triaje previo, así que se añaden tres tablas. **Ningún rol de usuario las escribe
directamente**: cada operación es una función `SECURITY DEFINER` acotada.

| Tabla | Columnas clave |
|---|---|
| `visitas` | `paciente_id`, `cita_id` (nulo = sin cita; una visita por cita), `estado` (`llegada`, `con_triaje`, `derivada`, `en_atencion`, `atendida`, `abandonada`, `anulada`), `profesional_id` (quien la atiende ahora), `especialidad_destino_id` (mientras está derivada), `llegada_en`, `atencion_iniciada_en`, `finalizada_en` (sellados por la base), `registrada_por` |
| `triajes` | `visita_id` y `paciente_id` (clave foránea compuesta con la visita, como `atenciones`), `presion_sistolica`, `presion_diastolica`, `frecuencia_cardiaca`, `frecuencia_respiratoria`, `temperatura_c`, `saturacion_oxigeno`, `peso_kg`, `talla_cm`, `imc` (columna generada), `registrado_por`, `registrado_en` |
| `derivaciones` | `visita_id` y `paciente_id`, `especialidad_destino_id`, `origen` (`enfermera` o `profesional`), `creada_por`, `vence_en`, `motivo` (opcional, corto), `estado` (`pendiente`, `tomada`, `cerrada`, `vencida`, `anulada`), `tomada_por`, `tomada_en`, `derivacion_previa_id` |

- **Visita** ([ADR-0033](adrs/0033-visita-del-paciente-llegada-y-estados.md)). Una sola en curso por paciente, con una máquina de estados cerrada (una operación por transición) que valida
  la base. **No se acopla a la cita**: llegar no cambia `citas.estado` (es de H3) y el paciente sin cita no tiene fila en
  `citas`, así que no entra en el 75 % de autogestión. Una visita de un día anterior se cierra de forma perezosa, sin un cron
  nuevo ([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md) limita el proyecto a uno diario). El vínculo con la
  atención no es una columna nueva de `atenciones`, para no reabrir la estructura firmada y con huella de H6 (D15 de
  `historias-clinicas`). Recepción registra antes al paciente y abre su historia (H3, ítem 5); la llegada toma a un paciente ya
  registrado.
- **Triaje.** Las siete mediciones del PRD, cada una con un `CHECK` de rango de plausibilidad; el IMC (`peso_kg / (talla_cm /
  100)^2`) es una columna generada, nunca la escribe el cliente. Es dato clínico pero no una atención: no se firma, **no se
  edita** y puede haber varios por visita (corregir es registrar otro; vale el más reciente). Peso y talla son opcionales como
  par, para quien no puede ponerse de pie.
  <!-- REVISAR: los rangos de plausibilidad y que peso y talla sean opcionales como par son propuestas del change `triaje-y-derivacion`; el PRD lista siete mediciones y los rangos los valida el personal clínico. -->
- **Derivación** ([ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md)). El destino es una **especialidad**,
  nunca un profesional (la tabla no tiene columna para indicarlo). La enfermera deriva visitas sin cita que ya tienen triaje;
  un profesional que tiene al paciente en atención puede derivarlo a **otra** especialidad. Crear una derivación **no da
  acceso a nadie**, tampoco a la enfermera. `vence_en` es el fin del día de Lima y se evalúa al leer, sin cron. Incluye el estado
  `anulada` (corregir un error antes de que alguien tome al paciente), que ya recoge la ADR-0032.
- **Tomar al paciente.** `tomar_paciente(visita)` (`SECURITY DEFINER`, `search_path` vacío) bloquea la fila de la visita, de
  modo que si dos profesionales de la especialidad de destino lo intentan a la vez gana uno y el otro recibe un error propio de
  H6b (la exclusividad la da la base, como en la doble reserva). Marca la derivación `tomada` y la visita `en_atencion`, y un
  disparador inserta la asignación en `asignaciones_paciente_profesional` (append-only, motivo `derivacion:<id>`, vigencia
  acotada). Si el paciente tiene cita, la toma el profesional de la cita y **no** crea una asignación nueva (la cita confirmada
  ya la dio, [ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)).
  <!-- REVISAR: ADR-0032 no fija la vigencia de la asignación por derivación. El change propone 7 días de forma provisional (una sola función a cambiar); lo decide el usuario con la clínica y, por ser acceso a datos de salud, conviene llevarlo al asesor. -->

**RLS (Propuesta, siguiendo el change).**

- **Escritura:** ningún `GRANT` de `INSERT`, `UPDATE` ni `DELETE` a ningún rol de usuario ni a `anonymous`,
  `cron_notificaciones` o `sync_identidad`; solo las funciones `registrar_llegada`, `cerrar_visita`, `registrar_triaje`,
  `derivar_paciente`, `anular_derivacion`, `tomar_paciente` y `terminar_atencion`, cada una con un guarda de rol y de
  actividad como primera sentencia y la identidad tomada del token, nunca de un parámetro.
- **Lectura directa:** el administrativo lee `visitas` (datos logísticos), pero no `triajes` ni `derivaciones`; el profesional
  lee las visitas que atiende, los `triajes` de los pacientes que tiene a cargo (`profesional_tiene_paciente()`) y las
  derivaciones que creó o tomó.
- **La enfermera no tiene política sobre ninguna tabla**, ni siquiera `pacientes`: un `SELECT` de RLS expondría todas sus
  columnas. Triar con las funciones `visitas_para_triaje()` (visitas de hoy: nombre, documento, fecha de nacimiento, estado y hora
  de llegada, y nada de filiación ni contacto) y `triajes_de_la_visita()` (mientras la visita no ha sido tomada). Una prueba
  fija la lista exacta de columnas devueltas.
- **Cola del profesional:** `derivaciones_pendientes()` devuelve, de su propia especialidad, solo quién espera y desde cuándo
  (nombre, llegada, origen), sin documento, motivo ni triaje: aún no tiene al paciente a cargo y la derivación no da acceso.
- `asignaciones_paciente_profesional`: la inserción por derivación solo ocurre en el disparador de «tomar»; la política de
  inserción del administrativo rechaza también el prefijo `derivacion:`, además de `cita:`.

### Recetas

> **Propuesta** — hito H6c, change `recetas-medicas` y [ADR-0035](adrs/0035-recetas-funciones-acotadas-numeracion-y-medicamentos.md)
> (su `design.md` fija el detalle y este resumen lo sigue). Esquema a nivel de columnas clave. Toda tabla nace con RLS y su prueba pgTAP negativa por rol.

| Tabla | Columnas clave | Nota |
|---|---|---|
| `profesiones_que_recetan` | `profesion` (clave), `puede_recetar`, `confirmada`, `referencia` | Catálogo gestionado **por migración**; ningún rol de usuario lo lee ni lo escribe. Semilla: médico sí y psicólogo no (confirmados por el usuario); odontólogo, fisioterapeuta y podólogo en «no» y sin confirmar hasta que se decida. Una profesión sin confirmar nunca queda autorizada |
| `recetas` | `id` (lo aporta el formulario: idempotencia), `numero` (correlativo único), `paciente_id`, `atencion_id` (opcional), `profesional_id` (emisor, de la sesión), `reemplaza_a`, instantánea del emisor (nombre, colegiatura, profesión y especialidad), `establecimiento`, `lugar_emision`, `emitida_en`, `valida_hasta`, `indicaciones_generales`, `estado` (`emitida` o `anulada`), `motivo_anulacion`, `anulada_por`, `anulada_en`, `huella` | Datos estructurados; la hoja impresa se genera de ellos |
| `receta_items` | `receta_id`, `orden` (1 a 8), `dci` (denominación común, obligatoria), `nombre_comercial`, `concentracion`, `forma_farmaceutica`, `via`, `dosis_por_toma`, `frecuencia`, `duracion_dias`, `cantidad_total`, `indicaciones` | Un ítem por medicamento; inmutable |
| `impresiones_receta` | `receta_id`, `secuencia`, `impreso_por`, `impreso_en` | Solo-agregar; la primera impresión es «Original» y las siguientes «Duplicado» |

- **Solo receta común impresa.** La plantilla es una hoja de la aplicación con hoja de estilos de impresión sobre los datos
  guardados, con espacio para firma y sello manuscritos: no se almacena un PDF ni hay firma digital de receta ni receta
  especial (fuera de alcance). La receta no copia la filiación del paciente (el DS 009-2017-SA, art. 22.g, pide separarla de la
  información clínica): nombre, documento y edad se leen de `pacientes` al imprimir.
  <!-- REVISAR: contenido mínimo de la receta según el DS 014-2011-SA, art. 56 (conocido solo por Saniape, nivel C de la investigación) y plazo de validez de la receta (no se conoce de ninguna norma); validar con el asesor. -->
- **Emisión atómica e inmutable.** Ningún rol de usuario escribe las tablas: `emitir_receta()` (`SECURITY DEFINER`) valida rol,
  profesión, paciente a cargo y contenido, fija número, fecha y emisor con el reloj y la base del servidor, y guarda cabecera,
  ítems y huella en una sola transacción; llamarla dos veces con el mismo `id` devuelve la misma receta. Una receta con datos
  incompletos no se emite ni se imprime (la base rechaza también los campos vacíos o con solo caracteres invisibles). Una receta
  emitida no se edita ni se borra: `anular_receta()` la anula, solo su emisor y con motivo, y se emite otra que la reemplaza,
  en un solo paso si se desea. Errores propios `HC030`–`HC036`.
- **Numeración correlativa, sin huecos y a prueba de concurrencia.** El número se toma dentro de la transacción de emisión con
  un bloqueo consultivo de transacción: una emisión que falla no consume número, y la anulada conserva el suyo.
- **Solo quien puede recetar.** `profesional_puede_recetar()` contrasta `profesion_actual()` (leída de `profesionales`, no del
  token) con el catálogo; un profesional sin permiso no emite ni por consulta directa. Solo el emisor imprime
  (`registrar_impresion_receta()`), y solo recetas emitidas.
- **Medicamentos del paciente.** La vista `medicamentos_vigentes_del_paciente` (`security_invoker`) entrega los medicamentos
  de las recetas emitidas cuyo tratamiento sigue vigente (fecha de emisión más la duración, con un día de margen) a todo
  profesional que tenga al paciente a cargo, psicólogos incluidos, y a nadie más; solo depende de `recetas` y `receta_items` y no
  expone nada de Psicología. Se muestra antes de recetar y **sin alertas automáticas de interacción**: el sistema muestra y el
  profesional decide (ver P-7).
- **RLS (Propuesta, siguiendo el change).** Leen `recetas` y `receta_items` los profesionales que tienen al paciente a cargo, de
  cualquier profesión (historia compartida: ven las de sus colegas); `impresiones_receta`, solo el emisor. No las leen el
  administrativo (salvo la copia), la enfermera ni el paciente, que recibe el papel. Sin `GRANT` para `anonymous`,
  `cron_notificaciones` ni `sync_identidad`. Cada lectura se registra en `accesos_historia` (tipos `receta` y `medicamentos`) en
  la misma transacción, y la auditoría de escritura no copia contenido.
- **Indicador del 90 %.** «Emitidas e impresas» se mide con `impresiones_receta`.

### Solicitudes de copia de la historia

> **Propuesta** — hito H6d, change `copia-de-historia-clinica` y [ADR-0034](adrs/0034-emision-de-la-copia-de-la-historia-clinica.md)
> (su `design.md` fija el detalle y este resumen lo sigue). La
> NTS 139 (4.2.14 y literal h) exige entregar la copia al paciente en máximo 5 días (verificado en la
> [investigación](investigacion-marco-legal-y-saniape.md), sección 3).

`solicitudes_copia_historia` (RLS activada, sin `UPDATE` ni `DELETE` para ningún rol de usuario). Columnas clave: `numero`
(correlativo visible, el **folio** de la copia), `paciente_id`, el solicitante (`solicitante_tipo`: `paciente` o
`representante_legal`, y el change propone además `autoridad`; nombres, tipo y número de documento, vínculo), `registrada_por`,
`solicitada_en` y `vence_en` (fijados por la base), la verificación (`verificada_por`, `verificada_en`, método de identidad,
acreditación de la representación), el rechazo (`rechazada_por`, motivo) y la emisión (`generaciones`, huella del contenido,
`emitida_por`, `emitida_en`, motivo de la demora si fue tarde). Estados almacenados: `solicitada` → `verificada` → `emitida`, y
`rechazada`; **`vencida` no se almacena**: es una condición derivada (abierta y pasada de `vence_en`), porque un estado
almacenado exigiría un cron que el plan Hobby no permite.
<!-- REVISAR: la NTS 139 dice «máximo 5 días»; no se verificó si son hábiles o calendario. El change cuenta días calendario desde el día de la solicitud (el criterio más estricto) mediante una función reemplazable. -->

- **Quién y cómo.** Recepción registra la solicitud, **verifica la identidad** del solicitante en persona con el documento
  original (el paciente, o su representante legal con su acreditación) y registra quién la emite. Una persona menor de edad no
  la pide por sí misma: la solicita su representante. Si la identidad no se verifica o el representante no acredita serlo, la
  solicitud pasa a `rechazada` con motivo y **queda registrada**: no se borra.
  <!-- REVISAR: se supone una solicitud presencial en recepción (el PRD no incluye pedirla desde el portal); quién puede solicitar (herederos, autoridades) y qué acredita la representación lo decide el asesor. -->
- **Contenido.** La copia incluye filiación y número de historia, antecedentes, atenciones **firmadas** y sus addendas,
  triajes, recetas, las secciones de las especialidades, la información de Psicología (decisión del usuario) y los adjuntos
  vigentes; no entran los borradores sin firmar, y la copia declara qué excluye. Una prueba de cobertura (tarea 3.4 del change)
  falla si se crea una tabla de `public` que el compilado no menciona ni figura en su lista de exclusiones con su razón: toda
  tabla clínica nueva, incluidas las de H6i y las de las especialidades, se clasifica y aporta su sección.
- **Cómo se produce sin abrir la historia al administrativo.** El administrativo no lee contenido clínico, y un no psicólogo no
  puede leer Psicología. **Propuesta del change (la recomendada entre cuatro alternativas):** la función
  `compilar_copia_historia()` (`SECURITY DEFINER`, solo administrativo, solicitud verificada, a lo sumo 3 generaciones)
  inserta el registro de acceso (`accesos_historia`, tipo `copia`) en la misma transacción y entrega el contenido **solo al
  servidor**, que arma el documento en memoria; recepción lo imprime frente al solicitante, en sobre cerrado, y
  `confirmar_entrega_copia()` cierra la solicitud. Ninguna pantalla muestra contenido clínico; el documento no se guarda en
  Blob. El límite de la garantía es que quien tiene el papel puede leerlo.
  <!-- REVISAR: el usuario debe aceptar que el documento impreso transite por el navegador y la impresora de recepción (ver P-16); si no, habría que enmendar el PRD (acceso del paciente por cuenta propia). El doble control y el aviso al paciente son endurecimientos opcionales del change. -->
- **Plazo.** `app/administrativo/copias-historia/` lista las solicitudes abiertas por vencimiento («Vence en 3 días»,
  «Vencida hace 2 días»), sin gráficos ni cron; sirve al indicador del 100 % de solicitudes entregadas en 5 días o menos.
- **Autenticación de la copia.** Folio y «Página n de N» en cada página, huella del contenido y sello del sistema detrás de
  una interfaz reemplazable (como `ProveedorFirma`, P-5). Ninguna pantalla afirma que cumple la NTS 139: que un sello del
  sistema baste como «copia autenticada» lo decide el asesor.
- **RLS (Propuesta, siguiendo el change).** `SELECT` e `INSERT` solo del administrativo; profesional, enfermera y paciente no la
  leen, ni siquiera el titular: no hay portal para esto.

### Información de Psicología

> **Propuesta** — [ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) está Propuesta. Las tablas de Psicología
> (evaluación estructurada, tests con puntaje, notas de sesión, sesiones recurrentes) son del change
> `especialidad-psicologia` (H6g), aún no escrito; aquí solo se describe cómo se aíslan.

- **Categoría restringida, impuesta en la base.** Toda tabla de Psicología lleva `paciente_id` y el profesional autor, nace con
  RLS y tiene una única política de lectura y escritura: `psicologo_tiene_paciente(paciente_id)` (nombre propuesto), es decir,
  rol profesional, profesión `psicologo` (de `profesionales.profesion`, nunca del token), activo y con el paciente a cargo. No
  hay política para el administrativo, la enfermera, el paciente, los demás profesionales a cargo, `anonymous`,
  `cron_notificaciones` ni `sync_identidad`. Abrir la dirección de la pantalla de un tercero devuelve «no existe» (404), sin
  confirmar la existencia.
- **Los tests y las sesiones de Psicología** usan los mecanismos comunes de H6i (aplicaciones de instrumentos con
  `area = psicologia` y planes de sesiones de un psicólogo): heredan esta misma restricción y no abren una vía paralela.
- **Los medicamentos no pasan por aquí.** Salen de `recetas`, que Psicología no emite, y son visibles para todo profesional a
  cargo: la excepción no los filtra.
- **La atención genérica del psicólogo.** `atenciones` es legible por todo profesional a cargo; si un psicólogo escribe allí
  su motivo, examen o diagnóstico, esa información dejaría de estar reservada. **Propuesta:** la política de lectura de
  `atenciones` y `addendas` oculta las de autor psicólogo a quien no sea psicólogo a cargo (defensa en profundidad, con una
  función `SECURITY DEFINER` sobre la profesión del autor). Lo decide `especialidad-psicologia`.
  <!-- REVISAR: el PRD fija qué es reservado (resultados y notas de sesión) pero no si el resto de la atención de un psicólogo también lo es; los diagnósticos CIE-10 de un psicólogo (códigos F) caen en la misma duda. -->
- **Lo que otros changes ya respetan.** Una derivación hecha por un psicólogo no lleva texto libre (H6b, D10); la copia al
  paciente sí incluye Psicología tras verificar la identidad (H6d); los medicamentos se muestran sin Psicología (H6c).
- **Adjuntos y auditoría.** Si Psicología admite adjuntos, la clave del archivo se obtiene solo de una fila legible por el
  psicólogo a cargo (mismo patrón que `adjuntos_historia`). Cada lectura registra su acceso y la auditoría de escritura usa
  `registrar_auditoria_sin_contenido()` (H6b), que no vuelca el contenido de estas tablas.
- **Pruebas.** Prueba pgTAP negativa **por rol y por profesión** (el médico, el odontólogo, el fisioterapeuta y el podólogo
  a cargo no leen; un psicólogo sin el paciente a cargo, tampoco), verificación por mutación y revisión con `code-review`.
  Las reglas de salud mental y el caso de emergencia se llevan al asesor legal (P-14).

### Mecanismos comunes de las especialidades

> **Propuesta** — hito H6i, change `mecanismos-clinicos-comunes` (aún por escribir; se construye antes que H6e a H6h). Aquí
> solo se anota lo que ya fija la actualización del PRD; el diseño fino será del change.

Varias especialidades necesitan lo mismo, así que se construye una vez y cada una lo **usa** con su propio catálogo de
protocolos o de instrumentos, sin redefinirlo:

- **Planes de sesiones** (`planes_de_sesiones`, `sesiones_del_plan`): un plan de un paciente con un profesional (descripción o
  protocolo, total de sesiones, frecuencia en días, vigencia y estado `activo`, `completado` o `cancelado`) que se apoya en
  las **citas** de H3 sin reemplazarlas —cada sesión es una cita o queda por agendar— y lleva el **contador de sesiones
  restantes**. Sin cobros ni saldos en dinero. Cubre la sesión a la que el paciente no asiste, la reprogramada, el paciente
  que abandona y el plan con sesiones recurrentes programadas solas. Lo usan el plan de sesiones de Fisioterapia, el plan de
  controles y los protocolos por sesiones de Podología y las sesiones recurrentes de Psicología.
  <!-- REVISAR: «programadas solas» no debe exigir un cron nuevo (ADR-0028 limita el proyecto a uno diario); se supone que las citas de la serie se crean al crear el plan. Lo decide el change. -->
- **Instrumentos de evaluación con puntaje** (`instrumentos_evaluacion`, `aplicaciones_instrumento`): catálogo gestionado
  **por migración** (clave, nombre, ítems, reglas de puntaje, interpretación, `area` —`psicologia`, `fisioterapia`…— y
  `uso_libre`) y aplicaciones con las respuestas y un puntaje **calculado en el servidor y en la base**. El profesional puede
  ajustar la interpretación, no el puntaje. Solo instrumentos de uso libre. Lo usan los tests de Psicología y el test
  funcional de Fisioterapia.
  <!-- REVISAR: las licencias de los instrumentos no están verificadas; «de uso libre» es la condición del PRD, no una comprobación hecha (ver P-18). -->
- **Visibilidad** ([ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)). Lo de `area = psicologia` (las
  aplicaciones de sus tests y los planes de sesiones de un psicólogo) es información restringida: solo lo lee y escribe un
  psicólogo a cargo. Lo de las demás áreas lo lee todo profesional a cargo y lo escribe solo un profesional de la profesión
  que corresponde (`profesion_actual()`).
- **Reglas comunes.** Estas tablas nacen con RLS y su prueba pgTAP negativa por rol y por profesión (pruebas 80–81, SQLSTATE
  `HC090`–`HC099`), reutilizan `registrar_auditoria_sin_contenido()` de H6b, registran cada lectura de contenido clínico y se
  clasifican en el compilado de la copia (H6d, tarea 3.4).

### Notificaciones y auditoría

```sql
create table notificaciones (
  id              uuid primary key default gen_random_uuid(),
  cita_id         uuid not null references citas(id) on delete cascade,
  tipo            text not null check (tipo in ('recordatorio_24h','confirmacion_reserva','cancelacion')),
  canal           text not null default 'email',
  destinatario    text not null,
  programada_para timestamptz not null,
  estado          estado_notificacion not null default 'pendiente',
  intentos        smallint not null default 0,
  enviada_en      timestamptz,
  proveedor_id    text,
  error           text,
  -- Idempotencia: garantiza que el paciente nunca reciba el mismo aviso dos veces.
  unique (cita_id, tipo)
);

create index notificaciones_pendientes_idx
  on notificaciones (programada_para) where estado in ('pendiente','fallida');

-- Auditoría de escritura, alimentada por triggers.
create table auditoria (
  id            bigserial primary key,
  actor_id      uuid,
  actor_rol     rol_usuario,
  accion        text not null,          -- INSERT | UPDATE | DELETE
  tabla         text not null,
  registro_id   text not null,
  datos_antes   jsonb,
  datos_despues jsonb,
  creado_en     timestamptz not null default now()
);

-- Auditoría de LECTURA de historias clínicas: necesaria para detectar acceso indebido.
create table accesos_historia (
  id          bigserial primary key,
  actor_id    uuid not null,
  paciente_id uuid not null,
  atencion_id uuid,
  creado_en   timestamptz not null default now()
);

create index accesos_historia_paciente_idx on accesos_historia (paciente_id, creado_en desc);
```

El registro de accesos de lectura no es opcional: sin él, "un profesional no puede acceder a historias
de pacientes que no tiene a cargo" es una afirmación que nadie puede verificar tras un incidente. Se
escribe desde la Server Action que abre una historia clínica.

**Propuesta (PRD del 2026-10-11):** el mismo registro cubre las lecturas de las tablas nuevas —triaje, recetas y
medicamentos, Psicología y la generación de la copia— con su propio tipo de acceso (la columna `tipo_acceso` la introduce H6,
D6 de `historias-clinicas`; H6c y H6d la amplían). Una lectura de Psicología deja siempre su rastro, y la auditoría de
escritura de las tablas clínicas nuevas usa `registrar_auditoria_sin_contenido()` (creada por H6b y reutilizada por los demás
changes, para no pisar la lista cerrada de `registrar_auditoria()`), de modo que no vuelca contenido, igual que ya hace H2 con
las suyas.

## Seguridad y control de acceso

### Rol en el token y contexto de usuario en Postgres

El rol se guarda en `publicMetadata.rol` del usuario de Clerk y llega en el token de sesión como
`publicMetadata: { rol }` (**anidado**, no un `rol` de primer nivel). Neon valida ese JWT **dentro de
la base de datos** vía **Neon RLS Authorize** (extensión `pg_session_jwt`, ya instalada en el proyecto de
Neon): la JWKS de Clerk se registra por la API de Neon (`POST /projects/{id}/jwks` con `branch_id`, de modo
que cada entorno tiene la JWKS de su propia instancia de Clerk) y no se hereda a los branches nuevos. Las
funciones `auth.user_id()` (el `sub` del JWT) y `auth.session()` (claims completos) son el reemplazo casi
directo de `auth.uid()`/`auth.jwt()` de Supabase — ver [ADR-0023](adrs/0023-contexto-de-usuario-para-rls.md) y
el resultado de ejecutarlo de extremo a extremo en [spike-rls-h2.md](spike-rls-h2.md).

```ts
// lib/db/cliente-autenticado.ts — conveniencia de código, no el límite de seguridad:
// la verificación del JWT ocurre dentro de Neon y Postgres, no en este helper.
const sql = neon(process.env.DATABASE_AUTHENTICATED_URL!, { authToken }); // URL directa del rol authenticator
await sql.transaction((tx) => [tx`set local role authenticated`, ...consultas(tx)]);
```

Lo que Neon hace realmente, y que el diseño respeta:

- La conexión entra como **`authenticator`** (rol de login **sin privilegios sobre ninguna tabla** y sin
  herencia) y cada petición ejecuta `set local role authenticated` como primera sentencia de una transacción. Si
  un helper lo olvidara, la consulta falla cerrada (`permission denied`), no se abre.
- Solo HTTP, un token y un rol por petición: nunca `Pool`/`Client` con WebSocket para consultas autenticadas (una
  conexión reutilizada podría conservar la identidad de otro usuario). URL directa, no pooled.
- `authenticated` es `NOLOGIN` y **no tiene `USAGE` sobre el esquema `auth`** (es de `cloud_admin` y no se puede
  conceder): toda función que lea `auth.*` es `SECURITY DEFINER` con `search_path` vacío. Las políticas sí pueden
  llamar a `auth.*` directamente, pero todas pasan por `public.rol_actual()`.
- Neon dejó **privilegios por defecto abiertos** (`authenticated` recibía DML sobre toda tabla nueva): la primera
  migración los revoca y cada tabla recibe `GRANT` explícito, alineado con sus políticas.
- El token vencido se rechaza con una tolerancia de decenas de segundos; el token solo viaja entre el servidor
  de la aplicación y Neon y nunca se guarda.

`auth.user_id()` da el ID de Clerk (texto), no el `perfiles.id` interno (uuid) que el resto del esquema
referencia — de ahí las funciones de resolución de «Funciones de apoyo».

Consecuencia operativa: un cambio de rol **no surte efecto hasta que la sesión de Clerk se refresca**. Al
desactivar o degradar a un usuario hay que revocar sus sesiones activas vía la API de Clerk
(`banUser`/revocar sesiones), no solo actualizar la fila en `perfiles`.

El renombre `medico` → `profesional` (ADR-0030, **Propuesta**) es un cambio de rol de todo el personal clínico a la vez, y
Clerk, la aplicación y la base cambian por separado. H2c lo resuelve con una sola migración atómica (sin alias de los nombres
viejos), con una tolerancia transitoria que hace que `rol_actual()` trate el valor `medico` del token como `profesional`, y
con un script que actualiza el metadato de cada usuario de Clerk; cuando no queda ninguno, otra migración restituye la
función estricta (ver P-13).

### Funciones de apoyo

Todas las que leen `auth.*` son `SECURITY DEFINER` con `search_path` vacío, y `EXECUTE` solo para
`authenticated`. Sin `search_path` vacío, un usuario podría crear objetos en su propio esquema y secuestrar la
resolución de nombres dentro de la función.

```sql
-- El rol de aplicación del token: ÚNICO lugar donde se lee la ruta del claim.
create function public.rol_actual() returns text
language sql stable security definer set search_path = ''
as $$ select auth.session() -> 'publicMetadata' ->> 'rol' $$;

-- Resuelven el ID de Clerk (auth.user_id(), texto) a las filas internas (uuid).
create function public.perfil_actual() returns uuid
language sql stable security definer set search_path = ''
as $$ select pf.id from public.perfiles pf where pf.clerk_user_id = auth.user_id() $$;
-- paciente_actual(), medico_actual() y enfermera_actual(): igual, sobre pacientes/medicos/enfermeras por perfil_id.

-- El id de Clerk que Postgres validó (comprobación de extremo a extremo, ruta /api/db-sesion).
create function public.usuario_actual() returns text
language sql stable security definer set search_path = ''
as $$ select auth.user_id() $$;

-- Fecha de hoy en la zona de la clínica: current_date depende del TimeZone del servidor (UTC en Neon).
create function public.hoy_lima() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

-- ¿El médico autenticado tiene a este paciente a su cargo? Única fuente: asignaciones_paciente_medico, vigente
-- (fechas de Lima) y con el médico activo — ADR-0016.
create function public.medico_tiene_paciente(p_paciente uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.asignaciones_paciente_medico a
    join public.medicos m on m.id = a.medico_id and m.activo
    where a.paciente_id = p_paciente
      and a.medico_id = public.medico_actual()
      and a.vigente_desde <= public.hoy_lima()
      and (a.vigente_hasta is null or a.vigente_hasta >= public.hoy_lima())
  );
$$;
```

Funciones de apoyo que añade el PRD del 2026-10-11 (**Propuesta**; todas siguen la regla de esta sección:
`SECURITY DEFINER` con `search_path` vacío cuando leen `auth.*` o cruzan RLS, y `EXECUTE` solo para quien corresponde):

| Función | Qué hace | Hito | Estado |
|---|---|---|---|
| `profesional_actual()`, `profesional_tiene_paciente(p_paciente)` | Reemplazan a `medico_actual()` y `medico_tiene_paciente()`: misma fuente (`asignaciones_paciente_profesional` vigente, fechas de Lima, profesional activo) | H2c | Propuesta (ADR-0030) |
| `profesion_actual()` | La profesión del profesional autenticado, leída de `profesionales`; único punto de lectura de la profesión | H2c | Propuesta (ADR-0030) |
| `psicologo_tiene_paciente(p_paciente)` | `profesional_tiene_paciente()` **y** `profesion = 'psicologo'` (nombre propuesto) | H6g | Propuesta (ADR-0031) |
| `profesional_puede_recetar()` | La profesión del profesional actual figura como autorizada en `profesiones_que_recetan` | H6c | Propuesta |
| `emitir_receta()`, `anular_receta()`, `registrar_impresion_receta()` | Únicas vías de escritura de las recetas y sus impresiones: validan rol, profesión, paciente a cargo, autoría y contenido; `insertar_receta()` es interna y numera bajo un bloqueo consultivo | H6c | Propuesta |
| `registrar_llegada()`, `registrar_triaje()`, `derivar_paciente()`, `anular_derivacion()`, `tomar_paciente(p_visita)`, `terminar_atencion()`, `cerrar_visita()` | Únicas vías de escritura de visitas, triajes y derivaciones; «tomar» bloquea la fila y concede la asignación por disparador | H6b | Propuesta (ADR-0032) |
| `visitas_para_triaje()`, `triajes_de_la_visita()`, `derivaciones_pendientes()` | Lecturas con lista blanca de columnas para la enfermera y para la cola del profesional; lanzan `42501` a quien no es del rol | H6b | Propuesta |
| `compilar_copia_historia()`, `confirmar_entrega_copia()` y las de verificar o rechazar la solicitud | Únicas vías de la copia; la primera es la **única** por la que el administrativo obtiene contenido clínico | H6d | Propuesta |
| Funciones de los planes de sesiones y de los instrumentos | Escrituras acotadas y puntaje calculado en la base; las define el change | H6i | Propuesta |

### Políticas RLS

RLS se activa en **todas** las tablas del esquema `public`, sin excepción (incluida la tabla de control de
migraciones `pgmigrations`). Una tabla sin RLS en este sistema es una filtración de datos clínicos. La prueba
`99_rls_en_todas_las_tablas` falla si alguna queda sin ella, y ningún rol conserva privilegios por defecto sobre
objetos nuevos. Las políticas usan `(select public.rol_actual())`:

```sql
alter table atenciones enable row level security;

-- El médico solo lee atenciones de pacientes a su cargo.
create policy atenciones_lee_el_medico_a_cargo on atenciones for select to authenticated
using (
  (select public.rol_actual()) = 'medico'
  and (select public.medico_tiene_paciente(paciente_id))
);

-- El médico solo registra atenciones propias, de pacientes a su cargo y sin firmar.
create policy atenciones_registra_el_medico on atenciones for insert to authenticated
with check (
  (select public.rol_actual()) = 'medico'
  and (select public.medico_tiene_paciente(paciente_id))
  and medico_id = (select public.medico_actual())
  and firmada_en is null
);

-- El administrativo NO lee contenido clínico. Nunca. El paciente tampoco: el PRD excluye su acceso a
-- historias clínicas. La enfermera, tampoco.
```

`(select public.rol_actual())` va envuelto en subconsulta a propósito: así PostgreSQL lo evalúa una vez por
consulta (InitPlan) en lugar de una vez por fila. En una agenda con miles de citas la diferencia es de órdenes
de magnitud.

`antecedentes`, `addendas` e `historias_clinicas` siguen el mismo patrón que `atenciones` (solo el médico a cargo;
ver [ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md)). La addenda solo procede sobre una atención
**firmada** y con la autoría del propio médico.

**Cómo cambian las políticas con el PRD del 2026-10-11** (**Propuesta**; ninguna se implementa sin aceptar su ADR, sin
revisión con `code-review` y sin verificación por mutación de las pruebas negativas):

- **Rol y función central** ([ADR-0030](adrs/0030-profesional-de-la-salud.md)): en `atenciones`, `addendas`, `antecedentes`,
  `historias_clinicas` y `citas`, `rol_actual() = 'medico'` pasa a `'profesional'` y `medico_actual()` /
  `medico_tiene_paciente()` a `profesional_actual()` / `profesional_tiene_paciente()`. Es un cambio de nombres, no de lógica:
  H2c lo demuestra con una instantánea normalizada de las políticas antes y después.
- **Psicología** ([ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)): lo reservado exige además
  `psicologo_tiene_paciente(paciente_id)`, y las tablas de Psicología solo tienen esa política. Las atenciones de autor
  psicólogo se tratan igual (ver «Información de Psicología»); las de los demás profesionales siguen visibles para todo
  profesional a cargo.
- **Asignaciones** ([ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md)): `asignaciones_paciente_profesional`
  sigue siendo la **única** fuente de acceso y sigue siendo append-only. Una asignación nace de una cita confirmada
  (disparador), de la asignación manual del administrativo —cuya política de inserción rechaza los motivos `cita:` y
  `derivacion:`— o del disparador de «tomar». Ningún rol inserta por su cuenta una asignación por derivación.
- **Visitas, triajes y derivaciones** (H6b): sin escritura directa para ningún rol de usuario; lectura del triaje solo por el
  profesional a cargo. La enfermera no tiene política `SELECT` sobre `pacientes` ni sobre ninguna tabla clínica.
- **Recetas** (H6c): sin escritura directa; `emitir_receta()` exige profesión autorizada, autoría propia y paciente a cargo; la lectura es la de `atenciones` (cualquier profesión a cargo) y la vista de medicamentos es `security_invoker`, de modo que no abre filas que las tablas no dan.
- **Copia** (H6d): el administrativo no gana `SELECT` clínico; la única excepción a la regla «el administrativo NO lee
  contenido clínico. Nunca.» del bloque anterior es la función `compilar_copia_historia()`, acotada y auditada (ver P-16).

```sql
alter table citas enable row level security;

create policy "paciente ve sus citas" on citas for select to authenticated
using ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual()));

create policy "paciente reserva su cita" on citas for insert to authenticated
with check (
  (select public.rol_actual()) = 'paciente'
  and paciente_id = (select public.paciente_actual())
  and origen = 'portal'
  and inicio > now()
);

create policy "administrativo gestiona todas las citas" on citas for all to authenticated
using ((select public.rol_actual()) = 'administrativo')
with check ((select public.rol_actual()) = 'administrativo');   -- sin DELETE: las citas se cancelan

create policy "medico ve su agenda" on citas for select to authenticated
using ((select public.rol_actual()) = 'medico' and medico_id = (select public.medico_actual()));
```

`asignaciones_paciente_medico` es **append-only** ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)):
el administrativo solo lee e inserta (no edita ni borra: el acceso se deja vencer), el médico lee las suyas y el
paciente no tiene política. `notificaciones` solo la lee el administrativo (revisión de fallidas,
[ADR-0018](adrs/0018-visibilidad-de-notificaciones-fallidas.md)); el rol `cron_notificaciones` **sí pasa por RLS** (no
tiene `BYPASSRLS`, que ampliaría su alcance si un `GRANT` se excediera) y tiene políticas propias igual de acotadas
que sus `GRANT`: `notificaciones` completa y `citas` solo lectura.

**Matriz de acceso implementada en H2** (todo lo que no figura está denegado; las filas «derivadas» de la matriz de
roles son supuestos conservadores sujetos a revisión, ver `design.md` de H2, D3):

| Tabla | Administrativo | Médico | Enfermera | Paciente |
|---|---|---|---|---|
| `perfiles` | lee todos; actualiza `rol`/`activo` | lee el propio y los de médicos | ídem | ídem |
| `pacientes` | lee, registra y corrige | lee con cita vigente o asignación vigente | — | lee el propio |
| `especialidades`, `medicos`, `disponibilidades` | gestiona | lee | lee | lee |
| `enfermeras` | gestiona | — | lee la propia | — |
| `bloqueos_agenda` | gestiona | lee los propios | — | — |
| `citas` | gestiona (ventana de 1 h) | lee su agenda | — | lee las suyas; reserva la propia |
| `historias_clinicas`, `atenciones`, `addendas`, `antecedentes` | — | lee y registra solo con el paciente a cargo | — | — |
| `asignaciones_paciente_medico` | lee e inserta | lee las suyas | — | — |
| `turnos_enfermeria` | gestiona | — | lee los propios | — |
| `notificaciones` | lee | — | — | — (el cron lee y escribe) |
| `auditoria` | lee | — | — | — |
| `accesos_historia` | lee | inserta los propios | — | — |
| `cie10` | — (solo migración de datos) | lee | lee | lee |

**Matriz de acceso objetivo del PRD del 2026-10-11** (**Propuesta**; solo los cambios y las tablas nuevas respecto de la
matriz de H2, que sigue vigente para todo lo que no se menciona aquí; «Profesional» es hoy el rol `medico`; todo lo que no
figura está denegado; «por función» = solo con la función acotada indicada en «Funciones de apoyo»):

| Tabla | Administrativo (recepción) | Profesional | Enfermera | Paciente |
|---|---|---|---|---|
| `pacientes` (con filiación) | lee, registra, corrige y completa la filiación | lee con cita vigente o asignación vigente (sin cambio) | no lee la tabla; ve nombre, documento, fecha de nacimiento y hora de llegada de las visitas del día por función | lee el propio |
| `profesionales` (hoy `medicos`) | gestiona; la profesión no se cambia | lee | lee | lee |
| `historias_clinicas`, `atenciones`, `addendas`, `antecedentes` | — (salvo la generación de la copia, por función) | lee y registra solo con el paciente a cargo; **lo de Psicología, solo el psicólogo a cargo** | — | — |
| `plantillas_clinicas` | — | lee | — | — |
| `asignaciones_paciente_profesional` | lee e inserta la manual (motivo con contenido y sin prefijo `cita:` ni `derivacion:`) | lee las suyas; la de derivación la crea el disparador de «tomar» | — | — |
| `visitas` | lee todas; crea con `registrar_llegada()` | lee las que atiende | solo por función, las del día | — |
| `triajes` | — | lee los de sus pacientes a cargo | escribe con `registrar_triaje()`; lee los de visitas aún sin tomar por función | — |
| `derivaciones` | — | lee las que creó o tomó; crea con `derivar_paciente()`; ve la cola de su especialidad por función y toma | crea con `derivar_paciente()`; no lee | — |
| `profesiones_que_recetan` | — | — | — | — |
| `recetas`, `receta_items` | — (salvo la copia) | lee las de sus pacientes a cargo; emite y anula las propias si su profesión puede recetar | — | — |
| `impresiones_receta` | — | el emisor lee las suyas y registra la impresión | — | — |
| `solicitudes_copia_historia` | lee e inserta; el resto de transiciones, por función | — | — | — |
| Tablas de Psicología (H6g) y lo de `area = psicologia` de H6i | — | solo el psicólogo a cargo | — | — |
| Planes de sesiones e instrumentos de las demás áreas (H6i), y tablas de las otras especialidades (H6e, H6f, H6h) | — | lee todo profesional a cargo; escribe solo un profesional de la profesión que corresponde | — | — |

**Casos negativos que cada tabla nueva debe probar** (regla de [CLAUDE.md](../CLAUDE.md): RLS activada y prueba pgTAP
negativa por rol —administrativo, profesional a cargo, otro profesional, enfermera, paciente, sin rol, `anonymous`,
`cron_notificaciones` y `sync_identidad`—; números de prueba sugeridos por hito, sin chocar con los ya usados):

| Tabla (hito, prueba) | Quién sí | Casos negativos mínimos |
|---|---|---|
| `profesionales` (H2c, 63–65) | administrativo gestiona; los demás leen | enfermera, paciente y `anonymous` no escriben; nadie cambia `profesion` con `UPDATE`; `sync_identidad` y `cron_notificaciones` sin acceso; la suite de acceso a historias pasa completa con el rol `profesional` |
| `plantillas_clinicas` (H6, 62) | profesional lee | administrativo, enfermera, paciente, `anonymous`, `cron_notificaciones` y `sync_identidad` no leen; nadie escribe |
| `visitas` (H6b, 66–68) | administrativo lee; profesional lee las que atiende | paciente, `anonymous`, sin rol, `cron_notificaciones` y `sync_identidad` no ven; un profesional que no la atiende no la ve; ningún rol de usuario escribe la tabla directamente |
| `triajes` (H6b) | profesional a cargo lee | administrativo y paciente no leen; otro profesional no lee; la enfermera con consulta directa recibe cero filas y solo ve lo que devuelve su función; nadie edita ni borra |
| `derivaciones` (H6b) | profesional que la creó o tomó lee | administrativo, enfermera y paciente no leen; un profesional de otra especialidad no toma; la enfermera no puede indicar un profesional; una derivación `pendiente` no da lectura de `atenciones` ni de `historias_clinicas`; de dos tomas simultáneas prospera una |
| `asignaciones_paciente_profesional` (H6b) | disparador de «tomar»; administrativo inserta la manual | el administrativo no inserta motivos `cita:` ni `derivacion:`; un profesional no inserta por su cuenta |
| `profesiones_que_recetan`, `recetas`, `receta_items`, `impresiones_receta` (H6c, 70–72) | profesional a cargo lee las recetas; el emisor, sus impresiones | nadie de los roles de usuario lee ni escribe el catálogo; un psicólogo (u otro sin permiso) no emite, ni por consulta directa; otro profesional sin el paciente a cargo (o con asignación vencida) no lee; administrativo, enfermera y paciente no leen; `UPDATE` de contenido y `DELETE` rechazados; solo el emisor anula e imprime; la vista de medicamentos no devuelve nada a quien no tiene al paciente a cargo |
| `solicitudes_copia_historia` (H6d, 73–74) | administrativo | profesional, enfermera, paciente (ni el titular), `anonymous` no leen; `UPDATE` y `DELETE` rechazados; las funciones de la copia no son ejecutables por otro rol; la solicitud, `accesos_historia` y `auditoria` no contienen texto clínico |
| Tablas de Psicología (H6g, 77–78) | psicólogo a cargo | el médico, el odontólogo, el fisioterapeuta y el podólogo a cargo no leen; un psicólogo sin el paciente a cargo no lee; administrativo, enfermera, paciente, `anonymous`, `cron_notificaciones` y `sync_identidad` no leen; la dirección directa devuelve «no existe» |
| Planes de sesiones e instrumentos (H6i, 80–81) | profesional a cargo; psicólogo a cargo en `area = psicologia` | los de Psicología no los lee un médico, odontólogo, fisioterapeuta ni podólogo a cargo; un profesional de otra profesión no escribe en un área ajena; el puntaje no se acepta si no coincide con el calculado; administrativo, enfermera, paciente, `anonymous`, `cron_notificaciones` y `sync_identidad` no leen |
| Tablas de Odontología, Fisioterapia y Podología (H6e 75, H6f 76, H6h 79) | profesional a cargo (como `atenciones`); escribe solo un profesional de esa profesión | las mismas negativas que `atenciones`; otro profesional a cargo lee pero no escribe; la enfermera no lee |

### Escalada de privilegios

RLS de PostgreSQL no tiene granularidad por columna, así que un usuario con permiso de actualización sobre su propio
perfil podría cambiarse el rol a `administrativo`. La primera barrera es no concederlo: `authenticated` no recibe
`INSERT` ni `DELETE` sobre `perfiles` ni `UPDATE` de `clerk_user_id`, y solo el administrativo tiene política de
actualización. La barrera de fondo es un trigger, **`SECURITY INVOKER`** (solo compara `OLD`/`NEW` y llama a
`rol_actual()`), que protege `rol` y `activo`:

```sql
create function public.bloquear_cambio_de_rol() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol or new.activo is distinct from old.activo then
    -- sync_identidad no ejecuta rol_actual(): PostgreSQL comprueba EXECUTE al inicializar la expresión aunque un
    -- AND la saltara, por eso los IF van anidados.
    if current_user <> 'sync_identidad' then
      if coalesce(public.rol_actual(), '') <> 'administrativo' then
        raise exception 'No autorizado para cambiar el rol o el estado de un usuario' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end
$$;

create trigger perfiles_bloquear_rol before update on perfiles
  for each row execute function public.bloquear_cambio_de_rol();
```

El webhook de Clerk que sincroniza `perfiles` (`user.created`/`user.updated`,
[ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)) corre con un rol de Postgres dedicado (`sync_identidad`,
`SELECT`/`INSERT` y `UPDATE` de `nombres`, `apellidos`, `rol` y `activo` solo sobre `perfiles`, sin `DELETE`),
distinto del tráfico de usuario (`authenticator`/`authenticated`) y de `cron_notificaciones`: sin alcance sobre
historias clínicas ni agenda. Es el único camino, junto con el propio administrativo, que puede escribir
`perfiles.rol` (el trigger lo reconoce por `current_user`).

Las cuentas de personal (administrativo, profesional de la salud, enfermera) **no se auto-registran**: las crea un administrativo por
invitación vía la API de Clerk. El registro público solo produce rol `paciente`.

### Controles adicionales

| Control | Implementación |
|---|---|
| MFA para personal | TOTP de Clerk, obligatorio para roles no-paciente ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)) |
| Bots en el portal | Vercel BotID en registro y reserva ([ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md)) |
| Fuerza bruta | Upstash Ratelimit en rutas de auth: 5 intentos / 15 min por IP ([ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md)) |
| Cifrado | TLS en tránsito; cifrado en reposo de Neon; backups (PITR) cifrados |
| Adjuntos clínicos | Vercel Blob privado, acceso vía URL firmada de corta duración tras verificar `medico_tiene_paciente()` (hoy; `profesional_tiene_paciente()` y, para Psicología, `psicologo_tiene_paciente()`) — la Server Action es la autoridad de acceso, no RLS ([ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md)) |
| Salidas impresas (receta, copia de la historia) | Se generan desde datos guardados; ninguna se almacena como archivo. La receta lleva su número y cada impresión queda registrada; la copia se genera con un registro de acceso y quién la emite. Lo impreso sale del control del sistema |
| Secretos | Variables de entorno de Vercel; ninguna clave en el repositorio |
| Cabeceras | CSP estricta, HSTS, `X-Frame-Options: DENY` |
| WAF genérico de borde | No reemplazado 1:1 tras salir de Cloudflare — riesgo aceptado, ver [ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md) |

## Reglas de negocio: dónde vive cada una

Cada regla del PRD se ancla en la capa más profunda posible. La UI puede mostrar el mensaje, pero
nunca es el único lugar que impide la violación.

| Regla (PRD) | Implementación | Capa |
|---|---|---|
| Doble reserva bloqueada | `EXCLUDE USING gist` en `citas` | Base de datos |
| Mensaje `Registro de cita ya agendado` | Mapeo de `SQLSTATE 23P01` **y `40P01`** a ese texto exacto (ver «Doble reserva») | Server Action |
| Cancelación hasta 1 h antes, para todos los roles | Trigger `validar_cancelacion()` ([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)) | Base de datos |
| Advertencia de la restricción al reservar | Texto en el formulario de reserva | UI |
| Historia clínica sin campos vacíos | `CHECK` en columnas + esquema Zod | BD + servidor |
| Datos de especialidad válidos y completos | Disparador de validación contra `plantillas_clinicas` (`HC005`, [ADR-0029](adrs/0029-datos-clinicos-por-especialidad.md)) + Zod | BD + servidor |
| Datos del paciente no editables desde HC | Las columnas no existen en `atenciones` | Estructura |
| Profesional sin acceso a pacientes ajenos | Políticas RLS + `medico_tiene_paciente()` (hoy; `profesional_tiene_paciente()`, ADR-0030) | Base de datos |
| Acceso del profesional expira automáticamente (6 meses desde la cita; vigencia acotada si nace de una derivación, [ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md)) | Trigger `extender_asignacion_por_cita()` ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)) | Base de datos |
| Profesional de baja o emergencia: reasignación a otro de la misma especialidad | `bloqueos_agenda` + flujo de reasignación masiva ([ADR-0011](adrs/0011-reasignacion-de-citas-por-baja-medica.md)) | Aplicación |
| Recordatorio un día antes | Vercel Cron Job + tabla `notificaciones` ([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)) | Route Handler |
| Apertura de la historia con filiación; un documento, una historia | `pacientes_documento_unico` + `historias_clinicas.paciente_id` único; filiación obligatoria al abrir (Zod + `CHECK`) | BD + servidor |
| Paciente sin cita: acceso por derivación y «tomar» | `derivaciones` + `tomar_paciente()` + asignación append-only ([ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md)) | Base de datos |
| Información de Psicología aparte | RLS por profesión + `psicologo_tiene_paciente()` ([ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)) | Base de datos |
| Triaje con valores plausibles; IMC calculado | `CHECK` de rangos + columna generada + Zod | BD + servidor |
| Receta solo de quien puede recetar; inmutable | `profesiones_que_recetan` + `emitir_receta()` + disparador de inmutabilidad | Base de datos |
| Receta incompleta no se emite ni se imprime | `CHECK`/disparador + Zod; impresión solo de recetas emitidas | BD + servidor |
| Copia de la historia en 5 días, con identidad verificada y emisor registrado | `solicitudes_copia_historia` (`vence_en`, identidad verificada, `emitida_por`) + `compilar_copia_historia()` | BD + servidor |

### Doble reserva

```ts
// lib/citas/reservar.ts
try {
  const sql = await clienteAutenticado();
  await sql`insert into citas ${toPgValues(nuevaCita)}`;
} catch (error) {
  // exclusion_violation (23P01) o, si dos reservas chocan a la vez, deadlock_detected (40P01): ambas significan que
  // otra transacción tomó el horario y ninguna deja una cita.
  if (isPostgresError(error, '23P01') || isPostgresError(error, '40P01')) {
    return { ok: false, mensaje: 'Registro de cita ya agendado' };
  }
  throw error;
}
```

El texto se usa literalmente como lo define el PRD. Si se traduce o reformula, se rompe el criterio
de aceptación.

**Dos códigos, no uno.** Con una sola inserción en conflicto con una cita ya confirmada el rechazo es siempre `23P01`.
Pero cuando varias reservas del mismo horario llegan **a la vez**, Postgres puede resolver el choque abortando una de
ellas con `40P01` (`deadlock_detected`) en lugar de `23P01`; lo observó el CI de H2 en una de 20 rondas de 5 reservas
simultáneas. En ambos casos exactamente una cita se confirma y el resto no deja nada, así que la garantía de la base
no cambia, pero un mapeo que solo conozca `23P01` mostraría un error genérico bajo carga. Todo punto de inserción de
citas (reserva del paciente, agendado administrativo, reprogramación) debe mapear los dos códigos al mismo mensaje.

### Cancelación tardía

La ventana de 1 hora aplica a **todos los roles**, incluido el administrativo, salvo cuando la
cancelación es parte de una reasignación por baja médica ya en curso
([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)):

```sql
-- security definer: la consulta a bloqueos_agenda no debe pasar por la RLS de quien cancela (un paciente no ve los
-- bloqueos); si no, la excepción dependería del rol, contra ADR-0012. La ventana se mide contra OLD.inicio: con
-- NEW, un UPDATE que cancela y a la vez mueve la cita al futuro la esquivaría.
create or replace function public.validar_cancelacion()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_es_por_baja boolean;
begin
  if new.estado = 'cancelada' and old.estado <> 'cancelada' then
    -- Excepción: si existe un bloqueo_agenda del mismo médico que alcanza la cita, la cancelación es parte del
    -- flujo de reasignación por baja médica (ADR-0011), no una cancelación discrecional, y no aplica la ventana.
    select exists (
      select 1 from public.bloqueos_agenda b
      where b.medico_id = old.medico_id
        and b.rango && old.rango
    ) into v_es_por_baja;

    if not v_es_por_baja and old.inicio - now() < interval '1 hour' then
      raise exception 'No es posible cancelar con menos de 1 hora de anticipación'
        using errcode = 'P0001';
    end if;
    new.cancelada_en  := now();
    new.cancelada_por := public.perfil_actual();
  end if;
  return new;
end;
$$;

create trigger citas_validar_cancelacion
  before update on citas
  for each row execute function public.validar_cancelacion();
```

### Inmutabilidad de la historia clínica

```sql
create or replace function public.proteger_atencion_firmada()
returns trigger language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las atenciones clínicas no se eliminan' using errcode = '42501';
  end if;
  if old.firmada_en is not null then
    raise exception 'Atención firmada: use una addenda para corregir' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger atenciones_inmutables
  before update or delete on atenciones
  for each row execute function public.proteger_atencion_firmada();
```

Una historia clínica es un registro legal. La corrección se hace por addenda, con su propia fecha y
autor; el texto original permanece. Las addendas son solo-agregar (`proteger_addenda()`), los antecedentes solo
cambian `vigente` (`proteger_antecedente()`, ver [ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md)) y la
auditoría (`auditoria`, `accesos_historia`) es solo-agregar incluso para el dueño de la base.

### Profesional de baja o emergencia

1. El administrativo crea un `bloqueo_agenda` para el rango afectado.
2. El sistema lista las citas vigentes del profesional dentro del rango.
3. Para cada una propone profesionales de la misma especialidad con slot libre.
4. La reasignación se ejecuta en una transacción: cancela la cita original e inserta la
   nueva cita con `reprogramada_de` apuntando a la original (la columna vive en la cita nueva,
   igual que en el esquema y en la prueba de aceptación de más abajo).
5. Se encola una notificación de reprogramación al paciente.

Si no hay profesional sustituto disponible, la cita queda marcada para contacto manual. El sistema no
cancela citas en silencio.

Con el PRD del 2026-10-11 el sustituto es otro profesional de la **misma especialidad** (no solo de la misma profesión): el
sistema no propone a nadie de otra especialidad. El sustituto gana acceso a la historia cuando su cita nueva entra a
`confirmada` ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)); si es psicólogo, también a la información de
Psicología del paciente, porque la tiene a cargo.

### Apertura de la historia y filiación

**Propuesta** (detalle en `agenda-y-reserva`, H3, ítem 5; reglas del PRD del 2026-10-11 y de [CLAUDE.md](../CLAUDE.md)):

1. Recepción registra al paciente nuevo, con o sin cita, con `registrarPaciente`: documento (DNI, Carné de Extranjería,
   pasaporte o, si no tiene, un número provisional que asigna el sistema) y la filiación mínima de la NTS 139, validados con
   Zod en el servidor.
2. Si el documento ya existe, la restricción única impide una segunda fila y una segunda historia, y la acción muestra al
   paciente existente.
   <!-- REVISAR: el administrativo hoy no lee `historias_clinicas`, ni siquiera su número (D6, H10 de `historias-clinicas`). «Mostrar la historia existente» se resuelve mostrando al paciente; si recepción debe ver el número de historia, hay que añadir una lectura acotada de `numero` (dato no clínico). -->
3. La carpeta `historias_clinicas` nace con el paciente (disparador existente `crear_historia_clinica()`); «abrir la historia»
   es dejar completa la filiación mínima. Un paciente registrado por el portal con datos parciales la completa recepción
   cuando llega.
   <!-- REVISAR: si el registro del portal puede omitir la filiación y recepción debe completarla antes de la llegada lo decide `agenda-y-reserva`; H6b (`registrar_llegada`) toma a un paciente ya registrado y no define columnas de filiación. -->
4. Con identidad provisional, la historia se abre igual; al confirmarse el documento definitivo se reemplaza sobre el mismo
   `paciente_id` (acción de recepción, auditada).

### Pacientes sin cita: triaje, derivación y toma del paciente

([ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md), **Propuesta**; hito H6b, change `triaje-y-derivacion`.)

1. Recepción registra la **llegada** (`registrar_llegada`), con o sin cita. Una sola visita en curso por paciente; con cita,
   esta debe estar confirmada, ser del paciente y del día de Lima.
2. La enfermera registra el **triaje** de la visita (`registrar_triaje`); un valor imposible se rechaza y el IMC lo calcula la
   base. Puede haber varios; los anteriores se conservan.
3. La enfermera **deriva** a una especialidad (`derivar_paciente`) una visita sin cita que ya tiene triaje; si el triaje no
   existe o ya hay una derivación pendiente, la base lo rechaza. Un profesional que tiene al paciente en atención puede
   derivarlo a **otra** especialidad. Derivar **no da acceso a nadie**.
4. Un profesional de la especialidad de destino ve la cola (quién espera y desde cuándo) y **toma** al paciente
   (`tomar_paciente`): la visita bloquea la fila, la derivación pasa a `tomada`, la visita a `en_atencion` y un disparador
   inserta la asignación (append-only, motivo `derivacion:<id>`, vigencia acotada). Si dos lo intentan a la vez, prospera uno
   (SQLSTATE propio de H6b, `HC020`–`HC029`, para el otro y para una derivación vencida o de otra especialidad).
5. Desde ese momento, y no antes, el profesional ve la historia (según `profesional_tiene_paciente()`), el triaje y los
   medicamentos del paciente. Al terminar, `terminar_atencion` cierra la visita.

Sin derivación, nadie ve la historia de un paciente sin cita, y la enfermera no obtiene acceso a la historia: solo escribe el
triaje y deriva. El paciente con cita confirmada ya tiene al profesional a cargo
([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)): su profesional lo toma sin derivación y sin una asignación
nueva.

### Recetas

(Hito H6c, change `recetas-medicas`, **Propuesta**; ver «Recetas» en el modelo de datos.)

- Emite una receta solo quien tiene al paciente a cargo y cuya profesión puede recetar; lo impone la base (`emitir_receta()`),
  no la interfaz. Qué profesiones pueden recetar sigue abierto (P-17): médico sí, psicólogo no.
- La receta se numera de forma correlativa y sin huecos, se sella por el servidor y se guarda como datos estructurados. Con
  datos incompletos no se emite ni se imprime. Solo el emisor imprime, con la plantilla de la clínica y espacio para firma y
  sello manuscritos, y cada impresión queda registrada («Original» y luego «Duplicado»).
- Una receta emitida **no se edita**: se anula (solo el emisor, con motivo) y se emite otra que la reemplaza —en un solo paso
  si se desea, de modo que si la nueva falla la original no queda anulada—; la anulada se conserva y se marca, aunque el papel
  ya entregado queda fuera del control del sistema.
- Antes de recetar, el profesional ve los medicamentos del paciente (recetas emitidas cuyo tratamiento sigue vigente). No hay
  alertas automáticas de interacción: el cruce de medicamentos depende de que el profesional revise esa lista (ver P-7).

### Copia de la historia clínica

(Hito H6d, change `copia-de-historia-clinica`, **Propuesta**; ver «Solicitudes de copia de la historia» en el modelo de datos.)

1. Recepción registra la solicitud (`solicitudes_copia_historia`): quién la pide (el paciente o su representante legal) y su
   documento.
2. Recepción **verifica la identidad** en persona con el documento original (y, para un representante, su acreditación). Si no
   se puede verificar, o el representante no acredita serlo, la solicitud se **rechaza** con motivo y queda registrada.
3. Recepción pide **generar** la copia: `compilar_copia_historia()` registra el acceso (`accesos_historia`, tipo `copia`) y
   entrega el contenido solo al servidor, que arma el documento; se imprime frente al solicitante, en sobre cerrado. Incluye
   la información de Psicología.
4. Recepción **confirma la entrega** (`confirmar_entrega_copia()`), que registra quién emite; la copia se entrega dentro de los
   5 días de la solicitud (NTS 139, 4.2.14) o, si fue tarde, con el motivo de la demora. Una solicitud abierta pasada de plazo
   queda a la vista en la lista de trabajo; no se cierra sola.

## Disponibilidad y cálculo de slots

Los slots libres se calculan en consulta, no se materializan. Precomputar meses de slots vacíos
genera un volumen de datos que hay que mantener sincronizado con cada cambio de horario.

```sql
create or replace function public.slots_disponibles(p_medico uuid, p_fecha date)
returns table (inicio timestamptz, fin timestamptz)
language sql stable
as $$
  with plantilla as (
    select d.hora_inicio, d.hora_fin, d.duracion_slot_min
    from public.disponibilidades d
    where d.medico_id = p_medico
      and d.dia_semana = extract(dow from p_fecha)
      and d.vigente_desde <= p_fecha
      and (d.vigente_hasta is null or d.vigente_hasta >= p_fecha)
  ),
  generados as (
    select
      s                                                       as inicio,
      s + make_interval(mins => p.duracion_slot_min)           as fin
    from plantilla p
    cross join lateral generate_series(
      (p_fecha + p.hora_inicio) at time zone 'America/Lima',
      (p_fecha + p.hora_fin)    at time zone 'America/Lima'
        - make_interval(mins => p.duracion_slot_min),
      make_interval(mins => p.duracion_slot_min)
    ) as s
  )
  select g.inicio, g.fin
  from generados g
  where g.inicio > now()
    and not exists (
      select 1 from public.citas c
      where c.medico_id = p_medico
        and c.estado in ('reservada','confirmada')
        and c.rango && tstzrange(g.inicio, g.fin, '[)')
    )
    and not exists (
      select 1 from public.bloqueos_agenda b
      where b.medico_id = p_medico
        and b.rango && tstzrange(g.inicio, g.fin, '[)')
    )
  order by g.inicio;
$$;
```

Es la consulta más caliente del sistema (el portal la ejecuta en cada búsqueda). Cubierta por
`citas_medico_inicio_idx` y el índice GiST de la restricción `EXCLUDE`.

## Superficie de la aplicación

### Rutas

```
app/
  (publico)/
    login/                      inicio de sesión
    registro/                   alta de paciente (Vercel BotID, ADR-0026)
  (paciente)/
    portal/
      citas/                    mis citas
      citas/nueva/              búsqueda de disponibilidad y reserva
  (personal)/
    agenda/                     vista de agenda (administrativo, profesional)
    pacientes/                  registro y búsqueda (administrativo)
    pacientes/[id]/historia/    historia clínica (profesional)
    turnos/                     turnos de enfermería
    dashboard/                  vista operativa de citas y pacientes
    dashboard/notificaciones/   notificaciones fallidas para revisión manual (ADR-0018)
```

> **Nota (2026-10-08):** este árbol es ilustrativo. H1 fijó áreas planas por rol (`/paciente`,
> `/administrativo`, `/medico`, `/enfermera`) y los changes de H3–H7 definen las rutas reales
> dentro de ellas (p. ej. «Mis citas» en `/paciente/citas`); cada change actualiza este árbol al
> implementarse.

**Rutas que añade el PRD del 2026-10-11** (**Propuesta**; dentro de las áreas planas de H1. `profesional` es el nombre
propuesto por [ADR-0030](adrs/0030-profesional-de-la-salud.md): hoy el área es `/medico`, y H2c deja una redirección temporal
de `/medico` a `/profesional`):

```
app/
  administrativo/
    pacientes/                         registro de pacientes y apertura de la historia con la filiación (H3)
    llegadas/                          registrar la llegada del paciente, con o sin cita; lista del día (H6b)
    copias-historia/                   solicitudes de copia: identidad, rechazo, generación y entrega (H6d)
    asignaciones/, accesos-historia/   asignación manual y revisión de accesos (H6)
  profesional/                         hoy medico/
    pacientes-en-espera/               llegaron para mí, derivados a mi especialidad («Tomar») y en atención (H6b)
    pacientes/[pacienteId]/            historia clínica (H6), con el triaje y los medicamentos del paciente
    pacientes/[pacienteId]/recetas/    emitir, anular e imprimir recetas (H6c)
    pacientes/[pacienteId]/psicologia/ solo psicólogos a cargo (H6g)
  enfermera/
    triaje/                            pacientes por triar, formulario de triaje y derivación (H6b)
    turnos/                            turno propio y especialidad con la que trabaja (H7)
```

Las pantallas propias de cada especialidad (odontograma, evaluaciones, plan de sesiones, tests, fotos de evolución) cuelgan de
`pacientes/[pacienteId]/` y las define el change de cada una (H6e–H6h).

Cada grupo de rutas lleva un `layout.tsx` que verifica el rol en servidor y redirige si no
corresponde. Esa comprobación es de usabilidad, no de seguridad: la autoridad real es RLS.

### Server Actions

Columna «Rol»: `profesional` es el nombre propuesto por [ADR-0030](adrs/0030-profesional-de-la-salud.md); hoy el rol vigente
es `medico`. Las acciones de H6b a H6d son **Propuesta** de sus changes y envuelven las funciones `SECURITY DEFINER` de
«Funciones de apoyo»; la generación del documento de la copia es un Route Handler, no una acción.

| Acción | Rol | Valida |
|---|---|---|
| `reservarCita` | paciente, administrativo | Slot vigente, sin cruce, dentro de disponibilidad |
| `cancelarCita` | paciente, administrativo | Ventana de 1 hora (todos los roles, salvo reasignación por baja) |
| `reprogramarCita` | administrativo | Cancela + crea en una transacción |
| `registrarPaciente` | administrativo, público | Formato de DNI/CE/pasaporte, o número provisional que asigna el sistema; filiación mínima (NTS 139) cuando recepción abre la historia; documento no duplicado |
| `registrarAtencion` | profesional | Campos obligatorios, paciente a cargo y datos de especialidad válidos según la plantilla vigente de su especialidad |
| `firmarAtencion` | profesional | Autoría propia; vuelve la nota inmutable |
| `agregarAddenda` | profesional | Atención existente y firmada |
| `asignarTurno` | administrativo | Sin choque de turno para la enfermera |
| `reasignarPorBaja` | administrativo | Sustituto de la misma especialidad y libre |
| `asignarPacienteAMedico` (`asignarPacienteAProfesional` si se acepta ADR-0030) | administrativo | Asignación manual paciente-profesional para casos especiales (interconsulta, cobertura, médico de cabecera); `vigente_hasta` opcional; no admite los motivos `cita:` ni `derivacion:` ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)) |
| `registrarLlegada`, `cerrarVisita` | administrativo (cerrar: también la enfermera, solo como abandono) | Una visita en curso por paciente; con cita, confirmada, del paciente y de hoy (H6b) |
| `registrarTriaje` | enfermera | Siete mediciones dentro de rango; IMC calculado por la base; visita aún no tomada; no lee historias (H6b) |
| `derivarPaciente`, `anularDerivacion` | enfermera, profesional | El destino es una especialidad, nunca un profesional; la enfermera solo visitas sin cita con triaje; el profesional solo a un paciente que tiene en atención y a otra especialidad; no concede acceso (H6b, ADR-0032) |
| `tomarPaciente`, `terminarAtencion` | profesional | Derivación pendiente y vigente de su especialidad, o su propia cita; una sola toma; inserta la asignación con vigencia acotada (H6b, ADR-0032) |
| `emitirReceta`, `anularReceta` (con la opción `corregir`) | profesional | Profesión que puede recetar; paciente a cargo; de 1 a 8 medicamentos completos; numerada y sellada; el mismo `id` no emite dos; anular, solo el emisor y con motivo, y la receta no se edita; corregir anula y emite en una sola transacción (H6c) |
| `registrarImpresionReceta` | profesional emisor | Solo recetas emitidas; registra cada impresión («Original» o «Duplicado») (H6c) |
| `registrarSolicitudCopia`, `verificarSolicitudCopia`, `rechazarSolicitudCopia`, `confirmarEntregaCopia` | administrativo | Solicitante identificado; identidad verificada con el documento original; representante con acreditación; si no, queda rechazada y registrada; la entrega se confirma tras generar (H6d) |
| Acciones de planes de sesiones e instrumentos de evaluación | profesional | Las define el change de H6i; el puntaje de un instrumento lo calcula el servidor y lo verifica la base; los de `area = psicologia` solo un psicólogo a cargo |
| Acciones de cada especialidad | profesional | Odontograma, evaluaciones, notas y planes de sesión, tests y protocolos: las define el change de cada una (H6e–H6h); las de Psicología solo las ejecuta un psicólogo a cargo |

Todas validan con Zod en servidor antes de tocar la base de datos, y todas devuelven un resultado
tipado `{ ok: true, datos } | { ok: false, mensaje }` — nunca lanzan la excepción de Postgres al
usuario, para no filtrar estructura interna.

Los **SQLSTATE propios** se reservan por hito para que los changes no choquen: H6 `HC001`–`HC005` (vigentes en su diseño),
H2c `HC010`–`HC019`, H6b `HC020`–`HC029`, H6c `HC030`–`HC039`, H6d `HC040`–`HC049`, H6e `HC050`–`HC059`, H6f
`HC060`–`HC069`, H6g `HC070`–`HC079`, H6h `HC080`–`HC089` y H6i `HC090`–`HC099`. Cada acción mapea los suyos a un mensaje en español; nunca se
muestra el error de Postgres.

### Dashboard operativo

Vista simple, sin capa analítica (explícitamente fuera de alcance en el PRD):

- Citas de hoy por estado (reservadas, confirmadas, atendidas, canceladas).
- Agenda del día por profesional, con huecos visibles.
- Pacientes en espera y minutos transcurridos desde la hora de cita — es la métrica que sostiene el
  objetivo de espera ≤ 20 minutos.
- Citas sin confirmar para mañana.
- **Propuesta (con `visitas`, H6b/H7):** quién espera desde que llegó, con y sin cita. H6b entrega los estados (`llegada`,
  `con_triaje`, `derivada` son «en espera») y las marcas `llegada_en` y `atencion_iniciada_en`; H7 define «en espera» y
  construye su propia vista sobre `visitas`, sin `triajes` ni `derivaciones` ni ningún dato clínico. Los pacientes sin cita
  cuentan para la espera, pero no para el 75 % de autogestión.
  <!-- REVISAR: la definición de «en espera» sigue siendo de H7; esta es la lectura que habilita la visita. -->
- **Propuesta (H6d, si H7 la adopta):** conteo de solicitudes de copia de la historia vencidas o por vencer; la lista de
  trabajo completa vive en `copias-historia/`.
- Notificaciones fallidas con 3+ intentos, para revisión manual
  ([ADR-0018](adrs/0018-visibilidad-de-notificaciones-fallidas.md)).

Se resuelve con vistas de Postgres sobre `citas` (y, para el último punto, sobre `notificaciones`).
Sin materialización mientras el volumen lo permita.
Las vistas nuevas leen `visitas` (y, si H7 lo adopta, el vencimiento de las copias); ninguna expone contenido clínico.

## Notificaciones

### Flujo

**`recordatorio_24h`** (único tipo programado a futuro):

1. Al crear una cita, la Server Action inserta una fila en `notificaciones` con
   `tipo='recordatorio_24h'` y `programada_para = inicio - interval '1 day'`.
2. El Vercel Cron Job diario corre a las **08:00 America/Lima** (`0 13 * * *` UTC,
   [ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)) y toma las
   notificaciones pendientes cuya `programada_para` ya pasó **y** cuya cita todavía no ocurrió
   (`citas.inicio > now()`) — la segunda condición evita enviar un "recordatorio" de una cita que
   ya pasó cuando la reserva se hizo con menos de 24h de anticipación
   ([ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md)).
3. Envía por Resend en lotes de 100 y marca `estado='enviada'` con el `proveedor_id`.

**`confirmacion_reserva`** y **`cancelacion`** (transaccionales, ver
[ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md)):

1. La propia Server Action (`reservarCita`, `cancelarCita`, `reprogramarCita`) llama
   síncronamente a `lib/notificaciones/proveedor.ts` inmediatamente después de confirmar la
   operación sobre `citas`. Un fallo del envío no revierte la operación.
2. Se inserta una fila en `notificaciones` con `programada_para = now()` y el `estado` ya resuelto
   (`'enviada'` o `'fallida'` directamente) — nunca como `'pendiente'`.

**Reintentos (ambos casos):** el mismo cron diario reintenta toda notificación en `estado='fallida'`
con menos de 3 intentos, con backoff — mismo mecanismo para las tres, sin lógica duplicada. La
cadencia es diaria, no horaria, para mantener el proyecto dentro del plan gratuito de Vercel
([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)); un fallo de envío puede esperar
hasta ~24h para su reintento automático — aceptable para el alcance de MVP.

La unicidad `(cita_id, tipo)` es la garantía de idempotencia: si el cron se ejecuta dos veces o un
reintento se solapa, el paciente no recibe dos correos.

```json
{
  "crons": [
    { "path": "/api/cron/notificaciones", "schedule": "0 13 * * *" }
  ]
}
```
*(`vercel.json`, plan Hobby — ver [ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md))*

### Contenido

Plantillas en español (`es-PE`), con fecha y hora renderizadas en `America/Lima`:

- **Confirmación de reserva** — al reservar, incluye la advertencia de la ventana de cancelación de
  1 hora.
- **Recordatorio 24 h** — día, hora, profesional, especialidad y enlace para cancelar.
- **Cancelación / reprogramación** — al cambiar el estado.

Ningún correo incluye información clínica. Un correo puede acabar en un buzón compartido; solo lleva
datos logísticos de la cita.

**Canal único: correo.** WhatsApp y SMS están fuera de alcance por decisión del usuario (PRD, 2026-10-11); el riesgo de
depender de un solo canal se conserva en P-7. Los pacientes que llegan sin cita no reciben recordatorio, porque no hay cita.
El triaje, las derivaciones, las recetas y la copia de la historia no generan correos (**Propuesta**): el vencimiento de
una copia se vigila en el panel, no por correo (el aviso al paciente al emitirse su copia sería una notificación nueva, fuera
del alcance actual).

### Entregabilidad

Dominio propio verificado en Resend con SPF, DKIM y DMARC. Sin esto los recordatorios caen en spam
y el objetivo de reducir tiempos de espera se degrada silenciosamente.

## Requisitos no funcionales

| Aspecto | Objetivo |
|---|---|
| Disponibilidad | 99.5% en horario de atención de la clínica |
| Latencia | p95 < 500 ms en carga de agenda y búsqueda de slots |
| Concurrencia | 50 usuarios simultáneos de personal + picos del portal |
| Backups | PITR de Neon, nivel gratuito para el MVP — ventana exacta a confirmar, no asumir 7 días ([ADR-0021](adrs/0021-base-de-datos-neon.md)) + export diario cifrado a almacenamiento independiente |
| RPO / RTO | RPO ≤ 5 min; RTO ≤ 4 h |
| Retención de historias clínicas | **Pendiente de definición legal** (ver «Riesgos técnicos abiertos», P-1) |
| Accesibilidad | WCAG 2.1 AA; objetivos táctiles ≥ 44 px; contraste alto en el portal |
| Navegadores | Últimas 2 versiones de Chrome, Edge, Safari, Firefox; móvil prioritario en el portal |
| Idioma | Español (es-PE) en toda la interfaz y en los mensajes de error |
| Impresión | La receta y la copia de la historia se imprimen desde el navegador, con una hoja de estilos de impresión y sin PDF almacenado de la receta; exige impresora en consultorio y recepción (supuesto del PRD sin confirmar) |

## Entornos, CI/CD y pruebas

### Entornos

| Entorno | Base de datos | App |
|---|---|---|
| Local | Branch de Neon de desarrollo personal | `next dev` |
| Staging | Branch de Neon efímero por PR ([ADR-0021](adrs/0021-base-de-datos-neon.md)) | Deployment de preview de Vercel |
| Producción | Branch principal de Neon | Deployment de producción de Vercel |

### Pipeline

GitHub Actions en cada PR: typecheck → lint → tests unitarios → crear branch de Neon efímero →
`node-pg-migrate up` + pgTAP → Playwright contra el preview de Vercel → destruir el branch al
cerrar el PR. En merge a `main`: `node-pg-migrate up` contra el branch principal de Neon, luego
deploy de Vercel ([ADR-0027](adrs/0027-herramienta-de-migraciones.md)).

Las migraciones solo avanzan hacia adelante. Restaurar el branch principal de Neon a un estado
previo en producción destruye datos clínicos: la operación queda prohibida manualmente, igual que
`supabase db reset` lo estaba en el diseño original.

### Pruebas

**pgTAP para RLS — obligatorio.** Cada política tiene una prueba negativa que verifica que el rol equivocado *no*
ve el dato. Neon valida el contexto con un JWT real, no con un `set_config()`; la suite lo resuelve (receta
validada en [spike-rls-h2.md](spike-rls-h2.md), uso en [pruebas-sql.md](pruebas-sql.md)): un runner Node
(`scripts/ejecutar-pgtap.ts`) genera por ejecución un par Ed25519 efímero, firma tokens EdDSA por identidad de
prueba (con `jti` creciente) y abre una conexión **directa** con la JWK pública como opción de arranque
(`pg_session_jwt.jwk`); cada archivo corre en una transacción que instala `pgtap`, las ayudas y se revierte, de modo
que no queda nada en la base. Un archivo trae solo el cuerpo pgTAP:

```sql
-- tests/pgtap/43_historias_rls.test.sql (extracto)
select plan(31);

select tests.autenticar_como('medico_a');   -- reset role + auth.jwt_session_init + set local role authenticated
select is_empty(
  $q$ select 1 from public.atenciones where id = (select id from e where clave = 'at2') $q$,
  'el médico NO ve las atenciones de un paciente que tiene a cargo OTRO médico'
);

select tests.autenticar_como('administrativo');
select is((select count(*)::int from public.atenciones where id in (select id from e)), 0,
  'el administrativo NO accede a atenciones');

select * from finish();
```

Las pruebas **no asumen tablas vacías** (puede haber datos de demostración, ver [datos-demo.md](datos-demo.md)) y
se verificó por mutación que pueden fallar: debilitar la política de lectura de `atenciones` hace fallar cinco de
ellas.

Otras pruebas obligatorias (todas implementadas en H2 salvo las de notificaciones y E2E de reserva, que llegan con
sus hitos):

- **Concurrencia** (`tests/concurrencia/`, sesiones `pg` independientes): el segundo `INSERT` del mismo slot espera
  al primero y recibe `23P01` cuando éste confirma; 20 rondas de 5 reservas simultáneas confirman exactamente una y las
  demás reciben `23P01` o `40P01`.
- **Ventana de cancelación:** a 59 minutos se rechaza, a exactamente 1 hora se acepta, con la excepción por baja
  médica (también para un paciente que no ve el bloqueo).
- **Idempotencia de notificaciones:** `unique (cita_id, tipo)` (H2); dos ejecuciones del cron producen un solo envío
  (H5).
- **Vigencia de asignación** ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)): una asignación
  vencida no da acceso, una vigente sí, una manual sin vencimiento otorga acceso indefinido, cancelar una cita no
  revoca el acceso ya otorgado, y un médico dado de baja lo pierde.
- **Integración** (`tests/integracion/`): el SQL del webhook de Clerk con los privilegios reales de `sync_identidad`.
- **Pruebas de las propuestas del PRD del 2026-10-11** (pgTAP, con el caso negativo de **cada** rol y verificación por
  mutación; números sugeridos para no chocar con los ya usados: H2c 63–65, H6b 66–68, H6c 70–72, H6d 73–74, H6e 75, H6f 76,
  H6g 77–78, H6h 79, H6i 80–81; la 62 es de plantillas): tablas nuevas con RLS, aislamiento de Psicología por rol **y por profesión**,
  inmutabilidad y permiso de las recetas, plazo y rechazo de las copias, y puntaje de los instrumentos. Más pruebas de **concurrencia** para «tomar al
  paciente» (varios profesionales de la especialidad toman a la vez: una sola gana y queda una sola asignación) y para la
  numeración correlativa de las recetas (`25_recetas`), y la actualización deliberada de la prueba `47` por las columnas nuevas.
- **E2E (Playwright):** autenticación y redirección por rol, y que Postgres reconoce al usuario por su token de Clerk
  (H1/H2); el recorrido completo de reserva del paciente y el de registro de historia clínica del profesional llegan con
  H4 y H6; el recorrido del paciente sin cita (llegada, triaje, derivación, toma y receta) llega con H6b y H6c.

## Migración desde Excel y papel

Formalizada en [ADR-0019](adrs/0019-migracion-de-datos-excel-y-papel.md), con las alternativas
descartadas y una pregunta operativa abierta para el cliente (dueño y SLA de la bandeja de
revisión manual).

| Fase | Contenido |
|---|---|
| 1. Catálogos | Especialidades, profesionales de la salud (con su profesión y colegiatura), enfermeras, disponibilidades semanales |
| 2. Maestro de pacientes | Import del Excel con deduplicación por `(tipo_documento, numero_documento)`; los registros con documento inválido pasan a una bandeja de revisión manual, no se descartan <!-- REVISAR: la NTS 139 (4.2.23) admite pasaporte y número provisional; decidir si algunos registros sin documento válido entran como provisionales en vez de ir a la bandeja (ADR-0019) --> |
| 3. Citas futuras | Solo citas a futuro. El histórico de citas pasadas queda en el Excel como archivo |
| 4. Historias clínicas | Digitalización progresiva hacia el objetivo de 60% |

Sobre la fase 4: [ADR-0013](adrs/0013-definicion-de-historia-clinica-digitalizada.md) define
"historia digitalizada" como híbrido — se estructuran en el sistema los antecedentes
([ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md)) y los diagnósticos activos del
paciente (los datos que el profesional consulta en tiempo real durante una atención), y el resto del
expediente en papel se adjunta como escaneo (PDF) en Vercel Blob
([ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md)) como respaldo. Una historia
cuenta como "digitalizada" para el criterio de éxito del 60% cuando tiene al menos un registro
estructurado de antecedentes o diagnósticos activos (con o sin adjunto de respaldo).

Durante la transición corre un periodo de doble registro (sistema + papel) hasta validar que no se
pierde información. La fecha de corte la fija la clínica.

## Criterios de aceptación por flujo

### Registro de paciente

- [ ] Un DNI válido (8 dígitos numéricos) se acepta; un DNI con letras o con menos/más de 8
      dígitos se rechaza antes de tocar la base de datos.
- [ ] Un Carné de Extranjería válido (9 a 12 caracteres alfanuméricos) se acepta.
- [ ] Registrar dos pacientes con el mismo `(tipo_documento, numero_documento)` falla; el segundo
      intento no crea una segunda fila en `pacientes`.
- [ ] Un paciente registrado por el administrativo sin cuenta de portal (`perfil_id` nulo) puede
      luego vincularse a una cuenta de portal por su documento, sin duplicar el registro.
- [ ] El registro público (sin sesión de personal) solo puede producir rol `paciente`; no existe
      ruta que permita a un registro público obtener rol `administrativo`, `medico` (`profesional` si se acepta [ADR-0030](adrs/0030-profesional-de-la-salud.md)) o `enfermera`.

### Apertura de la historia con filiación (recepción)

*(Propuesta; el detalle de campos es de `agenda-y-reserva`, H3.)*

- [ ] Recepción registra a un paciente nuevo, con o sin cita, con DNI, Carné de Extranjería, pasaporte o, si no tiene
      documento, un número correlativo provisional que genera el sistema (el usuario no lo escribe).
- [ ] La filiación mínima de la NTS 139 es obligatoria para abrir la historia: sin ella, `registrarPaciente` rechaza con un
      mensaje en español y no se abre la historia.
- [ ] Un documento ya registrado no abre una segunda historia: el sistema muestra al paciente existente. Dos registros
      simultáneos con el mismo documento crean una sola fila en `pacientes` y una sola en `historias_clinicas`.
- [ ] Al confirmar la identidad de un paciente provisional, el documento definitivo reemplaza al provisional sobre el mismo
      `paciente_id`: la historia no se duplica ni cambia de dueño, y el cambio queda en `auditoria`.
- [ ] Los datos de filiación no se editan desde la historia clínica (`atenciones` no tiene esas columnas); solo recepción
      los corrige, desde `pacientes`.
- [ ] El administrativo que abre la historia no obtiene lectura de contenido clínico: una consulta directa a `atenciones`
      no le devuelve ninguna fila.

### Reserva de cita — portal del paciente

- [ ] El paciente ve, para un profesional y fecha, únicamente los slots que no se solapan con citas
      vigentes (`reservada`/`confirmada`) ni con `bloqueos_agenda` de ese profesional.
- [ ] Antes de confirmar la reserva, el formulario muestra la advertencia de que la cita solo puede
      cancelarse hasta 1 hora antes.
- [ ] Al reservar dos veces el mismo slot desde dos sesiones simultáneas (misma condición de
      carrera), exactamente una reserva se crea y la otra recibe el mensaje exacto
      `Registro de cita ya agendado` — verificado con un test de concurrencia real, no solo
      secuencial.
- [ ] El paciente no puede reservar una cita con `inicio` en el pasado.
- [ ] El paciente solo puede reservar/ver citas propias (`paciente_id = paciente_actual()`); no
      puede reservar en nombre de otro paciente.

### Agendamiento, reprogramación y cancelación — administrativo

- [ ] El administrativo puede agendar, reprogramar y cancelar la cita de cualquier paciente.
- [ ] Reprogramar una cita cancela la original y crea la nueva dentro de una única transacción; si
      la creación de la nueva falla, la original no queda cancelada.
- [ ] Cancelar una cita a menos de 1 hora de su `inicio` falla para **cualquier** rol, incluido el
      administrativo, salvo cuando existe un `bloqueo_agenda` vigente del profesional que cubre esa
      cita ([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)).
- [ ] Con un `bloqueo_agenda` vigente que cubre la cita, cancelarla a cualquier minuto de
      anticipación (incluido 0) tiene éxito — es el camino que usa `reasignarPorBaja`.
- [ ] Cancelar a 61 minutos de la cita se permite; a 59 minutos se rechaza — el límite es exacto.

### Profesionales de la salud (alta y permisos)

*(Propuesta; H2c, [ADR-0030](adrs/0030-profesional-de-la-salud.md).)*

- [ ] Un profesional se da de alta con profesión, colegiatura (única junto con la profesión) y especialidad; el alta la hace
      un administrativo por invitación (nadie se auto-registra como profesional).
- [ ] La profesión no puede cambiarse con un `UPDATE`, ni siquiera por el administrativo: el intento falla. Corregirla es una
      migración revisada.
- [ ] Tras el renombre, la suite pgTAP de acceso a historias pasa completa con el rol `profesional` y la instantánea de
      políticas no cambia salvo el vocabulario; los usuarios existentes (`rol = 'medico'`) conservan su acceso durante la
      transición.
- [ ] Un profesional dado de baja pierde el acceso a las historias, igual que hoy con `medicos.activo`.
- [ ] La profesión del autor —un dato de la base, no del cliente ni del token— decide la plantilla, el permiso de recetar y el
      acceso a Psicología.

### Historia clínica — registro y firma (profesional; hoy rol `medico`, ADR-0030)

- [ ] `registrarAtencion` falla si `motivo_consulta`, `anamnesis`, `examen_fisico` o
      `plan_tratamiento` están vacíos o son solo espacios en blanco.
- [ ] `registrarAtencion` falla si `diagnosticos` es un arreglo vacío.
- [ ] Cada código en `diagnosticos[].cie10` existe en el catálogo `cie10`
      ([ADR-0014](adrs/0014-catalogo-cie-10.md)); un código inexistente rechaza el guardado.
- [ ] Un profesional solo puede registrar/consultar atenciones de pacientes que tiene a cargo, según
      `medico_tiene_paciente()`; intentarlo sobre un paciente ajeno no devuelve fila alguna (ni
      error que confirme su existencia).
- [ ] El formulario de historia clínica no expone ningún campo editable con datos que vienen del
      registro del paciente (nombre, documento, fecha de nacimiento, etc.).
- [ ] Una vez `firmarAtencion` fija `firmada_en`, ningún `UPDATE` ni `DELETE` sobre esa fila de
      `atenciones` tiene éxito; la única vía de corrección es `agregarAddenda`.
- [ ] Toda lectura de una atención por un profesional queda registrada en `accesos_historia` con
      `actor_id`, `paciente_id` y marca de tiempo.
- [ ] Una atención con `plantilla_id` solo se guarda si `datos_especialidad` cumple la plantilla: un campo obligatorio vacío,
      una clave ajena o un valor de otro tipo se rechazan en la base (`HC005`), no solo en el formulario
      ([ADR-0029](adrs/0029-datos-clinicos-por-especialidad.md)).
- [ ] La plantilla debe estar vigente al insertar y ser de la especialidad del profesional autor; publicar la versión
      siguiente de una plantilla no altera las atenciones ya registradas.
- [ ] Una atención puede registrarse con y sin cita (`cita_id` nulo cuando el paciente llegó sin cita), siempre con el
      paciente a cargo.

### Triaje y derivación (enfermera)

*(Propuesta; H6b, [ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md).)*

- [ ] La enfermera registra presión arterial (sistólica y diastólica), frecuencia cardíaca, frecuencia respiratoria,
      temperatura, saturación de oxígeno, peso y talla de una visita aún no tomada; el IMC lo calcula la base y no se escribe a
      mano.
- [ ] Un valor imposible (fuera del rango de plausibilidad) o una constante vital faltante se rechaza y no se guarda nada
      (todo o nada).
- [ ] El triaje no se edita: corregirlo es registrar uno nuevo, y vale el más reciente de la visita; los anteriores se
      conservan.
- [ ] La enfermera deriva a una **especialidad**; no existe forma de indicar un profesional concreto, y derivar no le da (ni
      da a nadie) acceso a la historia. No puede derivar sin un triaje previo.
- [ ] El profesional a cargo ve el triaje de la visita en la pantalla de la atención; el administrativo y el paciente no lo
      ven.
- [ ] La enfermera no lee `historias_clinicas`, `atenciones`, `recetas` ni las tablas de Psicología, y tampoco `pacientes`:
      cero filas por consulta directa. Para triar solo ve nombre, documento, fecha de nacimiento y estado de las visitas de hoy.
- [ ] Un profesional puede derivar a otra especialidad a un paciente que tiene en atención, pero no a uno ajeno ni a su propia
      especialidad.

### Paciente sin cita (llegada, triaje, derivación y toma)

*(Propuesta; H6b.)*

- [ ] Recepción registra la llegada de un paciente sin cita sin crear una cita; ese paciente no cuenta para el 75 % de
      autogestión del portal. Un paciente tiene a lo sumo una visita en curso.
- [ ] Mientras nadie lo toma, ningún profesional tiene al paciente a cargo: la cola de derivaciones muestra solo quién espera y
      desde cuándo (sin documento, triaje ni texto libre).
- [ ] Un profesional de la especialidad de destino toma al paciente: la derivación pasa a `tomada`, la visita a `en_atencion` y
      se crea una asignación con vigencia acotada y motivo `derivacion:<id>`; desde ese momento, y no antes, lee la historia.
- [ ] Si dos profesionales de la especialidad toman a la vez, exactamente uno prospera y queda una sola asignación —verificado
      con una prueba de concurrencia real, no solo secuencial—.
- [ ] Un profesional de otra especialidad no puede tomarla, y una derivación vencida (pasado el fin del día de Lima, sin
      tomar) tampoco.
- [ ] Un paciente con cita confirmada llega con el profesional ya a cargo ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)):
      su profesional lo toma sin derivación y sin una asignación nueva.

### Receta (profesional)

*(Propuesta; H6c.)*

- [ ] Solo un profesional con el paciente a cargo y cuya profesión figura como autorizada en `profesiones_que_recetan` emite
      una receta; un psicólogo (u otro sin permiso o sin confirmar) no puede, ni por consulta directa, y no se consume ningún
      número.
- [ ] La receta lleva un número correlativo único, sin repetidos ni huecos aun con emisiones simultáneas (una emisión que falla
      no consume número), y datos estructurados (paciente, profesional, fecha de emisión y validez y, por medicamento,
      denominación, concentración, forma, vía, dosis, frecuencia y duración); con datos incompletos o vacíos no se emite ni se
      imprime. Enviar dos veces el mismo formulario emite una sola receta.
      <!-- REVISAR: contenido mínimo según el DS 014-2011-SA, art. 56 y plazo de validez (solo por Saniape o sin fuente); validar con el asesor. -->
- [ ] Una receta emitida no se edita ni se borra: solo su emisor la anula (con motivo) y se emite otra que la reemplaza —si la
      nueva falla, la original no queda anulada—; la anulada se conserva y se marca.
- [ ] La receta se imprime desde el sistema con la plantilla de la clínica; solo la imprime su emisor, solo si está emitida, y
      cada impresión queda registrada («Original» la primera, «Duplicado» las siguientes).
- [ ] Antes de recetar, el profesional ve los medicamentos del paciente (recetas emitidas cuyo tratamiento sigue vigente); el
      sistema no genera alertas automáticas de interacción, y la lista no contiene información de Psicología.
- [ ] El administrativo, la enfermera y el paciente no leen `recetas` (cero filas), y ningún rol de usuario lee ni escribe
      el catálogo `profesiones_que_recetan`.

### Información de Psicología aparte

*(Propuesta; H6g, [ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md).)*

- [ ] Los resultados de tests y las notas de sesión solo los lee un psicólogo que tiene al paciente a cargo (y su autor).
- [ ] Un médico, odontólogo, fisioterapeuta o podólogo a cargo del mismo paciente recibe cero filas de las tablas de
      Psicología, por consulta directa y abriendo la dirección de la pantalla (404, sin confirmar su existencia).
- [ ] Esos profesionales sí ven los medicamentos del paciente, que salen de `recetas`.
- [ ] Administrativo, enfermera, paciente, `anonymous`, `cron_notificaciones` y `sync_identidad` reciben cero filas.
- [ ] Cada lectura queda en `accesos_historia`, y la auditoría de escritura no vuelca contenido.
- [ ] La copia de la historia que recibe el paciente incluye la información de Psicología, tras verificar su identidad.
      <!-- REVISAR: reglas de salud mental y caso de emergencia; llevar al asesor legal (P-14). -->

### Copia de la historia clínica

*(Propuesta; H6d.)*

- [ ] Cada solicitud registra quién la pide (el paciente o su representante legal), su documento, cómo se verificó su
      identidad y quién emite la copia. Una persona menor de edad no la pide por sí misma.
- [ ] Si la identidad no se puede verificar, o el representante no acredita serlo, la solicitud pasa a `rechazada` con motivo y
      queda registrada (no se borra).
- [ ] Una solicitud abierta lleva su fecha límite (5 días desde la solicitud); el sistema muestra los días que faltan y las
      vencidas, y no genera la copia de una solicitud sin identidad verificada.
- [ ] La copia incluye historia, atenciones y addendas firmadas, antecedentes, triajes, recetas y la información de
      Psicología, y declara lo que no incluye (borradores sin firmar, adjuntos anulados).
- [ ] Generar la copia queda en `accesos_historia` en la misma transacción; ninguna pantalla muestra contenido clínico; el
      administrativo no gana lectura directa de ninguna tabla clínica y los demás roles no pueden ejecutar las funciones de la
      copia.
- [ ] Confirmar la entrega registra quién emite; una entrega fuera de plazo exige el motivo de la demora.

### Plan de sesiones (Fisioterapia, Podología y Psicología)

*(Propuesta; H6i.)*

- [ ] Un plan de sesiones de un paciente con un profesional indica el total de sesiones, la frecuencia y la vigencia, y muestra
      el **contador de sesiones restantes**, que se descuenta solo con las sesiones atendidas.
- [ ] Cada sesión es una cita de H3 (con su anticruce y su ventana de cancelación de 1 hora) o queda por agendar; el plan no
      reemplaza a las citas ni guarda saldos en dinero.
- [ ] Una sesión a la que el paciente no asiste, o que se reprograma, no cierra el plan; cuando el paciente abandona, el plan
      pasa a `cancelado`, y al agotarse las sesiones, a `completado`.
- [ ] Un plan de Psicología lo lee y escribe solo un psicólogo a cargo; los de Fisioterapia y Podología los lee todo profesional
      a cargo y los escribe un profesional de esa profesión.

### Instrumentos de evaluación con puntaje

*(Propuesta; H6i.)*

- [ ] Solo existen instrumentos del catálogo, que se gestiona por migración y marca los de uso libre; ningún rol de usuario
      escribe el catálogo.
- [ ] El puntaje de una aplicación lo calcula el servidor y lo verifica la base: una aplicación con un puntaje que no coincide
      con las respuestas se rechaza. El profesional puede ajustar la interpretación, no el puntaje.
- [ ] Las aplicaciones de `area = psicologia` solo las lee y escribe un psicólogo a cargo; un médico, odontólogo, fisioterapeuta
      o podólogo a cargo recibe cero filas.
      <!-- REVISAR: las licencias de los instrumentos no están verificadas (P-18). -->

### Reasignación por baja o emergencia de un profesional

- [ ] Crear un `bloqueo_agenda` para un profesional lista automáticamente todas sus citas vigentes
      dentro del rango bloqueado.
- [ ] El sistema propone, para cada cita afectada, solo profesionales de la misma especialidad con un
      slot libre equivalente.
- [ ] Confirmar una reasignación cancela la cita original y crea la nueva en una sola transacción,
      con `reprogramada_de` de la nueva apuntando a la original.
- [ ] Si ninguna especialidad equivalente tiene slot libre, la cita queda marcada para contacto
      manual — nunca pasa a `cancelada` sin una cita de reemplazo ni marca de seguimiento.
- [ ] El paciente reasignado recibe una notificación de reprogramación.

### Turnos de enfermería

- [ ] Una enfermera no puede tener dos turnos (`fecha`, `turno`) idénticos duplicados.
- [ ] Todo turno registrado tiene al menos un profesional o una especialidad asociada (no ambos nulos).
- [ ] La enfermera solo puede consultar su propio turno y el profesional/especialidad asociados; no
      accede a historias clínicas ni a funciones administrativas. Su única escritura clínica es el triaje y la derivación.

### Notificaciones automáticas

- [ ] Al confirmarse una reserva, se crea una fila en `notificaciones` con
      `tipo='recordatorio_24h'` y `programada_para = inicio - 1 día`.
- [ ] El cron diario envía únicamente las notificaciones `pendiente`/`fallida` cuya
      `programada_para` ya venció, y marca `estado='enviada'` con el `proveedor_id` de Resend.
- [ ] Ejecutar el cron dos veces sobre el mismo lote de notificaciones no produce un segundo correo
      para la misma `(cita_id, tipo)`.
- [ ] Una notificación fallida se reintenta hasta 3 veces con backoff; al superar 3 intentos deja
      de reintentarse automáticamente y queda visible para revisión manual.
- [ ] Ningún correo enviado contiene contenido clínico (diagnóstico, anamnesis, etc.), solo datos
      logísticos de la cita.
- [ ] Al reservar o cancelar una cita, el correo de confirmación/cancelación se envía en la misma
      operación (no espera al siguiente barrido de cron); un fallo de envío no revierte la reserva
      ni la cancelación ([ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md)).
- [ ] Una cita reservada con menos de 24 h de anticipación no dispara un `recordatorio_24h` para
      una cita que ya ocurrió — el cron diario omite cualquier recordatorio cuya cita asociada ya
      tenga `inicio <= now()`.
- [ ] El administrativo ve, en `dashboard/notificaciones`, toda notificación con 3+ intentos
      fallidos; ningún otro rol accede a esa vista ni a la tabla `notificaciones`
      ([ADR-0018](adrs/0018-visibilidad-de-notificaciones-fallidas.md)).

### Dashboard operativo

- [ ] Muestra las citas del día agrupadas por estado (`reservada`, `confirmada`, `atendida`,
      `cancelada`, `no_asistio`).
- [ ] Muestra, por paciente en espera, los minutos transcurridos desde la hora programada de su
      cita.
- [ ] Lista las citas de mañana que siguen sin `estado='confirmada'`.
- [ ] No expone ningún dato clínico (diagnóstico, nota de atención): es una vista operativa de
      agenda y estado, no un módulo analítico.

### Control de acceso a historias clínicas (transversal)

- [ ] Con RLS activo, una consulta directa a `atenciones` autenticada como `administrativo` no
      devuelve ninguna fila.
- [ ] Con RLS activo, una consulta directa a `atenciones` autenticada como `paciente` no devuelve
      ninguna fila.
- [ ] Con RLS activo, un profesional autenticado que consulta `atenciones` de un paciente que no tiene
      a cargo no recibe ninguna fila.
- [ ] Un intento de `UPDATE` sobre `perfiles.rol` ejecutado por un rol distinto de administrativo
      falla con el error de `bloquear_cambio_de_rol()`.
- [ ] Un profesional cuya única cita con un paciente fue `atendida` hace más de 6 meses, sin ninguna
      cita ni asignación manual posterior, no accede a la historia de ese paciente
      ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)).
- [ ] Confirmar una cita nueva con un profesional distinto extiende el acceso a ese profesional; no revive
      el acceso del profesional anterior cuya asignación ya venció.
- [ ] Cada tabla nueva del esquema `public` tiene RLS activada y al menos una prueba pgTAP negativa
      que confirma que el rol equivocado no ve el dato (regla de [CLAUDE.md](../CLAUDE.md)).
- [ ] Con RLS activo, una consulta directa a `atenciones`, `triajes`, `recetas` o a las tablas de Psicología autenticada como
      `enfermera` no devuelve ninguna fila: la enfermera no lee historias clínicas.
- [ ] Una derivación `pendiente` no da acceso: el profesional de la especialidad de destino no lee `atenciones` ni
      `historias_clinicas` del paciente hasta que lo toma ([ADR-0032](adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md)).
- [ ] Un profesional que **no** es psicólogo, aunque tenga al paciente a cargo, no recibe ninguna fila de las tablas de
      Psicología (ni de las atenciones de autor psicólogo) por consulta directa ni abriendo la dirección de la pantalla; un
      psicólogo a cargo sí las ve ([ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)).
- [ ] El administrativo no obtiene contenido clínico por ninguna tabla; la única excepción es la generación de la copia, por
      su función acotada y auditada.
- [ ] El administrativo no puede insertar una asignación cuyo motivo empiece por `cita:` o `derivacion:`.
- [ ] Un profesional sin permiso de recetar (p. ej. un psicólogo) no emite recetas, ni por consulta directa.

## Riesgos técnicos abiertos

- **P-1 (bloqueante, no resoluble en este documento):** marco legal peruano de historia clínica
  electrónica (NTS del MINSA) — plazo de retención, si la firma lógica (`firmada_en` + autor +
  auditoría) basta o se exige firma electrónica certificada, y si alojar datos clínicos fuera de
  Perú es admisible. No se puede cerrar el diseño del módulo de historias clínicas para producción
  ni descartar reabrir
  [ADR-0021](adrs/0021-base-de-datos-neon.md)/[ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)
  (hosting de la base de datos) sin resolver esto primero. **Cómo avanzar:** contratar a un abogado
  especializado en protección de datos de salud/historia clínica electrónica en Perú y llevarle
  tres preguntas puntuales (plazo de retención exigido, si la firma lógica satisface la norma o
  exige firma electrónica certificada, si el alojamiento fuera de Perú es admisible para datos
  clínicos — confirmar la región de Neon contratada contra la respuesta). Mientras se resuelve, el
  plan de implementación (ver «Plan de implementación sugerido» más abajo) ya aísla esto: todo lo
  demás (H1-H5, H7) puede construirse y probarse en paralelo; solo H6 no debe entrar en producción
  con datos reales de pacientes antes de tener respuesta. Al ser un proyecto de muestra se permiten datos
  **sintéticos** de demostración ([datos-demo.md](datos-demo.md)): P-1 bloquea los datos reales, no estos.
  **Nota (2026-09-28):** el cambio a Clerk ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md))
  agrega una pregunta relacionada pero distinta: Clerk aloja datos de *identidad* (nombre, email,
  teléfono de pacientes peruanos) fuera de Perú por defecto — no es dato clínico, pero conviene
  incluirlo en la misma consulta legal si la norma peruana también regula datos personales de
  pacientes más allá de lo estrictamente clínico.
  **Nota (2026-10-11):** la [investigación del marco legal](investigacion-marco-legal-y-saniape.md) leyó el texto oficial de
  la NTS 139, el DS 009-2017-SA y la Directiva 373 y es insumo para estas tres preguntas; **no cierra P-1**, que sigue
  pendiente del asesor. Los puntos nuevos que ese informe levanta (acreditación del sistema y registro ante la ANPD) son
  P-11 y P-12.
- **P-5 (depende de P-1, no resoluble en este documento):** si la firma lógica no es suficiente
  ante la norma peruana, puede requerirse integración con un proveedor de firma electrónica
  certificada (en Perú, un PSC acreditado por INDECOPI, o Firma Perú de RENIEC). **Cómo avanzar
  mientras tanto:** aislar `firmarAtencion` detrás de una interfaz de proveedor
  (`lib/firma/proveedor.ts`), igual que ya se hizo con notificaciones
  ([ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md)), para que la implementación
  actual (firma lógica) pueda reemplazarse por un proveedor certificado sin rediseñar el flujo de
  atención ni sus datos — el costo de esta cobertura es mínimo y evita quedar bloqueado si P-1 se
  resuelve en contra de la firma lógica.
- ~~Conflicto entre ADR-0011 y ADR-0012~~ — **resuelto**: el trigger `validar_cancelacion()`
  exceptúa la ventana de 1 hora cuando la cita cancelada está cubierta por un `bloqueo_agenda`
  vigente del médico (condición de datos, no de rol). SQL y justificación en
  [ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md).
- ~~Antecedentes del paciente sin modelar~~ — **resuelto**: tabla `antecedentes` confirmada en
  [ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md). Queda un ajuste menor no bloqueante
  antes de construir el formulario (H6): revisar con el personal médico que las 5 categorías cubran
  lo que ya registran en papel — es un `ALTER TYPE`, no un rediseño, si falta alguna.
- ~~Carga inicial del catálogo CIE-10~~ — **resuelto**: orden de fuentes (MINSA/SUSALUD primero, OMS
  como respaldo) y mecanismo de migración idempotente confirmados en
  [ADR-0014](adrs/0014-catalogo-cie-10.md). Queda una verificación operativa no bloqueante al llegar
  a H6: confirmar cuál fuente está descargable en formato reutilizable en ese momento.
- ~~Acceso médico sin expiración en `medico_tiene_paciente()`~~ — **resuelto**: hallazgo de una
  revisión adversarial del diseño (la rama directa sobre `citas` en ADR-0003 no tenía límite de
  tiempo). `asignaciones_paciente_medico` pasa a ser la única fuente de verdad, con expiración
  automática de 6 meses desde la cita, en [ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md).
- ~~Disparo indefinido de `confirmacion_reserva`/`cancelacion` y recordatorios vencidos~~ —
  **resuelto**: envío síncrono para las dos notificaciones transaccionales y guarda contra
  recordatorios de citas ya ocurridas, en
  [ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md).
- ~~Notificaciones fallidas sin ruta de visibilidad~~ — **resuelto**: vista dedicada en el panel
  administrativo y RLS para `notificaciones` (que no tenía ninguna), en
  [ADR-0018](adrs/0018-visibilidad-de-notificaciones-fallidas.md).
- **P-9 (bajo, propio del alcance de MVP):** el proyecto corre en niveles gratuitos (Vercel Hobby,
  Neon free, Clerk free, Upstash free) — no se ha verificado la ventana exacta de retención de
  PITR del plan gratuito de Neon vigente al momento de crear el proyecto (el diseño original
  apuntaba a 7 días, asumiendo un plan de pago; ver [ADR-0021](adrs/0021-base-de-datos-neon.md)).
  Sin impacto real para un MVP de clase — el riesgo es solo documentarlo antes de asumir un número
  de retención que el plan gratuito quizás no ofrezca. **Cómo avanzar:** confirmar la ventana de
  PITR del plan gratuito al crear el proyecto en Neon; si el proyecto pasa a producción real, es
  el momento de contratar el nivel de retención adecuado.
- **P-10 (medio, decisión de costo antes de producción):** el MFA obligatorio del personal (TOTP,
  [ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)) es una función del **plan Pro de Clerk**:
  el plan gratuito (Hobby) no lo incluye. Según clerk.com/pricing, consultado el 2026-10-06, el plan
  Pro cuesta 25 USD/mes facturado mensualmente o 20 USD/mes facturado anualmente (confirmar el
  precio vigente). En la instancia de desarrollo las funciones Pro se pueden probar sin costo, y por
  eso H1 se verificó con TOTP activo sin pagar. Contradice la premisa de P-9 («Clerk free») y el
  «sin planes de pago» del MVP: sin el plan Pro no se puede cumplir en producción el requisito de
  MFA del PRD. **Cómo avanzar:** antes de salir a producción con personal real, contratar Clerk Pro
  o decidir con el cliente una alternativa (otro proveedor con MFA/TOTP incluido, lo que reabre
  ADR-0022); no desactivar el MFA del personal para evitar el costo.
- **Adjuntos clínicos fuera de la autoridad de RLS (Vercel Blob):** ver el trade-off explícito en
  [ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md) — para los adjuntos, la
  autoridad de acceso es la Server Action que firma la URL, no una política RLS de Postgres. Es
  una excepción puntual a la regla no negociable de [CLAUDE.md](../CLAUDE.md) ("el aislamiento... debe
  aplicarse en la base de datos"), inherente a salir de un storage sobre Postgres — ningún storage
  de blobs (Vercel Blob, S3, R2) tiene RLS a nivel de fila. La función que firma URLs de adjuntos
  merece la misma revisión explícita que las políticas RLS de `atenciones`.
- **P-6 (excluido a propósito, no acción requerida ahora):** gestión de consultorios no está en el
  PRD — no construir esto hoy (regla de [CLAUDE.md](../CLAUDE.md), "Alcance — no lo amplíes"). Si en el
  futuro la clínica confirma que tiene menos consultorios que profesionales, la extensión es mecánica y ya
  conocida: tabla `consultorios` + columna `consultorio_id` en `citas` + una restricción
  `EXCLUDE USING gist (consultorio_id with =, rango with &&)` análoga a `citas_sin_cruce_medico`
  ([ADR-0005](adrs/0005-modelo-de-datos-y-prevencion-de-doble-reserva.md)). Solo construirla si el
  cliente la pide explícitamente.
- **P-7 (aceptado, monitorear en producción):** dependencia de un único canal de notificación
  (email). Si la tasa de apertura es baja, el objetivo de 75% de autogestión vía portal puede verse
  afectado sin que el sistema lo detecte automáticamente (el dashboard no incluye analítica, por
  alcance del PRD). **Cómo avanzar:** revisar manualmente la tasa de entrega/apertura en el panel de
  Resend durante los primeros meses de uso; si es consistentemente baja, activar la vía ya prevista
  (interfaz de proveedor en
  [ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md)) para sumar WhatsApp o SMS — eso sí
  sería una decisión de alcance nueva a validar con el cliente, no algo a construir por anticipado.
  **Actualización (2026-10-11):** el PRD deja WhatsApp y SMS **fuera de alcance** por decisión del usuario, y tampoco incluye
  alertas automáticas de interacción entre medicamentos. Costos aceptados: con un solo canal, una tasa de apertura baja puede
  frenar el 75 % de autogestión; sin alertas, el cruce de medicamentos depende de que el profesional revise la lista que el
  sistema le muestra. **Vía de reactivación:** sumar un canal es la decisión de alcance nueva ya descrita (interfaz de
  proveedor de ADR-0017); las alertas exigirían además un catálogo de medicamentos con sus interacciones, que hoy no existe en
  el diseño —el change de recetas ni siquiera incluye un catálogo de medicamentos— y también serían una decisión nueva con el
  cliente, no algo a construir por anticipado.
- **P-11 (bloqueante para producción con datos reales, no resoluble en este documento):** acreditación del sistema ante el
  MINSA. El DS 009-2017-SA obliga a todo establecimiento público, privado o mixto con un sistema de información de historias
  clínicas electrónicas a **acreditarlo** ante el MINSA o la Autoridad Regional de Salud (art. 13). Sus requisitos básicos
  (art. 22) incluyen estar inscrito en el RENIPRESS, interoperar con los servicios de RENIEC, cumplir la seguridad del art. 30,
  registrar la base de datos ante la ANPD, incorporar **firma digital** (Ley 27269), **separar los datos de filiación de la
  información clínica**, registrar solo como consecuencia de la atención y un terminal por consultorio. La Directiva
  373-MINSA/OGTI-2025 (RM 164-2025) alcanza también a las IPRESS privadas con SIHCE; la RM 188-2026-MINSA amplía hasta 12
  meses los plazos de los numerales 5.10 y 8.1, **no** el 5.11 (quien empiece a usar historias electrónicas después debe
  usar un SIHCE que ya haya aprobado la acreditación en otras IPRESS). Verificado en el texto oficial (nivel A de la
  [investigación](investigacion-marco-legal-y-saniape.md), secciones 4.2 y 4.3), salvo los anexos de la Directiva, que no se
  leyeron completos; **no** se verificó qué sanción o efecto tiene operar sin acreditación. El diseño actual no la contempla:
  firma lógica (P-5), interoperabilidad con RENIEC y criterios técnicos de la Directiva (ISO/IEC 27001, HL7 FHIR, red privada
  virtual) quedan fuera del alcance. **Cómo avanzar:** llevar al asesor legal si la clínica debe acreditar este sistema o
  puede operar una historia «informatizada» (sin firma digital), con qué plazo y con qué efecto; mientras tanto, el modo
  demostración (datos sintéticos) sigue siendo el único permitido. La acreditación es una puerta de salida a producción, junto
  con P-1 y P-5.
- **P-12 (bloqueante para producción con datos reales, no resoluble en este documento):** registro del banco de datos ante la
  ANPD y autorización del paciente para tratar sus datos de salud. El DS 009-2017-SA (art. 22.e) exige registrar la base de
  datos ante la ANPD (Ley 29733), y la Directiva 373 pide verificar la Resolución Directoral de la ANPD que acredita ese
  registro y la **autorización previa** del paciente (modelo en su Anexo 07, que cita la RM 688-2020/MINSA, no leída). Según
  un resumen de terceros (nivel B; texto no leído), el reglamento vigente, DS 016-2024-JUS, añade notificación de incidentes a
  la ANPD en 48 horas, oficial de datos personales con datos sensibles, criterios para transferencias internacionales y
  documento de seguridad. Los documentos del proyecto no nombraban la Ley 29733, y la base (Neon, `aws-us-east-2`, Ohio) y la
  identidad (Clerk) están fuera del Perú, lo que enlaza con P-1. Las tablas nuevas suman datos de terceros (representantes que
  piden una copia). **Cómo avanzar:** incluirlo en la consulta legal de P-1; preparar el registro y la cláusula de
  autorización antes de cualquier dato real.
- **P-13 (alto, decisión del usuario antes de H2c):** renombrar «médico» a «profesional» en producción
  ([ADR-0030](adrs/0030-profesional-de-la-salud.md), Propuesta). Toca el esquema de H2 ya aplicado —tabla, claves foráneas,
  valor del enum de rol, la función central de acceso a historias, las políticas y su suite pgTAP— y el metadato de Clerk de
  cada usuario; un error deja sin acceso a los profesionales o abre un acceso indebido. Clerk, la aplicación y la base cambian
  por separado, y el token de un profesional con sesión abierta sigue diciendo `medico`. El change `profesionales-de-la-salud`
  lo mitiga con una sola migración atómica con autocomprobación, una instantánea normalizada de políticas antes y después, una
  tolerancia transitoria del valor `medico` en `rol_actual()` y un script de Clerk, y retira esa tolerancia en una migración
  posterior. Hoy solo hay datos de demostración, que es el momento más barato. **Cómo avanzar:** que el usuario acepte o
  rechace la ADR **antes** de mergear H3 (que usa `'medico'`); si la acepta, revisión con `code-review` y verificación por
  mutación. Alternativa de menor costo: conservar `medicos` y añadirle `profesion`.
- **P-14 (alto, depende del asesor legal):** aislamiento de la información de Psicología
  ([ADR-0031](adrs/0031-aislamiento-de-la-informacion-de-psicologia.md), Propuesta). Es una excepción dentro del acceso a
  historias, el riesgo principal del proyecto. Puntos abiertos: (1) cada tabla, vista, función o exportación nueva puede filtrar
  Psicología si olvida la regla —de ahí la prueba negativa **por rol y por profesión** y la prueba de cobertura de la copia—;
  (2) la atención genérica del psicólogo en `atenciones` es legible por todo profesional a cargo salvo que su política la
  oculte (ver «Información de Psicología»); (3) la copia que se entrega al paciente incluye Psicología y la genera recepción
  (P-16); (4) las reglas de salud mental y el caso de emergencia son una pregunta para el asesor, no verificada; (5) que un
  paciente fue derivado a Psicología es visible para enfermería y recepción. **Cómo avanzar:** aceptar la ADR, decidir el punto
  (2) en `especialidad-psicologia` y llevar (4) y (5) a la consulta legal.
- **P-15 (medio, decisión pendiente del cliente):** imágenes como adjuntos. El diseño de H6 admite solo PDF
  (`application/pdf`, tamaño acotado, comprobación de los primeros bytes; D7 de `historias-clinicas` y
  [ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md)), pero Odontología necesita radiografías y Podología fotos de
  evolución. Admitir imágenes cambia tipos MIME, validación por formato, tamaño y cuota de Blob; la regla de acceso no cambia
  (fila RLS legible antes de entregar el archivo). **Cómo avanzar:** decidir formatos y tamaño con el cliente y ampliar D7 y
  ADR-0024 antes de H6e y H6h; hasta entonces esos hitos no cierran su parte de adjuntos.
- **P-16 (medio, decisión del usuario y del asesor):** la copia de la historia y el rol de recepción. El PRD y
  [CLAUDE.md](../CLAUDE.md) hacen que recepción entregue la copia, pero el administrativo no lee contenido clínico, y la copia
  incluye Psicología. El change `copia-de-historia-clinica` y la [ADR-0034](adrs/0034-emision-de-la-copia-de-la-historia-clinica.md) (Propuesta) recomiendan una función acotada y auditada que entrega el contenido
  solo al servidor y un documento impreso en recepción frente al solicitante; su límite es que quien tiene el papel puede
  leerlo, y exige que el usuario lo acepte (la alternativa es que la genere un profesional a cargo, que no cubre Psicología ni
  pacientes sin asignación vigente). Tampoco está verificado si los «5 días» de la NTS 139 son hábiles o calendario (se cuentan
  calendario), quién puede solicitar la copia (herederos, autoridades) ni qué la hace «autenticada». **Cómo avanzar:** decidir
  con el usuario y llevar al asesor el plazo, los solicitantes y la autenticación; confirmar que hay impresora en recepción.
- **P-17 (medio, decisión del cliente y del asesor):** qué profesiones pueden recetar y contenido de las plantillas
  normativas. Médico sí y psicólogo no (confirmado por el usuario); odontólogo, fisioterapeuta y podólogo están por confirmar y
  mientras tanto no pueden recetar (el catálogo los deja en «no» y sin confirmar). El contenido mínimo de la receta
  (DS 014-2011-SA, art. 56) solo se conoce por una guía comercial, y la norma del odontograma (NTS 188) no se verificó. Mitigación: `profesiones_que_recetan` es un catálogo
  gestionado por migración, así que cambiar la respuesta es una migración de datos y no un rediseño. **Cómo avanzar:**
  confirmar con el cliente y validar con el asesor antes de H6c y H6e.
- **P-18 (medio, verificación pendiente):** licencias de los instrumentos de evaluación. El PRD pide tests con puntaje
  automático «de uso libre» para Psicología (y un test funcional en Fisioterapia), pero el proyecto no verificó la licencia de
  ningún instrumento concreto: muchas escalas clínicas tienen derechos de autor o condiciones de uso. El catálogo
  (`instrumentos_evaluacion`, H6i) lleva la marca `uso_libre` y se gestiona por migración, pero la marca solo es tan fiable como
  la verificación que la respalde. **Cómo avanzar:** antes de cargar un instrumento, comprobar su licencia y dejar la fuente
  en la migración; un instrumento sin licencia verificada no se carga.

## Plan de implementación sugerido

| Hito | Contenido | Depende de |
|---|---|---|
| H1 | Esqueleto: Next.js sobre Vercel, Neon, Clerk, roles, CI | — |
| H2 | Esquema completo + RLS + suite pgTAP | H1 |
| H2c | Profesionales de la salud: renombre de `medico` a `profesional` sin alias, `profesion` y `colegiatura`, migración atómica de la base, de los usuarios de Clerk y de la suite pgTAP (**Propuesta**, ADR-0030) | H2, ADR-0030 aceptada |
| H3 | Agenda: disponibilidades, slots, reserva con anticruce (panel administrativo) | H2 |
| H4 | Portal del paciente: registro, búsqueda, reserva, cancelación | H3 |
| H5 | Notificaciones por email + cron | H3 |
| H6 | Historias clínicas: registro, firma, addendas, auditoría de accesos | H2, P-1 |
| H6b | Triaje y derivación: visitas, triajes, derivaciones y «tomar al paciente»; la enfermera registra el triaje y deriva (**Propuesta**, ADR-0032) | H2c, H3, H6, ADR-0032 y ADR-0033 aceptadas |
| H6c | Recetas médicas: `profesiones_que_recetan`, `recetas`, `receta_items`, plantilla de impresión y medicamentos del paciente | H6, H2c, ADR-0035 aceptada |
| H6d | Copia de la historia clínica: solicitud, identidad verificada, generación y entrega en 5 días | H6, H3, ADR-0034 aceptada (cada tabla clínica nueva añade su sección al compilado; incluye Psicología al llegar H6g) |
| H6i | Mecanismos comunes de las especialidades: planes de sesiones con contador (apoyados en las citas de H3) e instrumentos de evaluación con puntaje (**Propuesta**; se construye antes que H6e a H6h) | H6, H2c, H3 |
| H6e | Odontología: odontograma (adulto e infantil, piezas y caras), hallazgos y tratamientos por pieza, radiografías como adjuntos | H6, H2c, H6i, P-15 |
| H6f | Fisioterapia: evaluación inicial, nota por sesión, plan de sesiones con contador, reevaluación y alta | H6, H2c, H6i |
| H6g | Psicología: evaluación estructurada, tests con puntaje automático, notas de sesión reservadas, sesiones recurrentes (**Propuesta**, ADR-0031) | H6, H2c, H6c, H6i, ADR-0031 aceptada |
| H6h | Podología: evaluación de pie, uñas, piel y pisada, plan de controles, protocolos por sesiones, fotos de evolución | H6, H2c, H6i, P-15 |
| H7 | Turnos de enfermería y dashboard operativo | H3 |
| H8 | Migración de datos, capacitación, manual de usuario | H4, H6 |

H6 depende de una decisión legal, no solo técnica. Puede construirse en paralelo, pero no debe
entrar en producción con datos reales hasta cerrar P-1 (los datos sintéticos de demostración sí se permiten).

Los hitos añadidos por el PRD del 2026-10-11 no cambian H1 a H8:

- **Las cinco especialidades se entregan juntas.** Medicina general es la plantilla de H6 ([ADR-0029](adrs/0029-datos-clinicos-por-especialidad.md));
  H6i (planes de sesiones e instrumentos de evaluación, que varias necesitan) se construye antes; H6e a H6h pueden
  construirse en paralelo, pero la puesta en uso es una sola, y los 4 a 5 meses de los criterios de éxito
  cuentan desde ese momento (riesgo de alcance del PRD).
- **H2c va antes de H3.** H3 escribe `'medico'` en sus acciones (`exigirPersonal`); renombrarlo después obliga a reescribirlo
  ([ADR-0030](adrs/0030-profesional-de-la-salud.md), consecuencias). Si la ADR se rechaza, H2c se reduce a añadir `profesion` a
  `medicos`.
- **H6b a H6i heredan el bloqueo de P-1** y suman P-11 (acreditación del sistema) y P-12 (ANPD) antes de usar datos reales; los
  datos sintéticos de demostración siguen permitidos. H2c, H6b, H6c, H6d, H6g y H6i tocan el acceso a historias clínicas o RLS:
  revisión explícita con `code-review` y verificación por mutación de sus pruebas negativas.
- **Dependencias entre los nuevos:** H6c necesita la atención de H6 y la profesión de H2c; H6d se construye idealmente al final
  del grupo H6, con el compilado completo (si no, cada change añade su sección y una prueba de cobertura lo exige); H6g
  consume la lista de medicamentos de H6c, porque los medicamentos que ven los demás profesionales salen de las recetas. H6b,
  H6c y H6d cuentan cada uno con su ADR propuesta ([ADR-0033](adrs/0033-visita-del-paciente-llegada-y-estados.md),
  [ADR-0035](adrs/0035-recetas-funciones-acotadas-numeracion-y-medicamentos.md) y
  [ADR-0034](adrs/0034-emision-de-la-copia-de-la-historia-clinica.md)), que el usuario debe aceptar antes de construir.
