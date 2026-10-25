# Design

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/`. Estado de partida,
verificado en el repositorio:

- Neon no tiene ninguna tabla; `migrations/` está vacía. Existen `node-pg-migrate` 9 + `pg`, el
  script `npm run migrate` y los workflows `neon-branch-pr.yml` (branch efímero + `migrate up`) y
  `migrar-produccion.yml` (`migrate up` al hacer merge a `master`). Ninguno corre pruebas de SQL.
- No existe `pg_session_jwt`, el rol `authenticated` ni `clienteAutenticado()` (H1 los difirió).
- El webhook de Clerk (`app/api/webhooks/clerk/route.ts`) solo atiende `user.created` y solo fija
  `publicMetadata.rol`; no toca la base de datos. La sesión expone el rol como
  `sessionClaims.publicMetadata.rol` (`lib/auth/rol.ts`).
- TECH-DESIGN define el modelo de datos completo y SQL de políticas **solo para 5 tablas**
  (`atenciones`, `antecedentes` [en ADR-0015], `asignaciones_paciente_medico`, `notificaciones`,
  `citas`). Las otras ~12 tablas no tienen política escrita.
- Fuentes de la documentación de `pg_session_jwt` consultadas para este design:
  [neon.com/docs/extensions/pg_session_jwt](https://neon.com/docs/extensions/pg_session_jwt) y
  [lista de extensiones de Neon](https://neon.com/docs/extensions/pg-extensions) (pgTAP 1.3.3 soportado).
  Lo que dicen es una hipótesis hasta que el spike (D1) lo ejecute.

## Goals / Non-Goals

**Goals:**
- Que ADR-0023 pase de «confirmado por documentación» a «ejecutado de extremo a extremo», o que
  falle pronto y barato, antes de construir sobre él.
- Un esquema donde **el aislamiento no dependa de que el código de aplicación sea correcto**: toda
  tabla con RLS, privilegios mínimos por rol y una prueba negativa por tabla.
- Una suite pgTAP que corre en CI contra un branch real de Neon, con un único punto de cambio para
  el mecanismo de autenticación de pruebas.

**Non-Goals:**
- No se construye ninguna pantalla ni Server Action de negocio (la UI y la lógica llegan en H3-H7).
- No se escriben políticas de **escritura** para flujos que todavía no existen; se añaden con su
  hito, cada una con su prueba negativa (ver D3).
- No se resuelve la decisión legal P-1 ni se cargan datos reales ni el catálogo CIE-10 completo
  (solo datos sintéticos de demostración, D10).

## Decisions

### D1. Spike primero, con criterio de aceptación y punto de parada

La primera tarea valida ADR-0023 con una tabla desechable en un branch de Neon de desarrollo
(nunca en `production`). Se da por superado solo si se cumplen **todos**:

1. `create extension pg_session_jwt` funciona con el rol de migraciones, y se identifica qué rol
   crea Neon para el tráfico autenticado (¿`authenticated`?) y si ya existe antes de la migración.
2. Con la JWKS de la instancia de Clerk registrada, una consulta con `authToken` ve sus filas; la
   misma consulta sin token, o con token expirado o firmado por otra clave, no ve ninguna.
3. Se identifica la **ruta real del claim del rol** en el JWT que entrega `getToken()` (hoy el rol
   vive en `publicMetadata.rol`; TECH-DESIGN asume `auth.session() ->> 'rol'` de primer nivel) y,
   si hace falta, se ajusta el JWT template de Clerk.
4. Dos peticiones consecutivas con tokens de usuarios distintos no se contaminan (ver D9).
5. En pgTAP se puede iniciar sesión como un usuario de prueba con un JWT firmado por una clave de
   prueba, usando una de las funciones documentadas (`auth.jwt_session_init(token)` o `auth.init()` con
   la JWK configurada). Se registra cuál funciona y cómo se configura la JWK de prueba (por sesión,
   por JWKS registrada en Neon, o — solo para probar la lógica de políticas, no la validación — el
   modo `request.jwt.claims` que la documentación marca como inseguro fuera de pruebas).
6. `auth.session()` / `auth.user_id()` sin sesión inicializada **no lanzan error**: devuelven nulo
   (las políticas y `bloquear_cambio_de_rol()` lo suponen).
7. La extensión `pgtap` se puede instalar en el branch de pruebas.

**Si algún criterio falla:** se detiene el change y se consulta al usuario. El plan B (`SET LOCAL`
casero) reabre ADR-0023 y se decide con él, no dentro de este change. Alternativas descartadas:
saltarse el spike y descubrirlo al escribir las ~20 políticas (el costo del error crece con cada
política escrita); probar solo en local (la validación de JWKS ocurre en Neon, no se reproduce con un
Postgres local).

**Resultado (2026-10-08): superado, sin plan B.** Detalle, evidencia y hallazgos en
[docs/03-arquitectura/spike-rls-h2.md](../../../docs/03-arquitectura/spike-rls-h2.md). El criterio 5 se resolvió con una JWK
Ed25519 por sesión (D7), no con una JWKS de prueba registrada en Neon. Los hallazgos ajustaron D4,
D5, D7, D9 y D11.

### D2. Migraciones: varios archivos por dependencia, solo hacia adelante

Migraciones por área, en este orden, porque las funciones `LANGUAGE sql` se validan al crearse y
exigen que existan las tablas que citan: (1) extensiones, tipos, roles y `rol_actual()`;
(2) identidad; (3) agenda; (4) historias clínicas; (5) turnos, notificaciones y auditoría. Dentro
de cada área, archivos separados para tablas, funciones y triggers, y privilegios con RLS y
políticas, de modo que cada área aterriza junto con sus pruebas. Cuando una política cruza áreas
(p. ej. el médico que lee `pacientes` con cita o asignación) se añade en la migración del área que
completa sus dependencias. Las secciones `down` quedan vacías (política de solo-adelante de CLAUDE.md y ADR-0027); un
error se corrige con una migración nueva, nunca editando una ya aplicada ni restaurando el branch
principal. La extensión `pgtap` **no** va en ninguna migración: solo se instala en el branch
efímero de pruebas, para que nunca llegue a producción.

### D3. Alcance de las políticas: denegar por defecto, derivar solo lo evidente

Se activa RLS en todo y se conceden privilegios y políticas así:

| Grupo | Política en este change |
|---|---|
| Las 5 tablas con SQL en TECH-DESIGN/ADR | Tal como están, con la sintaxis de `auth.session()` y el claim confirmado en D1. |
| Lecturas derivables de la matriz de roles (CLAUDE.md/PRD) | `perfiles` (propio; administrativo todo; datos de nombre de médicos visibles), `pacientes` (propio; administrativo; médico con cita o asignación vigente), `especialidades`/`medicos`/`disponibilidades`/`cie10` (lectura a todo autenticado), `turnos_enfermeria`/`enfermeras` (propio; administrativo), `bloqueos_agenda` (administrativo; médico propios), `auditoria`/`accesos_historia` (administrativo lee). |
| Escrituras ya especificadas | Administrativo gestiona catálogos y personal, médico inserta sus accesos y sus atenciones/antecedentes/addendas. |
| Todo lo demás (p. ej. paciente cancela su cita, médico confirma o marca atendida) | **Sin política: denegado.** Lo añade el hito que construye el flujo (H3/H4/H6/H7), con su prueba negativa. |

Alternativa descartada: escribir ahora todas las políticas de escritura imaginables — fija
decisiones de producto sin flujo que las valide y amplía la superficie de ataque sin necesidad.
**Estas filas «derivables» no están en TECH-DESIGN; son supuestos conservadores que se marcan para
revisión humana** (ver Open Questions). La historia clínica nace con un trigger de seguridad
`crear_historia_clinica()` al insertar un paciente, de modo que el administrativo no necesita (ni
tiene) política sobre `historias_clinicas`.

### D4. Roles de Postgres y privilegios como segunda barrera

Según el spike, el tráfico de usuario entra con el rol de login `authenticator` y ejecuta
`set local role authenticated` (rol `NOLOGIN` que Neon ya creó junto a `anonymous`; las políticas son
`TO authenticated`). `neondb_owner` tiene `BYPASSRLS`: sirve para migrar y preparar datos, nunca
para tráfico de usuario. Dos hallazgos condicionan el SQL:

- **Neon dejó privilegios por defecto abiertos**: `authenticated` recibe `INSERT/SELECT/UPDATE/DELETE`
  sobre toda tabla nueva de `public`, `USAGE` de secuencias y `EXECUTE` de funciones. La primera
  migración los revoca con `ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE ...`
  y cada tabla recibe `GRANT` explícito por operación, alineado con sus políticas (nunca `ON ALL
  TABLES`), más `USAGE` en las secuencias de `auditoria` y `accesos_historia`. Una tabla sin
  `GRANT` queda inaccesible aunque tenga política.
- **`authenticated` no tiene `USAGE` sobre el esquema `auth`** y no se puede concederle (el esquema es
  de `cloud_admin`): toda función que lea `auth.*` es `SECURITY DEFINER` (D5).

`cron_notificaciones` y `sync_identidad` se crean `NOLOGIN` en la migración con `GRANT` mínimo, y
`LOGIN`/contraseña se fijan por entorno fuera del repositorio. `authenticator` no tiene privilegios
sobre tablas: si el helper olvidara `set local role`, la consulta falla cerrada. Nunca `FORCE ROW
LEVEL SECURITY`: las funciones `security definer` y los triggers dependen de que el dueño no pase
por RLS. **`app_user` (ADR-0020) no existe en Neon**: el rol de tráfico de usuario es
`authenticator` + `authenticated` (ADR-0023); el texto de ADR-0020 se aclara con revisión humana
(tarea 10.4), no en silencio.

### D5. El claim del rol se lee en un solo lugar

El spike confirmó que el token de sesión de Clerk lleva el rol en `publicMetadata.rol` (anidado),
no como `rol` de primer nivel. Las políticas no repiten la expresión: usan `public.rol_actual()`
(`stable`, **`security definer`** con `search_path` vacío, que devuelve
`auth.session() -> 'publicMetadata' ->> 'rol'`), envuelta en subconsulta para conservar el `InitPlan`.
Si la ruta del claim cambia, se cambia una función y no ~25 políticas. Por el hallazgo de D4,
`perfil_actual()`, `paciente_actual()` y `medico_actual()` ya eran `security definer` y
`rol_actual()` se alinea con ellas. Los fragmentos SQL de TECH-DESIGN son ilustrativos de esta
decisión, no un contrato literal.

### D6. Correcciones al SQL de TECH-DESIGN detectadas al diseñar

Cada una se prueba con pgTAP; se documentan aquí para que nadie las «corrija» de vuelta:

- **`bloquear_cambio_de_rol()` bloquearía al webhook.** TECH-DESIGN dice que `sync_identidad` es
  un camino autorizado para escribir `perfiles.rol`, pero el trigger solo permite al administrativo
  y la conexión del webhook no lleva token. Se implementa como **SECURITY INVOKER** (TECH-DESIGN lo
  proponía DEFINER): solo compara `OLD`/`NEW` y llama a `rol_actual()`, que ya es DEFINER; así
  `current_user` es el rol que ejecuta el `UPDATE` y se reconoce a `sync_identidad` (en DEFINER sería el
  dueño). Protege `rol` y también `activo`. Los `IF` van anidados porque PostgreSQL comprueba el
  `EXECUTE` de una función al inicializar la expresión aunque un `AND` la saltara, y
  `sync_identidad` no ejecuta `rol_actual()`. Como el rol `authenticated` es compartido por todos los
  roles de aplicación, `authenticated` no recibe `INSERT`/`DELETE` sobre `perfiles` ni `UPDATE` de
  `clerk_user_id`: el trigger es la barrera de fondo, no la única.
- **`validar_cancelacion()` debe ser `security definer`** (con `search_path` vacío). Si no, la
  consulta a `bloqueos_agenda` pasa por la RLS de quien cancela y un paciente nunca ve el bloqueo,
  con lo que la excepción por baja médica dependería del rol, contra ADR-0012. Además, la ventana se
  mide contra `OLD.inicio` y no `NEW.inicio` (como decía TECH-DESIGN): con `NEW`, un `UPDATE` que cancela y a
  la vez mueve la cita al futuro esquivaría la ventana.
- **`extender_asignacion_por_cita()` en el `INSERT`.** El `OR` con `old is null` / `old.estado` es
  frágil en un trigger de inserción; se escribe con `TG_OP` y se prueba el camino «cita insertada ya
  `confirmada`» además del `UPDATE`.
- **La auditoría no debe copiar contenido clínico.** Si `registrar_auditoria()` volcara la fila
  completa de `atenciones`/`addendas`/`antecedentes` en `datos_antes/datos_despues`, el
  administrativo —que puede leer `auditoria`— leería historias clínicas por esa vía. Para esas tres
  tablas se registra quién, cuándo, acción y `registro_id`, sin contenido. Los disparadores cubren
  `perfiles`, `pacientes`, `citas`, `asignaciones_paciente_medico` y esas tres tablas clínicas (lista
  derivada; ver Open Questions). `auditoria` y `accesos_historia` son solo-agregar incluso para el dueño.
- **El cron sí pasa por RLS.** TECH-DESIGN y ADR-0020 dicen que `cron_notificaciones` «no pasa por RLS»; RLS se
  aplica a todo rol que no sea el dueño ni tenga `BYPASSRLS`. Darle `BYPASSRLS` ampliaría su alcance si un
  `GRANT` se excediera, así que tiene políticas propias, igual de acotadas que sus `GRANT` (notificaciones: todo;
  citas: solo lectura).
- **Antecedentes inmutables salvo `vigente`.** RLS no filtra por columna: el `UPDATE` de `authenticated` se limita a
  la columna `vigente` por privilegio de columna y `proteger_antecedente()` rechaza cualquier otro cambio y todo
  `DELETE`, incluso del dueño.
- **«Sin campos vacíos»: `btrim()` no basta.** `length(btrim(x)) > 0` (TECH-DESIGN y ADR-0015) solo recorta
  espacios y deja pasar un campo con tabuladores o saltos de línea; lo encontró la prueba 40. Se usa
  `public.texto_con_contenido()` (al menos un carácter que no sea espacio en blanco).
- **Denormalización de `atenciones.paciente_id`.** La política RLS se apoya en él; una clave foránea compuesta
  `(historia_id, paciente_id)` hacia `historias_clinicas` garantiza que coincida con el dueño de la historia.
- **Fechas del negocio en `America/Lima`.** `current_date` depende del `TimeZone` del servidor (UTC en Neon);
  `public.hoy_lima()` se usa en la vigencia de asignaciones y en `medico_tiene_paciente()`.
- **`medico_tiene_paciente()` exige `medicos.activo`.** Un médico dado de baja pierde el acceso aunque su
  asignación no haya vencido.
- **`asignaciones_paciente_medico` es append-only de verdad (ADR-0016).** TECH-DESIGN proponía `for all` para
  el administrativo, que permitiría editar; se concede solo `SELECT` e `INSERT`. El disparador no duplica la
  asignación de una misma cita (índice único parcial sobre `motivo` `cita:%`) y no lleva `CHECK` de orden entre
  fechas, para no fallar al cargar citas pasadas ya vencidas.
- **Atenciones y addendas.** La atención se registra sin firmar y solo su autor la edita o firma
  (`UPDATE` por columnas); la addenda solo procede sobre una atención firmada de un paciente a cargo, con la
  autoría del propio médico, y es solo-agregar (`proteger_addenda()`). Ninguna se elimina.
- **Lectura de `pacientes` por el médico** (supuesto D3): asignación vigente o cita vigente
  (`reservada`/`confirmada`); una cita cancelada o atendida y vencida no da acceso.
- **ADR-0015 usa sintaxis de Supabase** (`auth.jwt()`, `auth.uid()`, claim `user_role`, resolución
  de médico con `auth.uid()` sobre `perfiles`): se corrige a la sintaxis de ADR-0023 tras D1; es
  alineación de documentación, no cambio de decisión.

### D7. Estrategia de pruebas

- **pgTAP en `tests/pgtap/NN_<área>.test.sql`.** Cada archivo trae solo el cuerpo pgTAP; el runner
  (`scripts/ejecutar-pgtap.ts`, Node: no hay `psql` ni `pg_prove` en Windows y se evita instalar Perl en
  CI) abre una conexión por archivo, pone el `begin`, instala `pgtap` **dentro** de la transacción
  (~0,3 s) y hace `rollback`: ni la extensión ni las ayudas quedan en la base. Los datos de prueba
  los crea el rol dueño; luego `set local role authenticated`. Toda autenticación pasa por
  `tests.autenticar_como(identidad)`. Receta confirmada en el spike: el runner genera por ejecución un
  par **Ed25519** efímero y firma, por identidad de prueba (`sub` + `publicMetadata.rol`), tokens con
  `jti` 1..N; la JWK pública viaja en la opción de arranque `pg_session_jwt.jwk` de una conexión
  **directa**; el helper toma el siguiente `jti`, hace `reset role`, `auth.jwt_session_init` y
  `set local role authenticated`. No se registra ninguna JWKS de prueba en Neon.
- **Cobertura mínima por tabla:** RLS activada, una prueba negativa por política (el rol equivocado
  no ve ni escribe), una positiva (el rol correcto sí) y los `GRANT` esperados.
- **Concurrencia fuera de pgTAP.** pgTAP corre en una sola sesión y no puede demostrar la doble
  reserva simultánea. Esa prueba usa dos clientes `pg` reales con `node --test` (sin añadir un
  framework), en `tests/concurrencia/`.
- **Runner en CI:** `npm run test:pgtap` y `npm run test:concurrencia` contra el branch efímero con la
  conexión directa (`DATABASE_URL_PRUEBAS`), después de `migrate up`. `DATABASE_URL_PRODUCCION` solo
  sirve de guarda: si el host coincide, los runners se niegan a correr.
- **Regla de cierre:** cada tarea que crea una tabla incluye su prueba negativa; sin ella no se
  marca como hecha (operación `apply` de `openspec/config.yaml`).

### D8. Webhook de Clerk

`user.created` conserva el comportamiento de H1 (fijar `paciente` si no hay rol) y además hace un
`UPSERT` de `perfiles` por `clerk_user_id` usando el rol resultante; `user.updated` actualiza
nombres y rol desde `public_metadata.rol`. Usa una conexión propia con el rol `sync_identidad`
(`DATABASE_SYNC_URL`), nunca la de usuario. Es idempotente (`ON CONFLICT (clerk_user_id) DO
UPDATE`) y, si falla la base, responde 5xx para que Svix reintente; la firma sigue verificándose
primero. Requiere suscribir el evento `user.updated` en el endpoint de Clerk (paso de consola). Los
nombres y apellidos son `NOT NULL`: el registro de Clerk debe exigirlos (paso de consola) y el
webhook usa cadena vacía solo como último recurso, con un aviso en el log, en lugar de perder el
alta. Alternativa descartada: adelantar la tabla `pacientes` a este flujo — la vinculación por
documento es del portal (H4).

### D9. `clienteAutenticado()` solo por HTTP, un token y un rol por petición

El helper usa `neon(url, { authToken })` en modo HTTP con la URL **directa** del rol `authenticator`
(`DATABASE_AUTHENTICATED_URL`) y ejecuta cada petición como una `sql.transaction` cuya primera
sentencia es `set local role authenticated`; no expone ninguna consulta fuera de esa transacción.
Se prohíbe `Pool`/`Client` con WebSocket para consultas autenticadas (una conexión reutilizada
podría conservar la identidad de otro usuario, y un `jwt_session_init` fallido deja la anterior).
La URL pooled no se probó; se usa la directa. Es código de conveniencia: el límite de seguridad
sigue siendo la validación dentro de Neon y Postgres. El spike midió que la alternancia de usuarios
no contamina (criterio 4).

### D10. Datos de demostración (mock): script aparte, no migración

Es un proyecto de muestra: se permiten datos **sintéticos** para ejercitar el sistema. Nunca datos
reales de pacientes (P-1 sigue bloqueándolos). La siembra es un script versionado
(`scripts/sembrar-datos-demo.ts`), no una migración, porque las migraciones corren en todos los
entornos, incluida producción, y los branches efímeros copian `production`: sembrar por migración
dejaría datos de demostración en todas partes y, al ser solo-adelante, sin retirada limpia.

- **Seguridad de la siembra.** Idempotente (`ON CONFLICT` por clave natural), `--confirmar`
  obligatorio y host de destino impreso. Se conecta como rol dueño (necesita escribir historias y
  auditoría sin pasar por RLS) y **no desactiva triggers**: citas confirmadas generan sus
  asignaciones, las atenciones pasan por sus `CHECK`, así que la siembra es también una prueba de
  integración.
- **Marcadores.** Personas sin cuenta con `clerk_user_id` de prefijo `mock_`, correos `@demo.invalid`,
  nombres ficticios. Las cuentas reales de prueba de la instancia de desarrollo de Clerk
  (`h1-<rol>+clerk_test@example.com`) se asocian a personas de demostración para poder entrar con
  cada rol y ver datos.
- **Contenido** suficiente para tocar cada regla: ambos tipos de documento, pacientes con y sin
  cuenta, citas en todos los estados, un bloqueo de agenda, atenciones firmadas y sin firmar,
  addenda, antecedentes y turnos. El CIE-10 sembrado es un subconjunto marcado como demostración; el
  catálogo completo sigue siendo de H6 ([ADR-0014](../../../docs/03-arquitectura/adrs/0014-catalogo-cie-10.md)).
- **Limpieza.** Las atenciones firmadas no se pueden eliminar por diseño, de modo que el script no
  borra: para reiniciar una demostración se recrea un branch de desarrollo. En el branch principal
  de producción sigue prohibido restaurarlo.
- **Efecto sobre las pruebas.** Si producción tiene datos de demostración, los branches efímeros de
  CI los heredan, así que **las pruebas pgTAP no pueden asumir tablas vacías**: usan fixtures con
  identificadores propios y aserciones por id; las negativas («este rol no ve ninguna fila») siguen
  siendo válidas con datos presentes.
- **Dónde se siembra** (desarrollo, previews o producción) es una decisión operativa que no cambia
  el diseño; producción solo por acción explícita del usuario.

Alternativas descartadas: sembrar por migración (contamina todos los entornos); usar solo fixtures
de pgTAP (no sirven para demostrar la aplicación); un flag `--limpiar` con `session_replication_role
= replica` (esquiva los triggers de inmutabilidad que protegen el modelo).

### D11. CI y entornos

`neon-branch-pr.yml` añade, tras `migrate up`, los pasos `npm run test:pgtap` y `npm run test:concurrencia`. Las pruebas de
SQL **no necesitan registrar ninguna JWKS en Neon**. `migrar-produccion.yml` no cambia y no instala
pgTAP. Al hacer merge, la migración de producción corre sola, con las tablas vacías.

La JWKS de Clerk se registra por API (`POST /projects/{id}/jwks` con `branch_id`) en cada branch
donde corra la aplicación con tráfico autenticado, y **no se hereda** a los branches nuevos: solo la
necesita la prueba E2E de `clienteAutenticado()` (tarea 8.2) y producción. Antes del merge hay que
registrar en `production` la JWKS de la instancia de Clerk que use Vercel producción, que en H1 era
distinta de la de `.env.local`.

## Risks / Trade-offs

- **El spike falla o `pg_session_jwt` no se comporta como documenta** → resuelto: superado (D1,
  [docs/03-arquitectura/spike-rls-h2.md](../../../docs/03-arquitectura/spike-rls-h2.md)); si una versión futura de la extensión cambia
  el comportamiento, las pruebas pgTAP y la E2E lo detectan.
- **El token vencido se acepta unas decenas de segundos** (tolerancia del proxy de Neon) → el token
  solo viaja entre el servidor y Neon y nunca se guarda ni se envía al navegador.
- **Claim del rol** → confirmado en `publicMetadata.rol`; con `rol_actual()` un cambio futuro es de un
  solo punto y el riesgo residual es que una política lea nulo y deniegue todo (falla cerrada).
- **Branches `schema-only` no disponibles en el plan Free (412 en el PR #3)** → el branch efímero
  copia los datos de `production`; hoy está vacío. Antes de cargar datos clínicos reales hay que
  resolverlo (ya anotado en `neon-branch-pr.yml`).
- **Rol de base de datos con `LOGIN` fuera del repositorio** → los `GRANT` se prueban en pgTAP, pero
  la contraseña se gestiona por consola; un olvido rompe el cron o el webhook con error visible.
- **`GRANT` de más es un hueco silencioso** (consecuencia de ADR-0020) → las pruebas verifican con
  `has_table_privilege` lo que cada rol *no* puede, no solo lo que sí.
- **Fuga de identidad entre peticiones** si alguien usa `Pool` o una conexión reutilizada → regla D9;
  el spike midió 18 peticiones alternadas sin contaminación.
- **Privilegios por defecto de Neon** dejan tablas nuevas abiertas a `authenticated` → se revocan en
  la primera migración y la prueba global `99_rls_en_todas_las_tablas` más `has_table_privilege`
  detectan cualquier regresión.
- **Supuestos de políticas derivadas (D3)** pueden no coincidir con lo que quiere el cliente →
  son restrictivos por diseño; relajar una es una migración nueva, endurecer una tras un incidente no.

## Migration Plan

1. Spike en un branch de desarrollo; decisión de continuar o parar (D1) — hecho, continuar.
2. Migraciones en orden (D2) sobre el branch de desarrollo; suite pgTAP en verde en local/CI.
3. PR: el workflow crea el branch efímero, migra y corre pgTAP + concurrencia.
4. Antes del merge: JWKS de Clerk de producción registrada en Neon por API solo en `production`;
   roles `NOLOGIN` con `LOGIN` y contraseña fijados por entorno; `user.updated` suscrito; nombres
   obligatorios en el registro de Clerk.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones a producción (tablas vacías).
6. Rollback: no existe marcha atrás destructiva. Un defecto se corrige con una migración nueva; está
   prohibido restaurar el branch principal de Neon en producción.

## Open Questions

- **Revisión humana de las políticas derivadas (D3) y de la lista de tablas auditadas (D6).** No
  cambian el enfoque ni las tareas; se confirman o se ajustan al revisar la implementación.
- **Aclaración de ADR-0020 sobre `app_user`.** El spike mostró que no existe; el texto del ADR se
  corrige con revisión humana (tarea 10.4).
- **Tipo de notificación `reprogramacion`.** ADR-0011 manda encolar una notificación de reprogramación, pero el
  `CHECK` de `notificaciones.tipo` (TECH-DESIGN) solo admite tres tipos. No se cambia aquí: lo decide H5 al
  construir las notificaciones (sería un `ALTER` del `CHECK` en una migración nueva).
- **Región de Neon y retención** dependen de P-1 y no se tocan aquí.
