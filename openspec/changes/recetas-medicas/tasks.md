# Tasks

Convenciones de todo el change (leer antes de empezar):

- **Nombres sujetos a ADR-0030** (aún no aceptada): este change escribe `profesional`, `profesionales`, `profesional_actual()` y
  `profesional_tiene_paciente()`; si se rechaza, léase `medico`, `medicos`, `medico_actual()` y `medico_tiene_paciente()`.
- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto.** Cada grupo que cambia políticas,
  funciones `SECURITY DEFINER`, disparadores, vistas o rutas que sirven contenido clínico termina con una tarea de **revisión
  con el agente `code-review`** y no se da por cerrado hasta corregir o justificar sus hallazgos.
- **Datos reales: prohibidos.** Mientras la decisión legal P-1 siga abierta no se carga ningún dato clínico real; los datos
  sintéticos de demostración (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo `real` (H6, D1). Este change **no** declara que
  la receta impresa cumpla la normativa: todo contenido mínimo viene marcado `REVISAR` hasta que lo valide el asesor.
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa por rol (administrativo,
  profesional a cargo, otro profesional, psicólogo, profesión no autorizada, enfermera, paciente, sin rol, `anonymous`,
  `cron_notificaciones`, `sync_identidad`); antes de cerrarla se confirma que RLS quedó activada (`relrowsecurity`) y que
  `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos nuevos en `migrations/*.sql` (se crean con
  `npm run migrate -- create`), **posteriores a las de H2c y H6**; nunca se edita una ya aplicada y sus secciones `down` quedan
  vacías (ADR-0027). Toda función `SECURITY DEFINER` lleva `search_path` vacío, `REVOKE ... FROM PUBLIC` y `EXECUTE` solo a quien
  corresponde. Los números de las pruebas pgTAP (70 a 72) son sugeridos.
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en
  `production`**. Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Los textos de interfaz y los
  mensajes de error van en español; las fechas, en `America/Lima`.
- Las tareas de pantalla (grupo 6) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si aún no está aplicado, se
  avanza con los grupos 0 a 5 y se retoma. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de
  aplicar el change; este change no los modifica al proponerse (en particular, **no edita `docs/DESIGN.md`**: lista sus
  componentes nuevos en `design.md`, D10).
- Antes de empezar, los grupos 1 a 4 requieren que existan las migraciones de H2c (`profesionales`, `profesional_actual()`,
  `profesional_tiene_paciente()`) y de H6 (`tipo_acceso`, guarda de modo); si no están, se escribe todo con los nombres de este
  documento y se aplica cuando lleguen.

## 0. Decisiones previas y verificaciones

- [ ] 0.1 Confirmar con el usuario (y la clínica) qué profesiones pueden recetar: médico sí, psicólogo no (ya confirmado);
      odontólogo, fisioterapeuta y podólogo por decidir. Dejar la respuesta, o el supuesto «no hasta confirmar», en `design.md`
      (D1 y Preguntas abiertas) y en el comentario de la migración semilla. Verificar que la respuesta o el supuesto constan en
      ambos sitios y que el usuario conoce el efecto: quien quede en «no» no verá «Emitir receta».
- [ ] 0.2 Llevar al asesor legal, o dejar escrito como supuesto sin validar y avisar al usuario: el contenido mínimo de la receta
      (DS 014-2011-SA, art. 56, hoy solo por la guía de Saniape), la vigencia de la receta en días, si el diagnóstico se imprime,
      si se exige la cantidad total, si «dosis por día» necesita campo propio, la edad en meses para menores de dos años y el
      rótulo Original/Duplicado. Verificar que cada punto consta en `design.md` (D3, Preguntas abiertas) con su respuesta o su
      marca `REVISAR`.
- [ ] 0.3 Verificar si el PNUME o el registro de DIGEMID es descargable hoy en formato reutilizable, con su versión, licencia, URL
      y si trae concentración y forma farmacéutica por separado; anotarlo en `design.md`, D9. No bloquea el change (la
      recomendación es la opción B). Verificar que la nota contiene fuente, fecha, condiciones de uso y la conclusión; si ninguna
      es reutilizable, queda dicho.
- [ ] 0.4 Confirmar con la clínica el formato de papel y la impresora de cada consultorio (el PRD no los confirmó) e imprimir una
      muestra con una receta de contenido máximo (ocho medicamentos con textos largos). Anotar formato y resultado en `design.md`,
      D8. Verificar que la muestra cabe en una hoja; si no hay impresora, avisar al usuario de que la métrica del 90 % no se
      puede alcanzar.
- [ ] 0.5 Pedir a la clínica los datos del establecimiento (razón social o nombre, RUC, dirección, teléfono, lugar de emisión) y
      el plazo de validez de la receta, y definir las variables `RECETA_*` (nombres en `.env.example`). Verificar que `.env.example`
      lleva valores ficticios claramente marcados y que la lista de variables y su origen constan en `design.md`, D3.
- [ ] 0.6 Con la skill `architecture`, crear la ADR «Recetas: escritura solo por funciones acotadas, numeración correlativa y
      lectura de medicamentos» (siguiente número libre en `docs/adrs/`) que recoja `design.md` D2, D4 y D6 sin decidir P-1,
      enlazarla en la tabla de ADR de TECH-DESIGN y dejarla en estado «Propuesto» hasta que el usuario la acepte. Verificar que
      el archivo existe, que los enlaces relativos resuelven y que el estado no es «Aceptado».
- [ ] 0.7 Verificar contra las migraciones reales ya aplicadas de H2c, H6 y H6b: el tipo `profesion_salud` y sus valores, que
      `profesion_actual()` existe y no lee ningún claim, los nombres de `profesional_actual()` y `profesional_tiene_paciente()`,
      la firma de `registrar_auditoria_sin_contenido()` (H6b), que `profesional_tiene_paciente()` exige también
      `profesionales.activo` y `perfiles.activo`, el nombre y la forma de `paciente_es_de_demostracion()` y
      `exigir_paciente_admisible()` (¿reutilizable como disparador sobre `recetas`?) y la definición vigente de la restricción
      de `accesos_historia.tipo_acceso`. Además, en el branch de desarrollo: versión de PostgreSQL (`security_invoker`, `sha256`)
      y que `pg_advisory_xact_lock` funciona dentro de una transacción de `neon-http`. Anotar los resultados en `design.md`
      (Context). Verificar que la nota existe y que cualquier diferencia con este diseño quedó corregida en `design.md` antes de
      escribir SQL.
- [ ] 0.8 Coordinar con los changes en paralelo y dejar los acuerdos en `design.md`, D7 y D12: con **H6** el orden de las
      migraciones, la restricción de `tipo_acceso`, la guardia, la navegación, las cabeceras `no-store` de
      `/profesional/pacientes/:path*`, el panel en la historia y las etiquetas de la pantalla de accesos; con **H6d** la
      restricción de `tipo_acceso` (tipo `copia`), la biblioteca de PDF, el membrete y qué recetas entran en la copia; con
      **H6b** la función `registrar_auditoria_sin_contenido()` (quién la crea primero); con **H2c** el uso de
      `profesion_actual()`; con **H6g** el nombre y las columnas de la vista de medicamentos; con **H2b** los nombres de `Campo`, `Alerta` y
      `ConsolaLayout`; con **H3** las columnas de filiación de `pacientes`. Verificar que cada acuerdo consta y que ningún otro
      change duplica `profesiones_que_recetan`, `recetas`, `receta_items` o `impresiones_receta`.

## 1. Catálogo de profesiones que recetan

- [ ] 1.1 Migración `profesiones-que-recetan`: tabla con `profesion` (clave primaria, tipo `profesion_salud` de H2c), `puede_recetar`, `confirmada`,
      `referencia` y `actualizado_en`, los `CHECK` de D1 (`confirmada or not puede_recetar`; `referencia` con contenido si
      `confirmada`), RLS activada y **sin `GRANT` ni política** para ningún rol de usuario; semilla de D1 (médico sí, psicólogo no,
      odontólogo, fisioterapeuta y podólogo no y sin confirmar); y `profesional_puede_recetar()` (`SECURITY DEFINER`, `search_path`
      vacío, `stable`, `EXECUTE` solo a `authenticated`, apoyada en `profesion_actual()` de H2c, `false` para toda sesión que no sea
      un profesional activo). Verificar con
      `npm run migrate -- up` en un branch de desarrollo, con `relrowsecurity` de la tabla y con `select
      public.profesional_puede_recetar()` desde una sesión de médico y de psicólogo.
- [ ] 1.2 Prueba pgTAP **negativa** `tests/pgtap/70_profesiones_que_recetan.test.sql`: RLS activada; administrativo, médico,
      psicólogo, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad` no leen, insertan, actualizan
      ni borran (`has_table_privilege` falso para cada operación); la semilla exacta (puerta de revisión: autorizar otra profesión
      obliga a editar la prueba); toda profesión del tipo tiene fila; una fila `puede_recetar` sin `confirmada` viola el `CHECK`
      (`23514`); `profesional_puede_recetar()` da verdadero al médico activo, falso al psicólogo, a las profesiones sin confirmar, a
      un médico dado de baja, al administrativo, a la enfermera, al paciente y a una sesión sin rol, y su `EXECUTE` es de
      `authenticated` y no de `anonymous` ni de `public`. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 1.3 Documentar: comentario de la migración con la referencia de la decisión, y en `docs/pruebas-sql.md` la prueba 70.
      Verificar que los enlaces relativos resuelven.
- [ ] 1.4 Revisión con el agente `code-review` de la migración (función `SECURITY DEFINER`, que la profesión se lea de la base y
      nunca del token, ausencia de `GRANT` en la tabla, semilla). Verificar que cada hallazgo se corrige o se justifica por
      escrito en el PR.

## 2. Recetas: tablas, numeración y emisión

- [ ] 2.1 Migración `recetas-tablas`: tipo `estado_receta`; tablas `recetas`, `receta_items` e `impresiones_receta` con las
      columnas, claves, `CHECK` de forma (establecimiento, anulación coherente, rangos 1 a 8 y 1 a 365, largos) e índices de D3;
      `texto_receta_valido()` (rechaza solo espacios e invisibles); RLS activada y **ningún `GRANT` de escritura** para ningún rol
      de usuario. Verificar con `npm run migrate -- up` y `relrowsecurity` de las tres tablas.
- [ ] 2.2 Migración `recetas-integridad`: `huella_receta(uuid)` (`'v1:'` + SHA-256 del `jsonb` canónico de D5, sin `estado` ni
      campos de anulación) y los disparadores `proteger_receta()`, de `receta_items` y de `impresiones_receta` (`HC032`;
      `UPDATE` de `recetas` solo para `emitida → anulada` con los demás campos iguales). Verificar que se aplica y que los
      disparadores valen también para el dueño.
- [ ] 2.3 Migración `recetas-funciones`: `insertar_receta()` (interna, **sin `EXECUTE` para `authenticated`**: turno
      `pg_advisory_xact_lock`, `max + 1`, `clock_timestamp()`, instantánea del emisor, fecha de validez, huella e inserción de
      cabecera y medicamentos) y `emitir_receta()` con el orden de comprobaciones de D2 (`42501`, `HC030`, idempotencia por `p_id`,
      `HC031`, `HC033`, `HC036`) y `set lock_timeout = '3s'`; disparador `BEFORE INSERT` de guarda de modo en `recetas` (`HC002`,
      reutilizando lo verificado en 0.7). Verificar que se aplica y que `has_function_privilege` es verdadero solo para
      `emitir_receta()` y `authenticated`.
- [ ] 2.4 Prueba pgTAP **negativa** `tests/pgtap/71_recetas.test.sql` (parte de emisión y estructura): `columns_are` de las tres
      tablas; RLS activada; ningún rol de usuario inserta, actualiza ni borra directamente (`has_table_privilege` y `throws_ok`);
      emisión feliz del médico a cargo (número, instantánea del emisor, fecha del servidor aunque se envíe otra, huella que coincide
      con su recálculo); `HC030` al psicólogo y a las profesiones sin confirmar sin consumir número; `42501` al médico sin
      asignación, con asignación vencida, con perfil o alta desactivados, y a administrativo, enfermera, paciente, sin rol,
      `anonymous`, `cron_notificaciones` y `sync_identidad`; `HC031` por receta sin medicamentos, con nueve, con campo vacío, solo
      con espacios o con invisibles, duración 0 y 366, valor de otro tipo; clave ajena descartada; `HC033` con atención de otro
      profesional y de otro paciente, y atención propia en borrador aceptada; `HC036` con reemplazo inválido; mismo `p_id`
      devuelve la receta ya emitida y `42501` si es de otro emisor; `HC002` con paciente real en modo demostración; la huella cambia
      si se altera un dato (deshabilitando el disparador solo dentro de la transacción de prueba). No asume tablas vacías.
      Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 2.5 En el mismo archivo, pruebas de numeración: tres emisiones dan números consecutivos; una emisión que falla por un
      medicamento inválido no deja hueco; una anulada conserva su número y la siguiente es la que sigue; el cliente no puede fijar
      el número ni la fecha; dos recetas con el mismo número violan `UNIQUE` (`23505`) si se fuerza como dueño. Verificar que
      pasan.
- [ ] 2.6 Prueba de concurrencia `tests/concurrencia/25_recetas.test.ts` (varias sesiones `pg`): 20 emisiones simultáneas de
      profesionales distintos dan 20 números distintos y consecutivos; una emisión que falla en medio no deja hueco; el mismo `id`
      enviado dos veces emite una sola receta; con el turno retenido por otra transacción, la emisión falla con `55P03` sin
      guardar nada. Verificar que pasa 20 rondas seguidas y actualizar `docs/pruebas-sql.md`.
- [ ] 2.7 Revisión con el agente `code-review` de las migraciones del grupo (turno de numeración, orden de comprobaciones,
      `SECURITY DEFINER`, función interna sin `EXECUTE`, disparadores de inmutabilidad, que el emisor y la profesión nunca vengan
      del cliente). Verificar que cada hallazgo se corrige o se justifica por escrito.

## 3. Anulación e impresión registrada

- [ ] 3.1 Migración `recetas-anulacion-e-impresion`: `anular_receta()` y `registrar_impresion_receta()` con las comprobaciones de
      D2 y D5 (`42501`, `HC035`, `HC034`, `HC031` por motivo sin contenido), toma de la receta `for update`, `anulada_por` y
      `anulada_en` del servidor, secuencia de impresión por receta y `EXECUTE` solo a `authenticated`. Verificar que se aplica.
- [ ] 3.2 Prueba pgTAP **negativa** en `tests/pgtap/71_recetas.test.sql` (parte de anulación e impresión): el emisor anula con
      motivo y quedan motivo, autor y hora del servidor con el contenido intacto; `23514`/`HC031` sin motivo o con motivo
      invisible; otro profesional a cargo recibe `HC035` al anular y al imprimir; un profesional sin el paciente a cargo recibe
      `42501`; anular dos veces `HC034`; imprimir una anulada `HC034`; administrativo, enfermera, paciente, sin rol, `anonymous`,
      `cron_notificaciones` y `sync_identidad` no anulan ni imprimen; la impresión numera 1, 2, 3; el registro de impresión no es
      editable ni borrable; corregir en un paso (anular + emitir con reemplazo) deja la nueva apuntando a la anulada y, si la nueva
      es inválida, la original sigue emitida (se prueba dentro de una sola transacción); una receta no se reemplaza dos veces.
      Verificar que pasa.
- [ ] 3.3 Ampliar `tests/concurrencia/25_recetas.test.ts`: anulación e impresión simultáneas (una de las dos gana y la otra
      recibe `HC034` o queda registrada antes de anular), dos impresiones simultáneas reciben secuencias distintas y consecutivas.
      Verificar que pasa 20 rondas seguidas.
- [ ] 3.4 Revisión con el agente `code-review` de las funciones de anulación e impresión (quién puede, orden de comprobaciones,
      que no revelen existencia, bloqueo de la fila). Verificar que los hallazgos quedan resueltos o justificados.

## 4. Lectura, vista de medicamentos y auditoría

- [ ] 4.1 Migración `recetas-lectura`: `GRANT SELECT` a `authenticated` en `recetas`, `receta_items` e `impresiones_receta`;
      políticas de D6 (profesional a cargo en `recetas` y `receta_items`; emisor a cargo en `impresiones_receta`); vista
      `medicamentos_vigentes_del_paciente` con `security_invoker = true` y las columnas de D6, con `GRANT SELECT` solo a
      `authenticated`. Verificar con `npm run migrate -- up`, `relrowsecurity` y `select reloptions` de la vista.
- [ ] 4.2 Migración `accesos-historia-recetas`: añadir `receta_id uuid null` a `accesos_historia`, **leer la restricción vigente
      de `tipo_acceso`** y recrearla con la unión de sus valores y `receta` y `medicamentos`, y el `CHECK` `receta_id is null or
      tipo_acceso = 'receta'`. Verificar que se aplica sin tocar filas existentes y que los valores de H6 y H6d siguen
      permitidos.
- [ ] 4.3 Migración `recetas-auditoria`: disparadores de `registrar_auditoria_sin_contenido()` (la función de H6b: actor, rol,
      acción, tabla e identificador, siempre con `datos_antes` y `datos_despues` nulos) en `recetas`, `receta_items` e
      `impresiones_receta`. Si la migración de H6b aún no está aplicada, crear la función con su **misma firma y definición**
      (`create or replace` idéntico, acordado en 0.8). **No** reemplaza `registrar_auditoria()`. Verificar que se aplica, que la
      función es `SECURITY DEFINER` con `search_path` vacío y `REVOKE ... FROM PUBLIC`, y que una escritura de prueba deja la fila
      de `auditoria` sin contenido.
- [ ] 4.4 Prueba pgTAP **negativa** `tests/pgtap/72_medicamentos_y_auditoria_de_recetas.test.sql`, lectura: médico a cargo y
      **psicólogo a cargo** leen recetas, medicamentos e impresiones propias y obtienen exactamente las mismas filas de la vista;
      médico sin asignación, con asignación vencida o con perfil inactivo, administrativo, enfermera, paciente, sin rol,
      `anonymous`, `cron_notificaciones` y `sync_identidad` no reciben ninguna fila de `recetas`, `receta_items`, la vista ni
      `impresiones_receta` (y `has_table_privilege` falso donde corresponde); otro profesional a cargo no lee `impresiones_receta`
      ajenas; las recetas anuladas se leen como anuladas. Verificar que pasa.
- [ ] 4.5 En el mismo archivo, pruebas de la vista: `columns_are` exacto; sus dependencias (`pg_depend`) son solo `recetas` y
      `receta_items` y no hay `atencion_id`, `huella`, `establecimiento` ni `indicaciones_generales`; vigencia en los límites
      (duración 7 emitida hace 6 días entra, el último día entra, el día siguiente sale); fecha de Lima a las 19:30 (con el reloj
      de la sesión en UTC ya del día siguiente); una receta anulada sale de inmediato; medicamentos de dos recetas aparecen
      juntos. Verificar que pasan.
- [ ] 4.6 En el mismo archivo, pruebas de auditoría: el médico inserta accesos de tipo `receta` y `medicamentos` para un paciente
      a cargo, con `receta_id` solo en `receta` (`23514` en otro caso); no a nombre de otro profesional ni de un paciente ajeno;
      un tipo no permitido falla; los tipos de H6 y H6d siguen permitidos; solo-agregar; el administrativo lee los accesos y no
      el contenido; la auditoría de escritura tras emitir, anular e imprimir no contiene DCI, dosis, motivo ni nombre del
      paciente y la lee solo el administrativo; médico, enfermera y paciente no la leen. Verificar que pasan y que `52` y las
      pruebas de `accesos_historia` de H6 siguen en verde sin editarse (salvo una `columns_are` o lista de tipos, si existe,
      que se actualiza a propósito).
- [ ] 4.7 Documentar: matriz de acceso de TECH-DESIGN (las cuatro tablas y la vista), `docs/pruebas-sql.md` (pruebas 71 y 72) y una
      nota en ADR-0031 que enlace la vista como contrato. Verificar que los enlaces resuelven.
- [ ] 4.8 Revisión con el agente `code-review` de las políticas, la vista, el cambio de la restricción de `tipo_acceso` y el
      disparador de auditoría, con la lectura más estricta (fugas hacia Psicología, hacia el administrativo y hacia el paciente).
      Verificar que los hallazgos quedan resueltos o justificados.

## 5. Lógica de aplicación

- [ ] 5.1 `lib/schemas/receta.ts` (Zod 3, `.strict()`, texto con contenido que rechaza también invisibles y `U+0000`, NFC,
      recorte solo en los extremos, límites de D3, 1 a 8 medicamentos, duración entera de 1 a 365, vigencia, atención y reemplazo
      opcionales) y `tests/recetas/esquemas.test.ts` con `node:test`. Verificar que pasan y que fallan al relajar una regla a
      propósito; añadir el script `test:recetas` a `package.json` y un paso al job `typecheck-lint-build` de `ci.yml`.
- [ ] 5.2 `lib/recetas/` con `vigencia.ts` (fecha de término y «vigente hoy» con fechas de Lima), `edad.ts` (edad a la fecha de
      emisión, meses para menores de dos años), `formato.ts` (número `000123`, rótulo Original/Duplicado) y
      `establecimiento.ts` (lee las variables `RECETA_*`, falla cerrado si falta alguna) con pruebas `node:test` (19:30 de Lima,
      último día, cumpleaños, un medicamento sin variables). Verificar que pasan.
- [ ] 5.3 `lib/historias/recetas.ts` (repositorio con ejecutor inyectable): `listarRecetas`, `abrirReceta`, `medicamentosVigentes`
      y `datosParaImprimir` en una sola transacción cada una (modo → acceso `receta` o `medicamentos` → lectura), y las escrituras
      `emitirReceta`, `anularReceta` (con `corregir` en una transacción) y `registrarImpresion`. Pruebas `node:test` con ejecutor
      simulado: el orden de sentencias, que si la inserción de acceso lanza no se devuelve contenido, que el modo va primero y que
      corregir es una sola transacción. Verificar que pasan.
- [ ] 5.4 Ampliar `lib/historias/errores.ts` con `HC030` a `HC036`, `55P03` y `23505` sobre `numero` (D10) y
      `tests/historias/errores.test.ts` (o `tests/recetas/`). Verificar que cada fila de la tabla de D10 tiene su prueba y que
      ningún mensaje contiene texto de la base.
- [ ] 5.5 Acciones `emitirReceta`, `anularReceta` y `registrarImpresionReceta` (Zod en servidor → repositorio → mapeo; resultado
      tipado; guardia `auth.protect()`, rol y MFA). Verificar con ejecutor simulado que una entrada inválida no llega a la base,
      que una clave ajena se rechaza, que el emisor y la profesión no se aceptan del cliente y que ningún error crudo escapa.
- [ ] 5.6 Ampliar `tests/historias/acceso-unico.test.ts` con las tablas, la vista y las funciones de recetas; el SQL de recetas
      vive solo en `lib/historias/`. Verificar que pasa y que falla al añadir temporalmente una consulta a `recetas` en otro
      archivo (revertida).
- [ ] 5.7 Revisión con el agente `code-review` del repositorio, las acciones y la configuración del establecimiento (validación
      en servidor, orden de sentencias, fugas de existencia, falla cerrada). Verificar que los hallazgos quedan resueltos o
      justificados.

## 6. Pantallas e impresión

- [ ] 6.1 Componentes de D10 en `components/clinica/`: `MedicamentosDelPaciente`, `FormularioReceta` y `FilaMedicamento`,
      `InsigniaReceta`, `RecetaImpresa` con su hoja de estilo de impresión (tokens de DESIGN.md, sin colores literales,
      `npm run tema:comprobar` en verde), `DialogoConfirmacion` de anulación y las variantes de `Alerta`. Verificar con
      `npm run typecheck`, `npm run lint` y su aparición en la galería `/guia-de-estilo`; dejar la lista de componentes y estilos
      lista para que el orquestador actualice `docs/DESIGN.md`.
- [ ] 6.2 `.../recetas/page.tsx` (medicamentos vigentes arriba, recetas emitidas y anuladas debajo) y montaje de
      `MedicamentosDelPaciente` en la historia (H6, 6.2). Verificar con `npm run typecheck`, `npm run lint` y la regla de
      protección de Clerk; que sin medicamentos aparece el estado vacío con su aclaración.
- [ ] 6.3 `.../recetas/nueva/page.tsx`: medicamentos vigentes antes del formulario, aviso fijo de interacciones y de
      estupefacientes, formulario repetible de hasta 8 medicamentos con errores por campo sin vaciar lo escrito, `p_id` generado al
      abrir, botón deshabilitado al enviar, y explicación sin formulario si la profesión no receta. Verificar con recorrido
      manual y `npm run typecheck`.
- [ ] 6.4 `.../recetas/[recetaId]/page.tsx`: detalle completo, «Anular» con diálogo de confirmación y motivo obligatorio,
      «Corregir» (anular y emitir otra en un paso) y «Imprimir receta», solo para el emisor; la receta de un colega se ve sin
      esas acciones; la anulada se ve tachada con su motivo. Verificar con recorrido manual y `npm run typecheck`.
- [ ] 6.5 `.../recetas/[recetaId]/imprimir/page.tsx`: vista previa con marca de agua, botón «Imprimir» que registra y luego llama a
      `window.print()`, rótulo Original/Duplicado, `@page` con margen cero, `<title>` «Receta», sin menú al imprimir, y
      negativa a generar la hoja si falta algún dato del establecimiento o del paciente. Verificar con recorrido manual y que un
      `GET` no inserta ninguna impresión.
- [ ] 6.6 Navegación y piezas de H6: activar «Recetas» en `lib/ui/navegacion.ts` del profesional; etiquetas «Receta» y
      «Medicamentos» en la pantalla de revisión de accesos del administrativo (H6, 4.5); comprobar que las cabeceras `no-store`
      de H6 cubren las rutas nuevas. Verificar con `curl -I` contra `next start` y con `npm run typecheck`.
- [ ] 6.7 E2E `e2e/recetas.spec.ts` y `e2e/recetas-impresion.spec.ts` (base sembrada según `docs/datos-demo.md`; se omiten con
      aviso si faltan los datos): el médico emite y ve la receta y los medicamentos; el psicólogo a cargo ve los medicamentos y
      no ve «Emitir receta»; un profesional de profesión sin confirmar no ve «Emitir receta»; campos vacíos muestran errores y no
      guardan; doble clic emite una sola receta; imprimir registra y rotula Original, la segunda vez Duplicado; la hoja con el
      contenido máximo ocupa **una** página (`emulateMedia` de impresión y `page.pdf()`); anular saca el medicamento de la lista;
      otro médico no anula ni imprime; administrativo, enfermera y paciente sin acceso (redirigidos, sin contenido); aviso de
      demostración visible; **axe** sin violaciones sobre lista, formulario, detalle y vista previa. Verificar que pasan.
- [ ] 6.8 Prueba de impresión real en la impresora de la clínica con una receta de demostración de contenido máximo: medir
      márgenes, legibilidad, que no salgan encabezados del navegador y que el recuadro de firma y sello tenga espacio para el
      puño del profesional. Anotar formato y ajustes (límites de D3) en `design.md`. Verificar que el resultado consta; si no
      es posible, dejarlo como pendiente explícito en el PR.
- [ ] 6.9 Revisión con el agente `code-review` de las rutas, la vista de impresión (que `GET` no registre, que no se imprima sin
      registro, títulos y URL sin datos clínicos, 404 uniforme) y los componentes. Verificar que los hallazgos quedan resueltos o
      justificados.

## 7. Datos de demostración y documentación

- [ ] 7.1 Ampliar `scripts/sembrar-datos-demo.ts` (como dueño, con `insertar_receta()` y la guarda de modo) con recetas sintéticas
      para pacientes `@demo.invalid`: una vigente de un médico, una terminada, una anulada y una de un paciente que también tiene
      psicólogo a cargo. Verificar que la siembra es idempotente, que no mezcla con datos reales y que `comprobar-datos-demo.ts`
      cubre las tablas nuevas.
- [ ] 7.2 Documentar `docs/datos-demo.md` (recetas sintéticas) y `docs/pruebas-e2e.md` (cuentas y datos de las pruebas de recetas).
      Verificar que los enlaces relativos resuelven.
- [ ] 7.3 Documentar para el momento de aplicar: TECH-DESIGN («Modelo de datos» con las cuatro tablas y la vista, matriz de acceso,
      rutas, acciones, fila H6c del plan), la regla de roles de `CLAUDE.md` («recetar solo si la profesión está autorizada en el
      catálogo») y `.env.example` (`RECETA_*` con valores ficticios). Verificar que los textos no se contradicen con el PRD ni con
      ADR-0031.

## 8. Integración y cierre

- [ ] 8.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run tema:comprobar`,
      `npm run test:historias`, `npm run test:recetas`, `npm run test:pgtap`, `npm run test:concurrencia`,
      `npm run test:integracion` y la suite E2E completa. Verificar que todo pasa y que el PR trae el cuadro de cada requisito de
      las cuatro especificaciones con la prueba que lo cubre.
- [ ] 8.2 Verificación por mutación (D11): en un branch de desarrollo, debilitar a propósito cada uno de estos elementos y
      comprobar que al menos una prueba negativa falla, revertir y anotar en el PR la mutación y la prueba que falló, una por
      elemento: (a) la comprobación de profesión en `emitir_receta()`; (b) la política de lectura de `recetas` (quitar
      `profesional_tiene_paciente`); (c) la política de `receta_items`; (d) el turno de numeración; (e) el disparador
      `proteger_receta()`; (f) la comprobación del emisor en `anular_receta()` y en `registrar_impresion_receta()`; (g) el filtro
      `estado = 'emitida'` de la vista; (h) el filtro de vigencia de la vista; (i) añadir `atencion_id` a la vista; (j) el
      `REVOKE EXECUTE FROM PUBLIC` de las funciones; (k) el `CHECK` de `tipo_acceso`; (l) la guarda de modo; (m) el `CHECK
      confirmada or not puede_recetar`.
- [ ] 8.3 Prueba de usabilidad con al menos un profesional (si no es posible, un recorrido cronometrado por el equipo): emitir e
      imprimir una receta típica de tres medicamentos; valor inicial a confirmar: **≤ 2 minutos** y sin errores. Verificar que el
      resultado consta en el PR y que, si lo supera, se anotan los ajustes de interfaz acordados.
- [ ] 8.4 Barrido de coherencia entre documentos: `CLAUDE.md`, TECH-DESIGN, ADR tocadas (ADR-0031, la nueva), `docs/datos-demo.md`,
      `docs/pruebas-sql.md`, `docs/pruebas-e2e.md`, la lista de componentes para `docs/DESIGN.md` y el estado de P-1 («abierta»).
      Verificar con una búsqueda que los textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 8.5 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, migraciones, funciones
      `SECURITY DEFINER`, vista, acceso a historias clínicas, Server Actions, vista de impresión) con el checklist más estricto, y
      corrección de sus hallazgos. Verificar que no quedan hallazgos abiertos sin justificación escrita; el resultado se enlaza en
      el PR para la revisión humana aparte que exige el proposal.
- [ ] 8.6 Confirmar que ninguna migración ni variable de entorno del change fija el modo `real` y que el PR declara expresamente
      que H6c **no entra en producción con datos reales** mientras P-1 siga abierta ni afirma validez legal de la receta.
      Verificar con una búsqueda de `modo` y `real` en `migrations/` y con la prueba pgTAP del modo por defecto de H6 en verde.
- [ ] 8.7 Tras el merge, comprobar que el despliegue de producción está READY, que las variables `RECETA_*` y
      `CLINICA_MODO_DATOS=demostracion` están definidas, que el aviso de demostración se ve en las pantallas de recetas y que
      `select public.modo_datos_clinicos()` devuelve `demostracion`; sembrar recetas de demostración en producción solo si el
      usuario lo pide. Verificar con la URL pública y con las consultas en el branch de producción.
