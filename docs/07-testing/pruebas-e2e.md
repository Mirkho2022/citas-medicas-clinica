# Pruebas E2E (Playwright)

Verifican el flujo de autenticación y la redirección por rol (H1, tarea 6.4). Código en
[e2e/](../../e2e/), configuración en [playwright.config.ts](../../playwright.config.ts).

## Qué cubren

- Sin sesión, las cuatro áreas redirigen a iniciar sesión.
- Credenciales inválidas no abren sesión.
- El paciente inicia sesión, aterriza en `/paciente` y es devuelto allí desde las áreas de personal.
- El administrativo inicia sesión con TOTP, aterriza en `/administrativo` y es devuelto allí desde
  las demás áreas.

## Cómo corren

- **Local:** `npm run test:e2e`. Lee `.env.local` y levanta `next dev`; usa el Chrome instalado. Para
  probar la build de producción: `npm run build && npm start` y luego
  `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e` (más estable que `next dev`).
- **CI:** [e2e.yml](../../.github/workflows/e2e.yml) corre contra el preview de Vercel de cada PR
  cuando el deployment termina bien.

## Claves y cuentas

- Cuentas `h1-<rol>+clerk_test@example.com` en la instancia de **desarrollo** de Clerk. Los correos
  `+clerk_test` no envían correo real y su código de verificación es siempre `424242`.
- Las contraseñas y la clave TOTP del administrativo viven en `.env.local` (ignorado por git). Para
  llevarlas a GitHub: `node scripts/cargar-secretos-e2e.ts`.
- **Testing tokens de Clerk:** `clerkSetup()` pide uno al arrancar y `setupClerkTestingToken()` lo
  inyecta en cada test. Así las pruebas pasan la detección de bots **sin desactivar** la protección
  de registro de Clerk.
- Los previews de Vercel están protegidos con Vercel Authentication: se entra con el *Protection
  Bypass for Automation* (`VERCEL_AUTOMATION_BYPASS_SECRET`).

## Agenda del administrativo (H3)

Tres archivos de [e2e/](../../e2e/) cubren las pantallas de H3 con la cuenta de administrativo (TOTP) y, en el negativo, la de paciente:

| Archivo | Qué recorre |
|---|---|
| [agenda.spec.ts](../../e2e/agenda.spec.ts) | Registrar pacientes `99…` (un DNI de 7 dígitos muestra «El DNI debe tener 8 dígitos»; un duplicado ofrece abrir al existente), agendar 14 días adelante con la advertencia y su hora límite en Lima, **doble reserva desde un segundo contexto** (`Registro de cita ya agendado`), confirmar («No asistió» aún no se ofrece), reprogramar y cancelar (la cita queda «Cancelada» sin acciones) |
| [bajas.spec.ts](../../e2e/bajas.spec.ts) | Agendar dos citas con el titular de Medicina general, registrar una ausencia que las cubra (el aviso dice cuántas caen dentro), reasignar **una** al sustituto, confirmar la nueva y dejar la otra por reasignar; el paciente que abre las rutas del administrativo vuelve a su área |
| [accesibilidad.spec.ts](../../e2e/accesibilidad.spec.ts) (prueba de H3) | axe (WCAG 2.1 A y AA) sobre Pacientes, Agenda, Agendar, Horarios y Bajas a 1280 y 390 px y con los diálogos y el selector de fecha abiertos; el foco entra al diálogo y vuelve al botón con Escape; todo control de la consola mide 24 px o más |

- **Requieren los datos de demostración** ([datos-demo.md](datos-demo.md)): médicos con horario de lunes a viernes y dos médicos de Medicina
  general. Sin ellos `agenda.spec.ts` y `bajas.spec.ts` se **omiten con un aviso** (no fallan). Los pacientes `99…` que crean no se pueden
  borrar; las citas y la ausencia sí se cancelan y se borran al terminar.
- **La base del preview es la rama `dev` de Neon**, no la rama efímera del PR (esa solo sirve a pgTAP, concurrencia e integración). Para que
  un preview con pantallas nuevas funcione hay que aplicar las migraciones pendientes a `dev` y sembrar la demostración
  (`node scripts/sembrar-datos-demo.ts --confirmar` con la URL directa de `dev`), como dice el plan de migración de cada change. Sin eso la
  pantalla muestra «No se pudo cargar la página» y el registro de Vercel dice qué función falta.
- **Correr contra un preview:** `PLAYWRIGHT_BASE_URL=<url del preview> npx playwright test e2e/agenda.spec.ts` con las variables `E2E_*`,
  `CLERK_SECRET_KEY` y `VERCEL_AUTOMATION_BYPASS_SECRET` en el entorno. Con `CAPTURAS_H3=<carpeta>` guardan una captura de cada pantalla en
  los pasos clave. Muchos inicios de sesión seguidos pueden agotar el límite de Clerk: si `iniciarSesion` agota el tiempo en pruebas que no
  tocó, espere unos minutos y repita.
- **La marca «Contactar al paciente»** (cita sin ningún sustituto libre) no se puede provocar desde la interfaz sin dar de baja al sustituto;
  la cubre `tests/integracion/consultas.test.ts` contra la base real.

## Portal del paciente (H4)

Siete archivos de [e2e/](../../e2e/) cubren el portal con **dos** cuentas de paciente (`E2E_PACIENTE_EMAIL` y `E2E_PACIENTE2_EMAIL`):

| Archivo | Qué recorre |
|---|---|
| [portal-registro.spec.ts](../../e2e/portal-registro.spec.ts) | La espera de la cuenta en preparación (el formulario aparece solo cuando el perfil existe), las validaciones del documento y de los campos obligatorios, el alta con un documento nuevo, la vinculación de una ficha de la clínica (mismo correo y fecha de nacimiento: sin duplicar, sin sobrescribir y con sus citas en «Mis citas»), los tres rechazos con el mismo mensaje, la cuenta que ya tiene ficha y que ninguna dirección visitada lleve documento, correo ni nombres |
| [portal-reserva.spec.ts](../../e2e/portal-reserva.spec.ts) | Reserva completa desde «Inicio» en 5 elecciones con la advertencia y su hora límite en Lima, «atrás» que conserva la selección, horas de Lima aunque el navegador use otra zona, cita a menos de 1 hora, **doble reserva real con dos contextos y dos pacientes**, doble clic, sesión vencida a mitad del flujo, nada en el pasado |
| [portal-cancelacion.spec.ts](../../e2e/portal-cancelacion.spec.ts) | Cancelar una cita lejana (pasa a «Anteriores» y el horario vuelve a la búsqueda), sin botón a menos de 1 hora, envío forzado con la pantalla desactualizada, una cita que ya es de otro paciente, doble clic, sin «Reprogramar» |
| [portal-aislamiento.spec.ts](../../e2e/portal-aislamiento.spec.ts) | El paciente es llevado a `/paciente` desde las áreas del personal, sin enlaces a contenido clínico, títulos de pestaña sin datos personales, rutas de la API del personal sin datos |
| [portal-accesibilidad.spec.ts](../../e2e/portal-accesibilidad.spec.ts) | axe (WCAG 2.1 A y AA) sobre cada pantalla y estado del portal, a 390 y a 1280 px: registro (espera, vacío, con errores), «Inicio», «Mis citas» vacío y con datos, el diálogo de cancelación y cada paso de «Reservar» con la alerta de horario tomado |
| [portal-responsive.spec.ts](../../e2e/portal-responsive.spec.ts) | Sin desplazamiento horizontal a 320 y 390 px en todas las pantallas, objetivos táctiles de 44 × 44 px (48 px de alto en «Reservar cita» y «Confirmar cita»), reserva completa solo con teclado con el foco visible y en el `<h1>` de cada paso, y `role="alert"` / `role="status"` |
| [db.spec.ts](../../e2e/db.spec.ts) | Postgres reconoce a ambos pacientes por su token de Clerk y `correo_actual()` es el correo de la cuenta en minúsculas (el claim `email`) |

[portal-pantallas.ts](../../e2e/portal-pantallas.ts) es el recorrido por todas las pantallas que comparten las de accesibilidad y de diseño adaptable.

- **Datos de prueba** ([datos-portal.ts](../../e2e/datos-portal.ts)): se siembran con la conexión del dueño sobre la base que sirve la app (la rama `dev` de
  Neon), no desde la interfaz. Un médico de prueba (`CMP-E2E-PORTAL`, «Especialista E2E Portal») con la agenda abierta las 24 horas en su propia
  especialidad, que se borra con todas sus citas al terminar, y la ficha del segundo paciente (documento `98000002`), que queda. Las pruebas de
  registro usan los documentos `9800001x` (rango `98…`, aparte de los `99…` de la demostración) y el perfil `e2e_otra_cuenta`. La URL sale de
  `E2E_DATABASE_URL` o, en local, de `DATABASE_URL_UNPOOLED` de `.env.local`; se niega a usar el pooler y la base de producción. **Sin esa URL o sin la
  segunda cuenta, estas specs se omiten con un aviso** (como las de H3 sin los datos de demostración).
- **No se crean cuentas nuevas de Clerk:** cada alta dispararía el webhook de la instancia compartida (también la de producción) y dejaría perfiles de
  prueba allí. Las pruebas de registro reutilizan la cuenta del segundo paciente y cambian el estado de la base (con o sin perfil, con o sin ficha).
- **Segunda cuenta de paciente:** `E2E_PACIENTE2_EMAIL` y `E2E_PACIENTE2_PASSWORD` (paso 4 de [pasos-manuales-h4.md](../09-deploy/pasos-manuales-h4.md)), con el patrón
  `…+clerk_test@…` y el código fijo `424242`.
- **BotID y los límites en el preview:** Playwright es lo que BotID detecta como bot. Para las E2E contra una build local y contra el preview se pone
  `BOTID_EXCEPCION_E2E=1` (en `.env.local` y solo en el entorno **Preview** de Vercel); el código la ignora con `VERCEL_ENV=production`. Sin Upstash
  configurado el portal corre sin límite de peticiones, así que ninguna E2E choca con un 429. Ver [pasos-manuales-h4.md](../09-deploy/pasos-manuales-h4.md), paso 5, y
  [ADR-0026](../03-arquitectura/adrs/0026-controles-de-borde-antibots-y-rate-limiting.md).
- **Correr en local:** solo contra la build de producción (`npm run build && npm start` y `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test portal-`).
  Con `next dev` en Windows el inicio de sesión se queda en blanco. **No lance `next dev` en la misma carpeta mientras corre `next start`:** comparten
  `.next` y se estropean mutuamente. En Windows, para detener los servidores use `Stop-Process` (no hay `pkill`).
- **Tres hallazgos de la implementación** que conviene recordar al tocar estas pantallas:
  1. Una Server Action que **no** revalida (un rechazo como «ya no se puede cancelar») no debe dejar que la lista nueva desmonte el diálogo antes de que
     se lea el motivo: el diálogo vuelve a leer la lista al cerrarse (`boton-cancelar.tsx`).
  2. `getByRole("alert")` cuenta también el anunciador de rutas de Next (fuera de `main`): acote con `page.locator("main")`.
  3. Las pantallas de `app/paciente/citas/` **no usan `loading.tsx`**: tienen su propio `<Suspense>` con el esqueleto («Buscando horarios…», «Cargando sus
     citas…») y una `key` que cambia en cada paso (y, en «Mis citas», en cada lectura). Ver «Cosas que aprendimos».

## Interfaz: tema, componentes y galería (H2b)

La interfaz sigue [DESIGN.md](../02-diseno/DESIGN.md). Antes de abrir un PR de interfaz: `npm run test:tema` (generador y
utilidades de `lib/ui/`) y `npm run tema:comprobar` (CSS al día, sin colores literales, contraste WCAG); ambos corren
también en el job `typecheck-lint-build` de CI.

- **Cambiar un color, tipografía, espaciado, radio o sombra:** edite el front matter de DESIGN.md y ejecute
  `npm run tema`; esto reescribe `app/tema.generado.css`. Revise el diff, que es lo que verá la interfaz.
- **Regenerar `components/ui/`** (componentes de shadcn/ui: `button`, `input`, `label`, `textarea`, `alert`, `badge`,
  `card`, `table`): `npx shadcn@latest add <componente> -o` sobrescribe el archivo con la versión de la CLI. Esos
  archivos llevan ajustes del proyecto (alturas de 44 px, radios y tonos de DESIGN.md) y lo dice su primera línea:
  tras regenerar, `git diff components/ui/<archivo>` y reaplique los ajustes. Los componentes propios, con los nombres
  de DESIGN.md, viven en `components/clinica/` y no los toca la CLI.
- **Galería `/guia-de-estilo`:** muestra cada componente de `components/clinica/` en todos sus estados con datos
  sintéticos de [lib/ui/ejemplos.ts](../../lib/ui/ejemplos.ts) (pacientes con documento `99…`, un «ahora» fijo para que las
  citas no cambien con el tiempo). Exige sesión y **no existe en producción**: `galeriaVisible()` de
  [lib/ui/galeria.ts](../../lib/ui/galeria.ts) devuelve falso cuando `VERCEL_ENV` es `production` y la página responde
  `notFound()`; en local con `next start` y en los previews se ve. Es el objetivo de las pruebas de accesibilidad
  (`e2e/accesibilidad.spec.ts`) y de las de componentes (`e2e/componentes.spec.ts`).
- **Para revisar un componente nuevo:** añada su sección a la galería con todos sus estados (normal, error, vacío,
  deshabilitado, solo lectura), abra `/guia-de-estilo` en el preview del PR a 390 px y a 1280 px, recórrala con la tecla
  de tabulación y deje su prueba en `e2e/componentes.spec.ts`. Los colores, tamaños y textos salen de
  [DESIGN.md](../02-diseno/DESIGN.md); si algo no cabe allí, el cambio se hace primero en ese documento.
- **Clerk en español y con la marca:** `ClerkProvider` recibe la localización `esMX` (la variante latinoamericana del
  paquete `@clerk/localizations`; no hay variante peruana) con los textos de [lib/ui/clerk-es.ts](../../lib/ui/clerk-es.ts),
  que pasan a «usted» las pantallas por las que pasa un paciente (DESIGN.md), y `appearance.variables` con variables del
  tema (`var(--color-primary)`…, sin colores literales). Lo que no está en ese archivo queda como lo trae el paquete, que
  mezcla «tú» y «usted».
- **Selectores de Clerk en las E2E:** nunca por texto (la interfaz está en español y puede cambiar de redacción), sino por
  atributos estables de su marcado, definidos al inicio de [e2e/helpers.ts](../../e2e/helpers.ts): `input[name="identifier"]`,
  `input[name="password"]`, `button.cl-formButtonPrimary` y `input[autocomplete="one-time-code"]` para el código; el error de
  un formulario se busca por `data-testid="form-feedback-error"`. Si una actualización de Clerk rompe uno, se corrige ahí.
- **Dependencias de shadcn/ui:** la CLI actual usa el paquete `cn` (mantenedor shadcn, repo `shadcn-ui/cn`) en lugar de
  `clsx` + `tailwind-merge`; está en `package.json`.

## Accesibilidad (WCAG 2.1 AA)

**Automática:** [e2e/accesibilidad.spec.ts](../../e2e/accesibilidad.spec.ts) ejecuta axe (`@axe-core/playwright`, etiquetas
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) sobre la portada pública, la galería (a 1280 y a 390 px, también con un horario
elegido), `/paciente` y `/administrativo`, y falla ante **cualquier** violación. Además `npm run tema:comprobar` calcula el
contraste de los pares de DESIGN.md. Comprobado que la prueba se pone en rojo: al quitar la asociación de la etiqueta de un
campo, axe reporta `label (critical)`.

**Fuera de lo automático (revisión manual, una vez por PR de interfaz y anotando el resultado en el PR):**

1. **Teclado:** recorrer con `Tab` cada pantalla nueva: el foco pasa por todos los controles en orden lógico, siempre se ve el
   anillo de foco y nunca queda atrapado (menú, selector de horario, formularios).
2. **Lector de pantalla** (NVDA en Windows o VoiceOver): el error de un campo se anuncia como alerta y se asocia al campo; el
   horario elegido y la advertencia de cancelación («… hasta 1 hora antes, a las 13:30») se anuncian; los estados de cita se
   leen con su etiqueta y no solo con el color.
3. **Zoom al 200 %** (y 320 px de ancho): no se pierde contenido ni funciones, y no hay desplazamiento horizontal salvo dentro
   de las tablas de la consola.
4. **Objetivos táctiles:** al menos 44 px en el portal (48 px la acción principal) y 24 px como mínimo en la consola.
5. **Pantallas de Clerk** (`/iniciar-sesion`, `/registro`, MFA): su marcado no es nuestro y quedan fuera del recuento de axe. Se
   revisan a mano. Hallazgos conocidos de Clerk, no corregibles aquí: el campo del código de verificación mantiene su
   `aria-label` en inglés («Enter verification code»); el subtítulo muestra el nombre de la aplicación configurado en el panel de
   Clerk («citas-clinicas»), que se cambia allí; el pie «Secured by Clerk / Development mode» no se traduce.

### Revisión manual del portal del paciente (H4)

Además de la lista anterior, una vez por PR que toque el portal, **sobre el preview** y a 390 px, con el resultado de cada ítem anotado en el PR
(la prueba con personas mayores tiene su propio protocolo: [usabilidad-portal.md](usabilidad-portal.md)):

1. **Lector de pantalla (NVDA en Windows, VoiceOver en iPhone) sobre el registro:** el error de cada campo se anuncia como alerta y se asocia al
   campo; «Estamos preparando su cuenta…» se anuncia sin quitar el foco; el correo se lee como dato de solo lectura.
2. **Lector de pantalla sobre la reserva:** al avanzar de paso se anuncia el título nuevo (el foco pasa al `<h1>`); cada día se lee con su fecha y
   «N horarios» o «Sin horarios»; el horario elegido y la advertencia («Podrá cancelar esta cita hasta 1 hora antes, a las 13:30») se anuncian
   antes del botón; la doble reserva se anuncia con el texto exacto `Registro de cita ya agendado` y el esqueleto con «Buscando horarios…».
3. **Lector de pantalla sobre la cancelación:** el diálogo se anuncia como diálogo de alerta con médico, fecha y hora; el foco empieza en «No cancelar»;
   tras cancelar se anuncia «Su cita fue cancelada.» sin mover el foco.
4. **Zoom al 200 %** (y 320 px) en las seis pantallas del portal: no se pierde contenido ni funciones y no hay desplazamiento horizontal.
5. **Teclado** (computador): recorrer con `Tab` el registro, «Mis citas» (incluido el diálogo, que atrapa el foco y se cierra con Escape) y la reserva
   completa; el foco se ve siempre y nunca queda atrapado.
6. **Pantallas de Clerk del alta y del inicio de sesión** (fuera del recuento de axe): se revisan a mano como en el punto 5 de la lista anterior.

**Estado:** ⏳ pendiente de ejecutar sobre el preview de este change (lo hace una persona con el lector de pantalla instalado).

## Cosas que aprendimos

- Un navegador nuevo pasa por la verificación de "dispositivo nuevo" (client trust) de Clerk; el
  helper mete el código `424242`, reintentando hasta que Clerk haya enviado el código.
- Con TOTP activo, Clerk pide el segundo factor en lugar de la verificación de dispositivo.
- `next dev` deja a veces la página en blanco tras iniciar sesión; contra la build de producción no
  ocurre.
- **`loading.tsx` en rutas de contenido dinámico (H4):** en `app/paciente/citas/` y `app/paciente/citas/nueva/`, con un `loading.tsx` (que envuelve la
  página en un `Suspense` que sigue montado entre una navegación y la siguiente), la navegación por enlace entre pasos de la misma ruta y
  `router.refresh()` dejaban a veces la pantalla anterior aunque la respuesta del servidor (`_rsc`) llegaba completa y correcta: en Playwright Chromium
  fallaba siempre y en Chrome de forma intermitente, y dependía del tamaño de la respuesta (30 días fallaban, 9 no). No lo explican la compresión, ni
  Turbopack (pasa igual con webpack), ni `useTransition`, ni el proveedor de avisos. **Lo que sí funciona:** un `<Suspense>` propio dentro de la página con
  una `key` que cambia en cada lectura (los pasos de «Reservar» usan los parámetros de la dirección; «Mis citas» agrega `Date.now()` para que un
  `router.refresh()` monte un límite nuevo), de modo que el esqueleto sigue viéndose. Si se toca esto, repetir `portal-reserva` y `portal-cancelacion`
  con la build de producción y con Chromium (`CI=1 npx playwright test … --retries=0`), no solo con Chrome.
- **Sesión vencida en una E2E:** borrar las cookies `__session` del navegador **no** simula una sesión vencida: Clerk las vuelve a escribir desde su token en
  memoria en menos de un segundo. La prueba termina la sesión en Clerk (`Clerk.session.end()`).

- **Pruebas unitarias de turnos y jornada (H7):** `npm run test:turnos-dashboard` (`node --test "tests/turnos-dashboard/*.test.ts"`). Los archivos que trabajan con
  fechas de Lima se repiten solos en procesos hijos con `TZ=UTC` y `TZ=Asia/Tokyo` (`tests/turnos-dashboard/_zonas.ts`); para correr TODO el conjunto con otra zona
  del proceso, en PowerShell: `$env:TZ='Asia/Tokyo'; npm run test:turnos-dashboard`. Las E2E `e2e/enfermera.spec.ts` y `e2e/medico.spec.ts` necesitan TOTP en
  las cuentas de enfermera y médico (`E2E_ENFERMERA_TOTP_SECRET`, `E2E_MEDICO_TOTP_SECRET`: paso manual 1.2 del change `turnos-y-dashboard`); sin ellas se omiten.
