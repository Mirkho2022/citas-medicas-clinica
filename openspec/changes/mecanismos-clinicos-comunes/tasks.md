# Tasks

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada); si se rechaza, léase
> `medico`/`medicos`, `medico_actual()`, `medico_tiene_paciente()` donde dice `profesional`/`profesionales`,
> `profesional_actual()`, `profesional_tiene_paciente()`.

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto:** cuatro tablas clínicas nuevas, funciones
  `SECURITY DEFINER` que escriben y leen contenido clínico, el aislamiento de Psicología y dos disparadores sobre `citas` (tabla de H3).
  Cada grupo que cambia políticas, funciones `SECURITY DEFINER`, disparadores o rutas que sirven contenido clínico termina con una
  tarea de **revisión con el agente `code-review`** y no se da por cerrado hasta corregir o justificar por escrito sus hallazgos.
- **Datos reales: prohibidos.** Planes e instrumentos son datos de salud, y los de Psicología son datos de salud mental. Mientras la
  decisión legal P-1 (y P-11, P-12, P-14) siga abierta no se carga ningún dato real. Los datos sintéticos de demostración
  (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo `real` (H6, D1).
- **Licencias (P-18): ninguna tarea carga un instrumento en una migración, y ninguno se carga hasta verificar su licencia uno por uno.**
  Las pruebas usan instrumentos sintéticos creados dentro de la transacción de prueba; el único instrumento fuera de ellas es el de
  demostración de la tarea 9.1 (clave `demo_`, solo en la siembra). Los instrumentos reales los carga cada especialidad, **una
  migración por instrumento**, con su licencia verificada de forma individual.
- **Una sola definición de «psicólogo a cargo»:** `psicologo_tiene_paciente(paciente uuid)` y `acceso_clinico_por_area(area
  area_clinica, paciente uuid)` las define este change (grupo 1) y `especialidad-psicologia` (H6g) las reutiliza; nadie crea
  `es_psicologo_a_cargo()` ni un alias (`design.md` D2, «Contrato con H6g»).
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa (administrativo, profesional a cargo,
  otro profesional, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`, y **por profesión**: médico,
  odontólogo, fisioterapeuta, psicólogo y podólogo); antes de cerrarla se confirma que RLS quedó activada (`relrowsecurity`) y que
  `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos nuevos en `migrations/*.sql` (`npm run migrate -- create`);
  **nunca se edita una ya aplicada**, las secciones `down` quedan vacías (ADR-0027). Los números de prueba pgTAP (80 y 81), los
  SQLSTATE (`HC090`–`HC099`) y el de la prueba de concurrencia (30) son sugeridos: comprobar al aplicar que ningún otro change los tomó.
- Toda función `SECURITY DEFINER` lleva `search_path` vacío, `REVOKE ... FROM PUBLIC`, `EXECUTE` solo a `authenticated`, el guarda de
  rol y de actividad como primera sentencia y **ningún parámetro que identifique al actor**.
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en `production`**.
  Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Textos de interfaz y errores en español (con «usted»);
  fechas en `America/Lima`, `timestamptz` en la base.
- Las tareas de pantalla (grupo 8) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si no está aplicado, se avanza con los
  grupos 0 a 7 y 9. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de aplicar el change; este
  change no los modifica al proponerse.
- Orden de aplicación: **H2c, H3, H6 y H6b deben estar migrados antes del grupo 1** (tarea 0.1). H6e a H6h se construyen **después** de este change.

## 0. Decisiones previas y coordinación

- [ ] 0.1 Confirmar que H2c (`profesionales-de-la-salud`), H3 (`agenda-y-reserva`), H6 (`historias-clinicas`) y H6b
      (`triaje-y-derivacion`) están migrados o archivados y que la rama parte de ellos; aplicar las migraciones en un branch de
      desarrollo de Neon y correr `npm run test:pgtap`. Anotar el número de pruebas y los **nombres reales** (`profesion_actual()`,
      `profesional_actual()`, `profesional_tiene_paciente()`, `citas.profesional_id`, firma de `reservar_cita()` y
      `reprogramar_cita()`, `marcar_cita_atendida()`, `slots_disponibles()`, la restricción vigente de `accesos_historia.tipo_acceso`,
      `exigir_paciente_admisible()`, `exigir_modo_clinico()`, `registrar_auditoria_sin_contenido()`). Verificar que la línea base
      está en verde y que `design.md` usa los nombres reales (si no, ajustarlo con `openspec-update-change`).
- [ ] 0.2 Con la skill `architecture`, crear la ADR «Mecanismos clínicos comunes: planes de sesiones sobre las citas y puntaje de
      instrumentos verificado en la base» (siguiente número libre en `docs/adrs/`, que no se fija en los textos) que recoja
      `design.md` D4 a D6 y D11 a D12 con sus alternativas, la enlace en la tabla de ADR de TECH-DESIGN y la deje «Propuesto» hasta que
      el usuario la acepte. Verificar que el archivo existe, que los enlaces relativos resuelven y que el estado no es «Aceptado» sin
      decisión escrita.
- [ ] 0.3 Pedir al usuario y a la clínica las decisiones de «Open Questions» que fijan valores o reglas: qué profesiones crean planes
      (propuesta: fisioterapeuta, psicólogo y podólogo), si la inasistencia consume la sesión (propuesta: no) y el umbral de abandono,
      si las citas de sesiones cuentan en el 75 % del portal, qué hace un paciente sin cita ante una sesión, si «dos veces por
      semana» exige otra unidad de frecuencia, si un médico puede aplicar un instrumento de otra área y los topes numéricos. Verificar
      que cada respuesta (o el supuesto sin validar y el aviso al usuario) consta en `design.md`, que
      `profesion_puede_planificar_sesiones()` y los `CHECK` de D3 y D6 se escribirán con los valores resultantes y que los
      escenarios afectados se ajustan con `openspec-update-change`.
- [ ] 0.4 Preparar la consulta al asesor legal y a la jefatura clínica: reglas de salud mental sobre planes y tests de Psicología y qué
      ve recepción (P-14); **escalas con ítems de riesgo** y protocolo de emergencia (este change no construye alertas); y el
      procedimiento para **verificar la licencia** de cada instrumento antes de cargarlo (P-18: texto exacto, idioma, fuente). Verificar
      que cada pregunta consta con estado «pendiente» y que las respuestas se anotan con fecha en `design.md` D14.
- [ ] 0.5 Coordinar con **H3**: que no hay objeción a dos disparadores `AFTER` sobre `citas` que solo escriben en las tablas de este
      change (`design.md` D4); que `marcar_cita_atendida()` sigue siendo la única vía a `atendida`; que `reservar_cita()` conserva su
      firma y su carácter `SECURITY INVOKER`; que `reprogramar_cita()` y la reasignación por baja siguen cancelando la original
      antes de insertar la nueva con `reprogramada_de`; y que el literal `Registro de cita ya agendado` viene de
      `lib/citas/errores.ts`. Verificar que las respuestas constan en `design.md` D4 y que este change no añade columnas, políticas
      ni estados a `citas`.
- [ ] 0.6 Coordinar con **H6, H6b, H6c y H6d**: (a) la regla de la unión para la restricción de `tipo_acceso` y el orden de las
      migraciones que la reemplazan; (b) que `registrar_auditoria_sin_contenido()` está disponible (o se crea idéntica); (c) la
      pantalla de revisión de accesos de H6 (etiquetas `plan_sesiones` e `instrumento`); (d) que `compilar_copia_historia()` incluirá
      las secciones de `design.md` D16 y que la prueba de cobertura de H6d las exigirá. Verificar que las notas existen y que ningún
      otro change tomó `HC090`–`HC099` ni las pruebas 80 y 81.
- [ ] 0.7 Coordinar con **H6g (`especialidad-psicologia`)** el contrato de `design.md` D2 («Contrato con H6g»): (a) las firmas exactas
      `public.psicologo_tiene_paciente(paciente uuid) returns boolean` y `public.acceso_clinico_por_area(area public.area_clinica,
      paciente uuid) returns boolean` (`SECURITY DEFINER`, `search_path` vacío, falla cerrada, `EXECUTE` solo a `authenticated`,
      llamadas por posición); (b) que H6g las **reutiliza** y no crea `es_psicologo_a_cargo()` (su tarea 0.3b y su D3): confirmar que su
      `design.md` y sus tareas ya usan el nombre único o actualizarlas con `openspec-update-change`; (c) que la reserva por autoría
      (política restrictiva) es de H6g y se suma a la política por área de este change, prevaleciendo el criterio más estricto; (d) los
      nombres y columnas reales de las cuatro tablas (su tarea 0.3a), que no hay planes abiertos (0.3c) y los `tipo_acceso` de cada
      uno (0.3d); (e) que si H6g se aplica antes, define la función provisional con la misma firma y este change la reemplaza con
      `create or replace` idéntico. Coordinar además con **H6e, H6f y H6h**: que usan los mecanismos sin redefinirlos, aportan sus
      protocolos e instrumentos por migración **uno por uno con licencia verificada**, montan los componentes y clasifican sus tablas
      propias en el compilado de la copia (`design.md` D1 y D20). Verificar que el contrato consta en `design.md` y que los
      `design.md` de esos changes lo citan.

## 1. Área clínica y acceso por área

- [ ] 1.1 Migración `area-clinica-y-acceso-por-area`: tipo `area_clinica`, `area_de_profesion(profesion_salud)` e
      `profesion_puede_planificar_sesiones(profesion_salud)` (`IMMUTABLE`, valores de la tarea 0.3), y **con la firma exacta del contrato
      con H6g** `psicologo_tiene_paciente(paciente uuid)` (rol `profesional`, `profesion_actual() = 'psicologo'`, perfil activo y
      `profesional_tiene_paciente(paciente)`, todo dentro de `coalesce(..., false)`) y `acceso_clinico_por_area(area area_clinica,
      paciente uuid)` (`SECURITY DEFINER`, `STABLE`, `search_path` vacío, `REVOKE ... FROM PUBLIC`, `EXECUTE` solo a `authenticated`). Si
      H6g ya definió provisionalmente la función, reemplazarla con `create or replace` idéntico. Verificar con `npm run migrate -- up` en
      un branch de desarrollo y con `has_function_privilege` por rol.
- [ ] 1.2 Parte de la prueba pgTAP `tests/pgtap/80_planes_de_sesiones.test.sql`: la correspondencia profesión-área completa (una prueba
      enumera `profesion_salud` y falla si una profesión no tiene área); el conjunto exacto de profesiones que planifican sesiones;
      `psicologo_tiene_paciente()` y `acceso_clinico_por_area()` para **cada** profesión con el paciente a cargo, sin él, con asignación
      vencida y con perfil inactivo (solo el psicólogo a cargo obtiene verdadero para `psicologia`); **falla cerrada** (paciente nulo o
      inexistente, sesión sin perfil, token sin rol: `false`, nunca error ni `true`); un token con un claim `profesion` falso se ignora;
      `anonymous`, `cron_notificaciones` y `sync_identidad` sin `EXECUTE`; el catálogo contiene `psicologo_tiene_paciente` y **no**
      `es_psicologo_a_cargo`; y la **coexistencia con la política restrictiva de H6g**: dentro de la transacción de prueba se crea
      una `RESTRICTIVE` equivalente a la suya sobre una de las tablas y se verifica que el resultado es siempre el más estricto (nunca
      amplía la lectura de la política por área). Verificar que pasa.
- [ ] 1.3 Documentar: TECH-DESIGN («Información de Psicología» y «Mecanismos comunes»: el mecanismo y sus dos funciones) y
      `docs/pruebas-sql.md` (prueba 80, parte área). Verificar que los enlaces relativos resuelven y que los textos no contradicen a
      `CLAUDE.md` ni a ADR-0031.
- [ ] 1.4 Revisión con el agente `code-review` de la migración (funciones de acceso usadas por políticas, `search_path`, que la
      profesión salga de `profesion_actual()` y no del token, `IMMUTABLE` solo donde corresponde). Verificar que los hallazgos quedan
      resueltos o justificados por escrito en el PR.

## 2. Planes de sesiones: tablas y funciones

- [ ] 2.1 Migración `planes-de-sesiones`: tipos `estado_plan_sesiones` y `estado_sesion_plan`; tablas `planes_de_sesiones` y
      `sesiones_del_plan` con las columnas, claves foráneas compuestas, índices únicos (incluido el parcial de `cita_id`) y `CHECK`
      de D3 y D6; RLS activada y `GRANT select` a `authenticated` **sin** `GRANT` de escritura para ningún rol; política de lectura única
      `rol profesional y acceso_clinico_por_area(area, paciente_id)` en cada tabla; disparadores `planes_proteger` (todo `DELETE` y todo
      `UPDATE` fuera de las transiciones de D6, incluido el dueño), `sesiones_validar_transicion`, `planes_total_coherente` (de
      restricción, diferido) y la guarda de datos reales de H6 en `planes_de_sesiones`; auditoría con
      `registrar_auditoria_sin_contenido()`; vista `planes_de_sesiones_con_contador` con `security_invoker = true`. Verificar con
      `npm run migrate -- up`, con `relrowsecurity` de ambas tablas y con `has_table_privilege`.
- [ ] 2.2 Migración `funciones-de-planes`: `crear_plan_de_sesiones` (profesión autorizada, paciente a cargo, atención coherente,
      idempotencia por `p_id`, crea plan y N sesiones), `ajustar_plan_de_sesiones` y `cerrar_plan_de_sesiones` (profesión del plan,
      paciente a cargo, plan activo, solo hacia arriba, motivos cerrados), con el orden de bloqueo **plan antes que sesión** (D8) y
      SQLSTATE `HC090`–`HC092` y `HC094`. Verificar con las pruebas de 2.4.
- [ ] 2.3 Prueba pgTAP **negativa** de las tablas en `80_planes_de_sesiones.test.sql`: RLS activada; el fisioterapeuta, el psicólogo y
      el podólogo a cargo leen su plan; **un plan de fisioterapia lo lee un médico, un odontólogo, un psicólogo y un podólogo a cargo; un
      plan de un psicólogo no lo lee ningún médico, odontólogo, fisioterapeuta ni podólogo a cargo, ni un psicólogo sin el paciente,
      con asignación vencida o perfil inactivo**; administrativo, enfermera, paciente (incluido el titular), sin rol, `anonymous`,
      `cron_notificaciones` y `sync_identidad` cero filas o sin privilegio; `has_table_privilege` falso de `insert`, `update` y `delete`
      para todos; el dueño no puede borrar ni cambiar paciente o autor ni saltarse una transición; la lista exacta de columnas de la
      vista (`columns_are`). Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 2.4 En el mismo archivo, pruebas de las funciones: crear con cada profesión (solo fisioterapeuta, psicólogo y podólogo; médico y
      odontólogo `HC090`), límites de total (1, 60, 0, 61), frecuencia y vigencia, protocolo o descripción obligatorios, identidad
      sellada (profesión, área, especialidad, fecha de Lima, hora), `p_id` repetido idempotente y de otro autor rechazado, atención de
      otro paciente (`HC094`), cada rol distinto del permitido (`42501`, sin `EXECUTE` para `anonymous`, cron y sincronización); ampliar
      vigencia y total, reducir (`HC091`), pasar de 60, plan terminado (`HC092`); cerrar con cada motivo, motivo fuera del conjunto,
      profesión ajena (`HC090`), colega de la misma profesión; la invariante del total (se intenta romper y la transacción no se
      confirma); el contador de la vista tras cada operación. Verificar que pasa.
- [ ] 2.5 Documentar: TECH-DESIGN («Modelo de datos»: las dos tablas, la vista, los estados y la matriz de acceso) y
      `docs/pruebas-sql.md` (prueba 80, parte planes). Verificar los enlaces y que no se contradice `CLAUDE.md`.
- [ ] 2.6 Revisión con el agente `code-review` de las dos migraciones (RLS, ausencia de `GRANT` de escritura, `SECURITY DEFINER`,
      orden de bloqueo, disparadores de protección, vista `security_invoker`). Verificar que los hallazgos quedan resueltos o
      justificados.

## 3. Sesiones y citas

- [ ] 3.1 Migración `sesiones-y-citas` (parte 1): `vincular_cita_a_sesion` (administrativo; plan y sesión bloqueados en ese orden;
      condiciones de D4: sesión por agendar, plan activo, mismo paciente, cita reservada o confirmada, no vinculada, dentro de la
      vigencia, especialidad del plan; `HC092`/`HC093`) y `agendar_sesion_del_plan` (**`SECURITY INVOKER`**: `reservar_cita()` y luego
      `vincular_cita_a_sesion()` en una transacción; motivo fijo sin datos clínicos). Verificar con las pruebas de 3.4.
- [ ] 3.2 Misma migración (parte 2): los dos disparadores `AFTER ... FOR EACH ROW` sobre `citas` (`SECURITY DEFINER`, `search_path`
      vacío) con la tabla de eventos de D4: `atendida` (sesión asistida y plan completado, tomando el bloqueo del plan), `no_asistio`,
      `cancelada` (solo la fila de la sesión) y la cita nueva con `reprogramada_de`. Verificar que corre la suite de H3 completa sin
      editarla (las citas sin sesión no se ven afectadas) y las pruebas de 3.4.
- [ ] 3.3 Misma migración (parte 3): `proponer_serie_sesiones`, `planes_para_agendar` y `sesiones_del_plan_para_agendar`
      (`SECURITY DEFINER`, administrativo, tipo de retorno = lista blanca de D10, `42501` a los demás). Verificar con las pruebas de 3.4.
- [ ] 3.4 Pruebas en `80_planes_de_sesiones.test.sql`: agendar y vincular (camino normal; horario ocupado con el mensaje exacto y **sin cita
      creada**; cita de otro paciente, fuera de vigencia, de otra especialidad, ya vinculada, sesión ya agendada, plan terminado);
      asistida solo con `atendida` (confirmada no cuenta; marca manual rechazada); inasistencia, cancelación, reprogramación,
      reasignación por baja y cancelación del paciente en el portal, **cada una operada también como dueño**; la ventana de 1 hora no
      cambia nada; completado automático; la prueba de coherencia (cada sesión contra su cita); la lista **exacta** de columnas de
      `planes_para_agendar()` y `sesiones_del_plan_para_agendar()` (`pg_get_function_result`) sin protocolo, descripción, atención,
      profesión ni área; la serie (espaciado, tolerancia, sin hueco, vigencia, sin repetir hueco, cruce con otra cita, colega de
      otra especialidad `HC093`, nada se crea al proponer); **negativos de las funciones de recepción para** profesional, enfermera,
      paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`. Verificar que pasa.
- [ ] 3.5 Prueba de concurrencia `tests/concurrencia/30_planes_de_sesiones.test.ts` (sesiones `pg` reales como `authenticated`, ayudante
      `_sesion.ts` de H3), 20 rondas: 5 recepciones agendan la misma sesión (una gana, las demás `HC092` y sin citas huérfanas); dos
      vinculaciones de una misma cita; dos profesionales marcan atendidas las dos últimas sesiones (un solo `completado`); cerrar contra
      atendida; crear el mismo plan dos veces. Verificar que pasa y actualizar `docs/pruebas-sql.md`.
- [ ] 3.6 Documentar: TECH-DESIGN («Seguridad»: disparadores sobre `citas`, orden de bloqueo y función de lista blanca de recepción) y
      una nota en `agenda-y-reserva` (contrato hacia este change). Verificar los enlaces.
- [ ] 3.7 Revisión con el agente `code-review`, lectura estricta, de los disparadores sobre `citas` (alcance de escritura, caminos de
      cada rol, bloqueos, ausencia de efecto sobre citas sin sesión) y de `agendar_sesion_del_plan` (que no cambie el contexto de seguridad
      de H3). Verificar que los hallazgos quedan resueltos o justificados.

## 4. Catálogo de instrumentos

- [ ] 4.1 Migración `instrumentos-de-evaluacion`: tabla (clave, versión, nombre, `area`, `items`, `escalas`, fuente, `uso_libre`,
      `licencia_referencia`, `licencia_verificada_el`, `vigente`, `creado_en`, `unique (clave, version)`, `unique (id, area)`), `CHECK`
      de licencia para el vigente, `instrumento_definicion_valida(items, escalas)` (puro, `IMMUTABLE`, con las reglas de D11),
      disparador de validación (`BEFORE INSERT`, todo rol incluido el dueño), `instrumentos_proteger` (solo `vigente` verdadero a falso;
      sin borrado), RLS activada, `GRANT select` y política de lectura del profesional por área (D2), **sin** escritura para ningún rol.
      Verificar con `npm run migrate -- up` y `relrowsecurity`.
- [ ] 4.2 Prueba pgTAP **negativa** en `tests/pgtap/81_instrumentos_de_evaluacion.test.sql`, parte catálogo: RLS activada; el fisioterapeuta
      ve los instrumentos de áreas distintas de `psicologia` y no los de `psicologia`; el psicólogo ve todos; administrativo, enfermera,
      paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad` cero filas o sin privilegio; `has_table_privilege` falso de
      escritura; el dueño no puede editar una versión, reactivar una no vigente ni borrar. Verificar que pasa y que
      `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 4.3 En el mismo archivo, el validador regla por regla, con aceptación y rechazo de cada una: cantidad de ítems y escalas, claves
      repetidas y con formato inválido, opciones (menos de 2, valores repetidos), entero con mínimo ≥ máximo, ítem fuera de toda escala,
      ítem opcional en una escala de suma, operación desconocida, multiplicador fuera de 1 a 10, `minimo_respondidos` ausente o fuera de
      rango, rangos con hueco, solape, primer `desde` distinto del mínimo posible o último `hasta` distinto del máximo; y la **puerta
      de licencia**: vigente sin `uso_libre`, sin referencia o sin fecha rechazado; no vigente y no libre aceptado; **el catálogo de una
      base recién migrada no contiene instrumentos sin licencia referenciada**. Verificar que pasa.
- [ ] 4.4 Documentar: TECH-DESIGN («Modelo de datos»: catálogo, definición mínima y puerta de licencia, y P-18) y el procedimiento
      «cómo cargar un instrumento» de `design.md` D1 y D14 en `docs/` (checklist de licencia). Verificar los enlaces y que no se
      declara de uso libre ningún instrumento concreto.
- [ ] 4.5 Revisión con el agente `code-review` de la migración (validador como segunda barrera, inmutabilidad incluso para el dueño,
      política por área, `CHECK` de licencia). Verificar que los hallazgos quedan resueltos o justificados.

## 5. Aplicaciones de instrumentos

- [ ] 5.1 Migración `aplicaciones-de-instrumentos` (parte 1): `calcular_puntajes_instrumento(items, escalas, respuestas)` (puro,
      `IMMUTABLE`, aritmética entera, redondeo de mitades hacia arriba, `HC095` por respuestas inválidas) y la tabla
      `aplicaciones_instrumento` con las columnas de D13, clave foránea compuesta `(instrumento_id, area)`, RLS activada, `GRANT select`
      y política única por `acceso_clinico_por_area(area, paciente_id)` **sin** escritura para ningún rol. Verificar con
      `npm run migrate -- up` y `relrowsecurity`.
- [ ] 5.2 Misma migración (parte 2): `aplicaciones_verificar` (`BEFORE INSERT`, todo rol incluido el dueño: instrumento vigente
      `HC096`, respuestas válidas `HC095`, recálculo igual a lo almacenado `HC097`, atención coherente `HC094`), `aplicaciones_proteger`
      (todo `DELETE` y todo `UPDATE` salvo la anulación y la revisión de la interpretación con exactamente un elemento nuevo en el
      historial, `HC098`), la guarda de datos reales de H6 y la auditoría con `registrar_auditoria_sin_contenido()`. Verificar con las
      pruebas de 5.4.
- [ ] 5.3 Misma migración (parte 3): `registrar_aplicacion_instrumento` (profesión del área `HC090`, paciente a cargo, instrumento
      vigente, comparación con `p_calculo_servidor` `HC097`, inserta el cálculo de la base, idempotente por `p_id`),
      `ajustar_interpretacion_aplicacion` y `anular_aplicacion_instrumento` (solo quien la registró y mientras tenga al paciente a
      cargo). Verificar con las pruebas de 5.4.
- [ ] 5.4 Prueba pgTAP **negativa** y de reglas en `81_instrumentos_de_evaluacion.test.sql`, parte aplicaciones, con instrumentos
      sintéticos creados en la transacción: lista exacta de columnas; el psicólogo a cargo lee las de `psicologia`; **un médico, un
      odontólogo, un fisioterapeuta y un podólogo a cargo reciben cero filas de `psicologia`** y leen las de las demás áreas;
      psicólogo sin el paciente, con asignación vencida o perfil inactivo cero filas; administrativo, enfermera, paciente (incluido el
      titular), sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad` cero filas o sin privilegio; un fisioterapeuta no aplica
      un instrumento de `psicologia` ni viceversa (`HC090`); cálculo con los vectores clave (suma, multiplicador, valores invertidos,
      porcentaje con omitido, mitad exacta, límites de rango); puntaje distinto rechazado en la función y, **como dueño**, en el
      disparador; cada respuesta inválida (`HC095`); instrumento no vigente (`HC096`); edición de puntajes, respuestas e interpretación
      automática y borrado rechazados (`HC098`); interpretación con historial (agregar uno sí, quitar, editar o agregar dos no);
      anulación; otro profesional no ajusta ni anula; **la auditoría que lee el administrativo no contiene respuestas, puntajes ni
      textos**; el recálculo de todas las aplicaciones guardadas coincide. No asume tablas vacías. Verificar que pasa.
- [ ] 5.5 Documentar: TECH-DESIGN («Modelo de datos» y «Seguridad»: aplicaciones, puntaje verificado y restricción de Psicología) y
      `docs/pruebas-sql.md` (prueba 81). Verificar los enlaces y que los textos coinciden con `design.md` D12 y D13.
- [ ] 5.6 Revisión con el agente `code-review`, lectura estricta, de las funciones de registro y de los disparadores (comparación del
      puntaje, inmutabilidad, política de Psicología, idempotencia, que el área no se pueda declarar). Verificar que los hallazgos
      quedan resueltos o justificados.

## 6. Auditoría de lecturas y copia de la historia

- [ ] 6.1 Migración `accesos-historia-mecanismos-clinicos`: recrear la restricción de `tipo_acceso` leyendo la vigente con
      `pg_get_constraintdef` y **agregando** `plan_sesiones` e `instrumento` (regla de la unión, `design.md` D15), y las columnas
      `plan_id` y `aplicacion_id` con su `CHECK` de coherencia con el tipo. Verificar que se aplica sin tocar filas existentes y que las
      pruebas de `accesos_historia` de H6 y H6c siguen en verde sin editarse.
- [ ] 6.2 Prueba pgTAP (`81` o una `82` si H6 enumera los tipos): cada tipo nuevo se inserta, uno no permitido falla (`23514`),
      `plan_id` solo con `plan_sesiones` y `aplicacion_id` solo con `instrumento`; profesional sin asignación, a nombre de otro,
      administrativo, paciente y enfermera no insertan; solo-agregar. Verificar que pasa.
- [ ] 6.3 Verificar la auditoría de escritura de las cuatro tablas con `registrar_auditoria_sin_contenido()`: una escritura por
      cada operación de las funciones y de los disparadores de `citas`, atribuida al actor del token, y la lectura de `auditoria` por
      el administrativo sin contenido clínico (se busca un texto centinela). Verificar que pasa.
- [ ] 6.4 Pantalla de revisión de accesos de H6 (coordinado con su tarea 4.5): etiquetas «Plan de sesiones» e «Instrumento» sin
      contenido ni área. Verificar con `npm run typecheck` y una prueba E2E del grupo 8.
- [ ] 6.5 **Clasificar las tablas nuevas y escribir su sección en el compilado de la copia (H6d).** Si `compilar_copia_historia()` ya
      existe: migración condicional `compilado-copia-mecanismos-clinicos` que la reemplaza con `create or replace` agregando «Planes de
      sesiones» e «Instrumentos aplicados» (anuladas marcadas, etiqueta de la opción elegida por ítem, historial de la interpretación),
      marca `incluye_psicologia` cuando entren planes o aplicaciones de `psicologia`, y deja `instrumentos_evaluacion` como catálogo
      leído y no como dato del paciente. Si H6d aún no se aplicó: dejar la lista y la clasificación de `design.md` D16 en su
      `design.md`. Verificar que la prueba de cobertura de H6d (su tarea 3.4) pasa con las cuatro tablas clasificadas, que **falla**
      si se quita una, y que el administrativo sigue sin leer directamente ninguna de ellas.
- [ ] 6.6 Revisión con el agente `code-review` de la migración de `accesos_historia` y de la sección del compilado (que la copia no
      amplíe lectura a ningún rol, que Psicología conste solo por la función de compilación). Verificar que los hallazgos quedan
      resueltos o justificados.

## 7. Lógica de aplicación

- [ ] 7.1 `lib/schemas/plan-sesiones.ts` (Zod 3, `.strict()`: texto con contenido que rechaza invisibles y `U+0000`, NFC, límites de D3,
      motivos de cierre cerrados) y `tests/sesiones/esquemas.test.ts` con `node:test`. Verificar que pasan y que fallan al relajar una
      regla a propósito.
- [ ] 7.2 `lib/instrumentos/definicion.ts` (tipos) y `lib/instrumentos/puntaje.ts` (puro, **aritmética entera**, mismas reglas y mismo
      redondeo que `calcular_puntajes_instrumento()`), `lib/schemas/instrumento.ts` (esquema de respuestas construido desde la
      definición leída bajo RLS, `.strict()`), y `tests/instrumentos/casos-puntaje.json` con los vectores comunes (instrumentos
      sintéticos) y `tests/instrumentos/puntaje.test.ts`. Escribir además la prueba de **paridad** (`tests/integracion/paridad-puntaje.test.ts`)
      que ejecuta los mismos vectores contra la función SQL en un branch de desarrollo. Verificar que ambas pasan y que fallan al
      alterar un valor de un vector.
- [ ] 7.3 `lib/sesiones/errores.ts`, `lib/instrumentos/errores.ts` y `lib/sesiones/estados.ts` (rótulos con icono y texto de los estados
      de plan y de sesión): mapeo de `design.md` D17 con una prueba por fila (`node:test`) y que ningún mensaje contiene texto de la base.
      Verificar que pasan.
- [ ] 7.4 `lib/historias/planes.ts` y `lib/historias/instrumentos.ts`: repositorios con ejecutor inyectable (modo → acceso → lectura en
      una sola transacción; lista y detalle) y las llamadas a las funciones de escritura; ampliar `tests/historias/acceso-unico.test.ts`
      para que las cuatro tablas, la vista y las funciones solo se usen desde `lib/historias/`. Pruebas con ejecutor simulado: orden de
      sentencias, que si el acceso falla no se devuelve contenido y que el modo va primero. Verificar que pasan y que `acceso-unico`
      falla al añadir una consulta en otro archivo (revertida).
- [ ] 7.5 Acciones `crearPlan`, `ajustarPlan`, `cerrarPlan`, `agendarSesion`, `agendarSerie` (una transacción por sesión, resultado por
      fila), `vincularCita`, `aplicarInstrumento` (el servidor relee la definición bajo RLS, calcula, envía `p_calculo_servidor`),
      `ajustarInterpretacion` y `anularAplicacion`, con la guarda `exigirPersonal` de H3, Zod en el servidor y resultado tipado. Pruebas
      con ejecutor simulado: una entrada inválida no llega a la base, un error de la base se traduce sin texto crudo, una definición
      enviada por el cliente se ignora. Verificar que pasan.
- [ ] 7.6 Documentar la tabla de Server Actions y el mapeo de errores de TECH-DESIGN. Verificar los enlaces.
- [ ] 7.7 Revisión con el agente `code-review` de las acciones y los repositorios (validación en servidor, que el cliente no fije puntaje,
      área ni profesión, mapeo de errores, fugas de existencia, actor tomado de la sesión). Verificar que los hallazgos quedan
      resueltos o justificados.

## 8. Pantallas y componentes comunes

- [ ] 8.1 Componentes `ContadorDeSesiones`, `FilaSesion`, `SeriePropuesta`, `FormularioInstrumento` y `ResultadoInstrumento` en
      `components/clinica/` (estados con icono y texto, no solo color; un botón primario por pantalla; el formulario conserva lo
      escrito ante un error y rotula la vista previa del puntaje), y su entrada en la galería `/guia-de-estilo`. Verificar con
      `npm run typecheck`, `npm run lint` y `npm run tema:comprobar` (sin colores literales ni contrastes insuficientes).
- [ ] 8.2 `app/administrativo/planes-de-sesiones/` (lista, detalle, serie propuesta con confirmación por fila, agendar una sesión,
      vincular una cita); activar el destino en `lib/ui/navegacion.ts`; solo metadatos, sin protocolo ni descripción. Verificar con
      `npm run typecheck` y recorrido manual con datos de demostración.
- [ ] 8.3 `app/profesional/pacientes/[pacienteId]/planes/**` (lista con contador, crear solo si la profesión está autorizada y, si no,
      explicarlo, ajustar, cerrar con el aviso de citas futuras vigentes). Verificar con `npm run typecheck` y recorrido manual.
- [ ] 8.4 `app/profesional/pacientes/[pacienteId]/instrumentos/**` (lista, aplicar un instrumento del área, resultado con
      interpretación automática y del profesional, ajustar, anular). Verificar con `npm run typecheck` y recorrido manual.
- [ ] 8.5 Guardia, cabeceras y 404: cada página y acción repite `auth.protect()`, el rol y MFA; `Cache-Control: private, no-store`
      (confirmar que cubre `/profesional/pacientes/:path*` y agregar `/administrativo/planes-de-sesiones/:path*`); títulos genéricos;
      direcciones solo con `uuid`; lo de otra área o de un tercero devuelve `notFound()`. Verificar con `curl -I` contra `next start`
      y con las pruebas E2E.
- [ ] 8.6 E2E `e2e/planes-y-sesiones.spec.ts` (con la base sembrada según `docs/datos-demo.md`; si no hay datos se omite con un mensaje
      explícito): recepción agenda una serie y el contador baja al marcar atendida; el profesional crea, ajusta y cierra un plan; un
      psicólogo ve su plan y un fisioterapeuta recibe 404 en la dirección directa; una aplicación con puntaje, ajuste de interpretación
      y anulación; **la pantalla de recepción no contiene el texto clínico centinela**; administrativo, enfermera y paciente no abren las
      rutas del profesional; sin MFA redirige; axe sobre las pantallas. Verificar que pasan.
- [ ] 8.7 Documentar en `docs/DESIGN.md` los componentes nuevos (sin colores literales) y en `docs/pruebas-e2e.md` los datos y cuentas
      necesarios. Verificar con `npm run tema` y `npm run tema:comprobar` y que los enlaces resuelven.
- [ ] 8.8 Revisión con el agente `code-review` de las rutas y pantallas (canales laterales, caché, títulos, que ninguna pantalla de
      recepción reciba contenido clínico, 404 sin confirmar existencia). Verificar que los hallazgos quedan resueltos o justificados.

## 9. Datos de demostración y guía para las especialidades

- [ ] 9.1 Ampliar `scripts/sembrar-datos-demo.ts` con datos sintéticos (pacientes `@demo.invalid`): un plan de fisioterapia con sesiones
      en cada estado, un plan de un psicólogo, y un instrumento de demostración con clave `demo_` (uso libre propio del proyecto,
      licencia «sintético, sin tercero») y una aplicación suya. Documentarlos en `docs/datos-demo.md`. Verificar que sembrar dos veces
      no duplica filas, que el script se rechaza en modo `real` y que **ninguna migración** contiene el instrumento.
- [ ] 9.2 Redactar la guía «Cómo usar los mecanismos comunes» para H6e a H6h (checklist de `design.md` D1 y D14: plan, instrumento,
      licencia, vectores de prueba, componentes, clasificación en la copia). Verificar que el texto existe, que coincide con `design.md`
      y que los enlaces resuelven.
- [ ] 9.3 Prueba `tests/sesiones/reglas-de-uso.test.ts`: recorre `migrations/` y falla si una migración distinta de las de este change
      inserta o actualiza las cuatro tablas fuera de `instrumentos_evaluacion` (el catálogo sí se carga por migración de datos), si una
      migración carga un instrumento vigente sin `licencia_referencia` ni `licencia_verificada_el`, si una sola migración carga más de
      una `clave` de instrumento (**uno por uno**), o si alguna migración define `es_psicologo_a_cargo`. Verificar que pasa y que falla
      con una migración de prueba que incumple cada regla (revertida).

## 10. Integración y cierre

- [ ] 10.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:historias`,
      `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa. Verificar que todo pasa y que
      el PR trae el cuadro de cada requisito de las cuatro especificaciones con la prueba que lo cubre.
- [ ] 10.2 Verificación por mutación (`design.md` D19): en un branch de desarrollo, debilitar a propósito cada elemento de la lista
      (comprobación de área de la política, caso de Psicología de `acceso_clinico_por_area`, `INSERT` directo permitido, bloqueo del
      plan en el disparador de `atendida`, índice único de `cita_id`, comprobación de especialidad al vincular, puntaje del cliente
      aceptado, disparador `aplicaciones_verificar`, edición de `puntajes`, `licencia_referencia` del `CHECK`, contigüidad de rangos)
      y comprobar que al menos una prueba negativa falla; revertir. Verificar anotando en el PR la mutación y la prueba que falló,
      una por elemento.
- [ ] 10.3 Barrido de coherencia entre documentos: `CLAUDE.md` (estado, y el aislamiento de Psicología), `openspec/config.yaml`, PRD,
      TECH-DESIGN (modelo de datos, matriz, acciones, riesgos, P-18), ADR tocadas (0029, 0031 y la nueva), `docs/datos-demo.md`,
      `docs/pruebas-sql.md`, `docs/pruebas-e2e.md` y `docs/BACKLOG.md` (orden de H6i antes de H6e a H6h). Verificar con una búsqueda
      que los textos no se contradicen, que ningún enlace relativo está roto y que ningún documento declara de uso libre un instrumento.
- [ ] 10.4 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, migraciones, funciones, disparadores
      sobre `citas`, repositorios y acciones) con el checklist más estricto, y corrección de sus hallazgos. Verificar que no quedan
      hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la revisión humana aparte que exige el proposal.
- [ ] 10.5 Confirmar que ninguna migración ni variable de entorno del change fija el modo `real`, que el PR declara que H6i **no entra en
      producción con datos reales** mientras P-1, P-11, P-12, P-14 y P-18 sigan abiertas y que la ADR de la tarea 0.2 tiene la decisión
      del usuario escrita. Verificar con una búsqueda de `modo` y `real` en `migrations/` y con la prueba pgTAP del modo por defecto
      en verde.
- [ ] 10.6 Tras el merge, comprobar que el despliegue de producción está READY, que `CLINICA_MODO_DATOS=demostracion` sigue definida y
      que la lista de planes de recepción carga con los datos de demostración; sembrar planes en producción solo si el usuario lo
      pide. Verificar con la URL pública y con `select public.modo_datos_clinicos()` en el branch de producción.
