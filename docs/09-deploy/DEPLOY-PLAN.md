# Deploy Plan — Sistema de Gestión de Citas e Historias Clínicas Electrónicas

Fecha: 2026-10-25
Estado: EJECUTADO Y VERIFICADO el 2026-10-25 (PR #21 en producción, con una corrección de configuración descubierta al verificar; ver el registro al final). Quedan pendientes dos acciones de limpieza de secretos, listadas abajo.

## Resumen del proyecto

Qué descubrió el análisis (evidencia: `package.json`, `.github/workflows/`, `docs/03-arquitectura/TECH-DESIGN.md`, la API de Vercel y consultas de solo lectura a Neon):

- **Aplicación:** Next.js 15.5.28 (App Router, TypeScript, Turbopack), Node 24, npm con `package-lock.json`. Un solo repositorio, un solo servicio. No hay paquetes publicados para terceros.
- **Infraestructura existente:** Vercel (equipo `ietsi-s-projects`, proyecto `citas-medicas-clinica`, integración Git sobre la rama `master`), Neon Postgres (proyecto `wild-pine-78612869`, plan gratuito, región AWS us-east-2), Clerk (autenticación), Upstash Redis (límite de peticiones, creado por la integración de Vercel), BotID de Vercel. Resend (correos, H5) y Vercel Blob (adjuntos, H6) todavía no existen.
- **CI/CD existente:** cuatro workflows de GitHub Actions: `ci.yml` (typecheck, lint, pruebas, build en cada PR), `neon-branch-pr.yml` (branch efímero de Neon por PR, migraciones, pgTAP, concurrencia e integración), `e2e.yml` (Playwright contra el preview de Vercel) y `migrar-produccion.yml` (migraciones al branch `production` en cada push a `master`).
- **Estado actual de producción:** último despliegue `READY` en `citas-medicas-clinica.vercel.app` desde el commit `6c22774` (PR #20); `GET /api/salud` responde `{"estado":"ok"}`. El branch `production` de Neon tiene 33 migraciones aplicadas (la última, `1792344600000_cierre-de-vencidas-al-usar-el-sistema`). La rama del PR #21 trae 3 migraciones más.
- **Lo que no existe:** no hay `vercel.json` (todavía no hay Vercel Cron, llega con H5), ni entorno de staging propio (el preview del PR cumple ese papel), ni dominio propio (se usan los `*.vercel.app`).
- **Qué se deploya hoy:** el PR #21 (portal del paciente, H4) y los arreglos del informe de seguridad. Es el único cambio pendiente de llegar a producción.

## Sistema de deployment propuesto

### Build
`npm ci` y `next build --turbopack` sobre Node 24, con `package-lock.json` versionado. Vercel construye en su propia infraestructura al recibir el push; el CI de GitHub construye aparte como comprobación (`ci.yml`). Es determinista en lo que importa: el lockfile fija las dependencias y la misma versión de Node está declarada en los dos lados (`24.x` en Vercel, `"24"` en los workflows). El build no accede a la base de datos.

### Artifact
Un despliegue inmutable de Vercel, identificado por su id (`dpl_…`) y trazable al commit mediante los metadatos que Vercel guarda (`githubCommitSha`, `githubCommitMessage`). No hay imagen de contenedor ni paquete. Los últimos despliegues de producción figuran como candidatos a rollback.

### Config & Secrets
- **Config (no secreta):** `NEXT_PUBLIC_CLERK_*` (claves públicas y rutas), `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`, `NEON_PROJECT_ID` (variable de GitHub).
- **Secretos en Vercel (solo se verificó el nombre, nunca el valor):**
  - Production y Preview: `DATABASE_AUTHENTICATED_URL` (rol `authenticator`), `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `UPSTASH_REDIS_*` (integración).
  - Production: `DATABASE_SYNC_URL` (rol `sync_identidad`, solo para el webhook de Clerk).
  - Solo Preview: `BOTID_EXCEPCION_E2E=1` (añadida hoy; el código la ignora si `VERCEL_ENV=production`).
  - `DATABASE_URL` (rol dueño): existe en Preview; tras el arreglo SEC-03 el código ya no la usa y **debe retirarse** de Vercel (autorización pendiente).
- **Secretos en GitHub Actions:** `DATABASE_URL_PRODUCCION` (rol con DDL, solo para `migrar-produccion.yml` y como guarda de las pruebas), `NEON_API_KEY`, `CLERK_SECRET_KEY`, `E2E_*` (cuentas de prueba y `E2E_DATABASE_URL`), `VERCEL_AUTOMATION_BYPASS_SECRET`.
- Ningún secreto está en el repositorio (`git grep` sin coincidencias, `.env*.local` ignorados). Los logs no deben imprimirlos; este plan solo nombra variables.

### Infraestructura
Vercel + Neon + Clerk + Upstash, tal como ya está decidido en los ADR 0020–0028. Es coherente con el proyecto: tráfico bajo, equipo de una persona, plataforma gestionada sin servidores que administrar, y Neon da un branch por PR. No se propone cambiar de proveedor.
**No verificado:** la región de las funciones de Vercel (solo se conoce la de Neon, us-east-2) y si Production usa la instancia de desarrollo de Clerk; las pruebas E2E contra el preview usan una instancia de desarrollo (`shining-grouse-9314`). Pasar a una instancia de producción de Clerk es una puerta de salida ya registrada (P-10, requiere plan Pro para el MFA obligatorio).

### Entornos
| Entorno | App | Base de datos | Notas |
|---|---|---|---|
| Local | `next dev` / build local | branch `dev` de Neon | las E2E locales solo son fiables con build de producción |
| Preview (por PR) | despliegue de Preview de Vercel | `dev` para la app según el comentario de `e2e.yml`; además un branch efímero `preview/pr-N` para la suite SQL del CI | `BOTID_EXCEPCION_E2E=1`, protegido con Vercel Authentication |
| Producción | despliegue de Production de Vercel | branch `production` de Neon | datos sintéticos de demostración; los datos clínicos reales siguen bloqueados por P-1 |

Entre entornos cambian solo la configuración y los secretos, no el código.

### Estrategia de release
**Release directo** (el despliegue de Vercel reemplaza al anterior de forma atómica y se puede revertir al instante). Justificación: demostración con datos sintéticos, un solo desarrollador y sin tráfico concurrente que justifique canary o rolling release; esos mecanismos añaden complejidad que hoy no aporta. Si el sistema pasa a datos reales, conviene reevaluar un release gradual.

### Data & Migrations
- Las migraciones (`node-pg-migrate`) solo avanzan hacia adelante; nunca `down` ni restaurar el branch `production` (regla de `CLAUDE.md`).
- **Orden real:** `migrar-produccion.yml` y el despliegue de Vercel se disparan **en paralelo** con el mismo push a `master`, no uno tras otro. Por eso toda migración debe ser compatible hacia atrás con el código anterior (agregar antes de usar). Las 3 migraciones de este release lo cumplen: añaden funciones (`correo_actual`, `registrar_paciente_portal`) y políticas que el código anterior no usa, y la última solo restringe una política nueva. Existe una ventana de segundos en la que el código nuevo puede correr antes de que termine la migración; el portal mostraría un error de registro o cancelación y se recupera solo al terminar.
- **Un rollback de código no revierte datos ni esquema.** Tras revertir el despliegue, las 3 migraciones seguirían aplicadas; son inocuas para el código anterior.

### Deploy gates
Hallazgo importante: **hoy no hay una compuerta mecánica.** El repositorio es privado en el plan gratuito de GitHub, y la API responde 403 al consultar la protección de ramas («Upgrade to GitHub Pro»): no se pueden exigir checks obligatorios en `master`. Vercel despliega `master` automáticamente al recibir el push, y esos checks de GitHub son solo informativos; un check en rojo y un despliegue en vivo pueden coexistir.

- **Compuerta actual (disciplina manual):** solo se fusiona un PR con todos los checks en verde (`typecheck-lint-build`, `migrar`, `e2e`).
- **Compuerta real propuesta (requiere decisión):** desactivar el despliegue automático de `master` en Vercel (`git.deploymentEnabled` en `vercel.json`) y crear un *deploy hook* de Vercel que un workflow dispare solo después de que pasen los checks y la migración. Cuesta un secreto nuevo en GitHub y tocar la configuración de producción. Para la entrega de hoy se deja documentada y **no se implementa**.

### Verify & Observe
Tras el despliegue (humo, con datos sintéticos):
1. El despliegue figura `READY` en Vercel y el workflow `Migrar producción` termina en verde (33 → 36 migraciones aplicadas).
2. `GET /api/salud` responde 200 con `{"estado":"ok"}` y las cabeceras de seguridad (`X-Frame-Options`, `Content-Security-Policy: frame-ancestors 'none'`, etc.).
3. `GET /api/db-sesion` con una cuenta de prueba devuelve su correo (confirma el claim `email` del JWT, paso 1.3 de H4).
4. Un paciente de prueba completa el registro, reserva una cita y la cancela desde la URL pública.
5. `get_runtime_errors` de Vercel sin errores nuevos.
Observabilidad disponible hoy: logs de runtime de Vercel (el plan Hobby retiene solo 1 hora, así que hay que revisarlos justo después del despliegue), el panel de uso de Neon y el de Upstash. No hay alertas ni monitoreo externo; es un hueco aceptado para una demostración.

### Recovery
- **Código:** revertir producción al despliegue anterior desde Vercel («Instant Rollback») o con `request_rollback`. El candidato actual es `dpl_D79RbRKWvEcvLY5hjCVJKg5USHF3` (commit `6c22774`). Es inmediato y no toca la base de datos.
- **Esquema/datos:** no hay `down`. Un defecto de migración se corrige con otra migración hacia adelante. **Nunca** restaurar el branch `production` de Neon (destruye datos clínicos); la ventana de historial del plan gratuito está en 1 hora de todos modos.
- **Credenciales comprometidas:** rotar el secreto afectado en Vercel o en GitHub y redesplegar; el secreto de bypass de Vercel y las contraseñas de las cuentas de prueba se rotan si la transcripción de trabajo sale del equipo (ver SEC-09 del informe de seguridad).
- **Almacenamiento de Neon al límite (89,8 % al momento de escribir):** si llega al 100 % pueden fallar las escrituras. Mitigación en curso: ventana de historial reducida a 1 hora y limpieza de branches de preview al cerrar cada PR.

## Autorizaciones pendientes

Cada acción se autorizó por separado, en el momento de hacerla. Estado:

1. **Fusionar el PR #21 a `master`:** autorizada y ejecutada (ver el registro).
2. **Apuntar `DATABASE_AUTHENTICATED_URL` de Production al branch `production` de Neon y redesplegar:** autorizada y ejecutada (ver «Hallazgo de configuración»).
3. **Retirar `DATABASE_URL` (rol dueño) de los entornos Production y Preview de Vercel (cierra SEC-03): PENDIENTE.** El código nuevo ya no la usa; falta la autorización explícita para borrarla.
4. **Rotar las contraseñas de los roles `neondb_owner` y `authenticator` de Neon: PENDIENTE y recomendada.** Ambas URLs se mostraron en la conversación de trabajo al sembrar y corregir producción. Orden seguro: rotar `authenticator`, actualizar `DATABASE_AUTHENTICATED_URL` en Production y Preview y redesplegar; rotar `neondb_owner` y actualizar el secreto `DATABASE_URL_PRODUCCION` de GitHub.
5. *(Opcional)* Compuerta con *deploy hook* descrita en «Deploy gates»: no implementada.

## Registro de ejecución y verificación

Todavía no se ha ejecutado nada contra producción. Lo que sí se hizo antes de esta planificación y queda registrado como evidencia:

- 2026-10-25: el entorno Preview de Vercel recibió `BOTID_EXCEPCION_E2E=1` (autorizado por el usuario); se confirmó que **no** existe en Production. Con ella, las pruebas E2E de registro y reserva contra el preview dejaron de ser rechazadas por BotID.
- 2026-10-25: arreglos del informe de seguridad aplicados a la rama (Next.js 15.5.28, `/api/salud` con el rol `authenticator` y límite por IP, cabeceras de seguridad); verificados en local con `typecheck`, `lint`, `test:portal` (132 pruebas) y 28 pruebas E2E.
- 2026-10-25: el último despliegue de producción conocido es el del PR #20 (`READY`); el estado de los checks del PR #21 con estos cambios estaba en curso al escribir este plan.

### Ejecución del 2026-10-25 (autorizada paso a paso)

| Hora (UTC) | Acción | Resultado |
|---|---|---|
| 22:47 | Fusión del PR #21 (commit `4e2e2cb`) con los cuatro checks en verde (e2e, migrar, typecheck-lint-build, Vercel) | Fusionado |
| ~22:48 | Workflow `Migrar producción` | Éxito: 36 migraciones aplicadas al branch `production` (última: `1792536300000_portal-cancelacion-solo-citas-futuras`) |
| ~22:50 | Despliegue de Production desde `4e2e2cb` | `READY`; `GET /api/salud` responde `{"estado":"ok"}` y la página de inicio de sesión trae las cabeceras de seguridad (`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) |
| 22:30–22:45 | Cuentas del profesor: 4 usuarios en Clerk (uno por rol) y siembra de datos sintéticos de demostración en `production` (12 pacientes, 5 médicos, 14 citas…) | El webhook de Clerk creó los perfiles con su rol; el script de siembra los enlazó a las personas de demostración |
| ~23:05 | Hallazgo y corrección de configuración (abajo) | Corregido y verificado |

### Hallazgo de configuración: Production leía la base `dev`

Al iniciar sesión en producción con la cuenta de paciente del profesor, la aplicación la mandaba a «Complete su registro» aunque su ficha existía en `production`. Una cuenta de pruebas con ficha solo en `dev` sí entraba al portal. Conclusión: `DATABASE_AUTHENTICATED_URL` del entorno Production apuntaba al branch `dev`, contra lo documentado en `pasos-manuales-h2.md`. Consecuencia: un paciente nuevo se habría quedado esperando «Estamos preparando su cuenta…», porque el webhook crea su perfil en `production` y la aplicación lo buscaba en `dev`. El plan original lo daba por correcto («Producción → branch `production`») y no lo había podido verificar porque Vercel no permite leer el valor.

Corrección (autorizada): se reemplazó solo la variable de Production por la URL directa del rol `authenticator` del branch `production` y se relanzó el despliegue. Verificación posterior en `https://citas-medicas-clinica.vercel.app`: la cuenta de paciente del profesor entra a «Portal del paciente», ve «Mis citas» con sus citas de demostración y la reserva muestra las cuatro especialidades.

### Verificación posterior (resumen)

- `GET /api/db-sesion` con la cuenta del profesor devuelve su correo y el rol `paciente`: el claim `email` de la plantilla de sesión de Clerk funciona en producción (tarea 11.4 de H4).
- Las cuentas de administrativo, médico y enfermera del profesor llegan a «Configure su autenticación de múltiple factor» tras la contraseña, como exige la regla de MFA del personal.
- No se probó la reserva ni la cancelación **automatizadas** en producción: BotID rechaza correctamente a Playwright allí (la excepción de pruebas no existe en Production). Esas rutas las cubre la suite E2E contra el preview y la prueba manual del profesor.
- Aún se ve una advertencia de seguridad abierta: `DATABASE_URL` sigue en Vercel (pendiente 3).
