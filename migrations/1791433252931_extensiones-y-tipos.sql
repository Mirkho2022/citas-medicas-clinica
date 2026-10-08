-- Up Migration
-- H2 (esquema-rls-pgtap): extensiones y tipos. Fuente: TECH-DESIGN.md, "Extensiones y tipos".

-- Requerida por las restricciones EXCLUDE de agenda (doble reserva).
create extension if not exists btree_gist;
-- Emails sin sensibilidad a mayúsculas.
create extension if not exists citext;
-- Contexto de usuario para RLS (ADR-0023). Neon ya la trae instalada en este proyecto; el
-- IF NOT EXISTS la deja intacta en producción y la crea en una base nueva.
create extension if not exists pg_session_jwt;
-- No se instala pgcrypto: gen_random_uuid() es nativa desde PostgreSQL 13 (el proyecto usa la 18).

create type rol_usuario         as enum ('administrativo', 'medico', 'enfermera', 'paciente');
create type tipo_documento      as enum ('DNI', 'CE');
create type estado_cita         as enum ('reservada', 'confirmada', 'atendida', 'cancelada', 'no_asistio');
create type tipo_turno          as enum ('manana', 'tarde', 'noche');
create type estado_notificacion as enum ('pendiente', 'enviada', 'fallida');
create type tipo_antecedente    as enum ('personal_patologico', 'quirurgico', 'alergico', 'familiar', 'habito_nocivo');

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
