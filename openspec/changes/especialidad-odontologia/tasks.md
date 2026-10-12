# Tasks

> **Nombres:** sujetos a ADR-0030 (aún no aceptada); si se rechaza, léase `medico`/`medicos` donde dice `profesional`/`profesionales`.

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto:** crea cuatro tablas clínicas con
  política propia, funciones y disparadores `SECURITY DEFINER` y un disparador de sello sobre `atenciones`. Cada grupo que cambia
  políticas, funciones `SECURITY DEFINER`, disparadores o rutas que sirven contenido clínico termina con una tarea de **revisión con
  el agente `code-review`** y no se da por cerrado hasta corregir o justificar sus hallazgos.
- **Datos reales: prohibidos.** Mientras la decisión legal P-1 siga abierta no se carga ningún dato clínico real. Los datos
  sintéticos de demostración (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo `real` (H6, D1).
- **Contenido clínico propuesto:** los catálogos, las posiciones de cara, los tipos de radiografía y la plantilla son propuesta
  `REVISAR` hasta que los odontólogos de la clínica los validen (0.4). La NTS 188 **no se verificó** y ninguna tarea cita su contenido
  hasta que 0.3 la lea.
- **Imágenes (P-15):** ninguna tarea diseña el almacenamiento de imágenes. Las pruebas usan adjuntos PDF.
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa; antes de cerrarla se
  confirma que RLS quedó activada (`relrowsecurity`) y que `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos
  nuevos en `migrations/*.sql` (se crean con `npm run migrate -- create`); **nunca se edita una ya aplicada**, y las secciones
  `down` quedan vacías (ADR-0027). El número de prueba pgTAP (75, en dos archivos con ese prefijo) y los códigos SQLSTATE
  (`HC050` a `HC059`) son sugeridos: comprobar al aplicar que ningún otro change los tomó.
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en
  `production`**. Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Textos de interfaz y errores en
  español (con «usted»); fechas en `America/Lima`.
- Las tareas de pantalla (grupos 8 y 9) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si no está aplicado, se avanza
  con los grupos 0 a 7 y se retoma. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de aplicar
  el change; este change no las modifica al proponerse.
- Los disparadores sobre las cuatro tablas llevan los nombres con prefijo numérico de `design.md` D2 (`odontologia_10_completar`,
  `_20_proteger`, `_30_validar`, `_40_modo`) para fijar su orden de ejecución.

## 0. Decisiones previas y verificaciones

- [ ] 0.1 Confirmar que están aplicados (o en la rama base) H2c `profesionales-de-la-salud` (`profesion_actual()`,
      `profesional_tiene_paciente()`), H6 `historias-clinicas` (plantillas y `datos_especialidad`, sello y huella,
      `adjuntos_historia`, guarda de modo, `lib/historias/guardia.ts`), H6b `triaje-y-derivacion`
      (`registrar_auditoria_sin_contenido()`) y, para el grupo 6, H6d `copia-de-historia-clinica`; aplicar las migraciones en un
      branch de desarrollo de Neon y correr `npm run test:pgtap`. Verificar que la línea base está en verde y anotar el número de
      pruebas en el PR; si falta H6d, anotar que el grupo 6 queda en espera.
- [ ] 0.2 Registrar la decisión del usuario sobre **P-15 (imágenes como adjuntos)**: formatos y tamaño, y si se amplía
      `adjuntos_historia` o se crea un almacén aparte. Sin decisión, anotar el supuesto «radiografías en PDF» en `design.md`, D7, y
      avisar al usuario de que la parte de imágenes de H6e no cierra. Verificar que la respuesta o el supuesto constan con fecha y
      que ninguna tarea posterior asume un formato de imagen.
- [ ] 0.3 Obtener el texto oficial de la **NTS 188** (norma del odontograma) y leerlo: símbolos, convenciones de color, campos
      mínimos, si exige odontograma inicial y final o fechas. Anotar en `docs/investigacion-marco-legal-y-saniape.md` (nivel A, con
      URL y fecha) lo verificado y lo que no. Contrastar el catálogo de D5, las posiciones de cara y la plantilla de D8, y ajustar con
      `openspec-update-change` lo que difiera. Si no se consigue el texto, dejarlo escrito y mantener la marca `REVISAR`. Verificar
      que la nota existe y que `design.md` no cita contenido de la norma que no esté en ella.
- [ ] 0.4 Revisar con los odontólogos de la clínica (o, si no hay acceso, dejarlo escrito como supuesto sin validar y avisar al
      usuario): la lista de hallazgos y tratamientos, las banderas `reemplaza_caras` y el alcance, las posiciones de cara, los tipos
      de radiografía, los campos de la plantilla, si basta «sin registro» frente a «sana» y si necesitan más de un hallazgo por
      cara. Verificar que las respuestas o el supuesto constan en `design.md` (D5, D8 y Preguntas abiertas) y que la migración de
      datos del grupo 1 las refleja.
- [ ] 0.5 Coordinar con los changes en paralelo y anotar el resultado en `design.md`: con H6, el contrato del repositorio para
      componer «guardar y firmar en un paso» con la sección odontológica (D14), qué es `TransaccionConAcceso`, y la pregunta de si su
      huella `v1` puede cubrir tablas hijas (D10, alternativa C) para todas las especialidades; con H6b, `registrar_auditoria_sin_contenido()`
      y el orden de migraciones; con H6d, el punto de enganche de la sección y que su prueba de cobertura busque también en las
      funciones `copia_seccion_*` (D12); con H2c, la compatibilidad profesión–especialidad; con H3 y H2b, `lib/ui/navegacion.ts`,
      `components/clinica/` y `docs/DESIGN.md`; con `recetas-medicas`, que no se registran medicamentos aquí; y con el orquestador, retirar
      la dependencia de H6i del plan. Verificar que las notas existen y que ningún otro change tomó `HC050` a `HC059` ni el número 75.
- [ ] 0.6 Verificaciones técnicas previas, anotadas en `design.md`: (a) en un branch de desarrollo, con dos sesiones `pg` como
      `authenticated`, que `select … for share` sobre `atenciones` espera una firma en curso y luego no devuelve la fila firmada
      (D10); si no, usar un ayudante `SECURITY DEFINER` sin parámetro de rol; (b) que el tipo `si_no` del validador de H6 guarda un
      booleano JSON; (c) los nombres y el orden de los disparadores de `atenciones` de H6 (`atenciones_inmutables`, validación de
      datos de especialidad, sello) frente a `atenciones_odontologia_20_sellar` y frente al validador de H6 que impone `exige_profesion` (D15 de `historias-clinicas`); (d) que
      `registrar_auditoria_sin_contenido()` cubre `DELETE` y funciona con tablas cuya clave se llama `id`; (e) el nombre exacto de las
      columnas `subido_por` y `vigente` de `adjuntos_historia`; (f) la firma de `exigir_paciente_admisible()` (lee `new.paciente_id`).
      Verificar que cada punto tiene su resultado escrito y que una diferencia con lo supuesto ajusta `design.md` antes de escribir SQL.
- [ ] 0.7 Dejar al orquestador la propuesta de una ADR común «tablas hijas de la atención: inmutabilidad y sello» si Fisioterapia y
      Podología repiten el patrón (este change no crea una ADR propia: ADR-0029 y TECH-DESIGN prevén las tablas propias). Verificar
      que la propuesta consta en el informe del PR.

## 1. Catálogo y funciones puras

- [ ] 1.1 Migración `catalogo-odontologico`: tipos `denticion_odontologica`, `cara_dental`, `tipo_catalogo_odontologico`,
      `alcance_odontologico`, `estado_tratamiento_odontologico` y `tipo_radiografia_odontologica`; funciones `IMMUTABLE`
      `pieza_fdi_valida(smallint)`, `piezas_fdi_validas(smallint[])` y `denticion_de_pieza(smallint)`; tabla
      `catalogo_odontologico` (`UNIQUE (tipo, codigo)`, `codigo` en minúsculas y guiones bajos, `reemplaza_caras` solo en hallazgos
      de alcance pieza o ambos, `vigente`), RLS activada, `GRANT select` a `authenticated` y política `rol_actual() = 'profesional'`,
      **sin** escritura para ningún rol, y disparador que rechaza el cambio de `tipo`, `codigo`, `alcance`, `requiere_detalle` y
      `reemplaza_caras` incluso al dueño. Verificar con `npm run migrate -- up` en un branch de desarrollo, con `relrowsecurity` de
      la tabla y con `has_table_privilege` por rol.
- [ ] 1.2 Migración de datos `catalogo-odontologico-datos` (idempotente, `on conflict (tipo, codigo) do nothing`) con los hallazgos y
      tratamientos de D5 ajustados por 0.3 y 0.4, y un encabezado que declare que es una **propuesta de ingeniería pendiente de
      revisión por los odontólogos y que no reproduce la NTS 188**. Verificar que aplicarla dos veces no duplica filas y que el
      encabezado contiene esa declaración (búsqueda en el archivo).
- [ ] 1.3 Prueba pgTAP **negativa** `tests/pgtap/75_odontologia_rls.test.sql`, parte «catálogo»: RLS activada; todo profesional lee
      el catálogo; administrativo, enfermera, paciente y sin rol no leen (cero filas); `has_table_privilege` falso de `select` para
      `anonymous`, `cron_notificaciones` y `sync_identidad`, y de `insert`, `update` y `delete` para todos los roles de usuario; un
      `UPDATE` que cambia el alcance de una entrada falla incluso como dueño, y `vigente` sí puede cambiarse como dueño. Añadir al
      ejecutor `scripts/ejecutar-pgtap.ts` las identidades `odontologo_a`, `odontologo_b`, `fisioterapeuta_a`, `psicologo_a`,
      `podologo_a` y `medico_a`. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 1.4 Prueba pgTAP `tests/pgtap/75_odontologia_reglas.test.sql`, parte «piezas»: `pieza_fdi_valida` acepta las 52 piezas FDI
      (11–18, 21–28, 31–38, 41–48, 51–55, 61–65, 71–75, 81–85) y rechaza 0, 9, 10, 19, 29, 56, 86, 90 y 99;
      `denticion_de_pieza` devuelve la dentición correcta; `piezas_fdi_validas` rechaza duplicados y números inválidos. Verificar que
      pasa.
- [ ] 1.5 Documentar: TECH-DESIGN («Modelo de datos»: catálogo y tipos; matriz de acceso) y `docs/pruebas-sql.md` (prueba 75, parte
      catálogo y piezas). Verificar que los enlaces relativos resuelven y que los textos no contradicen a `CLAUDE.md`.
- [ ] 1.6 Revisión con el agente `code-review` de la migración (RLS del catálogo, protección del significado, funciones puras).
      Verificar que cada hallazgo se corrige o se justifica por escrito en el PR.

## 2. Plantilla de Odontología

- [ ] 2.1 Migración de datos `plantilla-odontologia` (idempotente): crea la especialidad «Odontología» si falta y la plantilla v1
      con `exige_profesion = 'odontologo'` (columna que añade D15 de `historias-clinicas`; este change solo fija el dato y no crea
      disparador propio), `registra_seccion_odontologica` (`si_no`, obligatorio), `observaciones_odontologicas` (`texto`, ≤ 2000) y `proxima_cita`
      (`fecha`), con el encabezado `REVISAR` de D8. Verificar que aplicarla dos veces no duplica filas, que el arreglo `campos` pasa
      el `CHECK` de forma de H6 y que existe exactamente una especialidad «Odontología».
- [ ] 2.2 Pruebas pgTAP (en `75_odontologia_reglas`): con la plantilla, una atención de un odontólogo sin `registra_seccion_odontologica`
      se rechaza (`HC005` de H6); con la declaración se guarda; la plantilla v1 vigente tiene `exige_profesion = 'odontologo'` (se afirma
      sobre el dato real) y un médico que intenta usarla recibe `HC005` de H6; las claves ajenas se descartan; la plantilla sigue sin ser legible por
      administrativo, enfermera ni paciente (cubierto por la prueba 62 de H6, que no se modifica). Verificar que pasan.
- [ ] 2.3 Documentar: TECH-DESIGN («Datos por especialidad»: plantilla de Odontología) y `docs/pruebas-sql.md`. Verificar los enlaces.

## 3. Tablas de la sección odontológica

- [ ] 3.1 Migración `odontograma-tablas`, parte tablas: `odontogramas`, `odontograma_registros`, `odontograma_tratamientos` y
      `radiografias_odontologicas` con las columnas, llaves y `CHECK` de D2 a D7 (pieza FDI, `UNIQUE (atencion_id, pieza, cara)`,
      índice único parcial de `indicacion_origen_id`, `huella` y `sellado_en` juntos o ninguno, detalle con `texto_con_contenido()`
      y ≤ 500, `adjunto_id` único), `id` en todas, **sin ninguna columna de dinero**, e índice `(paciente_id, pieza, cara,
      atencion_id)`. Verificar con `npm run migrate -- up` y con `relrowsecurity` de cada tabla.
- [ ] 3.2 En la misma migración, RLS, `GRANT` por columna y políticas de D9: `SELECT` con `rol_actual() = 'profesional' and
      profesional_tiene_paciente(paciente_id)`; `INSERT`, `UPDATE` y `DELETE` con `profesion_actual() = 'odontologo'` y la atención
      propia y sin firmar; **sin `GRANT`** a `anonymous`, `cron_notificaciones` ni `sync_identidad`; `DELETE` solo sobre filas de
      una atención sin firmar. Verificar con `has_table_privilege` y `has_column_privilege` por rol y columna.
- [ ] 3.3 En la misma migración, los disparadores de D2: `odontologia_10_completar` (fija `paciente_id` desde la atención e ignora
      cualquier valor del cliente), `_20_proteger` (profesión, autoría, plantilla de Odontología y atención sin firmar, con
      `select … for share`; `HC050` y `HC051`; la regla «sin firmar» para todo rol), `_30_validar` (dentición `HC053`, alcance,
      vigencia, tipo y detalle `HC054`, vínculo de tratamiento `HC055`, adjunto `HC056`, fecha de toma no futura con `23514`,
      reemplazo de caras), `_40_modo` (`exigir_paciente_admisible()` de H6, `HC002`) y el de auditoría con
      `registrar_auditoria_sin_contenido()`; más la revalidación al cambiar la dentición del borrador. Todas las funciones con
      `search_path` vacío. Verificar que la migración se aplica y que el orden de los disparadores coincide con D2 (3.6).
- [ ] 3.4 Prueba pgTAP **negativa** `75_odontologia_rls`, parte «tablas» (las cuatro): RLS activada; el odontólogo autor a cargo
      lee, inserta, actualiza y borra en su borrador; médico, fisioterapeuta, psicólogo y podólogo a cargo **leen y no escriben**
      (`HC050`, y `42501` con el disparador desactivado solo dentro de la transacción de prueba); odontólogo no autor, odontólogo sin
      el paciente, con asignación vencida y con perfil inactivo no leen ni escriben; administrativo, enfermera, paciente (incluido el
      titular) y sin rol cero filas; `anonymous`, `cron_notificaciones` y `sync_identidad` sin privilegios; `UPDATE` de `paciente_id`,
      `huella` o `sellado_en` rechazado; una profesión falsa en el token se ignora; `columns_are` exacto de cada tabla (sin dinero);
      y `has_table_privilege` de todo lo que no se concede. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 3.5 Prueba pgTAP `75_odontologia_reglas`, parte «reglas»: duplicado de pieza y cara (`23505`); dentición adulta con la pieza 55
      (`HC053`); cambiar la dentición con registros incompatibles; mixta con 16, 55 y 36; alcance (pieza en cara, cara en pieza
      completa) y entrada retirada, de otro tipo o inexistente (`HC054`); `otro` sin detalle (`HC054`); pieza ausente con una cara
      en la misma atención (`HC054`); tratamiento realizado con origen de otro paciente, pieza o tratamiento, sin firmar, de la
      propia atención o ya cumplido (`HC055`) e indicado con origen; radiografía con adjunto de otro paciente, anulado, subido por
      otro o ya vinculado (`HC056`) y fecha futura; paciente real en modo demostración (`HC002`). Verificar que pasa y que las
      pruebas 40 a 62 no se modificaron.
- [ ] 3.6 Pruebas de la auditoría y del orden: tras escrituras del odontólogo, `auditoria` registra actor, acción, tabla e id y **no
      contiene un texto centinela** puesto en `detalle` y `nota`; el administrativo lee `auditoria` sin contenido clínico; el orden
      de los disparadores leído de `pg_trigger` es `10`, `20`, `30`, `40`. Verificar que pasan.
- [ ] 3.7 Documentar: TECH-DESIGN («Modelo de datos»: las cuatro tablas, sus columnas y la matriz de acceso; rutas) y
      `docs/pruebas-sql.md` (prueba 75). Verificar que los enlaces relativos resuelven y que los textos coinciden con `design.md`.
- [ ] 3.8 Revisión con el agente `code-review` de la migración (políticas, `GRANT` por columna, disparadores `SECURITY DEFINER`,
      bloqueo `for share`, orden, `paciente_id` fijado por la base). Verificar que los hallazgos quedan resueltos o justificados.

## 4. Sello, coherencia con la atención y concurrencia

- [ ] 4.1 Migración `odontograma-sello-y-coherencia`: `especialidad_odontologia_id()`; `huella_odontograma(uuid)` (`'v1:'` + SHA-256
      del `jsonb` canónico de D10, por código de catálogo y con listas ordenadas, sin `firmada_en`); `verificar_odontograma(uuid)`;
      `atenciones_odontologia_20_sellar` (`BEFORE UPDATE OF firmada_en`, `WHEN` del paso a firmada:
      coherencia con la declaración `HC052`, piezas contra la dentición `HC053`, huella y `sellado_en`), `SECURITY DEFINER`
      con `search_path` vacío. No hay disparador de profesión–plantilla: lo impone `exige_profesion` (grupo 2). `EXECUTE` de las funciones solo a quien corresponde. Verificar que se aplica y que `atenciones_inmutables`
      sigue ejecutándose antes del nuevo.
- [ ] 4.2 Pruebas pgTAP `75_odontologia_reglas`, parte «sello»: firmar con la sección coherente sella y la huella coincide con su
      recálculo; declarar registrar sin registros, declarar no registrar con cabecera y una pieza incompatible rechazan la firma y la
      atención sigue sin firmar (`HC052`, `HC053`); alterar un registro firmado (con el disparador desactivado solo en la transacción
      de prueba) hace que la huella deje de coincidir; borrar la cabecera de una atención que declaraba registrar se detecta;
      insertar, actualizar o borrar filas de una atención firmada falla para el odontólogo y para el dueño (`HC051`); la huella no cambia al firmarse en otro momento. Verificar que pasan.
- [ ] 4.3 Prueba de concurrencia `tests/concurrencia/` (siguiente número libre, sugerido 30; dos sesiones `pg` como `authenticated`): editar
      un registro mientras se firma su atención, en ambos órdenes (el editor recibe `HC051` o la huella ya incluye el cambio; nunca un
      sello desfasado); y dos borradores del mismo paciente firmados en orden inverso al de creación (se conservan ambos registros y
      el actual es el de la firma más tardía). Verificar que pasa 20 rondas seguidas y actualizar `docs/pruebas-sql.md`.
- [ ] 4.4 Documentar: TECH-DESIGN («Inmutabilidad»: sello propio de la sección odontológica y su límite frente a la huella de la
      atención) y nota en `historias-clinicas/design.md`, D5, sobre las tablas hijas si 0.5 lo decide. Verificar los enlaces.
- [ ] 4.5 Revisión con el agente `code-review` de las funciones y disparador sobre `atenciones` (sello, huella, bloqueo,
      que no cambie el comportamiento de H6 para otras profesiones). Verificar que los hallazgos quedan resueltos o justificados.

## 5. Lectura derivada: odontograma actual y tratamientos pendientes

- [ ] 5.1 Migración `odontograma-lectura-derivada`: `odontograma_actual(paciente, hasta)` y
      `tratamientos_odontologicos_pendientes(paciente)`, ambas `SECURITY INVOKER` con `search_path` vacío y `EXECUTE` solo a
      `authenticated` (D3, D6). Devuelven la atención de origen, su fecha de firma y su autor. Verificar que se aplica y con
      `has_function_privilege` por rol.
- [ ] 5.2 Pruebas pgTAP `75_odontologia_reglas`, parte «derivación»: último firmado por pieza y cara, borradores ignorados, pieza
      completa que reemplaza caras (antes y después), consulta «a una fecha», «sin registro» frente a `sin_hallazgo`, dos borradores
      firmados en orden inverso, pendientes (indicado sin cumplir, cumplido, de otro paciente); **cero filas** para un profesional
      sin el paciente a cargo, administrativo, enfermera, paciente, sin rol y `anonymous`. Medir con `EXPLAIN ANALYZE` sobre datos de
      demostración y anotar el resultado; añadir un índice solo si no cabe en el presupuesto. Verificar que pasan.
- [ ] 5.3 Documentar: TECH-DESIGN (funciones de lectura derivada) y `docs/pruebas-sql.md`. Verificar los enlaces.
- [ ] 5.4 Revisión con el agente `code-review` de las dos funciones (que respetan RLS, no exponen pacientes ajenos, ordenación y
      desempate). Verificar que los hallazgos quedan resueltos o justificados.

## 6. Copia de la historia (H6d)

- [ ] 6.1 Clasificar las tablas nuevas y escribir su sección en el compilado de la copia: migración `copia-seccion-odontologia` con
      `copia_seccion_odontologia(paciente, corte)` (`SECURITY DEFINER`, `search_path` vacío, `EXECUTE` **revocado** a todo rol de
      usuario) y el `create or replace` del compilado partiendo de su definición vigente (`pg_get_functiondef`), de modo que no pise
      las secciones de otros changes. Clasificación: `odontogramas`, `odontograma_registros`, `odontograma_tratamientos` y
      `radiografias_odontologicas` incluidas; `catalogo_odontologico` excluida, con su razón en la lista de exclusiones de la prueba de
      cobertura de H6d. Verificar que la migración se aplica y que el compilado conserva las secciones previas.
- [ ] 6.2 Pruebas pgTAP (`75_odontologia_reglas` y la prueba de cobertura de H6d, su tarea 3.4): con un texto centinela en `detalle`,
      el compilado lo devuelve y la solicitud, `accesos_historia` y `auditoria` no lo contienen; solo atenciones firmadas hasta el
      corte (sin borradores), odontograma actual al corte, radiografía con adjunto anulado marcada; el administrativo no lee las
      tablas directamente y no ejecuta `copia_seccion_odontologia()`; la prueba de cobertura **pasa con las cinco tablas
      clasificadas y falla** si se quita la sección o la exclusión. Verificar que pasan y que el caso de falla se detecta.
- [ ] 6.3 Documentar: TECH-DESIGN («Seguridad»: la sección odontológica en la copia) y `docs/pruebas-sql.md`. Verificar los enlaces.
- [ ] 6.4 Revisión con el agente `code-review` de la sección y del reemplazo del compilado (que no persista contenido, `EXECUTE`,
      que no pise otras secciones). Verificar que los hallazgos quedan resueltos o justificados.

## 7. Lógica de aplicación

- [ ] 7.1 `lib/odontologia/piezas.ts`: estructura FDI, nombres en español, orden por arco, caras y `denticionDePieza`, con
      `tests/odontologia/piezas.test.ts` (`node:test`): las 52 piezas válidas, las inválidas rechazadas, nombres y dentición. Verificar
      que pasan y que fallan al alterar una pieza a propósito.
- [ ] 7.2 `lib/schemas/odontologia.ts` (Zod 3, `.strict()`, texto con contenido que rechaza invisibles y `U+0000`, NFC, límites de
      D14, el cliente envía `codigo` y no `id`, dentición contra piezas, caras según el alcance) y `tests/odontologia/esquemas.test.ts`.
      Verificar que pasan y que una clave ajena (por ejemplo `paciente_id` o `huella`) se rechaza.
- [ ] 7.3 `lib/odontologia/errores.ts` con el mapeo de D13 (`HC050` a `HC056`, `HC002`, `HC004`, `23505`, `23514`, `42501`, otros) y
      `tests/odontologia/errores.test.ts`. Verificar que cada fila de la tabla tiene su prueba y que ningún mensaje contiene texto de
      la base.
- [ ] 7.4 `lib/odontologia/repositorio.ts`: todo el SQL contra las cinco tablas y sus funciones, con ejecutor inyectable; las
      lecturas exigen `TransaccionConAcceso`; las escrituras empiezan con `exigir_modo_clinico()`. `tests/odontologia/acceso-unico.test.ts`
      recorre `app/`, `lib/` y `components/` y falla si otro archivo contiene SQL contra esas tablas. Pruebas con ejecutor simulado:
      orden de sentencias, que el modo va primero y que sin registro de acceso no se devuelve contenido. Verificar que pasan y que
      `acceso-unico` falla al añadir una consulta en otro archivo (revertida).
- [ ] 7.5 `lib/historias/odontologia.ts`: lecturas de la sección dentro de la transacción de acceso de H6 (modo → registro en
      `accesos_historia` → lecturas), con pruebas de ejecutor simulado: si el registro falla no se devuelve nada. Verificar que pasan.
- [ ] 7.6 Acciones `guardarSeccionOdontologica` (reemplaza la sección del borrador en una transacción: modo → borrar hijos →
      cabecera → insertar cada grupo con `jsonb_to_recordset`), `vincularRadiografia` y `desvincularRadiografia`, y su composición con
      «guardar y firmar en un paso» de H6 según 0.5 (Zod en servidor → repositorio → mapeo; resultado tipado). Pruebas de ejecutor
      simulado: una entrada inválida no llega a la base, un error de la base se traduce sin texto crudo y el catálogo se relee en el
      servidor. Verificar que pasan.
- [ ] 7.7 Documentar la tabla de Server Actions de TECH-DESIGN y el mapeo de errores. Verificar los enlaces.
- [ ] 7.8 Revisión con el agente `code-review` de las acciones y del repositorio (validación en servidor, mapeo de errores, fugas de
      existencia, `TransaccionConAcceso`, profesión tomada de la base). Verificar que los hallazgos quedan resueltos o justificados.

## 8. Radiografías

- [ ] 8.1 Interfaz y flujo de vínculo: elegir un adjunto vigente subido por el propio odontólogo, indicar tipo, piezas y fecha de toma;
      quitar el vínculo en un borrador; mostrar «archivo anulado» si el adjunto se anuló; abrir el archivo por la ruta auditada de
      adjuntos de H6. Verificar con `npm run typecheck`, `npm run lint` y un recorrido manual con un PDF sintético.
- [ ] 8.2 Pruebas `node:test` y E2E de la radiografía con adjuntos PDF: vincular, adjunto de otro paciente rechazado, anulado
      rechazado, ya vinculado rechazado, otro profesional a cargo ve el metadato y no vincula. Se omiten con aviso si falta
      `BLOB_READ_WRITE_TOKEN`. Verificar que pasan.
- [ ] 8.3 Si 0.2 resolvió P-15: ajustar este grupo al formato decidido (sin cambios de esquema si se amplía `adjuntos_historia`; una
      migración que repunta `adjunto_id` si se crea un almacén aparte). Sin decisión, anotar en el PR que la parte de imágenes sigue
      abierta. Verificar que el PR declara el estado de P-15.
- [ ] 8.4 Revisión con el agente `code-review` del flujo de vínculo (adjunto ajeno, anulado, archivo servido solo por la ruta
      auditada). Verificar que los hallazgos quedan resueltos o justificados.

## 9. Pantallas

- [ ] 9.1 Documentar el componente `Odontograma` en `docs/DESIGN.md` (estados con texto y símbolo, solo tokens, vista en lista) y
      regenerar el tema con `npm run tema`. Verificar que `npm run tema:comprobar` pasa y que no hay colores literales.
- [ ] 9.2 `components/clinica/odontograma/`: dibujo por arco en orden FDI (una pieza = un botón con foco rodante y nombre accesible),
      panel de pieza y cara, vista en lista equivalente e insignias de hallazgo. Mostrar en la galería `/guia-de-estilo`. Verificar con
      pruebas de componente y recorrido por teclado.
- [ ] 9.3 Editor en el formulario de atención del odontólogo: sección que aparece con la plantilla de Odontología, declaración
      `registra_seccion_odontologica`, dentición propuesta desde la última atención firmada, hallazgos, tratamientos (con «registrar
      el hallazgo resultante» al marcar realizado, sin automatismo) y radiografías; errores del servidor por campo sin vaciar lo
      escrito. Verificar con `npm run typecheck` y un recorrido manual con datos de demostración.
- [ ] 9.4 Vista de lectura `app/profesional/pacientes/[pacienteId]/odontograma/page.tsx`: odontograma actual con la atención de
      origen de cada celda y el aviso de addendas, tratamientos pendientes y radiografías; solo el odontólogo ve «Registrar». Verificar
      que un médico a cargo la ve sin controles de edición.
- [ ] 9.5 Rutas protegidas con `auth.protect()`, `exigirRol("profesional")` y MFA (ayudante de guardia de H6), `Cache-Control: private,
      no-store` en `next.config.ts`, título fijo «Odontograma», direcciones solo con `uuid`, y activar el destino en
      `lib/ui/navegacion.ts`. Verificar con `curl -I` contra `next start` y con la regla de ESLint de protección de Clerk.
- [ ] 9.6 E2E `e2e/odontologia.spec.ts` (con la base sembrada según `docs/datos-demo.md`; si no hay datos se omite con un mensaje
      explícito): el odontólogo registra y firma; el actual cambia; otro profesional a cargo lo ve sin edición; administrativo,
      enfermera y paciente no abren la ruta; sin MFA redirige; corrección por addenda y atención nueva. Verificar que pasan.
- [ ] 9.7 Accesibilidad: axe sobre la vista de lectura y el editor, recorrido con lector de pantalla y a 200 % de zoom; el estado nunca
      depende solo del color. Verificar que axe no reporta violaciones y anotar el recorrido manual en el PR.
- [ ] 9.8 Revisión con el agente `code-review` de las rutas y pantallas (canales laterales, caché, títulos, que ninguna pantalla
      reciba más de lo que su rol puede ver). Verificar que los hallazgos quedan resueltos o justificados.

## 10. Datos de demostración

- [ ] 10.1 Ampliar `scripts/sembrar-datos-demo.ts` con odontogramas sintéticos para pacientes `@demo.invalid`: un adulto, un niño con
      dentición infantil, uno con dentición mixta, con hallazgos, un tratamiento indicado pendiente y otro cumplido, y una radiografía
      PDF. Las atenciones se insertan **sin firmar**, se cargan sus registros y se firman (como dueño el sello corre igual). Verificar
      que sembrar dos veces no duplica filas, que el script se rechaza en modo `real` y que `verificar_odontograma()` da verdadero.
- [ ] 10.2 Documentar los datos en `docs/datos-demo.md`, `docs/pruebas-sql.md` y `docs/pruebas-e2e.md` (cuentas de odontólogo y de
      otro profesional a cargo). Verificar los enlaces.

## 11. Integración y cierre

- [ ] 11.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run tema:comprobar`,
      `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa. Verificar que todo pasa
      y que el PR trae el cuadro de cada requisito de las cuatro especificaciones con la prueba que lo cubre.
- [ ] 11.2 Verificación por mutación (D15): en un branch de desarrollo, debilitar a propósito cada política, disparador y función
      nuevos y comprobar que al menos una prueba negativa falla; revertir. Elementos: quitar `profesion_actual() = 'odontologo'` de la
      política de `INSERT`; quitar la comprobación de profesión de `_20_proteger` (cada barrera por separado); omitir la comprobación
      de atención sin firmar; quitar el `for share`; quitar `_10_completar` (paciente del cliente); quitar
      `profesional_tiene_paciente` de la política de `SELECT`; permitir `UPDATE` en el catálogo; quitar la unicidad de pieza y cara;
      aceptar piezas de otra dentición; omitir la comprobación de `reemplaza_caras` al escribir y al derivar; incluir borradores en
      `odontograma_actual`; saltar la coherencia con la declaración al firmar; dejar de calcular la huella; quitar los controles de
      `HC055` y `HC056`; poner `exige_profesion` en `NULL` en la plantilla v1 (debe fallar la prueba de 2.2); dar `EXECUTE` de `copia_seccion_odontologia()` a
      `authenticated`; quitar la sección del compilado; quitar la guarda de datos reales. Verificar anotando en el PR la mutación y la
      prueba que falló, una por elemento.
- [ ] 11.3 Prueba de usabilidad de la carga del odontograma con al menos un odontólogo (si no es posible, un recorrido cronometrado por
      el equipo con una atención típica, dejándolo registrado como sustituto): medir el tiempo y los errores. Verificar que el
      resultado consta en el PR y que, si es largo, se anotan los ajustes de interfaz acordados.
- [ ] 11.4 Barrido de coherencia entre documentos: `CLAUDE.md` (estado), `openspec/config.yaml`, PRD (alcance de Odontología),
      TECH-DESIGN (modelo de datos, matriz, rutas, acciones, P-15 y la dependencia de H6i), ADR tocadas (0029 y, si 0.7 se acepta, la
      común), `docs/datos-demo.md`, `docs/pruebas-sql.md`, `docs/pruebas-e2e.md`, `docs/DESIGN.md` y `docs/BACKLOG.md`. Verificar con
      una búsqueda que los textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 11.5 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, migraciones, disparadores sobre
      `atenciones`, funciones que entregan contenido, acciones y rutas) con el checklist más estricto, y corrección de sus hallazgos.
      Verificar que no quedan hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la revisión humana
      aparte que exige el proposal.
- [ ] 11.6 Confirmar que ninguna migración ni variable de entorno del change fija el modo `real`, que el PR declara expresamente que
      H6e **no entra en producción con datos reales** mientras P-1, la acreditación ante el MINSA, el registro ante la ANPD y los
      puntos abiertos de 0.2 a 0.4 sigan abiertos, y que el contenido clínico sigue marcado `REVISAR`. Verificar con una búsqueda de
      `modo` y `real` en `migrations/` y con la prueba pgTAP del modo por defecto en verde.
- [ ] 11.7 Tras el merge, comprobar que el despliegue de producción está READY, que `CLINICA_MODO_DATOS=demostracion` sigue definida y
      que la vista del odontograma carga con los datos de demostración; sembrar odontogramas en producción solo si el usuario lo pide.
      Verificar con la URL pública y con `select public.modo_datos_clinicos()` en el branch de producción.
