# Proposal

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_tiene_paciente()`, `atenciones.profesional_id` y
> `app/profesional/**`; si la ADR se rechaza, léase `medico`, `medicos`, `medico_tiene_paciente()`, `atenciones.medico_id` y
> `app/medico/**`. El mecanismo de aislamiento de este change **no cambia** por el renombre, solo los identificadores.

> **Salud mental: las reglas aplicables NO están verificadas y se llevan al asesor legal.** Nada de este change declara que el
> aislamiento, la copia al paciente, la retención de las notas o el trato de una emergencia cumplan una norma. Las preguntas
> para el asesor están en `design.md` («Preguntas abiertas», bloque del asesor) y en la tarea 0.7. **La emergencia («romper el
> vidrio») es una pregunta abierta: este change no construye ninguna vía de excepción.**

## Why

El PRD del 2026-10-11 hace que todo profesional que tiene a un paciente a cargo vea su historia completa, **excepto la
información de Psicología** (resultados y notas de las sesiones), que solo ven los psicólogos que lo tienen a cargo. La
[ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (propuesta) fija la regla y la ubica en la
base de datos, pero delega el detalle a este change. Es el más delicado de las cinco especialidades porque **cambia el núcleo
de acceso a historias clínicas**, el riesgo principal declarado del proyecto: hoy `atenciones`, `addendas`, `antecedentes` (H2)
y `adjuntos_historia` (H6) dejan leer toda fila a **cualquier** profesional a cargo, de cualquier profesión. Una atención
firmada por un psicólogo (motivo, anamnesis, examen, plan y diagnósticos CIE-10) sería legible por un odontólogo o un médico:
eso es exactamente lo que el PRD prohíbe «ni abriéndolos por la dirección directa ni de ninguna otra forma».

Además de la regla de aislamiento, el PRD pide cuatro funciones propias de Psicología: **evaluación estructurada**, **tests
con puntaje automático de uso libre**, **notas de sesión reservadas** y **sesiones recurrentes**. Ninguna es útil si las puede
leer quien no debe: por eso van en el mismo change.

## What Changes

**Este change toca RLS y el acceso a historias clínicas (el riesgo principal del proyecto) y requiere revisión aparte con el
agente `code-review`** (hay una tarea de revisión al final de cada grupo que toca políticas, funciones `SECURITY DEFINER`,
disparadores o rutas que sirven contenido clínico, una revisión final sobre todo el diff y verificación por mutación de las
pruebas negativas; ver `tasks.md`). **Depende de que el usuario acepte las ADR-0030 y 0031.**

- **La reserva sigue al autor (`design.md` D1).** Toda fila clínica cuyo autor es un psicólogo es información de Psicología: la
  atención completa que escribe (motivo, anamnesis, examen, plan y **diagnósticos CIE-10**), sus addendas, los antecedentes y
  adjuntos que registra, y todo lo que crean este change y H6i. Esto responde la pregunta de la fila de `atenciones`: **se
  restringe entera**. El autor se determina por `profesionales.profesion` (H2c), nunca por el cliente.
- **Cómo se impone (`design.md` D2 y D3).** Una **política RLS restrictiva** por tabla (se combina con `AND` con las políticas
  vigentes, así ninguna política permisiva, hoy o futura, puede ampliar la lectura) y una función propia mínima
  (`fila_de_psicologia()`) más la función única de H6i (`psicologo_tiene_paciente()`, que se **reutiliza**), con falla cerrada. Se comparan ocho alternativas; se recomienda esta.
  Incluye el cambio de política exacto, su prueba negativa por rol **y por profesión** y su verificación por mutación.
- **Qué ven los demás de un diagnóstico de Psicología (D4):** nada; ven los medicamentos (vista de H6c). Se deja como pregunta
  al usuario si debe haber algo más (alternativas B a D).
- **Evaluación estructurada (D5):** plantilla de Psicología de ADR-0029 (campos propuestos, `REVISAR` con los psicólogos de la
  clínica) sobre `atenciones`, con el mismo sello, huella, inmutabilidad y addendas; solo un psicólogo puede usarla (`exige_profesion = 'psicologo'`, regla común de
  `historias-clinicas`, D15).
- **Notas de sesión reservadas (D6):** tabla nueva `notas_sesion_psicologia` (RLS + prueba negativa), firmada e inmutable, con
  rectificación por nota nueva y borradores visibles solo para su autor.
- **Tests con puntaje automático (D7):** usa `instrumentos_evaluacion` y `aplicaciones_instrumento` de H6i con `area = psicologia`;
  este change aporta el catálogo propuesto (PHQ-9, GAD-7, AUDIT, PCL-5), **marcado `REVISAR` porque las licencias no están
  verificadas**: no se carga ningún instrumento en la base hasta verificar su licencia, uno por uno (H6i no admite un instrumento
  vigente sin licencia referenciada).
- **Sesiones recurrentes (D8):** usa `planes_de_sesiones` de H6i; el plan de un psicólogo es información reservada y las citas
  de sus sesiones no llevan motivo clínico.
- **Sin canales laterales (D9):** auditoría (qué registra y qué no), conteos, errores, la copia al paciente, derivaciones, la
  vista de medicamentos, la cascada de `addendas`, las comprobaciones de unicidad, las funciones `SECURITY DEFINER` que leen
  las tablas reservadas (lista cerrada verificada por prueba de catálogo) y la clasificación obligatoria de toda tabla con
  datos de paciente. Se declara qué fugas **no** se pueden cerrar con la base (existencia de la atención psicológica, quien
  administra la base).
- **Copia al paciente (D13):** la copia incluye Psicología (decisión del usuario); este change clasifica sus tablas y escribe la
  sección «Psicología» del compilado de H6d.
- **Cambios en lo existente (no rompen a ningún usuario):** políticas restrictivas nuevas sobre `atenciones`, `addendas`,
  `antecedentes` y `adjuntos_historia` (las permisivas no se tocan); el dato `exige_profesion = 'psicologo'` en la plantilla v1
  (la columna es de `historias-clinicas`, D15); el valor `psicologia` en `accesos_historia.tipo_acceso` y una política restrictiva de inserción; una
  especialidad «Psicología» por migración de datos si falta. Los profesionales que no son psicólogos siguen viendo **exactamente
  lo mismo que hoy** (la historia compartida): lo único que desaparece de su vista es lo escrito por psicólogos.

## Capabilities

### New Capabilities

- `aislamiento-de-informacion-de-psicologia`: quién lee y quién escribe la información de Psicología (solo un psicólogo que
  tiene al paciente a cargo), qué filas lo son (la reserva sigue al autor), cómo lo impone la base (política restrictiva
  uniforme, falla cerrada), la clasificación obligatoria de tablas y la ausencia de vía de excepción.
- `canales-laterales-de-psicologia`: que la excepción no tenga fugas por pantalla, conteos, errores, auditoría, derivaciones,
  medicamentos ni funciones del servidor; qué ven los demás profesionales; y la copia al paciente como única ventana.
- `evaluacion-y-tests-de-psicologia`: evaluación estructurada con la plantilla de Psicología y tests de uso libre con puntaje
  calculado por el servidor y la base, interpretación ajustable y puntaje inalterable.
- `notas-y-sesiones-de-psicologia`: notas de sesión reservadas, firmadas e inmutables, con rectificación, y sesiones recurrentes
  mediante el plan de sesiones.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/` (solo existe `autenticacion-roles`). Las políticas restrictivas nuevas refinan requisitos de
los changes `historias-clinicas` (`acceso-a-historia-clinica`, `registro-de-atencion`, `adjuntos-de-respaldo`), de H2 y de H6i,
que aún no están archivados: no hay delta posible; se coordina en las tareas 0.3 y 0.4 y se declara en design.md, D3. -->

## Impact

- **Hito:** **H6g** de `docs/BACKLOG.md` (el orden fino lo fija el backlog). **Depende de** H2c `profesionales-de-la-salud`
  (`profesion`, `profesion_actual()`, `profesional_tiene_paciente()`, inmutabilidad de la profesión `HC010`), H6 `historias-clinicas`
  (atenciones, plantillas ADR-0029, sello y huella, `adjuntos_historia`, `accesos_historia.tipo_acceso`, guarda de modo, módulo
  único de acceso), **H6i `mecanismos-clinicos-comunes`** (`instrumentos_evaluacion`, `aplicaciones_instrumento`,
  `planes_de_sesiones`, `sesiones_del_plan`; se usan **por su interfaz**, `design.md` D7 y D8) y, para probar los canales laterales,
  de H6b (`registrar_auditoria_sin_contenido()`, regla de la derivación del psicólogo) y H6c (vista `medicamentos_vigentes_del_paciente`).
  **H6d `copia-de-historia-clinica` depende de este change** para incluir Psicología (D13). H3 aporta las citas de las sesiones.
- **Decisión legal P-1, acreditación ante el MINSA, registro ante la ANPD y reglas de salud mental: abiertas; este change no las
  resuelve ni las presupone.** La información de Psicología es la más sensible del sistema: **no puede pasar a producción con
  datos reales** (la guarda de modo de H6, D1, se aplica a toda operación) y ninguna demostración usa textos que parezcan reales.
  Preguntas propias para el asesor: reglas de salud mental, emergencia, notas de psicoterapia, menores y representantes,
  entrega completa al paciente, retención, datos sensibles ante la ANPD y licencias de los tests (`design.md`).
- **ADR relacionadas:** [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (propuesta; este change
  detalla su mecanismo y propone matices que requieren su aceptación o ajuste, D1 y D3),
  [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (propuesta),
  [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md),
  [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md) y
  [ADR-0027](../../../docs/adrs/0027-herramienta-de-migraciones.md). No reabre ninguna. La elección entre las alternativas de D2
  amerita una nota en ADR-0031 al aplicar (tarea 0.2); no se decide dentro de este proposal.
- **Código nuevo:** `migrations/*.sql`; `lib/historias/psicologia.ts` (dentro del módulo único de acceso clínico),
  `lib/schemas/psicologia.ts`, `lib/psicologia/` (errores, etiquetas, catálogo de instrumentos); `app/profesional/pacientes/[pacienteId]/psicologia/**`;
  `tests/pgtap/77_*` y `78_*`, `tests/psicologia/`, `tests/concurrencia/` (rectificación), `e2e/psicologia.spec.ts`.
- **Base de datos:** **una tabla nueva** (`notas_sesion_psicologia`, RLS y prueba negativa); una función `SECURITY DEFINER` de
  reserva (`fila_de_psicologia()`; la de acceso es la única de H6i); políticas **restrictivas** sobre `atenciones`, `addendas`, `antecedentes`, `adjuntos_historia`, `accesos_historia` (solo
  inserción), `aplicaciones_instrumento` y `planes_de_sesiones` (estos dos de H6i; `sesiones_del_plan` no tiene autor y queda aislada por el área de su plan); disparadores de
  autoría y coherencia (más el de `HC074` sobre `atenciones`); filas de datos (plantilla, especialidad; los instrumentos solo tras
  verificar su licencia); SQLSTATE `HC070` a `HC074` (`HC075` a `HC079` reservados); pruebas pgTAP **77 y 78**.
- **Dependencias nuevas:** ninguna.
- **Qué NO incluye:** acceso del paciente a su información desde el portal (el PRD lo excluye; la recibe en copia); vía de
  excepción o «romper el vidrio» (pregunta abierta para el asesor); alertas automáticas por riesgo alto o por la respuesta
  de un test (el protocolo de crisis es de la clínica); resumen compartible hacia otros profesionales; búsquedas, listados o
  estadísticas de Psicología entre pacientes (analítica de BI está fuera de alcance); gráficos de evolución de puntajes; tests
  con licencia comercial (BDI-II, BAI, STAI, MMPI y similares); escaneo de hojas de tests en papel (depende de la decisión de
  adjuntos de imagen de H6); telemedicina (sesiones en línea); recetas (Psicología no receta); alta o cierre clínico como
  proceso propio (se cierra el plan de H6i); pagos, cobros, presupuestos, cuotas, dictado por voz e IA, receta electrónica,
  WhatsApp y SMS.
- **Preguntas obligatorias que quedan abiertas (no las decide este change):** emergencia o «romper el vidrio» (asesor legal);
  reglas de salud mental (asesor legal); qué ven los demás de un diagnóstico de Psicología más allá de los medicamentos (usuario);
  si debe ocultarse el hecho mismo de que el paciente se atiende en Psicología (usuario).
