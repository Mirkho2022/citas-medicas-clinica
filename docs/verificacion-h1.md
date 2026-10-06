# Guion de verificación manual de H1 (autenticación y roles)

Cierra las tareas 3.1–3.6 y 5.1–5.3 de
[tasks.md](../openspec/changes/esqueleto-app-vercel-neon-clerk/tasks.md), que tienen el código
commiteado pero no se han probado con cuentas reales. Los escenarios citados están en la spec
`autenticacion-roles` del mismo change. Esta sesión también deja listas las cuentas para 6.4
(Playwright).

- **Entorno:** `https://citas-medicas-clinica.vercel.app` (producción de Vercel) con la instancia
  de **desarrollo** de Clerk (claves `pk_test_`/`sk_test_`). Es suficiente para H1; la instancia de
  producción de Clerk se decide antes de salir a producción real.
- **Quién hace qué:** las acciones con navegador y correo las haces tú; las consultas a la API de
  Clerk las hago yo con `CLERK_SECRET_KEY`.

## 0. Antes de empezar

| Requisito | Dónde | Estado |
|---|---|---|
| TOTP habilitado como segundo factor | Clerk Dashboard > User & Authentication > Multi-factor | ☐ |
| Claim `publicMetadata` en el token de sesión (`{{user.public_metadata}}`) | Clerk Dashboard > Sessions > Customize session token | ☐ |
| Invitaciones habilitadas | Clerk Dashboard > User & Authentication (modo de registro) | ☐ |
| Webhook `user.created` apuntando a `https://citas-medicas-clinica.vercel.app/api/webhooks/clerk` | Clerk Dashboard > Webhooks | ☐ |
| `CLERK_WEBHOOK_SIGNING_SECRET` de ese endpoint cargado en Vercel (Production) | Vercel > Settings > Environment Variables | ☐ |

Cuentas de prueba: correos con el sufijo `+clerk_test` sobre `example.com`. En una instancia de
desarrollo de Clerk esas direcciones no reciben correo real y su código de verificación es siempre
`424242`. Las contraseñas las genera Claude y quedan solo en `.env.local` (ignorado por git); luego
pasan a secretos de GitHub para 6.4. El TOTP se calcula a partir de la clave que muestra Clerk al
configurarlo, así que no hace falta teléfono.

| Rol | Correo |
|---|---|
| administrativo | `h1-administrativo+clerk_test@example.com` |
| medico | `h1-medico+clerk_test@example.com` |
| enfermera | `h1-enfermera+clerk_test@example.com` |
| paciente (autorregistro) | `h1-paciente+clerk_test@example.com` |

## 1. Paciente por autorregistro (4.1, 4.2, 3.1, 3.3, 3.6)

| # | Acción | Resultado esperado |
|---|---|---|
| 1.1 | Abrir `/registro` y crear la cuenta del paciente | Cuenta creada |
| 1.2 | Yo consulto el usuario por la API de Clerk | `publicMetadata.rol = "paciente"` (puede tardar unos segundos por el webhook) |
| 1.3 | Iniciar sesión | Aterriza en `/paciente`; **no** pide configurar MFA (escenario "Paciente no requiere MFA") |
| 1.4 | Con la sesión de paciente, abrir `/administrativo`, `/medico` y `/enfermera` | No muestra contenido de esas áreas |

## 2. Sesión y rutas protegidas (3.2, 3.4, 3.5)

| # | Acción | Resultado esperado |
|---|---|---|
| 2.1 | En una ventana privada, abrir `/paciente`, `/medico`, `/administrativo`, `/enfermera` | Redirige a iniciar sesión, sin contenido (escenario "Acceso denegado sin sesión") |
| 2.2 | Intentar iniciar sesión con contraseña incorrecta | Rechaza el intento y no hay sesión (escenario "Credenciales inválidas") |
| 2.3 | Con sesión iniciada, comprobar que el rol llega al token | La página de destino correcta confirma el claim (escenario "Rol disponible en la sesión"); si falla, revisar el requisito del claim de la sección 0 |

## 3. Personal por invitación (5.1, 5.2, 3.6)

Yo creo cada invitación con
`node --env-file=.env.local scripts/invitar-personal.ts <correo> <rol> --sin-correo`, que no envía
correo e imprime el enlace de la invitación; ese enlace se abre en el navegador para aceptarla.

| # | Acción | Resultado esperado |
|---|---|---|
| 3.1 | Invitar al correo `administrativo` y aceptar el enlace | Cuenta con `publicMetadata.rol = "administrativo"` (verifico por API) |
| 3.2 | Repetir con `medico` y `enfermera` | Cada cuenta con su rol exacto (escenario "Invitación crea la cuenta con el rol correcto") |
| 3.3 | Al iniciar sesión con cada cuenta de personal por primera vez | Lo dirige a `/configurar-mfa` antes de dar acceso (escenario "Personal sin MFA es dirigido a configurarlo") |
| 3.4 | Configurar TOTP y volver a entrar | Aterriza en el área de su rol |
| 3.5 | Intentar `/registro` buscando elegir un rol de personal | No hay campo ni camino para ello (escenario "No existe autorregistro de personal") |
| 3.6 | Yo invito de nuevo a un correo que ya tiene cuenta | Clerk rechaza; no cambia el rol existente |

**Punto de riesgo a mirar en 3.1/3.2:** si el rol queda en `paciente` en vez del invitado, el
webhook `user.created` no recibió el `public_metadata` de la invitación y lo trató como
autorregistro. Anotar el resultado exacto antes de corregir
([app/api/webhooks/clerk/route.ts](../app/api/webhooks/clerk/route.ts)).

## 4. Revocación de acceso (5.3)

Usar una cuenta de prueba que no sea la tuya principal. Yo corro
`node --env-file=.env.local scripts/revocar-acceso.ts <correo>`.

| # | Acción | Resultado esperado |
|---|---|---|
| 4.1 | Dejar abierta una sesión activa de esa cuenta; yo revoco | Al recargar, deja de ser válida (escenario "Revocación invalida la sesión activa"). El token puede seguir vigente hasta ~1 minuto: anota cuánto tarda |
| 4.2 | Intentar iniciar sesión con esa cuenta | Rechazado (escenario "Usuario revocado no puede volver a iniciar sesión") |
| 4.3 | Yo restauro con `--restaurar` | Puede volver a iniciar sesión |

## 5. Cierre

- Marcar en `tasks.md` las tareas cuyos escenarios pasaron y dejar anotado lo que falló.
- Dejar las cuentas de prueba creadas: 6.4 las necesita. Sus credenciales irán como secretos de
  GitHub, nunca en el repositorio.
- Anotar el comportamiento observado de la ventana de revocación en `design.md` si resulta mayor
  que lo esperado.

## Resultados (2026-10-06)

Ejecutado sobre `localhost:3000` con la instancia de desarrollo de Clerk. Cuentas: `h1-<rol>+clerk_test@example.com`.

| Escenario | Resultado |
|---|---|
| Inicio de sesión exitoso (paciente tras registro; enfermera tras restaurar acceso) | Pasa |
| Credenciales inválidas | Pasa: Clerk rechaza y no hay sesión |
| Rol disponible en la sesión | Pasa: `/` redirige según `publicMetadata.rol` del token |
| Registro público asigna rol paciente | Pasa |
| Intento de manipular el rol en el registro (`unsafeMetadata.rol = "medico"`) | Pasa: `publicMetadata.rol = "paciente"` |
| No existe autorregistro de personal | Pasa: `/registro` solo pide correo y contraseña |
| Invitación crea la cuenta con el rol correcto | Pasa para `administrativo`, `medico` y `enfermera` |
| Personal sin MFA es dirigido a configurarlo | Pasa (administrativo y enfermera) |
| Paciente no requiere MFA | Pasa |
| Acceso denegado sin sesión | Pasa en las cuatro áreas y en `/configurar-mfa` |
| Revocación invalida la sesión activa | Pasa: dejó de valer entre 27 y 39 s después de revocar |
| Usuario revocado no puede volver a iniciar sesión | Pasa: "You have been banned" |

Observaciones:

- **Las áreas no comprobaban el rol (resuelto).** `/administrativo`, `/medico`, `/enfermera` y `/paciente` solo exigían sesión (y MFA en las de personal): un paciente que entraba era enviado a `/configurar-mfa` y, con TOTP activo, habría visto el panel de personal; cualquier rol veía `/paciente`. Corregido con `exigirRol` en [lib/auth/rol.ts](../lib/auth/rol.ts), que lleva a cada rol a su propia área. Reverificado en `localhost`: el paciente es devuelto a `/paciente` desde las tres áreas de personal, la enfermera ya no ve `/paciente` y el administrativo (login con TOTP) es devuelto a `/administrativo` desde las demás.
- **TOTP:** el administrativo quedó con TOTP activo (`/administrativo` muestra el panel). Médico y enfermera no lo configuraron.
- **Revocación:** el baneo ya invalida las sesiones, por eso el script informa 0 sesiones activas revocadas. El token de Clerk sigue aceptándose hasta ~60 s.
- **Anti-bots:** tras varios registros seguidos Clerk mostró un CAPTCHA de Cloudflare; la prueba de Playwright (6.4) necesitará testing tokens de Clerk.
- **Alta de TOTP:** Clerk puede pedir reverificar la contraseña. Guardar archivos con `next dev` en marcha recarga la página y reinicia el alta.
