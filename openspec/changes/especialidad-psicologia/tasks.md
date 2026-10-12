# Tasks

> **Nombres:** sujetos a ADR-0030 (aún no aceptada); si se rechaza, léase `medico`/`medicos`, `medico_tiene_paciente()` y
> `atenciones.medico_id` donde dice `profesional`/`profesionales`, `profesional_tiene_paciente()` y `atenciones.profesional_id`.

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto:** añade políticas restrictivas sobre
  `atenciones`, `addendas`, `antecedentes`, `adjuntos_historia` y las tablas de H6i, y define quién lee salud mental. Cada grupo que
  cambia políticas, funciones `SECURITY DEFINER`, disparadores o rutas que sirven contenido clínico termina con una tarea de
  **revisión con el agente `code-review`** y no se da por cerrado hasta corregir o justificar por escrito sus hallazgos.
- **Datos reales: prohibidos.** La información de Psicología es la más sensible del sistema; mientras la decisión legal P-1, las
  reglas de salud mental y el resto de los bloqueos sigan abiertos no se carga ningún dato clínico real. Los datos sintéticos
  de demostración (`docs/datos-demo.md`) sí, y sus textos no deben parecer reales. Ninguna tarea fija el modo `real` (H6, D1).
- **Nunca se «arregla» un defecto quitando una política restrictiva** (`design.md`, Migration Plan): se corrige la función o se
  reemplaza la política y se vuelve a pasar la suite completa.
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa (administrativo, psicólogo a
  cargo, otro psicólogo a cargo, médico, odontólogo, fisioterapeuta y podólogo a cargo, psicólogo sin asignación, enfermera,
  paciente, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`); antes de cerrarla se confirma que RLS quedó
  activada (`relrowsecurity`) y que `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos nuevos en `migrations/*.sql`
  (`npm run migrate -- create`); **nunca se edita una ya aplicada**, las secciones `down` quedan vacías (ADR-0027). Los números de
  prueba pgTAP (77 y 78) y los SQLSTATE (`HC070` a `HC074`; `HC075` a `HC079` reservados) son sugeridos: comprobar al aplicar que
  ningún otro change los tomó.
- Toda función `SECURITY DEFINER` de este change lleva `search_path` vacío, `REVOKE ... FROM PUBLIC` y `EXECUTE` solo a quien
  corresponde (las de reserva a `authenticated`; las de huella a nadie).
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en
  `production`**. Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Textos de interfaz y errores en
  español (usted); fechas en `America/Lima`, `timestamptz` en la base.
- Las tareas de pantalla (grupo 8) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si no está aplicado, se avanza
  con los grupos 0 a 7 y se retoma. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de aplicar
  el change; este change no los modifica al proponerse.
- **Orden de aplicación:** H2c, H6, H6b, H6c y H6i deben estar migrados antes del grupo 1 (tarea 0.1). H6d se aplica después de este
  change (o recibe la sección de la tarea 6.4).

## 0. Decisiones previas y coordinación

- [ ] 0.1 Confirmar que están aplicados (o en la rama base) H2c `profesionales-de-la-salud`, H6 `historias-clinicas`, H6b
      `triaje-y-derivacion`, H6c `recetas-medicas` y H6i `mecanismos-clinicos-comunes`; aplicar sus migraciones en un branch de
      desarrollo de Neon y correr `npm run test:pgtap`. Anotar el número de pruebas en el PR y los **nombres reales**
      (`profesion_actual()`, `profesional_tiene_paciente()`, `atenciones.profesional_id`, `antecedentes.registrado_por`,
      `adjuntos_historia.subido_por`, nombres de las políticas permisivas). Comprobar con una consulta que **no existen profesionales
      con profesión `psicologo` ni filas clínicas de ese autor** en la base donde se aplicará (ventana de despliegue, `design.md`
      Riesgos); si existen, se detiene y se consulta. Verificar que la línea base está en verde y que `design.md` usa los nombres
      reales (si no, ajustarlo).
- [ ] 0.2 Añadir a [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) una nota fechada con el
      mecanismo elegido de `design.md` D2 (política restrictiva sobre la autoría, alternativas M1 a M8, límite frente al rol
      dueño) y los matices de D1 que se apartan de su texto (el autor sin asignación no conserva acceso propio; la reserva cubre
      antecedentes y adjuntos del psicólogo). La ADR sigue «Propuesto» hasta que el usuario la acepte; si se acepta con otra
      lectura de «y su autor», ajustar D1 y los escenarios con `openspec-update-change`. Verificar que la nota existe, que los
      enlaces relativos resuelven y que el estado no pasa a «Aceptado» sin decisión escrita del usuario.
- [ ] 0.3 **Contrato cerrado con H6i** (`mecanismos-clinicos-comunes`, terminado; decisión del orquestador): (a) **función única de acceso a
      Psicología**: H6g reutiliza `public.psicologo_tiene_paciente(paciente uuid)` y la genérica `public.acceso_clinico_por_area(area,
      paciente)` de H6i y **no crea `es_psicologo_a_cargo()` ni un alias** (`design.md` D3); (b) nombres reales: autor `profesional_id`, paciente
      `paciente_id`, instrumento con `clave`, `version`, `area`, `uso_libre`, `fuente`, `licencia_referencia`, `licencia_verificada_el` y
      `vigente`; (c) H6i rechaza con `HC090` que otra profesión aplique instrumentos de Psicología o cree planes de psicólogos, y ya aísla
      por área sus tablas desde su propia migración, así que **no hay ventana** y H6g **no** añade disparadores sobre esas tablas; (d) la reserva
      por **autoría** (política `RESTRICTIVE`) sobre `planes_de_sesiones` y `aplicaciones_instrumento` es de H6g y prevalece el criterio más
      estricto; `sesiones_del_plan` no tiene autor y queda aislada por el área de su plan; (e) **no hay planes sin total** (1 a 60); (f)
      recepción ve la lista blanca de H6i (D10 de H6i); (g) `tipo_acceso`: H6i usa `plan_sesiones` e `instrumento` para sus tablas, H6g
      `psicologia` para las suyas, y ambos recrean la restricción con la unión de valores. Al aplicar, verificar que los nombres reales
      coinciden con estos y que consta en `design.md` D3, D7, D8 y D12; si H6g se aplicara antes que H6i, la migración define
      provisionalmente `psicologo_tiene_paciente()` con la misma firma y semántica y H6i la reemplaza con `create or replace` idéntico
      (nunca existen dos nombres). Verificar también que ninguna tabla con datos de paciente queda fuera de la clasificación de 6.3.
- [ ] 0.4 Coordinar con H6 y con H6e a H6h: (a) la columna `plantillas_clinicas.exige_profesion` (si otro change ya añadió una
      equivalente, se reutiliza y se ajusta D5); (b) el orden de las migraciones respecto de la tarea 4.1 de H6 (`tipo_acceso`), la
      de `adjuntos_historia` y la de la plantilla de Medicina general; (c) que `lib/historias/guardia.ts` y `lib/ui/navegacion.ts`
      admiten una guarda por profesión; (d) la prueba `56` de H6 (¿enumera los tipos de acceso?) y la `47_estructura_historia`
      (no cambia: este change no altera columnas de `atenciones`). Verificar que las notas constan en `design.md` D5 y D12 y que
      ningún otro change tomó `HC070` a `HC079` ni las pruebas 77 y 78.
- [ ] 0.5 Coordinar con H6d, H6b y H6c: (a) H6d: la sección «Psicología» del compilado, que las filas de autor psicólogo salgan en
      ella y no en «Atenciones», `incluye_psicologia` sin conteos y la cuenta agregada de borradores (`design.md` D13); (b) H6b:
      la regla de que un psicólogo deriva sin `motivo` (`HC024`) y su prueba; (c) H6c: la vista de medicamentos, su prueba de
      columnas y el catálogo `profesiones_que_recetan` con `psicologo` en «no». Verificar que el contrato consta en `design.md`
      D9 y D13.
- [ ] 0.6 Coordinar con H3, H4 y H5: (a) las citas de las sesiones de Psicología no llevan motivo clínico (valor vacío o «Sesión») y
      el portal no lo pide; (b) **pregunta U9**: ¿el correo de recordatorio de una cita de Psicología nombra la especialidad o
      el profesional? (el correo llega a una bandeja que puede ser compartida); (c) la ventana de cancelación de 1 hora aplica a
      todos los roles también a estas citas. Verificar que las respuestas o los supuestos constan en `design.md` D8 y D9, y
      que ningún texto de recordatorio contiene contenido clínico.
- [ ] 0.7 Preparar la consulta al **asesor legal** con las preguntas del bloque «Para el asesor» de `design.md`: reglas de salud
      mental, **emergencia o «romper el vidrio»** (D10: ninguna excepción, acceso de emergencia con justificación, psicólogo de
      guardia o resumen mínimo; deber de reporte), copia de Psicología al paciente, a un representante (adolescentes) y a una autoridad,
      retención y eliminación de las notas, datos sensibles ante la ANPD y consentimiento, y licencias de los tests. Verificar que
      cada pregunta consta con estado «pendiente», que las respuestas se anotan con fecha en `design.md` y que, si cambian una regla,
      se ajustan D1, D10 o D13 y los escenarios con `openspec-update-change`. **Este change no decide la emergencia.**
- [ ] 0.8 Validar con los psicólogos de la clínica (o, si no hay acceso, dejarlo escrito como supuesto sin validar y avisar al
      usuario): los campos y opciones de la plantilla de D5 (en particular obligar a registrar el riesgo de autolesión), los
      rótulos de los cuatro textos, los cuatro campos de la nota de D6 y sus límites, la frecuencia por omisión de las sesiones
      y el protocolo de crisis de la clínica (qué hacer ante `riesgo_alto` o un ítem de riesgo positivo; el sistema no alerta).
      Verificar que las respuestas o el supuesto constan en `design.md` D5 a D8 y que las migraciones de 2.1 y 3.1 se escribirán con los
      valores resultantes.
- [ ] 0.9 Verificar la **licencia de cada instrumento** del catálogo propuesto (PHQ-9, GAD-7, AUDIT, PCL-5): fuente oficial, términos de uso,
      versión y traducción al español admitida, y confirmar las reglas de puntaje e interpretación de `design.md` D7 contra esa fuente.
      Anotar para cada uno la referencia de licencia y la fecha de verificación; **los que no se verifiquen no se cargan**. Verificar que
      la tabla de `design.md` D7 se actualiza con la referencia y que ningún instrumento de licencia comercial entra al catálogo.
- [ ] 0.10 Pedir al usuario, en una sola consulta, las decisiones U1 a U14 de `design.md` («Para el usuario o la clínica»): la
      restricción entera de la atención del psicólogo, qué ven los demás de un diagnóstico (A, B, C o D), ocultar o no la existencia del
      tratamiento, el autor sin asignación, antecedentes y adjuntos reservados, borradores de nota solo del autor, notas entre colegas,
      correos de recordatorio, escaneo de hojas de tests, control del alta de psicólogos, intentos denegados, la etiqueta de la
      revisión de accesos y el protocolo ante riesgo. Verificar que cada respuesta consta con fecha en `design.md` y que lo que cambie
      una regla se refleja en los escenarios.

## 1. Reserva por autoría: funciones y políticas restrictivas sobre las tablas compartidas

- [ ] 1.1 Migración `psicologia-funciones-de-reserva`: `fila_de_psicologia(uuid)` (falla cerrada: reservada salvo que el autor sea, con
      certeza, de otra profesión), `SECURITY DEFINER`, `search_path` vacío, `stable`, `REVOKE ... FROM PUBLIC`, `EXECUTE` solo a
      `authenticated`. **No** define la función de acceso: reutiliza `psicologo_tiene_paciente()` de H6i y no crea `es_psicologo_a_cargo()`
      ni un alias.
      Verificar con `npm run migrate -- up` en un branch de desarrollo y con `has_function_privilege` por rol (`anonymous`,
      `cron_notificaciones`, `sync_identidad` y `PUBLIC` sin `EXECUTE`).
- [ ] 1.2 Migración `psicologia-politicas-compartidas`, en el **mismo despliegue** que 1.1: una política `AS RESTRICTIVE FOR ALL TO
      authenticated` por tabla (`atenciones` por `profesional_id`, `addendas` por `profesional_id`, `antecedentes` por
      `registrado_por`, `adjuntos_historia` por `subido_por`) con las condiciones de `design.md` D3; **sin tocar ninguna política
      permisiva**. Verificar que se aplica, que las permisivas de esas tablas son idénticas antes y después (comparación de
      `pg_policies`) y que las pruebas 40 a 47, 52 y 54 a 59 siguen en verde sin editarse.
- [ ] 1.3 Prueba pgTAP **negativa** `tests/pgtap/77_psicologia_aislamiento_rls.test.sql`, grupo «tablas compartidas»: con un paciente a
      cargo de un psicólogo, un médico, un odontólogo, un fisioterapeuta y un podólogo, y con atenciones, addendas, antecedentes y
      adjuntos de cada autor con texto centinela: (a) **médico, odontólogo, fisioterapeuta y podólogo** hacen `count(*)`, `select … where id`,
      `exists`, `update … returning` y `delete … returning` sobre las filas del psicólogo y obtienen cero filas y cero efectos;
      (b) cada uno sigue viendo las de los demás no psicólogos (**no sobre-bloqueo**) y el psicólogo a cargo ve todas; (c) psicólogo sin
      asignación, con asignación vencida ayer y con perfil o alta inactivos: cero filas; (d) paciente titular, administrativo,
      enfermera, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`: cero filas o falta de privilegio, y
      `has_table_privilege` falso de lo que no se concede; (e) la **cascada**: una addenda de un médico adjunta a una atención del psicólogo
      (insertada por el dueño) es invisible para un médico; (f) autor nulo o inexistente → reservada; (g) un token con un claim `profesion`
      falso se ignora; (h) añadir en la transacción de prueba una política permisiva abierta no amplía la lectura. Verificar que pasa y que
      `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 1.4 Medir con `EXPLAIN (ANALYZE)` el costo de las políticas sobre un paciente con cientos de atenciones y varios autores, para
      un médico y para un psicólogo, y anotar el resultado en `design.md` D2. Si no cabe en el presupuesto de la lista (≤ 200 ms con
      datos de demostración ampliados), pasar a la variante M5 (columna sellada) y repetir 1.1 a 1.3. Verificar que la medición consta.
- [ ] 1.5 **Verificación por mutación del grupo** (lista de `design.md` D3, a-h): en un branch de desarrollo, debilitar a propósito cada
      elemento y comprobar que al menos una prueba falla; revertir y anotar en el PR la mutación y la prueba que la atrapó, una por
      elemento. Verificar que ninguna mutación sobrevive.
- [ ] 1.6 Documentar: TECH-DESIGN («Seguridad»: reserva de Psicología por autoría y política restrictiva; matriz de acceso por rol y
      profesión), nota en [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md) y `docs/pruebas-sql.md`
      (prueba 77). Verificar que los enlaces resuelven y que los textos no contradicen a `CLAUDE.md`.
- [ ] 1.7 Revisión con el agente `code-review`, lectura más estricta, de las funciones y las cuatro políticas (falla cerrada, orden
      de las condiciones, `search_path`, que las permisivas no cambien, ventana de despliegue). Verificar que los hallazgos
      quedan resueltos o justificados por escrito.

## 2. Plantilla de Psicología y evaluación estructurada

- [ ] 2.1 Migración `psicologia-plantilla`: (a) especialidad «Psicología» si falta (idempotente por nombre); (b) columna
      `plantillas_clinicas.exige_profesion` (`profesion_salud`, nula; o la equivalente de 0.4); (c) disparador `BEFORE INSERT OR
      UPDATE OF plantilla_id` en `atenciones` (`SECURITY DEFINER`, `search_path` vacío) que rechaza con **`HC070`** que una plantilla
      con `exige_profesion` la use un autor de otra profesión y con **`HC074`** que un psicólogo registre una atención sin la
      plantilla vigente de Psicología; (d) plantilla «Evaluación psicológica» v1 con los campos de `design.md` D5 ya validados en
      0.8, por migración de datos idempotente. Verificar que se aplica dos veces sin duplicar filas y que la plantilla queda
      vigente con `exige_profesion = 'psicologo'`.
- [ ] 2.2 Prueba pgTAP `tests/pgtap/78_psicologia_notas_y_canales.test.sql`, parte «evaluación»: evaluación completa se guarda y se
      firma con sello del servidor y huella; campo obligatorio vacío, solo espacios o invisibles, opción fuera de lista y sí/no como
      texto fallan por campo; **médico, odontólogo, fisioterapeuta y podólogo (aunque estén registrados en Psicología) con la plantilla
      de Psicología: `HC070`**; psicólogo sin plantilla o con la de otra especialidad: `HC074`; firmada, no se modifica y la huella
      cubre los datos; la evaluación es ilegible para las demás profesiones y roles (cubierto por 1.3, aquí con la plantilla). Verificar
      que pasa y que `47_estructura_historia` no se modificó.
- [ ] 2.3 `lib/schemas/psicologia.ts` (Zod 3, `.strict()`, campos de la plantilla desde `lib/schemas/plantilla.ts` de H6, texto con contenido
      que rechaza invisibles y `U+0000`, NFC) y `lib/psicologia/etiquetas.ts` con los rótulos de los cuatro textos genéricos;
      `tests/psicologia/esquemas.test.ts` con `node:test`. Verificar que pasan y que fallan al relajar una regla a propósito
      (revertido).
- [ ] 2.4 Documentar: TECH-DESIGN («Modelo de datos»: `exige_profesion`, plantilla de Psicología) y nota en
      [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (primera plantilla restringida a una profesión).
      Verificar los enlaces.
- [ ] 2.5 Revisión con el agente `code-review` de la migración y el disparador (`HC070`, `HC074`, `SECURITY DEFINER`, idempotencia
      de los datos). Verificar que los hallazgos quedan resueltos o justificados.

## 3. Notas de sesión reservadas

- [ ] 3.1 Migración `notas-sesion-psicologia`: tabla con las columnas de `design.md` D6 (clave compuesta a `historias_clinicas`, `cita_id`
      y `rectifica_a` únicos, `texto_con_contenido()` en los cuatro textos, límites), RLS activada, `GRANT` mínimo por columnas, políticas
      permisivas (lectura, inserción, actualización del autor) **más la restrictiva uniforme de D3**, borrador visible solo para su
      autor, disparadores `notas_sesion_exigir_psicologo` (`HC070`), `notas_sesion_coherencia` (`HC071`, `SECURITY DEFINER`, solo
      identificadores), `notas_sesion_inmutables` (`HC072`, vale también para el dueño), `notas_sesion_rectificacion` (`HC073`),
      `notas_sesion_sello` (hora del servidor y huella `v1:` solo si `current_user = 'authenticated'`), auditoría con
      `registrar_auditoria_sin_contenido()` y guarda de modo (`HC002`). Verificar con `relrowsecurity`, `has_table_privilege` por rol y
      con `npm run migrate -- up`.
- [ ] 3.2 Prueba pgTAP **negativa** `tests/pgtap/77_psicologia_aislamiento_rls.test.sql`, grupo «notas de sesión»: RLS activada; el psicólogo a
      cargo lee, escribe y firma; **médico, odontólogo, fisioterapeuta, podólogo a cargo, psicólogo sin asignación, con asignación vencida y
      con perfil inactivo, enfermera, administrativo, paciente titular, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`** no leen
      (cero filas) ni insertan, actualizan ni eliminan (`HC070` para las profesiones que llegan al disparador, `42501` o falta de privilegio para el
      resto); `has_table_privilege` falso para todo lo que no se concede; otro psicólogo a cargo lee la nota firmada **no** el borrador; autoría
      ajena rechazada. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 3.3 Prueba pgTAP `78`, parte «notas»: cuatro campos vacíos, solo espacios o invisibles; fecha futura; coherencia con cita y sesión (`HC071`:
      otro paciente, otro psicólogo); una nota por cita; un médico que reutiliza el `cita_id` de una sesión recibe el error de permiso y **no** `23505`;
      firma sellada con hora del servidor aunque el cliente envíe otra; modificar o eliminar una firmada (`HC072`, también como dueño);
      rectificación válida e inválida (`HC073`: borrador, otro paciente, otro autor, ya rectificada); huella que cubre el contenido; firmar no
      cambia la cita ni el plan. Verificar que pasan y que las pruebas 40 a 53 no se modificaron.
- [ ] 3.4 Prueba de concurrencia `tests/concurrencia/` (siguiente número libre, sugerido 26; dos sesiones `pg`): dos rectificaciones
      simultáneas de la misma nota y una firma contra una edición simultánea del borrador; solo una prospera. Verificar que pasa 20 rondas
      seguidas y actualizar `docs/pruebas-sql.md`.
- [ ] 3.5 Documentar: TECH-DESIGN («Modelo de datos»: `notas_sesion_psicologia`; matriz de acceso) y `docs/pruebas-sql.md` (prueba 77, grupo
      notas, y 78). Verificar los enlaces.
- [ ] 3.6 Revisión con el agente `code-review` de la migración (RLS, `GRANT` por columnas, disparadores, sello, borrador del autor, rectificación).
      Verificar que los hallazgos quedan resueltos o justificados.

## 4. Tests psicológicos sobre H6i

- [ ] 4.1 Migración `psicologia-mecanismos-comunes`, parte tests: política restrictiva uniforme de D3 sobre `aplicaciones_instrumento` (autor y paciente
      según 0.3) ; **sin disparador propio** (H6i rechaza con `HC090` que otra profesión aplique un test de Psicología); no sustituye las
      políticas por área de H6i: se suma como segunda barrera. Verificar que se aplica y que las pruebas 80 y 81 de H6i siguen en verde sin editarse.
- [ ] 4.2 Prueba pgTAP `77`, grupo «tests»: **psicólogo a cargo** aplica y lee (propios y de otro psicólogo a cargo); **médico, odontólogo, fisioterapeuta y
      podólogo a cargo** no aplican (`HC090` de H6i) ni leen; psicólogo sin asignación, con asignación vencida o inactivo: cero filas; administrativo, enfermera,
      paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`: cero filas o sin privilegio; un instrumento de otra área aplicado por un
      psicólogo queda reservado; un instrumento sin licencia o sin fecha de verificación no se aplica. Verificar que pasa.
- [ ] 4.3 Cargar el catálogo **solo** de los instrumentos cuya licencia se verificó en 0.9, uno por migración de datos idempotente, con
      su referencia de licencia y fecha de verificación y las reglas de `design.md` D7. Prueba por instrumento (en `78`): todo en mínimo, todo en máximo,
      un ítem omitido (rechazo, nunca puntaje parcial), un valor fuera de rango, el puntaje del servidor igual al de la base y que el cliente no puede
      enviarlo; el ajuste de la interpretación no cambia el puntaje. Verificar que, si ningún instrumento está verificado, la tarea queda en espera y
      el resto del change no se bloquea.
- [ ] 4.4 Revisión con el agente `code-review` de la política, el disparador y los datos del catálogo (reglas de puntaje transcritas contra la
      fuente, ítem de riesgo mostrado sin alerta). Verificar que los hallazgos quedan resueltos o justificados.

## 5. Sesiones recurrentes sobre H6i

- [ ] 5.1 En la migración `psicologia-mecanismos-comunes`, parte planes: política restrictiva uniforme sobre `planes_de_sesiones` y
      (`sesiones_del_plan` no tiene autor: queda aislada por el área de su plan, H6i) y **sin disparador propio** (H6i rechaza con `HC090`
      que otra profesión cree un plan de Psicología). Verificar que se
      aplica y que 80 y 81 siguen en verde.
- [ ] 5.2 Prueba pgTAP `77`, grupo «planes»: **psicólogo a cargo** crea, lee y cierra; **médico, odontólogo, fisioterapeuta y podólogo** no leen el plan de
      Psicología ni sus sesiones (sí los de su profesión) ni crean uno (`HC090` de H6i); psicólogo sin asignación, con asignación vencida o inactivo: cero filas;
      administrativo, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`: cero filas o sin privilegio; la lista
      blanca de recepción de H6i devuelve exactamente las columnas esperadas y ninguna con texto del plan. Verificar que pasa.
- [ ] 5.3 Comprobar con H6i y H3 (0.3 y 0.6) que las citas generadas por un plan de Psicología no llevan motivo clínico, que la ventana de
      cancelación de 1 hora aplica a todos los roles y que confirmar una cita renueva la asignación; añadir a `78` la prueba de que el motivo
      de esas citas es nulo o neutro. Verificar que pasan y que el acoplamiento con `citas` no cambió ninguna política de H3.
- [ ] 5.4 Revisión con el agente `code-review` de las políticas de los planes y de la lista blanca de recepción (nada de texto clínico,
      existencia y ritmo declarados). Verificar que los hallazgos quedan resueltos o justificados.

## 6. Canales laterales, auditoría y copia

- [ ] 6.1 Migración `accesos-historia-psicologia`: el valor `psicologia` en `tipo_acceso` (**leer la restricción vigente con
      `pg_get_constraintdef` y recrearla con la unión de sus valores y el nuevo**, para no pisar los de H6, H6c, H6d ni H6i), la
      columna `registro_id uuid null` con su `CHECK`, y una política **restrictiva de `INSERT`** que exige `psicologo_tiene_paciente(paciente_id)`
      cuando `tipo_acceso = 'psicologia'`. Actualizar a propósito la prueba `56` de H6 si enumera los tipos. Verificar que se aplica sin
      tocar filas existentes y que 52 y 56 pasan.
- [ ] 6.2 Prueba pgTAP `78`, parte «auditoría»: ni `auditoria`, ni `accesos_historia`, ni `solicitudes_copia_historia` contienen el texto centinela tras
      registrar una evaluación, una nota, una aplicación y un plan; acceso fabricado (médico a cargo, administrativo, psicólogo sin el paciente a cargo)
      rechazado; `accesos_historia` sigue solo-agregar incluido el dueño; los disparadores de auditoría de las tablas reservadas usan las funciones sin
      contenido; la lectura atómica con registro falla cerrada (simulada con una asignación vencida). Verificar que pasa.
- [ ] 6.3 Pruebas de **catálogo** en `78` (la red contra el olvido, `design.md` D15): (i) toda tabla de `public` con columna `paciente_id`, `atencion_id` o
      `historia_id` está en una de las tres listas escritas en la prueba, **con su razón** (reservadas con política restrictiva que llama a
      `fila_de_psicologia`; compartidas por construcción: `triajes`, `recetas`, `receta_items`; operativas: `citas`, `asignaciones…`, `visitas`,
      `derivaciones`, `notificaciones`, `solicitudes_copia_historia`, `accesos_historia`…) y falla al crear dentro de la transacción de prueba una tabla
      nueva sin clasificar; (ii) las funciones `SECURITY DEFINER` cuyo cuerpo menciona una tabla reservada son exactamente la lista cerrada de `design.md` D9,
      y las de huella no son ejecutables por `authenticated`; (iii) ninguna vista depende de una tabla reservada; (iv) `pg_stats` no devuelve filas
      de las tablas reservadas a un médico a cargo; (v) un médico que reutiliza un `cita_id` de Psicología no recibe `23505`; (vi) **no existe** ninguna función `es_psicologo_a_cargo` ni alias de
      `psicologo_tiene_paciente()` (una sola definición de «psicólogo a cargo»). Verificar que pasan y que el
      caso de falla de (i) y (ii) se detecta.
- [ ] 6.4 **Clasificar las tablas nuevas y escribir su sección en el compilado de la copia (H6d).** Clasificar `notas_sesion_psicologia` y las tablas de H6i
      reservadas (`aplicaciones_instrumento`, `planes_de_sesiones`, `sesiones_del_plan`) en la sección «Psicología»; los filtros
      con `fila_de_psicologia()` sacan las filas de autor psicólogo de «Atenciones», «Addendas», «Antecedentes» y «Adjuntos» y las llevan a «Psicología»;
      solo firmadas; `incluye_psicologia` sin conteos; la cuenta de borradores excluidos es un agregado de todas las secciones. Si H6d ya está
      aplicado: migración `compilado-copia-psicologia` con `create or replace` del compilado; si no: entregar a H6d el texto de la sección y sus
      pruebas y anotarlo en su tarea 0.6. Verificar que la prueba de cobertura `74` de H6d menciona las tablas nuevas, que la copia de un paciente con
      Psicología trae la sección, que el administrativo sigue con cero filas en las tablas y que la solicitud no guarda texto clínico.
- [ ] 6.5 Revisión con el agente `code-review` de la migración de accesos, de las pruebas de catálogo y de la sección del compilado (el compilado es la única
      ventana del administrativo: filtros, orden registro-antes-que-lectura, que no persista contenido). Verificar que los hallazgos quedan resueltos o
      justificados.

## 7. Lógica de aplicación

- [ ] 7.1 `lib/historias/guardia.ts`: añadir `exigirProfesion("psicologo")` que lee la profesión con `profesion_actual()` en la base (nunca de un claim ni
      del cliente) y responde `notFound()` a quien no lo es, y `lib/ui/navegacion.ts`: «Psicología» solo para psicólogos. Pruebas `node:test` con
      ejecutor simulado: un médico, un odontólogo, un administrativo y un psicólogo sin el paciente reciben `notFound()` idéntico al de un id
      inexistente; el psicólogo pasa. Verificar que pasan.
- [ ] 7.2 `lib/historias/psicologia.ts`: repositorio con ejecutor inyectable (modo primero, luego acceso `psicologia`, luego lectura) para abrir el panel,
      listar evaluaciones, notas, tests y plan, registrar/firmar notas y rectificarlas, y aplicar tests; ampliar `tests/historias/acceso-unico.test.ts`
      para que las tablas de Psicología solo se usen desde `lib/historias/`. Pruebas con ejecutor simulado: orden de sentencias, que si el acceso falla no
      se devuelve contenido, y que el modo va siempre primero. Verificar que pasan y que `acceso-unico` falla al añadir una consulta en otro archivo
      (revertida).
- [ ] 7.3 `lib/psicologia/errores.ts` con el mapeo de `design.md` D14 (`HC070` a `HC074`, `HC002`, `HC004`, `23505` sobre la cita, `23514`, `42501`,
      otros) y `tests/psicologia/errores.test.ts`. Verificar que cada fila de la tabla tiene su prueba, que `42501` y el 404 son uniformes y que ningún mensaje
      contiene texto de la base ni nombres de tablas.
- [ ] 7.4 Acciones `registrarNota`, `firmarNota`, `rectificarNota`, `aplicarInstrumento`, `crearPlanPsicologia` (Zod en servidor → repositorio → mapeo;
      resultado tipado `{ ok, datos | mensaje, errores? }`) y la evaluación por el formulario de atención de H6 con la plantilla de Psicología. Pruebas
      de ejecutor simulado: una entrada inválida no llega a la base; el puntaje enviado por el cliente se ignora; un error de la base se traduce sin
      texto crudo. Verificar que pasan.
- [ ] 7.5 Documentar la tabla de Server Actions de TECH-DESIGN y el mapeo de errores. Verificar los enlaces.
- [ ] 7.6 Revisión con el agente `code-review` de la guarda, el repositorio y las acciones (guarda por profesión desde la base, uniformidad de
      «no existe» y «no autorizado», actor tomado de la sesión, que ningún registro del servidor contenga contenido). Verificar que los hallazgos quedan
      resueltos o justificados.

## 8. Pantallas, datos de demostración y E2E

- [ ] 8.1 Rutas `app/profesional/pacientes/[pacienteId]/psicologia/**` (panel, `notas/nueva`, `notas/[notaId]`, `tests/nuevo`, `tests/[aplicacionId]`, `plan/`
      con la UI de H6i): cada una con `auth.protect()`, `exigirRol("profesional")`, `exigirProfesion("psicologo")` y MFA; `Cache-Control: private,
      no-store`, `<title>` «Historia clínica», direcciones solo con `uuid`, páginas dinámicas; el panel monta `MedicamentosDelPaciente` de H6c; sin ningún
      contador ni marcador de lo oculto en las pantallas de otras profesiones. Verificar con `npm run typecheck`, `npm run lint`, la regla de
      protección de Clerk y `curl -I` contra `next start`.
- [ ] 8.2 Formularios: la evaluación con los rótulos de Psicología, la nota (cuatro campos, errores por campo, conserva lo escrito, un solo botón
      primario «Firmar nota» con diálogo de confirmación, «Rectificar» sobre una firmada, botones secundarios aparte para marcar la sesión y la cita),
      el test (respuestas completas, resultado con puntaje calculado, interpretación ajustable, ítem de riesgo destacado sin alerta) y el plan. Verificar con
      `npm run typecheck` y revisión visual con datos de demostración.
- [ ] 8.3 Ampliar `scripts/sembrar-datos-demo.ts` con psicólogos y profesionales de las otras profesiones sintéticos y pacientes `@demo.invalid` con
      evaluaciones, notas y tests de texto **claramente ficticio** más el texto centinela, y documentarlos en `docs/datos-demo.md`; y el runner
      `scripts/ejecutar-pgtap.ts` con las identidades `psicologo_a`, `psicologo_b`, `psicologo_c`, `odontologo_a`, `fisioterapeuta_a` y `podologo_a`. Verificar
      que sembrar dos veces no duplica filas y que el script se rechaza en modo `real`.
- [ ] 8.4 E2E `e2e/psicologia.spec.ts` (cuentas de H1 con TOTP; si no hay datos se omite con un mensaje explícito): el psicólogo registra evaluación, nota, test y
      plan y los ve; **el médico y el odontólogo a cargo no ven ningún marcador y su dirección directa da el mismo 404 que un id inexistente; el
      administrativo, la enfermera y el paciente no abren las rutas**; el texto centinela no aparece en ninguna pantalla de otro rol; con H6d, la copia
      incluye la sección; axe sobre las pantallas. Verificar que pasan y documentar los datos y cuentas en `docs/pruebas-e2e.md`.
- [ ] 8.5 Revisión con el agente `code-review` de las rutas y pantallas (canales laterales, caché, títulos, contadores bajo RLS, que ninguna pantalla de otro rol
      reciba contenido). Verificar que los hallazgos quedan resueltos o justificados.

## 9. Integración y cierre

- [ ] 9.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:historias`, `npm run test:pgtap`,
      `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa. Verificar que todo pasa y que el PR trae el cuadro de cada requisito
      de las cuatro especificaciones con la prueba que lo cubre.
- [ ] 9.2 **Verificación por mutación completa:** en un branch de desarrollo, debilitar a propósito cada política, función y disparador nuevos (las del
      grupo 1; la restrictiva de cada tabla reservada, una por una, incluidas las de H6i; la comprobación de profesión de `HC070`; `exige_profesion`;
      `HC074`; la inmutabilidad `HC072`; la rectificación `HC073`; el borrador solo del autor; el sello y la huella de la nota; la restrictiva de
      inserción de `accesos_historia`; el filtro de Psicología del compilado; hacer que la vista de medicamentos dependa de `atenciones`; volcar
      contenido a `auditoria`; añadir una función `SECURITY DEFINER` que lea una tabla reservada; dejar una tabla nueva sin clasificar; permitir el
      `cita_id` duplicado sin coherencia) y comprobar que al menos una prueba negativa falla; revertir. Verificar anotando en el PR la mutación y la
      prueba que falló, una por elemento.
- [ ] 9.3 Barrido de coherencia entre documentos: `CLAUDE.md` (estado, y la tabla de roles con la excepción de Psicología), `openspec/config.yaml`, PRD
      (caso borde de Psicología), TECH-DESIGN (modelo de datos, matriz por rol y profesión, rutas, acciones, riesgos), ADR tocadas (0003, 0029, 0031),
      `docs/datos-demo.md`, `docs/pruebas-sql.md`, `docs/pruebas-e2e.md` y `docs/BACKLOG.md` (orden de H6g respecto de H6i y H6d). Verificar con una
      búsqueda que los textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 9.4 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, migraciones, funciones, compilado, rutas) con el checklist más
      estricto, y corrección de sus hallazgos. Verificar que no quedan hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la
      revisión humana aparte que exige el proposal.
- [ ] 9.5 Confirmar que ninguna migración ni variable de entorno del change fija el modo `real`, que el PR declara expresamente que H6g **no entra en
      producción con datos reales** mientras P-1, las reglas de salud mental, la emergencia (0.7) y la licencia de cada test sigan abiertas, y que la
      ADR-0031 tiene la decisión del usuario escrita. Verificar con una búsqueda de `modo` y `real` en `migrations/` y con la prueba pgTAP del modo
      por defecto en verde.
- [ ] 9.6 Tras el merge, comprobar que el despliegue de producción está READY, que `CLINICA_MODO_DATOS=demostracion` sigue definida y que un psicólogo de
      demostración abre su panel mientras un médico de demostración no ve ningún rastro; sembrar datos en producción solo si el usuario lo pide.
      Verificar con la URL pública y con `select public.modo_datos_clinicos()` en el branch de producción.
