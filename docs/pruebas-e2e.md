# Pruebas E2E (Playwright)

Verifican el flujo de autenticación y la redirección por rol (H1, tarea 6.4). Código en
[e2e/](../e2e/), configuración en [playwright.config.ts](../playwright.config.ts).

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
- **CI:** [e2e.yml](../.github/workflows/e2e.yml) corre contra el preview de Vercel de cada PR
  cuando el deployment termina bien.

## Claves y cuentas

- Cuentas `h1-<rol>+clerk_test@example.com` en la instancia de **desarrollo** de Clerk. Los correos
  `+clerk_test` no envían correo real y su código de verificación es siempre `424242`.
- Las contraseñas y la clave TOTP del administrativo viven en `.env.local` (ignorado por git). Para
  llevarlas a GitHub: `bash scripts/cargar-secretos-e2e.sh`.
- **Testing tokens de Clerk:** `clerkSetup()` pide uno al arrancar y `setupClerkTestingToken()` lo
  inyecta en cada test. Así las pruebas pasan la detección de bots **sin desactivar** la protección
  de registro de Clerk.
- Los previews de Vercel están protegidos con Vercel Authentication: se entra con el *Protection
  Bypass for Automation* (`VERCEL_AUTOMATION_BYPASS_SECRET`).

## Cosas que aprendimos

- Un navegador nuevo pasa por la verificación de "dispositivo nuevo" (client trust) de Clerk; el
  helper mete el código `424242`, reintentando hasta que Clerk haya enviado el código.
- Con TOTP activo, Clerk pide el segundo factor en lugar de la verificación de dispositivo.
- `next dev` deja a veces la página en blanco tras iniciar sesión; contra la build de producción no
  ocurre.
