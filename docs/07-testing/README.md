# 07 — Testing

Las pruebas viven en el código, no en esta carpeta. Aquí se explica qué cubre cada capa, de dónde viene cada prueba y cómo correrlas.
Cada prueba verifica una regla de negocio o una invariante de seguridad del [PRD](../01-producto/PRD.md) y del
[TECH-DESIGN](../03-arquitectura/TECH-DESIGN.md), no un detalle de implementación.

## Capas de prueba

| Capa | Carpeta | Qué prueba | Comando |
|---|---|---|---|
| pgTAP (SQL) | [`tests/pgtap/`](../../tests/pgtap/) | RLS por rol, con una prueba **negativa** por tabla (el rol equivocado no ve el dato), disparadores, funciones `SECURITY DEFINER`, reglas de agenda | `npm run test:pgtap` |
| Concurrencia | [`tests/concurrencia/`](../../tests/concurrencia/) | Doble reserva simultánea, `reservar_cita`, altas simultáneas de pacientes y de registro del portal | `npm run test:concurrencia` |
| Integración | [`tests/integracion/`](../../tests/integracion/) | Las acciones de servidor contra la base real, con la RLS de cada rol | `npm run test:integracion` |
| Unitarias | [`tests/agenda/`](../../tests/agenda/), [`tests/portal/`](../../tests/portal/), [`tests/tema/`](../../tests/tema/) | Lógica pura: validación DNI/CE, errores, límites de peticiones, anti-bots, pasos de reserva, tema | `npm run test:agenda`, `test:portal`, `test:tema` |
| E2E (Playwright) | [`e2e/`](../../e2e/) | Flujos reales con sesión de Clerk: login por rol, agenda, bajas, portal del paciente, accesibilidad y diseño adaptable | `npm run test:e2e` |

Las guías detalladas están junto a este archivo: [pruebas SQL](pruebas-sql.md), [pruebas E2E](pruebas-e2e.md), [datos de demostración](datos-demo.md),
[prueba de usabilidad del portal](usabilidad-portal.md) y [verificación de H1](verificacion-h1.md).

## Qué se cubre y por qué

| Regla o invariante | Origen | Dónde se prueba |
|---|---|---|
| Aislamiento por rol en la base de datos; toda tabla de `public` con RLS | CLAUDE.md, ADR-0003, ADR-0023 | `tests/pgtap/99_rls_en_todas_las_tablas.test.sql`, `22`–`25`, `32`, `43`, `45`, `72_portal_aislamiento` |
| El médico solo ve historias de sus pacientes a cargo | ADR-0003, ADR-0016 | `tests/pgtap/42_asignaciones`, `43_historias_rls` |
| Un paciente no ve ni toca datos de otro | PRD, ADR-0037 | `tests/pgtap/72_portal_aislamiento`, `e2e/portal-aislamiento.spec.ts` |
| Doble reserva imposible, con el mensaje exacto `Registro de cita ya agendado` | PRD, ADR-0005 | `tests/concurrencia/10_doble_reserva`, `tests/integracion/reservas.test.ts`, `e2e/portal-reserva.spec.ts` |
| Cancelación solo hasta 1 hora antes, para todos los roles | PRD, ADR-0012 | `tests/pgtap/31_cancelacion`, `71_portal_cancelacion`, `e2e/portal-cancelacion.spec.ts` |
| El paciente solo cancela citas que aún no empiezan | Informe de seguridad SEC-08 | `tests/pgtap/71_portal_cancelacion` |
| Ciclo de estados de la cita y quién puede moverlo | ADR-0016, design de H3 | `tests/pgtap/61_transiciones_de_cita`, `tests/integracion/transiciones.test.ts` |
| Reasignación por baja o emergencia del médico | PRD, ADR-0011 | `tests/pgtap/38_reasignacion_baja`, `e2e/bajas.spec.ts` |
| Validación de DNI y Carné de Extranjería | PRD | `tests/agenda/pacientes.test.ts`, `tests/pgtap/23_pacientes_rls` |
| Registro y vinculación del paciente sin revelar qué dato falló | ADR-0037 | `tests/pgtap/70_portal_registro`, `tests/concurrencia/30_registro_portal`, `e2e/portal-registro.spec.ts` |
| Límite de peticiones y anti-bots | ADR-0026 | `tests/portal/limites.test.ts`, `tests/portal/antibots.test.ts` |
| Accesibilidad y diseño adaptable del portal (390 y 320 px) | Spec `usabilidad-y-accesibilidad-del-portal` | `e2e/portal-accesibilidad.spec.ts`, `e2e/portal-responsive.spec.ts` |
| La interfaz no se separa de `DESIGN.md` (colores, contraste) | ADR-0004, H2b | `tests/tema/`, `npm run tema:comprobar` |
| Fechas y horas en `America/Lima` | CLAUDE.md | `tests/agenda/lima.test.ts`, `e2e/portal-reserva.spec.ts` (zona horaria del navegador) |

## Cómo correrlas

```bash
npm run typecheck && npm run lint
npm run test:agenda && npm run test:portal && npm run test:tema && npm run tema:comprobar
npm run test:pgtap          # necesita una URL DIRECTA de un branch de Neon de desarrollo
npm run test:concurrencia
npm run test:integracion
npm run test:e2e            # Playwright; mejor contra una build de producción local
```

Las pruebas de base de datos y las E2E **escriben datos**. Por eso los runners se niegan a correr si el host coincide con `production`
(`DATABASE_URL_PRODUCCION`) y siempre apuntan a un branch de desarrollo o efímero de Neon. En CI, cada PR crea su branch efímero, aplica las
migraciones, corre las tres suites de base de datos y después lanza las E2E contra el despliegue de preview
([`neon-branch-pr.yml`](../../.github/workflows/neon-branch-pr.yml) y [`e2e.yml`](../../.github/workflows/e2e.yml)).

## Estado de la última verificación (2026-10-25)

- pgTAP completo contra `dev`: **916 pruebas, 0 fallos**.
- `npm run test:portal`: 132 pruebas, 0 fallos.
- E2E del portal contra una build local de producción: pasan; en el CI del PR #21 la suite E2E contra el preview pasó en verde tras activar la
  excepción de BotID para pruebas (ver [DEPLOY-PLAN](../09-deploy/DEPLOY-PLAN.md)).

La revisión manual con lector de pantalla (NVDA o VoiceOver) sobre el registro y la reserva sigue pendiente; está listada en
[pruebas-e2e.md](pruebas-e2e.md).
