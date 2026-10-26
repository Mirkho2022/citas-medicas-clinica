# Tasks

Convenciones de todo el change (de `openspec/config.yaml` y `design.md`): **este change no crea tablas**; añade dos vistas
`security_invoker` y sus pruebas negativas. Si durante la ejecución apareciera la necesidad de una tabla nueva (p. ej. la
llegada del paciente, Q1), se detiene el trabajo: esa decisión necesita su ADR y su prueba pgTAP negativa, y no se decide aquí.
Las migraciones son archivos **nuevos** en `migrations/*.sql` (`npm run migrate -- create <nombre> --migration-file-language
sql`), solo hacia adelante; nunca se edita una ya aplicada ni se toca el branch principal de Neon. Las pruebas de SQL viven en
`tests/pgtap/NN_<área>.test.sql` (no asumen tablas vacías: siembran sus ids y afirman por id), las unitarias en
`tests/turnos-dashboard/` con `node --test` (script `npm run test:turnos-dashboard`, con `TZ=UTC` y `TZ=Asia/Tokyo`), las de
concurrencia en `tests/concurrencia/` y las E2E en `e2e/`. Cada grupo deja sus pruebas y su documentación; los grupos 10 y 11
solo integran. Todo texto de interfaz, mensaje y etiqueta en español; fechas `dd/MM/yyyy` y horas `HH:mm` en `America/Lima`.
Las páginas nuevas llaman a `auth.protect()`, `exigirRol(...)` y la comprobación de MFA (la regla de ESLint de Clerk lo exige).

## 1. Precondiciones y paso manual (punto de parada)

- [ ] 1.1 Verificar el contrato con H3, H5 y H2b antes de escribir código. Contra un branch de **desarrollo** de Neon (nunca
      production): `to_regproc('public.slots_disponibles(uuid,date)')` no es nulo y `authenticated` tiene `EXECUTE`; existe la
      vista `public.citas_por_reasignar` con `security_invoker`; existen `ResultadoAccion`, el traductor de errores y
      `exigirPersonal` de H3 (`lib/acciones/`, `lib/auth/accion-personal.ts`); anotar las rutas reales de la agenda de H3
      (`/administrativo/agenda` y sus parámetros de médico y fecha), de las bajas (`/administrativo/bajas`) y de la revisión de
      fallidas de H5 (`/administrativo/notificaciones`); existen las transiciones de estado de H3 (A2): confirmar y marcar «no asistió»
      (administrativo) y la función acotada del médico `confirmada → atendida` (acción `marcarAtendida` en
      `app/medico/acciones-cita.ts`; verificar su firma real); existen `InsigniaEstado`, `TablaAgenda`, `Campo`, `Alerta`,
      `ConsolaLayout`, `lib/ui/navegacion.ts` y `lib/ui/formato.ts` (H2b aplicado); `select version()` es PostgreSQL 15 o
      superior. Anotar el resultado y la fecha en una sección «Verificación de precondiciones» al final de `design.md`.
      **Si falta `slots_disponibles` o H2b, detener los grupos 5–8 y consultar al usuario; si falta la transición del médico (A2),
      el botón del grupo 8 se omite y se consulta al usuario; si falta una ruta de H3 o H5, el enlace correspondiente se omite (D4) y se anota.**
      El grupo 2 (solo base de datos) puede avanzar sin H2b.
- [ ] 1.2 Paso manual con el usuario: activar TOTP en las cuentas de prueba de médico y enfermera de la instancia de
      **desarrollo** de Clerk y guardar sus secretos como `E2E_MEDICO_TOTP_SECRET` y `E2E_ENFERMERA_TOTP_SECRET` (en
      `.env.local`, en `.env.example` sin valor y en `scripts/cargar-secretos-e2e.ts`). Extender `e2e/roles.spec.ts` con «médico
      inicia sesión con TOTP y aterriza en “Panel del médico”» y el equivalente de la enfermera. Verificar que ambas pruebas
      pasan. Si el usuario no lo autoriza, documentar en `docs/07-testing/pruebas-e2e.md` que las pantallas de médico y enfermera se
      verifican con pgTAP, integración con token firmado y revisión manual, y marcar como no aplicables las tareas E2E 6.3 y 8.4.
- [ ] 1.3 Antes de cerrar el grupo 7, preguntar al usuario la Q1 de `design.md` (¿se registra la llegada real del paciente?) y
      escribir su respuesta en «Open Questions». No bloquea construir el dashboard con la definición derivada de D2. Verificar
      que la pregunta queda con respuesta y fecha. Si la respuesta es que sí se registra, **no seguir con ese cambio**: actualizar
      el change con `openspec-update-change` (columna o estado nuevo con su ADR y su prueba pgTAP negativa) y volver a validarlo
      con `openspec validate turnos-y-dashboard`.

## 2. Base de datos: vistas y sus pruebas

- [ ] 2.1 Crear la migración de `public.dashboard_citas` (D1): `with (security_invoker = true)`, filtro
      `(select public.rol_actual()) = 'administrativo'`, rango de hoy y mañana en horas de Lima sobre `citas.inicio`, columnas
      `cita_id, inicio, fin, estado, dia, medico_id, medico, especialidad_id, especialidad, paciente_id, nombres, apellidos,
      tipo_documento, numero_documento, minutos_espera`, **sin `motivo`**; `grant select … to authenticated` y nada para
      `anonymous`. Verificar con `npm run migrate -- up` en el branch de desarrollo y con una consulta a `pg_class.reloptions`
      que muestra `security_invoker=true`.
- [ ] 2.2 Escribir `tests/pgtap/62_dashboard_citas.test.sql`: opciones de la vista; el administrativo ve las citas de hoy y de
      mañana sembradas y no las de ayer ni las de pasado mañana; **frontera de Lima** (cita a las 23:30 de hoy cuenta como
      `hoy`, la de las 00:15 de mañana como `manana`); `minutos_espera` correcto para `confirmada` con hora vencida, nulo
      para `reservada` (aunque su hora haya pasado), `atendida`, `cancelada`, `no_asistio` y citas futuras (el valor esperado se calcula desde el `inicio` real y la
      cita se siembra con `greatest(now() - 25 min, medianoche de Lima)` para que no falle cerca de la medianoche); la vista no
      tiene columna `motivo`; **negativas:** enfermera, médico, paciente y sesión sin rol obtienen cero filas; `anonymous` no
      tiene `SELECT`. Verificar con `npm run test:pgtap` (54 en verde) y por mutación: quitar `security_invoker` o el filtro de
      rol en el branch de desarrollo hace fallar al menos una prueba negativa (revertir después).
- [x] 2.3 Crear la migración de `public.turnos_enfermeria_con_aviso` (D8): `security_invoker`, filtro de administrativo,
      `fecha >= hoy_lima()` y causas `enfermera_de_baja`, `medico_de_baja` y `bloqueo_de_agenda` (solape del `rango` del bloqueo
      con el día de Lima de la `fecha`), sin exponer el motivo del bloqueo. Verificar con `migrate up` y `reloptions`.
      Resultado (2026-10-25): migración `1792700000000_turnos-enfermeria-con-aviso.sql` (la vista devuelve una fila por turno con `causas text[]`, no una fila por causa); aplicada a la base de desarrollo con `migrate up --no-check-order`; `reloptions` = `{security_invoker=true}`.
- [x] 2.4 Escribir `tests/pgtap/63_turnos_con_aviso.test.sql`: aparece un turno con médico bloqueado ese día, con médico dado de
      baja y con enfermera dada de baja; **no** aparece un turno sin problema, uno de una fecha pasada ni uno con un bloqueo de
      otro día; el aviso desaparece al cambiar el médico del turno; la vista no tiene columna con el motivo; **negativas:**
      enfermera (incluida la dueña del turno), médico, paciente y sesión sin rol obtienen cero filas. Verificar con
      `npm run test:pgtap` y por mutación (quitar el filtro de rol hace fallar las negativas).
      Resultado (2026-10-25): `tests/pgtap/80_turnos_con_aviso.test.sql` (24 pruebas en verde; el change sugería el número 63, ocupado). Por mutación: quitar el filtro de rol de la vista hace fallar la negativa de la enfermera dueña del turno (las de médico y paciente las sigue frenando la RLS de las tablas).
- [ ] 2.5 Escribir `tests/pgtap/64_contrato_slots.test.sql`, la prueba de contrato con H3: como administrativo,
      `slots_disponibles(medico, fecha)` devuelve `inicio` y `fin`, omite un horario con cita `reservada` o `confirmada`, omite
      uno cubierto por un bloqueo, omite los que ya pasaron y vuelve a mostrar el horario de una cita `cancelada`. Verificar que
      pasa; si H3 cambia la firma, esta es la prueba que debe fallar con un mensaje claro (D3).
- [x] 2.6 Escribir `tests/pgtap/98_vistas_con_security_invoker.test.sql`: toda vista del esquema `public` tiene
      `security_invoker=true` en `reloptions`. Verificar que pasa hoy y que falla al crear temporalmente una vista sin la opción
      dentro de la transacción de la prueba.
      Resultado (2026-10-25): `tests/pgtap/81_vistas_con_security_invoker.test.sql` (4 pruebas en verde; el change sugería el número 98): pasa hoy y detecta una vista creada sin la opción o con ella en falso; también rechaza vistas materializadas en `public`.
- [ ] 2.7 Comprobar el uso de índices: en un branch de desarrollo, dentro de una transacción que se revierte, sembrar 500 citas
      de hoy repartidas entre 20 médicos y ejecutar `explain` sobre la consulta de la vista como administrativo. Verificar que el
      plan usa `citas_estado_inicio_idx` o `citas_medico_inicio_idx` y no un recorrido secuencial completo; anotar el plan en
      `docs/07-testing/pruebas-sql.md`.
- [ ] 2.8 Actualizar `docs/07-testing/pruebas-sql.md` con los archivos 62, 63, 64 y 98 y con la regla «toda vista de `public` es
      `security_invoker`». Verificar que el documento enlaza a este change y que `npm run test:pgtap` completo pasa.

## 3. Lógica de dominio pura y esquemas

- [x] 3.1 Crear `lib/turnos/franjas.ts` (etiquetas «Mañana», «Tarde», «Noche», sin horas) y `lib/schemas/turno.ts` (Zod:
      uuid de enfermera, fecha `YYYY-MM-DD` real, franja del enum y **exactamente uno** de `medicoId`/`especialidadId`, con los
      mensajes de la spec). Pruebas en `tests/turnos-dashboard/turno-esquema.test.ts`: acepta médico solo y servicio solo; rechaza
      ninguno, ambos, `2026-02-30` y una franja inexistente con el mensaje exacto. Verificar con
      `npm run test:turnos-dashboard`.
      Resultado (2026-10-25): `lib/turnos/franjas.ts`, `lib/schemas/turno.ts` (campos en snake_case como el resto de `lib/schemas/`: `enfermera_id`, `medico_id`, `especialidad_id`, `fecha`, `turno`) y `tests/turnos-dashboard/turno-esquema.test.ts`; `npm run test:turnos-dashboard` en verde.
- [x] 3.2 Crear `lib/turnos/errores.ts` con `traducirErrorTurno` (`23505`, `23514`, `23503`, `42501` y «sin fila afectada» a los
      mensajes de D6) y `validarContraEstado` (función pura: recibe `hoy`, `activo` de enfermera y de médico, y devuelve el
      mensaje de fecha pasada o de personal de baja). Pruebas en `tests/turnos-dashboard/turno-errores.test.ts` con un caso por
      código y por mensaje de la spec. Registrar los códigos en el traductor central de H3 si lo admite, o dejarlos en este módulo.
      Resultado (2026-10-25): `lib/turnos/errores.ts` con `traducirErrorTurno` y `validarContraEstado`; los códigos quedaron en este módulo (reutilizan SOLAPE, DATOS_INVALIDOS y NO_AUTORIZADO de `lib/acciones/resultado.ts`, sin ampliar esa lista compartida). Pruebas en `tests/turnos-dashboard/turno-errores.test.ts`.
- [ ] 3.3 Crear `lib/dashboard/espera.ts` (`UMBRAL_ESPERA_MIN = 20`, `superaUmbral`, `agruparPorEstado` con los cinco estados
      siempre presentes y el total) y `lib/dashboard/huecos.ts` (`fusionarHuecos`: agrupa slots contiguos). Pruebas en
      `tests/turnos-dashboard/dashboard.test.ts`: 20 min no supera el umbral y 21 sí; estados en cero presentes; un día sin
      citas da total cero; slots 09:20–09:40 y 09:40–10:00 se funden en 09:20–10:00 y uno separado no; la frontera 23:30 Lima
      con `TZ=UTC` y con `TZ=Asia/Tokyo`. Verificar con `npm run test:turnos-dashboard` en ambas zonas.
- [x] 3.4 Crear `lib/medico/horarios.ts` con `horariosPorDia(plantilla, desde, dias)`: toma `dia_semana` (0 = domingo),
      `vigente_desde` y `vigente_hasta` y devuelve los bloques de cada fecha de Lima. Pruebas en
      `tests/turnos-dashboard/horarios.test.ts`: un lunes, un domingo (0), una disponibilidad que vence a mitad de la ventana y
      otra que aún no empieza, y la misma salida con `TZ=UTC` y `TZ=Asia/Tokyo`. Verificar con
      `npm run test:turnos-dashboard`.
      Resultado (2026-10-25): `lib/medico/horarios.ts` y `tests/turnos-dashboard/horarios.test.ts`; el archivo se repite solo con TZ=UTC y TZ=Asia/Tokyo (`tests/turnos-dashboard/_zonas.ts`).
- [x] 3.5 Añadir el script `test:turnos-dashboard` a `package.json` (`node --test "tests/turnos-dashboard/*.test.ts"`) y una
      línea en `docs/07-testing/pruebas-e2e.md` (o `docs/07-testing/pruebas-sql.md`) que explique cómo correrlo en las dos zonas horarias. Verificar
      que el script existe y corre sin errores.
      Resultado (2026-10-25): script `test:turnos-dashboard` en `package.json` (69 pruebas en verde, incluidas las repeticiones en las dos zonas) y nota en `docs/07-testing/pruebas-e2e.md` sobre cómo correrlo con otra zona.

## 4. Server Actions de turnos y concurrencia

- [x] 4.1 Implementar `asignarTurno`, `actualizarTurno` y `quitarTurno` en `lib/turnos/acciones.ts` («use server»): validar con
      Zod, leer `hoy_lima()` y el estado `activo` en la misma transacción, escribir con `transaccionAutenticada`, traducir los
      errores con `traducirErrorTurno`, comprobar el rol con `exigirPersonal('administrativo')` de H3 y devolver su
      `ResultadoAccion` sin dejar escapar la excepción de Postgres. Rechazar crear, modificar o quitar turnos de fechas pasadas. Verificar con `npm run typecheck` y `npm run lint`
      y, en el grupo 5, con las E2E del administrativo.
      Resultado (2026-10-25): la lógica está en `lib/turnos/operaciones.ts` (con un `Ejecutor`, como `lib/citas/*.ts`), `lib/turnos/casos-de-uso.ts` (guarda `exigirPersonal('administrativo')` y refresco) y la Server Action delgada `app/administrativo/turnos/acciones.ts` (con `auth.protect()`), y no en un único `lib/turnos/acciones.ts` con «use server»: un archivo así exportaría funciones que reciben un ejecutor. Cada operación manda en una transacción la lectura de `hoy_lima()`, rol y personal activo y una escritura que repite esas condiciones en su `WHERE`. Pruebas: `tests/turnos-dashboard/operaciones.test.ts` y `tests/integracion/turnos-enfermeria.test.ts` (8 en verde contra la base real); `typecheck` y `lint` en verde.
- [x] 4.2 Escribir `tests/concurrencia/20_turnos.test.ts`: 5 clientes independientes asignan a la vez la misma enfermera, fecha
      y franja (fecha lejana, p. ej. 2032) en 20 rondas; en cada ronda queda exactamente una fila y las demás reciben `23505`;
      limpia sus filas al empezar y al terminar. Verificar con `npm run test:concurrencia` (nunca contra production).
      Resultado (2026-10-25): `tests/concurrencia/20_turnos.test.ts`, con el código de la aplicación (`asignarTurno`): 20 rondas de 5 administrativos, una fila por ronda y los demás con el mensaje de choque; más 5 rondas de cambios simultáneos de franja. 2 pruebas en verde contra la base de desarrollo.
- [x] 4.3 Probar a nivel de base de datos las negativas de escritura de la spec con un pgTAP nuevo
      `tests/pgtap/65_turnos_escritura.test.sql` (no repite `50_`): enfermera, médico y paciente no insertan, no actualizan y no
      borran turnos (`42501` o cero filas) y el turno queda intacto; el administrativo sí. Verificar con `npm run test:pgtap` y
      por mutación (conceder a `enfermera` la política de escritura en el branch de desarrollo hace fallar la prueba; revertir).
      Resultado (2026-10-25): `tests/pgtap/82_turnos_escritura.test.sql` (20 pruebas en verde; el change sugería el número 65). Por mutación: darle a `enfermera` una política de escritura hace fallar 10 pruebas.

## 5. Pantallas de turnos del administrativo

- [ ] 5.1 Crear `lib/turnos/consultas.ts` (semana de turnos con enfermera, médico, especialidad; avisos desde
      `turnos_enfermeria_con_aviso`; catálogos de enfermeras y médicos activos y de especialidades) y los componentes
      `SemanaDeTurnos` (tabla con encabezados de fila y columna, semana que empieza el lunes, desplazamiento horizontal dentro
      de su contenedor, celdas con enlaces «Asignar» y «Modificar») y `AvisosDeTurnos` en `components/clinica/`, con datos de
      ejemplo sintéticos en la galería de H2b. Verificar en la galería y con axe sin violaciones.
      Avance (2026-10-25): hecho `lib/turnos/consultas.ts`, `SemanaDeTurnos`, `AvisosDeTurnos` y `CampoSeleccion` en `components/clinica/`. Pendiente: los datos de ejemplo en la galería `/guia-de-estilo` y la revisión axe (se dejó fuera de la galería para no tocar archivos compartidos con los otros agentes).
- [ ] 5.2 Crear `app/administrativo/turnos/page.tsx` (semana, «Semana anterior», «Hoy», «Semana siguiente», avisos arriba),
      `nuevo/page.tsx` y `[id]/page.tsx` (formularios con `Campo`, opción «Con un médico» / «En un servicio», errores asociados
      al campo y anunciados, «Quitar turno» con confirmación) y activar el destino «Turnos de enfermería» en
      `lib/ui/navegacion.ts`. Verificar con `npm run build` y abriendo las tres rutas como administrativo.
      Avance (2026-10-25): hechas las tres rutas (`/administrativo/turnos`, `nuevo` y `[id]`) y la entrada «Turnos de enfermería» en `lib/ui/navegacion.ts`; `npm run build` en verde. Pendiente: abrirlas como administrativo contra la base de desarrollo (no se corrió Playwright ni el navegador mientras los otros agentes usan la base).
- [ ] 5.3 Escribir `e2e/turnos.spec.ts`: el administrativo asigna un turno (fecha 2032, para no estorbar), lo ve en la semana,
      intenta asignar el mismo y ve «La enfermera ya tiene un turno asignado en esa fecha y franja», cambia el médico, lo quita y
      ya no aparece; intento sin médico ni servicio; un turno con médico bloqueado aparece en los avisos. La prueba limpia lo que
      crea. Verificar que pasa contra la build de producción local.
      Avance (2026-10-25): escrito `e2e/turnos.spec.ts`; no se ejecutó (cuentas compartidas). Falta el caso del turno con médico bloqueado en los avisos (lo cubren pgTAP 80 y la prueba de integración).
- [ ] 5.4 Añadir las pantallas de turnos a `e2e/accesibilidad.spec.ts` (axe con `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) y
      ejecutar la revisión manual de H2b (teclado, 200 % de zoom, lector de pantalla) sobre `/administrativo/turnos`, anotando el
      resultado en el PR. Verificar que axe pasa y que cada ítem manual tiene resultado.
      Avance (2026-10-25): añadida la prueba axe de las pantallas de turnos a `e2e/accesibilidad.spec.ts`; no se ejecutó ni se hizo la revisión manual.

## 6. Vista de la enfermera

- [x] 6.1 Crear `lib/turnos/mis-turnos.ts` (turnos propios de hoy a +14 días con médico, perfil y especialidad) y el componente
      `TarjetaTurno`; reemplazar el contenido de `app/enfermera/page.tsx` conservando `auth.protect()`, `exigirRol("enfermera")`,
      la comprobación de MFA y el encabezado «Panel de enfermería»; mostrar «Hoy» y «Próximos días», el estado vacío
      «No tiene turnos asignados en los próximos 14 días» y la nota «Fuera de servicio; consulte al personal administrativo» si
      el médico está de baja. Sin enlaces a funciones administrativas. Verificar con `npm run build` y `npm run typecheck`.
      Resultado (2026-10-25): `lib/turnos/mis-turnos.ts`, `components/clinica/tarjeta-turno.tsx` y `app/enfermera/page.tsx` (guardas y encabezado conservados; lectura dentro de un `Suspense` propio); `npm run build` y `npm run typecheck` en verde.
- [x] 6.2 Escribir `tests/pgtap/66_vista_enfermera.test.sql`: con la sesión de enfermera, la consulta que arma su pantalla
      resuelve el nombre y la especialidad del médico y la especialidad del servicio **sin ninguna política nueva**; no ve turnos
      de otra enfermera; **negativas:** cero filas en `citas`, `pacientes`, `historias_clinicas`, `atenciones`, `addendas`,
      `antecedentes`, `notificaciones`, `bloqueos_agenda` y en las dos vistas nuevas. Verificar con `npm run test:pgtap`.
      Resultado (2026-10-25): `tests/pgtap/83_vista_enfermera.test.sql` (23 pruebas en verde; el change sugería el número 66); confirma además que `turnos_enfermeria` conserva solo sus dos políticas de H2. La consulta real (`SQL_MIS_TURNOS`) se ejercita con la sesión de la enfermera en `tests/integracion/turnos-enfermeria.test.ts`.
- [ ] 6.3 Escribir `e2e/enfermera.spec.ts` (requiere 1.2): la enfermera inicia sesión, ve su turno sembrado con su médico y no ve
      el de otra; abrir `/administrativo`, `/medico` y `/paciente` la devuelve a `/enfermera`; la página no contiene enlaces a
      citas ni pacientes; axe sin violaciones y sin desplazamiento horizontal a 390 px. Verificar que pasa.
      Avance (2026-10-25): escrito `e2e/enfermera.spec.ts` (se omite sin `E2E_ENFERMERA_*` y su TOTP: paso 1.2); no se ejecutó.

## 7. Dashboard operativo

- [ ] 7.1 Crear `lib/dashboard/consultas.ts`: una sola `transaccionAutenticada` que lee `dashboard_citas`, los bloqueos de hoy,
      el recuento de `citas_por_reasignar`, el recuento de `notificaciones` fallidas con 3 o más intentos y, por cada médico con
      horario o citas hoy, `slots_disponibles(medico, hoy)` mediante el adaptador `lib/dashboard/huecos.ts`; y la función pura
      `resumenPorMedico` que arma la fila de cada médico (citas por estado, pacientes en espera y mayor espera, huecos fundidos
      con tope de cuatro y «+N más», bloqueo del día). Pruebas unitarias en `tests/turnos-dashboard/resumen-por-medico.test.ts`:
      hueco entre dos citas, cita cancelada que libera el horario, más de cuatro huecos, «Sin huecos libres hoy», bloqueo sin
      motivo, médico sin horario ni citas omitido. Verificar con `npm run test:turnos-dashboard` y `npm run typecheck`.
- [ ] 7.2 Crear los componentes `ResumenPorEstado`, `ListaEspera` (orden por espera, marca «Supera los 20 min» con icono),
      `ResumenPorMedico` (una fila por médico con insignias de estado, rangos de huecos como texto «Libre 09:20–11:00» sin
      depender del color y el enlace «Ver agenda» a la agenda de H3), `CitasSinConfirmar`, `AvisoCitasPorReasignar` y
      `AvisoNotificaciones` en `components/clinica/`, con datos de ejemplo en la galería. Verificar en la galería con axe sin
      violaciones y que cada sección muestra su estado vacío («Hoy no hay citas», «Nadie está esperando ahora», «Sin huecos
      libres hoy», «Todas las citas de mañana están confirmadas», «Sin citas por reasignar», «Sin notificaciones por revisar»).
- [ ] 7.3 Crear `RefrescoAutomatico` (componente de cliente: `router.refresh()` cada `INTERVALO_REFRESCO_MS` = 60 000 mientras la
      pestaña esté visible, refresco al volver a la pestaña, «Actualizar ahora», «Pausar/Reanudar actualización» con texto de
      estado) y `app/administrativo/dashboard/error.tsx` («No se pudo cargar el panel. Intente de nuevo.» con «Reintentar») y
      `loading.tsx` con esqueletos. Verificar con `npm run build` y, en 7.5, con el reloj simulado de Playwright.
- [ ] 7.4 Crear `app/administrativo/dashboard/page.tsx`: título de pestaña fijo «Dashboard operativo», filtros `?especialidad=` y
      `?medico=` (solo afectan a la agenda del día), las secciones (estado del día, espera, resumen por médico, citas de mañana sin confirmar, citas por reasignar y
      notificaciones), «Actualizado a las HH:mm» en hora de Lima, la nota
      «Se cuenta desde la hora de la cita»; sin ningún control que cambie el estado de una cita; los enlaces a la agenda y las bajas
      médicas de H3 y a la revisión de fallidas de H5 (`/administrativo/notificaciones`) se muestran solo si el destino está
      `disponible` en `lib/ui/navegacion.ts`, y este change no crea ninguna de esas tres pantallas; activar el destino «Dashboard». Sin
      `motivo` ni datos clínicos en ningún bloque ni en la URL. Verificar con `npm run build` y abriendo la ruta como
      administrativo con los datos de demostración.
- [ ] 7.5 Escribir `e2e/dashboard.spec.ts`: con citas sembradas por la prueba (confirmada que empezó hace 25 min, otra hace 5,
      una `reservada` de mañana, una `reservada` de hoy con la hora vencida que **no** debe aparecer en la lista de espera, una
      `cancelada`), el administrativo ve el conteo por estado, la lista de espera ordenada (solo confirmadas) con
      «Supera los 20 min» solo en la de 25, la cita de mañana sin confirmar y, en la fila del médico, un hueco libre y el enlace «Ver agenda»; ningún texto de
      `motivo`; con
      `page.clock` avanza 60 s y «Actualizado a las» cambia; «Pausar actualización» lo detiene; el foco no se mueve en una
      actualización; enfermera, médico y paciente son llevados a su área. Verificar que pasa; la prueba limpia sus filas.
- [ ] 7.6 Añadir el dashboard a `e2e/accesibilidad.spec.ts` (con datos en todas las secciones) y ejecutar la revisión manual
      (teclado, 200 % de zoom a 1280 px, lector de pantalla, objetivos táctiles de al menos 24 px). Verificar que axe pasa y que el
      PR trae el resultado de cada ítem manual.

## 8. Jornada del médico

- [x] 8.1 Crear `lib/medico/jornada.ts` (horarios de atención del propio médico con `horariosPorDia`, sus bloqueos y sus citas
      `confirmada` de hoy a +7 días con nombre y documento del paciente, y los minutos desde la hora para las ya vencidas, todo
      en una `transaccionAutenticada`). Escribir `tests/pgtap/67_jornada_medico.test.sql`: el médico ve sus citas confirmadas y
      el nombre del paciente de cada una; **negativas:** cero filas de las citas y bloqueos de otro médico, de
      `turnos_enfermeria`, de `dashboard_citas`, de `turnos_enfermeria_con_aviso` y de `atenciones` de un paciente que no tiene a
      cargo; **guarda de H3:** el médico no puede hacer `UPDATE` directo de `citas` (cero filas o `42501`) y la cita queda
      intacta. Verificar con `npm run test:pgtap`.
      Resultado (2026-10-25): `lib/medico/jornada.ts` (hoy y los 7 días siguientes, sin `motivo`) y `tests/pgtap/84_jornada_medico.test.sql` (25 pruebas en verde; el change sugería el número 67). `dashboard_citas` no existe en esta rama (es de otro agente): su negativa pasa vacía y se hará efectiva sola cuando exista.
- [ ] 8.2 Crear el componente `JornadaDelMedico` y reemplazar el contenido de `app/medico/page.tsx` conservando
      `auth.protect()`, `exigirRol("medico")`, la comprobación de MFA y el encabezado «Panel del médico»: rótulo «Mi horario de
      atención», citas confirmadas con `InsigniaEstado`, marca «Hace N min» en las vencidas, bloqueos propios, estado vacío «No
      tiene citas confirmadas en los próximos 7 días», sin `motivo`, sin enlace a la historia clínica mientras H6 no exista y
      título de pestaña fijo. Verificar con `npm run build`, `npm run typecheck` y abriendo la ruta como médico con los datos de
      demostración.
      Avance (2026-10-25): hechos `JornadaDelMedico` y `app/medico/page.tsx` (guardas y encabezado conservados, título fijo); `npm run build` y `typecheck` en verde. Pendiente: abrir la ruta como médico con datos de demostración (exige TOTP: paso 1.2).
- [x] 8.3 Crear el componente de cliente `MarcarAtendida` (botón «Marcar atendida» en cada cita confirmada de la jornada, con
      `useActionState`) que llama a la acción de H3 (`marcarAtendida`, de
      `app/medico/acciones-cita.ts`; verificar la firma anotada en 1.1); botón deshabilitado mientras envía, mensaje «Cita marcada como atendida» con `role="status"`, foco a la
      siguiente cita o al encabezado, y «La cita ya no está confirmada. Actualice la pantalla» si el estado cambió. H7 no
      escribe en `citas` ni crea la función. Pruebas unitarias en `tests/turnos-dashboard/marcar-atendida.test.ts` del
      traductor de resultado (éxito, cita ya no confirmada, sin permiso) y del orden del foco. Verificar con
      `npm run test:turnos-dashboard`, `npm run typecheck` y `npm run lint`.
      Resultado (2026-10-25): `components/clinica/marcar-atendida.tsx` y la lógica pura `lib/medico/marcar-atendida.ts` (pruebas en `tests/turnos-dashboard/jornada.test.ts`, no en un `marcar-atendida.test.ts` aparte); el aviso «Cita marcada como atendida» usa el `useAviso` de la consola (región `role="status"` permanente) porque la cita sale de la lista. La acción de H3 solo deja marcar una cita cuya hora ya empezó: la jornada ofrece el botón únicamente en esas y, en las confirmadas futuras, dice desde qué hora se podrá. `typecheck` y `lint` en verde.
- [ ] 8.4 Escribir `e2e/medico.spec.ts` (requiere 1.2): el médico ve solo sus citas confirmadas (no las de otro médico ni las
      reservadas), no ve a ninguna enfermera, **marca atendida una cita y desaparece de su lista** (con el dashboard del
      administrativo, la cita sale de la lista de espera en la siguiente actualización), el doble clic no duplica ni falla,
      abrir `/administrativo/dashboard` y `/administrativo/turnos` lo devuelve a `/medico`; axe sin violaciones y sin
      desplazamiento horizontal a 390 px. Verificar que pasa; la prueba restaura o limpia las citas que usa.
      Avance (2026-10-25): escrito `e2e/medico.spec.ts` (se omite sin `E2E_MEDICO_*` y su TOTP: paso 1.2); no se ejecutó.

## 9. Datos de demostración

- [ ] 9.1 Añadir a `scripts/sembrar-datos-demo.ts` la opción opt-in `--citas-de-ahora` (D13): citas confirmadas que empezaron
      hace 5, 18 y 32 minutos (acotadas a la medianoche de Lima para no caer en el día anterior), una `reservada` de hoy con la hora vencida, dos `reservada` para mañana,
      una cita en cada estado restante y un turno de enfermería con un médico que tiene un bloqueo; las rehace en cada ejecución
      (solo las marcadas y no atendidas) y respeta la exclusión de solapes. Verificar ejecutándola dos veces contra un branch de
      desarrollo con `--confirmar`: los conteos son iguales y la suite pgTAP sigue pasando sobre esos datos.
- [ ] 9.2 Extender `scripts/comprobar-datos-demo.ts` con el aislamiento de este change (la enfermera ve solo sus turnos y cero
      citas; el médico, solo sus citas confirmadas y cero turnos de enfermería; el administrativo ve filas en
      `dashboard_citas`; el paciente, ninguna) y actualizar `docs/07-testing/datos-demo.md` (nueva opción, qué se ve en el dashboard, cómo
      reiniciar). Verificar ejecutando el script y que la tabla del documento coincide con su salida.

## 10. Coherencia documental

- [ ] 10.1 Actualizar `CLAUDE.md` (línea de estado: turnos y dashboard) y `docs/03-arquitectura/TECH-DESIGN.md`: tabla de Server Actions
      (`actualizarTurno`, `quitarTurno`), rutas reales de H7 en «Superficie de la aplicación» (las del árbol `(personal)/…` que
      no existen), la definición de «en espera» y del umbral de 20 min en «Dashboard operativo», la fila de H7 en el plan y las
      vistas `security_invoker` en «Seguridad y control de acceso». Si H2b ya cambió esas secciones, integrar sin pisarlo.
      Verificar con una búsqueda que CLAUDE.md, TECH-DESIGN y las specs de este change dicen lo mismo y que ningún enlace
      relativo se rompe.
- [ ] 10.2 Validar el change con `openspec validate turnos-y-dashboard --strict`, revisar que `design.md` ya no contradice lo
      construido (supuestos A1–A6 confirmados o corregidos, preguntas abiertas respondidas o trasladadas) y anotar en el PR qué
      pidió el usuario que cambiara. Verificar que la validación pasa sin advertencias.

## 11. Verificación integral en el PR

- [ ] 11.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:turnos-dashboard`
      (en `TZ=UTC` y `TZ=Asia/Tokyo`), `npm run test:pgtap`, `npm run test:concurrencia` y la suite E2E completa; verificar que
      todo pasa y que el PR trae el cuadro de cada requisito de las tres specs con la prueba que lo cubre.
- [ ] 11.2 Pedir la revisión del agente `code-review` con foco en RLS: las dos vistas y sus `GRANT`, la prueba `98_`, que
      ninguna pantalla ni consulta exponga `motivo` ni datos clínicos, y que ninguna política cambió. Verificar que sus hallazgos
      quedan resueltos o justificados en el PR antes del merge.
- [ ] 11.3 Revisar en el preview de Vercel las pantallas de turnos, la de la enfermera, la del médico y el dashboard: 1280 px
      para el administrativo y 390 px para enfermera y médico; medir en el preview el efecto del sondeo de 60 s en el cómputo de
      Neon. Mostrar las capturas al usuario; verificar que da su visto bueno o lista los ajustes (se hacen antes del merge).
- [ ] 11.4 Tras el merge, comprobar que el despliegue de producción está en estado READY, que el job de migraciones aplicó las
      dos vistas (`reloptions` con `security_invoker=true`) y que `/administrativo/dashboard` exige sesión. Los datos de
      demostración solo se siembran en producción con `--incluir-produccion` y orden explícita del usuario; verificar que no se
      sembró nada por efecto lateral.
