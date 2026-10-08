# Pasos manuales de H2 para producción

Lo que **no** hacen las migraciones ni el código: configuración de consolas (Neon, Clerk, Vercel, GitHub) que debe estar lista
**antes de mergear H2 a `master`**. Un merge sin estos pasos no rompe la base (las migraciones son aditivas), pero deja la
aplicación desplegada con dos fallos visibles: el webhook de Clerk responde 500 y `/api/db-sesion` no puede consultar la base.

Contexto: al hacer merge, [migrar-produccion.yml](../.github/workflows/migrar-produccion.yml) aplica las migraciones al branch
`production` de Neon y, **en paralelo**, la integración Git de Vercel despliega el código. Por eso la configuración de abajo
tiene que existir antes, no después.

Cada paso lleva su comprobación. Ningún secreto se escribe en el repositorio ni en una migración: los valores van a las
consolas y, si hace falta en local, a `.env.local` (ignorado por git).

## Orden

| # | Paso | Dónde | Antes del merge |
|---|---|---|---|
| 1 | Saber qué instancia de Clerk usa cada entorno de Vercel | Vercel | Sí |
| 2 | Registrar la JWKS de esa instancia **solo** en el branch de Neon que corresponde | API de Neon | Sí |
| 3 | Dar `LOGIN` y contraseña a `sync_identidad` y `cron_notificaciones` | Postgres (por entorno) | Sí, tras migrar |
| 4 | Cargar las variables en Vercel (Production **y** Preview) | Vercel | Sí |
| 5 | Suscribir el endpoint del webhook a `user.created` y `user.updated` y exigir nombre y apellido | Clerk | Sí |
| 6 | Secretos de GitHub para los pasos nuevos de CI | GitHub | Sí |

El paso 3 necesita que las migraciones ya se hayan aplicado (los roles nacen en la primera migración). Para producción eso
significa dos fases: el merge aplica las migraciones y **inmediatamente después** se completa el paso 3 y se redespliega. Para
no dejar una ventana con el webhook roto, hay una alternativa en «Ventana entre merge y paso 3».

## 1. Instancia de Clerk de cada entorno

La JWKS que Neon debe confiar es la de la instancia de Clerk **que firma las sesiones de ese despliegue**. En H1 se vio que
Production de Vercel y `.env.local` pueden apuntar a instancias distintas.

- Leer `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` de cada entorno de Vercel (Production y Preview). La parte posterior a
  `pk_test_` / `pk_live_` es el Frontend API en base64; se decodifica así:

  ```bash
  node -e "console.log(Buffer.from(process.argv[1].split('_').slice(2).join('_'), 'base64').toString())" pk_test_XXXX
  ```

  El resultado (`algo.clerk.accounts.dev$`) es el dominio de la instancia. La JWKS vive en
  `https://<ese dominio>/.well-known/jwks.json`.
- **Comprobación:** `curl https://<dominio>/.well-known/jwks.json` devuelve un JSON con `keys`. Si responde 404 o
  `resource_not_found`, esa instancia ya no existe y hay que corregir la variable de Vercel antes de seguir.

## 2. JWKS en Neon, por branch

Neon valida el JWT de Clerk contra una JWKS registrada **por branch** y esa configuración **no se hereda** a branches nuevos
([spike-rls-h2.md](spike-rls-h2.md), hallazgo 4). Se registra por la API de Neon, no desde la consola:

```
POST https://console.neon.tech/api/v2/projects/wild-pine-78612869/jwks
Authorization: Bearer <NEON_API_KEY>
{
  "jwks_url": "https://<dominio de Clerk>/.well-known/jwks.json",
  "provider_name": "Clerk",
  "branch_id": "<id del branch>",
  "role_names": ["authenticator", "authenticated", "anonymous"]
}
```

Los campos exactos pueden variar con la versión de la API; si la respuesta es 400, contrastar con la documentación vigente de
Neon (`POST /projects/{project_id}/jwks`). El `branch_id` se obtiene con `GET /projects/{project_id}/branches`.

| Branch | JWKS de | Para qué |
|---|---|---|
| `production` | la instancia de Clerk de Production de Vercel | el tráfico real |
| `dev` (o el branch al que apunte Preview) | la instancia de Clerk que firma las sesiones de Preview | la prueba E2E `e2e/db.spec.ts` contra el preview |
| `spike/rls-h2` | `shining-grouse-9314` (desarrollo) | ya registrada; descartable |

No registrar la JWKS de producción en un branch de desarrollo ni al revés: un token válido de una instancia contra el branch
equivocado debe fallar con `jwk not found`, y esa es parte de la defensa.

- **Comprobación:** con una sesión real de ese entorno, `GET /api/db-sesion` devuelve `estado: "ok"`, el `clerk_user_id` de la
  persona y su `rol`. Sin sesión no devuelve ninguna identidad (lo cubre `e2e/db.spec.ts`). Contra un branch sin JWKS el
  error es `jwk not found`.

## 3. `LOGIN` y contraseña de los roles de servicio

La migración `privilegios-base-y-roles` crea `cron_notificaciones` y `sync_identidad` como `NOLOGIN` y sin privilegios; las
migraciones posteriores les dan solo los `GRANT` y las políticas que necesitan. La contraseña nunca va en una migración.

Con el rol dueño (`neondb_owner`), conexión **directa**, en cada branch donde se vaya a usar el rol:

```sql
alter role sync_identidad        login password '<contraseña larga y aleatoria>';
alter role cron_notificaciones   login password '<contraseña larga y aleatoria>';
```

Generar cada contraseña con un gestor o `openssl rand -base64 32`. Una contraseña distinta por rol y por branch.

- `sync_identidad` solo lo usa el webhook de Clerk y solo toca `perfiles`. Hace falta desde H2.
- `cron_notificaciones` lo usarán los cron de notificaciones (H5). Puede quedar `NOLOGIN` hasta entonces: no activar un acceso
  que nada usa.
- **Comprobación:** conectar con la URL de `sync_identidad` y ejecutar `select count(*) from perfiles;` (debe funcionar) y
  `select count(*) from pacientes;` (debe fallar con `permission denied`). La suite
  `tests/integracion/sincronizar-perfil.test.ts` hace esa comprobación contra el branch que se le indique.

## 4. Variables de Vercel

| Variable | Valor | Production | Preview |
|---|---|---|---|
| `DATABASE_AUTHENTICATED_URL` | URL **directa** (sin `-pooler`) del rol `authenticator` del branch | `production` | el branch del paso 2 |
| `DATABASE_SYNC_URL` | URL directa de `sync_identidad` con la contraseña del paso 3 | `production` | el branch del paso 2 |

- Son secretos del servidor: **nunca** con prefijo `NEXT_PUBLIC_`. Marcarlas como sensibles.
- Una URL pooled no sirve para `DATABASE_AUTHENTICATED_URL`: el pooler rechaza el parámetro de arranque que usa la extensión
  y no se probó con `authToken`.
- Preview apunta a un branch con las migraciones aplicadas y la JWKS de su instancia de Clerk; si no, `e2e/db.spec.ts` falla en
  el PR por una causa de configuración, no de código.
- **Comprobación:** tras redesplegar, `GET /api/db-sesion` con sesión devuelve `estado: "ok"`. Sin la variable devuelve
  `estado: "error"` con HTTP 500 (falla cerrado: nunca consulta sin identidad); el motivo («Falta
  DATABASE_AUTHENTICATED_URL») queda en el log de la función de Vercel, no en la respuesta.

## 5. Webhook de Clerk

En el Dashboard de Clerk de la instancia que usa cada entorno (Webhooks):

- El endpoint `https://<dominio de Vercel>/api/webhooks/clerk` debe estar suscrito a **`user.created`** y **`user.updated`**
  (`user.updated` es lo que propaga un cambio de rol hecho en Clerk a `perfiles.rol`).
- En *User & Authentication > Personal information*, exigir **nombre y apellido** (la tabla `perfiles` los requiere).
- `CLERK_WEBHOOK_SIGNING_SECRET` de Vercel debe ser el *Signing Secret* de ese mismo endpoint.

Estado al 2026-10-08: hecho en la instancia de desarrollo `shining-grouse-9314` (aplicación `citas-clinicas`): el endpoint ya
tiene ambos eventos y nombre y apellido son obligatorios. Falta repetirlo si Production usa otra instancia (paso 1).

- **Comprobación:** crear una cuenta nueva con nombre y apellido y confirmar que aparece en `perfiles` con el rol por defecto
  `paciente`; cambiar su `publicMetadata.rol` en Clerk y confirmar que `perfiles.rol` cambia. En el Dashboard de Clerk, el
  endpoint muestra los envíos con respuesta 200. Una firma inválida responde 400 y un fallo de base de datos 500 (Clerk
  reintenta).

## 6. Secretos de GitHub para CI

Los pasos nuevos de [neon-branch-pr.yml](../.github/workflows/neon-branch-pr.yml) (pgTAP, concurrencia, integración) usan el
branch efímero `preview/pr-N` que el workflow crea por PR (no necesitan JWKS: la suite firma sus propios tokens) y no
requieren secretos nuevos: usan `NEON_API_KEY` y `DATABASE_URL_PRODUCCION`, que ya existen (esta última solo como guarda: los
ejecutores se niegan a correr contra `production`). `migrar-produccion.yml` usa ese mismo `DATABASE_URL_PRODUCCION`, URL
directa de `production` con un rol que pueda ejecutar DDL.

- **Comprobación:** en el primer PR de H2, los tres pasos aparecen en verde; una aserción forzada a fallar pone el job en rojo
  (tarea 2.4).

## Ventana entre merge y paso 3

Si por cualquier motivo el merge ocurre antes de completar los pasos 3 y 4:

1. Las migraciones se aplican a `production` y los roles quedan `NOLOGIN`.
2. El webhook de Clerk responde 500 a cada `user.created`/`user.updated` (Clerk reintenta durante varios días, así que no se
   pierde el evento si se corrige a tiempo).
3. `/api/db-sesion` responde 500 por falta de `DATABASE_AUTHENTICATED_URL`; ninguna otra ruta depende todavía de la base
   con identidad (los módulos llegan en H3 en adelante).

Corrección: completar los pasos 3 y 4 y **redesplegar** (las variables de Vercel solo se leen al construir/arrancar). No hay
que tocar las migraciones.

## Lo que sigue siendo una acción aparte

- **Sembrar datos de demostración en producción** ([datos-demo.md](datos-demo.md)): no forma parte del merge; exige
  `--confirmar` y `--incluir-produccion`.
- **Datos reales de pacientes:** siguen bloqueados por P-1 (marco legal peruano, [TECH-DESIGN.md](TECH-DESIGN.md)).
- **ADR-0020:** su nota de revisión pendiente (`app_user` y `sync_identidad`) espera decisión humana; no condiciona el merge.
