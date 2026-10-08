# Tasks

Convenciones de todo el change (de `openspec/config.yaml`): migraciones como archivos **nuevos** en
`migrations/*.sql`, nunca editar una ya aplicada; toda tabla nueva nace con RLS activada, `GRANT`
explícito y su prueba pgTAP negativa; una tarea que crea una tabla no se marca hecha sin esa
prueba. Las pruebas viven en `tests/pgtap/NN_<área>.test.sql`.

## 1. Spike de validación de ADR-0023 (punto de parada)

- [x] 1.1 Crear un branch de Neon de desarrollo (no `production`) y, con una tabla desechable
      `spike_rls` con RLS activada, ejecutar `create extension pg_session_jwt`; verificar con
      `\dx` que la extensión está instalada y anotar qué rol de Postgres crea Neon para el tráfico
      autenticado y si ya existía antes de la migración.
- [x] 1.2 Registrar en Neon la JWKS de la instancia de Clerk de desarrollo y escribir un script
      descartable `scripts/spike-rls.ts` que consulte `spike_rls` con
      `neon(url, { authToken })`; verificar que con token válido devuelve las filas del usuario y
      que sin token, con token expirado o con token firmado por otra clave no devuelve ninguna.
- [x] 1.3 Inspeccionar el JWT que entrega `getToken()` y determinar la ruta real del claim del rol
      (¿`rol` de primer nivel o `publicMetadata.rol`?); ajustar el JWT template de Clerk si hace
      falta. Verificar con una política de la tabla del spike que filtra por ese claim.
- [x] 1.4 Verificar en el spike que `auth.session()` y `auth.user_id()` sin sesión inicializada
      devuelven nulo en vez de lanzar error, y que dos peticiones consecutivas con tokens de dos
      usuarios distintos no se contaminan entre sí.
- [x] 1.5 Instalar `pgtap` en el branch de desarrollo y lograr, desde un archivo `.sql` de pgTAP,
      iniciar sesión como un usuario de prueba con un JWT firmado por una clave de prueba, probando
      las vías de D1 en orden (`auth.jwt_session_init(token)` / `auth.init()` con JWK por sesión; JWKS
      de prueba registrada; modo `request.jwt.claims` solo para lógica de políticas). Verificar con
      una prueba que ve filas como el usuario A y ninguna como el usuario B.
- [x] 1.6 Documentar en `docs/spike-rls-h2.md` el resultado de cada criterio de D1, el mecanismo
      de autenticación de pruebas elegido y la decisión continuar/parar. **Si algún criterio falla,
      detener el change y consultar al usuario** (el plan B reabre ADR-0023). Si pasa, eliminar la
      tabla `spike_rls` y el script del spike; verificar que `git status` no deja restos del spike
      fuera de `docs/`.

## 2. Infraestructura de pruebas SQL y CI

- [x] 2.1 Crear el runner `scripts/ejecutar-pgtap.ts` (Node, sin depender de `psql`/`pg_prove`: genera un
      par Ed25519 efímero, firma tokens EdDSA por identidad con `jti` 1..N, abre una conexión directa
      con la opción `pg_session_jwt.jwk` y corre cada archivo en su transacción con `create extension
      pgtap`, que se revierte), `tests/pgtap/_ayudas.sql` con `tests.autenticar_como(identidad)` y
      `tests/pgtap/01_humo.test.sql` que cambia de identidad y falla con una identidad inexistente;
      verificar con `npm run test:pgtap` contra el branch de desarrollo que el humo pasa (7/7).
- [x] 2.2 Crear la prueba global `tests/pgtap/99_rls_en_todas_las_tablas.test.sql`: toda tabla
      de `public` tiene RLS activada y ninguna usa `FORCE ROW LEVEL SECURITY`; verificar que hoy
      falla señalando `pgmigrations` (hueco real heredado de los privilegios por defecto de Neon, que
      cierra 3.2) y que el otro caso pasa; queda en verde al terminar 3.2.
- [x] 2.3 Añadir `tests/concurrencia/` (ayuda `_conexion.ts` y una prueba de infraestructura con dos
      clientes `pg`, `node --test`), los scripts `test:pgtap` y `test:concurrencia` en
      `package.json`, `@types/pg`, `allowImportingTsExtensions` en `tsconfig.json` y
      `docs/pruebas-sql.md`; verificar con `npm run test:pgtap`, `npm run test:concurrencia`,
      `npm run typecheck` y `npm run lint`.
- [ ] 2.4 Extender `neon-branch-pr.yml` con los pasos `npm run test:pgtap` y `npm run test:concurrencia`
      tras `migrate up` (hecho en el archivo; sin instalar `pg_prove` ni registrar JWKS en Neon);
      **pendiente de verificar en CI al abrir el PR**: pasa en verde y, forzando una aserción falsa en
      un commit de prueba, el job falla en rojo (demuestra que puede fallar).
- [x] 2.5 Confirmar que `migrar-produccion.yml` no instala `pgtap` ni ejecuta pruebas; verificado
      leyendo el workflow y con `grep` (ninguna migración contiene `pgtap`; el runner instala la
      extensión dentro de la transacción de cada archivo y la revierte).

## 3. Fundamentos: extensiones, tipos, roles y claim del rol

- [x] 3.1 Crear la migración de extensiones (`btree_gist`, `citext`, `pg_session_jwt`; sin `pgcrypto`, porque
      `gen_random_uuid()` es nativa desde PostgreSQL 13) y de los tipos `enum` de TECH-DESIGN; verificado
      con `migrate up` en el branch de trabajo y pgTAP `has_extension`/`enum_has_labels` (9 pruebas).
- [x] 3.2 Crear la migración de privilegios base y roles: revoca los privilegios por defecto abiertos de
      `authenticated` (tablas, secuencias, funciones), cierra `pgmigrations` (revoke + RLS) y crea
      `cron_notificaciones` y `sync_identidad` sin privilegios (`authenticated` ya existe en Neon);
      verificado con pgTAP: roles existen, nadie salvo el dueño toca `pgmigrations`, tabla y secuencia
      nuevas nacen cerradas, `authenticated` sin ningún privilegio por defecto, roles de servicio y
      `anonymous` sin acceso a una tabla nueva.
- [x] 3.3 Crear `public.rol_actual()` (D5) como `security definer` con `search_path` vacío, leyendo
      `auth.session() -> 'publicMetadata' ->> 'rol'`; verificado con pgTAP: nulo sin sesión, el rol de
      cada una de las cuatro identidades, nulo sin rol, solo `authenticated` la ejecuta, y dos pruebas de
      control (una versión invoker y la llamada directa a `auth.*` fallan con `permission denied for
      schema auth`).

## 4. Identidad y personas

- [x] 4.1 Migración de `perfiles`, `pacientes`, `especialidades`, `medicos` y `enfermeras` con sus `CHECK`/`UNIQUE`, RLS
      activada y sin política ni `GRANT`; verificado con pgTAP (23 pruebas): RLS activada por tabla y los
      escenarios de `identidad-de-personas` (DNI y CE válidos e inválidos, documento duplicado,
      `perfil_id` nulo y único, CMP único, perfil único por médico y por enfermera).
- [x] 4.2 Migración de `perfil_actual()`, `paciente_actual()` y `medico_actual()` (`security definer`,
      `search_path` vacío, `EXECUTE` solo para `authenticated`); verificado con pgTAP (11 pruebas): resuelven el
      uuid correcto por identidad, nulo sin sesión o sin perfil, y no revelan perfiles ajenos.
- [x] 4.3 Privilegios y políticas de `perfiles`: `authenticated` lee (titular, administrativo, nombre público
      de médicos con rol válido) y actualiza solo `nombres`, `apellidos`, `rol` y `activo` por política del
      administrativo; sin `INSERT`, sin `DELETE` y sin tocar `clerk_user_id`; verificado con pgTAP (23 pruebas),
      con el caso negativo de cada rol y de una sesión sin rol.
- [x] 4.4 Privilegios y políticas de `pacientes` (titular lee; administrativo lee, registra y corrige; nadie
      borra); la lectura del médico con cita o asignación se añade en 6.6; verificado con pgTAP (16
      pruebas): paciente solo ve el suyo, enfermera, médico sin relación y sesión sin rol no ven ninguno.
- [x] 4.5 Privilegios y políticas de `especialidades`, `medicos` y `enfermeras` (lectura a toda sesión con rol
      válido, salvo `enfermeras`: titular y administrativo; escritura solo del administrativo; médicos y
      enfermeras no se borran); verificado con pgTAP (24 pruebas).
- [x] 4.6 Disparador `bloquear_cambio_de_rol()` (SECURITY INVOKER, `rol` y `activo`; deja pasar al administrativo y
      a `sync_identidad`) y `GRANT` + política de `sync_identidad` solo sobre `perfiles`; verificado con pgTAP
      (18 pruebas): aun con una política temporal que permite actualizar la propia fila, paciente,
      médico y enfermera reciben `42501`; el administrativo y el rol de sincronización pueden; el rol
      de sincronización no lee `pacientes`/`medicos`, no borra y no cambia `clerk_user_id`. Los privilegios
      de `sync_identidad` sobre `citas` y `atenciones` se comprueban cuando esas tablas existan (5.x, 6.x).

## 5. Agenda y citas

- [ ] 5.1 Migración de `disponibilidades`, `bloqueos_agenda` y `citas` con las dos restricciones
      `EXCLUDE`, los `CHECK` de rangos e índices, RLS activada, sin política todavía; verificar con
      pgTAP: negativa por tabla y los escenarios de `integridad-de-agenda` (solape de médico,
      solape de paciente con médicos distintos, cita cancelada libera el horario, citas contiguas,
      bloqueos solapados, rangos incoherentes), comprobando el código `23P01` en las violaciones.
- [ ] 5.2 Prueba de concurrencia en `tests/concurrencia/` con dos clientes `pg` que reservan el
      mismo horario del mismo médico en paralelo; verificar que exactamente una se confirma y la otra
      falla con `23P01`, repitiéndolo al menos 20 veces sin una sola doble reserva.
- [ ] 5.3 Migración de `validar_cancelacion()` como `security definer` con `search_path` vacío
      (D6) y su trigger; verificar con pgTAP los escenarios de ventana de 1 h para paciente y
      administrativo, la excepción por bloqueo que cubre la cita (también para un paciente que no
      ve el bloqueo), que el bloqueo de otro médico no habilita la excepción y el registro de
      `cancelada_en`/`cancelada_por`.
- [ ] 5.4 Políticas y `GRANT` de `citas` (las cuatro de TECH-DESIGN, vía `rol_actual()`); verificar
      con pgTAP «Paciente ve solo sus citas», «Médico ve solo su agenda», «Enfermera no ve citas» y
      que el paciente no reserva a nombre de otro, con `origen` distinto de `portal` ni en el pasado.
- [ ] 5.5 Políticas y `GRANT` de `disponibilidades` y `bloqueos_agenda` (lectura de disponibilidades
      a autenticados; escritura del administrativo; el médico lee sus bloqueos); verificar con pgTAP
      la negativa de escritura de paciente, médico y enfermera.

## 6. Historias clínicas

- [ ] 6.1 Migración de `historias_clinicas`, `atenciones`, `addendas`, `antecedentes` y `cie10` con
      sus `CHECK` de campos no vacíos e índices, RLS activada y sin política; verificar con pgTAP:
      negativa por tabla desde administrativo, paciente y enfermera, y los escenarios de
      `integridad-historia-clinica` sobre campos en blanco, diagnósticos vacíos y addenda vacía.
- [ ] 6.2 Trigger `crear_historia_clinica()` (`security definer`) que crea la historia con número
      único al insertar un paciente, y restricción de una historia por paciente; verificar con pgTAP
      que registrar un paciente crea exactamente una historia y que una segunda se rechaza.
- [ ] 6.3 Migración de `asignaciones_paciente_medico`, `medico_tiene_paciente()` y
      `extender_asignacion_por_cita()` con `TG_OP` (D6); verificar con pgTAP: primera confirmación
      otorga acceso a 6 meses, `confirmada → atendida` no duplica, cancelar no revoca, cita solo
      `reservada` no otorga, y el camino «cita insertada ya `confirmada`» funciona sin error.
- [ ] 6.4 Políticas y `GRANT` de `atenciones`, `addendas` y `historias_clinicas` (solo médico a
      cargo; el médico solo registra atenciones propias de pacientes a su cargo); verificar con pgTAP
      los criterios transversales: administrativo, paciente, enfermera y médico sin asignación no
      reciben filas; asignación vencida no da acceso; una cita nueva con otro médico no revive el
      acceso del anterior; insertar con `medico_id` ajeno falla.
- [ ] 6.5 Trigger `proteger_atencion_firmada()` y `proteger_antecedente()`, y políticas/`GRANT` de
      `antecedentes` y `asignaciones_paciente_medico` (administrativo gestiona; médico solo lee las
      suyas); verificar con pgTAP: no se modifica ni se elimina una atención firmada, una addenda no
      altera la original, no se reescribe `tipo`/`descripcion` de un antecedente ni se elimina, y el
      médico no inserta ni edita asignaciones.
- [ ] 6.6 Añadir la política de lectura de `pacientes` para el médico con cita en su agenda o
      asignación vigente y la lectura de `cie10` a autenticados (sin escritura); verificar con
      pgTAP «Médico sin relación no ve datos del paciente» y que `cie10` no se puede escribir
      desde ningún rol de usuario.
- [ ] 6.7 Prueba pgTAP estructural que consulta `information_schema.columns` de `atenciones` y
      verifica que no tiene columnas demográficas del paciente; verificar que pasa.

## 7. Turnos, notificaciones y auditoría

- [ ] 7.1 Migración de `turnos_enfermeria` con sus restricciones, RLS, `GRANT` y políticas
      (enfermera ve el suyo; administrativo gestiona); verificar con pgTAP: la enfermera ve solo sus
      turnos, no ve los ajenos, paciente y médico no ven ninguno, y el `CHECK` de médico o especialidad.
- [ ] 7.2 Migración de `notificaciones` con `unique (cita_id, tipo)`, RLS, política de lectura del
      administrativo y `GRANT` de `cron_notificaciones` (lectura/escritura en `notificaciones`,
      lectura en `citas`); verificar con pgTAP: paciente, médico y enfermera no leen; el cron lee y
      escribe `notificaciones`, lee `citas`, **no** escribe `citas` y **no** puede leer `atenciones`,
      `antecedentes`, `accesos_historia` ni `historias_clinicas`.
- [ ] 7.3 Migración de `auditoria` y `accesos_historia` (secuencias con `USAGE` para
      `authenticated`), RLS y políticas (el médico inserta sus accesos; el administrativo lee;
      nadie actualiza ni elimina); verificar con pgTAP los escenarios de auditoría solo-agregar y
      que el médico no registra accesos a nombre de otro.
- [ ] 7.4 Función `registrar_auditoria()` y triggers sobre `perfiles`, `pacientes`, `citas`,
      `asignaciones_paciente_medico`, `atenciones`, `addendas` y `antecedentes`, sin volcar contenido
      en las tres tablas clínicas (D6); verificar con pgTAP que un cambio en cada tabla deja su
      registro y que, para las clínicas, `datos_antes` y `datos_despues` no contienen el contenido.

## 8. Integración con la aplicación

- [ ] 8.1 Implementar `lib/db/cliente-autenticado.ts`: `neon(url, { authToken })` en modo HTTP con la URL
      directa del rol `authenticator`, cada petición como `sql.transaction` con `set local role
      authenticated` como primera sentencia, sin `Pool`/`Client`; documentar D9 en un comentario de
      módulo; añadir `DATABASE_AUTHENTICATED_URL` a `.env.example`; verificar con `npm run typecheck`
      y `npm run lint`, y con una prueba que demuestra que sin el `set local role` la consulta falla.
- [ ] 8.2 Registrar por API (`POST /projects/{id}/jwks` con `branch_id`) la JWKS de la instancia de Clerk
      que usa el entorno de la prueba en el branch de Neon que ese entorno consulta; añadir una ruta de
      salud autenticada que use `clienteAutenticado()` y devuelva `auth.user_id()` (vía una función
      `security definer`), protegida con `auth.protect()`; añadir al E2E existente un caso que, con una
      cuenta de prueba, verifica que devuelve su identificador de Clerk y que sin sesión responde como
      no autenticado.
- [ ] 8.3 Extender el webhook de Clerk para hacer `UPSERT` de `perfiles` en `user.created` y
      actualizar nombres/rol en `user.updated`, con la conexión del rol `sync_identidad`
      (`DATABASE_SYNC_URL`, añadida a `.env.example`), idempotente y con 5xx si falla la base;
      verificar con una prueba que entrega el mismo evento dos veces (un solo perfil), un evento con
      firma inválida (400 sin tocar la base) y un fallo de base (5xx).
- [ ] 8.4 Configurar en Clerk la suscripción a `user.updated` y la obligatoriedad de nombre y
      apellido en el registro; verificar registrando una cuenta de prueba nueva y comprobando que su
      perfil aparece con rol `paciente` y nombres, y que una cuenta de personal invitada queda con el
      rol invitado.

## 9. Datos de demostración (mock)

Proyecto de muestra: se permiten datos **sintéticos** para ejercitar el sistema; nunca datos reales
(P-1 sigue bloqueando los reales). La siembra es un script, no una migración (ver D10).

- [ ] 9.1 Crear `scripts/sembrar-datos-demo.ts` con conexión como rol dueño, `--confirmar`
      obligatorio, impresión del host de destino e idempotencia (`ON CONFLICT` por clave natural), y
      sembrar especialidades, perfiles sin login (`clerk_user_id` con prefijo `mock_`), médicos,
      enfermeras y pacientes ficticios (DNI y CE, con y sin perfil, correos `@demo.invalid`); verificar
      que sin `--confirmar` aborta, que con él corre sin errores en el branch de desarrollo, que
      ejecutarlo dos veces deja los mismos conteos y que cada paciente tiene su historia clínica.
- [ ] 9.2 Asociar las cuentas reales de prueba de la instancia de desarrollo de Clerk
      (`h1-<rol>+clerk_test@example.com`) a sus perfiles y a un médico, enfermera y paciente de
      demostración, resolviendo su `clerk_user_id` por la API de Clerk; verificar que los perfiles
      quedan con el rol correcto y que `medico_actual()` / `paciente_actual()` resuelven para ellas.
- [ ] 9.3 Sembrar disponibilidades, un bloqueo de agenda y citas en todos los estados (atendida
      pasada, confirmada y reservada futuras, cancelada con más de 1 h de anticipación), sin
      desactivar triggers; verificar que las asignaciones paciente-médico se generan por el trigger
      y que insertar una cita solapada falla con `23P01`.
- [ ] 9.4 Sembrar atenciones firmadas y una sin firmar, una addenda, antecedentes vigentes y no
      vigentes, turnos de enfermería y un subconjunto de códigos CIE-10 marcado como demostración
      (el catálogo completo es de H6, ADR-0014); verificar que un `UPDATE` sobre una atención firmada
      sembrada falla con el mensaje de inmutabilidad.
- [ ] 9.5 Comprobar el aislamiento con los datos sembrados, usando `tests.autenticar_como`: el
      médico A ve solo a sus pacientes y ninguna atención del médico B, un paciente ve solo sus
      citas, el administrativo no ve atenciones y la enfermera ve solo su turno; registrar los
      resultados en `docs/datos-demo.md`.
- [ ] 9.6 Escribir `docs/datos-demo.md` (qué se siembra, marcadores `mock_` y `@demo.invalid`, cómo
      ejecutar y reiniciar, advertencia de P-1 y de que las atenciones firmadas no se eliminan);
      verificar siguiendo el documento desde cero sobre un branch de desarrollo nuevo.
- [ ] 9.7 Correr la suite pgTAP completa sobre un branch que ya contiene los datos de demostración;
      verificar que sigue en verde (las pruebas no asumen tablas vacías: usan fixtures propios y
      aserciones por identificador).

## 10. Documentación y coherencia entre documentos

Regla: PRD, TECH-DESIGN, ADR, CLAUDE.md y `openspec/config.yaml` deben contar la misma historia. El
PRD solo se edita con la skill `generar-prd-conversacional` (CLAUDE.md).

- [ ] 10.1 Actualizar TECH-DESIGN.md con las correcciones de D6 (trigger de rol, `security definer` de
      `validar_cancelacion()`, `TG_OP`, auditoría sin contenido clínico, `rol_actual()`) y los
      hallazgos del spike (claim en `publicMetadata.rol`, `authenticator` + `set local role`, funciones
      que leen `auth.*` como `security definer`, privilegios por defecto revocados); alinear el SQL de
      ADR-0015 y los fragmentos de ADR-0023 (`DATABASE_AUTHENTICATED_URL`, `authToken`, claim) con la
      realidad; verificar con una búsqueda que ya no quedan `auth.jwt()`, `auth.uid()` ni `user_role`
      de Supabase fuera de menciones históricas.
- [ ] 10.2 Barrido de coherencia entre documentos: clasificar cada mención de Supabase, Cloudflare,
      `service_role`, `supabase/migrations`, `auth.uid`/`auth.jwt` en `docs/`, CLAUDE.md y
      `openspec/config.yaml` como histórica (correcta) o desactualizada (corregir; p. ej. la ruta
      `supabase/migrations` de ADR-0014), y contrastar los invariantes que se repiten en varios
      documentos: los cuatro roles, el mensaje `Registro de cita ya agendado`, la ventana de 1 h para
      todos los roles, los 6 meses de vigencia, los roles de Postgres y sus `GRANT`
      (`authenticated`/`app_user`, `cron_notificaciones`, `sync_identidad`), la tabla de ADR vigentes de
      TECH-DESIGN contra los archivos de `docs/adrs/`, y los enlaces. Verificar con la tabla de
      hallazgos y su resolución en la descripción del PR; cada discrepancia queda corregida o marcada
      para revisión humana.
- [ ] 10.3 Registrar la decisión de usar datos mock: P-1 bloquea datos **reales** de pacientes, no
      los sintéticos de demostración. Reflejarlo en TECH-DESIGN (P-1 y plan de implementación),
      CLAUDE.md («Decisiones aún abiertas») y `openspec/config.yaml` (guía de `apply`); si el PRD
      afirma lo contrario, proponer el cambio con la skill `generar-prd-conversacional` y no editarlo
      a mano. Verificar con una búsqueda que los cuatro textos dicen lo mismo.
- [ ] 10.4 Si el spike mostró que `app_user` de ADR-0020 es redundante con `authenticated`, preparar
      el texto de aclaración y **marcarlo para revisión humana** sin sobrescribirlo; verificar que el
      resultado de la revisión queda anotado en `docs/spike-rls-h2.md`.
- [ ] 10.5 Registrar en `docs/` la lista de pasos manuales de consola para producción (JWKS de la
      instancia de Clerk de producción registrada por API solo en `production`, `LOGIN` y contraseña de
      `cron_notificaciones` y `sync_identidad`, variables en Vercel, suscripción `user.updated`); verificar
      que cada paso tiene su comprobación y que se cumplen antes del merge.
- [ ] 10.6 Ejecutar la verificación integral en el PR: `migrate up` limpio, suite pgTAP completa y
      concurrencia en verde, E2E existente en verde y `99_rls_en_todas_las_tablas` en verde; verificar
      que no hay tablas de `public` sin RLS y que cada tabla tiene al menos una prueba negativa
      (listado tabla por prueba en la descripción del PR).
- [ ] 10.7 Tras el merge, comprobar que `migrar-produccion.yml` aplicó las migraciones a producción
      y que el deployment de Vercel sigue en estado READY; verificar con el log del workflow y
      `get_deployment`. La siembra de demostración en producción, si se quiere, es una acción
      aparte y explícita (9.1), no parte del merge.
