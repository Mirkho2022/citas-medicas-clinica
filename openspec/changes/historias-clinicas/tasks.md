# Tasks

Convenciones de todo el change (leer antes de empezar):

- **Este change toca RLS y el acceso a historias clínicas, el riesgo principal del proyecto.** Cada grupo que cambia
  políticas, funciones `SECURITY DEFINER`, disparadores o rutas que sirven contenido clínico termina con una tarea de
  **revisión con el agente `code-review`** y no se da por cerrado hasta corregir o justificar sus hallazgos.
- **Datos reales: prohibidos.** Mientras la decisión legal P-1 siga abierta no se carga ningún dato clínico real. Los datos
  sintéticos de demostración (`docs/datos-demo.md`) sí. Ninguna tarea fija el modo `real` (ver `design.md`, D1).
- Toda tabla nueva en `public` incluye su tarea de migración **y** su tarea de prueba pgTAP negativa; antes de cerrarla se
  confirma que RLS quedó activada (`relrowsecurity`) y que `99_rls_en_todas_las_tablas` pasa. Las migraciones son archivos
  nuevos en `migrations/*.sql` (se crean con `npm run migrate -- create`); **nunca se edita una ya aplicada**, y las secciones
  `down` quedan vacías (ADR-0027). Los números de las pruebas pgTAP son sugeridos.
- Las pruebas pgTAP no asumen tablas vacías (pueden existir datos de demostración) y se corren siempre en un branch de
  desarrollo o efímero de Neon, **nunca en `production`**. Cada grupo deja sus pruebas y su documentación; el último grupo
  solo integra. Los textos de interfaz y los mensajes de error van en español; las fechas, en `America/Lima`.
- Las tareas de pantalla (1.5, 4.5, 5.4 y los grupos 6 a 10) usan los componentes y el tema de H2b
  (`sistema-de-diseno-ui`); si aún no está aplicado, se avanza con los grupos 0 a 3 y con la parte sin pantalla de los
  demás, y se retoma. Los textos de las tareas que editan `CLAUDE.md`, `docs/` o ADR son
  para el momento de aplicar el change; este change no las modifica al proponerse.

## 0. Decisiones previas y verificaciones

- [ ] 0.1 Confirmar que el change `esquema-rls-pgtap` (H2) está mergeado o archivado y que la rama parte de él; aplicar las
      migraciones en un branch de desarrollo de Neon y correr `npm run test:pgtap`. Verificar que la línea base está en verde
      y anotar el número de pruebas en el PR.
- [ ] 0.2 Con la skill `architecture`, crear la ADR «Modo de datos clínicos: demostración y real» (siguiente número libre en
      `docs/adrs/`; 0029 al proponerse) que recoja `design.md` D1 sin decidir P-1, enlazarla en la tabla de ADR de
      TECH-DESIGN y dejarla en estado «Propuesto» hasta que el usuario la acepte. Verificar que el archivo existe, que los
      enlaces relativos resuelven y que el estado no es «Aceptado».
- [ ] 0.3 Con la misma skill, crear la ADR «Sello de tiempo y huella de la firma lógica» (D5), que aclara que no resuelve
      P-1 ni P-5. Verificar lo mismo que en 0.2.
- [ ] 0.4 Verificar en la documentación vigente de `@vercel/blob`: (a) almacenamiento privado, (b) subida directa desde el
      navegador con permiso emitido por el servidor y restricción de tipo y tamaño, (c) URL firmada de corta duración o lectura
      desde el servidor, (d) cuotas del plan gratuito. Anotar resultado, fecha y enlaces en `design.md`, D7. Si (a) o (b) no
      existen, detener el grupo 10 y consultar al usuario (reabre ADR-0024). Verificar que la nota existe y es consultable.
- [ ] 0.5 Determinar qué fuente oficial de CIE-10 (MINSA/SUSALUD primero, OMS ClaML de respaldo) es descargable hoy en formato
      reutilizable, con su versión, licencia y URL; anotarlo en `design.md`, D4. Si ninguna fuente oficial es reutilizable,
      detenerse y consultar (ADR-0014 prohíbe usar un mirror de terceros como fuente de verdad). Verificar que la nota
      contiene fuente, versión, fecha y condiciones de uso.
- [ ] 0.6 Revisar con el personal médico (o, si no hay acceso, dejarlo escrito como supuesto sin validar y avisar al usuario)
      los tipos de diagnóstico (`presuntivo`, `definitivo`, `repetitivo`), las cinco categorías de antecedentes (ADR-0015),
      el tamaño máximo de adjunto y si se admiten imágenes además de PDF. Verificar que las respuestas o el supuesto constan en
      `design.md` (Preguntas abiertas).
- [ ] 0.7 Coordinar con los changes en paralelo: de H2b, los nombres exactos de `AtencionFirmada`, `Campo`, `Alerta`,
      `ConsolaLayout` y `lib/ui/formato.ts`; de H3 (dueña de las transiciones de la cita: recepción confirma y marca «no
      asistió», el médico marca «atendida»), el contrato de su acción `marcarAtendida` (`app/medico/acciones-cita.ts`, sobre `public.marcar_cita_atendida()`) que invocará el botón
      secundario de 8.3 (D13), y que la confirmación de recepción es lo que crea la asignación automática; y los archivos
      compartidos (`lib/ui/navegacion.ts`, `package.json`, `.env.example`). Verificar que el contrato de la acción y las
      decisiones constan en `design.md`, D13, y que este change no añade ninguna política ni función sobre `citas`.

## 1. Bloqueo de datos clínicos reales (P-1)

- [ ] 1.1 Migración `modo-de-datos-clinicos`: tabla `configuracion_clinica` de una fila (`CHECK` de referencia legal cuando
      `modo = 'real'`), con RLS activada y **sin `GRANT` ni política** para ningún rol de usuario; `modo_datos_clinicos()`,
      `exigir_modo_clinico(text)` (lanza `HC004`), `paciente_es_de_demostracion(uuid)` y `exigir_paciente_admisible()`
      (lanza `HC002`) como `SECURITY DEFINER` con `search_path` vacío y `EXECUTE` solo a `authenticated`; disparadores
      `BEFORE INSERT` en `atenciones`, `addendas` y `antecedentes`. Verificar con `npm run migrate -- up` en un branch de
      desarrollo y consultando `relrowsecurity` de la tabla nueva.
- [ ] 1.2 Prueba pgTAP **negativa** de la tabla nueva en `tests/pgtap/55_modo_datos_clinicos.test.sql`: RLS activada;
      administrativo, médico, enfermera, paciente y sin rol no pueden leer, insertar, actualizar ni borrar la tabla;
      `has_table_privilege` es falso para `authenticated`, `anonymous`, `cron_notificaciones` y `sync_identidad`;
      `modo_datos_clinicos()` es ejecutable por `authenticated` y no por `anonymous`. Verificar que pasa y que
      `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 1.3 En el mismo archivo, pruebas de la guarda: el modo de una base recién migrada es `demostracion` (puerta de revisión);
      `real` sin referencia legal falla con `23514`; un paciente `@demo.invalid` admite atención, addenda y antecedente; un
      paciente de otro dominio se rechaza con `HC002` en cada tabla; en modo `real` (fijado como dueño dentro de la transacción
      de prueba) ocurre lo inverso; `exigir_modo_clinico` pasa si coincide y lanza `HC004` si no. Verificar que pasan y que las
      pruebas existentes 40 a 47 y 52 a 53 pasan sin modificarse.
- [ ] 1.4 `lib/historias/modo.ts` (lee `CLINICA_MODO_DATOS`, ausente o inválida = `demostracion`; arma la sentencia
      `select public.exigir_modo_clinico(...)`) y `tests/historias/modo.test.ts` con `node:test`; añadir el script
      `test:historias` a `package.json` y un paso `npm run test:historias` al job `typecheck-lint-build` de
      `.github/workflows/ci.yml`. Verificar que `npm run test:historias` pasa, que falla al cambiar a propósito un valor
      esperado y que el paso aparece en el PR.
- [ ] 1.5 Componentes `AvisoModoDemostracion` (texto exacto «Modo demostración: use solo datos ficticios. No ingrese datos de
      pacientes reales.», con icono y `role="status"`) y `ModuloNoDisponible` («Módulo no disponible: configuración
      inconsistente»), sobre `Alerta` de H2b. Verificar con `npm run typecheck`, `npm run lint` y su aparición en la galería
      `/guia-de-estilo` si existe.
- [ ] 1.6 Documentar el mecanismo: `.env.example` (`CLINICA_MODO_DATOS=demostracion`, con advertencia de P-1), `docs/datos-demo.md`
      (sembrar en modo `real` se rechaza por diseño), `CLAUDE.md` (el módulo opera solo en modo demostración mientras P-1
      siga abierta y cómo se impone) y pedir al usuario definir `CLINICA_MODO_DATOS=demostracion` en Production y Preview de
      Vercel. Verificar buscando la variable en `docs/` y `.env.example` y comprobando que los enlaces relativos resuelven.
- [ ] 1.7 Revisión con el agente `code-review` de la migración del grupo (funciones `SECURITY DEFINER`, `search_path`
      vacío, `REVOKE ... FROM PUBLIC`, ausencia de `GRANT` en la tabla). Verificar que cada hallazgo se corrige o se justifica
      por escrito en el PR.

## 2. Catálogo CIE-10 y validación de diagnósticos

- [ ] 2.1 `scripts/preparar-cie10.ts`: convierte la fuente elegida en 0.5 a un CSV determinista
      `datos/cie10/<fuente>-<versión>.csv` con `codigo,descripcion,capitulo`, su huella SHA-256 y un `LEEME.md` con fuente,
      versión, URL y fecha. Prueba `node:test` del analizador con un fragmento sintético. Verificar que dos ejecuciones dan el
      mismo archivo y huella, sin códigos duplicados, y que la prueba pasa.
- [ ] 2.2 Migración de datos `cargar-cie10` generada por el script (encabezado con fuente, versión y huella;
      `insert ... on conflict (codigo) do nothing` en lotes). Debe quedar **antes** que la migración de validación de 2.3.
      Verificar que tras migrar el conteo de `cie10` iguala al del CSV, que `R51`, `I10`, `E11.9` y `J00` existen, que
      aplicarla otra vez no cambia el conteo y que la siembra de demostración convive sin duplicar.
- [ ] 2.3 Migración `validar-diagnosticos`: disparador `SECURITY DEFINER` (`BEFORE INSERT OR UPDATE OF diagnosticos`) que
      reconstruye el arreglo con código existente, descripción del catálogo, `tipo` permitido si viene, sin claves ajenas ni
      repetidos (`HC001`) y que **no actúa** si el valor no es un arreglo o está vacío. Verificar que la migración se aplica y
      que las pruebas 40 a 47 siguen en verde sin modificarse.
- [ ] 2.4 Prueba pgTAP `tests/pgtap/48_cie10_y_diagnosticos.test.sql`: código inexistente, descripción sobrescrita, claves
      ajenas descartadas, tipo inválido, código repetido, lista vacía / objeto / omitido siguen rechazados con `23514`, el
      `UPDATE` del borrador revalida, y un cambio posterior de `cie10` hecho como dueño no altera una atención firmada;
      además, negativos del catálogo: ningún rol de usuario inserta, actualiza ni borra y una sesión sin rol no lo lee.
      Verificar que pasa.
- [ ] 2.5 `lib/cie10/buscar.ts` y `app/api/cie10/route.ts` (`auth.protect()`, rol médico, mínimo 2 caracteres, máximo 20,
      coincidencias de código primero, `translate` de tildes en ambos lados) con `tests/historias/cie10-buscar.test.ts`
      (`hipertension`, `i10`, mayúsculas, `ñ`, límite). Medir con `EXPLAIN ANALYZE` sobre el catálogo cargado. Verificar que
      las pruebas pasan, que la consulta cabe en el presupuesto de latencia (valor inicial 50 ms; anotar el medido) y que sin
      sesión o con rol no médico no se devuelven resultados.
- [ ] 2.6 Documentar: nota fechada en ADR-0014 (fuente elegida, versión, huella, validación por disparador) y en
      `docs/pruebas-sql.md` las pruebas nuevas. Verificar que los enlaces relativos resuelven.
- [ ] 2.7 Revisión con el agente `code-review` del disparador de diagnósticos (reescritura de `jsonb`, `SECURITY DEFINER`) y
      de la ruta de búsqueda. Verificar que los hallazgos quedan resueltos o justificados.

## 3. Integridad en la base de datos: sello, huella, cita y perfil activo

- [ ] 3.1 Migración `sello-y-huella-de-atenciones`: columnas `firma_metodo` y `firma_huella` en `atenciones`, función
      `huella_atencion(uuid)` (`'v1:'` + SHA-256 del `jsonb` canónico de D5), `CHECK ... NOT VALID` «firmada ⇒ método y
      huella», y disparadores `BEFORE INSERT/UPDATE` que, solo si `current_user = 'authenticated'`, fijan `creado_en` (en
      `atenciones`, `addendas` y `antecedentes`) y `firmada_en` al firmar, y que para cualquier rol calculan método y huella
      cuando la fila nace o queda firmada. Verificar que se aplica y que el disparador `atenciones_inmutables` sigue
      ejecutándose antes del de sello.
- [ ] 3.2 Migración `coherencia-de-cita`: disparador `SECURITY DEFINER` (`HC003`) que exige que `cita_id`, si viene, sea de
      la misma `paciente_id` y `medico_id`. Verificar que se aplica.
- [ ] 3.3 Prueba pgTAP `tests/pgtap/49_sello_y_huella.test.sql`: una `firmada_en` o `creado_en` enviada por el médico se
      sobrescribe con la hora del servidor (atenciones, addendas, antecedentes); el dueño (siembra) conserva sus valores pero
      obtiene huella; la huella coincide con su recálculo y deja de coincidir si se altera el contenido (deshabilitando el
      disparador de inmutabilidad solo dentro de la transacción de prueba, que se revierte); `HC003` con cita de otro médico y
      de otro paciente, cita nula admitida, segunda atención de la misma cita `23505` y firmar una atención vinculada no modifica el estado de su cita; y negativos: otro médico, administrativo,
      paciente y enfermera no firman. Verificar que pasa y que 44 y 53 no se modificaron.
- [ ] 3.4 Migración `acceso-medico-con-perfil-activo`: `create or replace` de `medico_tiene_paciente()` con la misma firma,
      añadiendo `perfiles.activo`. Prueba pgTAP `tests/pgtap/59_acceso_perfil_activo.test.sql`: un médico con perfil
      desactivado pierde el acceso a atenciones, historias, antecedentes y accesos aunque su asignación esté vigente y su
      `medicos.activo` sea verdadero; al reactivarlo lo recupera. Verificar que pasa y que las pruebas 42, 43, 45, 46 y 52
      siguen en verde sin editarse.
- [ ] 3.5 Actualizar `tests/pgtap/47_estructura_historia.test.sql` con las dos columnas nuevas de `atenciones` (a propósito:
      la prueba existe para que añadir columnas obligue a revisarla). Verificar que 47 pasa y que toda la suite pgTAP completa
      pasa.
- [ ] 3.6 Prueba de concurrencia `tests/concurrencia/20_firma_edicion.test.ts` (dos sesiones `pg`): un `UPDATE` del contenido
      concurrente con la firma, tras confirmarse esta, no cambia el contenido firmado. Verificar que pasa 20 rondas seguidas y
      actualizar `docs/pruebas-sql.md`.
- [ ] 3.7 Documentar: TECH-DESIGN («Modelo de datos» de `atenciones` con las columnas nuevas y «Inmutabilidad» con el sello del
      servidor) y nota en ADR-0016 sobre `perfiles.activo`. Verificar que los enlaces resuelven.
- [ ] 3.8 Revisión con el agente `code-review`, con atención especial a `medico_tiene_paciente()` (función central de
      acceso) y a los disparadores de sello. Verificar que los hallazgos quedan resueltos o justificados.

## 4. Acceso a datos clínicos y auditoría de accesos

- [ ] 4.1 Migración `accesos-historia-tipo`: columnas `tipo_acceso` (`historia`, `atencion`, `adjunto`; por defecto `historia`)
      y `adjunto_id` en `accesos_historia`. Verificar que se aplica sin tocar las filas existentes.
- [ ] 4.2 Prueba pgTAP `tests/pgtap/56_accesos_historia_tipo.test.sql`: cada tipo permitido se inserta, uno no permitido falla
      con `23514`; negativos: médico sin asignación, médico a nombre de otro, administrativo, paciente y enfermera no insertan;
      médico, paciente y enfermera no leen; el administrativo lee; sigue siendo solo-agregar. Verificar que pasa y que 52 sigue
      en verde.
- [ ] 4.3 `lib/historias/guardia.ts` (`auth.protect()`, `exigirRol("medico")`, MFA) y `lib/historias/repositorio.ts` con
      ejecutor inyectable: `listarPacientesACargo`, `abrirHistoria` y `abrirAtencion`, cada una en una sola transacción
      (modo → acceso → lectura) y con el manejo de `42501` descrito en D2. Pruebas `node:test` con ejecutor simulado:
      el orden de sentencias, que si la inserción de acceso lanza no se devuelve contenido, y que el modo va siempre primero.
      Verificar que pasan.
- [ ] 4.4 `tests/historias/acceso-unico.test.ts`: falla si algún archivo de `app/`, `lib/` o `components/` fuera de
      `lib/historias/` contiene SQL contra las tablas clínicas, de asignaciones o de accesos. Verificar que pasa y que falla
      al añadir temporalmente una consulta en otro archivo (revertida).
- [ ] 4.5 Pantalla `app/administrativo/accesos-historia/page.tsx` (`auth.protect()`, `exigirRol("administrativo")`, MFA):
      filtros por documento del paciente, médico y rango de fechas, paginación, hora de Lima y sin contenido clínico; activar
      el destino en `lib/ui/navegacion.ts`. Verificar con `npm run typecheck` y `npm run lint`; su E2E se cubre en 6.4.
- [ ] 4.6 Documentar: TECH-DESIGN («Seguridad»: lectura atómica con auditoría y tipos de acceso) y `CLAUDE.md` (regla: todo SQL
      clínico vive en `lib/historias/`). Verificar que los textos coinciden entre sí y que los enlaces resuelven.
- [ ] 4.7 Revisión con el agente `code-review` del repositorio, la guardia y la pantalla de revisión (lectura sin rastro,
      orden de sentencias, fugas). Verificar que los hallazgos quedan resueltos o justificados.

## 5. Asignación manual paciente-médico

- [ ] 5.1 Migración `asignaciones-manuales`: `alter policy asignaciones_inserta_el_administrativo` para exigir `motivo` con
      contenido y sin prefijo `cita:`. Verificar que se aplica.
- [ ] 5.2 Prueba pgTAP `tests/pgtap/57_asignaciones_manuales.test.sql`: motivo nulo, de solo espacios o `cita:...` se rechaza
      (`42501`); uno válido se acepta con y sin vencimiento; el disparador de citas sigue creando su asignación; un médico no
      inserta, edita ni borra; un médico lee solo las suyas; paciente y enfermera no leen ni insertan; médico inactivo no
      obtiene acceso. Verificar que pasa y que 42 y 45 siguen en verde sin editarse.
- [ ] 5.3 Esquema Zod de la asignación, `lib/historias/asignaciones.ts` y la acción `asignarPacienteAMedico` (documento válido
      DNI/CE, médico activo, motivo obligatorio, vencimiento ≥ hoy en Lima). Pruebas `node:test`. Verificar que pasan.
- [ ] 5.4 Pantalla `app/administrativo/asignaciones/`: buscar paciente por documento, elegir médico activo, motivo y
      vencimiento, la advertencia «El médico podrá ver la historia clínica completa del paciente» y la lista de asignaciones
      vigentes del paciente. E2E `e2e/historias-asignacion.spec.ts`: el administrativo asigna, el médico ve al paciente en su
      lista; el administrativo sigue sin ver contenido; un médico no abre la pantalla. Verificar que pasa y axe sin
      violaciones.
- [ ] 5.5 Documentar: matriz de acceso de TECH-DESIGN (asignaciones) y nota en ADR-0016 (motivos reservados). Verificar los
      enlaces.
- [ ] 5.6 Revisión con el agente `code-review` de la política modificada y de la acción (concesión de acceso clínico).
      Verificar que los hallazgos quedan resueltos o justificados.

## 6. Lectura: lista de pacientes e historia clínica

- [ ] 6.1 `app/medico/pacientes/page.tsx`: lista de pacientes a cargo con búsqueda por apellidos, nombres o documento; activar
      «Pacientes» en la navegación. Verificar con `npm run typecheck`, `npm run lint` y la regla de protección de Clerk.
- [ ] 6.2 `app/medico/pacientes/[pacienteId]/page.tsx`: ficha de solo lectura (texto, sin controles), antecedentes vigentes por
      tipo, atenciones paginadas con sus addendas (borradores de otro médico etiquetados «Borrador sin firmar»), «Diagnósticos
      registrados» (D12) y los estados «historia aún no habilitada», «no encontrada» (`notFound()`) y «módulo no disponible».
      Verificar con `npm run typecheck` y revisión visual con datos de demostración.
- [ ] 6.3 `Cache-Control: private, no-store` en `next.config.ts` para `/medico/pacientes/:path*` y `/api/historias/:path*`,
      páginas dinámicas, título «Historia clínica» y direcciones solo con `uuid`. Verificar con `curl -I` contra `next start`
      y con una prueba E2E de cabeceras y título.
- [ ] 6.4 E2E `e2e/historias-acceso.spec.ts` (con la base sembrada según `docs/datos-demo.md`; si no hay datos se omite con un
      mensaje explícito): el médico abre su paciente y el administrativo ve el acceso registrado; un paciente ajeno devuelve 404
      igual que uno inexistente; administrativo, paciente y enfermera son redirigidos sin ver contenido; sin sesión redirige;
      se ve el aviso de demostración; las cabeceras son las esperadas. Prueba de unidad de la guardia para «sin MFA». axe sobre
      lista e historia. Verificar que pasan.
- [ ] 6.5 Documentar en `docs/pruebas-e2e.md` los datos y cuentas que requieren estas pruebas. Verificar los enlaces.
- [ ] 6.6 Revisión con el agente `code-review` de las rutas de lectura (canales laterales, 404 uniforme, caché, orden de
      sentencias). Verificar que los hallazgos quedan resueltos o justificados.

## 7. Registro de atención

- [ ] 7.1 `lib/schemas/historia-clinica.ts` (Zod 3, `.strict()`, texto con contenido que rechaza también invisibles y `U+0000`,
      NFC, límites iniciales de D3, 1 a 10 diagnósticos únicos con `cie10` y `tipo`) y `tests/historias/esquemas.test.ts` con los
      casos de la especificación (vacío, espacios, tabulador y salto de línea, ancho cero, NUL, longitud máxima, sin
      diagnósticos, repetido, tipo inválido, clave ajena). Verificar que pasan y que fallan al relajar una regla a propósito.
- [ ] 7.2 `lib/historias/errores.ts` con el mapeo de D10 (`HC001` a `HC004`, `42501` con y sin «Atención firmada», `23505`,
      `23514`, otros) y `tests/historias/errores.test.ts`. Verificar que cada fila de la tabla tiene su prueba y que ningún
      mensaje contiene texto de la base.
- [ ] 7.3 Acciones `registrarAtencion` y `actualizarBorrador` (Zod en servidor → repositorio con `id` generado y modo primero →
      mapeo; resultado tipado). Verificar con pruebas `node:test` de ejecutor simulado: una entrada inválida no llega a la base,
      una clave ajena se rechaza y ningún error crudo escapa.
- [ ] 7.4 Componentes `FichaPaciente`, `SelectorDiagnostico` (combobox accesible, teclado, 200 ms) y `FormularioAtencion`
      (`react-hook-form` con el mismo esquema, barra fija, errores por campo sin vaciar lo escrito, aviso al abandonar, sin
      almacenamiento del navegador, motivo prellenado desde la cita) y las páginas `atenciones/nueva` y
      `atenciones/[atencionId]` (editar borrador). Verificar con `npm run typecheck`, `npm run lint` y recorrido manual.
- [ ] 7.5 E2E `e2e/historias-registro.spec.ts`: guardar con campos vacíos muestra errores y no guarda; diagnóstico repetido;
      un diagnóstico buscado por teclado; otro médico no edita el borrador; no hay controles editables de datos del paciente;
      `localStorage` y `sessionStorage` no contienen texto clínico; axe. Verificar que pasan.
- [ ] 7.6 Documentar la tabla de Server Actions de TECH-DESIGN (`actualizarBorrador` y las demás nuevas) y la regla de
      validación en tres capas en ADR-0004 (nota). Verificar los enlaces.
- [ ] 7.7 Revisión con el agente `code-review` de las acciones (validación en servidor, mapeo de errores, fugas de existencia).
      Verificar que los hallazgos quedan resueltos o justificados.

## 8. Firma y addendas

- [ ] 8.1 `lib/firma/proveedor.ts` (interfaz `ProveedorFirma`) y `lib/firma/firma-logica.ts` (sin servicio externo, método
      `logica`) con `tests/historias/firma.test.ts`. Verificar que pasan y que la interfaz no importa nada de la implementación.
- [ ] 8.2 Acción `firmarAtencion` y la opción `firmar` de `registrarAtencion` (`INSERT` con `id` generado y `UPDATE` en la misma
      transacción), con mapeo de «Atención firmada». Verificar con ejecutor simulado que ambos pasos van en una transacción y
      que un fallo del segundo no deja la atención.
- [ ] 8.3 Interfaz: «Firmar atención» con diálogo de confirmación, `AtencionFirmada` (H2b) con candado, fecha y hora de Lima,
      autor y sin controles de edición, «Borrador sin firmar» para borradores ajenos, acción `agregarAddenda` y su formulario,
      addendas en orden cronológico; y, si la atención está vinculada a una cita `confirmada`, un botón secundario aparte «Marcar cita como atendida» que invoca la acción de H3 sin acoplarse a la firma (su fallo muestra su propio mensaje y no afecta lo firmado; se omite si H3 no la entrega). Verificar con `npm run typecheck` y recorrido manual.
- [ ] 8.4 E2E `e2e/historias-firma.spec.ts`: firmar deja la atención sin botón de editar; guardar después de firmar muestra
      «Esta atención ya está firmada…»; la addenda aparece con autor y fecha y el original no cambia; addenda vacía rechazada;
      administrativo, paciente y enfermera no firman ni ven addendas; firmar no cambia el estado de la cita y, si la acción de H3 falla, la atención sigue firmada; axe. Verificar que pasan.
- [ ] 8.5 Documentar: TECH-DESIGN (P-5 implementado como interfaz, sin afirmar validez legal) y la ADR del sello (0.3) pasa a
      referenciar la implementación. Verificar los enlaces.
- [ ] 8.6 Revisión con el agente `code-review` de la firma y las addendas (sello del servidor, inmutabilidad, atomicidad).
      Verificar que los hallazgos quedan resueltos o justificados.

## 9. Antecedentes e indicador de digitalización

- [ ] 9.1 Acciones `registrarAntecedente`, `marcarAntecedenteNoVigente` y `reemplazarAntecedente` (marcar el anterior y registrar
      el nuevo en una transacción), sus esquemas Zod y su repositorio, con pruebas `node:test` de ejecutor simulado (todo o
      nada, descripción sin contenido, tipo inválido). Verificar que pasan.
- [ ] 9.2 Panel de antecedentes en la historia y en el formulario (vigentes agrupados por tipo, agregar, marcar no vigente,
      corregir); E2E `e2e/historias-antecedentes.spec.ts` con negativos de administrativo, paciente y enfermera; axe. Verificar
      que pasan.
- [ ] 9.3 Si 0.6 añadió una categoría de antecedente: migración `ALTER TYPE tipo_antecedente ADD VALUE`, ajuste del esquema Zod
      y de la interfaz, y prueba pgTAP que la acepta y rechaza una no listada. Si 0.6 no añadió ninguna, marcar la tarea como
      no aplicable con esa justificación. Verificar según el caso.
- [ ] 9.4 Migración `indicador-digitalizacion` (función `SECURITY DEFINER`, solo conteos, solo administrativo, `42501` para los
      demás) y prueba pgTAP `tests/pgtap/58_indicador_digitalizacion.test.sql`: los siete escenarios de la especificación;
      médico, enfermera, paciente y `anonymous` no obtienen conteo; no se devuelven identificadores ni textos. Verificar que
      pasa.
- [ ] 9.5 Documentar: nota en ADR-0013 con la definición operativa de D12 («diagnósticos registrados», historias migradas con
      antecedentes, sin atención ficticia de apertura) y, si aplica, en ADR-0015. Verificar los enlaces.
- [ ] 9.6 Revisión con el agente `code-review` de las acciones de antecedentes y de la función del indicador. Verificar que los
      hallazgos quedan resueltos o justificados.

## 10. Adjuntos de respaldo

- [ ] 10.1 Migración `adjuntos-historia`: tabla (clave compuesta con `historias_clinicas`, `clave_blob` única, tipo `application/pdf`,
      tamaño máximo, `vigente`, `motivo_anulacion` obligatorio al anular), RLS activada, `GRANT` y políticas **idénticos a
      `atenciones`**, `UPDATE` solo de `vigente` y `motivo_anulacion`, disparador que rechaza otros cambios y todo `DELETE`,
      disparador de modo (D1), disparador de auditoría y `create or replace` de `registrar_auditoria()` incluyendo
      `adjuntos_historia` entre las tablas sin contenido. Verificar con `npm run migrate -- up` y `relrowsecurity` de la tabla.
- [ ] 10.2 Prueba pgTAP **negativa** `tests/pgtap/54_adjuntos_historia_rls.test.sql`: RLS activada; el médico a cargo lee e
      inserta; otro médico, asignación vencida y perfil inactivo no ven ni insertan; administrativo, paciente, enfermera y sin
      rol no leen (cero filas) ni insertan; `has_table_privilege` falso para `anonymous`, `cron_notificaciones` y
      `sync_identidad`; `UPDATE` de columnas no permitidas y `DELETE` rechazados; anular sin motivo rechazado; paciente real en
      modo demostración (`HC002`); y la auditoría que lee el administrativo no contiene `nombre_original`. Verificar que pasa y
      que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 10.3 `lib/historias/adjuntos.ts`: Route Handler de permiso de subida (`app/api/historias/adjuntos/subida/route.ts`:
      sesión, rol, MFA, modo, médico a cargo, solo PDF, tamaño máximo, nombre aleatorio), acción `registrarAdjunto` (tipo y
      tamaño reales, cabecera `%PDF-`, `INSERT` bajo RLS, eliminar el archivo rechazado) y `anularAdjunto`, con pruebas
      `node:test` y un Blob simulado. Verificar que pasan, incluidos «no PDF», «demasiado grande» y «sin asignación».
- [ ] 10.4 Route Handler de descarga `app/medico/pacientes/[pacienteId]/adjuntos/[adjuntoId]/route.ts` (modo → acceso `adjunto`
      → lectura de la fila → entrega con `no-store`, `nosniff` y `Content-Disposition`), con 404 idéntico para ajeno e
      inexistente. Verificar con pruebas `node:test` (orden de sentencias, sin fila no hay entrega, el fallo del registro no
      entrega) y una E2E.
- [ ] 10.5 Interfaz de adjuntos en la historia (subir con progreso, lista de vigentes, abrir, anular con motivo) y E2E
      `e2e/historias-adjuntos.spec.ts` con un PDF sintético mínimo (se omite con aviso si falta `BLOB_READ_WRITE_TOKEN`): subir,
      abrir, anular, adjunto ajeno 404, administrativo sin acceso; axe. Verificar que pasa.
- [ ] 10.6 Documentar: nota en ADR-0024 (la fila RLS pasa a ser la autoridad de acceso y se estrecha la excepción), TECH-DESIGN
      (tabla `adjuntos_historia`, «Controles adicionales» y riesgos), `.env.example` (`BLOB_READ_WRITE_TOKEN`) y la dependencia
      `@vercel/blob` en `package.json`. Verificar que los textos coinciden y que los enlaces resuelven.
- [ ] 10.7 Revisión con el agente `code-review` de la tabla, las políticas y de los Route Handlers (nada se entrega sin fila
      legible, tipo y tamaño reales, auditoría). Verificar que los hallazgos quedan resueltos o justificados.

## 11. Integración y cierre

- [ ] 11.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:historias`,
      `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa. Verificar que todo
      pasa y que el PR trae el cuadro de cada requisito de las nueve especificaciones con la prueba que lo cubre.
- [ ] 11.2 Verificación por mutación (D14): en un branch de desarrollo, debilitar a propósito cada política y disparador nuevo
      (p. ej. quitar `medico_tiene_paciente` de la política de `adjuntos_historia`, quitar la guarda de modo, no sellar
      `firmada_en`, aceptar `cita:` en asignaciones) y comprobar que al menos una prueba negativa falla; revertir. Verificar
      anotando en el PR la mutación y la prueba que falló, una por elemento.
- [ ] 11.3 Prueba de usabilidad de la carga rápida con al menos un médico (si no es posible, un recorrido cronometrado por el
      equipo con una atención típica, dejándolo registrado como sustituto): medir el tiempo de una atención completa y los
      errores. Verificar que el resultado consta en el PR y que, si supera el objetivo inicial de 3 minutos, se anotan los
      ajustes de interfaz acordados.
- [ ] 11.4 Barrido de coherencia entre documentos (formato de `coherencia.md` de H2 en este change): `CLAUDE.md` (estado y
      reglas), TECH-DESIGN (rutas reales de las áreas, tablas y columnas nuevas, acciones, fila H6 con su bloqueo por P-1),
      ADR tocadas, `docs/datos-demo.md`, `docs/pruebas-sql.md`, `docs/pruebas-e2e.md` y el estado de P-1 («abierta»). Verificar
      con una búsqueda que los textos no se contradicen y que ningún enlace relativo está roto.
- [ ] 11.5 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, migraciones, acceso a historias
      clínicas, Server Actions, Route Handlers de adjuntos) con el checklist más estricto, y corrección de sus hallazgos.
      Verificar que no quedan hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR para la revisión
      humana aparte que exige el proposal.
- [ ] 11.6 Confirmar que ninguna migración ni variable de entorno del change fija el modo `real` y que el PR declara
      expresamente que H6 **no entra en producción con datos reales** mientras P-1 siga abierta. Verificar con una búsqueda de
      `modo` y `real` en `migrations/` y con la prueba pgTAP del modo por defecto en verde.
- [ ] 11.7 Tras el merge, comprobar que el despliegue de producción está READY, que `CLINICA_MODO_DATOS=demostracion` está
      definida y que el aviso de demostración se ve en la historia; sembrar datos de demostración en producción solo si el
      usuario lo pide. Verificar con la URL pública y con `select public.modo_datos_clinicos()` en el branch de producción.
