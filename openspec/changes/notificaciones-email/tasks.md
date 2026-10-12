# Tasks

Convenciones de todo el change: **no hay tablas nuevas** (`notificaciones` ya existe y su RLS no cambia), pero sí objetos de
seguridad nuevos —columnas, un `CHECK`, dos disparadores y seis funciones—, y cada uno trae aquí su prueba pgTAP
**negativa** (el rol equivocado no ve, no escribe o no ejecuta), no solo la migración. Las migraciones son archivos
**nuevos** en `migrations/*.sql` (`npm run migrate -- create …`, formato `node-pg-migrate` de las existentes); nunca se
edita una ya aplicada. Los archivos pgTAP nuevos usan la numeración `80`–`85` (H3, H4, H6 y H7 usan otros rangos; confirmar que no
chocan al implementar). Las pruebas unitarias van en `tests/notificaciones/` con `node --test`, las de integración en
`tests/integracion/`, las de concurrencia en `tests/concurrencia/` (`30_…`) y las de navegador en `e2e/`. Ninguna prueba
envía correo real. Cada grupo deja sus pruebas y su documentación; el último solo integra. Las dependencias nuevas se
instalan con la autorización del usuario. **Ninguna tarea toca historias clínicas**: ningún objeto nuevo lee `atenciones`,
`antecedentes`, `addendas`, `historias_clinicas`, `asignaciones_paciente_medico`, `visitas`, `triajes`, `derivaciones`, `recetas`, `solicitudes_copia_historia` ni `citas.motivo`.

## 1. Base: supuestos de H3, dependencias, variables y conexión del cron

- [ ] 1.1 Leer el código real de H3 (y de H4 si ya existe) y contrastarlo con los supuestos de `design.md` D13: punto único
      de inserción de citas, `lib/notificaciones/eventos-cita.ts`, forma del resultado tipado, enlace `reprogramada_de`
      y estados con los que nacen las citas. Verificar con una nota en el PR (tabla supuesto / realidad / ajuste); si algo
      difiere, ajustar solo la tarea 6.2 y dejarlo anotado en `design.md` D13.
- [ ] 1.2 Con autorización del usuario, instalar `resend` y, si H2b/H3 no lo hicieron, `date-fns` y `date-fns-tz`. Verificar
      con `npm ls resend date-fns date-fns-tz`, `npm run typecheck` y `npm run build`.
- [ ] 1.3 Declarar en `.env.example` (con comentario de dónde sale cada valor y cuáles son secretos del servidor, nunca
      `NEXT_PUBLIC_`) `DATABASE_CRON_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `NOTIFICACIONES_PROVEEDOR` (`resend` |
      `simulado`, por omisión `simulado`), `NOTIFICACIONES_REMITENTE`, `NOMBRE_CLINICA`, `CONTACTO_CLINICA` y `APP_URL`; añadir
      el script `test:notificaciones` (`node --test "tests/notificaciones/*.test.ts"`) a `package.json`. Verificar que todo
      `process.env.X` que usen las tareas siguientes está en `.env.example` (búsqueda con `Grep`) y que el script corre
      (con 0 pruebas aún).
- [ ] 1.4 Crear `lib/db/cliente-cron.ts` (`neon(DATABASE_CRON_URL)` solo HTTP, falla con mensaje claro si falta la variable,
      comentario con la regla «nunca en tráfico de usuario»), la regla `no-restricted-imports` en `eslint.config.mjs` que solo
      permite importarlo desde `app/api/cron/**` y `lib/notificaciones/cron/**`, y `tests/notificaciones/aislamiento-cron.test.ts`
      que recorre los imports del repositorio y falla si lo importa otro archivo. Verificar: `npm run lint` pasa; un
      import temporal desde `app/administrativo/page.tsx` hace fallar el lint **y** la prueba (se revierte); `npm run
      test:notificaciones` pasa.
- [ ] 1.5 Añadir `npm run test:notificaciones` al job `typecheck-lint-build` de `.github/workflows/ci.yml` (archivo con CRLF:
      conservarlos) y comprobar que los pasos `test:pgtap`, `test:concurrencia` y `test:integracion` de `neon-branch-pr.yml`
      recogen los archivos nuevos por su patrón sin cambios. Verificar en el PR que el paso aparece y pasa.

## 2. Esquema: columnas de reintento, copia del contenido y tipo `reprogramacion`

- [ ] 2.1 Migración nueva `…_notificaciones-columnas-y-tipo.sql`: `alter table public.notificaciones add column contenido
      jsonb, add column ultimo_intento_en timestamptz`; reemplazar el `CHECK` de `tipo` por los cuatro valores
      (`recordatorio_24h`, `confirmacion_reserva`, `cancelacion`, `reprogramacion`) tras consultar su nombre real en el
      catálogo. Sin `GRANT` nuevo (los de tabla ya cubren las columnas). Verificar con `npm run migrate -- up` en el branch
      `dev` y `migrate up --dry-run` sin pendientes, y que `\d public.notificaciones` muestra las columnas y el `CHECK`.
- [ ] 2.2 `tests/pgtap/80_notificaciones_columnas.test.sql`: las columnas existen y admiten nulo; el `CHECK` acepta los cuatro
      tipos y rechaza `spam` (`23514`); el rol del cron actualiza `contenido` y `ultimo_intento_en`; **negativas:**
      `cron_notificaciones` sigue sin `SELECT` sobre `pacientes`, `perfiles`, `medicos`, `especialidades` y sin `UPDATE` sobre
      `citas` (`has_table_privilege` y `42501`); con una fila que tiene `contenido`, el administrativo la ve y paciente, médico,
      enfermera y sesión sin rol obtienen 0 filas; `notificaciones` conserva RLS. Verificar que pasa, que
      `99_rls_en_todas_las_tablas` pasa y que falla al quitar a propósito el valor `reprogramacion` del `CHECK`.

## 3. Esquema: recordatorio al crear la cita, vigencia y corrección del correo

- [ ] 3.1 Migración nueva `…_avisos-al-crear-cita.sql` (todas `search_path` vacío; `revoke execute … from public` en cada
      función y concesión explícita solo donde se indica): `armar_contenido_aviso(uuid)` (interna; objeto JSON de
      `design.md` D3, fechas en UTC, sin `motivo`); `programar_recordatorio_de_cita(uuid)` (interna; `programada_para` de D1,
      descarta citas no vigentes o pasadas, `on conflict do nothing`); disparador `AFTER INSERT` sobre `citas` que la llama;
      `motivo_de_omision(text, jsonb, public.citas)` (`SECURITY INVOKER`, `stable`, tabla de D6; `execute` solo para
      `cron_notificaciones`); disparador `AFTER UPDATE OF email` sobre `pacientes` (D12); y un relleno de recordatorios para
      las citas futuras vigentes que ya existan. Verificar con `migrate up` en `dev` y consultando `pg_proc`/`pg_trigger`
      (funciones, `prosecdef`, `proconfig`, ACL) que coinciden con lo escrito.
- [ ] 3.2 `tests/pgtap/81_recordatorio_programado.test.sql` (positivas): una cita futura `reservada` crea un recordatorio
      pendiente con el correo del paciente y su `contenido`; una `confirmada` también; `programada_para` correcta para cita del
      02/03/2032 15:00 y 08:30 (Lima), del 01/03/2032 09:00 (→ 29/02/2032, bisiesto) y del 01/03/2032 23:30 de Lima (→ 29/02/2032,
      no 01/03); idéntico con la sesión en `UTC` y en `Asia/Tokyo`; no se crea para cita cancelada, atendida ni pasada;
      volver a ejecutar `programar_recordatorio_de_cita` no duplica; si el `INSERT` de la cita falla por `23P01`, no queda
      ninguna fila de notificación; una cita reservada por `paciente_a` (política RLS de H2) y una agendada por el
      `administrativo` crean su recordatorio. Verificar que pasa y que falla al cambiar `- 1` por `- 0` en la fórmula (mutación).
- [ ] 3.3 `tests/pgtap/82_contenido_y_privilegios.test.sql` (negativas): el conjunto de claves de `contenido` es exactamente el
      permitido, con un `motivo` centinela («dolor de pecho») que **no** aparece en ningún valor del JSON, y sin documento,
      teléfono, dirección, fecha de nacimiento ni sexo; `authenticated`, `anonymous` y `cron_notificaciones` **no** tienen
      `EXECUTE` sobre `armar_contenido_aviso` ni `programar_recordatorio_de_cita` y llamarlas falla con `42501` (como paciente,
      médico, enfermera, administrativo y sin rol); `authenticated`, `anonymous` y `sync_identidad` no ejecutan
      `motivo_de_omision`; las funciones son `SECURITY DEFINER` con `search_path` vacío (salvo `motivo_de_omision`, `INVOKER`);
      un `INSERT` directo en `notificaciones` de `paciente_a`, `administrativo` y `medico_a` sigue rechazado con `42501`;
      ninguna de las funciones nuevas referencia `atenciones`, `antecedentes`, `addendas`, `historias_clinicas` ni
      `asignaciones_paciente_medico` ni, desde el PRD del 2026-10-11, `visitas`, `triajes`, `derivaciones`, `recetas` ni `solicitudes_copia_historia` (consulta a `pg_get_functiondef`). Verificar que pasa y que falla al conceder
      `execute … to authenticated` en una de ellas (mutación).
- [ ] 3.4 `tests/pgtap/83_vigencia_de_avisos.test.sql`: `motivo_de_omision` por tabla de casos: cada tipo × {cita vigente futura,
      cancelada, ya ocurrida, con `inicio` distinto al de la copia, con otro `medico_id`, sin `contenido`} devuelve el motivo
      de `design.md` D6 o `null`, incluida la matriz de `cancelacion`/`reprogramacion` (vale solo si la cita está cancelada y es
      futura). Verificar que pasa y que falla al invertir la comparación de `inicio`.
- [ ] 3.5 `tests/pgtap/84_correo_del_paciente.test.sql`: al actualizar `pacientes.email` se actualiza `destinatario` de las
      notificaciones `pendiente` y `fallida`; las `fallida` de citas futuras vuelven a `intentos=0`, `ultimo_intento_en` y
      `error` nulos; las `enviada` y las de citas pasadas no cambian; **negativas:** `paciente_b` no puede cambiar el correo
      de `paciente_a` (política de H2) y por tanto sus notificaciones no cambian; el cambio de correo de un paciente no toca las
      notificaciones de otro. Verificar que pasa.

## 4. Esquema: registro de avisos transaccionales

- [ ] 4.1 Migración nueva `…_registro-de-avisos-transaccionales.sql`: `public.registrar_aviso_transaccional(p_cita uuid, p_tipo
      text, p_proveedor_id text, p_error text, p_permanente boolean, p_cita_relacionada uuid default null) returns uuid`,
      `SECURITY DEFINER`, `search_path` vacío, `revoke … from public`, `grant execute … to authenticated`. Comportamiento de
      `design.md` D2 y D4: exige `rol_actual()` = `administrativo`, o `paciente` dueño de la cita; solo
      `confirmacion_reserva`, `cancelacion`, `reprogramacion`; el estado de la cita debe corresponder al tipo; la
      reprogramación exige la cita relacionada enlazada por `reprogramada_de` en cualquier dirección; destinatario tomado de
      `pacientes.email`; `intentos` 1 (3 si permanente); `on conflict (cita_id, tipo) do nothing`. Errores con `42501` o
      `P0001` y mensajes en español. Verificar con `migrate up` en `dev` y `pg_proc`.
- [ ] 4.2 `tests/pgtap/85_registro_de_avisos.test.sql`: **positivas** — el administrativo registra confirmación, cancelación y
      reprogramación de cualquier cita; `paciente_a` registra la confirmación de su cita; el resultado queda `enviada`
      (con `enviada_en` y `proveedor_id`) o `fallida` (con `error`, `intentos=1`), 3 si permanente; `contenido` incluye
      `nueva_cita` en la reprogramación; un segundo registro devuelve nulo y no duplica. **Negativas** — `paciente_b` sobre la
      cita de `paciente_a` (`42501`); `medico_a`, `enfermera`, `sin_rol` y `anonymous` (`42501`/sin `EXECUTE`);
      `cron_notificaciones` sin `EXECUTE`; tipo `recordatorio_24h` y tipo desconocido rechazados; `confirmacion_reserva` sobre
      cita cancelada rechazada; `reprogramacion` sin cita relacionada o con una ajena rechazada; un parámetro de
      destinatario no existe (el correo es siempre el del paciente). Verificar que pasa y que falla al quitar la comprobación
      del dueño de la cita (mutación).
- [ ] 4.3 Adaptar `tests/pgtap/51_notificaciones.test.sql` al disparador sin debilitar ninguna aserción (el recordatorio de las
      citas del montaje ya existe: actualizar esas filas en lugar de insertarlas, ajustar `plan(n)`). Verificar con `npm run
      test:pgtap` completo contra `dev`: todas las pruebas de H2 (477) más las nuevas pasan, y `node scripts/ejecutar-pgtap.ts
      notificaciones` pasa.

## 5. Proveedor de correo, contenido y plantillas

- [ ] 5.1 `lib/notificaciones/proveedor.ts` (interfaz de `design.md` D8, ADR-0017), `proveedor-simulado.ts` (bandeja en memoria,
      `fallarProximo(clase)`, falla por dominio `@falla.invalid`/`@transitorio.invalid`, ids `simulado-<uuid>`) y
      `seleccionar-proveedor.ts` (`NOTIFICACIONES_PROVEEDOR`, por omisión simulado, `resend` sin clave = configuración,
      simulado en `VERCEL_ENV=production` = configuración). Pruebas en `tests/notificaciones/proveedor.test.ts`: cada rama de
      selección, bandeja, falla programada y por dominio. Verificar con `npm run test:notificaciones`.
- [ ] 5.2 `lib/notificaciones/proveedor-resend.ts` y `errores.ts`: envío con `Idempotency-Key` `"{tipo}:{cita_id}"`, tiempo máximo,
      `enviarLote` hasta 100 con reintento mensaje a mensaje si el lote falla por validación, rechazo sin llamada para
      dominios reservados (`.invalid`, `.test`, `.example`), sin seguimiento de apertura ni clics, y la clasificación
      permanente/transitorio/configuración. **Antes de escribirlo**, verificar en la documentación vigente de Resend los códigos
      de error, el endpoint de lotes, la ventana de la clave de idempotencia y el límite del plan gratuito, y anotar cifras y
      enlaces en `docs/pasos-manuales-h5.md`. Pruebas con un `fetch` simulado (sin red): 400/422 → permanente, 401/403 →
      configuración, 429/500/tiempo agotado → transitorio, lote que falla → mensajes aislados, la cabecera de idempotencia
      se envía. Verificar con `npm run test:notificaciones`.
- [ ] 5.3 `lib/notificaciones/contenido.ts`: esquema Zod `.strict()` de la copia (`design.md` D3) y tipos; funciones de formato de
      fecha, hora y hora límite de cancelación reutilizando las de H2b/H3 (`dd/MM/yyyy`, `HH:mm`, `America/Lima`; no
      duplicarlas). Pruebas: acepta la copia producida por la base (se genera una con la migración y se guarda como fixture),
      rechaza un campo extra como `motivo`, y el formato es el mismo con el proceso en `TZ=UTC` y `TZ=Asia/Tokyo`. Verificar con
      `npm run test:notificaciones`.
- [ ] 5.4 `lib/notificaciones/plantillas/` (`base.ts`, `confirmacion.ts`, `recordatorio.ts`, `cancelacion.ts`,
      `reprogramacion.ts`): `{ asunto, html, texto }`, trato de usted, asuntos neutros, advertencia de la ventana de 1 hora con su
      hora límite, enlace `APP_URL` + ruta de «Mis citas» sin identificadores ni tokens, escape de HTML, pie con el nombre y el
      contacto de la clínica de la configuración. Pruebas en `tests/notificaciones/plantillas.test.ts`: texto esperado de los
      cuatro tipos; un nombre con `<`, `&` y comillas queda escapado; ningún tipo contiene la cadena centinela del motivo ni
      documento, teléfono o dirección; el asunto no lleva médico ni especialidad; ningún texto usa trato de tú; no hay píxel de
      seguimiento ni enlace redirigido; la reprogramación muestra horarios y médicos anterior y nuevo. Verificar con `npm run
      test:notificaciones`.
- [ ] 5.5 Crear `docs/pasos-manuales-h5.md` (parte 1: correo): cuenta y clave de Resend, dominio propio y registros SPF, DKIM y DMARC,
      remitente, y la lista de comprobación de entregabilidad del grupo 9 con su tabla de «Estado de ejecución» vacía. Verificar
      que los pasos se pueden seguir tal cual y que los enlaces relativos del documento no están rotos.

## 6. Avisos transaccionales en las acciones de reserva, cancelación y reprogramación

- [ ] 6.1 `lib/notificaciones/avisos.ts` (`avisarReserva`, `avisarCancelacion`, `avisarReprogramacion`): lee los datos de la cita con
      `transaccionAutenticada` y una lista explícita de columnas (sin `motivo`), valida con el esquema de 5.3, renderiza,
      envía con tiempo máximo (5 s) y llama a `registrar_aviso_transaccional` (con `p_permanente` según la clase del error); no
      lanza nunca al llamador, devuelve un resultado y deja un registro técnico sin datos personales si falla el envío o el
      registro. Pruebas unitarias con `ProveedorSimulado` y un `sql` simulado: envío correcto, fallo transitorio, fallo permanente,
      tiempo agotado, fallo del registro y reprogramación en un solo envío. Verificar con `npm run test:notificaciones`.
- [ ] 6.2 Conectar `lib/notificaciones/eventos-cita.ts` (punto de extensión de H3) con `avisos.ts`: `cita_reservada`,
      `cita_cancelada` y `cita_reprogramada` (también para `reasignar_cita_por_baja()`, con `motivo: 'baja_medica'`; forma
      definida por `EventoCita` de `agenda-y-reserva`), emitidos **tras** confirmar la
      operación y fuera de la transacción por las acciones de H3 y, si ya existen, de H4; la cita nueva de una reprogramación no
      recibe confirmación aparte; una cita sin sustituto no emite nada. Ajustar a lo anotado en 1.1. Verificar con pruebas de las
      acciones con un proveedor que falla: el resultado tipado de la acción no cambia y la operación queda confirmada.
- [ ] 6.3 E2E `e2e/notificaciones-avisos.spec.ts` (Playwright, proveedor simulado, cuentas de H1; requiere las pantallas de H3):
      el administrativo reserva y se comprueba, con una conexión de dueño de la base de pruebas, la fila
      `confirmacion_reserva` en `enviada` y el recordatorio pendiente; con un paciente de destinatario `@falla.invalid` la reserva
      se confirma, la pantalla no muestra errores del proveedor y la fila queda `fallida` con 3 intentos; cancelar una cita
      crea `cancelacion`; reprogramar crea una sola `reprogramacion` y ninguna `confirmacion_reserva` para la cita nueva. Limpia
      sus datos al final. Verificar con `npm run test:e2e` en local contra la build y en el preview del PR.

## 7. Proceso programado (cron)

- [ ] 7.1 `lib/notificaciones/cron/sql.ts` y `procesar.ts`: núcleo con `EjecutarSql`, proveedor y reloj inyectados; omitir pendientes
      que no valen, cerrar agotadas, reservar por páginas de 100 (sentencia de `design.md` D5) hasta 500, enviar con
      `enviarLote`, registrar cada resultado (permanente → `intentos=3`), interrumpir y devolver intentos ante error de
      configuración, y construir el resumen sin datos personales. `tests/integracion/notificaciones-cron.test.ts` bajo `set
      local role cron_notificaciones` en una transacción que se revierte y con `ProveedorSimulado`: envío de un recordatorio
      vencido; no se toma uno futuro; cita cancelada/ya ocurrida/modificada se omite sin llamar al proveedor y sin consumir
      intento; omitido no aparece como fallida con 3 intentos; reintento de una `fallida` con 1 intento; espera mínima de 2 h; tercer
      fallo la deja en 3 intentos; error permanente agota de inmediato; dominio `.invalid` sin llamada; error de configuración
      restituye intentos y levanta error; intento interrumpido se retoma y, con 3 intentos sin resultado, se cierra como
      fallida; dos ejecuciones seguidas = un envío; sin acceso a `pacientes` (el núcleo solo usa `contenido`). Verificar con
      `npm run test:integracion` contra el branch de pruebas y que falla al quitar `skip locked` o la condición de espera (mutación).
- [ ] 7.2 `tests/concurrencia/30_notificaciones.test.ts` (sesiones `pg` independientes como la prueba de doble reserva): 20 rondas
      de 2 a 5 ejecuciones simultáneas de `procesar` sobre los mismos avisos vencidos con un proveedor simulado compartido; cada aviso
      se envía exactamente una vez en total y ninguno queda reservado sin resultado. Verificar con `npm run test:concurrencia` y
      que falla al desactivar la reserva atómica (mutación).
- [ ] 7.3 `app/api/cron/notificaciones/route.ts` (`GET`, `force-dynamic`, `maxDuration`): `CRON_SECRET` con comparación en tiempo
      constante, 500 de configuración si falta la variable (aun con cabecera vacía), 401 sin abrir conexión, negativa a correr con el
      proveedor simulado en producción, `eslint-disable-next-line @clerk/next/require-auth-protection` justificado como el
      webhook de Clerk, y respuesta JSON de resumen. Pruebas unitarias del manejador con dependencias inyectadas: sin cabecera,
      secreto incorrecto, correcto, `CRON_SECRET` no definido, producción + simulado, y que en los dos primeros casos no se toca
      la base ni el proveedor. Verificar con `npm run test:notificaciones`, `npm run lint` y `npm run build`.
- [ ] 7.4 `vercel.json` con el único cron `{ "path": "/api/cron/notificaciones", "schedule": "0 13 * * *" }` y
      `tests/notificaciones/vercel.test.ts` (existe exactamente un cron, a las 13:00 UTC, equivalente a las 08:00 de Lima, y
      coincide con la constante de la hora de envío del recordatorio). **Antes**, verificar en la documentación vigente de Vercel el
      límite del plan Hobby, su precisión horaria, que no reintenta y que solo corre en producción, y anotarlo en
      `docs/pasos-manuales-h5.md`. Verificar con `npm run test:notificaciones` y revisando el panel «Cron Jobs» del preview/producción.
- [ ] 7.5 `docs/pasos-manuales-h5.md` (parte 2: cron): `LOGIN` y contraseña de `cron_notificaciones` por branch (una distinta por
      entorno), `DATABASE_CRON_URL` directa, generar `CRON_SECRET` (`openssl rand -base64 32`), cargar las variables de
      Production en Vercel como sensibles, redesplegar, la ventana entre migrar y completar estos pasos (el cron responde 500
      visible, nada se finge como enviado) y cómo relanzar el cron a mano. Verificar con una ejecución manual en `dev` con el
      proveedor simulado: el resumen cuenta lo esperado, una segunda ejecución no envía nada, y sin el secreto responde 401.

## 8. Vista de notificaciones fallidas (ADR-0018)

- [ ] 8.1 `lib/notificaciones/consultas.ts`: `listarNotificacionesFallidas({ pagina })` (25 por página, más antiguas primero, con
      paciente, documento, correo, tipo, cita en Lima, intentos y error) y `contarNotificacionesFallidas()` por
      `transaccionAutenticada`; el conteo lo reutiliza el dashboard de H7. Pruebas unitarias con un `sql` simulado para la
      paginación, el orden y los nombres legibles de tipo; verificar con `npm run test:notificaciones`.
- [ ] 8.2 `app/administrativo/notificaciones/page.tsx`: `auth.protect()` y `exigirRol("administrativo")`, tabla de solo lectura con
      las columnas de la spec, estado vacío «No hay notificaciones fallidas por revisar», paginación con el total, sin acciones de
      reenvío ni datos clínicos; agregar «Notificaciones» como destino disponible en `lib/ui/navegacion.ts` (o enlace desde
      `/administrativo` si no existe); usar `Alerta` y `Table` de H2b si están. Verificar con `npm run lint`, `npm run build` y
      la E2E de 8.3.
- [ ] 8.3 E2E `e2e/notificaciones-fallidas.spec.ts` (requiere conexión de dueño a la base de pruebas): con filas sembradas
      (fallida con 3 intentos, fallida con 2, enviada, pendiente, omitida) el administrativo ve solo la de 3 intentos, ordenada
      y con sus columnas; con 26 filas ve dos páginas y el total; sin filas ve el mensaje vacío; **negativas:** sin sesión va al inicio
      de sesión; paciente, médico y enfermera son devueltos a su área y no ven nada; una consulta directa de esos roles
      devuelve 0 filas. Limpia las filas sembradas. Verificar con `npm run test:e2e`.
- [ ] 8.4 Documentar en `docs/pruebas-e2e.md` cómo sembrar y limpiar notificaciones de prueba y qué cubren las E2E de los grupos 6
      y 8; verificar que los enlaces no están rotos.

## 9. Entregabilidad y prueba de humo con correo real (manual, riesgo P-7)

Estas tareas requieren la cuenta de Resend y un dominio del usuario: no son automatizables y no corren en CI. Cada una deja
su evidencia (fecha, capturas, resultado) en la tabla «Estado de ejecución» de `docs/pasos-manuales-h5.md`.

- [ ] 9.1 Verificar el dominio remitente en Resend con SPF, DKIM y DMARC (registros en verde en el panel). Verificar
      registrando la fecha y una captura, y que `dig`/herramienta equivalente muestra los tres registros.
- [ ] 9.2 Enviar un correo de cada tipo (confirmación, recordatorio, cancelación, reprogramación) a un buzón propio de al menos tres
      proveedores de uso frecuente y comprobar bandeja de entrada (no spam), asunto neutro y que `Authentication-Results`
      muestra SPF, DKIM y DMARC en `pass`. Verificar con la tabla de resultados rellena (3 × 4).
- [ ] 9.3 Prueba de humo del extremo a extremo: con `NOTIFICACIONES_PROVEEDOR=resend` en el entorno de desarrollo y un destinatario
      propio, reservar una cita para pasado mañana, relanzar el cron a mano, recibir el recordatorio, relanzar y comprobar que no
      llega un segundo. Verificar con el resumen del cron, la fila `enviada` con su `proveedor_id` y el panel de Resend.
- [ ] 9.4 Escribir en `docs/pasos-manuales-h5.md` el procedimiento de revisión periódica del panel de Resend (entregas, rebotes,
      quejas; periodicidad y umbrales de partida de `design.md`, pregunta 5), qué hacer al superarlos (elevar al cliente la
      decisión de un canal adicional, P-7; no construirlo) y la advertencia del límite diario del plan gratuito. Verificar que el
      procedimiento nombra quién lo hace y dónde se anota el resultado.

## 10. Integración y coherencia documental

- [ ] 10.1 Ejecutar todo junto: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:pgtap`,
      `npm run test:notificaciones`, `npm run test:integracion`, `npm run test:concurrencia` y `npm run test:e2e`. Verificar que
      todo pasa en el PR (CI de `ci.yml`, `neon-branch-pr.yml` y `e2e.yml`) y que `migrate up --dry-run` no deja nada pendiente.
- [ ] 10.2 Revisión aparte con el agente `code-review` de las tres migraciones, el disparador, las funciones `SECURITY DEFINER`
      y la ruta del cron, por tocar privilegios y datos de personas (aunque no historias clínicas). Verificar con la lista de
      hallazgos resuelta o justificada en el PR.
- [ ] 10.3 Proponer, para revisión humana (no editar en silencio), con la skill `architecture`: una **ADR nueva** con el siguiente número libre (el 0029 ya lo ocupa «Datos clínicos por especialidad»), titulada («Escritura de
      notificaciones: disparador de recordatorio, función de registro acotada y copia mínima del contenido»; incluye la regla
      de hora de D1 y el tipo `reprogramacion`) y notas fechadas en ADR-0017 (`programada_para`, tipo nuevo, guarda ampliada),
      ADR-0018 (la política usa `rol_actual()` y no `auth.session() ->> 'rol'`; ruta real de la vista), ADR-0008 y ADR-0028
      (cadencia diaria ya anotada; el tope y la espera mínima), ADR-0020 (el cron no pasa por RLS: corregido por H2; añadir el
      acceso a `armar_contenido_aviso`), y las secciones «Notificaciones», criterios de aceptación y riesgo P-7 de TECH-DESIGN,
      el estado de CLAUDE.md y la línea de estado de `openspec/config.yaml`. Verificar con una lista de ediciones propuestas
      en el PR y aprobadas por el usuario antes de aplicarlas.
- [ ] 10.4 Añadir a `docs/datos-demo.md` la advertencia de que sembrar citas crea recordatorios con `@demo.invalid` y que el cron real
      no debe correr sobre datos de demostración, y a `docs/pruebas-sql.md` los archivos `80`–`85`. Verificar que los enlaces no
      están rotos.
- [ ] 10.5 Cobertura de la spec: tabla en el PR de cada escenario de `specs/*/spec.md` con la prueba que lo cubre (pgTAP, unitaria,
      integración, concurrencia, E2E o manual del grupo 9) y ninguno sin cubrir; `openspec validate notificaciones-email --strict`
      sin errores. Verificar con la tabla completa y la salida del comando.
