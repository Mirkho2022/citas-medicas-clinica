# 05 — Spec + Tasks (Spec-Driven Development con OpenSpec)

Las specs **no viven en esta carpeta**: el CLI de OpenSpec exige que estén en [`openspec/`](../../openspec/), en la raíz del repositorio. Esta
página es el puente entre el [backlog](../04-backlog/BACKLOG.md) y esas specs.

## Cómo se trabaja

Cada hito del backlog se convierte en **un** change de OpenSpec:

1. `/opsx:propose` → `proposal.md`, `design.md`, `specs/` (delta) y `tasks.md`.
2. `/opsx:apply` → implementa las tareas y las marca en `tasks.md`.
3. Verificación (build, pruebas) y revisión de código (agente `code-review`, skill `security-review`).
4. `/opsx:archive` → mueve el change a `openspec/changes/archive/` y sincroniza la spec vigente en `openspec/specs/`.

## Backlog → change → spec vigente

| Hito | Ítems | Change | Estado | Specs |
|---|---|---|---|---|
| H1 | 1 | [`2026-10-07-esqueleto-app-vercel-neon-clerk`](../../openspec/changes/archive/2026-10-07-esqueleto-app-vercel-neon-clerk/) | Archivado | [`autenticacion-roles`](../../openspec/specs/autenticacion-roles/spec.md) |
| H2 | 2 | [`esquema-rls-pgtap`](../../openspec/changes/esquema-rls-pgtap/) | Hecho; pendiente de archivar (quedan pasos manuales) | `aislamiento-por-rol-rls`, `identidad-de-personas`, `integridad-de-agenda`, `integridad-historia-clinica` |
| H2b | 3 | [`2026-10-19-sistema-de-diseno-ui`](../../openspec/changes/archive/2026-10-19-sistema-de-diseno-ui/) | Archivado | [`sistema-de-diseno-ui`](../../openspec/specs/sistema-de-diseno-ui/spec.md) |
| H3 | 4–13 | [`2026-10-20-agenda-y-reserva`](../../openspec/changes/archive/2026-10-20-agenda-y-reserva/) | Archivado, verificado en producción | [`disponibilidad-y-slots`](../../openspec/specs/disponibilidad-y-slots/spec.md), [`gestion-de-citas`](../../openspec/specs/gestion-de-citas/spec.md), [`identificacion-de-pacientes`](../../openspec/specs/identificacion-de-pacientes/spec.md), [`reasignacion-por-baja-medica`](../../openspec/specs/reasignacion-por-baja-medica/spec.md) |
| H4 | 14–17 | [`portal-del-paciente`](../../openspec/changes/portal-del-paciente/) | Implementado y verificado; en revisión en el PR #21 | `registro-del-paciente`, `busqueda-y-reserva-de-cita`, `mis-citas-y-cancelacion`, `aislamiento-del-paciente`, `proteccion-del-portal-publico`, `usabilidad-y-accesibilidad-del-portal` |
| H5 | 18–21 | [`notificaciones-email`](../../openspec/changes/notificaciones-email/) | Propuesto, sin implementar | 5 specs de avisos, recordatorio y cron |
| H6 | 22–28 | [`historias-clinicas`](../../openspec/changes/historias-clinicas/) | Propuesto, sin implementar | 10 specs (acceso, atención, firma, adjuntos, auditoría, CIE-10…) |
| H7 | 29–30 | [`turnos-y-dashboard`](../../openspec/changes/turnos-y-dashboard/) | Propuesto, sin implementar | `turnos-de-enfermeria`, `jornada-del-medico`, `dashboard-operativo` |
| H8 | 31–35 | Sin change todavía | Pendiente | — |

## Dónde mirar para un hito

- La intención y el alcance: `proposal.md`.
- Las decisiones técnicas del hito y sus alternativas: `design.md`.
- Los requisitos verificables, cada uno con escenarios: `specs/<capacidad>/spec.md`.
- Lo que se hizo y cómo se comprobó: `tasks.md` (cada tarea cerrada lleva su resultado).
