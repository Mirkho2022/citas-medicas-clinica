# Datos de demostración

Datos **sintéticos** para probar y mostrar el sistema (H2, [design.md D10](../../openspec/changes/esquema-rls-pgtap/design.md)).
Proyecto de muestra: se permiten datos mock, **nunca datos reales de pacientes**; la decisión legal P-1
(NTS del MINSA) sigue bloqueándolos.

## Qué se siembra

| Qué | Cantidad | Notas |
|---|---|---|
| Especialidades | 4 | Medicina general, Pediatría, Cardiología, Ginecología |
| Médicos | 5 | `CMP-DEMO-001..005`; el 1 usa la cuenta real de médico. El 5 es un segundo médico de Medicina general (perfil `mock_medico_5`): sirve de sustituto en la reasignación por baja (H3) |
| Enfermeras | 2 | La 1 usa la cuenta real de enfermera |
| Administrativo | 1 | Usa la cuenta real de administrativo |
| Pacientes | 12 | 11 con DNI `99000001..11` y 1 con Carné de Extranjería `CEDEMO000001`; el 1 usa la cuenta real de paciente |
| Historias clínicas | 12 | Las crea el disparador al registrar a cada paciente |
| Disponibilidad | 5 × lunes a viernes | 4 horas, mañana o tarde (el médico 5, como el 1, de 08:00 a 12:00); un bloqueo de agenda (vacaciones del médico 4) |
| Citas | 14 | 6 `atendida` pasadas, 3 `confirmada`, 4 `reservada` y 1 `cancelada`; sin solapes |
| Asignaciones | 9 | Las genera el disparador de citas (3 confirmadas + 6 atendidas) |
| Atenciones | 6 | Firmadas, una por cita atendida; más una addenda |
| Antecedentes | 5 | Variados |
| Turnos de enfermería | 14 | Próximos 7 días, mañana y tarde |
| CIE-10 | 12 | Subconjunto con capítulo `DEMO`; el catálogo completo es de H6 ([ADR-0014](../03-arquitectura/adrs/0014-catalogo-cie-10.md)) |

**Marcadores:** personas sin cuenta con `clerk_user_id` de prefijo `mock_`, correos `@demo.invalid`, nombres
ficticios y documentos `99…` / `CEDEMO…`. Las cuatro cuentas reales de prueba de la instancia de desarrollo de
Clerk (`E2E_*_EMAIL`, ver [pruebas-e2e.md](pruebas-e2e.md)) se asocian a las personas marcadas «cuenta real»
para poder entrar con cada rol y ver datos; el script las busca en Clerk con `CLERK_SECRET_KEY`.

## Cómo ejecutarlo

```bash
node scripts/sembrar-datos-demo.ts --confirmar     # siembra (idempotente)
node scripts/comprobar-datos-demo.ts               # comprueba el aislamiento RLS con esos datos
```

- Destino: `DATABASE_URL_DEMO` (o `DATABASE_URL_PRUEBAS` / `DATABASE_URL`), **URL directa** del rol dueño. El script
  imprime el host antes de escribir y se niega si falta `--confirmar`.
- Si el destino es el de `DATABASE_URL_PRODUCCION`, además exige `--incluir-produccion`: sembrar producción es una
  acción explícita, nunca un efecto lateral de un despliegue ni de una migración.
- Es **idempotente** (ejecutarlo dos veces deja los mismos conteos) y corre en una transacción.
- **No desactiva triggers**: las asignaciones nacen del disparador de citas y las atenciones pasan por sus
  restricciones, así que sembrar es también una prueba de integración.

## Cómo reiniciar

No hay un comando de borrado: las atenciones firmadas, las addendas, los antecedentes y la auditoría **no se
pueden eliminar por diseño**, ni siquiera el dueño de la base. Para empezar de cero se recrea un branch de
desarrollo en Neon desde su padre. En el branch principal de producción está prohibido restaurarlo.

## Qué ve cada persona (comprobación 9.5)

`scripts/comprobar-datos-demo.ts` abre una sesión por persona con un token firmado cuyo `sub` es su `clerk_user_id`
real y consulta como `authenticated`, igual que la aplicación. Resultado sobre los datos sembrados:

| Persona | Ve | No ve (negativos) |
|---|---|---|
| Médico 1 (`CMP-DEMO-001`) | 3 pacientes (con cita o asignación vigente), 2 atenciones, 2 historias, 2 antecedentes, 4 citas | atenciones de pacientes del otro médico; citas de otros médicos |
| Médico 2 (`CMP-DEMO-002`) | 3 pacientes, 2 atenciones | atenciones del paciente 99000001 |
| Paciente (`99000001`) | su registro y sus 2 citas | atenciones, historias y antecedentes, **ni siquiera los suyos** |
| Administrativo | 12 pacientes y 14 citas | atenciones, addendas, historias y antecedentes; la auditoría no contiene contenido clínico |
| Enfermera | sus 7 turnos | pacientes, citas y atenciones |

La suite pgTAP completa (477 pruebas) también pasa sobre una base que ya contiene estos datos: las pruebas no
asumen tablas vacías.

## Advertencias

- Estos datos viven en la base donde se siembren: los branches efímeros de CI copian `production`, así que
  sembrar producción hace que cada PR herede los datos de demostración.
- Las atenciones sembradas están firmadas y son inmutables: sirven para demostrar la regla, no se editan.
- Antes de cargar **datos reales** hay que cerrar P-1 y limpiar o recrear el entorno: estos datos nunca se
  mezclan con datos de pacientes reales.
