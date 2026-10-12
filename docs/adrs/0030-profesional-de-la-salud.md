# ADR 0030: Profesional de la salud: generalizar el rol «médico»

## Estado

**Propuesto** — pendiente de aceptación del usuario. Nace de la actualización del PRD del 2026-10-11. Toca el esquema ya en
producción y la regla de roles de [CLAUDE.md](../../CLAUDE.md): no se implementa sin decisión explícita y revisión con el
agente `code-review`.

## Contexto

El PRD define ahora un perfil **Profesional de la salud** que reemplaza a «Médico» y reúne a médicos, odontólogos,
fisioterapeutas, psicólogos y podólogos (2 a 3 por especialidad). Los profesionales que no son médicos son colegiados con su
propia colegiatura. El esquema de H2 asume «médico»: tabla `medicos` (con `cmp` y `especialidad_id`), `atenciones.medico_id`,
`asignaciones_paciente_medico`, la función central `medico_tiene_paciente()` y el rol `medico` en `perfiles` y en el token de
Clerk. La profesión debe definir la plantilla clínica que se usa y si el profesional puede emitir recetas.

## Decisión propuesta

- Un solo rol **`profesional`** (reemplaza a `medico`; los demás roles no cambian) y una tabla **`profesionales`** con
  `profesion` (médico, odontólogo, fisioterapeuta, psicólogo, podólogo), `colegiatura` (reemplaza a `cmp`) y
  `especialidad_id`.
- Los nombres se renombran de forma coherente (`profesionales`, `atenciones.profesional_id`,
  `asignaciones_paciente_profesional`, `profesional_tiene_paciente()`) en una migración nueva, con la suite pgTAP actualizada
  y revisada. Hoy solo hay datos de demostración, que es el momento más barato para renombrar.
- La profesión es un dato de la base, nunca del cliente: de ella dependen la plantilla clínica
  ([ADR-0029](0029-datos-clinicos-por-especialidad.md)), el permiso de recetar y el aislamiento de Psicología
  ([ADR-0031](0031-aislamiento-de-la-informacion-de-psicologia.md)).
- Qué profesiones pueden recetar **no se decide aquí**: médico sí, psicólogo no (confirmado por el usuario); odontólogo,
  fisioterapeuta y podólogo están por confirmar con el cliente y el asesor.

## Alternativas consideradas

- **Mantener `medicos` y añadir `profesion`.** Es el menor cambio, pero deja un nombre engañoso en el núcleo de seguridad y
  en cada política: un odontólogo viviría en `medicos`. Es la alternativa si el costo del renombre se juzga mayor.
- **Una tabla por profesión.** Duplica políticas RLS y pruebas por profesión; descartada.
- **Atributo en el token sin tabla.** La profesión no puede depender de un dato que controle el cliente; descartada.

## Consecuencias

- Se tocan las funciones y políticas centrales de acceso a historias clínicas: revisión explícita con `code-review` y
  verificación por mutación de las pruebas negativas.
- Los usuarios existentes y su metadato de Clerk (`rol = 'medico'`) requieren una migración de datos y la actualización del
  webhook de alta.
- El código de H3 que hoy usa `'medico'` (`exigirPersonal`) cambia si se acepta; conviene decidir esta ADR **antes** de
  mergear esa rama.
- El detalle vive en el change `profesionales-de-la-salud`.
