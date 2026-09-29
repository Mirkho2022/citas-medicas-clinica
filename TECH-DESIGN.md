---
title: "Technical Design Document — Sistema de Gestión de Citas e Historias Clínicas Electrónicas"
documento_fuente: "PRD.md"
fecha: "2026-09-21"
---

# Technical Design Document: Sistema de Gestión de Citas e Historias Clínicas Electrónicas

**Tipo de proyecto:** Greenfield — no existe código ni repositorio git todavía (ver
[CLAUDE.md](CLAUDE.md)). Este documento define arquitectura, modelo de datos, seguridad, reglas de
negocio, superficie de la aplicación y plan de implementación, y formaliza las decisiones de
arquitectura como ADRs trazables.

**Design.md disponible:** No. No existe un documento de diseño de interfaz; el modelo de datos se
derivó directamente del PRD (esquema SQL detallado en «Modelo de datos» más abajo).

> Este documento especifica el **cómo**. El **qué** y el **por qué** están en el PRD; ante
> cualquier contradicción, manda el PRD.

## Resumen

Se construirá una aplicación web multi-rol (administrativo, médico, enfermera, paciente) que
reemplaza la gestión actual por Excel/Google Forms (citas) y papel (historias clínicas), con cuatro
superficies sobre una misma base de datos:

| Superficie | Rol | Función principal |
|---|---|---|
| Panel administrativo | Administrativo | Agendar, reprogramar y cancelar citas; registrar pacientes; dashboard operativo |
| Panel clínico | Médico | Ver agenda propia; registrar y consultar historias clínicas de sus pacientes |
| Panel de turnos | Enfermera | Consultar turno asignado y médico/servicio correspondiente |
| Portal de autoservicio | Paciente | Reservar y cancelar su propia cita; recibir recordatorios por email |

El diseño se ordena alrededor de dos exigencias del PRD: la doble reserva debe bloquearse a prueba
de concurrencia, y el acceso a historias clínicas debe aislarse por médico a cargo **en la base de
datos** mediante Row Level Security (RLS) de PostgreSQL, no solo en la aplicación — es el riesgo
principal declarado del proyecto y toda la arquitectura se ordena alrededor de él.

## Arquitectura de componentes

**Stack revisado el 2026-09-28** — el cliente cambió el despliegue de Cloudflare Workers a Vercel
y la base de datos de Supabase a Neon. Ver [ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)
a [ADR-0027](adrs/0027-herramienta-de-migraciones.md) para el detalle de cada pieza reemplazada;
ADR-0001, 0002, 0007 y 0009 quedan como registro histórico de las decisiones originales, con una
nota de reemplazo al final de cada uno.

- **Proyecto Vercel** (Next.js 15 App Router, sin adaptador — Vercel es el target nativo de
  Next.js): sirve las cuatro superficies — portal de autoservicio del paciente, panel
  administrativo, panel clínico, panel de turnos — bajo un único despliegue. Usa el rol de
  Postgres `app_user`; RLS es la autoridad de acceso a datos
  ([ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)).
- **Vercel Cron Jobs**: ejecutan los Route Handlers de notificaciones (recordatorio 24h,
  reintentos), usando el rol de Postgres `cron_notificaciones` — sin privilegios sobre
  `atenciones`/`antecedentes` ([ADR-0025](adrs/0025-notificaciones-cron-vercel.md)).
- **Clerk**: autenticación, MFA/TOTP de personal, invitaciones, sesión por cookies
  ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)).
- **Vercel BotID + Upstash Ratelimit**: anti-bots en registro/reserva y límite de intentos en rutas
  de autenticación ([ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md)).
- **Neon**: PostgreSQL 15+ con RLS, branching (staging) y PITR (backups)
  ([ADR-0021](adrs/0021-base-de-datos-neon.md)).
- **Vercel Blob**: adjuntos clínicos (escaneos de respaldo), acceso vía URL firmada de corta
  duración generada tras verificar `medico_tiene_paciente()`
  ([ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md)).
- **Resend**: envío de correo transaccional, detrás de una interfaz de proveedor (sin cambios).

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
     │  - rol Postgres: app_user        │        │  rol: cron_notif. │
     └────────┬─────────────────────────┘        └────────┬──────────┘
              │ driver serverless de Neon                 │ driver serverless
              │ (RLS aplicada, contexto vía SET LOCAL)     │ (sin RLS, GRANT mínimo)
     ┌────────▼───────────────────────────────────────────▼─────────┐
     │  Neon — PostgreSQL (RLS, branching, PITR)                     │
     └───────────────────────────────────────────────────────────────┘
                      │                              │
                      └──► Resend (correo)           └──► Vercel Blob (adjuntos)
```

**Regla no negociable (equivalente a la de `service_role` en el diseño original):** el rol de
Postgres `cron_notificaciones` solo existe en los Route Handlers de cron y en CI. Nunca se usa en
el código que sirve tráfico de usuario, y sus `GRANT` se limitan estrictamente a `notificaciones`
y `citas` — ver [ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md).

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
| Cron | Vercel Cron Jobs (`vercel.json`) | Plan Pro ([ADR-0025](adrs/0025-notificaciones-cron-vercel.md)) |
| Migraciones | `node-pg-migrate` (`migrations/*.sql`) | Versionadas en git; nunca cambios manuales en producción ([ADR-0027](adrs/0027-herramienta-de-migraciones.md)) |
| Tests | Vitest, Playwright, pgTAP | pgTAP es obligatorio para políticas RLS |

## Decisiones de arquitectura

| # | Decisión | Estado |
|---|---|---|
| [ADR-0001](adrs/0001-arquitectura-de-componentes-y-hosting.md) | Arquitectura de componentes y hosting (Cloudflare) | Reemplazado por ADR-0020 |
| [ADR-0002](adrs/0002-base-de-datos-y-autenticacion.md) | Base de datos y autenticación (Supabase) | Reemplazado por ADR-0021, 0022, 0024 |
| [ADR-0003](adrs/0003-control-de-acceso-a-historias-clinicas.md) | Control de acceso a historias clínicas (RLS + rol en JWT) | Aceptado (mecanismo de contexto reemplazado por ADR-0023) |
| [ADR-0004](adrs/0004-stack-de-frontend-y-validacion.md) | Stack de frontend y validación | Aceptado |
| [ADR-0005](adrs/0005-modelo-de-datos-y-prevencion-de-doble-reserva.md) | Modelo de datos y prevención de doble reserva | Aceptado |
| [ADR-0006](adrs/0006-contratos-de-api-via-server-actions.md) | Contratos de API vía Server Actions | Aceptado |
| [ADR-0007](adrs/0007-manejo-de-estado-y-sesion.md) | Manejo de estado y sesión (Supabase) | Reemplazado por ADR-0022 |
| [ADR-0008](adrs/0008-resiliencia-y-manejo-de-errores.md) | Resiliencia y manejo de errores | Aceptado |
| [ADR-0009](adrs/0009-canal-y-programacion-de-notificaciones.md) | Canal y programación de notificaciones (Cloudflare Cron) | Aceptado (programación reemplazada por ADR-0025) |
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
| [ADR-0023](adrs/0023-contexto-de-usuario-para-rls.md) | Contexto de usuario para RLS sin helpers de Supabase | Aceptado |
| [ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md) | Almacenamiento de adjuntos clínicos: Vercel Blob | Aceptado |
| [ADR-0025](adrs/0025-notificaciones-cron-vercel.md) | Notificaciones: cron en Vercel Cron Jobs | Aceptado |
| [ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md) | Controles de borde: anti-bots y rate limiting | Aceptado |
| [ADR-0027](adrs/0027-herramienta-de-migraciones.md) | Herramienta de migraciones: node-pg-migrate | Aceptado |

Los ADR 0001–0011 registran las decisiones de arquitectura base del proyecto (hosting, base de
datos, control de acceso, stack de frontend, modelo de datos, contratos de API, estado y sesión,
resiliencia, notificaciones, disponibilidad y reasignación por baja médica). Los ADR 0012–0014
resuelven, con decisión explícita del cliente, tres puntos que quedaban abiertos en el diseño
inicial: el alcance por rol de la ventana de cancelación, la definición operativa de "historia
clínica digitalizada" y la fuente del catálogo CIE-10. El ADR 0015 resuelve una brecha de modelo de
datos detectada al combinar 0012–0014 entre sí (ver «Riesgos técnicos abiertos»). Los ADR 0016–0019
cierran los hallazgos de una revisión adversarial del diseño: vigencia del acceso a historias
clínicas (0016), disparo y guarda de notificaciones (0017), visibilidad de notificaciones fallidas
(0018), y formalización de la migración de datos (0019). ADR-0001, ADR-0002 y ADR-0012 recibieron
además enmiendas menores de esa misma revisión (alternativas consideradas y un riesgo residual
documentado, respectivamente), sin cambiar la decisión original.

**Cambio de stack (2026-09-28):** el cliente decidió reemplazar Cloudflare Workers por Vercel y
Supabase por Neon. Los ADR 0020–0027 registran cada pieza reemplazada (hosting, base de datos,
autenticación, contexto de RLS, almacenamiento, cron, controles de borde, migraciones) con sus
propias alternativas consideradas. Los ADR 0001, 0002, 0007 y 0009 quedan como registro histórico
de las decisiones originales — cada uno tiene una nota de reemplazo al final apuntando al ADR
vigente. ADR-0003 (control de acceso a historias clínicas) **no** se reemplaza: su lógica de
negocio sigue vigente sin cambios; solo el mecanismo de transporte del contexto de usuario cambia
(ADR-0023). Lo mismo aplica a ADR-0009: el canal (Resend) no cambia, solo el motor de cron
(ADR-0025).

## Modelo de datos

### Extensiones y tipos

```sql
create extension if not exists btree_gist;   -- requerido por las restricciones EXCLUDE
create extension if not exists pgcrypto;     -- gen_random_uuid()
create extension if not exists citext;       -- emails sin sensibilidad a mayúsculas

create type rol_usuario         as enum ('administrativo','medico','enfermera','paciente');
create type tipo_documento      as enum ('DNI','CE');
create type estado_cita         as enum ('reservada','confirmada','atendida','cancelada','no_asistio');
create type tipo_turno          as enum ('manana','tarde','noche');
create type estado_notificacion as enum ('pendiente','enviada','fallida');
create type tipo_antecedente    as enum ('personal_patologico','quirurgico','alergico','familiar','habito_nocivo');
```

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

create index perfiles_clerk_user_id_idx on perfiles (clerk_user_id);

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
-- Carpeta: una por paciente, creada al registrar al paciente.
create table historias_clinicas (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete restrict,
  numero      text not null unique,              -- correlativo visible de historia
  creado_en   timestamptz not null default now()
);

-- Nota de atención: una por consulta. Append-only una vez firmada.
create table atenciones (
  id               uuid primary key default gen_random_uuid(),
  historia_id      uuid not null references historias_clinicas(id) on delete restrict,
  paciente_id      uuid not null references pacientes(id) on delete restrict,  -- denormalizado para RLS
  cita_id          uuid unique references citas(id) on delete set null,
  medico_id        uuid not null references medicos(id) on delete restrict,
  motivo_consulta  text not null check (length(btrim(motivo_consulta)) > 0),
  anamnesis        text not null check (length(btrim(anamnesis)) > 0),
  examen_fisico    text not null check (length(btrim(examen_fisico)) > 0),
  diagnosticos     jsonb not null default '[]'::jsonb,  -- [{cie10, descripcion, tipo}]
  plan_tratamiento text not null check (length(btrim(plan_tratamiento)) > 0),
  firmada_en       timestamptz,
  creado_en        timestamptz not null default now(),
  check (jsonb_array_length(diagnosticos) > 0)
);

create index atenciones_paciente_idx on atenciones (paciente_id, creado_en desc);
create index atenciones_medico_idx   on atenciones (medico_id, creado_en desc);

-- Corrección posterior a la firma: nunca se edita la nota original.
create table addendas (
  id          uuid primary key default gen_random_uuid(),
  atencion_id uuid not null references atenciones(id) on delete restrict,
  medico_id   uuid not null references medicos(id) on delete restrict,
  texto       text not null check (length(btrim(texto)) > 0),
  creado_en   timestamptz not null default now()
);

-- Única fuente de verdad de "paciente a cargo" (ADR-0016). Append-only: nunca se
-- edita una fila existente, se inserta una nueva (mismo principio que atenciones/antecedentes).
create table asignaciones_paciente_medico (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references pacientes(id) on delete cascade,
  medico_id     uuid not null references medicos(id) on delete cascade,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  motivo        text
);

create index asignaciones_paciente_idx on asignaciones_paciente_medico (paciente_id, medico_id);
```

Una fila se crea de dos formas: automáticamente cuando una cita alcanza `confirmada`/`atendida`
por primera vez (`vigente_hasta = inicio + 6 meses`, sin necesidad de que nadie la gestione a
mano), o manualmente por el administrativo vía `asignarPacienteAMedico` para casos especiales
(interconsulta, cobertura de colega, médico de cabecera con `vigente_hasta` nulo = sin
vencimiento). Ver [ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md) para la
justificación completa, incluidas las alternativas descartadas.

```sql
-- Otorga/extiende acceso automáticamente al confirmar o atender una cita (ADR-0016).
-- security definer: no depende de que quien confirma la cita tenga permiso de escritura
-- directa sobre asignaciones_paciente_medico.
create or replace function public.extender_asignacion_por_cita()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado in ('confirmada','atendida')
     and (old is null or old.estado not in ('confirmada','atendida')) then
    insert into public.asignaciones_paciente_medico
      (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo)
    values
      (new.paciente_id, new.medico_id, current_date,
       (new.inicio::date + interval '6 months')::date,
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

Los antecedentes del paciente son datos persistentes del **paciente** (no de una atención puntual)
y deben ser consultables en tiempo real, por eso viven en su propia tabla en vez de en un campo de
`atenciones` ([ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md)):

```sql
create table antecedentes (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references pacientes(id) on delete restrict,
  tipo           tipo_antecedente not null,
  descripcion    text not null check (length(btrim(descripcion)) > 0),
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

El registro de accesos de lectura no es opcional: sin él, "un médico no puede acceder a historias
de pacientes que no tiene a cargo" es una afirmación que nadie puede verificar tras un incidente. Se
escribe desde la Server Action que abre una historia clínica.

## Seguridad y control de acceso

### Rol en el token y contexto de usuario en Postgres

El rol se guarda en `publicMetadata.rol` del usuario de Clerk y se expone en `sessionClaims`
mediante un JWT template de Clerk — el equivalente funcional del *custom access token hook* de
Supabase ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)). Neon no tiene `auth.jwt()`/
`auth.uid()`: cada transacción recibe el contexto vía `SET LOCAL`, poblado por un único wrapper de
acceso a datos que ningún código puede evitar ([ADR-0023](adrs/0023-contexto-de-usuario-para-rls.md)):

```ts
// lib/db/with-user-context.ts — único punto de entrada a la base de datos.
export async function withUserContext<T>(
  callback: (tx: Transaction) => Promise<T>
): Promise<T> {
  const { userId, sessionClaims } = auth(); // Clerk
  return db.transaction(async (tx) => {
    const perfilId = await perfilIdParaUsuarioClerk(tx, userId);
    await tx.execute(sql`select set_config('app.current_user_id', ${perfilId}, true)`);
    await tx.execute(sql`select set_config('app.current_user_role', ${sessionClaims.rol}, true)`);
    return callback(tx);
  });
}
```

Consecuencia operativa: un cambio de rol **no surte efecto hasta que la sesión de Clerk se
refresca**. Al desactivar o degradar a un usuario hay que revocar sus sesiones activas vía la API
de Clerk (`banUser`/revocar sesiones), no solo actualizar la fila en `perfiles`.

### Funciones de apoyo

```sql
-- Paciente correspondiente al usuario autenticado.
-- current_setting(..., true) devuelve NULL en vez de error si no se pobló (ADR-0023).
create or replace function public.paciente_actual()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.pacientes p
  where p.perfil_id = (select current_setting('app.current_user_id', true)::uuid);
$$;

-- ¿El médico autenticado tiene a este paciente a su cargo?
-- Única fuente: asignaciones_paciente_medico, vigente. Se elimina la rama directa
-- sobre citas (sin expiración) que tenía el diseño original — ver ADR-0016.
-- current_user_id viene del contexto poblado por withUserContext() — ver ADR-0023.
create or replace function public.medico_tiene_paciente(p_paciente uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.asignaciones_paciente_medico a
    join public.medicos m on m.id = a.medico_id
    where a.paciente_id = p_paciente
      and m.perfil_id = (select current_setting('app.current_user_id', true)::uuid)
      and a.vigente_desde <= current_date
      and (a.vigente_hasta is null or a.vigente_hasta >= current_date)
  );
$$;
```

Ambas son `security definer` con `search_path` vacío: sin eso, un usuario podría crear objetos en
su propio esquema y secuestrar la resolución de nombres dentro de la función.

### Políticas RLS

RLS se activa en **todas** las tablas del esquema `public`, sin excepción. Una tabla sin RLS en este
sistema es una filtración de datos clínicos.

```sql
alter table atenciones enable row level security;

-- El médico solo lee atenciones de pacientes a su cargo.
-- current_setting(...) reemplaza auth.jwt()/auth.uid() de Supabase — ver ADR-0023.
create policy "medico lee atenciones de sus pacientes"
on atenciones for select to authenticated
using (
  (select current_setting('app.current_user_role', true)) = 'medico'
  and public.medico_tiene_paciente(paciente_id)
);

-- El médico solo escribe atenciones propias, de pacientes a su cargo y no firmadas.
create policy "medico registra atenciones"
on atenciones for insert to authenticated
with check (
  (select current_setting('app.current_user_role', true)) = 'medico'
  and public.medico_tiene_paciente(paciente_id)
  and medico_id = (select id from public.medicos where perfil_id = (select current_setting('app.current_user_id', true)::uuid))
);

-- El administrativo NO lee contenido clínico. Nunca.
-- El paciente tampoco: el PRD excluye el acceso del paciente a historias clínicas.
```

`antecedentes` sigue exactamente el mismo patrón de políticas que `atenciones` (misma condición
`medico_tiene_paciente`, mismo bloqueo total para administrativo y paciente), ver
[ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md) para el SQL completo.

```sql
alter table asignaciones_paciente_medico enable row level security;

-- El trigger de citas inserta como security definer; esta política cubre la
-- gestión manual del administrativo (asignarPacienteAMedico).
create policy "administrativo gestiona asignaciones"
on asignaciones_paciente_medico for all to authenticated
using ((select current_setting('app.current_user_role', true)) = 'administrativo')
with check ((select current_setting('app.current_user_role', true)) = 'administrativo');

-- El médico solo ve sus propias asignaciones (ej. para un futuro "mis pacientes").
create policy "medico lee sus propias asignaciones"
on asignaciones_paciente_medico for select to authenticated
using (
  (select current_setting('app.current_user_role', true)) = 'medico'
  and medico_id = (select id from public.medicos where perfil_id = (select current_setting('app.current_user_id', true)::uuid))
);

-- El paciente no tiene ninguna política sobre esta tabla.
```

```sql
alter table notificaciones enable row level security;

-- Visibilidad de notificaciones fallidas para revisión manual (ADR-0018).
create policy "administrativo lee notificaciones"
on notificaciones for select to authenticated
using ((select current_setting('app.current_user_role', true)) = 'administrativo');

-- Ningún otro rol tiene política de lectura. Los Route Handlers de cron usan el rol
-- de Postgres cron_notificaciones (ADR-0020), con GRANT directo sobre esta tabla —
-- no pasan por RLS porque no son un usuario autenticado de la aplicación.
```

```sql
alter table citas enable row level security;

create policy "paciente ve sus citas"
on citas for select to authenticated
using (
  (select current_setting('app.current_user_role', true)) = 'paciente'
  and paciente_id = public.paciente_actual()
);

create policy "paciente reserva su cita"
on citas for insert to authenticated
with check (
  (select current_setting('app.current_user_role', true)) = 'paciente'
  and paciente_id = public.paciente_actual()
  and origen = 'portal'
  and inicio > now()
);

create policy "administrativo gestiona todas las citas"
on citas for all to authenticated
using ((select current_setting('app.current_user_role', true)) = 'administrativo')
with check ((select current_setting('app.current_user_role', true)) = 'administrativo');

create policy "medico ve su agenda"
on citas for select to authenticated
using (
  (select current_setting('app.current_user_role', true)) = 'medico'
  and medico_id = (select id from public.medicos where perfil_id = (select current_setting('app.current_user_id', true)::uuid))
);
```

`(select current_setting(...))` va envuelto en subconsulta a propósito, igual que antes con
`auth.uid()`/`auth.jwt()`: así PostgreSQL lo evalúa una vez por consulta (InitPlan) en lugar de una
vez por fila. En una agenda con miles de citas la diferencia es de órdenes de magnitud.

### Escalada de privilegios

RLS de PostgreSQL no tiene granularidad por columna, así que un paciente con permiso de
actualización sobre su propio perfil podría cambiarse el rol a `administrativo`. Se bloquea con
trigger:

```sql
create or replace function public.bloquear_cambio_de_rol()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol
     and coalesce((select current_setting('app.current_user_role', true)), '') <> 'administrativo' then
    raise exception 'No autorizado para cambiar el rol de un usuario' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger perfiles_bloquear_rol
  before update on perfiles
  for each row execute function public.bloquear_cambio_de_rol();
```

El webhook de Clerk que sincroniza `perfiles` (`user.created`/`user.updated`,
[ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)) corre con un tercer rol de Postgres dedicado
(`sync_identidad`, `GRANT` solo sobre `perfiles`), distinto de `app_user` y de
`cron_notificaciones` — ni sujeto a RLS de usuario final ni con alcance sobre historias clínicas.
Es el único camino, junto con el propio administrativo, que puede escribir `perfiles.rol`.

Las cuentas de personal (administrativo, médico, enfermera) **no se auto-registran**: las crea un
administrativo por invitación vía la API de Clerk. El registro público solo produce rol
`paciente`.

### Controles adicionales

| Control | Implementación |
|---|---|
| MFA para personal | TOTP de Clerk, obligatorio para roles no-paciente ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md)) |
| Bots en el portal | Vercel BotID en registro y reserva ([ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md)) |
| Fuerza bruta | Upstash Ratelimit en rutas de auth: 5 intentos / 15 min por IP ([ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md)) |
| Cifrado | TLS en tránsito; cifrado en reposo de Neon; backups (PITR) cifrados |
| Adjuntos clínicos | Vercel Blob privado, acceso vía URL firmada de corta duración tras verificar `medico_tiene_paciente()` — la Server Action es la autoridad de acceso, no RLS ([ADR-0024](adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md)) |
| Secretos | Variables de entorno de Vercel; ninguna clave en el repositorio |
| Cabeceras | CSP estricta, HSTS, `X-Frame-Options: DENY` |
| WAF genérico de borde | No reemplazado 1:1 tras salir de Cloudflare — riesgo aceptado, ver [ADR-0026](adrs/0026-controles-de-borde-antibots-y-rate-limiting.md) |

## Reglas de negocio: dónde vive cada una

Cada regla del PRD se ancla en la capa más profunda posible. La UI puede mostrar el mensaje, pero
nunca es el único lugar que impide la violación.

| Regla (PRD) | Implementación | Capa |
|---|---|---|
| Doble reserva bloqueada | `EXCLUDE USING gist` en `citas` | Base de datos |
| Mensaje `Registro de cita ya agendado` | Mapeo de `SQLSTATE 23P01` a ese texto exacto | Server Action |
| Cancelación hasta 1 h antes, para todos los roles | Trigger `validar_cancelacion()` ([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)) | Base de datos |
| Advertencia de la restricción al reservar | Texto en el formulario de reserva | UI |
| Historia clínica sin campos vacíos | `CHECK` en columnas + esquema Zod | BD + servidor |
| Datos del paciente no editables desde HC | Las columnas no existen en `atenciones` | Estructura |
| Médico sin acceso a pacientes ajenos | Políticas RLS + `medico_tiene_paciente()` | Base de datos |
| Acceso médico expira automáticamente (6 meses desde la cita) | Trigger `extender_asignacion_por_cita()` ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)) | Base de datos |
| Doctor de baja o emergencia: reasignación | `bloqueos_agenda` + flujo de reasignación masiva ([ADR-0011](adrs/0011-reasignacion-de-citas-por-baja-medica.md)) | Aplicación |
| Recordatorio un día antes | Vercel Cron Job + tabla `notificaciones` ([ADR-0025](adrs/0025-notificaciones-cron-vercel.md)) | Route Handler |

### Doble reserva

```ts
// lib/citas/reservar.ts
try {
  await withUserContext((tx) => tx.insert(citas).values(nuevaCita));
} catch (error) {
  if (isPostgresError(error, '23P01')) {  // exclusion_violation
    return { ok: false, mensaje: 'Registro de cita ya agendado' };
  }
  throw error;
}
```

El texto se usa literalmente como lo define el PRD. Si se traduce o reformula, se rompe el criterio
de aceptación.

### Cancelación tardía

La ventana de 1 hora aplica a **todos los roles**, incluido el administrativo, salvo cuando la
cancelación es parte de una reasignación por baja médica ya en curso
([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)):

```sql
create or replace function public.validar_cancelacion()
returns trigger language plpgsql
as $$
declare
  v_es_por_baja boolean;
begin
  if new.estado = 'cancelada' and old.estado <> 'cancelada' then
    -- Excepción: si existe un bloqueo_agenda vigente que cubre el rango de la cita
    -- para este médico, la cancelación es parte del flujo de reasignación por baja
    -- médica (ADR-0011), no una cancelación discrecional, y no aplica la ventana de 1h.
    select exists (
      select 1 from public.bloqueos_agenda b
      where b.medico_id = old.medico_id
        and b.rango && old.rango
    ) into v_es_por_baja;

    if not v_es_por_baja and new.inicio - now() < interval '1 hour' then
      raise exception 'No es posible cancelar con menos de 1 hora de anticipación'
        using errcode = 'P0001';
    end if;
    new.cancelada_en  := now();
    new.cancelada_por := (select current_setting('app.current_user_id', true)::uuid);
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
autor; el texto original permanece.

### Doctor de baja o emergencia

1. El administrativo crea un `bloqueo_agenda` para el rango afectado.
2. El sistema lista las citas vigentes del médico dentro del rango.
3. Para cada una propone médicos de la misma especialidad con slot libre.
4. La reasignación se ejecuta en una transacción: cancela la cita original con
   `reprogramada_de` apuntando a la nueva, e inserta la nueva cita.
5. Se encola una notificación de reprogramación al paciente.

Si no hay médico sustituto disponible, la cita queda marcada para contacto manual. El sistema no
cancela citas en silencio.

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
    registro/                   alta de paciente (Turnstile)
  (paciente)/
    portal/
      citas/                    mis citas
      citas/nueva/              búsqueda de disponibilidad y reserva
  (personal)/
    agenda/                     vista de agenda (administrativo, médico)
    pacientes/                  registro y búsqueda (administrativo)
    pacientes/[id]/historia/    historia clínica (médico)
    turnos/                     turnos de enfermería
    dashboard/                  vista operativa de citas y pacientes
    dashboard/notificaciones/   notificaciones fallidas para revisión manual (ADR-0018)
```

Cada grupo de rutas lleva un `layout.tsx` que verifica el rol en servidor y redirige si no
corresponde. Esa comprobación es de usabilidad, no de seguridad: la autoridad real es RLS.

### Server Actions

| Acción | Rol | Valida |
|---|---|---|
| `reservarCita` | paciente, administrativo | Slot vigente, sin cruce, dentro de disponibilidad |
| `cancelarCita` | paciente, administrativo | Ventana de 1 hora (todos los roles, salvo reasignación por baja) |
| `reprogramarCita` | administrativo | Cancela + crea en una transacción |
| `registrarPaciente` | administrativo, público | Formato de DNI/CE, documento no duplicado |
| `registrarAtencion` | médico | Campos obligatorios, paciente a cargo |
| `firmarAtencion` | médico | Autoría propia; vuelve la nota inmutable |
| `agregarAddenda` | médico | Atención existente y firmada |
| `asignarTurno` | administrativo | Sin choque de turno para la enfermera |
| `reasignarPorBaja` | administrativo | Sustituto de la misma especialidad y libre |
| `asignarPacienteAMedico` | administrativo | Asignación manual paciente-médico para casos especiales (interconsulta, cobertura, médico de cabecera); `vigente_hasta` opcional ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)) |

Todas validan con Zod en servidor antes de tocar la base de datos, y todas devuelven un resultado
tipado `{ ok: true, datos } | { ok: false, mensaje }` — nunca lanzan la excepción de Postgres al
usuario, para no filtrar estructura interna.

### Dashboard operativo

Vista simple, sin capa analítica (explícitamente fuera de alcance en el PRD):

- Citas de hoy por estado (reservadas, confirmadas, atendidas, canceladas).
- Agenda del día por médico, con huecos visibles.
- Pacientes en espera y minutos transcurridos desde la hora de cita — es la métrica que sostiene el
  objetivo de espera ≤ 20 minutos.
- Citas sin confirmar para mañana.
- Notificaciones fallidas con 3+ intentos, para revisión manual
  ([ADR-0018](adrs/0018-visibilidad-de-notificaciones-fallidas.md)).

Se resuelve con vistas de Postgres sobre `citas` (y, para el último punto, sobre `notificaciones`).
Sin materialización mientras el volumen lo permita.

## Notificaciones

### Flujo

**`recordatorio_24h`** (único tipo programado a futuro):

1. Al crear una cita, la Server Action inserta una fila en `notificaciones` con
   `tipo='recordatorio_24h'` y `programada_para = inicio - interval '1 day'`.
2. El Vercel Cron Job diario corre a las **08:00 America/Lima** (`0 13 * * *` UTC,
   [ADR-0025](adrs/0025-notificaciones-cron-vercel.md)) y toma las
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

**Reintentos (ambos casos):** un cron horario reintenta toda notificación en `estado='fallida'`
con menos de 3 intentos, con backoff — mismo mecanismo para las tres, sin lógica duplicada.

La unicidad `(cita_id, tipo)` es la garantía de idempotencia: si el cron se ejecuta dos veces o un
reintento se solapa, el paciente no recibe dos correos.

```json
{
  "crons": [
    { "path": "/api/cron/recordatorios", "schedule": "0 13 * * *" },
    { "path": "/api/cron/reintentos",    "schedule": "0 * * * *" }
  ]
}
```
*(`vercel.json`, plan Pro — ver [ADR-0025](adrs/0025-notificaciones-cron-vercel.md))*

### Contenido

Plantillas en español (`es-PE`), con fecha y hora renderizadas en `America/Lima`:

- **Confirmación de reserva** — al reservar, incluye la advertencia de la ventana de cancelación de
  1 hora.
- **Recordatorio 24 h** — día, hora, médico, especialidad y enlace para cancelar.
- **Cancelación / reprogramación** — al cambiar el estado.

Ningún correo incluye información clínica. Un correo puede acabar en un buzón compartido; solo lleva
datos logísticos de la cita.

### Entregabilidad

Dominio propio verificado en Resend con SPF, DKIM y DMARC. Sin esto los recordatorios caen en spam
y el objetivo de reducir tiempos de espera se degrada silenciosamente.

## Requisitos no funcionales

| Aspecto | Objetivo |
|---|---|
| Disponibilidad | 99.5% en horario de atención de la clínica |
| Latencia | p95 < 500 ms en carga de agenda y búsqueda de slots |
| Concurrencia | 50 usuarios simultáneos de personal + picos del portal |
| Backups | PITR de Neon (mínimo 7 días, [ADR-0021](adrs/0021-base-de-datos-neon.md)) + export diario cifrado a almacenamiento independiente |
| RPO / RTO | RPO ≤ 5 min; RTO ≤ 4 h |
| Retención de historias clínicas | **Pendiente de definición legal** (ver «Riesgos técnicos abiertos», P-1) |
| Accesibilidad | WCAG 2.1 AA; objetivos táctiles ≥ 44 px; contraste alto en el portal |
| Navegadores | Últimas 2 versiones de Chrome, Edge, Safari, Firefox; móvil prioritario en el portal |
| Idioma | Español (es-PE) en toda la interfaz y en los mensajes de error |

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

**pgTAP para RLS — obligatorio.** Cada política tiene una prueba negativa que verifica que el rol
equivocado *no* ve el dato:

```sql
-- tests/pgtap/rls_atenciones.test.sql
-- set_config(...) simula lo que withUserContext() hace en producción (ADR-0023).
begin;
select plan(2);

select set_config('app.current_user_id', '<uuid-medico-B>', true);
select set_config('app.current_user_role', 'medico', true);

select is_empty(
  $$ select 1 from atenciones where paciente_id = '<uuid-paciente-de-medico-A>' $$,
  'Un médico no accede a historias de pacientes que no tiene a cargo'
);

select set_config('app.current_user_id', '<uuid-administrativo>', true);
select set_config('app.current_user_role', 'administrativo', true);
select is_empty(
  $$ select 1 from atenciones $$,
  'El administrativo no accede a contenido clínico'
);

select * from finish();
rollback;
```

Otras pruebas obligatorias:

- **Concurrencia:** dos inserts simultáneos del mismo slot; exactamente uno debe fallar con
  `23P01`.
- **Ventana de cancelación:** cancelar a 59 y a 61 minutos de la cita.
- **Idempotencia de notificaciones:** dos ejecuciones del cron producen un solo envío.
- **Vigencia de asignación** ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)):
  una cita confirmada hace 7 meses sin actividad posterior ya no otorga acceso; una confirmada
  hace 3 meses sí; una asignación manual con `vigente_hasta` nulo otorga acceso indefinido;
  cancelar una cita no revoca el acceso ya otorgado.
- **E2E (Playwright):** el recorrido completo de reserva del paciente, y el de registro de historia
  clínica del médico.

## Migración desde Excel y papel

Formalizada en [ADR-0019](adrs/0019-migracion-de-datos-excel-y-papel.md), con las alternativas
descartadas y una pregunta operativa abierta para el cliente (dueño y SLA de la bandeja de
revisión manual).

| Fase | Contenido |
|---|---|
| 1. Catálogos | Especialidades, médicos, enfermeras, disponibilidades semanales |
| 2. Maestro de pacientes | Import del Excel con deduplicación por `(tipo_documento, numero_documento)`; los registros con documento inválido pasan a una bandeja de revisión manual, no se descartan |
| 3. Citas futuras | Solo citas a futuro. El histórico de citas pasadas queda en el Excel como archivo |
| 4. Historias clínicas | Digitalización progresiva hacia el objetivo de 60% |

Sobre la fase 4: [ADR-0013](adrs/0013-definicion-de-historia-clinica-digitalizada.md) define
"historia digitalizada" como híbrido — se estructuran en el sistema los antecedentes
([ADR-0015](adrs/0015-modelo-de-antecedentes-del-paciente.md)) y los diagnósticos activos del
paciente (los datos que el médico consulta en tiempo real durante una atención), y el resto del
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
      ruta que permita a un registro público obtener rol `administrativo`, `medico` o `enfermera`.

### Reserva de cita — portal del paciente

- [ ] El paciente ve, para un médico y fecha, únicamente los slots que no se solapan con citas
      vigentes (`reservada`/`confirmada`) ni con `bloqueos_agenda` de ese médico.
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
      administrativo, salvo cuando existe un `bloqueo_agenda` vigente del médico que cubre esa
      cita ([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)).
- [ ] Con un `bloqueo_agenda` vigente que cubre la cita, cancelarla a cualquier minuto de
      anticipación (incluido 0) tiene éxito — es el camino que usa `reasignarPorBaja`.
- [ ] Cancelar a 61 minutos de la cita se permite; a 59 minutos se rechaza — el límite es exacto.

### Historia clínica — registro y firma (médico)

- [ ] `registrarAtencion` falla si `motivo_consulta`, `anamnesis`, `examen_fisico` o
      `plan_tratamiento` están vacíos o son solo espacios en blanco.
- [ ] `registrarAtencion` falla si `diagnosticos` es un arreglo vacío.
- [ ] Cada código en `diagnosticos[].cie10` existe en el catálogo `cie10`
      ([ADR-0014](adrs/0014-catalogo-cie-10.md)); un código inexistente rechaza el guardado.
- [ ] Un médico solo puede registrar/consultar atenciones de pacientes que tiene a cargo, según
      `medico_tiene_paciente()`; intentarlo sobre un paciente ajeno no devuelve fila alguna (ni
      error que confirme su existencia).
- [ ] El formulario de historia clínica no expone ningún campo editable con datos que vienen del
      registro del paciente (nombre, documento, fecha de nacimiento, etc.).
- [ ] Una vez `firmarAtencion` fija `firmada_en`, ningún `UPDATE` ni `DELETE` sobre esa fila de
      `atenciones` tiene éxito; la única vía de corrección es `agregarAddenda`.
- [ ] Toda lectura de una atención por un médico queda registrada en `accesos_historia` con
      `actor_id`, `paciente_id` y marca de tiempo.

### Reasignación por baja o emergencia médica

- [ ] Crear un `bloqueo_agenda` para un médico lista automáticamente todas sus citas vigentes
      dentro del rango bloqueado.
- [ ] El sistema propone, para cada cita afectada, solo médicos de la misma especialidad con un
      slot libre equivalente.
- [ ] Confirmar una reasignación cancela la cita original y crea la nueva en una sola transacción,
      con `reprogramada_de` de la nueva apuntando a la original.
- [ ] Si ninguna especialidad equivalente tiene slot libre, la cita queda marcada para contacto
      manual — nunca pasa a `cancelada` sin una cita de reemplazo ni marca de seguimiento.
- [ ] El paciente reasignado recibe una notificación de reprogramación.

### Turnos de enfermería

- [ ] Una enfermera no puede tener dos turnos (`fecha`, `turno`) idénticos duplicados.
- [ ] Todo turno registrado tiene al menos un médico o una especialidad asociada (no ambos nulos).
- [ ] La enfermera solo puede consultar su propio turno y el médico/especialidad asociados; no
      accede a historias clínicas ni a funciones administrativas.

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
- [ ] Con RLS activo, un médico autenticado que consulta `atenciones` de un paciente que no tiene
      a cargo no recibe ninguna fila.
- [ ] Un intento de `UPDATE` sobre `perfiles.rol` ejecutado por un rol distinto de administrativo
      falla con el error de `bloquear_cambio_de_rol()`.
- [ ] Un médico cuya única cita con un paciente fue `atendida` hace más de 6 meses, sin ninguna
      cita ni asignación manual posterior, no accede a la historia de ese paciente
      ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)).
- [ ] Confirmar una cita nueva con un médico distinto extiende el acceso a ese médico; no revive
      el acceso del médico anterior cuya asignación ya venció.
- [ ] Cada tabla nueva del esquema `public` tiene RLS activada y al menos una prueba pgTAP negativa
      que confirma que el rol equivocado no ve el dato (regla de [CLAUDE.md](CLAUDE.md)).

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
  con datos reales de pacientes antes de tener respuesta.
  **Nota (2026-09-28):** el cambio a Clerk ([ADR-0022](adrs/0022-autenticacion-y-sesion-clerk.md))
  agrega una pregunta relacionada pero distinta: Clerk aloja datos de *identidad* (nombre, email,
  teléfono de pacientes peruanos) fuera de Perú por defecto — no es dato clínico, pero conviene
  incluirlo en la misma consulta legal si la norma peruana también regula datos personales de
  pacientes más allá de lo estrictamente clínico.
- **P-5 (depende de P-1, no resoluble en este documento):** si la firma lógica no es suficiente
  ante la norma peruana, puede requerirse integración con un proveedor de firma electrónica
  certificada (en Perú, un PSC acreditado por INDECOPI, o Firma Perú de RENIEC). **Cómo avanzar
  mientras tanto:** aislar `firmarAtencion` detrás de una interfaz de proveedor
  (`lib/firma/proveedor.ts`), igual que ya se hizo con notificaciones
  ([ADR-0009](adrs/0009-canal-y-programacion-de-notificaciones.md)), para que la implementación
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
- **P-6 (excluido a propósito, no acción requerida ahora):** gestión de consultorios no está en el
  PRD — no construir esto hoy (regla de [CLAUDE.md](CLAUDE.md), "Alcance — no lo amplíes"). Si en el
  futuro la clínica confirma que tiene menos consultorios que médicos, la extensión es mecánica y ya
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
  [ADR-0009](adrs/0009-canal-y-programacion-de-notificaciones.md)) para sumar WhatsApp o SMS — eso sí
  sería una decisión de alcance nueva a validar con el cliente, no algo a construir por anticipado.

## Plan de implementación sugerido

| Hito | Contenido | Depende de |
|---|---|---|
| H1 | Esqueleto: Next.js sobre Vercel, Neon, Clerk, roles, CI | — |
| H2 | Esquema completo + RLS + suite pgTAP | H1 |
| H3 | Agenda: disponibilidades, slots, reserva con anticruce (panel administrativo) | H2 |
| H4 | Portal del paciente: registro, búsqueda, reserva, cancelación | H3 |
| H5 | Notificaciones por email + cron | H3 |
| H6 | Historias clínicas: registro, firma, addendas, auditoría de accesos | H2, P-1 |
| H7 | Turnos de enfermería y dashboard operativo | H3 |
| H8 | Migración de datos, capacitación, manual de usuario | H4, H6 |

H6 depende de una decisión legal, no solo técnica. Puede construirse en paralelo, pero no debe
entrar en producción con datos reales hasta cerrar P-1.
