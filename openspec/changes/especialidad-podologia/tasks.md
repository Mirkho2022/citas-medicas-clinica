# Tasks

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md); si se rechaza, léase `medico`/`medicos`,
> `medico_actual()`, `medico_tiene_paciente()`, `atenciones.medico_id` y `app/medico/**`.

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto:** crea tablas clínicas nuevas, dos
  disparadores sobre `atenciones` que deciden quién usa la plantilla y cuándo se puede firmar, y una lectura comparativa de
  contenido clínico. Cada grupo que cambia políticas, funciones `SECURITY DEFINER`, disparadores o lecturas clínicas termina con
  una tarea de **revisión con el agente `code-review`** y no se da por cerrado hasta corregir o justificar por escrito sus
  hallazgos.
- **Datos reales: prohibidos.** La evaluación y las fotos son datos de salud: mientras la decisión legal P-1 siga abierta no se
  carga ningún dato clínico real. Los datos sintéticos de demostración (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo
  `real` (H6, D1).
- Toda tabla nueva en `public` (`protocolos_podologia`, `fotos_evolucion`) incluye su tarea de migración **y** su tarea de prueba
  pgTAP negativa (administrativo, profesional a cargo, otro profesional, enfermera, paciente, sin rol, `anonymous`,
  `cron_notificaciones`, `sync_identidad`, y por profesión); antes de cerrarla se confirma que RLS quedó activada
  (`relrowsecurity`) y que `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos nuevos en `migrations/*.sql`
  (`npm run migrate -- create`); **nunca se edita una ya aplicada** y las secciones `down` quedan vacías (ADR-0027). El número de
  prueba pgTAP (79, en dos archivos) y los SQLSTATE (`HC080`–`HC089`) son sugeridos: comprobar al aplicar que ningún otro change
  los tomó.
- Toda función `SECURITY DEFINER` de este change lleva `search_path` vacío, `REVOKE ... FROM PUBLIC` y `EXECUTE` solo a quien
  corresponde; `copia_seccion_podologia()` no tiene `EXECUTE` para ningún rol de usuario.
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en
  `production`**. Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Textos de interfaz y mensajes de
  error en español (usted); fechas en `America/Lima`, `timestamptz` en la base.
- Las tareas de pantalla (grupo 6) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si no está aplicado, se avanza con
  los grupos 0 a 5. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de aplicar el change; este
  change no los modifica al proponerse.
- **Orden de aplicación:** H2c, H6 y H6i deben estar migrados antes del grupo 1 (tarea 0.1); la tarea 4.1 espera además a H6d. La
  parte de **imágenes** del grupo 6 (tarea 6.5) espera la decisión P-15 (tarea 0.4); lo demás no depende de ella.

## 0. Decisiones previas y coordinación

- [ ] 0.1 Confirmar que H2c (`profesionales-de-la-salud`), H6 (`historias-clinicas`), H6b, H6i (`mecanismos-clinicos-comunes`) y, si
      ya está, H6d y H6e están migrados o en la rama base; aplicar sus migraciones en un branch de desarrollo de Neon y correr
      `npm run test:pgtap`. Anotar el número de pruebas en el PR y los **nombres reales** (`profesion_actual()`,
      `profesional_tiene_paciente()`, `atenciones.profesional_id`, tipos de `accesos_historia.tipo_acceso`, columnas de
      `adjuntos_historia`, identidades por profesión del ejecutor de pgTAP: cuáles existen y cuáles falta añadir, por ejemplo
      `podologo_b`). Verificar que la línea base está en verde y que `design.md` usa los nombres reales (si no, ajustarlo).
- [ ] 0.2 Confirmar con el change `mecanismos-clinicos-comunes` (H6i), cuando exista en disco, los cinco supuestos de `design.md` D4
      (el plan de un podólogo es del área Podología con su visibilidad; texto de descripción o protocolo; total y frecuencia al
      crear; operación de crear plan invocable; H6i clasifica sus tablas en la copia) y a quién le toca cablear el selector de
      protocolo en su formulario. Verificar que las respuestas constan en `design.md` D4; si alguno falla, ajustar solo esa sección
      y las tareas 5.5 y 6.1.
- [ ] 0.3 Preparar una **hoja de validación** para los podólogos de la clínica con los 34 campos de la plantilla (`design.md` D2),
      sus opciones, la numeración de los dedos, las zonas y etapas de las fotos y los cuatro protocolos con sus cifras y su fuente, y
      recoger sus correcciones y quién las validó. Si no hay acceso a ellos, dejar todo como supuesto sin validar y avisar al
      usuario. Verificar que el resultado (o el supuesto) consta en `design.md` D2 y D4 con fecha, y que la migración 1.1 se
      escribirá con los valores resultantes y la fuente de cada protocolo (URL y fecha de consulta).
- [ ] 0.4 Pedir al usuario la **decisión sobre imágenes como adjuntos (P-15)**: formatos, tamaño, miniaturas, cuota, retiro de
      metadatos de ubicación y qué hacer si la respuesta es «solo PDF». Verificar que la decisión consta en `design.md` D5 y en
      TECH-DESIGN (P-15), y que, si se admiten imágenes, quien la resuelve amplía D7 de `historias-clinicas` y ADR-0024 **antes** de
      la tarea 6.5. Sin decisión, el change avanza con PDF y la tarea 6.5 queda bloqueada.
- [ ] 0.5 Preparar la consulta al asesor legal con las preguntas de `design.md` («Open Questions»): consentimiento para fotografiar
      al paciente (forma, firma electrónica, retención) y si las fotos de los pies son datos sensibles; y, con el cliente, si un
      podólogo puede recetar (H6c). Verificar que cada pregunta consta en la consulta con su estado «pendiente» y que las
      respuestas se anotan con fecha en `design.md` y, si cambian una regla, se ajustan D5 o D10 y los escenarios afectados con
      `openspec-update-change`.
- [ ] 0.6 Verificaciones técnicas antes de escribir la migración, con dos sesiones en un branch de desarrollo: (a) los tipos `si_no`
      y `entero` del validador de H6 guardan un booleano y un número JSON; (b) el autor puede actualizar `datos_especialidad` de su
      borrador (para `fotos_registradas`); (c) `registrar_auditoria_sin_contenido()` cubre `DELETE`; (d) `especialidades.nombre` es
      único y existe o no la fila «Podología»; (e) `adjuntos_historia` tiene `subido_por`, `vigente` y la lectura bajo RLS descrita en
      D5; (f) el bloqueo `for share` de la atención espera a la firma concurrente (el mecanismo que usa H6e); (g) el orden
      alfabético de los disparadores de `atenciones` deja `atenciones_podologia_10_coherencia` y `_20_sellar` después de
      `atenciones_inmutables` y antes del sello y la huella de H6. Verificar anotando cada resultado en el PR; si (f) o (g) no se
      sostienen, se ajusta D3 o D6 antes de seguir.
- [ ] 0.7 Coordinar con los changes vecinos y anotar el resultado en `design.md`: con H6, un parámetro opcional de presentación para
      agrupar los campos de la plantilla por prefijo en `FormularioAtencion` (D2) y la ampliación del test de acceso único; con
      H6d, que la prueba de cobertura (su tarea 3.4) busque también en las funciones `copia_seccion_*` y que el reemplazo del
      compilado parta de la definición vigente; con H6e, los nombres compartidos (`TransaccionConAcceso`, `copia_seccion_*`,
      identidades de pgTAP); con H6c, que el podólogo sigue en «no, sin confirmar»; y con el orquestador, la **regla común de
      compatibilidad profesión–especialidad** (D6 y «Open Questions»). Verificar que las notas existen y que ningún otro change
      tomó `HC080` a `HC089` ni la prueba 79.

## 1. Plantilla de Podología y disparadores de la atención

- [ ] 1.1 Migración `plantilla-podologia` (parte 1): crear la especialidad «Podología» si falta (idempotente), la función
      `especialidad_podologia_id()` (`SECURITY DEFINER`, `search_path` vacío) y la plantilla **Podología v1** en
      `plantillas_clinicas` con las 34 claves de `design.md` D2 (con los valores validados en 0.3), vigente, `momento` y
      `fotos_registradas` obligatorios, el resto opcional. Verificar con `npm run migrate -- up` en un branch de desarrollo y con
      una consulta que cuente 34 claves, dos obligatorias y la serie `(especialidad, versión 1)`.
- [ ] 1.2 Misma migración (parte 2): disparador `atenciones_podologia_10_coherencia` (`BEFORE INSERT OR UPDATE OF plantilla_id`,
      `SECURITY DEFINER`): si la plantilla es la de Podología, la profesión del autor (`profesionales.profesion` del
      `profesional_id`) debe ser `podologo`, si no `HC080`; no exige lo inverso. Verificar con las pruebas de 1.4.
- [ ] 1.3 Misma migración (parte 3): disparador `atenciones_podologia_20_sellar` (`BEFORE UPDATE OF firmada_en`, `WHEN old.firmada_en
      is null and new.firmada_en is not null`): con la plantilla de Podología y `momento = evaluacion_inicial` exige todas las
      claves salvo `momento`, `fotos_registradas` y las que terminan en `_observaciones` (`HC084`); la lista sale de la plantilla de
      la atención. (La comprobación `HC082` de las fotos se añade en 3.4.) Verificar con las pruebas de 1.4.
- [ ] 1.4 Prueba pgTAP `tests/pgtap/79_podologia_reglas.test.sql`, parte «plantilla»: la plantilla existe, vigente, con 34 claves y
      los tipos esperados; control con solo `momento` y `fotos_registradas` se firma; evaluación inicial completa se firma, con una
      clave ausente falla con `HC084` y como borrador se guarda; las observaciones no se exigen; clave ajena descartada, opción
      inexistente y tipo equivocado rechazados; `HC080` con un médico, un odontólogo, un fisioterapeuta y un psicólogo a cargo y
      con un profesional de otra profesión registrado en Podología; el podólogo sin plantilla pasa; plantilla de otra especialidad
      rechazada; administrativo, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad` no escriben
      atenciones; los profesionales a cargo de cualquier profesión leen la evaluación firmada y quien no tiene el paciente a cargo,
      con asignación vencida o con perfil inactivo, no; la modificación de una atención firmada se rechaza y su huella cubre los
      datos (alteración detectada); estabilidad de las claves entre versiones consecutivas (se prueba con una versión sintética);
      cada clave de cada versión está exigida o excluida de la evaluación inicial; orden de los disparadores en `pg_trigger`. Verificar
      que pasa y que las pruebas 40 a 62 no se modificaron.
- [ ] 1.5 Documentar: TECH-DESIGN («Datos clínicos por especialidad»: plantilla de Podología, regla de la evaluación inicial y
      matriz de acceso) y `docs/pruebas-sql.md` (prueba 79, parte plantilla). Verificar que los enlaces relativos resuelven y que los
      textos no contradicen a `CLAUDE.md`.
- [ ] 1.6 Revisión con el agente `code-review` de la migración (`SECURITY DEFINER`, `search_path`, profesión leída de la base,
      orden de disparadores, `HC084` y su lista derivada de la plantilla). Verificar que cada hallazgo se corrige o se justifica por
      escrito en el PR.

## 2. Catálogo de protocolos por sesiones

- [ ] 2.1 Migración `protocolos-podologia`: tabla `protocolos_podologia` (`clave` única, `nombre`, `modalidad`, `total_sesiones` y
      `frecuencia_dias` nulos y `≥ 1`, `estado_validacion`, `validado_por`, `validado_en`, `fuente` obligatoria, `vigente`), `CHECK`
      de que `validado` exige quién y cuándo, RLS activada, `GRANT select` a `authenticated` y una política de lectura para
      `rol_actual() = 'profesional'`, **sin** `GRANT` de escritura para ningún rol de usuario, y las **cuatro semillas** de `design.md`
      D4 (hongos 6 y 15; verruga plantar 4 y 7; ortonixia 3 y nula; pie diabético nulo y 30), todas `por_validar`, con la URL y la fecha
      de consulta en `fuente`. Sin ningún otro protocolo. Verificar con `npm run migrate -- up` y con `relrowsecurity` de la tabla.
- [ ] 2.2 Prueba pgTAP **negativa** `tests/pgtap/79_podologia_rls.test.sql`, parte «catálogo»: RLS activada; todo profesional (de
      cada una de las cinco profesiones) lee los cuatro protocolos; **administrativo, enfermera, paciente, sin rol, `anonymous`,
      `cron_notificaciones` y `sync_identidad`** no leen (cero filas o sin privilegio); `has_table_privilege` falso de `insert`,
      `update` y `delete` para `authenticated`, `anonymous`, `cron_notificaciones` y `sync_identidad`, y un intento real de escritura
      del podólogo rechazado; `columns_are` exacto. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 2.3 En `79_podologia_reglas`, parte «catálogo»: las cuatro semillas exactas (claves, cifras y nulos) y ninguna otra; todas
      `por_validar`; `validado` sin `validado_por` o sin `validado_en` rechazado; la **puerta de revisión** (`modo_datos_clinicos() <>
      'real'` o ningún protocolo `por_validar`) pasa hoy y se comprueba que falla cuando se simula el modo real dentro de la
      transacción de prueba. Verificar que pasan.
- [ ] 2.4 Documentar: TECH-DESIGN (catálogo de protocolos y su puerta de revisión; el protocolo no es una constante de código) y
      `docs/pruebas-sql.md` (prueba 79, parte catálogo). Verificar los enlaces.
- [ ] 2.5 Revisión con el agente `code-review` de la migración (sin escritura de usuarios, política de lectura, `CHECK` de validación,
      cifras de las semillas). Verificar que los hallazgos quedan resueltos o justificados.

## 3. Fotos de evolución

- [ ] 3.1 Migración `fotos-evolucion` (parte 1): tipos de `lado`, `zona` y `etapa`; tabla `fotos_evolucion` con las columnas de
      `design.md` D5, `adjunto_id` única hacia `adjuntos_historia`, `CHECK` de dedo según la zona (obligatorio en uñas y dedos, nulo
      en el resto, 1 a 5), nota con contenido y obligatoria en zona «otra», `consentimiento_confirmado` verdadero, índices por
      atención y por serie `(paciente_id, lado, zona, dedo, tomada_en)`. Verificar con `npm run migrate -- up` y con
      `relrowsecurity` de la tabla.
- [ ] 3.2 Misma migración (parte 2): disparadores con el orden de D6, `fotos_evolucion_10_completar` (`paciente_id` desde la
      atención y `tomada_en`), `_20_proteger` (`HC080` profesión, `HC081` autoría y atención sin firmar y con la plantilla de
      Podología, para todo rol incluido el dueño en lo de la firma), `_30_validar` (`HC083`: adjunto del mismo paciente, vigente,
      subido por el mismo podólogo y no usado), `_40_modo` (`exigir_paciente_admisible()` de H6) y `_50_huella`; y la función
      `verificar_fotos_podologia(atencion)`. Verificar con las pruebas de 3.5 y 3.6.
- [ ] 3.3 Misma migración (parte 3): `GRANT` por columna (inserta `atencion_id, adjunto_id, lado, zona, dedo, etapa, nota,
      consentimiento_confirmado`; actualiza `lado, zona, dedo, etapa, nota`), políticas `SELECT` (profesional con el paciente a cargo)
      e `INSERT`/`UPDATE`/`DELETE` (más `profesion_actual() = 'podologo'`, atención propia y sin firmar), sin `GRANT` a
      `cron_notificaciones`, `sync_identidad` ni `anonymous`, y el disparador de auditoría
      `registrar_auditoria_sin_contenido()`. Verificar con `has_table_privilege` por rol.
- [ ] 3.4 Migración `sellado-de-fotos-podologia`: `create or replace` de la función de `atenciones_podologia_20_sellar` partiendo de
      la definición vigente (`pg_get_functiondef`) para añadir `HC082` (el recuento `fotos_registradas` debe ser igual al número de
      fotos de la atención). Verificar que la prueba de 1.4 sigue en verde y que las de 3.6 cubren `HC082`.
- [ ] 3.5 Prueba pgTAP **negativa** en `79_podologia_rls`, parte «fotos»: RLS activada; el podólogo autor de una atención sin firmar
      inserta, actualiza y borra; podólogo no autor (`HC081`), podólogo sin el paciente, con asignación vencida y con perfil inactivo
      no leen ni escriben; **médico, odontólogo, fisioterapeuta y psicólogo a cargo leen pero no escriben (`HC080`)**;
      **administrativo, enfermera, paciente (incluido el titular), sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`**
      sin lectura ni escritura; `has_table_privilege` falso de lo que no se concede (`paciente_id`, `tomada_en`, `huella` no se
      pueden enviar); `columns_are` exacto. Verificar que pasa y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 3.6 En `79_podologia_reglas`, parte «fotos»: zona y dedo (cada combinación válida e inválida); zona «otra» sin nota;
      consentimiento falso rechazado; `HC083` con un adjunto de otro paciente, anulado, subido por otro profesional o ya usado;
      `HC081` con la atención firmada, ajena o sin plantilla de Podología (incluido el dueño de la base); `HC082` con una foto de más y
      de menos; foto borrada o alterada con el disparador desactivado solo en la prueba, detectada por `verificar_fotos_podologia`;
      huella reproducible; guarda de modo de datos (`HC002`); que la auditoría no contiene el texto centinela de `nota`; y que
      anular el adjunto no borra la foto. Verificar que pasan.
- [ ] 3.7 Prueba de concurrencia `tests/concurrencia/` (siguiente número libre, sugerido 31; dos sesiones `pg` reales como
      `authenticated`): agregar o quitar una foto contra la firma de la atención; el editor recibe `HC081` o `HC082`, o la huella ya lo
      incluye, nunca un sello desfasado; 20 rondas. Verificar que pasa y actualizar `docs/pruebas-sql.md`.
- [ ] 3.8 Documentar: TECH-DESIGN (tabla `fotos_evolucion`, contrato del adjunto de imagen, qué pasa según P-15 y la matriz de
      acceso) y `docs/pruebas-sql.md` (prueba 79 completa). Verificar los enlaces y que los textos coinciden con `CLAUDE.md`.
- [ ] 3.9 Revisión con el agente `code-review`, lectura estricta, de la migración (políticas, `GRANT` por columna, disparadores y su
      orden, `HC083`, sello y huella, auditoría sin contenido). Verificar que los hallazgos quedan resueltos o justificados.

## 4. Copia de la historia (H6d)

- [ ] 4.1 **Clasificar las tablas nuevas y escribir su sección en el compilado de la copia.** Migración `copia-seccion-podologia`:
      función `copia_seccion_podologia(paciente, corte)` (`SECURITY DEFINER`, `search_path` vacío, **sin `EXECUTE` para ningún rol de
      usuario**) que devuelve las fotos de las atenciones firmadas hasta el corte (lado, zona, dedo, etapa, fecha de Lima, nota,
      adjunto vigente, y las anuladas declaradas no incluidas); el reemplazo del compilado de H6d parte de su definición vigente
      (`pg_get_functiondef`) y la invoca; `fotos_evolucion` figura como incluida y `protocolos_podologia` como exclusión con su razón
      («catálogo de referencia sin datos del paciente») en la lista de la prueba de cobertura. Verificar que la prueba `74` de
      cobertura de H6d pasa y que falla al crear dentro de la transacción de prueba una tabla nueva sin clasificar. Si H6d aún no está
      aplicado, dejar la tarea pendiente de él y anotarlo en el PR.
- [ ] 4.2 Prueba pgTAP en `79_podologia_reglas`, parte «copia»: la copia de un paciente con una atención firmada de Podología incluye
      sus datos de especialidad con las etiquetas de la plantilla y sus fotos; excluye el borrador y declara solo su número; el archivo
      anulado se declara no incluido; `copia_seccion_podologia` no es ejecutable por `authenticated`, `anonymous`, `cron_notificaciones`
      ni `sync_identidad`; el administrativo no gana lectura directa de `fotos_evolucion`; ni la solicitud, ni `accesos_historia`, ni
      `auditoria` contienen el texto centinela de `nota`. Verificar que pasa.
- [ ] 4.3 Documentar: TECH-DESIGN («Copia de la historia»: la sección de Podología) y la nota de coordinación en `design.md` D9.
      Revisión con el agente `code-review` de la función de la sección y del reemplazo del compilado (que no pisa lo de otros changes).
      Verificar que los hallazgos quedan resueltos o justificados.

## 5. Lógica de aplicación

- [ ] 5.1 `lib/podologia/grupos.ts` (prefijos `pie_`, `unas_`, `piel_`, `pisada_` y sus rótulos), `lib/podologia/evaluacion-inicial.ts`
      (qué claves exige la evaluación inicial, con la misma regla que `HC084`, para dar el error por campo antes de firmar) y
      `lib/schemas/podologia.ts` (Zod 3 `.strict()` de las fotos: lado, zona, dedo según la zona, etapa, nota con contenido que rechaza
      invisibles y `U+0000`, NFC, consentimiento verdadero; sin `paciente_id`, hora ni huella) con `tests/podologia/esquemas.test.ts`
      (`node:test`). Verificar que pasan y que fallan al relajar una regla a propósito.
- [ ] 5.2 `lib/podologia/comparar.ts`: función **pura** que arma la matriz (últimas cinco firmadas, columnas por fecha de firma, filas
      por clave, «Cambió», «No registrado», etiquetas de la versión más reciente) y las series de fotos (por lado, zona y dedo; par
      primera y más reciente; «archivo anulado»; solo firmadas) con `tests/podologia/comparar.test.ts`: tres controles, campo vacío,
      dos versiones de la plantilla, siete atenciones, borrador excluido, series separadas, y que no calcula ningún puntaje ni
      etiqueta de mejoría. Verificar que pasan.
- [ ] 5.3 `lib/podologia/errores.ts` con el mapeo de `design.md` D11 (`HC080`–`HC084`, `23505`, `23514`, `42501`, `HC002`, `HC004`,
      `HC005`, otros) y `tests/podologia/errores.test.ts`. Verificar que cada fila de la tabla tiene su prueba y que ningún mensaje
      contiene texto de la base ni datos del paciente.
- [ ] 5.4 `lib/podologia/repositorio.ts` con ejecutor inyectable (todo el SQL contra `fotos_evolucion`; las funciones de lectura exigen
      un `TransaccionConAcceso`), `lib/historias/podologia.ts` (lecturas con `exigir_modo_clinico()` primero, un registro de acceso por
      cada atención leída y después la lectura; si el registro falla no se devuelve nada) y `tests/podologia/acceso-unico.test.ts`
      (falla si otro archivo de `app/`, `lib/` o `components/` contiene SQL contra `fotos_evolucion`). Pruebas con ejecutor simulado:
      el modo va primero, el acceso antes de leer, un fallo no devuelve contenido. Verificar que pasan y que el acceso único falla al
      añadir temporalmente una consulta en otro archivo (revertida).
- [ ] 5.5 `lib/podologia/protocolos.ts`: lectura del catálogo bajo RLS, prellenado del plan (total y frecuencia del protocolo, valores
      nulos marcados como «a indicar») y la apertura del plan invocando la operación de H6i (0.2) con el nombre y la clave del
      protocolo; con `tests/podologia/protocolos.test.ts` y un ejecutor simulado: los cuatro protocolos prellenan lo que traen, los
      nulos bloquean la apertura, un plan sin protocolo abre, el catálogo no se escribe. Verificar que pasan.
- [ ] 5.6 Server Actions (`guardarFotosPodologicas`, `abrirPlanDeProtocolo`, `abrirPlanDeControles`) con la guardia de H6 (`auth.protect()`,
      rol, MFA, profesión leída de la base), Zod en el servidor, `ResultadoAccion` y el mapeo de 5.3; `guardarFotosPodologicas` reemplaza
      el conjunto del borrador y recalcula `fotos_registradas` en la misma transacción. Pruebas `node:test` con ejecutor simulado: una
      entrada inválida no llega a la base, un rol o una profesión equivocados reciben `NO_AUTORIZADO`, ningún error crudo escapa. Verificar
      que pasan.
- [ ] 5.7 Documentar: tabla de Server Actions de TECH-DESIGN y el mapa de errores (nota en ADR-0008). Revisión con el agente
      `code-review` de las acciones y del repositorio (profesión por parámetro, fugas de existencia, orden de sentencias, mensajes).
      Verificar que los hallazgos quedan resueltos o justificados.

## 6. Pantallas

- [ ] 6.1 Componentes en `components/clinica/podologia/` (`MatrizEvolucion`, `SelectorProtocolo` con la insignia «Por validar», lista
      de fotos y, tras 6.5, `ParDeFotos`), con sus tokens y estados, y su alta en `docs/DESIGN.md` seguida de `npm run tema`. Verificar con
      `npm run typecheck`, `npm run lint`, `npm run tema:comprobar` y su aparición en `/guia-de-estilo`.
- [ ] 6.2 Secciones de la atención del podólogo (`.../atenciones/nueva` y `.../atenciones/[atencionId]`): los campos de la plantilla
      agrupados por prefijo (acordado en 0.7), «Fotos: N» sin campo editable, la advertencia de la evaluación inicial completa y el
      error de `HC084` por campo. Sin autoguardado en el navegador. Verificar con `npm run typecheck` y recorrido manual con datos de
      demostración.
- [ ] 6.3 `app/profesional/pacientes/[pacienteId]/podologia/page.tsx`: matriz de evolución, series de fotos (con enlace al archivo
      mientras solo haya PDF), planes del paciente con su contador y la apertura de un plan con el selector de protocolo; solo el podólogo
      ve los botones de registrar; el resto de profesionales ve la lectura. Verificar con `npm run typecheck` y recorrido manual.
- [ ] 6.4 Sección de fotos del formulario: subida del adjunto con el flujo de H6, metadato (lado, zona, dedo, etapa, nota), casilla de
      consentimiento, y quitar en el borrador; mensajes de `HC083` y de consentimiento en español. Verificar con recorrido manual usando
      un PDF de demostración.
- [ ] 6.5 **(Bloqueada por P-15, tarea 0.4)** Vista de imágenes: `ParDeFotos` lado a lado y línea de tiempo con miniaturas, cuando los
      adjuntos admitan imágenes. Verificar con una imagen de demostración y axe sobre la pantalla; si P-15 se resuelve como «solo PDF»,
      dejar la tarea cerrada con la nota de que la comparación visual no aplica.
- [ ] 6.6 `Cache-Control: private, no-store` en `/profesional/pacientes/:path*/podologia`, páginas dinámicas, título fijo («Evolución
      podológica») y direcciones solo con `uuid`. Verificar con `curl -I` contra `next start` y una prueba E2E de cabeceras y título.
- [ ] 6.7 E2E (`e2e/podologia-*.spec.ts`, con la base sembrada; se omite con un mensaje explícito si faltan datos o el TOTP de
      profesional): el podólogo registra una evaluación inicial, intenta firmarla incompleta y falla, la completa y firma, hace dos
      controles y abre la comparación; otro profesional a cargo ve la matriz sin controles de edición; enfermera, administrativo y
      paciente no abren la ruta; abrir un plan con un protocolo muestra la insignia «Por validar» y los valores prellenados; axe sobre las
      pantallas. Verificar que pasan.
- [ ] 6.8 Datos de demostración: opción opt-in de `scripts/sembrar-datos-demo.ts` (un podólogo, un paciente `@demo.invalid` con una
      evaluación inicial y dos controles firmados, un plan de protocolo y dos fotos con PDF; rehace solo lo marcado) y
      `docs/datos-demo.md`; documentar las cuentas y datos de las E2E en `docs/pruebas-e2e.md`. Verificar que sembrar dos veces no duplica
      y que no toca producción sin `--incluir-produccion`.
- [ ] 6.9 Revisión con el agente `code-review` de las pantallas (qué muestra cada rol, botones solo para el podólogo, canales laterales,
      lectura sin registro de acceso). Verificar que los hallazgos quedan resueltos o justificados.

## 7. Integración y cierre

- [ ] 7.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run tema:comprobar`,
      `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion`, los `node:test` de `tests/podologia/` y la suite
      E2E completa. Verificar que todo pasa y que el PR trae el cuadro de cada requisito de las cuatro especificaciones con la prueba
      que lo cubre.
- [ ] 7.2 Verificación por mutación: en un branch de desarrollo, debilitar a propósito, una por una, y comprobar que al menos una
      prueba negativa falla (revertir cada vez): quitar `HC080` de `atenciones_podologia_10_coherencia`; quitar `HC084` o `HC082` de
      `_20_sellar`; dar `GRANT insert` sobre `protocolos_podologia`; abrir su política de lectura al administrativo; añadir un quinto
      protocolo o cambiar una cifra de una semilla; quitar la puerta de revisión; quitar `profesion_actual() = 'podologo'` de la
      política de `INSERT` de `fotos_evolucion`; quitar `HC080` de `_20_proteger`; quitar `profesional_tiene_paciente` de su
      política de `SELECT`; permitir `UPDATE` o `DELETE` de una foto firmada; añadir `paciente_id` o `tomada_en` al `GRANT`; quitar
      `HC083` o su condición de «mismo podólogo»; quitar el `CHECK` del consentimiento; quitar `_40_modo`; hacer que la auditoría copie
      `nota`; dar `EXECUTE` de `copia_seccion_podologia` a `authenticated`; sacar las fotos del compilado; quitar el registro de acceso
      de la lectura de comparación (prueba `node:test` con ejecutor simulado). Verificar anotando en el PR la mutación y la prueba que
      falló, una por elemento.
- [ ] 7.3 Prueba de usabilidad con al menos un podólogo (si no es posible, un recorrido cronometrado por el equipo con un paciente
      típico, dejándolo registrado como sustituto): tiempo de una evaluación inicial completa y de un control con fotos, y errores de
      tipeo. Verificar que el resultado consta en el PR y que, si el control supera el objetivo inicial de 3 minutos (valor a confirmar), se
      anotan los ajustes acordados (por ejemplo, qué campos pasan a opcionales en la versión 2).
- [ ] 7.4 Barrido de coherencia entre documentos: `CLAUDE.md` (estado y alcance de Podología), TECH-DESIGN (tablas, funciones, rutas,
      P-15), `docs/DESIGN.md`, `docs/datos-demo.md`, `docs/pruebas-sql.md`, `docs/pruebas-e2e.md` y los changes H6, H6d, H6e e H6i
      afectados. Verificar con una búsqueda que los textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 7.5 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, funciones `SECURITY DEFINER`, disparadores
      sobre `atenciones`, lecturas de comparación, Server Actions) con el checklist más estricto, y corrección de sus hallazgos. Verificar
      que no quedan hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la revisión humana aparte que
      exige el proposal.
- [ ] 7.6 Confirmar que ninguna migración ni variable del change fija el modo `real`, que el PR declara expresamente que la evaluación,
      las fotos y los protocolos **no entran en producción con datos reales** mientras P-1 siga abierta, y que los cuatro protocolos
      siguen `por_validar` salvo validación escrita. Verificar con una búsqueda de `modo` y `real` en `migrations/` y con la prueba de la
      puerta de revisión y la del modo por defecto de H6 en verde.
- [ ] 7.7 Tras el merge, comprobar que el despliegue de producción está READY, que la ruta de evolución responde con una sesión de
      prueba y que `select public.modo_datos_clinicos()` sigue en `demostracion`; sembrar datos de demostración en producción solo si el
      usuario lo pide. Verificar con la URL pública y el branch de producción.
