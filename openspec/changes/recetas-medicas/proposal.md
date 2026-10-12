# Proposal

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesional_actual()` y `profesional_tiene_paciente()`; si la ADR se rechaza, léase
> `medico`, `medicos`, `medico_actual()` y `medico_tiene_paciente()`.

## Why

Hoy las recetas se escriben a mano en papel y, según el PRD del 2026-10-11, **no se entienden por la letra**. El PRD fija tres
resultados que este change entrega: las recetas dejan de escribirse a mano (se emiten desde el sistema con una plantilla y las
imprime el profesional que receta), el profesional **ve los medicamentos del paciente antes de recetar** para evitar cruces
con reacciones adversas, y **90 % o más** de las recetas se emiten e imprimen desde el sistema.

Además, otra decisión descansa sobre este change: [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md)
(propuesta) aísla la información de Psicología pero deja que todo profesional a cargo vea los **medicamentos**, que «salen de las
recetas» porque Psicología no receta. Sin recetas estructuradas no hay medicamentos que mostrar, y el psicólogo se quedaría sin
la información que el PRD le promete. Este change es el hito **H6c** y la fuente de esos datos para H6g.

## What Changes

**Este change toca acceso a historias clínicas y RLS (el riesgo principal del proyecto): crea tablas clínicas nuevas, funciones
`SECURITY DEFINER` que escriben contenido clínico y una vista que entrega medicamentos a profesionales de todas las profesiones,
incluido el psicólogo. Requiere revisión aparte con el agente `code-review` antes de mergear (hay una tarea de revisión al final
de cada grupo que lo toca y una final sobre todo el diff: `tasks.md`, 8.5) y verificación por mutación de sus pruebas negativas
(8.2).**

- **Quién puede recetar, como dato y en la base.** Catálogo `profesiones_que_recetan` (tabla nueva, gestionada **por migración**,
  sin acceso para ningún rol de usuario) y función `profesional_puede_recetar()`. Médico sí; psicólogo no (confirmado por el
  usuario); odontólogo, fisioterapeuta y podólogo **quedan en «no» hasta que se confirmen** (pregunta abierta). Cambiar un valor es
  una migración de una línea, no un cambio de código. La profesión sale de `profesionales.profesion` (ADR-0030), nunca del cliente.
- **Emisión atómica y sin edición.** Tablas nuevas `recetas` y `receta_items`, que **ningún rol de usuario escribe directamente**:
  la receta nace en una sola llamada a `emitir_receta()` (`SECURITY DEFINER`), que valida rol, profesión, paciente a cargo y
  contenido, fija número, fecha y datos del emisor con el reloj y la base del servidor, y guarda cabecera, medicamentos y huella
  en la misma transacción. Una receta emitida es **inmutable**: se anula (`anular_receta()`) y se emite otra, en un solo paso si
  se desea, con vínculo a la anulada.
- **Numeración correlativa a prueba de concurrencia.** Un número por clínica, sin repetidos y sin huecos, tomado dentro de la
  transacción de emisión con un bloqueo consultivo (`design.md`, D4, con las alternativas descartadas).
- **Contenido estructurado.** Cada medicamento se guarda con su denominación común internacional (DCI, obligatoria), marca
  opcional, concentración, forma farmacéutica, vía, dosis por toma, frecuencia y duración, más indicaciones. El contenido mínimo
  sigue lo que la guía comercial de Saniape atribuye al DS 014-2011-SA, art. 56: **por validar con el asesor** (`REVISAR`).
  Se compara contra un catálogo oficial (PNUME/DIGEMID) y se deja como **decisión abierta** (D9).
- **Plantilla imprimible.** Hoja de impresión (HTML y CSS de impresión, sin biblioteca de PDF) con establecimiento, número,
  lugar y fecha de emisión, vigencia, paciente, profesional, medicamentos y un espacio en blanco para **firma y sello
  manuscritos**. La impresión queda registrada (`impresiones_receta`: quién y cuándo, sin copiar contenido); la primera es
  «Original» y las siguientes «Duplicado».
- **Medicamentos del paciente.** Vista `medicamentos_vigentes_del_paciente` (`security_invoker`) que entrega los medicamentos de
  las recetas **vigentes** del paciente a **todo profesional que lo tiene a cargo, psicólogo incluido, y a nadie más**, y que por
  construcción no expone nada de Psicología. Se muestra antes de recetar. **Sin alertas automáticas de interacción.**
- **Auditoría.** Toda lectura de recetas por un profesional se registra en la misma transacción que la lectura, en
  `accesos_historia` (tipos nuevos `receta` y `medicamentos`); la auditoría de escritura de las tablas nuevas **no copia
  contenido**.
- **Cambios en lo existente (no rompen a ningún usuario):** `accesos_historia` (de H6) amplía su restricción de `tipo_acceso` y
  gana la columna `receta_id`; la pantalla de revisión de accesos de H6 etiqueta los tipos nuevos; la historia (H6) monta el panel
  de medicamentos; la siembra de demostración añade recetas sintéticas.
- **Pruebas:** pgTAP 70 a 72, prueba de concurrencia de la numeración, `node:test` de esquemas, vigencia y orden de sentencias,
  E2E con Playwright (incluida la comprobación de que la hoja cabe en una página) y accesibilidad con axe.

## Capabilities

### New Capabilities

- `emision-de-recetas`: quién puede emitir (profesión autorizada, en la base), contenido mínimo, numeración correlativa,
  inmutabilidad, anulación y corrección, y el alcance de la receta común.
- `impresion-de-recetas`: plantilla imprimible con numeración visible y espacio de firma y sello manuscritos, impresión solo por
  el emisor, registro de cada impresión y distinción original/duplicado.
- `medicamentos-del-paciente`: lista de medicamentos vigentes del paciente para todo profesional a cargo, regla de «vigente» y
  garantía de que no expone información de Psicología.
- `acceso-y-auditoria-de-recetas`: quién lee las recetas, registro atómico de cada lectura, auditoría de escritura sin
  contenido, guarda de datos de demostración y punto único de acceso.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/` (solo existe `autenticacion-roles`). La ampliación de `accesos_historia` toca un requisito del
change `historias-clinicas` (`auditoria-de-accesos-clinicos`), que aún no está archivado: no hay delta posible; se coordina en
la tarea 0.8 y se declara en design.md, D7 y D12. -->

## Impact

- **Hito:** **H6c** de `docs/BACKLOG.md` (el orden fino lo fija el backlog). **Depende de** H2c `profesionales-de-la-salud`
  (tabla `profesionales`, profesión, rol `profesional`), de H6 `historias-clinicas` (atenciones, asignaciones, `accesos_historia`
  y su `tipo_acceso`, guarda de modo de datos, módulo único de acceso a datos clínicos) y, para las pantallas, de H2b
  `sistema-de-diseno-ui`. **H6g** `especialidad-psicologia` **consume** la vista de medicamentos y **H6d**
  `copia-de-historia-clinica` incluye las recetas en la copia: ninguno bloquea a este change, pero su contrato queda fijado aquí
  (D12). No depende de H6b `triaje-y-derivacion`.
- **Decisión legal P-1 (retención, firma lógica vs. certificada, alojamiento fuera de Perú) y marco de la receta, abiertos: este
  change no los resuelve ni los presupone.** La receta es contenido clínico: **no puede pasar a producción con datos reales de
  pacientes** hasta cerrar P-1; la guarda de modo de H6 (D1) se aplica a toda operación de este change. **No se declara que la
  receta impresa cumpla la normativa**: el contenido del DS 014-2011-SA, art. 56, solo se conoce por una guía comercial (nivel C
  de `docs/investigacion-marco-legal-y-saniape.md`) y debe validarse con el asesor.
- **ADR a crear antes de implementar** (skill `architecture`, revisión humana; no se decide dentro de este proposal):
  *Recetas: escritura solo por funciones acotadas, numeración correlativa y lectura de medicamentos* (D2, D4 y D6). Se apoya en
  [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md),
  [ADR-0027](../../../docs/adrs/0027-herramienta-de-migraciones.md),
  [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md),
  [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (propuesta) y
  [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (propuesta); no reabre ninguna.
- **Código nuevo:** `migrations/*.sql`; `lib/historias/recetas.ts` (dentro del módulo único de acceso clínico), `lib/recetas/`
  (vigencia, edad, formato, establecimiento), `lib/schemas/receta.ts`; `app/profesional/pacientes/[pacienteId]/recetas/**`;
  `components/clinica/` (lista en D10); `tests/pgtap/70_*`, `71_*` y `72_*`, `tests/recetas/`, `tests/concurrencia/25_recetas.test.ts`,
  `e2e/recetas*.spec.ts`.
- **Base de datos:** tablas nuevas `profesiones_que_recetan`, `recetas`, `receta_items` e `impresiones_receta` (RLS y prueba
  pgTAP negativa cada una), vista `medicamentos_vigentes_del_paciente`, funciones `SECURITY DEFINER` nuevas (reutiliza
  `profesion_actual()` de H2c y `registrar_auditoria_sin_contenido()` de H6b), SQLSTATE `HC030` a `HC036` (`HC037` a `HC039`
  reservados), y ampliación de `accesos_historia`. Cuatro tablas, no tres: la cuarta
  (`impresiones_receta`) es necesaria para registrar la impresión sin tocar una receta inmutable; se declara a H6d y al
  orquestador como adición a la lista de tablas del contrato (D3 y D8).
- **Dependencias nuevas:** ninguna (sin biblioteca de PDF; D8). Si H6d elige una para la copia, esa decisión se cruza con la de
  este change (D8, alternativa B).
- **Infraestructura/entorno:** variables `RECETA_*` con los datos del establecimiento y la vigencia de la receta (valores reales
  por pedir a la clínica, `design.md`, D3); ningún servicio externo.
- **Fuera de alcance (decisión del usuario):** receta electrónica y firma digital de recetas; receta especial de estupefacientes
  y psicotrópicos; alertas automáticas de interacción entre medicamentos; integración con farmacias y catálogo licenciado de
  interacciones; entregar la receta al paciente en formato digital (correo, portal, mensajería); dictado por voz e IA; cobros.
  Tampoco se incluyen un catálogo de medicamentos (decisión abierta, D9), la suspensión de un medicamento antes de su término ni
  el autoguardado de borradores de receta en el servidor (D2).
