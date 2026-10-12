# Tasks

> **Nombres:** sujetos a ADR-0030 (aún no aceptada); si se rechaza, léase `medico`/`medicos` donde dice `profesional`/`profesionales`.

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto:** crea seis tablas clínicas con política
  propia, dos vistas, funciones y disparadores `SECURITY DEFINER` y un disparador de sello sobre `atenciones` (`atenciones_fisioterapia_20_sellar`)
  más uno sobre `planes_de_sesiones`. Cada grupo que cambia políticas, funciones `SECURITY DEFINER`, disparadores o rutas
  que sirven contenido clínico termina con una tarea de **revisión con el agente `code-review`** y no se da por cerrado hasta corregir o
  justificar por escrito sus hallazgos.
- **Datos reales: prohibidos.** Mientras la decisión legal P-1 siga abierta no se carga ningún dato clínico real. Los datos sintéticos de
  demostración (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo `real` (H6, D1).
- **Contenido clínico propuesto:** los catálogos, los motivos de alta, los planes sugeridos, la plantilla y el sentido de mejora de
  cada instrumento son propuesta `REVISAR` hasta que los fisioterapeutas de la clínica los validen (0.4). **Las licencias de los cuatro
  tests funcionales no están verificadas:** ninguna tarea copia ni reproduce un ítem de un instrumento hasta que 0.3 lo permita.
- **Recetas e imágenes:** este change no emite recetas (H6c) ni diseña el almacenamiento de imágenes (P-15); ninguna tarea los toca.
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa; antes de cerrarla se confirma que RLS
  quedó activada (`relrowsecurity`) y que `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos nuevos en `migrations/*.sql` (se
  crean con `npm run migrate -- create`); **nunca se edita una ya aplicada**, y las secciones `down` quedan vacías (ADR-0027). El número de
  prueba pgTAP (76, en dos archivos con ese prefijo) y los códigos SQLSTATE (`HC060` a `HC069`) son sugeridos: comprobar al aplicar que ningún
  otro change los tomó.
- Toda función `SECURITY DEFINER` lleva `search_path` vacío, `REVOKE ... FROM PUBLIC` y `EXECUTE` solo a quien corresponde (las funciones
  de disparador y `copia_seccion_fisioterapia()` a nadie), y ningún parámetro que identifique al actor.
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en `production`**.
  Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Textos de interfaz y errores en español (con «usted»);
  fechas en `America/Lima`, `timestamptz` en la base.
- Las tareas de pantalla (grupo 9) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si no está aplicado, se avanza con los
  grupos 0 a 8 y se retoma. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de aplicar el change; este
  change no los modifica al proponerse.
- Los disparadores de las tablas hijas llevan los nombres con prefijo numérico de `design.md` D8 (`fisioterapia_10_completar`,
  `_20_proteger`, `_30_validar`, `_40_modo`, `_50_sellar` en las notas y `_90_auditoria`) para fijar su orden de ejecución.

## 0. Decisiones previas y verificaciones

- [ ] 0.1 Confirmar que están aplicados (o en la rama base) H2c `profesionales-de-la-salud` (`profesion_actual()`,
      `profesional_tiene_paciente()`), H6 `historias-clinicas` (plantillas y `datos_especialidad`, sello y huella, `accesos_historia`, guarda de
      modo, `lib/historias/guardia.ts`), H6b `triaje-y-derivacion` (`registrar_auditoria_sin_contenido()`), H6i `mecanismos-clinicos-comunes`
      (planes de sesiones, instrumentos y aplicaciones) y, para el grupo 7, H6d `copia-de-historia-clinica`; aplicar las migraciones en un
      branch de desarrollo de Neon y correr `npm run test:pgtap`. Verificar que la línea base está en verde y anotar el número de pruebas en el
      PR; si falta H6d, anotar que el grupo 7 queda en espera.
- [ ] 0.2 Releer `design.md` D1 y D11 (ya contrastados con el H6i escrito y validado del 2026-10-12) contra el change H6i **tal como quedó aplicado o archivado**: nombres de `planes_de_sesiones` (`atencion_id`,
      `protocolo_clave`, `area`, `estado`), `sesiones_del_plan` (estados), `planes_de_sesiones_con_contador` (`asistidas`, `restantes`),
      `crear_plan_de_sesiones()` (`HC090`, `HC094`) y `cerrar_plan_de_sesiones(p_plan, p_estado, p_motivo)` (motivos de cierre), `instrumentos_evaluacion` (`clave`, `version`, `vigente`,
      escalas), `aplicaciones_instrumento` (`instrumento_id`, `atencion_id`, `puntajes`, `estado`) y `registrar_aplicacion_instrumento()`. Ajustar la tabla de
      D1 con `openspec-update-change` si algo difiere. Verificar que cada nombre usado en este change existe con ese nombre y tipo, y que
      ningún otro change tomó `HC060` a `HC069` ni el número 76.
- [ ] 0.3 **Licencias** (P-18): para cada uno de Oswestry (lumbar), NDI (cuello), QuickDASH (miembro superior) y Lysholm (rodilla), obtener la
      licencia o el permiso de uso **del texto exacto y del idioma que se cargaría**, la fuente (autor, año) y la versión validada en español,
      si existe. Anotar en `docs/investigacion-marco-legal-y-saniape.md` (con URL y fecha) lo verificado y lo que no, y registrar por
      instrumento «cargable» o «no cargable». Un instrumento sin licencia verificada **no se carga** y su zona queda sin test funcional (el
      diseño lo tolera). Verificar que la constancia existe por cada uno de los cuatro y que `design.md` D6 no cita ningún ítem ni puntuación
      que no esté en la fuente verificada.
- [ ] 0.4 Revisar con los fisioterapeutas de la clínica (o, si no hay acceso, dejarlo escrito como supuesto sin validar y avisar al usuario):
      las nueve regiones, los movimientos de goniometría con sus rangos de grados (incluidos negativos), los grupos musculares, las pruebas
      especiales, el catálogo de planes (sesiones y frecuencia sugeridas), los seis motivos de alta, el sentido de mejora de cada
      instrumento y las reglas de D8 (repetir todas las mediciones, objetivo obligatorio, plan cerrado antes del alta). Verificar que las
      respuestas o el supuesto constan en `design.md` (D4, D6, D11 y Preguntas abiertas) y que la migración de datos del grupo 1 las refleja.
- [ ] 0.5 Pedir al usuario las **decisiones abiertas**: quién recibe un informe de alta y en qué forma; si el fisioterapeuta registra un
      diagnóstico CIE-10; si se admite atender sin plan de sesiones; y, para H6c, si los fisioterapeutas recetan (este change no lo
      diseña). Coordinar además, y anotar en `design.md`: con H6, el contrato del repositorio para componer «guardar y firmar en un paso» con
      la sección de la evaluación (D15), qué es `TransaccionConAcceso`, el orden de migraciones de la plantilla y la pregunta de si su huella
      `v1` puede cubrir tablas hijas (D8, alternativa C); con H6b, `registrar_auditoria_sin_contenido()`; con H6d, el enganche de la sección y
      que su prueba de cobertura busque también en las funciones `copia_seccion_*`; con H6e y H6h, el patrón de tablas hijas selladas y el
      orden de `create or replace` del compilado; con H2c, la compatibilidad profesión–especialidad; con H3 y H2b, `lib/ui/navegacion.ts`,
      `components/clinica/` y `docs/DESIGN.md`. Verificar que las respuestas o los supuestos constan con fecha y que las notas existen.
- [ ] 0.6 Verificaciones técnicas previas, anotadas en `design.md`: (a) en un branch de desarrollo, con dos sesiones `pg` como
      `authenticated`, que `select … for share` sobre `atenciones` espera una firma en curso y luego no devuelve la fila firmada (D8); si no,
      usar un ayudante `SECURITY DEFINER` sin parámetro de rol; (b) que el validador de H6 acepta una plantilla con solo los tipos `opcion` y
      `texto` de D2; (c) los nombres y el orden de los disparadores de `atenciones` de H6 (`atenciones_inmutables`, validación de datos de
      especialidad, sello y huella) y de H6e frente a `atenciones_fisioterapia_20_sellar` y frente al validador de H6 que impone `exige_profesion` (D15 de `historias-clinicas`); (d) que
      `registrar_auditoria_sin_contenido()` cubre `DELETE` y funciona con tablas cuya clave se llama `id`; (e) la firma de
      `exigir_paciente_admisible()` (lee `new.paciente_id`); (f) que un disparador `BEFORE INSERT` sobre `planes_de_sesiones` de otro change
      puede añadirse sin tocar su función `crear_plan_de_sesiones()`. Verificar que cada punto tiene su resultado escrito y que una diferencia
      con lo supuesto ajusta `design.md` antes de escribir SQL.
- [ ] 0.7 Dejar al orquestador la propuesta de una ADR común «tablas hijas de la atención: inmutabilidad y sello» (Odontología,
      Fisioterapia y Podología repiten el patrón; este change no crea una ADR propia: ADR-0029 y TECH-DESIGN prevén las tablas propias).
      Verificar que la propuesta consta en el informe del PR.

## 1. Catálogo, plantilla y datos

- [ ] 1.1 Migración `catalogo-fisioterapia`: tabla `catalogo_fisioterapia` (llave `(tipo, clave)`, `CHECK` de formato de `clave` y de las
      columnas que corresponden a cada `tipo`, `lateral`, `grados_min`/`grados_max`, `instrumento_*`, `sesiones_sugeridas`,
      `frecuencia_sugerida_dias`, `vigente`), RLS activada, `GRANT select` a `authenticated`, política `rol_actual() = 'profesional'`, **sin**
      escritura para ningún rol, y disparador que rechaza —incluso al dueño— el cambio de `tipo`, `clave`, `lateral`, `grados_*`,
      `sesiones_sugeridas` y `frecuencia_sugerida_dias`, y que solo admite pasar de nulo a un valor, una vez, las columnas `instrumento_*`.
      Verificar con `npm run migrate -- up` en un branch de desarrollo, con `relrowsecurity` de la tabla y con `has_table_privilege` por rol.
- [ ] 1.2 Migración de datos `catalogo-fisioterapia-datos` (idempotente, `on conflict (tipo, clave) do nothing`) con las regiones,
      movimientos, grupos musculares, pruebas especiales y planes de D4 y D11 ajustados por 0.4, y un encabezado que declare que es una
      **propuesta de ingeniería pendiente de revisión por los fisioterapeutas**, que no reproduce ningún instrumento y que no fija
      `instrumento_*`. Se escribe **después** de 0.4. Verificar que aplicarla dos veces no duplica filas y que el encabezado contiene esa
      declaración (búsqueda en el archivo).
- [ ] 1.3 Migración `plantilla-fisioterapia`: inserta, si falta, la especialidad «Fisioterapia»; la función `especialidad_fisioterapia_id()`
      (`STABLE`, `SECURITY DEFINER`, `search_path` vacío); y la plantilla `Fisioterapia v1` de D2 en `plantillas_clinicas` (idempotente), con
      `exige_profesion = 'fisioterapeuta'` (columna que añade D15 de `historias-clinicas`; este change solo fija el dato y no crea disparador
      propio) y las opciones de `zona` tomadas de las regiones del catálogo. Verificar que aplicarla dos veces no duplica y que existe exactamente una
      especialidad «Fisioterapia».
- [ ] 1.4 Prueba pgTAP **negativa** `tests/pgtap/76_fisioterapia_rls.test.sql`, parte «catálogo»: RLS activada; todo profesional lee el
      catálogo; administrativo, enfermera, paciente y sin rol no leen (cero filas); `has_table_privilege` falso de `select` para `anonymous`,
      `cron_notificaciones` y `sync_identidad`, y de `insert`, `update` y `delete` para todos los roles de usuario; un `UPDATE` que cambia la
      lateralidad o el rango de una entrada falla incluso como dueño, `vigente` sí puede cambiarse como dueño y `instrumento_clave` solo pasa
      de nulo a un valor una vez. Añadir al ejecutor `scripts/ejecutar-pgtap.ts` las identidades `fisioterapeuta_a`, `fisioterapeuta_b`
      (colega a cargo, no autor) y `fisioterapeuta_c` (sin el paciente a cargo), y —si H6e no las creó— `odontologo_a`, `psicologo_a`,
      `podologo_a` y `medico_a`. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 1.5 En `tests/pgtap/76_fisioterapia_reglas.test.sql`, parte «plantilla»: la plantilla existe, es de la especialidad Fisioterapia y la versión vigente tiene
      `exige_profesion = 'fisioterapeuta'` (se afirma sobre el dato real); sus
      opciones de `zona` coinciden con las claves `region` vigentes del catálogo (falla si divergen); un médico, odontólogo, psicólogo o
      podólogo no puede usar la plantilla y un fisioterapeuta registrado en otra especialidad tampoco (ambos rechazos son `HC005` de H6, D15 de `historias-clinicas`); `tipo_registro`
      y `zona` obligatorios; el fisioterapeuta puede registrar una atención sin plantilla. Verificar que pasa.
- [ ] 1.6 Documentar: TECH-DESIGN («Modelo de datos»: catálogo y plantilla; matriz de acceso) y `docs/pruebas-sql.md` (prueba 76, parte
      catálogo y plantilla). Verificar que los enlaces relativos resuelven y que los textos no contradicen a `CLAUDE.md`.
- [ ] 1.7 Revisión con el agente `code-review` de las migraciones (RLS del catálogo, protección del significado, plantilla, función de la
      especialidad). Verificar que cada hallazgo se corrige o se justifica por escrito en el PR.

## 2. Episodios, cabecera, mediciones y objetivos

- [ ] 2.1 Migración `evaluacion-fisioterapia-tablas`: tipos `tipo_medicion_fisioterapia`, `lado_fisioterapia` y
      `estado_episodio_fisioterapia`; tablas `episodios_fisioterapia` (índice único parcial `(paciente_id, zona) where estado = 'abierto'`,
      `CHECK` de coherencia de estado), `evaluaciones_fisioterapia` (`CHECK` de omisiones y de `huella`/`sellado_en` juntos),
      `mediciones_fisioterapia` (columna generada `catalogo_tipo`, clave foránea compuesta al catálogo, `unique (atencion_id, tipo, clave,
      lado)`, `CHECK` de forma por tipo) y `objetivos_fisioterapia` (clave foránea compuesta a la medición del mismo indicador y
      evaluación, `ON DELETE RESTRICT`, uno por indicador); RLS activada en las cuatro; `GRANT` por columna de D13; políticas de lectura
      (`rol_actual() = 'profesional' and profesional_tiene_paciente(paciente_id)`) y de escritura (`profesion_actual() = 'fisioterapeuta'`,
      atención propia y sin firmar); y los disparadores `fisioterapia_10_completar` (fija `paciente_id`, `profesional_id`),
      `_20_proteger` (profesión `HC060` cuando `rol_actual()` no es nulo; atención sin firmar para todos, `HC061`, con `select … for share`;
      `DELETE` solo de borradores; episodios: solo `abierto → cerrado`), `_30_validar` (catálogo, lateralidad, rangos, test funcional,
      meta: `HC065`, `HC066`; episodio válido: `HC063`), `_40_modo` (`exigir_paciente_admisible()`) y `_90_auditoria`
      (`registrar_auditoria_sin_contenido()`). Verificar con `npm run migrate -- up`, con `relrowsecurity` de las cuatro y con
      `has_table_privilege` por rol.
- [ ] 2.2 Prueba pgTAP **negativa** de `episodios_fisioterapia` en `76_fisioterapia_rls`: RLS activada; el fisioterapeuta a cargo y los demás
      profesionales a cargo leen; **administrativo, enfermera, paciente (incluido el titular), sin rol, `anonymous`, `cron_notificaciones` y
      `sync_identidad`** sin filas o sin privilegio; un profesional sin el paciente a cargo, con asignación vencida o perfil inactivo, cero
      filas; `has_table_privilege` falso de `insert`, `update` y `delete` para todos; el dueño no puede borrar ni cambiar nada salvo
      `abierto → cerrado`; un segundo episodio abierto de la misma zona falla (`23505`) y de otra zona se admite. Verificar que pasa y que
      `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 2.3 Prueba pgTAP **negativa** de `evaluaciones_fisioterapia`: lectura por todo profesional a cargo (médico, odontólogo, psicólogo,
      podólogo, fisioterapeuta); escritura solo del fisioterapeuta autor con la atención sin firmar; negativos de **fisioterapeuta no autor
      (`HC061`)**, fisioterapeuta sin el paciente, con asignación vencida y con perfil inactivo, **médico, odontólogo, psicólogo y podólogo a
      cargo (política `42501` y disparador `HC060`, cada barrera por separado)**, administrativo, enfermera, paciente (titular incluido), sin
      rol, `anonymous`, `cron_notificaciones` y `sync_identidad`; `paciente_id`, `profesional_id`, `huella` y `sellado_en` no se pueden enviar
      (privilegio de columna); `columns_are` exacto; atención firmada: nada se inserta, actualiza ni borra, ni como dueño. Verificar que pasa.
- [ ] 2.4 Prueba pgTAP **negativa** de `mediciones_fisioterapia`: los mismos negativos por rol y por profesión que 2.3; `UPDATE` solo de
      `valor` y `positiva`; `DELETE` solo de filas de un borrador; `columns_are` exacto; el cliente no puede enviar `paciente_id`; una medición
      de una atención de otro paciente falla. Verificar que pasa.
- [ ] 2.5 Prueba pgTAP **negativa** de `objetivos_fisioterapia`: los mismos negativos por rol y por profesión; la clave foránea compuesta
      rechaza un objetivo sobre una medición que no está en la misma evaluación (también como dueño) y el borrado de una medición con
      objetivo (`RESTRICT`); `UPDATE` solo de `valor_meta` y `descripcion`; `columns_are` exacto. Verificar que pasa.
- [ ] 2.6 En `76_fisioterapia_reglas`, parte «mediciones»: cada tipo en su límite (dolor 0 y 10, fuerza 0 y 5, grados mínimo y máximo de la
      entrada) y fuera (-1, 11, 6, rangos, no enteros); lado según `lateral` (falta, sobra); prueba especial sin `positiva` o con `valor`;
      duplicado `(atención, tipo, clave, lado)`; clave inexistente o retirada; omisiones por tipo (con y sin motivo, dolor no omitible, fila de
      un tipo omitido); objetivo: meta que no mejora en cada sentido, duplicado, indicador no medido; test funcional (aplicación de otro
      paciente, de otra evaluación, anulada, ya usada, de otro instrumento, de otra área, valor distinto del puntaje, sin aplicación — con un
      instrumento sintético creado dentro de la transacción de prueba, nunca uno real); la profesión sale de la base y un claim `profesion`
      falso se ignora. Verificar que pasa.
- [ ] 2.7 Documentar: TECH-DESIGN («Modelo de datos»: las cuatro tablas, tipos, claves y matriz de acceso) y `docs/pruebas-sql.md` (prueba
      76, partes de tablas y mediciones). Verificar que los enlaces resuelven y que los textos no contradicen a `CLAUDE.md`.
- [ ] 2.8 Revisión con el agente `code-review` de la migración (RLS, `GRANT` por columna, disparadores, claves foráneas compuestas,
      `SECURITY DEFINER`, `select … for share`, criterio de sesión de usuario). Verificar que cada hallazgo se corrige o se justifica por
      escrito en el PR.

## 3. Sello, coherencia y apertura y cierre del episodio

- [ ] 3.1 Migración `evaluacion-fisioterapia-sello-y-coherencia`: `huella_evaluacion_fisioterapia(uuid)` y
      `verificar_evaluacion_fisioterapia(uuid)`; el disparador `atenciones_fisioterapia_20_sellar` (`BEFORE UPDATE OF firmada_en`,
      `WHEN old.firmada_en is null and new.firmada_en is not null`, `SECURITY DEFINER`: cabecera y tipo de registro, completitud por acto de
      D8, repetición de las mediciones iniciales, test funcional, plan activo en el alta, motivo de alta, huella y `sellado_en`, apertura del
      episodio en la inicial y cierre en el alta) con `HC062`, `HC063`, `HC064`; no modifica la fila de `atenciones` y no hay disparador de
      profesión–plantilla (lo impone `exige_profesion`, grupo 1). Verificar
      que se aplica, con `has_function_privilege` por rol y con la lista de disparadores de `atenciones` en `pg_trigger`.
- [ ] 3.2 Pruebas pgTAP en `76_fisioterapia_reglas`, parte «sello y actos»: evaluación inicial completa se firma, abre el episodio y sella; cada
      carencia (sin dolor, tipo sin filas ni omisión, sin objetivo, sin cabecera, test funcional faltante, con `motivo_alta`) rechaza la firma
      (`HC062`) y la atención sigue en borrador; reevaluación que repite todo, que omite un tipo con motivo, con una medición extra, con
      otro instrumento, sin repetir (`HC064`), de otra zona o de un episodio cerrado o ajeno (`HC063`); alta con cada motivo, `otro` sin detalle,
      por abandono sin mediciones, sin repetir, con plan activo (`HC062`) y cierre del episodio; segunda inicial de la misma zona (`HC063`); firma
      como dueño con la misma exigencia. Verificar que pasa.
- [ ] 3.3 Pruebas de la huella y de los disparadores: la huella es reproducible, no incluye `firmada_en`, y una alteración o desaparición de
      filas (con la protección desactivada solo dentro de la transacción de prueba) hace que `verificar_evaluacion_fisioterapia()` falle; el
      orden de los disparadores por `pg_trigger` y que el de `atenciones` existe con ese nombre; la prueba del bloqueo de 0.6(a) como
      prueba permanente de dos sesiones. Verificar que pasan.
- [ ] 3.4 Prueba de concurrencia `tests/concurrencia/31_fisioterapia_firma.test.ts` (sesiones `pg` reales como `authenticated`; número
      sugerido): dos firmas de una evaluación inicial de la misma zona (gana una, la otra recibe `HC063` y queda **un** episodio); edición de
      una medición contra la firma de su atención (`HC061` o la huella ya la incluye, nunca un sello desfasado); 20 rondas. Verificar que pasa
      y actualizar `docs/pruebas-sql.md`.
- [ ] 3.5 Documentar: TECH-DESIGN («Seguridad»: sello propio de la sección y sus límites; ciclo del episodio) y `docs/pruebas-sql.md` (prueba
      76, partes de sello). Verificar los enlaces.
- [ ] 3.6 Revisión con el agente `code-review` del disparador sobre `atenciones` (que no modifica la fila, reacciona solo a la
      plantilla de Fisioterapia, bloqueo, `SECURITY DEFINER`, completitud) y de la huella. Verificar que los hallazgos quedan resueltos o
      justificados.

## 4. Comparación en el tiempo

- [ ] 4.1 Migración `comparacion-fisioterapia`: las vistas `comparacion_fisioterapia` y `objetivos_estado_fisioterapia` con
      `security_invoker = true`, `GRANT SELECT` solo a `authenticated`, las columnas exactas de D10, solo evaluaciones firmadas, el sentido de
      mejora por tipo y por instrumento, `cambio_*` sin umbrales y `aplicacion_vigente`. Verificar con `npm run migrate -- up` y con
      `pg_class.reloptions` (`security_invoker=true`).
- [ ] 4.2 Pruebas pgTAP en `76_fisioterapia_reglas`, parte «comparación»: `columns_are` exacto de las dos vistas; los escenarios de
      `reevaluacion-y-alta-fisioterapia` con números (dolor 7 a 4, grados 90 a 110, fuerza 4 a 3, igual, prueba positiva a negativa, test con
      sentido mayor y con sentido menor); comparación con la inicial y con la anterior en un episodio con dos reevaluaciones; borradores
      excluidos; objetivo logrado, no logrado, sin reevaluación y fijado en una reevaluación; aplicación anulada después de firmar;
      **negativos**: profesional sin el paciente, administrativo, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y
      `sync_identidad` no ven filas ni tienen privilegio. Verificar que pasa.
- [ ] 4.3 Documentar la definición de «mejora» y su límite (sin umbrales) en TECH-DESIGN y `docs/pruebas-sql.md`. Verificar los enlaces.
- [ ] 4.4 Revisión con el agente `code-review` de las vistas (herencia de RLS, columnas, sentido, ausencia de interpretación clínica).
      Verificar que los hallazgos quedan resueltos o justificados.

## 5. Plan de sesiones y nota por sesión

- [ ] 5.1 Migración `notas-sesion-fisioterapia`: tabla `notas_sesion_fisioterapia` (RLS activada, `GRANT select` y `insert` por columna,
      políticas de lectura a cargo y de inserción de fisioterapeuta a cargo con `profesional_id = profesional_actual()`, índice único parcial
      de una nota vigente por `sesion_plan_id`, índice único de `corrige_a_id`, `CHECK` de campos y de corrección) y sus disparadores
      `_10_completar`, `_20_proteger` (rechaza `UPDATE` y `DELETE` para todo rol, `HC068`), `_30_validar` (episodio abierto `HC063`; sesión del
      plan del episodio, del mismo paciente, de `area = fisioterapia`, `agendada` o `asistida`; corrección solo del autor y una vez: `HC067`),
      `_40_modo`, `_50_sellar` (`huella_nota_sesion_fisioterapia()` con la hora del servidor) y `_90_auditoria`; y el disparador
      `planes_fisioterapia_10_episodio` sobre `planes_de_sesiones` (solo `area = fisioterapia`: protocolo del catálogo vigente, `atencion_id`
      de una evaluación firmada de un episodio abierto, `HC067`; que la atención sea del mismo paciente y del mismo profesional que crea el plan lo exige antes H6i, `HC094`). Verificar con `npm run migrate -- up`, con `relrowsecurity` y con que
      `crear_plan_de_sesiones()` de H6i sigue funcionando para las demás áreas.
- [ ] 5.2 Prueba pgTAP **negativa** de `notas_sesion_fisioterapia` en `76_fisioterapia_rls`: lectura por todo profesional a cargo;
      inserción solo del fisioterapeuta a cargo (de cobertura incluido); negativos de **médico, odontólogo, psicólogo y podólogo a cargo
      (`42501` y `HC060`)**, fisioterapeuta sin el paciente, con asignación vencida y con perfil inactivo, administrativo, enfermera, paciente
      (titular incluido), sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`; `UPDATE` y `DELETE` imposibles para todos incluido el
      dueño (`HC068`); `has_table_privilege` falso de `update` y `delete`; `columns_are` exacto; el cliente no puede enviar autor, hora,
      paciente ni huella. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 5.3 En `76_fisioterapia_reglas`, parte «plan y notas»: nota válida y sus cinco campos (vacíos, solo espacios, invisibles, dolor 11 y -1);
      sesión asistida y agendada aceptadas, `por_agendar`, de otro plan, de otro paciente y de otra área rechazadas; segunda nota vigente de la
      misma sesión rechazada; corrección con y sin motivo, de una nota ajena, segunda corrección de la misma nota y corrección de la
      corrección; episodio cerrado; la nota no cambia la sesión ni la cita; la huella es reproducible; plan: con protocolo del catálogo,
      protocolo ajeno o retirado, sin evaluación, con evaluación en borrador, con episodio cerrado, de otra profesión (`HC090` de H6i), con una evaluación firmada por otro fisioterapeuta (`HC094` de H6i) y planes en sucesión; el
      plan de otra área sigue sin pasar por este disparador. Verificar que pasa.
- [ ] 5.4 Prueba de concurrencia en `tests/concurrencia/31_fisioterapia_notas.test.ts`: dos notas de la misma sesión a la vez (una gana, la
      otra `HC067`) y dos correcciones de la misma nota; 20 rondas. Verificar que pasa y actualizar `docs/pruebas-sql.md`.
- [ ] 5.5 Documentar: TECH-DESIGN («Modelo de datos»: notas y la regla del plan de Fisioterapia; matriz de acceso) y `docs/pruebas-sql.md`.
      Verificar los enlaces y que se declara que el contador es de H6i.
- [ ] 5.6 Revisión con el agente `code-review` de la tabla de notas, del disparador sobre `planes_de_sesiones` (que no altera el
      comportamiento de otras áreas) y de la regla de corrección. Verificar que los hallazgos quedan resueltos o justificados.

## 6. Instrumentos del test funcional (condicional a las licencias)

- [ ] 6.1 Por cada instrumento marcado «cargable» en 0.3, una migración de datos `instrumento-<clave>` en el formato de H6i (D11), con la
      licencia citada en su encabezado (`fuente`, `licencia_referencia`, `licencia_verificada_el`, `uso_libre`), los ítems **tomados de la
      fuente verificada en el momento de aplicar** (este change no los contiene) y sus vectores de prueba. Verificar que la definición supera
      `instrumento_definicion_valida()`, que el catálogo no tiene ningún instrumento vigente sin referencia de licencia y que el puntaje de los
      vectores coincide en TypeScript y en SQL. Si ninguno es cargable, anotar «sin instrumentos» y cerrar la tarea sin migraciones.
- [ ] 6.2 Migración `zonas-con-instrumento`: fija `instrumento_clave`, `instrumento_escala` e `instrumento_mejor_si` (de nulo a un valor, una
      vez) solo para las zonas cuyo instrumento se cargó en 6.1. Verificar que una zona sin instrumento sigue sin exigir test funcional.
- [ ] 6.3 Pruebas en `76_fisioterapia_reglas`: cada zona con instrumento exige el test en la evaluación inicial; una zona sin instrumento no;
      la omisión declarada permite firmar; la reevaluación repite el instrumento; ningún instrumento vigente carece de referencia de licencia.
      Verificar que pasan.
- [ ] 6.4 Revisión con el agente `code-review` de las migraciones de instrumentos (licencia citada, ninguna reproducción no autorizada).
      Verificar que los hallazgos quedan resueltos o justificados.

## 7. Auditoría de lectura, copia de la historia y cobertura

- [ ] 7.1 Migración `copia-seccion-fisioterapia`: `copia_seccion_fisioterapia(paciente, corte)` (`SECURITY DEFINER`, `search_path` vacío,
      **`EXECUTE` revocado a todo rol de usuario**) con la sección de D14 (evaluaciones firmadas con mediciones y objetivos con etiquetas del
      catálogo, episodios y todas las notas con las corregidas marcadas; sin borradores), y el reemplazo del compilado de H6d (`create or
      replace`) **partiendo de su definición vigente** (`pg_get_functiondef`) para no pisar las secciones de los demás. Verificar que se aplica
      y que, llamada la copia como administrativo con un texto centinela en una nota, devuelve el centinela mientras un `select` directo sobre
      las tablas sigue dando cero filas.
- [ ] 7.2 Pruebas pgTAP en `76_fisioterapia_reglas`, parte «copia»: contenido incluido y excluido (evaluación firmada, borrador, reevaluación,
      nota, nota corregida marcada); `has_function_privilege` falso de `copia_seccion_fisioterapia()` para todo rol de usuario; la prueba de
      cobertura de H6d (su tarea 3.4) lista las cinco tablas de paciente y excluye el catálogo con su razón y **falla** si se retira una
      sección o si se añade temporalmente, dentro de la transacción de prueba, una tabla `*_fisioterapia` sin clasificar; el administrativo
      sigue sin leer las tablas directamente. Verificar que pasan.
- [ ] 7.3 Pruebas de auditoría: ni `auditoria` ni `accesos_historia` ni la solicitud de copia contienen un texto centinela de una nota, un
      motivo, una omisión o un objetivo; la escritura de cada tabla (incluido un `DELETE` de borrador) deja actor, acción, tabla e `id`; las
      lecturas del módulo dejan su fila de acceso (`historia` o `atencion`) en la misma transacción. Verificar que pasan.
- [ ] 7.4 Documentar: TECH-DESIGN («Seguridad»: la sección de Fisioterapia de la copia) y `docs/pruebas-sql.md`. Verificar los enlaces.
- [ ] 7.5 Revisión con el agente `code-review` de `copia_seccion_fisioterapia()` y del reemplazo del compilado. Verificar que los hallazgos
      quedan resueltos o justificados.

## 8. Lógica de aplicación

- [ ] 8.1 `lib/schemas/fisioterapia.ts` (Zod 3 `.strict()`: sección de la evaluación, objetivos, nota y corrección; el cliente envía claves del
      catálogo, nunca `id`; texto con contenido que rechaza invisibles y `U+0000`, NFC) con `tests/fisioterapia/esquemas.test.ts` (`node:test`):
      cada límite, fuera de rango, lado incoherente, clave ajena, vacíos y autor u hora enviados. Verificar que pasan y que fallan al relajar
      un rango a propósito.
- [ ] 8.2 `lib/fisioterapia/errores.ts` con el mapeo de D16 (`HC060`–`HC068`, `23505`, `23514`, `42501`, `HC002`, `HC004`, los de H6i `HC090`–`HC098`) y
      `tests/fisioterapia/errores.test.ts`. Verificar que cada fila de la tabla tiene su prueba y que ningún mensaje contiene texto de la base
      ni datos del paciente.
- [ ] 8.3 `lib/fisioterapia/repositorio.ts` (ejecutor inyectable; todo el SQL de las tablas y vistas) y `lib/historias/fisioterapia.ts` (lecturas
      con su registro de acceso; las funciones de lectura exigen un `TransaccionConAcceso` que solo crea `lib/historias/`); añadir el script
      `test:fisioterapia` a `package.json` y un paso a `ci.yml`. Pruebas con ejecutor simulado: el modo va primero, el acceso se registra antes de
      leer, un fallo del registro no devuelve contenido, ningún parámetro identifica al actor. Verificar que pasan y que el paso aparece en el PR.
- [ ] 8.4 `tests/fisioterapia/acceso-unico.test.ts`: falla si algún archivo de `app/`, `lib/` o `components/` fuera de `lib/fisioterapia/` y
      `lib/historias/` contiene SQL contra las seis tablas o las dos vistas, o contra las tablas de H6i (planes, sesiones, instrumentos y aplicaciones: esas solo en `lib/historias/planes.ts` e `instrumentos.ts`); ampliar la prueba de acceso único de H6. Verificar que pasa y que
      falla al añadir temporalmente una consulta en otro archivo (revertida).
- [ ] 8.5 Server Actions (`app/profesional/pacientes/[pacienteId]/fisioterapia/acciones.ts`): `guardarEvaluacionFisioterapia` (reemplaza la
      sección del borrador en una transacción: modo → borrar objetivos y mediciones → cabecera → insertar cada grupo con una sentencia
      `insert … select from jsonb_to_recordset`), `registrarNotaSesion`, `corregirNotaSesion` y `crearPlanFisioterapia` (llama a `crearPlan` de `lib/historias/planes.ts`, H6i, con una evaluación firmada por el propio fisioterapeuta); cada una con
      `exigirPersonal` (H3), Zod en el servidor, `ResultadoAccion` y el mapeo de 8.2; el servidor relee el catálogo bajo RLS y valida contra él.
      Pruebas `node:test` con ejecutor simulado: una entrada inválida no llega a la base, un cuerpo con autor, hora o profesión se rechaza, ningún
      error crudo escapa, un rol equivocado recibe `NO_AUTORIZADO`. Verificar que pasan.
- [ ] 8.6 Integración con H6: componer «guardar y firmar en un paso» (transacción de H6 + sección, `firmarAtencion` sin cambios) y, para el
      **alta**, cerrar antes el plan activo con `cerrarPlan` de H6i (`cerrar_plan_de_sesiones(p_plan, p_estado, p_motivo)`) en la misma transacción; para un plan nuevo, crearlo tras la
      firma de la evaluación. Pruebas con ejecutor simulado del orden de sentencias. Verificar que, si la firma falla, el plan sigue activo, y
      que, si H6 no entrega aún el contrato de 0.5, queda un seguimiento escrito sin romper este change.
- [ ] 8.7 Documentar: tabla de Server Actions de TECH-DESIGN y el mapa de errores (nota en ADR-0008). Verificar los enlaces.
- [ ] 8.8 Revisión con el agente `code-review` de las acciones y del repositorio (identidad por parámetro, fugas de existencia, orden de
      sentencias, mensajes). Verificar que los hallazgos quedan resueltos o justificados.

## 9. Pantallas

- [ ] 9.1 Componentes en `components/clinica/`: `SeccionEvaluacionFisioterapia` (tabla editable por tipo de medición, escala de dolor con valor
      en número y texto, precarga de la lista de la inicial en la reevaluación, omisiones con motivo, objetivos con su valor inicial),
      `ComparacionFisioterapia` (cambio dicho con texto además de icono, sin color de gravedad), `NotaSesionFormulario` y los de H6i
      (`ContadorDeSesiones`, `FormularioInstrumento`); documentarlos en `docs/DESIGN.md` y regenerar el tema (`npm run tema`). Verificar con
      `npm run typecheck`, `npm run lint`, `npm run tema:comprobar` y su aparición en `/guia-de-estilo`.
- [ ] 9.2 Rutas de lectura: `app/profesional/pacientes/[pacienteId]/fisioterapia/page.tsx` (episodios) y `.../episodios/[episodioId]/page.tsx`
      (plan y contador, objetivos y su estado, comparación, notas, «Sin nota», resumen de alta si está cerrado; la ve todo profesional a cargo y
      los botones de escritura solo el fisioterapeuta). Verificar con `npm run typecheck` y un recorrido manual con datos de demostración.
- [ ] 9.3 Sección de la evaluación dentro de `FormularioAtencion` de H6 cuando la plantilla es la de Fisioterapia (tipo de registro, zona o
      episodio, mediciones, test funcional, objetivos, motivo de alta), con errores por campo, el formulario conserva lo escrito y sin
      autoguardado. Verificar con `npm run typecheck` y recorrido manual; revisar el teclado y el lector de pantalla.
- [ ] 9.4 `.../episodios/[episodioId]/notas/nueva/page.tsx` (nota y corrección) y `.../plan/nuevo/page.tsx` (protocolo del catálogo con total y
      frecuencia sugeridos y ajustables). Verificar con `npm run typecheck` y recorrido manual.
- [ ] 9.5 Resumen de alta y comparación: la tabla antes/después y el estado de los objetivos; **sin botón de imprimir, exportar ni enviar**.
      Verificar con una prueba que no existe ninguna acción de entrega y con un recorrido manual.
- [ ] 9.6 `Cache-Control: private, no-store` en `/profesional/pacientes/:path*/fisioterapia/:path*`, páginas dinámicas, título fijo
      («Fisioterapia») y direcciones solo con `uuid`; lo de un tercero devuelve 404. Verificar con `curl -I` contra `next start` y una prueba E2E
      de cabeceras y título.
- [ ] 9.7 E2E (`e2e/fisioterapia-*.spec.ts`, con la base sembrada; se omite con un mensaje explícito si faltan datos o el TOTP del profesional):
      el fisioterapeuta evalúa y firma, crea el plan, anota sesiones, reevalúa (la lista precargada) y da el alta; el alta con plan activo
      muestra el error y el cierre en un paso lo resuelve; otro profesional a cargo lo ve sin controles de edición; la enfermera, el
      administrativo y el paciente no abren las rutas; una evaluación incompleta muestra errores y no firma; la corrección de una nota; axe
      sobre las pantallas; lector de pantalla y 200 % de zoom. Verificar que pasan.
- [ ] 9.8 Datos de demostración: ampliar `scripts/sembrar-datos-demo.ts` con pacientes `@demo.invalid` que tengan un episodio abierto con
      evaluación inicial, plan, notas y una reevaluación, y un episodio cerrado con su alta (creando el borrador, las filas y luego firmando),
      con instrumentos sintéticos `demo_` y no reales; y `docs/datos-demo.md`. Verificar que sembrar dos veces no duplica y que no toca
      producción sin `--incluir-produccion`.
- [ ] 9.9 Documentar los datos y cuentas que requieren las E2E en `docs/pruebas-e2e.md`. Verificar los enlaces.
- [ ] 9.10 Revisión con el agente `code-review` de las pantallas (qué muestra cada rol, canales laterales, ausencia de entrega del resumen).
      Verificar que los hallazgos quedan resueltos o justificados.

## 10. Integración y cierre

- [ ] 10.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:fisioterapia`, `npm run
      test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa. Verificar que todo pasa y que el PR trae el
      cuadro de cada requisito de las cuatro especificaciones con la prueba que lo cubre.
- [ ] 10.2 Verificación por mutación: en un branch de desarrollo, debilitar a propósito, una por una, y comprobar que al menos una prueba
      negativa falla (revertir cada vez): quitar `profesion_actual() = 'fisioterapeuta'` de la política de cada tabla de escritura; quitar la
      comprobación de profesión de `_20_proteger` y poner `exige_profesion` en `NULL` en la plantilla v1 (debe fallar la prueba de 1.5); abrir la política `SELECT` al administrativo, a
      la enfermera y al paciente; dar `GRANT insert` sobre `episodios_fisioterapia`; quitar el índice de episodio abierto; quitar el índice de
      una nota vigente por sesión y el de `corrige_a_id`; permitir `UPDATE` de una nota; quitar `select … for share`; quitar la exigencia de
      dolor, de objetivo, de la repetición de las mediciones y de plan cerrado en el alta; quitar la clave foránea compuesta de objetivos; quitar
      la igualdad entre el valor y el puntaje de la aplicación; quitar el rango de grados; quitar `security_invoker` de las vistas; quitar
      `exigir_paciente_admisible()` de una tabla; hacer ejecutable `copia_seccion_fisioterapia()` por `authenticated`; incluir borradores en la
      copia; retirar una tabla del compilado; quitar el sello de la huella. Verificar anotando en el PR la mutación y la prueba que falló,
      una por elemento.
- [ ] 10.3 Prueba de usabilidad con al menos un fisioterapeuta (si no es posible, un recorrido cronometrado por el equipo con un paciente
      típico, dejándolo registrado como sustituto): tiempo de una evaluación inicial con mediciones, de una nota por sesión (objetivo inicial
      de 60 segundos, a confirmar) y de una reevaluación con la lista precargada. Verificar que el resultado consta en el PR y que, si supera
      el objetivo, se anotan los ajustes de interfaz acordados.
- [ ] 10.4 Barrido de coherencia entre documentos: `CLAUDE.md` (estado y roles), TECH-DESIGN (tablas, funciones, rutas, matriz de acceso),
      ADR-0029 y la ADR común de 0.7, `docs/datos-demo.md`, `docs/pruebas-sql.md`, `docs/pruebas-e2e.md` y los changes H6, H6b, H6d, H6e e H6i
      afectados. Verificar con una búsqueda que los textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 10.5 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, funciones `SECURITY DEFINER`, disparadores sobre
      `atenciones` y `planes_de_sesiones`, Server Actions, copia) con el checklist más estricto, y corrección de sus hallazgos. Verificar que
      no quedan hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la revisión humana aparte que exige el
      proposal.
- [ ] 10.6 Confirmar que ninguna migración ni variable del change fija el modo `real` y que el PR declara expresamente que Fisioterapia **no
      entra en producción con datos reales** mientras P-1, la acreditación ante el MINSA y el registro ante la ANPD sigan abiertos. Verificar
      con una búsqueda de `modo` y `real` en `migrations/` y con la prueba pgTAP del modo por defecto de H6 en verde.
- [ ] 10.7 Tras el merge, comprobar que el despliegue de producción está READY, que las rutas responden con una sesión de prueba y que `select
      public.modo_datos_clinicos()` sigue en `demostracion`; sembrar la demostración en producción solo si el usuario lo pide. Verificar con la
      URL pública y el branch de producción.
