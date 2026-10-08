-- Up Migration
-- H2 grupo 4 (esquema-rls-pgtap): identidad y personas. Fuente: TECH-DESIGN.md, "Identidad y personas".
-- Las tablas nacen con RLS activada y SIN política ni GRANT: denegadas a todo rol de usuario hasta que
-- las migraciones siguientes concedan lo estrictamente necesario (design.md, D3 y D4).

-- Sincronizada desde Clerk vía webhook (user.created / user.updated). clerk_user_id es el id que
-- Clerk asigna (texto, no uuid). Su restricción UNIQUE ya crea el índice que usa perfil_actual().
create table perfiles (
  id             uuid primary key default gen_random_uuid(),
  clerk_user_id  text not null unique,
  rol            rol_usuario not null default 'paciente',
  nombres        text not null,
  apellidos      text not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

-- perfil_id es nulo a propósito: el administrativo puede registrar a un paciente que nunca cree
-- cuenta en el portal; al registrarse, se vincula por (tipo_documento, numero_documento).
create table pacientes (
  id               uuid primary key default gen_random_uuid(),
  perfil_id        uuid unique references perfiles(id) on delete set null,
  tipo_documento   tipo_documento not null,
  numero_documento text not null,
  nombres          text not null,
  apellidos        text not null,
  fecha_nacimiento date not null,
  sexo             text not null check (sexo in ('M', 'F', 'X')),
  telefono         text,
  email            citext not null,
  direccion        text,
  creado_en        timestamptz not null default now(),

  constraint pacientes_documento_unico unique (tipo_documento, numero_documento),
  -- DNI: 8 dígitos. Carné de Extranjería: 9 a 12 caracteres alfanuméricos.
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

alter table perfiles       enable row level security;
alter table pacientes      enable row level security;
alter table especialidades enable row level security;
alter table medicos        enable row level security;
alter table enfermeras     enable row level security;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
