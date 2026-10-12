# ADR 0031: Aislamiento de la información de Psicología

## Estado

**Propuesto** — pendiente de aceptación del usuario. La regla de negocio la fijó el usuario el 2026-10-11; el mecanismo es
una propuesta. Toca el acceso a historias clínicas (riesgo principal del proyecto): revisión explícita con `code-review`.

## Contexto

El PRD establece que un mismo paciente puede atenderse en varias especialidades y que todo profesional que lo tiene a cargo ve
su historia clínica completa, para evitar cruces de medicamentos. **Excepción:** la información de Psicología (resultados de
tests y notas de las sesiones) queda aparte y solo la ven los psicólogos que tienen al paciente a cargo. Los demás
profesionales no la ven, pero sí ven los medicamentos del paciente. La copia de la historia que se entrega al paciente sí
incluye Psicología. Hoy `medico_tiene_paciente()` da acceso al paciente completo a cualquier médico a cargo.

## Decisión propuesta

- La información de Psicología es una **categoría restringida**: solo la leen los profesionales de profesión psicólogo que
  tienen al paciente a cargo (y su autor). No la lee ningún otro profesional, ni el administrativo, ni la enfermera, ni el
  paciente por el portal. La restricción se impone **en la base de datos** con RLS, no en la interfaz.
- Los **medicamentos** del paciente salen de las **recetas** estructuradas ([recetas médicas](../../openspec/changes/recetas-medicas)),
  que emite quien puede recetar; Psicología no receta. Por eso la excepción no filtra medicamentos: viven en otra tabla,
  visible para todo profesional a cargo.
- La profesión del autor sale de `profesionales.profesion` ([ADR-0030](0030-profesional-de-la-salud.md)), nunca del cliente.
- Cada tabla nueva de Psicología (evaluaciones, tests, notas de sesión) nace con RLS y su prueba pgTAP negativa por rol y por
  profesión; se audita cada lectura como el resto de contenido clínico.
- La copia de la historia al paciente incluye Psicología, tras verificar la identidad del solicitante.

## Alternativas consideradas

- **Filtrar en la aplicación.** Un olvido filtra salud mental; descartada por el riesgo principal del proyecto.
- **Un esquema o una base separada para Psicología.** Aísla del todo, pero duplica auditoría, respaldo y migraciones.
- **Ocultar en la interfaz.** No protege ante una consulta directa; descartada.

## Consecuencias y cuestión abierta

- Una política RLS y una función de acceso nuevas, con `code-review` y verificación por mutación.
- Hay que confirmar con el asesor legal si los datos de salud mental tienen reglas más estrictas (no verificado) y qué ocurre
  en una emergencia.
- El detalle vive en el change `especialidad-psicologia`.
