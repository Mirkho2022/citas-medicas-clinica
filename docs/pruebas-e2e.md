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
  llevarlas a GitHub: `node scripts/cargar-secretos-e2e.ts`.
- **Testing tokens de Clerk:** `clerkSetup()` pide uno al arrancar y `setupClerkTestingToken()` lo
  inyecta en cada test. Así las pruebas pasan la detección de bots **sin desactivar** la protección
  de registro de Clerk.
- Los previews de Vercel están protegidos con Vercel Authentication: se entra con el *Protection
  Bypass for Automation* (`VERCEL_AUTOMATION_BYPASS_SECRET`).

## Interfaz: tema, componentes y galería (H2b)

La interfaz sigue [DESIGN.md](DESIGN.md). Antes de abrir un PR de interfaz: `npm run test:tema` (generador y
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
  sintéticos de [lib/ui/ejemplos.ts](../lib/ui/ejemplos.ts) (pacientes con documento `99…`, un «ahora» fijo para que las
  citas no cambien con el tiempo). Exige sesión y **no existe en producción**: `galeriaVisible()` de
  [lib/ui/galeria.ts](../lib/ui/galeria.ts) devuelve falso cuando `VERCEL_ENV` es `production` y la página responde
  `notFound()`; en local con `next start` y en los previews se ve. Es el objetivo de las pruebas de accesibilidad
  (`e2e/accesibilidad.spec.ts`) y de las de componentes (`e2e/componentes.spec.ts`).
- **Para revisar un componente nuevo:** añada su sección a la galería con todos sus estados (normal, error, vacío,
  deshabilitado, solo lectura), abra `/guia-de-estilo` en el preview del PR a 390 px y a 1280 px, recórrala con la tecla
  de tabulación y deje su prueba en `e2e/componentes.spec.ts`. Los colores, tamaños y textos salen de
  [DESIGN.md](DESIGN.md); si algo no cabe allí, el cambio se hace primero en ese documento.
- **Dependencias de shadcn/ui:** la CLI actual usa el paquete `cn` (mantenedor shadcn, repo `shadcn-ui/cn`) en lugar de
  `clsx` + `tailwind-merge`; está en `package.json`.

## Cosas que aprendimos

- Un navegador nuevo pasa por la verificación de "dispositivo nuevo" (client trust) de Clerk; el
  helper mete el código `424242`, reintentando hasta que Clerk haya enviado el código.
- Con TOTP activo, Clerk pide el segundo factor en lugar de la verificación de dispositivo.
- `next dev` deja a veces la página en blanco tras iniciar sesión; contra la build de producción no
  ocurre.
