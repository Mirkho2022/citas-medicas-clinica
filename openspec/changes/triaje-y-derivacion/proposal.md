# Proposal

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesional_actual()`, `profesional_tiene_paciente()` y
> `asignaciones_paciente_profesional`; si la ADR se rechaza, léase `medico`, `medicos`, `medico_actual()`,
> `medico_tiene_paciente()` y `asignaciones_paciente_medico`.

## Why

El PRD del 2026-10-11 cambia cómo pasa un paciente por la clínica: llega (con o sin cita), la enfermera le toma los signos
vitales (**triaje**), lo **deriva** a la especialidad que corresponde y un profesional de esa especialidad lo atiende con el
triaje ya a la vista. Hoy el triaje es de papel, y un paciente sin cita no tiene un profesional «a cargo», así que bajo el
modelo de acceso vigente (ADR-0016: la única fuente de acceso es la asignación paciente-profesional, que nace de una cita)
nadie podría abrir su historia. [ADR-0032](../../../docs/adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md) (propuesta)
fija el principio —derivar no da acceso, «tomar» sí, vía asignación acotada—; este change lo convierte en esquema, reglas,
pruebas y pantallas.

Hay además un hueco que H7 dejó abierto a propósito: **no existe registro de la llegada del paciente**, así que «en espera» se
mide desde la hora de la cita y el criterio de éxito de **≤ 20 minutos de espera no se puede medir**
(`turnos-y-dashboard`, D2 y pregunta Q1). Este change es el hito **H6b**: introduce la *visita* (la llegada, con sus estados y
sus marcas de tiempo) y con ello también deja medible el criterio de **90 % de atenciones con triaje antes de la consulta**.

## What Changes

**Este change toca RLS y concede acceso a historias clínicas (una derivación tomada crea una asignación): es el riesgo
principal del proyecto y exige la revisión aparte del agente `code-review` y la verificación por mutación (hay una tarea de
revisión al final de cada grupo y una revisión final sobre todo el diff).**

- **Tres tablas nuevas**, todas con RLS activada, sin privilegios de escritura para ningún rol de usuario (se escribe solo
  mediante funciones `SECURITY DEFINER` acotadas) y con su prueba pgTAP negativa por rol:
  - `visitas`: la llegada del paciente a la clínica, **con cita o sin ella**, con su máquina de estados
    (`llegada → con_triaje → derivada → en_atencion → atendida`, más `abandonada` y `anulada`), sellada por la base con
    `llegada_en`, `atencion_iniciada_en` y `finalizada_en`.
  - `triajes`: presión arterial (sistólica y diastólica), frecuencia cardíaca, frecuencia respiratoria, temperatura,
    saturación de oxígeno, peso y talla, con **IMC calculado por la base**. Varios por visita; los anteriores se conservan;
    nunca se editan. Rangos de plausibilidad como propuesta `REVISAR` (validar con el personal clínico).
  - `derivaciones`: de la enfermera o de un profesional **a una especialidad, nunca a un profesional concreto** (la tabla ni
    siquiera tiene una columna de profesional destino). Crearla no da acceso a nadie.
- **«Tomar al paciente».** Un profesional de la especialidad de destino toma la derivación; la base lo hace atómico (un solo
  ganador si dos lo intentan a la vez) y, como consecuencia estructural, inserta en la asignación paciente-profesional una
  fila **append-only** con motivo `derivacion:<id>` y **vigencia acotada**. La asignación sigue siendo la única fuente de
  acceso (ADR-0016). La vigencia exacta es la **pregunta abierta obligatoria** de este change (propuesta provisional: 7
  días; `design.md`, D8 y Preguntas abiertas).
- **Qué ve y qué no ve cada rol.** La enfermera registra triajes y deriva, pero **no lee historias ni datos clínicos**: ve
  solo el mínimo de identidad de los pacientes con visita activa **de hoy**, mediante una función con lista blanca de
  columnas (no con una política sobre `pacientes`, que expondría todas sus columnas). Recepción crea visitas pero **no lee
  triajes**. El profesional lee el triaje de los pacientes que tiene a cargo (la pantalla de la historia es de H6; aquí solo
  la política y el contrato).
- **Pacientes sin cita.** Recepción registra al paciente y abre su historia (la filiación es de `agenda-y-reserva`, ítem 5;
  se referencia, no se redefine) y registra su llegada. Un paciente sin cita **no crea ninguna fila en `citas`**, de modo que
  no entra en el denominador de la métrica del 75 %.
- **Derivación entre profesionales.** Un profesional que tiene la visita en atención puede derivar a **otra** especialidad;
  el profesional destino toma y obtiene acceso. La información de Psicología sigue aparte
  ([ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md), propuesta): este change solo la
  respeta (una derivación hecha desde Psicología no lleva texto libre).
- **Pantallas** (sobre el sistema de diseño de H2b): llegadas del día (recepción), triaje y derivación (enfermera) y bandeja
  «mis pacientes y derivados a mi especialidad» (profesional).
- **Casos borde resueltos en la base:** dos profesionales que toman a la vez, derivación a una especialidad sin profesional
  activo, visita abandonada, triaje con valores imposibles, derivación vencida y paciente derivado dos veces.
- **Contrato hacia H7** (`design.md`, D14): los estados y marcas de tiempo que H7 usará para definir «en espera» y para medir
  los 20 minutos. H7 lo adopta en su propio change; aquí no se edita.
- **Indicadores de solo conteo** (`indicadores_de_visitas`, sin pantalla): citas frente a visitas sin cita, atenciones con
  triaje previo y atenciones iniciadas dentro de 20 minutos de la llegada, para medir dos criterios de éxito del PRD.

## Capabilities

### New Capabilities

- `llegada-y-visitas`: recepción registra la llegada con o sin cita; una sola visita en curso por paciente; máquina de
  estados cerrada (solo por operaciones acotadas); visitas abandonadas y cierre automático; quién lee las visitas; marcas de
  tiempo e indicadores; los pacientes sin cita no cuentan para el 75 %.
- `triaje-por-enfermeria`: registro de las siete mediciones con IMC calculado por la base, rangos de plausibilidad, varios
  triajes inmutables por visita; la enfermera no lee datos clínicos y ve solo el mínimo de identidad de las visitas activas
  de hoy; recepción no lee triajes; el profesional los lee solo de los pacientes a su cargo.
- `derivacion-y-toma-de-pacientes`: derivación a una especialidad (nunca a un profesional), «derivar no da acceso»,
  «tomar» concede acceso por asignación append-only y vigencia acotada, concurrencia, derivación entre profesionales con
  Psicología aparte, y los casos borde.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/` (solo existe `autenticacion-roles`, que no cambia). Este change *añade* un motivo reservado
(`derivacion:`) a la política de inserción de asignaciones que define `historias-clinicas` (tarea 5.1) y no contradice los
requisitos de `asignacion-paciente-medico`; al archivar ambos hay que comprobar el solapamiento (ver design.md, Riesgos). -->

## Impact

- **Hito:** H6b del plan (el orden fino lo fija `docs/BACKLOG.md`). **Depende de H2c** (`profesionales-de-la-salud`: nombres
  `profesional`/`profesionales`, `profesional_actual()`, `profesion`, `especialidad_id`), **de H3** (`agenda-y-reserva`: citas y
  sus estados, `confirmarCita`, y el ítem 5: registro de pacientes y columnas de filiación) **y de H6** (`historias-clinicas`:
  `profesional_tiene_paciente()` con perfil activo, la política de asignaciones, la guarda de datos reales de D1 y la pantalla
  de la historia donde el profesional ve el triaje). Las pantallas dependen además de H2b (`sistema-de-diseno-ui`). Habilita
  H7 (definición de «en espera»), H6c y H6d (la copia de la historia debe incluir los triajes).
- **RLS y acceso a historias clínicas (revisión aparte):** tablas nuevas `visitas`, `triajes` y `derivaciones`; funciones
  `SECURITY DEFINER` (escritura y lecturas con lista blanca de columnas); un disparador que inserta asignaciones; un
  `alter policy` sobre la inserción de asignaciones (se reserva el motivo `derivacion:`); y el contrato de lectura del triaje
  por el profesional a cargo. Casos negativos por rol (administrativo, profesional a cargo, otro profesional, profesional de
  la especialidad destino que no tomó, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`):
  pruebas pgTAP 66 a 68 (sugeridas).
- **Decisión legal P-1:** el triaje son datos clínicos de salud: **este change no puede pasar a producción con datos reales de
  pacientes** hasta cerrar P-1 (retención, firma, alojamiento fuera de Perú) y los puntos nuevos (acreditación ante el
  MINSA, registro ante la ANPD, salud mental). Se apoya en la guarda de datos reales de H6 (`exigir_paciente_admisible()`
  sobre `triajes` y `derivaciones`); con datos sintéticos de demostración no hay bloqueo.
- **ADR:** apoya y detalla [ADR-0032](../../../docs/adrs/0032-acceso-a-la-historia-de-pacientes-sin-cita.md) (propuesta; este
  change **añade** un estado `anulada` a las derivaciones y concreta la vigencia, ambos a reflejar en la ADR) y respeta
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md),
  [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (aceptada),
  [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) y
  [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (propuestas). **Hace falta una ADR
  nueva** —*Visita del paciente: llegada, estados y quién transiciona*— porque registrar la llegada es un cambio de proceso
  en recepción y de esquema que `turnos-y-dashboard` (D14) dejó explícitamente reservado a una ADR: no se decide dentro de
  este proposal; la crea la tarea 0.2 (Propuesto) y el usuario la acepta.
- **Código nuevo:** `migrations/*.sql` (cinco archivos nuevos, `design.md` D16); `lib/triaje/` (guardia, repositorio, errores,
  rangos), `lib/schemas/triaje.ts`, `lib/ui/estados-visita.ts`; `app/administrativo/llegadas/`, `app/enfermera/triaje/`,
  `app/profesional/pacientes-en-espera/` (hoy `app/medico/**` si se rechaza ADR-0030) con sus `acciones.ts`;
  `components/clinica/` (formulario de triaje, lista de pacientes por triar, bandeja de derivados, insignia de estado de
  visita); `tests/pgtap/66`–`68`, `tests/concurrencia/20_tomar_paciente.test.ts`, `tests/triaje/`, `e2e/triaje*.spec.ts`.
- **Base de datos:** tablas `visitas`, `triajes`, `derivaciones`; tipos `estado_visita` y `estado_derivacion`; SQLSTATE
  `HC020` a `HC029`; una función de auditoría sin contenido propia (para no competir con otros changes por
  `registrar_auditoria()`); un índice único de asignaciones por derivación. No se tocan las políticas de historias clínicas.
- **Dependencias nuevas:** ninguna. **Infraestructura:** ninguna variable de entorno ni rol de Postgres nuevos (no se amplía
  `cron_notificaciones`: el cierre de visitas vencidas es perezoso, `design.md` D2).
- **Fuera de alcance (no se construye ni se sugiere):** la pantalla de la historia clínica (H6), alertas automáticas por
  valores críticos o fuera de rango, recetas (H6c), copia de la historia (H6d), el dashboard (H7: aquí solo el contrato),
  clasificación clínica del IMC o de la presión arterial, registro de signos vitales por el profesional durante la consulta,
  acceso del paciente a su triaje o a su estado de visita, quiosco o «ya llegué» desde el portal, cola de turnos con
  llamado por pantalla, y pagos, telemedicina, integraciones externas, inventario, multi-sede y analítica de BI.
