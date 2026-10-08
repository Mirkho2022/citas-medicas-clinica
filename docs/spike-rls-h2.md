# Spike de validación de ADR-0023 (H2, tarea 1)

Resultado de ejecutar de extremo a extremo el mecanismo de [ADR-0023](adrs/0023-contexto-de-usuario-para-rls.md)
(Neon RLS Authorize: `pg_session_jwt` + JWT de Clerk) antes de construir el esquema de H2. Se
ejecutó el 2026-10-08.

**Veredicto: continuar.** El mecanismo funciona como decide ADR-0023; no hace falta el plan B
(`SET LOCAL` casero) y ADR-0023 no se reabre. El spike sí encontró diferencias entre lo que el
ADR/TECH-DESIGN suponen y lo que Neon hace realmente; están en «Hallazgos» y ya se reflejan en
`openspec/changes/esquema-rls-pgtap/design.md`.

## Entorno

- Proyecto Neon `citas-clinica` (`wild-pine-78612869`, Postgres 18, plan Free), branch descartable
  `spike/rls-h2` creado a partir de `dev`. `production` y `dev` no se modificaron.
- Clerk, instancia de desarrollo `shining-grouse-9314`; cuentas de prueba `h1-<rol>+clerk_test@example.com`
  (paciente y administrativo con TOTP) iniciando sesión en la build de producción de la aplicación.
- `@neondatabase/serverless` 1.x (`neon(url, { authToken })`), extensión `pg_session_jwt` 0.5.0,
  `pgtap` 1.3.3.
- Nada del spike queda en el repositorio: los archivos de prueba eran descartables y se borraron, y la tabla
  y las funciones del spike se eliminaron. Los tokens nunca se guardaron en el repo.

## Criterios de D1

| # | Criterio | Resultado |
|---|---|---|
| 1 | Extensión y rol | ✅ `pg_session_jwt` 0.5.0 **ya estaba instalada** (heredada de `production`) y los roles `authenticator` (login), `authenticated` y `anonymous` (sin login) **ya existían** desde 2026-09-29. `pgtap` está disponible. |
| 2 | Token válido / sin token / alterado / vencido / otro branch | ✅ Con token válido cada usuario ve solo lo suyo; sin token no ve ninguna fila; token alterado → `signature error`; token válido contra `production` → `jwk not found` (la JWKS está acotada al branch); token vencido → `JWT token has expired` (tolerancia observada: aceptado a +8 s de vencido, rechazado a +69 s). |
| 3 | Ruta del claim del rol | ✅ El token de sesión de Clerk trae `publicMetadata: { rol }` **anidado**, no `rol` de primer nivel. Las políticas deben leer `auth.session() -> 'publicMetadata' ->> 'rol'`. No hizo falta cambiar el JWT template. |
| 4 | Sin contaminación entre peticiones | ✅ 8 consultas alternadas de dos usuarios y 10 en paralelo: cada una devolvió su propia identidad; una consulta sin token posterior devolvió identidad nula. |
| 5 | Autenticación de pruebas en pgTAP | ✅ Ver «Receta de pruebas». |
| 6 | `auth.*` sin sesión | ✅ `auth.user_id()` y `auth.session()` devuelven nulo, no error. |
| 7 | `pgtap` instalable | ✅ `create extension pgtap` funciona; una prueba con cambio de identidad corrió en verde. |

## Hallazgos que cambian el diseño

1. **Privilegios por defecto abiertos.** Neon dejó `ALTER DEFAULT PRIVILEGES` (dueño `neondb_owner`,
   esquema `public`) que dan a `authenticated` `INSERT/SELECT/UPDATE/DELETE` sobre **toda tabla
   nueva**, `USAGE` sobre secuencias y `EXECUTE` sobre funciones. Una tabla creada sin RLS quedaría
   abierta. La primera migración debe revocarlos y las tablas reciben `GRANT` explícito.
2. **`authenticated` es `NOLOGIN` y no tiene `USAGE` sobre el esquema `auth`**, que es de
   `cloud_admin` (`neondb_owner` no puede concederlo). Consecuencias:
   - Las consultas HTTP con `authToken` entran como `authenticator` (login, sin privilegios sobre
     tablas, sin herencia) y deben hacer **`set local role authenticated` dentro de una
     transacción**. Si el helper lo olvidara, falla cerrado (`permission denied`).
   - **Toda función que lea `auth.*` debe ser `SECURITY DEFINER` con `search_path` vacío**; una función
     `invoker` falla con `permission denied for schema auth`. Las políticas pueden llamar a
     `auth.*` directamente porque se resuelven al crearlas.
3. **`neondb_owner` tiene `BYPASSRLS`** y es miembro de `authenticated`/`anonymous`: sirve para
   preparar datos de prueba y para ejecutar `set role authenticated`, pero nunca debe usarse para
   el tráfico de usuario.
4. **La JWKS se registra por API, no con la Data API.** `POST /projects/{id}/jwks` acepta
   `branch_id`, de modo que cada entorno puede tener la JWKS de su propia instancia de Clerk. El
   registro no es heredado por branches nuevos (los branches efímeros de CI no la tendrán).
   Consecuencia: la JWKS de la instancia de Clerk de producción se registra solo en `production`.
5. **`pg_session_jwt.jwk` no acepta la clave de Clerk.** La extensión espera una JWK **Ed25519**
   (`kty: OKP`, `crv: Ed25519`) aunque su mensaje de error diga «ES256», y exige `jti`
   (estrictamente creciente por sesión) y `nbf`. En la prueba aceptó un token vencido hace 5 s, así
   que la expiración la hace cumplir el proxy, no la extensión. En producción el proxy de
   Neon valida el JWT de Clerk contra la JWKS y la extensión recibe su propia sesión.
6. **El parámetro solo llega al arrancar la conexión** (`PGOPTIONS="-c pg_session_jwt.jwk=..."` o la
   opción `options` del driver): `SET` y `SET LOCAL` no sirven, y el **pooler lo rechaza**
   (`unsupported startup parameter`). Las pruebas necesitan conexión directa.
7. **Un `jwt_session_init` fallido deja la identidad anterior en la sesión.** El helper de pruebas
   debe tratar cualquier fallo como fatal y no reutilizar la sesión.

8. **Cargar la extensión dentro de una función con `SET` pierde la JWK.** Si la primera llamada a
   `auth.*` de la conexión ocurre dentro de una función con cláusula `SET` (como `rol_actual()`,
   que fija `search_path`), al salir de la función se pierde la JWK de arranque y el siguiente
   `auth.jwt_session_init` falla con «Missing runtime parameter». El runner de pruebas hace antes un
   `select auth.user_id()`. En producción no ocurre: el proxy inicia la sesión antes de cualquier
   consulta de usuario.

## Receta de pruebas pgTAP (resuelve el pendiente de ADR-0023)

1. Un script de Node genera en cada ejecución un par **Ed25519** efímero y firma, por identidad de
   prueba (`sub` + `publicMetadata.rol`), un bloque de JWT con `jti` 1..N, `nbf` y `exp`.
2. La conexión de pruebas es **directa** y lleva `options = -c pg_session_jwt.jwk=<JWK pública>`.
3. Los tokens se cargan en una tabla temporal; `tests.autenticar_como(identidad)` toma el siguiente
   `jti` de la sesión, hace `reset role`, llama a `auth.jwt_session_init(jwt)` y termina con
   `set local role authenticated`. Se verificó que cambiar de identidad dentro de una misma
   transacción funciona y que una identidad inexistente falla.
4. Los datos de prueba los prepara el dueño (`BYPASSRLS`) antes de autenticarse.

Esto prueba las políticas con un JWT real de la extensión; la validación de la JWKS de Clerk por
el proxy queda cubierta por la prueba E2E con una cuenta real (tarea 8.2).

## Riesgos residuales

- La **tolerancia de expiración** del proxy es de decenas de segundos; no cambia el modelo porque
  el token solo viaja entre el servidor de la aplicación y Neon, pero conviene no guardarlo.
- La URL **pooled** no se probó con `authToken`; se usará la directa para el tráfico autenticado.
- La instancia de Clerk de producción en Vercel y la de desarrollo (`.env.local`) fueron distintas
  en H1: antes de producción hay que registrar la JWKS correcta en el branch correcto.

## Revisión pendiente de ADR-0020

El spike mostró que `app_user` (ADR-0020) no existe en Neon: el tráfico de usuario entra como `authenticator` y cambia a
`authenticated`. H2 además creó un tercer rol de servicio, `sync_identidad` (webhook de Clerk), y confirmó que
`cron_notificaciones` sí pasa por RLS con políticas propias. El texto de la decisión de ADR-0020 **no se modificó**; la
aclaración propuesta está en la «Nota de revisión pendiente» al final de ese ADR.

**Estado de la revisión (2026-10-08): pendiente de decisión humana.** No condiciona el merge de H2 ni cambia la garantía de fondo
(el cron no puede leer historias clínicas por permisos de base de datos). Cuando se resuelva, anotar aquí el resultado.
