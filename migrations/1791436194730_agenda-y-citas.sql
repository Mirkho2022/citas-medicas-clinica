-- Up Migration
-- H2 grupo 5, tarea 5.1 (esquema-rls-pgtap): agenda y citas. Fuente: TECH-DESIGN.md, "Agenda y citas".
-- Las tablas nacen con RLS activada y SIN política ni GRANT; los conceden las migraciones siguientes.

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

-- Ausencias: vacaciones, licencia, emergencia (caso borde «doctor de baja»). Dos bloqueos del mismo
-- médico no pueden solaparse.
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
  origen          text not null check (origen in ('portal', 'administrativo')),
  creada_por      uuid references perfiles(id),
  reprogramada_de uuid references citas(id),
  cancelada_en    timestamptz,
  cancelada_por   uuid references perfiles(id),
  creada_en       timestamptz not null default now(),
  check (fin > inicio),

  -- Doble reserva: un médico no puede tener dos citas vigentes solapadas. La viola → SQLSTATE 23P01,
  -- que la aplicación traduce al mensaje exacto «Registro de cita ya agendado». Es la defensa real
  -- bajo concurrencia; la validación previa de la aplicación solo mejora el mensaje.
  constraint citas_sin_cruce_medico
    exclude using gist (medico_id with =, rango with &&)
    where (estado in ('reservada', 'confirmada')),

  -- Un paciente tampoco puede estar en dos sitios a la vez.
  constraint citas_sin_cruce_paciente
    exclude using gist (paciente_id with =, rango with &&)
    where (estado in ('reservada', 'confirmada'))
);

create index citas_medico_inicio_idx   on citas (medico_id, inicio);
create index citas_paciente_inicio_idx on citas (paciente_id, inicio desc);
create index citas_estado_inicio_idx   on citas (estado, inicio);

alter table disponibilidades enable row level security;
alter table bloqueos_agenda  enable row level security;
alter table citas            enable row level security;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
