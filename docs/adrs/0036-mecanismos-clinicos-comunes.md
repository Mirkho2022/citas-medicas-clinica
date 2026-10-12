# ADR 0036: Mecanismos clínicos comunes: planes de sesiones y puntaje de instrumentos

## Estado

**Propuesto** — pendiente de aceptación del usuario. Detalle en `openspec/changes/mecanismos-clinicos-comunes/design.md`.

## Contexto

Fisioterapia, Psicología y Podología necesitan lo mismo: un **plan de sesiones** con contador de las restantes, apoyado en las citas
de H3, y **instrumentos de evaluación** con puntaje (escalas, tests). Si cada especialidad lo resolviera por su lado habría tres
mecanismos de sesiones y tres cálculos de puntaje que revisar, y el aislamiento de Psicología
([ADR-0031](0031-aislamiento-de-la-informacion-de-psicologia.md)) tendría que repetirse en cada uno.

## Decisión propuesta

- Un change compartido (H6i) con dos mecanismos: **`planes_de_sesiones` y `sesiones_del_plan`**, y **`instrumentos_evaluacion` y
  `aplicaciones_instrumento`**. Cada especialidad los usa con su propio catálogo de protocolos o de instrumentos, cargado por
  migración; ninguna los redefine.
- **Planes sobre las citas, sin reemplazarlas:** cada sesión sigue a una cita de H3 (atendida, no asistió, cancelada, reprogramada).
  Sin cobros ni saldos. La base **propone** la serie de sesiones y recepción la confirma, una transacción por sesión, porque el
  profesional no crea citas y no hay cron nuevo ([ADR-0028](0028-notificaciones-cron-unico-plan-hobby.md)).
- **Puntaje calculado en el servidor y verificado en la base**, con aritmética entera y vectores de prueba compartidos; el
  profesional puede ajustar la interpretación, no el puntaje. **Ningún instrumento se carga sin verificar su licencia, uno por uno**,
  cada uno en su propia migración.
- **Función única de acceso a Psicología:** `psicologo_tiene_paciente(paciente)` y la genérica `acceso_clinico_por_area(area,
  paciente)` las define este change; `especialidad-psicologia` las reutiliza. Las aplicaciones y planes de área `psicologia` son
  información restringida desde su primera migración.

## Alternativas consideradas

- **Que cada especialidad tenga su propio plan y su propio puntaje:** duplica código y revisiones de seguridad.
- **Crear todas las citas de la serie al crear el plan:** exige que el profesional cree citas (hoy no puede) o un cron nuevo.
- **Calcular el puntaje solo en SQL:** más simple, pero sin el cálculo en el servidor la pantalla no puede mostrarlo mientras se
  responde; queda descrita con sus costos como alternativa.

## Consecuencias y cuestiones abiertas

- Cuatro tablas nuevas con RLS y pruebas pgTAP negativas, y dos disparadores sobre `citas` que hacen seguir a la sesión a su cita.
- **Decisión del usuario:** las citas de las sesiones agendadas por recepción cuentan en el denominador del 75 % del portal; con
  planes de unas 10 sesiones la meta se aleja. Hay que excluirlas del indicador o permitir que el paciente reserve sus sesiones en el
  portal (sería un change de H4).
- Qué profesiones pueden crear planes (propuesta: fisioterapeuta, psicólogo y podólogo), cómo se trata la inasistencia y las escalas
  con ítems de riesgo (el sistema no construye alertas) se llevan a la clínica y al asesor.
