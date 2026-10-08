-- Up Migration
-- H2 grupo 7, tarea 7.2 (esquema-rls-pgtap): notificaciones y privilegios del cron. Fuente: TECH-DESIGN.md,
-- "Notificaciones y auditoría", ADR-0017, ADR-0018 y ADR-0020.

create table notificaciones (
  id              uuid primary key default gen_random_uuid(),
  cita_id         uuid not null references citas(id) on delete cascade,
  tipo            text not null check (tipo in ('recordatorio_24h', 'confirmacion_reserva', 'cancelacion')),
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
  on notificaciones (programada_para) where estado in ('pendiente', 'fallida');

alter table notificaciones enable row level security;

-- El administrativo revisa las notificaciones fallidas (ADR-0018). Nadie más tiene política de lectura, ni
-- escritura: las notificaciones las crea y actualiza el proceso programado.
grant select on public.notificaciones to authenticated;

create policy notificaciones_lee_el_administrativo on public.notificaciones
  for select to authenticated
  using ((select public.rol_actual()) = 'administrativo');

-- Rol del cron (ADR-0020, ADR-0028): GRANT mínimo y explícito. Lee y escribe notificaciones; solo LEE citas
-- (para verificar si la cita ya ocurrió). No tiene NINGÚN privilegio sobre atenciones, antecedentes, historias,
-- accesos_historia, pacientes ni perfiles. TECH-DESIGN decía que este rol «no pasa por RLS»; no es cierto: RLS
-- se aplica a todo rol que no sea el dueño ni tenga BYPASSRLS, y darle BYPASSRLS ampliaría su alcance. Por eso
-- tiene políticas propias, igual de acotadas que sus GRANT.
grant select, insert, update on public.notificaciones to cron_notificaciones;
grant select on public.citas to cron_notificaciones;

create policy notificaciones_gestiona_el_cron on public.notificaciones
  for all to cron_notificaciones
  using (true)
  with check (true);

create policy citas_lee_el_cron on public.citas
  for select to cron_notificaciones
  using (true);

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
