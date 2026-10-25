# Pasos manuales de H4 (portal del paciente)

Lo que **no** hacen las migraciones ni el código: configuración de consolas (Clerk, Vercel, Upstash) que debe estar lista antes
de que el portal funcione de extremo a extremo. Los valores van a las consolas y, si hace falta en local, a `.env.local`
(ignorado por git); ningún secreto se escribe en el repositorio.

Hoy desarrollo y producción comparten la instancia de Clerk `shining-grouse-9314` (ver [pasos-manuales-h2.md](pasos-manuales-h2.md),
paso 5), así que los pasos de Clerk se hacen **una vez** y valen para los dos. Si algún día se separan las instancias, hay que
repetirlos en cada una.

## Orden

| # | Paso | Dónde | Bloquea |
|---|---|---|---|
| 1 | Añadir el claim `email` a la plantilla de la sesión | Clerk | El registro y la vinculación del paciente; `e2e/db.spec.ts` |
| 2 | Exigir correo verificado y nombres en el alta | Clerk | La vinculación (el correo debe estar verificado) |
| 3 | Redirigir el alta a `/completar-registro` | Vercel (variable) | La pantalla de registro de datos |
| 4 | Crear la segunda cuenta de paciente de pruebas | Clerk + GitHub | Las E2E de aislamiento y de doble reserva |
| 5 | Activar BotID e integrar Upstash | Vercel | Los controles de borde del portal (grupo 4 del change) |
| 6 | Revisar la protección contra bots y el bloqueo de intentos del alta | Clerk | Nada; es defensa en profundidad |

## Estado de ejecución

| Paso | Estado | Comprobado con |
|---|---|---|
| 1. Claim `email` | ✅ Hecho (2026-10-23) | `e2e/db.spec.ts` con build de producción local: `/api/db-sesion` devuelve `correo` de ambos pacientes |
| 2. Correo verificado y nombres | ✅ Hecho (2026-10-23) | Configuración pública de la instancia: correo requerido con código, nombre y apellido requeridos |
| 3. Redirección del alta | ✅ Variable en Production y Preview (comprobada en Vercel, 2026-10-23). Falta ver que un alta nueva aterriza en `/completar-registro`: producción aún corre `master` sin H4 y la variable solo rige tras un nuevo despliegue | Un alta nueva aterriza en `/completar-registro` |
| 4. Segunda cuenta de paciente | ⏳ Cuenta creada y probada en local; faltan los secretos de GitHub | `e2e/db.spec.ts` inicia sesión con ambas cuentas (la segunda no tiene ficha: la app la lleva a `/completar-registro`) |
| 5. BotID y Upstash | Código listo (2026-10-24). ⏳ Falta activarlo en Vercel y conectar Upstash (no bloquea el registro) | Variables presentes en Production y Preview; en el preview, seis `POST` a `/iniciar-sesion` dan 429 al sexto |
| 6. Protección del alta | ⏳ Pendiente | Captura de la configuración de Clerk |

## 1. Claim `email` en la sesión (Q2 del change)

`public.correo_actual()` lee el correo del **token que Neon valida** (`auth.session() ->> 'email'`), nunca de un parámetro, y con
él `registrar_paciente_portal` decide si una cuenta puede vincular una ficha existente ([ADR-0037](../03-arquitectura/adrs/0037-verificacion-al-vincular-una-ficha-de-paciente.md)).
Sin este claim la función rechaza con `PA004`.

- En el panel de Clerk: **Configure → Sessions → Customize session token**. Añadir `email` al JSON que ya existe, **sin quitar**
  `publicMetadata` (de ahí sale el rol):

  ```json
  {
    "publicMetadata": "{{user.public_metadata}}",
    "email": "{{user.primary_email_address}}"
  }
  ```

  (Si el JSON actual tiene otra forma para `publicMetadata`, conservarla tal cual y solo agregar la línea de `email`.)
- **Comprobación:** iniciar sesión como paciente y abrir `/api/db-sesion` en el navegador: el JSON trae `"correo"` con el correo de
  la cuenta **en minúsculas**. `e2e/db.spec.ts` lo comprueba de forma automática.
- Capturar la pantalla de la plantilla para dejarla en el PR.

## 2. Correo verificado y nombres en el alta

- **Configure → User & authentication → Email, phone, username**: correo **requerido** y **verificación por código** activada;
  desactivar cualquier otra forma de identificación que no sea correo y contraseña.
- **Personal information**: nombre y apellido **requeridos** (el webhook de sincronización los copia a `perfiles`, que los exige).
- **Por qué:** el correo verificado es la mitad de la prueba de que la persona es dueña del buzón que la clínica registró.
- **Comprobación:** un alta nueva no termina sin verificar el correo ni sin nombres.

## 3. Redirección del alta a `/completar-registro`

- En Vercel, variable `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` = `/completar-registro` en **Production y Preview** (y en
  `.env.local` para desarrollo). Es una URL relativa, no un secreto.
- **Comprobación:** crear una cuenta nueva y confirmar que, tras verificar el correo, se llega a `/completar-registro` y no a la
  portada.

## 4. Segunda cuenta de paciente de pruebas

Las E2E de aislamiento y de doble reserva necesitan **dos** pacientes con sesión.

- En Clerk, crear un usuario con un correo del patrón `…+clerk_test@…` (los correos con `+clerk_test` aceptan el código fijo
  `424242` en instancias de desarrollo) y una contraseña larga.
- Guardarlos como `E2E_PACIENTE2_EMAIL` y `E2E_PACIENTE2_PASSWORD` en `.env.local` y como secretos del repositorio de GitHub
  (mismo lugar que `E2E_PACIENTE_EMAIL`). Las E2E del portal necesitan además el secreto `E2E_DATABASE_URL`: la URL **directa** del dueño de la rama `dev` de
  Neon (la que sirve a los previews; nunca la de producción). `node scripts/cargar-secretos-e2e.ts` sube los tres (`E2E_DATABASE_URL` la toma de
  `DATABASE_URL_UNPOOLED` de `.env.local` y se niega si es del pooler o de producción); con `--dry-run` solo muestra qué subiría.
- **Comprobación:** `npx playwright test db` puede iniciar sesión con ambas cuentas.

## 5. Vercel BotID y Upstash

Detalle técnico en el grupo 4 del change `portal-del-paciente` y en [ADR-0026](../03-arquitectura/adrs/0026-controles-de-borde-antibots-y-rate-limiting.md).
El código ya está (`lib/seguridad/`, `middleware.ts`, `instrumentation-client.ts`, `next.config.ts`); lo que sigue es configuración de
consolas que solo puede hacer quien administra el proyecto de Vercel.

- **BotID (pregunta Q6, respondida):** el nivel **básico es gratuito en todos los planes**, incluido Hobby (documentación de Vercel, «BotID →
  Pricing»); el análisis profundo cuesta por llamada y **no se usa**. El código fija `checkLevel: "basic"` en el cliente
  (`instrumentation-client.ts`) y en el servidor (`lib/seguridad/antibots.ts`); deben ser idénticos o la verificación falla. Activar BotID
  en el proyecto (Settings → Security → BotID).
- **Tráfico de las E2E:** Playwright es justo lo que BotID detecta como bot. Para las E2E contra el preview se pone
  `BOTID_EXCEPCION_E2E=1` **solo en el entorno Preview** de Vercel (y en `.env.local` para correr contra una build local). Con ella no se
  verifica nada, pero el código la **ignora cuando `VERCEL_ENV=production`** (probado en `tests/portal/antibots.test.ts`). Nunca en
  Production. Alternativa que ofrece Vercel: una regla de bypass en el WAF.
- **Upstash:** Vercel → Storage / Marketplace → Upstash (Redis). En «Connect a Project»: el proyecto, **Production y Preview**, *Custom Prefix* =
  `UPSTASH_REDIS` y *Sensitive* activado. La integración crea variables con ese prefijo (`UPSTASH_REDIS_REST_API_URL` y `UPSTASH_REDIS_REST_API_TOKEN`;
  con el prefijo por defecto serían `KV_REST_API_URL` y `KV_REST_API_TOKEN`). El código acepta esos nombres y también los documentados
  `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (`credencialesDeUpstash` en `lib/seguridad/limites.ts`); nunca el token de solo lectura. Sin ellas el portal **sigue funcionando sin límite de peticiones** y lo dice una
  vez en el registro del servidor (fallo abierto).
- **Comprobación:** las variables existen en Production y Preview (`BOTID_EXCEPCION_E2E` solo en Preview), y en el preview seis `POST` a
  `/iniciar-sesion` dan 429 al sexto con `Retry-After`, mientras seis `GET` no bloquean a nadie.

### Tabla de límites

Una sola tabla en `lib/seguridad/limites.ts` (ventana deslizante en Upstash). Solo el primero es el valor del ADR-0026; los demás son
valores **propuestos** del diseño (D9), holgados para el uso normal de un paciente que se equivoca o reintenta.

| Regla | Máximo | Ventana | Clave | Dónde se aplica |
|---|---|---|---|---|
| Rutas de autenticación, lo que no es lectura | 5 | 15 min | IP | `middleware.ts`: `/iniciar-sesion` y `/registro` |
| Rutas de autenticación, lecturas | 60 | 1 min | IP | `middleware.ts` (una sala de espera con la misma IP no se bloquea) |
| Registro de datos | 5 | 15 min | usuario **y** IP | Server Action `completarRegistro` (+ BotID) |
| Reserva | 10 | 10 min | usuario **y** IP | Server Action de la reserva (+ BotID) |
| Cancelación | 10 | 10 min | usuario **y** IP | Server Action `cancelarMiCita` (sin BotID) |
| Búsqueda de horarios | 60 | 1 min | usuario **y** IP | Página `/paciente/citas/nueva` |

- Superado el límite, el middleware responde `429` con «Demasiados intentos. Espere N minutos e intente de nuevo.» y `Retry-After`; las
  acciones responden «Demasiados intentos. Espere unos minutos e intente de nuevo.» sin tocar la base de datos.
- **Orden en las acciones:** sesión → límite → anti-bots → validación → base de datos.
- **La IP** sale de `x-vercel-forwarded-for`, `x-real-ip` o, en último lugar, la primera de `x-forwarded-for`, y **solo cuando la aplicación
  corre en Vercel** (`VERCEL=1`), donde esas cabeceras las fija la plataforma. Fuera de Vercel se ignoran todas (las manda el cliente) y la
  clave no cambia por una cabecera falsificada.
- **Fallo abierto:** si Upstash no responde (error o más de 1,5 s), la petición pasa y se registra la clase del error, sin la IP ni el
  usuario. Las barreras reales (RLS, `EXCLUDE`, disparadores) no dependen de estos controles.
- **Salvedad de las rutas de Clerk (D9, Q5):** los componentes de Clerk envían las credenciales a la API de Clerk, no a este origen; el
  middleware solo ve cargas de página y retornos. Por eso el 5 / 15 min cuenta lo que **no** es lectura hacia esas rutas y, junto con
  BotID y el bloqueo de cuenta de Clerk (paso 6), forma la defensa de credenciales. Contar cargas de página con 5 / 15 min bloquearía a una
  sala de espera que comparte IP. Esta lectura del ADR queda **para revisión humana**.

## 6. Protección contra bots y bloqueo por intentos del alta

- **Configure → Attack protection**: dejar activos el bloqueo de cuenta por intentos fallidos y la protección contra bots del alta
  de Clerk. Es defensa en profundidad; el límite de 5 intentos / 15 min por IP lo pone la aplicación (Upstash).
- **Comprobación:** captura de la configuración en el PR.
