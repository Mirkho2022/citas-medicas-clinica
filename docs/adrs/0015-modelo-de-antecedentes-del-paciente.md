# ADR 0015: Modelo de datos de antecedentes del paciente

## Estado

Aceptado — confirmado por el cliente el 2026-09-21.

## Contexto

[ADR-0013](0013-definicion-de-historia-clinica-digitalizada.md) exige que los antecedentes del
paciente sean estructurados y consultables en tiempo real, pero son datos persistentes del
**paciente** (no de una atención puntual) y el esquema inicial no tenía dónde guardarlos:
`atenciones` solo modela campos por-consulta (`motivo_consulta`, `anamnesis`, `examen_fisico`,
`diagnosticos`, `plan_tratamiento`).

## Decisión

Tabla `antecedentes`, una fila por antecedente, sobre la taxonomía estándar de anamnesis clínica:

```sql
create type tipo_antecedente as enum (
  'personal_patologico', 'quirurgico', 'alergico', 'familiar', 'habito_nocivo'
);

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

alter table antecedentes enable row level security;

-- Misma regla de acceso que atenciones: solo el médico a cargo.
create policy "medico lee antecedentes de sus pacientes"
on antecedentes for select to authenticated
using (
  (select auth.jwt() ->> 'user_role') = 'medico'
  and public.medico_tiene_paciente(paciente_id)
);

create policy "medico registra antecedentes de sus pacientes"
on antecedentes for insert to authenticated
with check (
  (select auth.jwt() ->> 'user_role') = 'medico'
  and public.medico_tiene_paciente(paciente_id)
  and registrado_por = (select id from public.medicos where perfil_id = (select auth.uid()))
);
```

Un antecedente resuelto no se elimina ni se sobrescribe: se marca `vigente = false` y, si
corresponde, se inserta uno nuevo con el estado actualizado — mismo principio de no-destrucción
que rige `atenciones` ([ADR-0005](0005-modelo-de-datos-y-prevencion-de-doble-reserva.md)). El
administrativo y el paciente no tienen política de lectura sobre esta tabla, por la misma razón
que no la tienen sobre `atenciones`.

## Alternativas consideradas

- **Campo `jsonb` en `historias_clinicas`** — más simple de migrar (una columna, no una tabla
  nueva), pero pierde la capacidad de desactivar un antecedente individual sin reescribir el
  arreglo completo, y complica la política RLS de fila (RLS no filtra dentro de un `jsonb`, solo
  filas completas) — habría que hacer el filtrado por médico a cargo en la aplicación, exactamente
  lo que el PRD prohíbe para historias clínicas.
- **No modelar antecedentes como entidad propia** (dejarlos como texto libre dentro de
  `anamnesis` de cada atención) — es lo que ya existía implícitamente antes de esta ADR. Se
  descarta porque un antecedente contado en la atención de enero no aparece en la de junio si el
  médico no vuelve a leer notas anteriores completas: no cumple "consultable en tiempo real", que
  es el motivo por el que existe [ADR-0013](0013-definicion-de-historia-clinica-digitalizada.md).

## Consecuencias

- El médico ve los antecedentes vigentes de un paciente en una sola consulta indexada
  (`antecedentes_paciente_idx`), sin tener que leer el histórico completo de atenciones anteriores.
- El modelo es aditivo: agregar un nuevo `tipo_antecedente` en el futuro (por ejemplo,
  "antecedente_obstetrico") es una migración de un solo `ALTER TYPE`, no una reestructuración.
- **Trade-off:** las categorías de `tipo_antecedente` (patológico, quirúrgico, alérgico, familiar,
  hábito nocivo) son la taxonomía estándar de anamnesis, no una validada específicamente contra el
  formato de historia clínica que usa hoy la clínica en papel. Antes de construir el formulario de
  captura (parte de H6), conviene una revisión rápida con el personal médico para confirmar que no
  falta una categoría que ya usan (por ejemplo, antecedentes gineco-obstétricos) — es un ajuste de
  `enum`, no un rediseño, si aparece.
