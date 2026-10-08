-- Up Migration
-- H2 grupo 6, tarea 6.1 (esquema-rls-pgtap): tablas de la historia clínica. Fuente: TECH-DESIGN.md,
-- "Historias clínicas", y ADR-0015. RIESGO PRINCIPAL DEL PROYECTO: estas tablas nacen con RLS activada y SIN
-- política ni GRANT; el acceso lo concede, solo al médico a cargo, la migración de políticas.
-- Mientras la decisión legal P-1 siga abierta, no admiten datos clínicos reales (solo de demostración).

-- «No se guarda con campos vacíos»: btrim() solo recorta espacios, así que length(btrim(x)) > 0 deja pasar un
-- campo con solo tabuladores o saltos de línea (hallazgo de la prueba 40_historias_tablas). Se exige al menos
-- un carácter que no sea espacio en blanco (clase POSIX [:space:]). No cubre caracteres invisibles de ancho
-- cero; la validación Zod del servidor es la primera barrera y este CHECK la segunda.
create function public.texto_con_contenido(p_texto text)
returns boolean
language sql immutable parallel safe
as $f$ select p_texto ~ '[^[:space:]]' $f$;

-- Carpeta: una por paciente, creada al registrarlo (disparador de la tarea 6.2).
create table historias_clinicas (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete restrict,
  numero      text not null unique,              -- correlativo visible de historia
  creado_en   timestamptz not null default now(),
  -- Necesaria para la clave foránea compuesta de atenciones (ver más abajo).
  constraint historias_clinicas_id_paciente_unico unique (id, paciente_id)
);

-- Nota de atención: una por consulta. Inmutable una vez firmada (disparador de la tarea 6.5).
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

  -- paciente_id está denormalizado porque la política RLS se apoya en él. Esta clave compuesta
  -- garantiza que coincida con el paciente dueño de la historia: sin ella, una atención podría quedar
  -- en la historia de un paciente pero protegida como si fuera de otro.
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

create index addendas_atencion_idx on addendas (atencion_id);

-- Antecedentes del paciente (ADR-0015): datos persistentes del paciente, no de una atención.
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

-- Catálogo de diagnósticos (ADR-0014). La carga del catálogo completo es de H6; la validación de cada
-- entrada de atenciones.diagnosticos contra este catálogo se define con el formulario de diagnóstico.
create table cie10 (
  codigo      text primary key,
  descripcion text not null,
  capitulo    text
);

alter table historias_clinicas enable row level security;
alter table atenciones         enable row level security;
alter table addendas           enable row level security;
alter table antecedentes       enable row level security;
alter table cie10              enable row level security;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
