# Tasks

Convenciones de todo el change. **No se crea ninguna tabla nueva** (las dos migraciones añaden funciones, una política y un
disparador), pero cada política y función nueva trae su prueba pgTAP negativa y `99_rls_en_todas_las_tablas` debe seguir en
verde. Las migraciones son **archivos nuevos** en `migrations/*.sql` (con `npm run migrate create`, solo hacia adelante, sección
`down` vacía); nunca se edita una ya aplicada ni se restaura el branch principal de Neon. Este change toca RLS: el SQL de las
migraciones y las acciones del portal pasan por una revisión explícita aparte (tarea 11.2). Las pruebas de funciones puras viven
en `tests/portal/` (`node --test`, script `test:portal`); las de SQL, en `tests/pgtap/70`–`72`; las de comportamiento del
navegador, en `e2e/portal-*.spec.ts`. Cada grupo deja sus pruebas y su documentación; el último grupo solo integra. Las
dependencias nuevas se instalan con la autorización del usuario. Las E2E requieren el branch con datos de demostración
(`docs/datos-demo.md`) y usan documentos del rango `98…` (los de demostración son `99…`). H3 (`agenda-y-reserva`) y H2b
(`sistema-de-diseno-ui`) deben estar aplicados antes del grupo 2.

## 1. Prerrequisitos, decisión de seguridad y pasos manuales

- [ ] 1.1 Confirmar contra el **código real** (no solo contra los `design.md`) que H2b y H3 están aplicados y que existen los
      contratos C1–C7 de `design.md` («Contratos de H3 que H4 consume»): `slots_disponibles`, `reservar_cita`, `cancelarCita`,
      `ResultadoAccion`, `traducirError` y `MENSAJE_DOBLE_RESERVA`, `lib/schemas/documento.ts`, `notificarEventoCita`,
      `lib/fechas/lima.ts`, y los componentes `TarjetaCita`, `SelectorHorario`, `Campo`, `CampoDocumento`, `Alerta`, `PortalLayout`.
      Verificar con una búsqueda de cada símbolo y `npm run test:pgtap` en verde; anotar en el PR toda diferencia y ajustar la
      capa fina de H4 (o pedir el cambio a H3) sin duplicar lógica de agenda. Si H2b o H3 no están aplicados, detenerse.
- [ ] 1.2 Redactar con la skill `architecture` el ADR de **verificación al vincular una ficha existente** (correo verificado de la
      cuenta + fecha de nacimiento; alternativas y riesgo residual de `design.md` D3) con el siguiente número libre de
      `docs/adrs/` (el change `notificaciones-email` ya propone el 0029) y presentarlo al usuario. Verificar que el archivo
      existe con estado «Aceptado» o «Propuesto», que enlaza a ADR-0003, 0022 y 0023, y que **la migración 2.2 no se aplica
      mientras no esté aceptado** (si el usuario decide otra cosa, cambian 2.2, 2.3 y la spec `registro-del-paciente`, no el resto).
- [ ] 1.3 Crear `docs/pasos-manuales-h4.md` con los pasos de consola que no se pueden versionar y pedirle al usuario que los ejecute
      en **desarrollo y en producción** (instancias de Clerk distintas): Clerk — añadir a la plantilla del JWT el claim `email`
      (`{{user.primary_email_address}}`), exigir correo verificado y nombres en el alta, redirigir el alta a `/completar-registro`,
      revisar la protección contra bots del alta y el bloqueo de cuenta por intentos fallidos; Vercel — activar BotID en el
      proyecto y conectar la integración de Upstash (variables en Production y Preview); crear la segunda cuenta de paciente de
      pruebas (`E2E_PACIENTE2_EMAIL` con `+clerk_test`). Verificar que el documento lista cada paso con su captura de comprobación y
      que el usuario confirma por escrito los de desarrollo; los de producción quedan pendientes para la tarea 11.4.

## 2. Base de datos: vinculación del paciente y cancelación propia

- [ ] 2.1 Extender `scripts/ejecutar-pgtap.ts` para que cada identidad de prueba lleve el claim `email`
      (`<identidad>@pruebas.invalid`) y documentarlo en `docs/pruebas-sql.md`. Verificar que toda la suite existente sigue en
      verde y que una prueba mínima lee `auth.session() ->> 'email'` de `paciente_a`.
- [ ] 2.2 Crear la migración nueva `portal-paciente-vinculacion` con `public.correo_actual()` y
      `public.registrar_paciente_portal(...)` según `design.md` D3 (ambas `SECURITY DEFINER`, `search_path` vacío, `EXECUTE`
      revocado a `PUBLIC` y concedido solo a `authenticated`; errores `PA001`–`PA004` y `42501`). Verificar con `npm run migrate up`
      en un branch de desarrollo, con `has_function_privilege` para `authenticated`/`anonymous`/`PUBLIC`, y que no se editó
      ninguna migración existente (`git diff --stat migrations/`).
- [ ] 2.3 Escribir `tests/pgtap/70_portal_registro.test.sql` con casos positivos y **negativos**: alta con documento nuevo (crea
      ficha vinculada y la carpeta clínica, que el paciente **no** puede leer); vinculación con correo y fecha correctos sin
      sobrescribir datos; rechazo por fecha distinta, por correo distinto, por ficha de otra cuenta y por documento ya vinculado
      (todos `PA002`); cuenta que ya tiene ficha (`PA001`); rol administrativo, médico, enfermera y sin rol (`42501`); sin claim
      `email` (`PA004`); `EXECUTE` no concedido a `PUBLIC`; CE en minúsculas guardado en mayúsculas; documento inválido
      rechazado por el `CHECK`. Verificar con `node scripts/ejecutar-pgtap.ts portal_registro` y comprobar por mutación que fallan
      al debilitar la comparación del correo y la de la fecha (cambios temporales revertidos).
- [ ] 2.4 Crear la migración nueva `portal-paciente-cancelacion` con la política `paciente cancela su cita` y el disparador
      `citas_proteger_columnas_paciente` (`SECURITY INVOKER`, corre antes de `citas_validar_cancelacion`) según D4. Verificar con
      `migrate up` y consultando `pg_policies` y `pg_trigger` (nombre, evento y orden de los disparadores de `citas`).
- [ ] 2.5 Escribir `tests/pgtap/71_portal_cancelacion.test.sql`: el paciente cancela su cita a 61 minutos y queda `cancelada` con
      `cancelada_por` = su perfil; a 59 minutos falla con `P0001`; **no** cancela la cita de otro paciente (cero filas) ni una ya
      cancelada o atendida; **no** cambia `inicio`, `medico_id`, `paciente_id`, `motivo` ni `origen` (`42501`); **no** pone
      `confirmada`, `atendida` ni `no_asistio`; el administrativo y la excepción por bloqueo de agenda siguen igual que en H2; el
      médico y la enfermera siguen sin poder actualizar. Verificar con `node scripts/ejecutar-pgtap.ts portal_cancelacion` y por
      mutación (quitar la condición `paciente_id` de la política y el disparador, una a la vez, hace fallar casos distintos).
- [ ] 2.6 Prueba de concurrencia `tests/concurrencia/30_registro_portal.test.ts`: dos cuentas de paciente envían a la vez el mismo
      documento nuevo en 10 rondas; exactamente una ficha por documento y la otra recibe `PA002`. Reutiliza el ayudante de sesiones
      firmadas de H3. Verificar con `npm run test:concurrencia`.
- [ ] 2.7 Extender `app/api/db-sesion/route.ts` para devolver también `correo_actual()` y `e2e/db.spec.ts` para comprobar que es el
      correo de la cuenta de prueba, en minúsculas. Verificar con la E2E contra un branch con la plantilla de Clerk ya actualizada
      (tarea 1.3); es la prueba de extremo a extremo del claim `email`.

## 3. Esquemas, textos y guarda de acciones

- [ ] 3.1 Crear `lib/schemas/paciente-portal.ts` componiendo `lib/schemas/documento.ts` (documento, nombres, apellidos, fecha de
      nacimiento no futura ni de más de 120 años, sexo M/F/X, teléfono opcional de 7 a 15 dígitos, dirección opcional; claves
      desconocidas descartadas), añadir el script `test:portal` (`node --test "tests/portal/*.test.ts"`) y el paso al job
      `typecheck-lint-build` de `ci.yml` (archivo con CRLF: conservarlos). Verificar con `tests/portal/esquemas.test.ts` por tabla de
      casos (DNI de 7, 8 y 9 dígitos y con letra; CE de 8, 9, 12 y 13 caracteres, con símbolo y en minúsculas; campos vacíos o con
      espacios; fecha futura; teléfono con letras; claves `rol` y `perfil_id` descartadas) y que `npm run test:portal` falla al cambiar
      a propósito un valor esperado.
- [ ] 3.2 Crear `lib/portal/mensajes.ts` con todos los textos del portal en trato de usted (errores de campo, mensaje genérico de
      registro rechazado, ventana de cancelación, sesión vencida, demasiados intentos, error inesperado) y reexportar
      `MENSAJE_DOBLE_RESERVA` de H3. Verificar con `tests/portal/mensajes.test.ts`: el literal coincide carácter a carácter con
      `Registro de cita ya agendado`, ningún texto contiene formas de tuteo ni códigos de error o `SQLSTATE`, y todos terminan en
      una indicación de qué hacer cuando es un error.
- [ ] 3.3 Crear `lib/auth/accion-paciente.ts` (`exigirPaciente()` devuelve `NO_AUTORIZADO` en vez de redirigir; opción de límite de
      peticiones y de verificación anti-bots que completan los grupos 4 y 5) y `exigirPacienteRegistrado()` para las páginas (redirige a
      `/completar-registro` si no hay ficha). Verificar con `tests/portal/accion-paciente.test.ts` con dobles de Clerk y de la base:
      sin sesión, con rol distinto de `paciente` y sin ficha producen el resultado o la redirección esperados, y la identidad del
      paciente nunca se toma del argumento de la acción.

## 4. Controles de borde (ADR-0026)

- [ ] 4.1 Confirmar con la documentación vigente de Vercel BotID su API, el modo disponible en el plan Hobby y el tratamiento del
      tráfico de pruebas; instalar `botid`; configurar `withBotId` en `next.config.ts`, `initBotId` en
      `instrumentation-client.ts` con `/completar-registro` y `/paciente/citas/nueva`, y `lib/seguridad/antibots.ts`
      (`verificarAntibots()` → `NO_AUTORIZADO` con «No pudimos verificar su solicitud. Intente de nuevo» y modo de excepción por
      variable, nunca activo en producción). Verificar con `tests/portal/antibots.test.ts` (doble de `checkBotId`: bot rechazado sin
      llegar a la base, humano pasa, el modo de excepción no se aplica con `VERCEL_ENV=production`) y `npm run build`. Dejar la respuesta
      de la pregunta Q6 en el PR.
- [ ] 4.2 Instalar `@upstash/ratelimit` y `@upstash/redis` y crear `lib/seguridad/limites.ts`: una tabla única de límites (registro
      5 / 15 min, reserva 10 / 10 min, cancelación 10 / 10 min, búsqueda 60 / 1 min, rutas de autenticación 5 / 15 min por IP para
      peticiones que no son lectura y 60 / 1 min para lecturas), ventana deslizante, clave por usuario más IP, y **fallo abierto** con
      registro sin datos personales. Verificar con `tests/portal/limites.test.ts` y un almacén en memoria: el sexto intento se
      rechaza, pasada la ventana vuelve a permitirse, cinco lecturas de una misma IP no bloquean, y un almacén que lanza deja pasar y registra.
- [ ] 4.3 Aplicar el límite de las rutas de autenticación en `middleware.ts` dentro de `clerkMiddleware()` **sin lógica de
      autorización** (decisión de H1): `429` con texto en español, minutos de espera y `Retry-After`; la IP sale de la cabecera que
      establece Vercel, nunca de un valor enviado por el cliente. Verificar con una prueba de la función pura que decide el límite y,
      en el preview, con seis `POST` a `/iniciar-sesion` (el sexto da 429) y seis `GET` (ninguno es bloqueado); confirmar en una prueba
      que un `x-forwarded-for` falsificado por el cliente no cambia la clave del contador.
- [ ] 4.4 Conectar la verificación anti-bots y los límites por acción al envoltorio `accion-paciente.ts` (orden: sesión → límite →
      anti-bots → validación → base de datos). Verificar con `tests/portal/accion-paciente.test.ts`: una ráfaga recibe «Demasiados
      intentos. Espere unos minutos e intente de nuevo.» y el doble de la base **no** es llamado; un paciente que reserva, cancela y
      vuelve a reservar varias veces no alcanza ningún límite.
- [ ] 4.5 Documentar en `docs/pasos-manuales-h4.md` la tabla de límites, el modo de excepción de BotID para las E2E en el preview y
      la salvedad de las rutas de Clerk (D9, Q5). Verificar que el documento enlaza a ADR-0026 y que `.env.example` lista las variables
      nuevas (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` y las de BotID) sin valores.

## 5. Registro del paciente

- [ ] 5.1 Apuntar el alta a `/completar-registro` (`forceRedirectUrl` de `<SignUp />` y
      `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`) y cambiar `app/page.tsx` para que quien tiene sesión pero aún no tiene rol
      vaya a `/completar-registro` en lugar de ver la portada de visitantes. Verificar con `npm run build` y con la E2E 5.6: tras crear
      la cuenta nunca se muestra el enlace «Registrarme» de la portada.
- [ ] 5.2 Crear `app/completar-registro/page.tsx` (`auth.protect()`; decide entre redirigir a otra área, redirigir a `/paciente`, mostrar
      el formulario o mostrar la espera) y el componente de cliente `EsperarCuenta`: confirmar primero en la documentación de Clerk
      la API para refrescar el token (`session.reload()` / `getToken({ skipCache: true })`), refrescar cada 2 s hasta 30 s con
      `router.refresh()`, región `aria-live="polite"` «Estamos preparando su cuenta…» y, pasados 30 s, «Reintentar» y el texto de
      contacto; nunca redirige a `/`. Verificar con la E2E 5.6 (la pantalla aparece y se resuelve sola) y revisando que un usuario de
      personal que abre la ruta va a su área.
- [ ] 5.3 Crear el formulario de registro (`react-hook-form` + `zodResolver` con el esquema 3.1): `CampoDocumento` DNI/CE con su
      ayuda, nombres y apellidos prellenados desde `perfiles`, fecha de nacimiento, sexo («Otro o prefiero no indicarlo»), teléfono y
      dirección opcionales, correo de solo lectura con «Solo lectura»; errores por campo con icono, `aria-describedby` y foco al
      primer error; botón «Continuar» de 48 px con «Guardando…». Verificar con la E2E 5.6 (DNI de 7 dígitos muestra «El DNI debe tener
      8 dígitos», CE fuera de formato muestra la ayuda, correo no editable) y con axe en el grupo 9.
- [ ] 5.4 Crear la Server Action `completarRegistro` y `lib/portal/registro.ts`: envoltorio de 3.3/4.4, validación Zod, llamada a
      `registrar_paciente_portal`, traducción de `PA001` («Su cuenta ya está registrada»), `PA002` (el mismo texto genérico siempre),
      `PA003`/`PA004` («Cierre sesión e ingrese de nuevo»), `42501`, `23514` y `23505`; redirige a `/paciente` al terminar y no registra
      documento ni correo en el log. Verificar con `tests/portal/registro.test.ts` (todos los rechazos de vinculación producen
      exactamente el mismo mensaje; claves extra ignoradas; el log capturado no contiene el documento).
- [ ] 5.5 Añadir `exigirPacienteRegistrado()` a `/paciente` y a las páginas nuevas de los grupos 6 y 7, y activar `disponible` en
      `lib/ui/navegacion.ts` para «Mis citas» y «Reservar» cuando existan sus páginas. Verificar con la E2E 5.6: una cuenta sin ficha que
      abre `/paciente` o `/paciente/citas` es llevada a `/completar-registro`.
- [ ] 5.6 Escribir `e2e/portal-registro.spec.ts` y el ayudante `e2e/datos-portal.ts` (siembra de una ficha con el rol dueño sobre el
      branch de pruebas): cuenta nueva `+clerk_test` → espera → formulario → DNI `98…` nuevo → `/paciente`; validaciones de DNI y CE;
      vinculación de una ficha sembrada con el mismo correo y fecha de nacimiento (aparecen sus citas en «Mis citas»); rechazo con fecha
      distinta, con ficha de otra cuenta y con un correo distinto (mensaje genérico idéntico); cuenta que ya tiene ficha; ninguna URL
      visitada contiene documento, correo ni nombres. Verificar con `npx playwright test portal-registro` contra una build local y el preview.

## 6. Búsqueda y reserva

- [ ] 6.1 Crear `lib/portal/consultas.ts` (lecturas con `transaccionAutenticada`, una transacción por pantalla): especialidades con
      médico activo, médicos activos con su próximo horario, días de 30 días con `LEFT JOIN LATERAL slots_disponibles` según D6,
      horarios del día y citas propias del día. Verificar con `tests/integracion/portal-consultas.test.ts` bajo las identidades
      `paciente_a` y `paciente_b`: un médico inactivo no aparece; un bloqueo de agenda no aparece ni su motivo; una cita de otro
      paciente no se ve y su horario no se ofrece; el horario que cruza una cita propia se marca; los días sin horarios se cuentan en cero.
- [ ] 6.2 Medir el rendimiento de la consulta de días y del próximo horario con `EXPLAIN (ANALYZE)` sobre un volumen sintético en un
      branch de desarrollo (objetivo p95 < 500 ms de TECH-DESIGN) y anotar el resultado en `docs/pruebas-sql.md`. Si no se cumple,
      reducir el horizonte a 14 días o pedir a H3 una función agregada, y registrar la decisión. Verificar con el plan de ejecución
      adjunto al PR.
- [ ] 6.3 Crear `/paciente/citas/nueva` con los pasos especialidad → médico (con «Ya sé con qué médico») → día → horario, el estado en
      `searchParams`, `SelectorHorario` de H2b, el componente de cliente que mueve el foco al `<h1 tabIndex={-1}>` del paso y los
      esqueletos con «Buscando horarios…». Verificar con la E2E 6.6: el botón «atrás» conserva la selección, los días sin horarios están
      deshabilitados con «Sin horarios» y todas las horas se ven en Lima aunque el navegador use otra zona.
- [ ] 6.4 Crear el paso de confirmación (resumen con médico, especialidad, fecha y hora; `Alerta` de advertencia con la hora límite o
      el aviso de cita en menos de 1 hora; sin campo de motivo) y la Server Action `reservarCitaPortal` con `lib/portal/reserva.ts`:
      buscar el `fin` del slot en `slots_disponibles`, llamar a `reservar_cita` con `paciente_actual()` de la base, reintento idempotente
      ante `DOBLE_RESERVA` si la cita ya es del propio paciente, mapeo de `HORARIO_NO_DISPONIBLE`, `DOBLE_RESERVA` (texto exacto) y
      `SESION_VENCIDA`, llamada a `notificarEventoCita` y `revalidatePath`. Verificar con `tests/portal/reserva.test.ts` (dobles de
      `lib/citas`: la cita nunca lleva un paciente tomado de la entrada; doble reserva sin cita propia devuelve el literal exacto; con cita
      propia devuelve éxito; un fallo de `notificarEventoCita` no cambia el resultado).
- [ ] 6.5 Crear la pantalla de confirmación de la reserva y la actualización tras un conflicto (el horario tomado queda «No disponible»
      y la alerta `role="alert"` trae el literal en un elemento aparte de la guía «Elija otro horario»). Verificar con la E2E 6.6.
- [ ] 6.6 Escribir `e2e/portal-reserva.spec.ts`: reserva completa desde «Inicio» en no más de 5 elecciones; advertencia «a las HH:mm»;
      cita en menos de 1 hora; **doble reserva real con dos contextos de navegador y dos pacientes** (una cita, la otra recibe
      `Registro de cita ya agendado`); doble clic sin error; sesión vencida (se borra la cookie a mitad del flujo) y retorno con la
      selección intacta; ninguna reserva en el pasado; el paciente no ve horarios ocupados por otro. Las citas se agendan a 14 días y se
      cancelan al terminar. Verificar con `npx playwright test portal-reserva` contra una build local y el preview.

## 7. Mis citas y cancelación

- [ ] 7.1 Crear «Inicio» (`/paciente`: saludo, próxima cita y «Reservar cita» de 48 px) y «Mis citas» (`/paciente/citas`: próximas y
      anteriores con `TarjetaCita`/`InsigniaEstado`, «Ver más» desde 20, estado vacío con «Reservar cita») sobre consultas en
      `lib/portal/consultas.ts`. Verificar con `tests/integracion/portal-consultas.test.ts` (partición próximas/anteriores, orden, solo
      citas propias) y la E2E 7.3; los encabezados «Portal del paciente» de H1/H2b se conservan para las E2E existentes.
- [ ] 7.2 Crear la Server Action `cancelarMiCita` con `lib/portal/cancelacion.ts` (usa `cancelarCita` de H3; `CANCELACION_TARDIA` →
      texto del portal en usted; `CITA_NO_VIGENTE` → consulta bajo RLS y responde «No encontramos esa cita» o «Esa cita ya está
      cancelada»; `notificarEventoCita`) y el diálogo nativo `<dialog>` de confirmación con «Cancelar cita» destructivo y «No cancelar».
      El botón solo se ofrece con 1 hora o más de margen y se oculta con «Ya no se puede cancelar por el portal». Verificar con
      `tests/portal/cancelacion.test.ts` (cita ajena e inexistente dan el mismo mensaje; doble envío no da error confuso).
- [ ] 7.3 Escribir `e2e/portal-cancelacion.spec.ts`: cancelar una cita lejana (pasa a «Anteriores» como «Cancelada» y el horario
      vuelve a la búsqueda); cita sembrada a 40 minutos sin botón y, forzando el envío, mensaje de ventana sin cancelar; cancelar con el
      identificador de la cita de otro paciente («No encontramos esa cita» y la cita ajena intacta); doble envío; ausencia de
      «Reprogramar». Verificar con `npx playwright test portal-cancelacion`.

## 8. Aislamiento del paciente y autogestión medible

- [ ] 8.1 Escribir `tests/portal/guarda-estatica.test.ts`: recorre `app/completar-registro/`, `app/paciente/`, `lib/portal/` y
      `lib/seguridad/` y falla si algún archivo nombra `historias_clinicas`, `atenciones`, `addendas`, `antecedentes`,
      `accesos_historia`, `notificaciones`, `auditoria`, `bloqueos_agenda`, `asignaciones_paciente_medico` o `turnos_enfermeria`, o si
      una acción acepta un campo `paciente_id`, `perfil_id` o `rol` en su esquema. Verificar con `npm run test:portal` y por mutación
      (añadir temporalmente una consulta a `atenciones` en `lib/portal/` hace fallar la prueba).
- [ ] 8.2 Escribir `tests/pgtap/72_portal_aislamiento.test.sql` con el punto de vista del rol paciente tras este change: cero filas en
      las tablas clínicas (incluida su propia carpeta recién creada) y administrativas; no inserta ni actualiza `pacientes` por su
      cuenta; no crea citas con origen `administrativo`; no cambia `perfiles.rol`; ve solo su ficha, sus citas y los perfiles de
      médicos. Verificar con `node scripts/ejecutar-pgtap.ts portal_aislamiento` y que `99_rls_en_todas_las_tablas` sigue en verde.
- [ ] 8.3 Escribir `e2e/portal-aislamiento.spec.ts`: un paciente que abre las rutas de administrativo, médico y enfermería es llevado a
      `/paciente`; no existe ningún enlace del portal hacia contenido clínico; el título de pestaña de cada pantalla no contiene
      datos personales. Verificar con `npx playwright test portal-aislamiento`.
- [ ] 8.4 Dejar medible la autogestión (D10): prueba `tests/integracion/autogestion.test.ts` que reserva y cancela como paciente y
      comprueba `origen = 'portal'`, `creada_por` y `cancelada_por` = perfil del paciente (y que una cancelación del administrativo se
      distingue), y documentar en `docs/pruebas-sql.md` las dos consultas de la métrica (reservas por `origen`, cancelaciones por rol de
      `cancelada_por`) sin construir ninguna pantalla. Verificar con `npm run test:integracion` y ejecutando las consultas sobre los
      datos de demostración.

## 9. Usabilidad y accesibilidad

- [ ] 9.1 Escribir `e2e/portal-accesibilidad.spec.ts` con `@axe-core/playwright` (etiquetas `wcag2a`, `wcag2aa`, `wcag21a`,
      `wcag21aa`, ya instalado por H2b) sobre cada pantalla y estado del portal: «Complete su registro» vacío, con errores y en
      espera; «Inicio»; «Mis citas» vacío y con datos; cada paso de «Reservar»; confirmación, alerta de doble reserva y diálogo de
      cancelación. Verificar que falla ante una violación puesta a propósito (quitar la etiqueta de un campo, cambio revertido).
- [ ] 9.2 Corregir las violaciones que encuentre 9.1 en los componentes y las pantallas del portal, explicando cada una en el mensaje del
      commit. Verificar que 9.1 queda en verde.
- [ ] 9.3 Escribir `e2e/portal-responsive.spec.ts`: sin desplazamiento horizontal a 320 y 390 px en todas las pantallas; objetivos
      táctiles de al menos 44 × 44 px (48 px en «Reservar cita» y «Confirmar cita») medidos con `boundingBox`; reserva completa solo con
      teclado con el foco visible; el foco pasa al `<h1>` en cada cambio de paso; los errores usan `role="alert"` y las confirmaciones
      `role="status"`. Verificar con `npx playwright test portal-responsive`.
- [ ] 9.4 Ampliar la lista de revisión manual de `docs/pruebas-e2e.md` con los ítems del portal (NVDA/VoiceOver sobre el registro, la
      reserva y la cancelación; zoom 200 %; teclado) y ejecutarla una vez sobre el preview anotando el resultado en el PR. Verificar que
      el documento tiene la lista y que el PR trae el resultado de cada ítem.
- [ ] 9.5 Escribir `docs/usabilidad-portal.md` (protocolo: tareas «registrarse», «reservar» y «cancelar», guion sin ayuda, criterio de
      4 de 5, plantilla de registro) y ejecutarlo con al menos cinco personas de 60 años o más; corregir los hallazgos de gravedad alta.
      Si no es posible reclutarlas, dejarlo declarado en el documento con la alternativa usada y marcado como pendiente antes de abrir
      el portal a pacientes reales. Verificar que el documento existe con los resultados o con esa declaración explícita.

## 10. Documentación y coherencia

- [ ] 10.1 Actualizar `.env.example`, `docs/pruebas-e2e.md` (specs del portal, segunda cuenta de paciente, rango `98…`, BotID en el
      preview) y `docs/pruebas-sql.md` (pruebas 70–72), y el estado de `CLAUDE.md` (H4 aplicado). Verificar con una búsqueda que las
      rutas, nombres de variables y números de prueba coinciden con lo implementado y que ningún enlace relativo se rompe.
- [ ] 10.2 Preparar, como commit aparte **marcado para revisión humana** (no se reabre nada en silencio), las correcciones a
      documentos compartidos: TECH-DESIGN (rutas reales del portal `/paciente/citas` y `/completar-registro` en lugar de
      `(paciente)/portal/…`, «Turnstile» → BotID en `registro/`, `completarRegistro` y `cancelarMiCita` en la tabla de Server Actions,
      criterio de vinculación del registro de paciente), una nota fechada en ADR-0026 (alcance real del límite con los componentes de
      Clerk, Q5) y en ADR-0022 (claim `email`). Verificar que el PR lista cada cambio con su motivo.

## 11. Verificación integral

- [ ] 11.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:portal`,
      `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion` y la suite E2E completa (incluidas las de H1–H3);
      verificar que todo pasa y que el PR trae el cuadro de cada requisito de las seis specs con la prueba que lo cubre.
- [ ] 11.2 Pasar las dos migraciones, la política, el disparador, las funciones `SECURITY DEFINER` y las Server Actions del portal por el
      agente `code-review` (RLS, fuga entre pacientes, escalada, enumeración de documentos, manejo de errores) y por el skill
      `security-review`; verificar que cada hallazgo queda corregido o justificado en el PR.
- [ ] 11.3 Revisar visualmente en el preview las seis pantallas del portal a 390 px y a 1280 px y mostrar las capturas al usuario;
      verificar que da su visto bueno o lista ajustes, que se hacen antes del merge.
- [ ] 11.4 Antes del merge, completar en **producción** los pasos manuales de 1.3 (claim `email`, redirect del alta, BotID, Upstash);
      tras el merge comprobar que el despliegue está READY, que `/api/db-sesion` devuelve el correo de una cuenta de prueba y que una
      reserva y una cancelación de demostración funcionan con la URL pública. Mientras la pregunta Q3 (consentimiento de datos
      personales) y la nota de P-1 sobre identidad no se cierren, el portal solo se usa con datos sintéticos de demostración. Verificar
      con la URL pública y dejar la constancia en el PR.
