---
title: "Technical Design Document — Sistema de Gestión de Citas e Historias Clínicas Electrónicas"
documento_fuente: "PRD.md"
fecha: "2026-09-21"
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

**Stack vigente** (Vercel + Neon + Clerk) — decisiones registradas en ADR-0020 a 0028. El diseño
pasó antes por Cloudflare Workers + Supabase; ese historial vive en `git log`, no en ADRs activos,
para mantener el conjunto de ADRs alineado con lo que realmente se va a construir.

- **Proyecto Vercel** (Next.js 15 App Router, sin adaptador — Vercel es el target nativo de
  Next.js): sirve las cuatro superficies — portal de autoservicio del paciente, panel
  administrativo, panel clínico, panel de turnos — bajo un único despliegue. Entra a Postgres
  como el rol `authenticator` y cambia a `authenticated` en cada petición; RLS es la autoridad de acceso a datos
  ([ADR-0020](adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md)).
- **Vercel Cron Jobs**: un solo cron diario ejecuta el Route Handler de notificaciones
  (recordatorio 24h y reintentos), usando el rol de Postgres `cron_notificaciones` — sin
  privilegios sobre `atenciones`/`antecedentes`
  ([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)).
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
| UI | Tailwind CSS v4, shadcn/ui, `react-hook-form` | Tokens de [DESIGN.md](DESIGN.md) → `app/tema.generado.css` (`npm run tema`); componentes propios en `components/clinica/` |
| Validación | Zod | Esquemas en `lib/schemas/`, compartidos |
| Fechas | `date-fns` + `date-fns-tz` | Formateo siempre con zona `America/Lima` |
| Correo | Resend SDK | Detrás de `lib/notificaciones/proveedor.ts` |
| Cron | Vercel Cron Jobs (`vercel.json`) | Un solo cron diario, plan Hobby ([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)) |
| Migraciones | `node-pg-migrate` (`migrations/*.sql`) | Versionadas en git; nunca cambios manuales en producción ([ADR-0027](adrs/0027-herramienta-de-migraciones.md)) |
| Tests | pgTAP, `node:test`, Playwright con axe-core (Vitest para unitarias cuando haya lógica de aplicación) | pgTAP es obligatorio para políticas RLS ([pruebas-sql.md](pruebas-sql.md)) |

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

Solo se listan los ADR vigentes — los que describen lo que realmente se va a construir. El diseño
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

Las cuentas de personal (administrativo, médico, enfermera) **no se auto-registran**: las crea un administrativo por
invitación vía la API de Clerk. El registro público solo produce rol `paciente`.

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
| Mensaje `Registro de cita ya agendado` | Mapeo de `SQLSTATE 23P01` **y `40P01`** a ese texto exacto (ver «Doble reserva») | Server Action |
| Cancelación hasta 1 h antes, para todos los roles | Trigger `validar_cancelacion()` ([ADR-0012](adrs/0012-alcance-de-la-ventana-de-cancelacion.md)) | Base de datos |
| Advertencia de la restricción al reservar | Texto en el formulario de reserva | UI |
| Historia clínica sin campos vacíos | `CHECK` en columnas + esquema Zod | BD + servidor |
| Datos del paciente no editables desde HC | Las columnas no existen en `atenciones` | Estructura |
| Médico sin acceso a pacientes ajenos | Políticas RLS + `medico_tiene_paciente()` | Base de datos |
| Acceso médico expira automáticamente (6 meses desde la cita) | Trigger `extender_asignacion_por_cita()` ([ADR-0016](adrs/0016-vigencia-de-asignacion-paciente-medico.md)) | Base de datos |
| Doctor de baja o emergencia: reasignación | `bloqueos_agenda` + flujo de reasignación masiva ([ADR-0011](adrs/0011-reasignacion-de-citas-por-baja-medica.md)) | Aplicación |
| Recordatorio un día antes | Vercel Cron Job + tabla `notificaciones` ([ADR-0028](adrs/0028-notificaciones-cron-unico-plan-hobby.md)) | Route Handler |

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

### Doctor de baja o emergencia

1. El administrativo crea un `bloqueo_agenda` para el rango afectado.
2. El sistema lista las citas vigentes del médico dentro del rango.
3. Para cada una propone médicos de la misma especialidad con slot libre.
4. La reasignación se ejecuta en una transacción: cancela la cita original e inserta la
   nueva cita con `reprogramada_de` apuntando a la original (la columna vive en la cita nueva,
   igual que en el esquema y en la prueba de aceptación de más abajo).
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
    registro/                   alta de paciente (Vercel BotID, ADR-0026)
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

> **Nota (2026-10-08):** este árbol es ilustrativo. H1 fijó áreas planas por rol (`/paciente`,
> `/administrativo`, `/medico`, `/enfermera`) y los changes de H3–H7 definen las rutas reales
> dentro de ellas (p. ej. «Mis citas» en `/paciente/citas`); cada change actualiza este árbol al
> implementarse.

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
| Backups | PITR de Neon, nivel gratuito para el MVP — ventana exacta a confirmar, no asumir 7 días ([ADR-0021](adrs/0021-base-de-datos-neon.md)) + export diario cifrado a almacenamiento independiente |
| RPO / RTO | RPO ≤ 5 min; RTO ≤ 4 h |
| Retención de historias clínicas | **Pendiente de definición legal** (ver «Riesgos técnicos abiertos», P-1) |
| Accesibilidad | WCAG 2.1 AA; objetivos táctiles ≥ 44 px; contraste alto en el portal. Comprobada con axe en las E2E y con el contraste calculado de DESIGN.md (`npm run tema:comprobar`) |
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
- **E2E (Playwright):** autenticación y redirección por rol, y que Postgres reconoce al usuario por su token de Clerk
  (H1/H2), los componentes de la galería y la revisión de accesibilidad con axe (H2b); el recorrido completo de reserva del
  paciente y el de registro de historia clínica del médico llegan con H4 y H6.

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
      que confirma que el rol equivocado no ve el dato (regla de [CLAUDE.md](../CLAUDE.md)).

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
  [ADR-0017](adrs/0017-disparo-de-notificaciones-transaccionales.md)) para sumar WhatsApp o SMS — eso sí
  sería una decisión de alcance nueva a validar con el cliente, no algo a construir por anticipado.

## Plan de implementación sugerido

| Hito | Contenido | Depende de |
|---|---|---|
| H1 | Esqueleto: Next.js sobre Vercel, Neon, Clerk, roles, CI | — |
| H2 | Esquema completo + RLS + suite pgTAP | H1 |
| H2b | Sistema de diseño UI: tema desde DESIGN.md, componentes, estructuras de pantalla, Clerk en español, accesibilidad comprobada | H1 |
| H3 | Agenda: disponibilidades, slots, reserva con anticruce (panel administrativo) | H2 |
| H4 | Portal del paciente: registro, búsqueda, reserva, cancelación | H3 |
| H5 | Notificaciones por email + cron | H3 |
| H6 | Historias clínicas: registro, firma, addendas, auditoría de accesos | H2, P-1 |
| H7 | Turnos de enfermería y dashboard operativo | H3 |
| H8 | Migración de datos, capacitación, manual de usuario | H4, H6 |

H6 depende de una decisión legal, no solo técnica. Puede construirse en paralelo, pero no debe
entrar en producción con datos reales hasta cerrar P-1 (los datos sintéticos de demostración sí se permiten).
