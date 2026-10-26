# Security Pass — Sistema de Gestión de Citas e Historias Clínicas Electrónicas

Fecha: 2026-10-25
Rama revisada: `feat/h4-registro-y-aislamiento` (PR #21), commit `8eca79a`

Alcance revisado:
- **Revisadas:** documentación de producto y diseño (CLAUDE.md, PRD, TECH-DESIGN, ADR, specs del change `portal-del-paciente`), código de la aplicación (middleware, Route Handlers, guardas de Server Actions, cliente de base de datos, controles de borde), migraciones SQL con RLS y funciones `SECURITY DEFINER`, pruebas (pgTAP, integración, E2E), workflows de GitHub Actions, dependencias (`npm audit`) y las cabeceras HTTP reales del preview de Vercel.
- **Fuera de alcance por falta de material:** los módulos H5 (notificaciones), H6 (historias clínicas) y H7 (turnos y dashboard) no tienen código todavía, solo especificación; no se revisó su implementación. No se revisaron la configuración interna de Clerk, Neon y Vercel (solo lo observable desde el repositorio y desde las respuestas del preview). Las variables de entorno de Vercel solo se comprobaron por nombre, nunca por valor.
- **Método:** análisis de solo lectura. Para esta pasada se corrió además `code-review` sobre las migraciones y acciones del portal (hallazgos integrados abajo). No se modificó código en este pase.

## Resumen ejecutivo

El diseño de seguridad es sólido donde más importa: el aislamiento de datos vive en la base de datos (RLS con prueba negativa por tabla), la identidad del usuario llega firmada a Postgres y ninguna Server Action recibe identificadores de paciente o rol del cliente. No se encontraron secretos en el repositorio ni inyección SQL.

Lo que sí requiere atención antes de presentar o abrir el sistema: (1) la versión de Next.js instalada tiene avisos de seguridad con corrección disponible dentro de la misma rama; (2) la aplicación no envía cabeceras de seguridad propias (sin protección contra clickjacking ni CSP); (3) un endpoint público de salud usa la credencial de dueño de la base de datos; y (4) una brecha de diseño conocida en el registro del paciente permite ocupar el DNI de un tercero. Esta última es una decisión del cliente, no un defecto de código. El sistema es apto como demostración con datos sintéticos; **no** lo es todavía para datos clínicos reales por razones que el propio proyecto ya documenta (P-1).

## Fortalezas de seguridad

- **Aislamiento en la base de datos, no en la aplicación.** Las políticas RLS deciden qué filas ve cada rol; una prueba pgTAP (`99_rls_en_todas_las_tablas`) falla si una tabla del esquema `public` queda sin RLS. La suite pgTAP completa pasa (916 pruebas, 0 fallos en `dev`).
- **Identidad inmune a la manipulación del cliente.** El rol sale de `publicMetadata` (que el usuario no puede escribir), el correo del claim validado por Neon, y el paciente de `paciente_actual()`. Ninguna acción acepta un id de paciente, perfil o rol desde el cliente (`lib/auth/accion-paciente.ts`).
- **Credencial de tráfico sin privilegios.** Las consultas autenticadas usan el rol `authenticator` sin acceso a tablas, con `set local role authenticated` en cada transacción, solo por HTTP (sin conexiones reutilizables que arrastren la identidad de otro usuario). Falla cerrado.
- **Funciones `SECURITY DEFINER` bien acotadas:** `search_path = ''`, nombres calificados, `REVOKE` a `public` y `GRANT` solo a `authenticated`.
- **Enumeración de documentos mitigada:** todos los rechazos de vinculación devuelven el mismo error y el mismo texto.
- **Reglas de negocio impuestas por el motor:** doble reserva por `EXCLUDE` (con el literal exacto exigido), ventana de cancelación de 1 h por disparador, transiciones de estado validadas, columnas protegidas contra edición.
- **Webhook de Clerk verificado por firma** (`verifyWebhook`); el rol "paciente" se fuerza en el autorregistro.
- **Controles de borde:** BotID en registro y reserva, límite de peticiones por usuario y por IP, y límite en las rutas de autenticación. La excepción de BotID para pruebas (`BOTID_EXCEPCION_E2E`) se ignora en producción por código (`VERCEL_ENV`).
- **Higiene de secretos:** `.env*.local` ignorados, ningún secreto detectado en archivos versionados, las acciones de Neon fijadas por SHA, las pruebas se niegan a correr si el host coincide con producción.
- **Mensajes de error sin fugas:** `/api/db-sesion` solo da detalle fuera de producción y con las URL de conexión enmascaradas.

## Findings

### MEDIUM

**SEC-01 — Next.js 15.5.26 tiene avisos de seguridad con corrección en 15.5.28**
- Severity: MEDIUM · Confidence: HIGH
- Category: Dependencias / cadena de suministro
- Affected artifact: `package.json` (`"next": "15.5.26"`)
- Location: `package.json:36`
- Description: `npm audit --omit=dev` marca `next` 10.0.0–15.5.27 como **critical**, con cuatro avisos: envenenamiento de caché SSG/ISR (GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p), ejecución remota sin autenticación en la API de optimización de imágenes con SVG (GHSA-2464-fhr4-w9xw) y denegación de servicio con Server Actions (GHSA-p3m5-59mp-jv5r).
- Evidence: salida de `npm audit`; `npm view next@15.5.28 version` confirma que la corrección existe en la misma rama.
- Attack scenario: un atacante sin cuenta envía solicitudes diseñadas contra las Server Actions del portal (que son un `POST` invocable sin pasar por la página) para agotar recursos de la función y degradar el servicio de reservas.
- Potential impact: disponibilidad. Severidad **MEDIUM y no CRITICAL** porque el proyecto se despliega en Vercel (el aviso de caché aplica a despliegues autoalojados), no usa `next/image` ni SVG (no se encontró uso en `app/` ni `components/`, por lo que el aviso de RCE de imágenes no parece alcanzable, aunque no lo probé), y el DoS en una plataforma serverless acota el daño.
- Existing mitigation: límite de peticiones por usuario/IP en las acciones del portal (no cubre el vector del aviso, que actúa antes).
- Recommended remediation: subir a `next@15.5.28` (o la última 15.5.x), regenerar `package-lock.json`, correr `build`, `typecheck` y las E2E.
- Suggested verification: `npm audit --omit=dev` sin `next`; build y E2E en verde.
- Required change type: **CODE FIX**

**SEC-02 — Una cuenta puede ocupar el DNI/CE de otra persona al registrarse (titularidad no verificada)**
- Severity: MEDIUM · Confidence: HIGH (la ruta de código está verificada; el impacto depende de cómo opere el personal)
- Category: Control de acceso / lógica de negocio
- Affected artifact: función `public.registrar_paciente_portal`, ADR-0037, `design.md` de `portal-del-paciente` (pregunta abierta Q3)
- Location: `migrations/1792536080588_portal-paciente-vinculacion.sql:70-88`
- Description: si el documento enviado no existe en `pacientes`, la función crea la ficha con los datos que escribió la cuenta, sin ninguna prueba de que el documento le pertenezca. Para una ficha ya existente sí exige coincidencia de correo verificado y fecha de nacimiento; para un documento nuevo no hay nada que comparar.
- Evidence: bloque `if not found then insert into public.pacientes …` en las líneas citadas. El ADR-0037 acepta como riesgo residual solo la *enumeración* de documentos, no esta ocupación.
- Attack scenario: una persona con correo verificado registra el DNI de un tercero que la clínica aún no tiene. Cuando el titular real se registra, recibe el error «No se pudo registrar ese documento» y se le manda a la clínica. Si el personal agenda al titular sobre la ficha ocupada sin notar que el nombre no cuadra, quien la ocupó vería esas citas en «Mis citas», y los recordatorios de H5 le llegarían a su correo.
- Potential impact: suplantación de identidad, exposición de datos de citas (no clínicos: el paciente no accede a historias clínicas) y bloqueo del titular legítimo. Severidad MEDIUM porque no expone contenido clínico y exige un paso humano del personal.
- Existing mitigation: el paciente no tiene acceso a historias clínicas ni a otras fichas; el error del titular lo deriva a la clínica; la restricción de unicidad impide dos fichas con el mismo documento.
- Recommended remediation: decisión del cliente entre (a) aceptar el riesgo con la nota de que el administrativo verifica la identidad al agendar sobre fichas creadas desde el portal, (b) marcar las fichas creadas por autorregistro como «sin verificar» hasta que el personal las valide, o (c) exigir una verificación de titularidad adicional (por ejemplo, validación contra RENIEC). Hasta decidir, documentar el riesgo en el ADR-0037.
- Suggested verification: prueba E2E o de integración que cubra la política elegida (ficha sin verificar no genera recordatorios, o el personal ve la marca de origen).
- Required change type: **PRODUCT / REQUIREMENT CHANGE**

**SEC-03 — Endpoint público `/api/salud` usa la credencial de dueño de la base de datos**
- Severity: MEDIUM · Confidence: MEDIUM
- Category: Gestión de privilegios / secretos
- Affected artifact: `app/api/salud/route.ts`, variable `DATABASE_URL`
- Location: `app/api/salud/route.ts:6`
- Description: la ruta no exige sesión ni pasa por límite de peticiones, y abre una conexión con `DATABASE_URL` para ejecutar `select 1`. En el entorno local `DATABASE_URL` pertenece al rol `neondb_owner` (verificado por nombre de usuario, no por contraseña). La existencia de `DATABASE_URL` en el entorno Preview de Vercel se verificó por nombre; **no se pudo leer ni verificar con qué rol corre en Production**.
- Evidence: el único uso de `process.env.DATABASE_URL` en código de aplicación es esa ruta (`git grep`); `CLAUDE.md` establece que la credencial de más alcance no debe usarse en código que sirve tráfico de usuario y que ese aislamiento se hace por rol de Postgres.
- Attack scenario: cualquier fallo que dé ejecución de código en el runtime (por ejemplo, un aviso de dependencia como SEC-01) entregaría al atacante una credencial dueña que se salta toda la RLS, incluido el contenido clínico futuro. Además, cualquiera puede llamar al endpoint en bucle y mantener el cómputo de Neon despierto (consumo de CU-horas del plan gratuito).
- Potential impact: ampliación del radio de daño de cualquier otro fallo; consumo de cuota.
- Existing mitigation: la consulta es fija (`select 1`) y no hay entrada del usuario en ella; el aislamiento en el resto del código sí usa `authenticator`.
- Recommended remediation: que `/api/salud` use un rol de solo conexión (`authenticator`, o un rol dedicado sin permisos) o no toque la base de datos; retirar `DATABASE_URL` de los entornos Production y Preview de Vercel si nada más la usa; agregar una regla de límite de peticiones por IP a esta ruta.
- Suggested verification: `npx vercel env list` sin `DATABASE_URL` en Production/Preview; `GET /api/salud` sigue respondiendo y, con 100 llamadas seguidas, devuelve 429.
- Required change type: **CODE FIX**

**SEC-04 — La aplicación no envía cabeceras de seguridad propias (clickjacking, CSP)**
- Severity: MEDIUM · Confidence: HIGH
- Category: Misconfiguration
- Affected artifact: `next.config.ts`, `middleware.ts`
- Location: `next.config.ts` (sin función `headers()`)
- Description: en la respuesta real de `/iniciar-sesion` del preview solo aparece `strict-transport-security` (lo aporta Vercel). No hay `X-Frame-Options` ni `frame-ancestors`, ni `Content-Security-Policy`, ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni `Permissions-Policy`. `git grep` no encuentra ninguna de esas cabeceras en el código.
- Evidence: petición real al preview con la cabecera de bypass; salida solo con HSTS.
- Attack scenario: una página de un tercero incrusta el portal en un `iframe` invisible y engaña al paciente (o al personal) para que pulse «Confirmar cita» o «Cancelar cita» ya autenticado.
- Potential impact: acciones no deseadas con la sesión de la víctima; superficie mayor para XSS si aparece una inyección. Severidad MEDIUM por tratarse de una aplicación con datos de salud, aunque React escapa por defecto y no se halló XSS.
- Existing mitigation: las acciones destructivas piden confirmación explícita; las Server Actions de Next.js comprueban el origen.
- Recommended remediation: agregar `headers()` en `next.config.ts` con `Content-Security-Policy` (incluyendo `frame-ancestors 'none'` y los orígenes de Clerk y BotID), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Permissions-Policy` restrictiva. Probar la CSP en modo `Report-Only` primero, porque Clerk carga scripts y marcos propios.
- Suggested verification: repetir la petición y comprobar las cabeceras; E2E de inicio de sesión y reserva en verde con la CSP activa.
- Required change type: **CODE FIX**

### LOW

**SEC-05 — Zod con aviso de consumo de memoria al validar colecciones grandes**
- Severity: LOW · Confidence: MEDIUM
- Category: Dependencias
- Affected artifact: `package.json` (`"zod": "^3"`)
- Description: `npm audit` marca `zod <4.6.6` (GHSA-mrhx-c7xc-m3w5). La corrección exige la versión 4, que es un cambio incompatible.
- Evidence: salida de `npm audit`. Los esquemas del repositorio validan campos acotados y las solicitudes pasan por el límite de tamaño de cuerpo de Vercel, lo que reduce la exposición; no probé una carga hostil.
- Potential impact: agotamiento de memoria de una función. Severidad LOW por la acotación del tamaño de entrada.
- Recommended remediation: planificar la migración a Zod 4 con sus pruebas; mientras tanto, mantener límites explícitos (`.max()`) en todo campo de texto y en toda lista (hoy hay solo 6 usos de `.max(` en `lib/schemas`, conviene revisar la cobertura).
- Required change type: **CODE FIX**

**SEC-06 — Los workflows de CI reciben secretos de alto alcance y las acciones no están fijadas por SHA**
- Severity: LOW (HIGH si se cargan datos clínicos reales) · Confidence: HIGH
- Category: CI/CD y cadena de suministro
- Affected artifact: `.github/workflows/e2e.yml`, `neon-branch-pr.yml`, `ci.yml`
- Description: (a) el workflow E2E corre el código del commit desplegado con `CLERK_SECRET_KEY` y la URL de dueño de la base `dev` (`E2E_DATABASE_URL`); el propio archivo advierte que depende de que Vercel exija autorización para PR de forks. (b) `actions/checkout`, `setup-node` y `upload-artifact` están referenciadas por etiqueta (`@v4`) y no por SHA (solo las de Neon están fijadas). (c) cada PR crea un branch de Neon copiando los datos de `production` porque el plan gratuito rechaza `schema-only` (el comentario del workflow lo reconoce).
- Evidence: el contenido de los tres archivos.
- Attack scenario: un colaborador con permiso de escritura (o una acción de terceros comprometida) puede leer los secretos del job; con datos reales, los branches de PR llevarían copias de la historia clínica.
- Potential impact: hoy bajo (datos sintéticos, instancia de desarrollo de Clerk). Crece con datos reales.
- Existing mitigation: PR desde forks sin secretos en el workflow de Neon, permisos `contents: read`, guarda de host de producción en las pruebas, caducidad de 14 días en los branches de preview.
- Recommended remediation: fijar todas las acciones por SHA; antes de cargar datos reales, pasar a un plan que permita `schema-only` o a un branch base sin datos, y separar las credenciales de CI de las de dueño.
- Required change type: **PROCESS / HARNESS CHANGE**

### INFO

**SEC-07 — Controles de borde que fallan abiertos (riesgo ya aceptado en ADR-0026)**
- Severity: INFO · Confidence: HIGH
- Description: el limitador de peticiones y BotID dejan pasar la solicitud si su servicio no responde (`lib/seguridad/limites.ts`, `lib/seguridad/antibots.ts`); y el límite de las rutas de autenticación cuenta cargas de página, no intentos de credenciales (esos van a la API de Clerk, que aplica su propio bloqueo). Las barreras reales (RLS, `EXCLUDE`, disparadores) no dependen de ellos.
- Required change type: **ACCEPT RISK** (ya aceptado en el ADR-0026; se lista para que conste).

**SEC-08 — Cancelación de citas ya iniciadas por el paciente (corregido en esta sesión)**
- Severity: INFO · Confidence: HIGH
- Description: la revisión `code-review` detectó que un paciente podía cancelar una cita confirmada ya pasada si el médico tenía un bloqueo de agenda, porque la excepción por baja se salta la ventana de 1 h. Se corrigió con la migración `1792536300000_portal-cancelacion-solo-citas-futuras.sql` (la política exige `inicio > now()`) y una prueba negativa nueva en `tests/pgtap/71_portal_cancelacion.test.sql`.
- Required change type: **CODE FIX** (aplicado; falta que el CI de la rama lo confirme).

**SEC-09 — Credenciales de las cuentas de prueba mostradas en la consola de una sesión de trabajo**
- Severity: INFO · Confidence: HIGH
- Description: al inspeccionar `.env.local` durante este trabajo se imprimieron en la salida de la herramienta el secreto TOTP del administrativo de pruebas, la contraseña del segundo paciente de pruebas y el secreto de bypass de la protección de Vercel. Son de una instancia de desarrollo con cuentas sintéticas, pero quedan en el historial de la sesión.
- Recommended remediation: si la transcripción se comparte o se archiva, rotar el secreto de bypass (Vercel, Settings, Deployment Protection) y las contraseñas de las cuentas de prueba de Clerk.
- Required change type: **PROCESS / HARNESS CHANGE**

## Prioridad

1. **SEC-01** (actualizar Next.js) — cambio de una línea, el más barato y el que cierra el único aviso marcado como crítico. Conviene hacerlo antes que SEC-03, porque ese aviso es el camino por el que la credencial de dueño podría llegar a ser relevante.
2. **SEC-03** (credencial de dueño en `/api/salud`) — barato y reduce el radio de daño de cualquier otro fallo.
3. **SEC-04** (cabeceras de seguridad) — un cambio de configuración; la CSP requiere pruebas con Clerk, así que se empieza en `Report-Only`.
4. **SEC-02** (DNI ocupado) — requiere la decisión del cliente; mientras tanto, documentar el riesgo en el ADR-0037.
5. **SEC-06** y **SEC-05** — antes de cargar datos reales o abrir el sistema al público.

## Estado de remediación (2026-10-25, mismo día del pase)

Tras el pase se aplicaron los tres arreglos de menor costo. Los hallazgos de arriba se dejan tal como se detectaron; esta tabla dice qué cambió.

| ID | Estado | Qué se hizo | Verificación |
|---|---|---|---|
| SEC-01 | **Corregido** | `next` 15.5.26 → 15.5.28 (`package.json`, `package-lock.json`). | `npm audit --omit=dev` ya no lista `next`; `build`, `typecheck`, `lint` y 28 pruebas E2E locales en verde. |
| SEC-03 | **Corregido en código; falta una acción en Vercel** | `/api/salud` usa `DATABASE_AUTHENTICATED_URL` (rol `authenticator`) en vez de `DATABASE_URL`, y el middleware le aplica un límite de 30 peticiones por minuto por IP (`REGLAS.salud`). | 132 pruebas `test:portal` (incluye una nueva de la regla); `GET /api/salud` responde `{"estado":"ok"}` en local. **Pendiente (lo hace el dueño del proyecto):** retirar `DATABASE_URL` de los entornos Production y Preview de Vercel, ya que nada más en el código la usa. |
| SEC-04 | **Corregido en parte** | `next.config.ts` envía `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy`. | Cabeceras presentes en una build local; E2E de inicio de sesión, roles, registro y reserva en verde. **Pendiente:** un `script-src` completo, que necesita su propia prueba con Clerk y BotID. |
| SEC-02 | Abierto | Decisión del cliente. | — |
| SEC-05, 06, 07, 09 | Abiertos | Sin cambios. | — |
| SEC-08 | Corregido antes del pase | Migración `1792536300000`. | pgTAP 916 pruebas, 0 fallos. |

## Gobernanza / Decisión requerida

- **SEC-02 (PRODUCT / REQUIREMENT CHANGE):** el cliente debe decidir qué verifica la titularidad de un documento nuevo en el autorregistro, o aceptar el riesgo de forma explícita. No se resuelve en código sin esa decisión. Es la misma pregunta abierta Q3 del backlog.
- **SEC-07 (ACCEPT RISK):** ya aceptado en el ADR-0026; sin acción nueva.
- **Bloqueo previo, ya documentado:** P-1 (retención, firma electrónica y alojamiento de datos clínicos fuera de Perú) impide usar datos clínicos reales independientemente de los hallazgos de este informe.
- El resto de los hallazgos (SEC-01, 03, 04, 05, 06, 08, 09) son CODE FIX o PROCESS / HARNESS CHANGE y no requieren una decisión de producto o arquitectura.

## Segunda revisión: paneles del médico y la enfermera (2026-10-26)

Se sometió el PR #23 (turnos de enfermería, jornada, lectura de historia clínica, registro y firma de atención) a la revisión `code-review` con foco en RLS y acceso clínico. Resultado: **sin fugas entre médicos ni entre pacientes y sin escalada de privilegios**; las funciones `SECURITY DEFINER` nuevas tienen `search_path` vacío y `REVOKE` a `public`, las atenciones firmadas son inmutables, `firmada_en` y `creado_en` los fija el servidor, y la enfermera y el administrativo no reciben datos clínicos. Hallazgos y su estado:

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| SEC-10 | Alta | Abrir una atención registraba el acceso como tipo `historia`, sin el `atencion_id` | **Corregido** (`lib/atencion/consultas.ts`: acceso de tipo `atencion` con su id) |
| SEC-11 | Alta | Falta la guarda de datos clínicos reales (P-1, grupo 1 de `historias-clinicas`: `exigir_modo_clinico`, `exigir_paciente_admisible`): nada en la base impide registrar datos de un paciente real | **Abierto, mitigado en parte**: aviso visible de «solo datos ficticios» en todas las páginas del médico. Producción contiene solo datos sintéticos. **Bloquea el uso con pacientes reales** y es decisión del cliente (P-1) |
| SEC-12 | Media | Dos módulos leen tablas clínicas (`lib/historia` y `lib/atencion`) y la prueba de «punto único» admite ambos | Abierto: consolidar en `lib/historia` |
| SEC-13 | Media | La búsqueda de «Mis pacientes» usa `?q=` y deja nombres y documentos en la dirección, el historial y los registros de Vercel (la spec lo prohíbe) | Abierto: pasar a una búsqueda sin la dirección (por ejemplo, filtro en el cliente o acción de servidor) |
| SEC-14 | Baja | Joins internos con `perfiles` ocultaban atenciones y addendas si el autor cambiaba de rol | **Corregido** (`left join`) |
| SEC-15 | Baja | El cliente puede escribir `firma_metodo` y `firma_huella` al insertar (grant de INSERT a toda la tabla); hoy no es explotable porque solo existe el método `logica` | Abierto: restringir el INSERT por columnas antes de añadir otro método de firma |
| SEC-16 | Baja | `antecedentes.actualizado_en` se puede falsificar al insertar | Abierto: ninguna pantalla escribe antecedentes todavía |
| SEC-17 | Baja | El 404 de las pantallas de atención es HTTP 200 (`notFound()` dentro de `Suspense`) | Abierto: inconsistencia sin fuga |

Al verificar con Vercel apareció además un fallo de **caché de construcción** (los builds fallaban al resolver la fuente de Google con Turbopack; el mismo código construía bien sin caché). Se fijó `VERCEL_FORCE_NO_BUILD_CACHE=1` en Production y Preview como solución temporal; conviene quitarla tras un par de despliegues sanos.
