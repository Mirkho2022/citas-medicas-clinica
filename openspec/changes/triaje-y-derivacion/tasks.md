# Tasks

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md); si se rechaza, léase `medico`/`medicos`,
> `medico_actual()`, `medico_tiene_paciente()`, `asignaciones_paciente_medico` y `app/medico/**`.

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y concede acceso a historias clínicas (una derivación tomada crea una asignación), el riesgo principal
  del proyecto.** Cada grupo que cambia políticas, funciones `SECURITY DEFINER`, disparadores o asignaciones termina con una
  tarea de **revisión con el agente `code-review`** y no se da por cerrado hasta corregir o justificar por escrito sus hallazgos.
- **Datos reales: prohibidos.** El triaje son datos de salud: mientras la decisión legal P-1 siga abierta no se carga ningún
  dato clínico real. Los datos sintéticos de demostración (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo `real`.
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa (administrativo, profesional
  a cargo, otro profesional, profesional de la especialidad destino que no tomó, enfermera, paciente, sin rol, `anonymous`,
  `cron_notificaciones`, `sync_identidad`); antes de cerrarla se confirma que RLS quedó activada (`relrowsecurity`) y que
  `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos nuevos en `migrations/*.sql` (`npm run migrate -- create`);
  **nunca se edita una ya aplicada**, las secciones `down` quedan vacías (ADR-0027). Los números de prueba pgTAP (66–68) y los
  SQLSTATE (`HC020`–`HC029`) son sugeridos.
- Toda función `SECURITY DEFINER` de este change lleva `search_path` vacío, `REVOKE ... FROM PUBLIC`, `EXECUTE` solo a
  `authenticated`, el guarda de rol y de actividad como primera sentencia y **ningún parámetro que identifique al actor**.
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en
  `production`**. Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Textos de interfaz y mensajes
  de error en español (usted); fechas en `America/Lima`, `timestamptz` en la base.
- Las tareas de pantalla (grupo 5) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si no está aplicado, se
  avanza con los grupos 0 a 4 y 6. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de aplicar
  el change; este change no los modifica al proponerse.
- Orden de aplicación: **H2c, H3 y H6 deben estar migrados antes del grupo 1** (tarea 0.1). Los grupos 3 en adelante esperan
  además la aceptación de ADR-0032 (tarea 0.4); los grupos 1 y 2 no dependen de ella.

## 0. Decisiones previas y coordinación

- [ ] 0.1 Confirmar que H2c (`profesionales-de-la-salud`), H3 (`agenda-y-reserva`) y H6 (`historias-clinicas`) están migrados o
      archivados y que la rama parte de ellos; aplicar las migraciones en un branch de desarrollo de Neon y correr
      `npm run test:pgtap`. Anotar el número de pruebas en el PR y los **nombres reales** (`profesional_actual()`,
      `profesional_tiene_paciente()`, `citas.profesional_id`, `asignaciones_paciente_profesional`, nombre de la política de
      inserción de asignaciones). Verificar que la línea base está en verde y que `design.md` usa los nombres reales (si no, ajustarlo).
- [ ] 0.2 Con la skill `architecture`, crear la ADR «Visita del paciente: llegada, estados y quién transiciona» (siguiente
      número libre en `docs/adrs/`; la 0033 salvo que otro change la ocupe) que recoja `design.md` D1, D2 y D3 sin decidir P-1,
      enlazarla en la tabla de ADR de TECH-DESIGN y dejarla «Propuesto» hasta que el usuario la acepte. Es la ADR que
      `turnos-y-dashboard` (D14) reservó para registrar la llegada. Verificar que el archivo existe, que los enlaces relativos
      resuelven y que el estado no es «Aceptado».
- [ ] 0.3 Validar con el personal clínico (o, si no hay acceso, dejarlo escrito como supuesto sin validar y avisar al usuario) los
      rangos de plausibilidad de `design.md` D5, si peso y talla son opcionales como par, el mínimo de identidad que ve la
      enfermera (D4) y si la enfermera puede derivar sin triaje en una urgencia. Verificar que las respuestas o el supuesto
      constan en `design.md` (Preguntas abiertas) y que `lib/triaje/rangos.ts` y los `CHECK` de 2.1 se escribirán con los valores
      resultantes.
- [ ] 0.4 Pedir al usuario la **decisión sobre la vigencia de la asignación por derivación** (propuesta 7 días, `design.md` D8) y
      la **aceptación de ADR-0032** (que debe reflejar el estado `anulada` de las derivaciones y la vigencia elegida). Verificar
      que la vigencia elegida consta en `design.md` D8 y en ADR-0032 y que la ADR dice «Aceptado» antes de empezar el grupo 3.
- [ ] 0.5 Coordinar con **H3**: (a) el contrato de `confirmarCita` y de la agenda de hoy que usa la pantalla de llegadas; (b) que
      las columnas de filiación y `registrarPaciente`/`buscarPacientes` del ítem 5 existen y que este change solo los invoca;
      (c) que «no asistió» no se ofrezca ni se admita para una cita con visita no anulada, y qué hace la cancelación o
      reprogramación de una cita con visita abierta (`design.md` D9); (d) la pregunta 1 de H3 (cita reservada vencida). Verificar
      que las respuestas constan en `design.md` D2 y D9 y que este change no añade políticas ni funciones sobre `citas`.
- [ ] 0.6 Coordinar con **H6**: (a) el orden de migraciones respecto de la tarea 5.1 de H6 (política de inserción de asignaciones)
      y de `exigir_paciente_admisible()`/`exigir_modo_clinico()`; (b) cómo `abrirHistoria` incluirá la lectura de los triajes y de
      la derivación tomada (`design.md` D11) dentro de su transacción auditada; (c) que `registrar_auditoria_sin_contenido()`
      (D13) queda disponible para H6c y otros. Verificar que el contrato consta en `design.md` D11 y D13.
- [ ] 0.7 Coordinar con **H7** (que `turnos-y-dashboard` adopte la definición de «en espera» de `design.md` D14 y la lea de
      `visitas` con una vista `security_invoker` propia), con **H6d** (la copia de la historia debe incluir los triajes y no el
      motivo de las derivaciones) y con **H2c** (nombres). Verificar que cada punto consta en el informe de choques del change y
      en los `design.md` afectados cuando esos changes se actualicen.

## 1. Visitas y llegada

- [ ] 1.1 Migración `visitas`: tipo `estado_visita`, tabla (columnas, `unique (id, paciente_id)`, `CHECK
      visitas_estado_coherente`, índices únicos parciales de visita en curso por paciente y de una visita no anulada por cita,
      índices de consulta), RLS activada, `GRANT select` y las dos políticas de lectura (administrativo: todas; profesional: las
      suyas por `profesional_id` o por cita propia), **sin** `GRANT` de escritura para ningún rol, disparadores
      `visitas_validar_transicion` (tabla de `design.md` D2, para todo rol incluido el dueño), sin borrado y de auditoría
      (`registrar_auditoria()`). Verificar con `npm run migrate -- up` en un branch de desarrollo y con `relrowsecurity` de la
      tabla nueva.
- [ ] 1.2 En la misma migración o la siguiente, las funciones `registrar_llegada(paciente, cita?)` (cierre perezoso de visitas de
      días anteriores del mismo paciente; `HC020` por `unique_violation`; `HC021` por cita inválida) y `cerrar_visita(visita,
      resultado, motivo)` (administrativo; enfermera solo `abandonada`; motivo de un conjunto cerrado; `anulada` solo sin triaje
      ni derivación, `HC022`), ambas `SECURITY DEFINER` con el guarda de rol, `select … for update` de la visita y el actor
      tomado de `perfil_actual()`. Verificar con las pruebas de 1.4.
- [ ] 1.3 Prueba pgTAP **negativa** de la tabla en `tests/pgtap/66_visitas.test.sql`: RLS activada; el administrativo lee todas;
      el profesional lee solo las suyas (por `profesional_id` y por cita); otro profesional, enfermera, paciente, sin rol,
      `anonymous`, `cron_notificaciones` y `sync_identidad` cero filas o sin privilegio; `has_table_privilege` falso de `insert`,
      `update` y `delete` para `authenticated`, `anonymous`, `cron_notificaciones` y `sync_identidad`; el dueño no puede borrar ni
      saltarse una transición (disparadores). Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 1.4 En el mismo archivo, pruebas de las funciones: llegada sin cita y con cita confirmada de hoy (la cita no cambia);
      cita de otro paciente, reservada, cancelada, de otro día o con visita (`HC021`); segunda llegada del mismo paciente
      (`HC020`); cierre perezoso de la visita de ayer (`abandonada` si no fue tomada, `atendida` si estaba en atención, marcada
      automática); cierres válidos e inválidos (`HC022`); cada rol distinto del permitido recibe `42501` (administrativo en las
      de enfermera y viceversa, profesional, paciente, sin rol, `anonymous` sin `EXECUTE`); transiciones ilegales y estados
      finales; hora y actor sellados por el servidor. Verificar que pasa.
- [ ] 1.5 Prueba de concurrencia `tests/concurrencia/20_llegada.test.ts` (sesiones `pg` reales como `authenticated`, ayudante
      `_sesion.ts` de H3): 5 recepciones registran la misma llegada a la vez; exactamente una visita, las demás con `HC020`;
      20 rondas. Verificar que pasa y actualizar `docs/pruebas-sql.md`.
- [ ] 1.6 Documentar: TECH-DESIGN («Modelo de datos»: `visitas`, estados y transiciones, y la matriz de acceso), `docs/pruebas-sql.md`
      (prueba 66) y la nota en ADR-0032 sobre la entidad visita. Verificar que los enlaces relativos resuelven y que los textos no
      contradicen a `CLAUDE.md`.
- [ ] 1.7 Revisión con el agente `code-review` de la migración (funciones `SECURITY DEFINER`, `search_path` vacío, ausencia de
      `GRANT` de escritura, cierre perezoso, tabla de transiciones). Verificar que cada hallazgo se corrige o se justifica por
      escrito en el PR.

## 2. Triaje

- [ ] 2.1 Migración `triajes`: tabla (clave foránea compuesta `(visita_id, paciente_id) → visitas`, siete mediciones con los
      `CHECK` de rango de `design.md` D5 con los valores de 0.3, sistólica mayor que diastólica, peso y talla como par, `imc`
      columna generada con su `CHECK`, `registrado_por`, `registrado_en`), RLS activada, `GRANT select` y política
      `profesional_tiene_paciente(paciente_id)` **sin** `GRANT` de escritura, disparadores `triajes_proteger` (rechaza `UPDATE` y
      `DELETE` incluso al dueño), `triajes_validar_visita` (solo en llegada, con triaje o derivada) y la guarda de datos reales
      de H6 (`exigir_paciente_admisible()`), y `registrar_auditoria_sin_contenido()` con su disparador. Verificar con
      `npm run migrate -- up` y `relrowsecurity` de la tabla.
- [ ] 2.2 Funciones `registrar_triaje(visita, mediciones…)` (enfermera activa, visita de hoy, `for update`, primera vez
      `llegada → con_triaje`, `exigir_modo_clinico()` desde la capa de aplicación), `visitas_para_triaje()` y
      `triajes_de_la_visita(visita)` (enfermera; **lista blanca exacta** de `design.md` D4; `42501` a los demás). Verificar con
      las pruebas de 2.4.
- [ ] 2.3 Prueba pgTAP **negativa** de la tabla en `tests/pgtap/67_triajes.test.sql`: RLS activada; el profesional con asignación
      vigente lee los triajes de su paciente (más reciente primero); otro profesional, profesional de la especialidad destino que
      aún no tomó, asignación vencida y perfil desactivado cero filas; **administrativo cero filas** aunque creó la visita;
      enfermera cero filas por consulta directa; paciente (incluso el suyo), sin rol, `anonymous`, `cron_notificaciones` y
      `sync_identidad` sin lectura; `has_table_privilege` falso de `insert`, `update` y `delete`. Verificar que pasa y que
      `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 2.4 En el mismo archivo, pruebas de las funciones y reglas: cada medición en su límite (acepta) y fuera (rechaza `23514`),
      diastólica mayor que sistólica, IMC calculado (70 kg y 170 cm dan 24,2) y nulo sin peso y talla, peso sin talla, IMC
      imposible, un IMC enviado por el cliente no existe como parámetro, varios triajes conservados, `UPDATE`/`DELETE`
      rechazados incluso como dueño, triaje de una visita tomada o cerrada, de otro día o de otro paciente, enfermera inactiva;
      **la lista exacta de columnas de `visitas_para_triaje()`** (`pg_get_function_result`) y que no incluye sexo, correo,
      teléfono ni dirección; la enfermera con cero filas en `pacientes`, `citas`, `historias_clinicas`, `atenciones`,
      `addendas`, `antecedentes`, asignaciones, `visitas`, `triajes` y `derivaciones`; solo ve visitas de hoy sin tomar; cada rol
      distinto de enfermera recibe `42501` en las tres funciones; paciente real en modo demostración (`HC002`); la auditoría que
      lee el administrativo no contiene mediciones. No asume tablas vacías. Verificar que pasa.
- [ ] 2.5 Documentar: TECH-DESIGN (tabla `triajes`, rangos propuestos, matriz de acceso de la enfermera), `docs/pruebas-sql.md`
      (prueba 67) y la regla para H6d (la copia incluye triajes). Verificar los enlaces y que `CLAUDE.md` («Triaje») no se contradice.
- [ ] 2.6 Revisión con el agente `code-review` de la migración, de la política, de la lista blanca de lectura y del disparador de
      inmutabilidad (qué ve la enfermera, fugas de columnas, `SECURITY DEFINER`). Verificar que los hallazgos quedan resueltos o
      justificados.

## 3. Derivación y toma de pacientes

- [ ] 3.1 Migración `derivaciones` (parte 1): tipo `estado_derivacion`, tabla (**sin** columna de profesional destino; clave
      compuesta `(visita_id, paciente_id)`, `especialidad_destino_id`, `origen`, `creada_por`, `vence_en`, `motivo`, `estado`,
      `tomada_por`, `tomada_en`, `cerrada_en`, `derivacion_previa_id`), `CHECK` de coherencia, índices únicos parciales (una
      pendiente y una tomada por visita), RLS activada, `GRANT select` y política «las que creó o tomó» **sin** `GRANT` de
      escritura, disparadores de no borrar, auditoría sin contenido y guarda de datos reales de H6. Verificar con
      `npm run migrate -- up` y `relrowsecurity`.
- [ ] 3.2 Misma migración (parte 2): disparador `derivaciones_validar` (transiciones legales, `tomada_por` debe ser profesional
      activo de la especialidad destino, coherencia con `visitas.especialidad_destino_id`, motivo obligatorio salvo emisor
      psicólogo y **nulo** si lo es) y el disparador de ciclo de vida sobre `visitas` (abandonada/anulada vence las pendientes;
      atendida cierra la tomada). Verificar con las pruebas de 3.6.
- [ ] 3.3 Misma migración (parte 3): `vigencia_asignacion_derivacion()` (constante de 0.4), el disparador
      `derivaciones_conceder_asignacion` (única fila `derivacion:<id>` en `asignaciones_paciente_profesional`, `SECURITY
      DEFINER`), el índice único parcial del motivo `derivacion:%` y el `alter policy` de la inserción de asignaciones que
      rechaza también el prefijo `derivacion:` (**leer antes la política vigente tras H6 y H2c** y conservar sus condiciones
      previas: motivo con contenido y sin `cita:`). Verificar que la política resultante rechaza ambos prefijos y que las pruebas
      de asignaciones de H6 siguen en verde sin editarse.
- [ ] 3.4 Migración `flujo-de-derivacion`: `derivar_paciente(visita, especialidad, motivo?)` (enfermera: visita sin cita, ≥ 1
      triaje, sin pendiente, especialidad con profesional activo; profesional: visita en atención suya, otra especialidad,
      cierra su derivación tomada y encadena `derivacion_previa_id`), `anular_derivacion(visita)`, `tomar_paciente(visita)`
      (bloqueo de fila, derivación vigente de su especialidad o cita propia, sin asignación nueva en el caso de la cita),
      `terminar_atencion(visita)` y `derivaciones_pendientes()` (lista blanca exacta de D7), todas con los códigos
      `HC022`–`HC029` de D12. Verificar con las pruebas de 3.5 y 3.6.
- [ ] 3.5 Prueba pgTAP **negativa** `tests/pgtap/68_derivaciones.test.sql` (tabla y política): RLS activada; el creador y quien
      tomó leen la derivación; **administrativo, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y
      `sync_identidad` cero filas o sin privilegio**; profesional de la misma especialidad que no tomó y de otra especialidad
      cero filas; `has_table_privilege` falso de `insert`, `update` y `delete`; el administrativo, un profesional y la enfermera
      no pueden insertar una asignación `derivacion:`; el dueño no puede borrar. Verificar que pasa y que
      `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 3.6 En el mismo archivo, pruebas del flujo: **derivar no da acceso** (tras derivar, ningún profesional de la especialidad
      destino tiene `profesional_tiene_paciente()` verdadero ni lee historias, atenciones, antecedentes ni triajes; la enfermera
      tampoco); tomar crea **exactamente una** asignación `derivacion:<id>` con `vigente_hasta = hoy + vigencia` y el profesional
      pasa a tener al paciente a cargo (y solo él); toma por especialidad distinta, enfermera, administrativo, paciente, sin rol,
      `anonymous`, inactivo o con perfil desactivado (`HC027` o `42501`); doble toma (`HC026`); derivación vencida (`HC028`);
      derivar sin triaje (`HC023`), con cita (`HC024`), a la propia especialidad (`HC024`), a una especialidad sin profesional
      activo (`HC025`), dos veces (`HC029`) y anular y derivar de nuevo; derivar a un paciente que no se tiene en atención;
      emisor psicólogo con y sin motivo; cadena de derivaciones entre profesionales; toma de una visita con cita (sin
      asignación nueva y sin triaje requerido); visita abandonada vence la pendiente; asignación vencida; la lista exacta de
      columnas de `derivaciones_pendientes()` (sin documento, fecha de nacimiento ni motivo) y que un profesional de otra
      especialidad no ve la derivación; no existe ninguna función de este change con un parámetro de profesional destino
      (consulta a `pg_proc`). Verificar que pasa.
- [ ] 3.7 Prueba de concurrencia `tests/concurrencia/20_tomar_paciente.test.ts` (sesiones `pg` reales como `authenticated`): 5
      profesionales de la especialidad toman a la vez; exactamente uno gana, los demás reciben `HC026` y queda **una** asignación;
      derivar contra tomar y anular contra tomar dejan un estado coherente; 20 rondas. Verificar que pasa y actualizar
      `docs/pruebas-sql.md`.
- [ ] 3.8 Documentar: TECH-DESIGN (tablas `derivaciones`, asignaciones con motivo `derivacion:`, la función «tomar», la matriz de
      acceso y la vigencia elegida), `docs/pruebas-sql.md` (prueba 68), nota en ADR-0016 (motivo `derivacion:` reservado y su
      vigencia) y `CLAUDE.md` («Pacientes sin cita y derivación» con la vigencia). Verificar los enlaces y que los textos no se
      contradicen entre sí.
- [ ] 3.9 Revisión con el agente `code-review`, con atención especial al disparador que concede la asignación, a `tomar_paciente`
      (bloqueo, pertenencia a la especialidad, rutas por cita), al `alter policy` de asignaciones y a la regla de Psicología.
      Verificar que los hallazgos quedan resueltos o justificados.

## 4. Lógica de aplicación

- [ ] 4.1 `lib/triaje/rangos.ts` (constantes de rango de 0.3, usadas por la validación y por las pruebas) y
      `lib/schemas/triaje.ts` (Zod 3 `.strict()`: siete mediciones, par peso y talla, mensajes por campo en español, sin IMC ni
      autor ni hora) con `tests/triaje/esquemas.test.ts` (`node:test`): cada límite, fuera de rango, par incompleto, presión
      invertida, clave ajena, vacíos y no numéricos. Verificar que pasan y que fallan al relajar un rango a propósito.
- [ ] 4.2 `lib/triaje/errores.ts` con el mapeo de `design.md` D12 (`HC020`–`HC029`, `42501`, `23514`, `23505` → `HC020`, otros) y
      `tests/triaje/errores.test.ts`. Verificar que cada fila de la tabla tiene su prueba y que ningún mensaje contiene texto de
      la base ni datos del paciente.
- [ ] 4.3 `lib/triaje/guardia.ts` (`auth.protect()`, rol y MFA por recurso) y `lib/triaje/repositorio.ts` con ejecutor inyectable:
      cada operación clínica abre su transacción con `exigir_modo_clinico()` y llama a la función de la base (la aplicación no
      escribe SQL de escritura propio); añadir el script `test:triaje` a `package.json` y un paso a `ci.yml`. Pruebas con ejecutor
      simulado: el modo va primero, ningún parámetro identifica al actor, un fallo no devuelve contenido. Verificar que pasan y que
      el paso aparece en el PR.
- [ ] 4.4 `tests/triaje/acceso-unico.test.ts`: falla si algún archivo de `app/`, `lib/` o `components/` fuera de `lib/triaje/`
      contiene SQL contra `visitas`, `triajes` o `derivaciones`, salvo la lectura de triajes del profesional en `lib/historias/`
      (acuerdo de 0.6). Verificar que pasa y que falla al añadir temporalmente una consulta en otro archivo (revertida).
- [ ] 4.5 Server Actions (`app/administrativo/llegadas/acciones.ts`, `app/enfermera/triaje/acciones.ts`,
      `app/profesional/pacientes-en-espera/acciones.ts`): `registrarLlegada`, `cerrarVisita`, `registrarTriaje`,
      `derivarPaciente`, `anularDerivacion`, `tomarPaciente`, `terminarAtencion`; cada una con `exigirPersonal` (H3), Zod en el
      servidor, `ResultadoAccion` y el mapeo de 4.2. Pruebas `node:test` con ejecutor simulado: una entrada inválida no llega a la
      base, un cuerpo con un profesional destino se rechaza, ningún error crudo escapa, un rol equivocado recibe `NO_AUTORIZADO`.
      Verificar que pasan.
- [ ] 4.6 Acordar con H6 la lectura de triajes y de la derivación tomada dentro de `abrirHistoria` (misma transacción que el
      registro de acceso), con una prueba de H6 que muestre que un profesional sin asignación no recibe triajes. Verificar que el
      contrato (columnas y orden) consta en `design.md` D11 y que, si H6 no lo entrega, queda como seguimiento escrito sin romper
      este change.
- [ ] 4.7 Documentar: tabla de Server Actions de TECH-DESIGN y el mapa de errores en ADR-0008 (nota). Verificar los enlaces.
- [ ] 4.8 Revisión con el agente `code-review` de las acciones y del repositorio (identidad por parámetro, fugas de existencia,
      orden de sentencias, mensajes). Verificar que los hallazgos quedan resueltos o justificados.

## 5. Pantallas

- [ ] 5.1 `lib/ui/estados-visita.ts` (etiqueta, icono y color de cada estado, con sus tokens de `docs/DESIGN.md`), el componente
      `InsigniaEstadoVisita` en `components/clinica/` y los destinos de navegación (`lib/ui/navegacion.ts`) de «Llegadas»,
      «Triaje» y «Pacientes en espera». Verificar con `npm run typecheck`, `npm run lint`, `npm run tema:comprobar` y su
      aparición en `/guia-de-estilo`.
- [ ] 5.2 `app/administrativo/llegadas/`: buscar paciente por documento (acción de H3), enlace a registrar paciente nuevo (H3),
      elegir una cita confirmada de hoy o «sin cita» (con «confirmar y registrar» si está reservada), registrar la llegada, lista
      del día con estado y minutos de espera, cerrar visita con motivo del conjunto cerrado, y «visitas sin cerrar». Sin ningún
      dato clínico. Verificar con `npm run typecheck` y recorrido manual con datos de demostración.
- [ ] 5.3 `app/enfermera/triaje/` y `.../[visitaId]/`: lista de pacientes por triar con el mínimo de identidad de D4, formulario de
      las siete mediciones (errores por campo sin vaciar lo escrito, vista previa del IMC marcada como tal), repetir triaje,
      derivar (selector de especialidad, motivo), anular la derivación y marcar abandonada. Un solo botón primario por pantalla.
      Verificar con `npm run typecheck` y recorrido manual.
- [ ] 5.4 `app/profesional/pacientes-en-espera/`: «Llegaron para mí» (con cita, con indicación «sin triaje»), «Derivados a mi
      especialidad» con el nombre y la espera y el botón **Tomar**, y «En atención» con **Terminar** y **Derivar a otra
      especialidad** (el motivo desaparece y se explica si el usuario es psicólogo). Verificar con `npm run typecheck` y recorrido
      manual.
- [ ] 5.5 `Cache-Control: private, no-store` en `/administrativo/llegadas`, `/enfermera/triaje` y
      `/profesional/pacientes-en-espera`, páginas dinámicas, títulos fijos («Llegadas», «Triaje», «Pacientes en espera») y
      direcciones solo con `uuid`. Verificar con `curl -I` contra `next start` y una prueba E2E de cabeceras y título.
- [ ] 5.6 E2E (`e2e/triaje-*.spec.ts`, con la base sembrada; se omite con un mensaje explícito si faltan datos o el TOTP de
      profesional y enfermera): recepción registra una llegada sin cita y con cita; la enfermera registra el triaje y deriva; un
      profesional de la especialidad toma y otro recibe el mensaje de visita ya tomada; recepción no ve valores de triaje; la
      enfermera no entra a otras áreas ni ve datos fuera de la lista; un profesional de otra especialidad no ve la derivación;
      triaje fuera de rango muestra errores y no guarda; axe sobre las tres pantallas. Verificar que pasan.
- [ ] 5.7 Datos de demostración: ampliar `scripts/sembrar-datos-demo.ts` con la opción opt-in `--visitas-de-ahora` (pacientes
      `@demo.invalid` en cada estado, con y sin cita; rehace solo lo marcado) y `docs/datos-demo.md`. Verificar que sembrar dos
      veces no duplica y que no toca producción sin `--incluir-produccion`.
- [ ] 5.8 Documentar los datos y cuentas que requieren las E2E en `docs/pruebas-e2e.md`. Verificar los enlaces.
- [ ] 5.9 Revisión con el agente `code-review` de las pantallas (qué muestra cada rol, canales laterales, textos del profesional
      psicólogo). Verificar que los hallazgos quedan resueltos o justificados.

## 6. Indicadores de visitas

- [ ] 6.1 Migración `indicadores-de-visitas`: `indicadores_de_visitas(desde, hasta)` (`SECURITY DEFINER`, solo administrativo,
      `42501` a los demás, solo conteos por día de Lima: visitas, con cita, sin cita, atenciones iniciadas, con y sin triaje
      previo, atenciones iniciadas dentro de 20 minutos). Verificar con `npm run migrate -- up`.
- [ ] 6.2 Ampliar `tests/pgtap/66_visitas.test.sql` con los escenarios de la especificación (cobertura del triaje 18 de 20, espera
      de 18 minutos, visitas con y sin cita) y los negativos: enfermera, profesional, paciente, sin rol y `anonymous` no obtienen
      conteos; no se devuelven identificadores ni textos. Verificar que pasa.
- [ ] 6.3 Documentar la definición de los dos criterios de éxito (90 % con triaje previo y 20 minutos) y su fuente en TECH-DESIGN,
      con la nota de que la presentación en pantalla es de H7/H8. Verificar los enlaces.
- [ ] 6.4 Revisión con el agente `code-review` de la función (conteos, filtros por rol). Verificar que los hallazgos quedan
      resueltos o justificados.

## 7. Integración y cierre

- [ ] 7.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:triaje`,
      `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa. Verificar que todo
      pasa y que el PR trae el cuadro de cada requisito de las tres especificaciones con la prueba que lo cubre.
- [ ] 7.2 Verificación por mutación: en un branch de desarrollo, debilitar a propósito, una por una, y comprobar que al menos una
      prueba negativa falla (revertir cada vez): quitar el guarda de rol de `registrar_triaje`; dar `GRANT insert` sobre
      `visitas`; abrir la política de `triajes` al administrativo; quitar `for update` de `tomar_paciente`; quitar la
      comprobación de especialidad de `tomar_paciente` y del disparador; quitar el rechazo del prefijo `derivacion:` en la
      política de asignaciones; cambiar la vigencia a 3650 días; quitar un `CHECK` de rango; permitir `UPDATE` de triajes; quitar
      el índice único de visita en curso; quitar el índice de una derivación pendiente por visita; quitar la exigencia de triaje
      al derivar; añadir `numero_documento` o `email` a la lectura de la bandeja del profesional y `email` a la de la enfermera;
      quitar la regla de Psicología; hacer que derivar conceda la asignación. Verificar anotando en el PR la mutación y la prueba
      que falló, una por elemento.
- [ ] 7.3 Prueba de usabilidad con al menos una enfermera (si no es posible, un recorrido cronometrado por el equipo con un
      paciente típico, dejándolo registrado como sustituto): tiempo de un triaje completo con derivación y errores de tipeo.
      Verificar que el resultado consta en el PR y que, si supera el objetivo inicial de 2 minutos (valor a confirmar), se anotan
      los ajustes de interfaz acordados.
- [ ] 7.4 Barrido de coherencia entre documentos: `CLAUDE.md` (estado y reglas «Triaje» y «Pacientes sin cita y derivación»),
      TECH-DESIGN (tablas, funciones, rutas, vigencia), ADR-0032 y la ADR de la visita (0.2), `docs/datos-demo.md`,
      `docs/pruebas-sql.md`, `docs/pruebas-e2e.md` y los changes H3, H6, H6d y H7 afectados. Verificar con una búsqueda que los
      textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 7.5 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, funciones `SECURITY DEFINER`,
      asignaciones, Server Actions) con el checklist más estricto, y corrección de sus hallazgos. Verificar que no quedan
      hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la revisión humana aparte que exige el
      proposal.
- [ ] 7.6 Confirmar que ninguna migración ni variable del change fija el modo `real` y que el PR declara expresamente que el
      triaje y la derivación **no entran en producción con datos reales** mientras P-1 siga abierta. Verificar con una búsqueda de
      `modo` y `real` en `migrations/` y con la prueba pgTAP del modo por defecto de H6 en verde.
- [ ] 7.7 Tras el merge, comprobar que el despliegue de producción está READY, que las tres rutas responden con sesión de prueba y
      que `select public.modo_datos_clinicos()` sigue en `demostracion`; sembrar visitas de demostración en producción solo si el
      usuario lo pide. Verificar con la URL pública y el branch de producción.
