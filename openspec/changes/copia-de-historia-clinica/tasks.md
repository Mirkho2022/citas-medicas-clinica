# Tasks

> **Nombres:** sujetos a ADR-0030 (aún no aceptada); si se rechaza, léase `medico`/`medicos` donde dice `profesional`/`profesionales`.

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto:** abre una ventana controlada por la
  que el rol administrativo hace generar la historia completa, incluida Psicología. Cada grupo que cambia políticas, funciones
  `SECURITY DEFINER`, disparadores o rutas que sirven contenido clínico termina con una tarea de **revisión con el agente
  `code-review`** y no se da por cerrado hasta corregir o justificar sus hallazgos.
- **Datos reales: prohibidos.** Mientras la decisión legal P-1 siga abierta no se carga ningún dato clínico real; la copia
  contiene la historia completa. Los datos sintéticos de demostración (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo
  `real` (H6, D1).
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa; antes de cerrarla se
  confirma que RLS quedó activada (`relrowsecurity`) y que `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos
  nuevos en `migrations/*.sql` (se crean con `npm run migrate -- create`); **nunca se edita una ya aplicada**, y las secciones
  `down` quedan vacías (ADR-0027). Los números de las pruebas pgTAP (73 y 74) y los códigos SQLSTATE (`HC040` a `HC049`) son
  sugeridos: comprobar al aplicar que ningún otro change los tomó.
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en
  `production`**. Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Textos de interfaz y errores en
  español (con «usted»); fechas en `America/Lima`.
- Las tareas de pantalla (grupo 6) usan los componentes y el tema de H2b (`sistema-de-diseno-ui`); si no está aplicado, se avanza
  con los grupos 0 a 5 y se retoma. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son para el momento de
  aplicar el change; este change no las modifica al proponerse.

## 0. Decisiones previas y verificaciones

- [ ] 0.1 Confirmar que están aplicados (o en la rama base) H2c `profesionales-de-la-salud`, H6 `historias-clinicas` (en
      particular `tipo_acceso` de `accesos_historia`, la guarda de modo y `lib/historias/guardia.ts`), H6g
      `especialidad-psicologia` y H3 `agenda-y-reserva` (ítem 5, filiación y tipos de documento); aplicar las migraciones en un
      branch de desarrollo de Neon y correr `npm run test:pgtap`. Verificar que la línea base está en verde y anotar el número de
      pruebas en el PR; si falta H6g, anotar que la sección de Psicología queda sin probar hasta que llegue.
- [ ] 0.2 Con la skill `architecture`, crear la ADR «Emisión de la copia de la historia clínica» (siguiente número libre en
      `docs/adrs/`, que no se fija en los textos) que recoja `design.md` D2 y D3: la ventana controlada del rol administrativo,
      las alternativas A, B, C1 y C2, el límite declarado de la garantía y los endurecimientos opcionales. Enlazarla en la tabla
      de ADR de TECH-DESIGN y dejarla en estado «Propuesto» hasta que el usuario decida los puntos (i) y (ii) de D2. Verificar que
      el archivo existe, que los enlaces relativos resuelven y que el estado no es «Aceptado» sin decisión escrita del usuario.
- [ ] 0.3 Preparar la consulta al asesor legal con las preguntas de `design.md` («Preguntas abiertas», bloque del asesor): días
      hábiles o calendario, quién puede solicitar y qué lo acredita, qué hace «autenticada» a la copia, Psicología, retención y
      datos de terceros ante la ANPD, y costo de reproducción. Verificar que cada pregunta consta en la consulta con su estado
      «pendiente» y que las respuestas, cuando lleguen, se anotan con fecha en `design.md` y, si cambian una regla, se ajustan
      D4 o D5 y los escenarios afectados con `openspec-update-change`.
- [ ] 0.4 Confirmar con la clínica: quién es el responsable cuyo nombre y cargo figuran en la copia, si hay impresora en
      recepción que pueda usarse para este documento (supuesto del PRD sin confirmar) y qué documentos acepta hoy recepción para
      entregar una historia. Verificar que las respuestas constan en `design.md` (D7 y «Riesgos»); sin impresora, detener el
      grupo 5 y consultar (reabre D9).
- [ ] 0.5 Spike del documento: elegir la biblioteca de PDF **coordinada con H6c** (recetas impresas) y medir en una función de
      Vercel el peor caso razonable (p. ej., 200 atenciones y cinco adjuntos de 25 MB): memoria, duración y tamaño frente a los
      límites del plan Hobby vigentes. Decidir si los adjuntos se anexan al PDF o se entregan como archivos aparte listados en el
      índice (D6). Verificar que la medición, los límites y la decisión constan en `design.md`, D6, con su fecha; sin medición no
      se empieza el grupo 5.
- [ ] 0.6 Coordinar con los changes en paralelo y anotar el resultado en `design.md`: con H6, la migración que crea
      `tipo_acceso` (tarea 4.1), la prueba `56` (¿enumera los tipos?) y la pantalla de revisión de accesos (tarea 4.5: filtro «médico»
      pasa a «actor», filas `copia`, marcas de D8); con H6b, H6c y H6e a H6h, que cada uno añade su sección al compilado y que la
      prueba de cobertura (3.5) se lo exige; con H3, las columnas de filiación y los tipos de documento (¿`PASAPORTE`?); y los
      archivos compartidos (`lib/ui/navegacion.ts`, `.env.example`, `package.json`). Verificar que las notas existen y que ningún
      otro change tomó `HC040` a `HC049` ni las pruebas 73 y 74.

## 1. Tabla de solicitudes y su aislamiento

- [ ] 1.1 Migración `solicitudes-copia-historia`: tipos de `estado` y `solicitante_tipo`, tabla con las columnas de D1 (dueño de
      todas), número correlativo, índice único parcial de solicitudes abiertas por paciente y documento del solicitante,
      función `calcular_vencimiento_copia(timestamptz)` (5 días calendario, fin del día 5 en Lima, D5), disparador de sello
      `BEFORE INSERT` (`registrada_por`, `solicitada_en`, `vence_en`, estado inicial; solo si `current_user = 'authenticated'`),
      disparador de protección (todo `DELETE` y los `UPDATE` que cambien solicitante, paciente, fechas de alta o `vence_en`, o
      que salten la máquina de estados; incluido el dueño), `CHECK` del motivo de la demora, RLS activada, `GRANT SELECT` y
      `INSERT` por columnas a `authenticated` y nada más, políticas de lectura e inserción solo para el administrativo,
      `registrar_auditoria()` enganchada y el disparador de paciente admisible de H6 (`HC002`). Verificar con `npm run migrate --
      up` en un branch de desarrollo, con `relrowsecurity` de la tabla y con `has_table_privilege`.
- [ ] 1.2 Prueba pgTAP **negativa** `tests/pgtap/73_solicitudes_copia_rls.test.sql`: RLS activada; el administrativo lee e
      inserta; **profesional a cargo, otro profesional, enfermera, paciente (incluido el titular de la historia), sin rol,
      `anonymous`, `cron_notificaciones` y `sync_identidad`** no leen (cero filas) ni insertan, actualizan ni eliminan;
      `has_table_privilege` falso para todo lo que no se concede; el administrativo no puede `UPDATE` ni `DELETE`; una inserción
      con estado, fechas, `vence_en` o `registrada_por` de otro perfil se ignora o se rechaza. Verificar que pasa y que
      `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 1.3 En el mismo archivo, pruebas de las reglas de la tabla: vencimiento (lunes 15:00 → sábado 23:59:59; lunes 23:30 de Lima,
      ya martes en UTC → sábado; la regla no cambia vencimientos ya guardados), solicitud duplicada abierta (`23505`), otro
      solicitante permitido, nueva tras cerrarse, solo-agregar incluso para el dueño (cambiar solicitante, paciente o fechas y
      eliminar fallan), modo de datos (`HC002`) y formatos de documento. Verificar que pasan y que las pruebas 40 a 53 no se
      modificaron.
- [ ] 1.4 Documentar: TECH-DESIGN («Modelo de datos»: `solicitudes_copia_historia`; matriz de acceso) y `docs/pruebas-sql.md`
      (prueba 73). Verificar que los enlaces relativos resuelven y que los textos no contradicen a `CLAUDE.md`.
- [ ] 1.5 Revisión con el agente `code-review` de la migración (RLS, `GRANT` por columnas, disparador de protección, índice,
      disparador de sello). Verificar que cada hallazgo se corrige o se justifica por escrito en el PR.

## 2. Ciclo de la solicitud: verificar, rechazar y confirmar la entrega

- [ ] 2.1 Migración `ciclo-de-solicitudes-copia`: funciones `verificar_solicitud_copia`, `rechazar_solicitud_copia`,
      `confirmar_entrega_copia` y `verificar_autenticidad_copia`, todas `SECURITY DEFINER`, `search_path` vacío, `REVOKE ALL ...
      FROM PUBLIC`, `EXECUTE` solo a `authenticated`, comprobación interna de `rol_actual() = 'administrativo'` (`42501`), bloqueo
      de la fila (`for update`), actor siempre tomado de `perfil_actual()`. Reglas de D4: documento coincidente (`HC041`),
      coherencia vínculo y acreditación (`HC041`), menor de 18 años (`HC042`), método y cotejo obligatorios; `HC040` en
      transiciones inválidas; `HC043` al confirmar sin generación o con una huella que no es la de la última generación; motivo
      de demora si se entrega después de `vence_en`. Verificar que se aplica y con `has_function_privilege` por rol.
- [ ] 2.2 Prueba pgTAP `tests/pgtap/74_copia_historia_emision.test.sql`, parte «ciclo»: camino normal con cada paso atribuido;
      saltar un paso, reabrir una cerrada y verificar dos veces fallan con `HC040`; documento que no coincide, representante sin
      acreditación, acreditación incoherente y autoridad con oficio (`HC041`); menor que pide por sí mismo, cumple 18 ayer y
      representante del menor (`HC042`); rechazo con cada motivo y «otro» sin detalle rechazado; paciente con número provisional
      con nota; confirmar sin generar o con huella ajena (`HC043`); entrega vencida sin y con motivo de demora; y **negativos por
      rol** (profesional, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`: `42501` o sin
      `EXECUTE`). Verificar que pasa.
- [ ] 2.3 Prueba de concurrencia `tests/concurrencia/` (siguiente número libre, sugerido 21; dos sesiones `pg`): dos
      verificaciones o dos confirmaciones simultáneas de la misma solicitud, y dos altas duplicadas a la vez; solo una se aplica.
      Verificar que pasa 20 rondas seguidas y actualizar `docs/pruebas-sql.md`.
- [ ] 2.4 Documentar: TECH-DESIGN («Seguridad»: ciclo de la solicitud y funciones acotadas) y `docs/pruebas-sql.md` (prueba 74,
      parte ciclo). Verificar los enlaces.
- [ ] 2.5 Revisión con el agente `code-review` de las funciones (`SECURITY DEFINER`, `search_path`, actor tomado de la sesión,
      bloqueo de fila, reglas de menor y de coherencia). Verificar que los hallazgos quedan resueltos o justificados.

## 3. Compilado de la copia y su auditoría

- [ ] 3.1 Migración `accesos-historia-copia`: el valor `copia` en `tipo_acceso`, las columnas `solicitud_copia_id` (FK a la
      solicitud) y `huella_contenido` en `accesos_historia`, sin cambiar ninguna política. Si la prueba `56` de H6 enumera los
      tipos permitidos, actualizarla a propósito. Verificar que se aplica sin tocar filas existentes y que las pruebas 52 y 56
      pasan.
- [ ] 3.2 Migración `compilado-de-copia-historia`: función `compilar_copia_historia(solicitud, modo)` (`SECURITY DEFINER`,
      `search_path` vacío, mismo régimen de `EXECUTE`) que, en una sola transacción, exige el modo (`HC004`), el rol
      administrativo, la solicitud `verificada` (`HC040`), `generaciones < 3` (`HC044`) y el paciente admisible (`HC002`);
      inserta el registro de acceso `copia`; aumenta `generaciones`; escribe `huella_contenido`, `secciones_incluidas`,
      `conteos`, `incluye_psicologia` y `contenido_hasta` en la solicitud; y devuelve el `jsonb` del compilado con las secciones
      de D6 que ya existan (filiación, antecedentes, atenciones firmadas con addendas y huellas, adjuntos vigentes como claves de
      Blob, y las de H6b, H6c, H6e a H6h y Psicología que estén aplicadas). Sin borradores ni adjuntos anulados, con sus
      conteos de excluidos. Verificar que se aplica y que, llamada como administrativo con un texto centinela en una atención,
      devuelve el centinela mientras `select` directo sobre las tablas clínicas sigue dando cero filas.
- [ ] 3.3 Prueba pgTAP `74`, parte «compilado»: contenido incluido y excluido (atención firmada, borrador, addenda, adjunto vigente
      y anulado, antecedente no vigente), historia sin registros, Psicología incluida cuando existe (y `incluye_psicologia`
      sin conteo) con el administrativo y un profesional que no es psicólogo sin lectura directa, **ni `solicitudes_copia_historia`
      ni `accesos_historia` ni `auditoria` contienen el texto centinela**, el registro de acceso queda atribuido al administrativo
      con la huella, si la inserción del acceso falla no se devuelve contenido, tope de tres generaciones (`HC044`), modo
      incorrecto (`HC004`, `HC002`), huella reproducible para el mismo contenido y **negativos por rol** (profesional a cargo,
      otro profesional, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`). Verificar que pasa.
- [ ] 3.4 Prueba de cobertura `74`, parte «cobertura» (D6): recorre las tablas de `public`; cada una debe estar mencionada en la
      definición del compilado o figurar en la lista de exclusiones escrita en la prueba **con su razón** (citas, notificaciones,
      asignaciones, auditoría, accesos, `plantillas_clinicas`, `cie10`, `configuracion_clinica`, `solicitudes_copia_historia`,
      etc.). Comprobar que falla al crear dentro de la transacción de prueba una tabla nueva sin clasificar. Verificar que pasa y
      que el caso de falla se detecta.
- [ ] 3.5 Documentar: TECH-DESIGN («Seguridad»: la copia como única ventana del rol administrativo y su límite), nota en
      [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (la copia incluye Psicología y cómo se
      impone) y en [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md) (excepción acotada, auditada),
      y `docs/pruebas-sql.md` (prueba 74 completa). Verificar que los enlaces resuelven y que los textos coinciden entre sí.
- [ ] 3.6 Revisión con el agente `code-review`, lectura más estricta, de `compilar_copia_historia` (función que entrega contenido
      clínico a una sesión del rol administrativo: `search_path`, comprobación de rol, orden registro-antes-que-lectura, tope,
      modo, Psicología, que no persista contenido). Verificar que los hallazgos quedan resueltos o justificados.

## 4. Lógica de aplicación

- [ ] 4.1 `lib/schemas/copia-historia.ts` (Zod 3, `.strict()`, texto con contenido que rechaza invisibles y `U+0000`, NFC, formatos
      de documento DNI/CE/pasaporte según H3, vínculo y acreditación coherentes con el tipo de solicitante, motivos de rechazo)
      y `tests/historias/copia-esquemas.test.ts` con `node:test`. Verificar que pasan y que fallan al relajar una regla a propósito.
- [ ] 4.2 `lib/copias/errores.ts` con el mapeo de D12 (`HC040` a `HC044`, `HC002`, `HC004`, `23505` sobre la abierta con su número,
      `23514`, `42501`, otros) y `tests/historias/copia-errores.test.ts`. Verificar que cada fila de la tabla tiene su prueba y
      que ningún mensaje contiene texto de la base.
- [ ] 4.3 `lib/historias/copias.ts`: repositorio con ejecutor inyectable (modo primero, luego la operación) para registrar,
      listar, verificar, rechazar, compilar y confirmar; el contenido compilado solo se devuelve al llamador del handler.
      Ampliar `tests/historias/acceso-unico.test.ts` para que `solicitudes_copia_historia` y `compilar_copia_historia` solo se
      usen desde `lib/historias/`. Pruebas con ejecutor simulado: orden de sentencias, que si la generación falla no se
      devuelve contenido y que el modo va siempre primero. Verificar que pasan y que `acceso-unico` falla al añadir una consulta
      en otro archivo (revertida).
- [ ] 4.4 Acciones `registrarSolicitudCopia`, `verificarSolicitudCopia`, `rechazarSolicitudCopia` y `confirmarEntregaCopia`
      (Zod en servidor → repositorio → mapeo; resultado tipado) con pruebas de ejecutor simulado: una entrada inválida no llega
      a la base, un error de la base se traduce sin texto crudo y un duplicado informa el número de la abierta. Verificar que
      pasan.
- [ ] 4.5 Documentar la tabla de Server Actions de TECH-DESIGN y el mapeo de errores. Verificar los enlaces.
- [ ] 4.6 Revisión con el agente `code-review` de las acciones y del repositorio (validación en servidor, mapeo de errores, fugas
      de existencia, actor tomado de la sesión). Verificar que los hallazgos quedan resueltos o justificados.

## 5. Documento de la copia

- [ ] 5.1 `lib/copias/sellador.ts` (interfaz `SelladorCopia`, que no importa nada de su implementación) y `lib/copias/sello-sistema.ts`
      (folio, huella `v1:`, texto de autenticación con el responsable de la clínica tomado de configuración, sello estático),
      con `tests/historias/sellador.test.ts`. Verificar que pasan, que el texto no afirma validez legal y que la huella es
      reproducible.
- [ ] 5.2 `lib/copias/documento.ts`: arma el PDF a partir del compilado según 0.5 (carátula con alcance declarado, índice de lo
      incluido y de lo excluido, secciones de D6, anexos de adjuntos o su listado, fechas de Lima, es-PE, folio y «Página n de N»
      en cada página). Pruebas `node:test` con un compilado sintético sin red: todas las páginas llevan folio y numeración, el
      índice declara borradores y adjuntos anulados excluidos, una historia sin registros trae la constancia, no hay
      afirmación de validez legal. Verificar que pasan.
- [ ] 5.3 Route Handler `app/administrativo/copias-historia/[solicitudId]/documento/route.ts`: `POST` (el `GET` responde 405),
      `auth.protect()`, `exigirRol("administrativo")`, MFA, modo → compilar → renderizar; cabeceras `Cache-Control: private,
      no-store` y `X-Content-Type-Options: nosniff`; el contenido no se escribe en Blob, en disco ni en los registros del
      servidor; errores sin contenido. Pruebas `node:test`: rol incorrecto, sin MFA, solicitud no verificada, fallo del
      registro sin entrega, y que el handler no registra el compilado. Verificar que pasan.
- [ ] 5.4 Constancia de entrega (sin contenido clínico: folio, paciente, solicitante, fecha de Lima, páginas y huella, con espacio
      para la firma del solicitante). Verificar con una prueba que no contiene texto clínico y con un recorrido manual de
      impresión.
- [ ] 5.5 Documentar: TECH-DESIGN («Superficie de la aplicación»: rutas de copias y el handler) y `.env.example` si la configuración
      del responsable y del sello lo requiere. Verificar los enlaces y que los textos coinciden con `design.md`.
- [ ] 5.6 Revisión con el agente `code-review` del handler y del documento (nada de contenido en registros ni almacenamiento,
      cabeceras, `GET` sin efecto, orden registro antes que entrega). Verificar que los hallazgos quedan resueltos o justificados.

## 6. Pantallas de recepción

- [ ] 6.1 `app/administrativo/copias-historia/page.tsx`: lista de pendientes ordenada por fecha límite, etiquetas con icono y texto
      («Vence en N días», «Vence hoy», «Vencida hace N días»), conteo de abiertas y vencidas, y pestaña de cerradas con «En plazo» /
      «Fuera de plazo» y motivo de la demora; sin porcentajes, gráficos ni exportación; «hoy» en hora de Lima; activar el destino
      en `lib/ui/navegacion.ts`. Verificar con `npm run typecheck`, `npm run lint` y la regla de protección de Clerk.
- [ ] 6.2 Alta (`nueva/page.tsx`): buscar al paciente por documento, tipo y datos del solicitante, vínculo y acreditación cuando
      corresponde; aviso de duplicada con el enlace a la abierta. Verificar con `npm run typecheck` y recorrido manual con
      datos de demostración.
- [ ] 6.3 Detalle (`[solicitudId]/page.tsx`): verificar (método, cotejo, acreditación), rechazar (motivo), generar e imprimir (vista
      de impresión que no deja el archivo en el equipo), confirmar entrega (casilla de documento cotejado y motivo de demora si
      corresponde) y constancia; muestra solo metadatos y declara en pantalla que el contenido no se muestra. Verificar con
      `npm run typecheck` y revisión visual.
- [ ] 6.4 Cabeceras `Cache-Control: private, no-store` en `next.config.ts` para `/administrativo/copias-historia/:path*`, título
      «Copia de historia clínica» y direcciones solo con `uuid`; y, coordinado con H6 (4.5), la pantalla de revisión de accesos
      muestra las filas `copia` con la solicitud enlazada y las marcas «generada sin confirmar la entrega» y «verificó y entregó
      la misma persona». Verificar con `curl -I` contra `next start` y con una prueba E2E.
- [ ] 6.5 E2E `e2e/copia-historia.spec.ts` (con la base sembrada según `docs/datos-demo.md`; si no hay datos se omite con un
      mensaje explícito): alta, verificación, generación con confirmación; rechazo por representación no acreditada; duplicada;
      vencida visible con su etiqueta; entrega fuera de plazo pide el motivo; **ninguna pantalla contiene el texto clínico
      centinela**; profesional, enfermera y paciente no abren las rutas; sin MFA redirige; axe sobre lista, alta y detalle.
      Verificar que pasan.
- [ ] 6.6 Documentar en `docs/pruebas-e2e.md` los datos y cuentas necesarios. Verificar los enlaces.
- [ ] 6.7 Revisión con el agente `code-review` de las rutas y pantallas (canales laterales, caché, títulos, que ninguna pantalla
      reciba el compilado). Verificar que los hallazgos quedan resueltos o justificados.

## 7. Datos de demostración y procedimiento de recepción

- [ ] 7.1 Ampliar `scripts/sembrar-datos-demo.ts` con solicitudes sintéticas de pacientes `@demo.invalid`: una por vencer hoy,
      una vencida, una entregada en plazo, una entregada fuera de plazo con motivo, una rechazada y una de un menor con
      representante. Documentarlas en `docs/datos-demo.md`. Verificar que sembrar dos veces no duplica filas y que el script
      se rechaza en modo `real`.
- [ ] 7.2 Redactar el procedimiento de recepción como insumo del manual de H8 (ítem 35 del backlog): qué documento pedir a cada
      tipo de solicitante, cuándo rechazar, cómo imprimir y cerrar el sobre, qué hacer si el solicitante se va sin la copia y
      con el papel impreso sobrante, y a quién consultar si se alcanza el tope. Verificar que el texto existe y que coincide con
      los mensajes de pantalla.

## 8. Integración y cierre

- [ ] 8.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:historias`,
      `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa. Verificar que todo
      pasa y que el PR trae el cuadro de cada requisito de las cuatro especificaciones con la prueba que lo cubre.
- [ ] 8.2 Verificación por mutación (D13): en un branch de desarrollo, debilitar a propósito cada política, disparador y función
      nuevos (quitar la comprobación de rol de `compilar_copia_historia`, permitir generar sin `verificada`, quitar la inserción del
      acceso, quitar el índice de duplicadas, dar `UPDATE` directo, permitir `DELETE`, sacar Psicología del compilado, quitar el
      tope, quitar la regla del menor, omitir `motivo_demora`) y comprobar que al menos una prueba negativa falla; revertir.
      Verificar anotando en el PR la mutación y la prueba que falló, una por elemento.
- [ ] 8.3 Barrido de coherencia entre documentos: `CLAUDE.md` (estado, y la excepción de la copia en la tabla de roles),
      `openspec/config.yaml`, PRD (criterio del 100 %), TECH-DESIGN (modelo de datos, matriz, rutas, acciones, riesgos), ADR
      tocadas (0003, 0031, la nueva), `docs/datos-demo.md`, `docs/pruebas-sql.md`, `docs/pruebas-e2e.md` y `docs/BACKLOG.md`
      (orden de H6d). Verificar con una búsqueda que los textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 8.4 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, migraciones, funciones que entregan
      contenido, handler del documento) con el checklist más estricto, y corrección de sus hallazgos. Verificar que no quedan
      hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la revisión humana aparte que exige el
      proposal.
- [ ] 8.5 Confirmar que ninguna migración ni variable de entorno del change fija el modo `real`, que el PR declara expresamente
      que H6d **no entra en producción con datos reales** mientras P-1 y la consulta del grupo 0 sigan abiertas, y que la ADR de
      la emisión tiene la decisión del usuario escrita. Verificar con una búsqueda de `modo` y `real` en `migrations/` y con la
      prueba pgTAP del modo por defecto en verde.
- [ ] 8.6 Tras el merge, comprobar que el despliegue de producción está READY, que `CLINICA_MODO_DATOS=demostracion` sigue definida
      y que la lista de pendientes carga con los datos de demostración; sembrar solicitudes en producción solo si el usuario lo
      pide. Verificar con la URL pública y con `select public.modo_datos_clinicos()` en el branch de producción.
