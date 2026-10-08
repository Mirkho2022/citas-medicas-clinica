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
- [x] 2.4 Extender `neon-branch-pr.yml` con los pasos `npm run test:pgtap` y `npm run test:concurrencia`
      tras `migrate up` (hecho en el archivo; sin instalar `pg_prove` ni registrar JWKS en Neon);
      **pendiente de verificar en CI al abrir el PR**: pasa en verde y, forzando una aserción falsa en
      un commit de prueba, el job falla en rojo (demuestra que puede fallar).
      Verificado en el PR #5 (2026-10-08): los pasos de pgTAP, concurrencia e integración corren en verde sobre el branch
      efímero; con una aserción falsa temporal (commit `cb2568a`) el job `migrar` se puso en rojo con «478 pruebas, 1
      fallos» y volvió a verde al revertirla (`ff97718`).
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

- [x] 5.1 Migración de `disponibilidades`, `bloqueos_agenda` y `citas` con las dos restricciones `EXCLUDE`, los
      `CHECK` de rangos e índices, RLS activada y sin política; verificado con pgTAP (19 pruebas): RLS por
      tabla, solape de médico (reservada y confirmada), contiguas, cancelada libera el horario, solape de
      paciente con médicos distintos, rangos incoherentes, disponibilidades y bloqueos; el código de la
      violación es `23P01` (y `22000` si `fin < inicio`, porque la columna generada `rango` falla primero).
- [x] 5.2 Prueba de concurrencia `tests/concurrencia/10_doble_reserva.test.ts` con sesiones `pg` independientes:
      el segundo `INSERT` queda esperando al primero y recibe `23P01` cuando éste confirma, un `rollback` del
      primero libera el horario, y 20 rondas de 5 reservas simultáneas del mismo horario confirman
      exactamente una cada vez; limpia sus filas al terminar. **Corrección tras el CI del PR (2026-10-08):** en una
      ronda el motor abortó una reserva con `40P01` (deadlock) en vez de `23P01`; la prueba acepta ambos códigos
      para los perdedores y los documentos exigen mapear los dos.
- [x] 5.3 Migración de `validar_cancelacion()` (SECURITY DEFINER, medida contra `OLD.inicio`) y su trigger;
      verificado con pgTAP (16 pruebas): más de 1 h se acepta, exactamente 1 h se acepta, 59 min y una cita ya
      empezada se rechazan, cancelar y mover la cita en el mismo UPDATE no esquiva la ventana, un bloqueo del
      mismo médico habilita la baja médica (también para un paciente que no ve el bloqueo), el de otro médico
      no, y se registran `cancelada_en` y `cancelada_por`. La cancelación por el administrativo se prueba en 5.4.
- [x] 5.4 Privilegios y políticas de `citas` (las cuatro de TECH-DESIGN con `rol_actual()`; sin `DELETE`);
      verificado con pgTAP (25 pruebas): el paciente ve solo las suyas, el médico solo su agenda, la enfermera
      y una sesión sin rol ninguna; el paciente no reserva a nombre de otro, con origen administrativo ni en
      el pasado; médico y enfermera no crean; el administrativo agenda, confirma y cancela, la ventana de 1 h
      también lo alcanza, `cancelada_por` registra su perfil y nadie borra.
- [x] 5.5 Privilegios y políticas de `disponibilidades` (lectura a todo rol válido, escritura del administrativo) y
      `bloqueos_agenda` (lectura del administrativo y del médico dueño, escritura del administrativo);
      verificado con pgTAP (23 pruebas), incluidos los negativos de paciente, enfermera, sesión sin rol y
      médico, y que la restricción de bloqueos solapados se mantiene aunque la política lo permita.

## 6. Historias clínicas

- [x] 6.1 Migración de `historias_clinicas`, `atenciones`, `addendas`, `antecedentes` y `cie10` con sus `CHECK`, RLS
      activada y sin política; verificado con pgTAP (21 pruebas): RLS por tabla y los escenarios de campos en
      blanco, diagnósticos vacíos o no-lista, addenda y antecedente en blanco, historia y número únicos. Dos
      correcciones al SQL de TECH-DESIGN: `length(btrim(x)) > 0` deja pasar un campo con solo tabuladores o
      saltos de línea (se usa `texto_con_contenido()`), y una clave foránea compuesta
      `(historia_id, paciente_id)` garantiza que la atención denormalizada coincida con su historia.
- [x] 6.2 Disparador `crear_historia_clinica()` (SECURITY DEFINER, número correlativo `HC-000001`), con relleno de
      pacientes existentes; verificado con pgTAP (8 pruebas): una historia por paciente, número con formato y
      distinto, el administrativo registra pacientes y la historia se crea sin darle acceso, nadie llama la
      función directamente.
- [x] 6.3 `asignaciones_paciente_medico`, `medico_tiene_paciente()`, `hoy_lima()` y `extender_asignacion_por_cita()`
      (con `TG_OP`, fechas de Lima y sin duplicar); verificado con pgTAP (21 pruebas): reservada no otorga
      acceso, la primera confirmación sí (vence a 6 meses, con la fecha de Lima), confirmada→atendida y
      reconfirmar no duplican, cancelar no revoca, el camino INSERT funciona; vigente, sin vencimiento,
      vencida, futura, de otro médico, médico dado de baja y usuario no médico.
- [x] 6.4 Políticas y `GRANT` de `atenciones`, `addendas` e `historias_clinicas` (solo el médico a cargo; atención
      sin firmar y propia; addenda solo sobre atención firmada de un paciente a cargo; `UPDATE` de atenciones
      limitado por columnas); verificado con pgTAP (31 pruebas) con el caso negativo de administrativo,
      paciente, enfermera, sesión sin rol, médico sin asignación, asignación vencida y otro autor. Se comprobó
      por mutación que las pruebas pueden fallar: debilitar la política de lectura hace fallar 5 de ellas.
- [x] 6.5 Disparadores `proteger_atencion_firmada()`, `proteger_addenda()` y `proteger_antecedente()`; políticas de
      `antecedentes` (médico a cargo; solo `vigente` se actualiza) y de `asignaciones_paciente_medico`
      (append-only: el administrativo lee e inserta, el médico lee las suyas, nadie edita ni borra);
      verificado con pgTAP (14 + 26 pruebas): atención firmada inmutable e indeletable incluso para el dueño,
      addenda y antecedente solo-agregar, y los negativos de cada rol.
- [x] 6.6 Política de lectura de `pacientes` para el médico con asignación vigente o cita vigente (reservada o
      confirmada) y de `cie10` para toda sesión con rol válido (sin escritura para nadie); verificado con pgTAP
      (18 pruebas): sin relación, cita cancelada, asignación vencida y agenda de otro médico no dan acceso.
- [x] 6.7 Prueba estructural `47_estructura_historia`: ninguna tabla clínica tiene columnas demográficas y las
      columnas de `atenciones`, `historias_clinicas`, `addendas`, `antecedentes` y
      `asignaciones_paciente_medico` están fijadas con `columns_are` (6 pruebas): una columna nueva exige tocar
      la prueba, y por tanto revisarla.

## 7. Turnos, notificaciones y auditoría

- [x] 7.1 Migración de `turnos_enfermeria` con sus restricciones, `enfermera_actual()` (SECURITY DEFINER) y políticas
      (la enfermera ve los suyos; el administrativo gestiona; paciente, médico y sesión sin rol, ninguno);
      verificado con pgTAP (19 pruebas): unicidad por enfermera, fecha y turno, el `CHECK` de médico o
      especialidad, y los negativos de cada rol.
- [x] 7.2 Migración de `notificaciones` (`unique (cita_id, tipo)`), política de lectura del administrativo y
      privilegios de `cron_notificaciones` (lee y escribe notificaciones, solo lee citas), con políticas propias
      del rol (RLS se aplica al cron: no es cierto que «no pase por RLS»); verificado con pgTAP (26 pruebas):
      el cron no modifica citas ni lee atenciones, antecedentes, historias, addendas, asignaciones, pacientes
      ni perfiles, y paciente, médico, enfermera y sesión sin rol no ven notificaciones.
- [x] 7.3 Migración de `auditoria` y `accesos_historia` (secuencia con `USAGE`, solo-agregar incluso para el dueño);
      el médico registra sus propios accesos a pacientes a su cargo y el administrativo los lee; verificado con
      pgTAP (23 pruebas): no registra accesos a nombre de otro ni de pacientes ajenos, y nadie salvo el
      administrativo lee la auditoría.
- [x] 7.4 `registrar_auditoria()` (SECURITY DEFINER) y disparadores sobre `perfiles`, `pacientes`, `citas`,
      `asignaciones_paciente_medico`, `atenciones`, `addendas` y `antecedentes`; en las tres tablas clínicas solo
      se registra el hecho, sin contenido; verificado con pgTAP (18 pruebas): actor y rol de quien cambió,
      estado anterior y nuevo, la asignación automática también se audita, y ningún texto clínico (marcado
      con «SECRET») aparece en `auditoria`, tampoco al leerla como administrativo.

## 8. Integración con la aplicación

- [x] 8.1 `lib/db/cliente-autenticado.ts`: `ejecutarComoUsuario()` (sin Clerk, probable) y
      `transaccionAutenticada()` (con la sesión de Clerk), siempre `neon(url, { authToken })` por HTTP con la URL
      directa de `authenticator` y `set local role authenticated` como primera sentencia; variables en
      `.env.example`; verificado con `npm run typecheck`, `npm run lint` y la prueba pgTAP `60_roles_de_conexion`
      (11 pruebas): `authenticator` no tiene privilegios sobre ninguna tabla ni hereda los de `authenticated`, por lo que
      olvidar el `set local role` falla cerrado.
- [x] 8.2 Función `usuario_actual()` (SECURITY DEFINER), ruta `/api/db-sesion` (`auth.protect()`) que devuelve el id de
      Clerk y el rol que **Postgres** ve, y `e2e/db.spec.ts`: sin sesión no devuelve identidad y con una cuenta real
      Postgres reconoce al usuario por su token (id de Clerk y rol `paciente`); verificado en local contra la build
      de producción con la JWKS de Clerk registrada para el branch de trabajo. **Para el CI**, el preview de Vercel
      necesita `DATABASE_AUTHENTICATED_URL` apuntando a un branch con las migraciones y la JWKS registrada
      (ver 10.5).
- [x] 8.3 `lib/identidad/sincronizar-perfil.ts` (`UPSERT` idempotente) y webhook de Clerk que lo usa en `user.created` y
      `user.updated` con `DATABASE_SYNC_URL` (rol `sync_identidad`), respondiendo 5xx si falla la base; verificado con
      `tests/integracion/sincronizar-perfil.test.ts` (7 pruebas, privilegios reales del rol), `e2e/webhook.spec.ts`
      (firma inválida o ausente: 400) y una verificación local con firmas Svix reales: mismo evento dos veces = un
      perfil, cambio de rol aplicado, firma inválida sin escrituras, evento ajeno 200 y base caída 500.
- [ ] 8.4 Configurar en Clerk la suscripción a `user.updated` y la obligatoriedad de nombre y apellido.
      **Configuración hecha (2026-10-08) en la instancia de desarrollo `shining-grouse-9314`:** el endpoint
      `https://citas-medicas-clinica.vercel.app/api/webhooks/clerk` está suscrito a `user.created` y
      `user.updated`, y «Require first and last name» está activo (ambos verificados tras recargar el panel).
      **Pendiente de verificar:** registrar una cuenta de prueba nueva y comprobar que su perfil aparece con rol
      `paciente` y nombres, y que una cuenta de personal invitada queda con el rol invitado. No se puede hacer
      antes del despliegue porque el endpoint registrado apunta a la URL de producción de Vercel (código de H1,
      sin sincronización a base de datos) y el webhook no puede llegar a una base local; se hace tras el merge,
      con los pasos de 10.5 cumplidos.

## 9. Datos de demostración (mock)

Proyecto de muestra: se permiten datos **sintéticos** para ejercitar el sistema; nunca datos reales
(P-1 sigue bloqueando los reales). La siembra es un script, no una migración (ver D10).

- [x] 9.1 `scripts/sembrar-datos-demo.ts`: rol dueño, `--confirmar` obligatorio (y `--incluir-produccion` si el destino es
      producción), host impreso, idempotente y transaccional; siembra especialidades, perfiles `mock_`, médicos,
      enfermeras y 12 pacientes ficticios (DNI y CE, con y sin cuenta, correos `@demo.invalid`); verificado: sin
      `--confirmar` aborta con código 1, con él corre sin errores en el branch de trabajo, dos ejecuciones dejan
      los mismos conteos y las 12 historias existen (1 por paciente).
- [x] 9.2 El script resuelve por la API de Clerk los `clerk_user_id` de las cuentas `E2E_*_EMAIL` y las asocia a un
      médico, una enfermera, el administrativo y un paciente de demostración; verificado: las cuatro cuentas
      reales quedaron asociadas y `scripts/comprobar-datos-demo.ts` entra con sus identidades reales.
- [x] 9.3 Disponibilidades (4 médicos × lunes a viernes), un bloqueo de agenda y 14 citas en todos los estados, sin
      desactivar triggers; verificado: se crearon 9 asignaciones por el disparador (3 confirmadas + 6
      atendidas), la cancelada tiene `cancelada_en`, una cita solapada falla con `23P01` y cancelar dentro de la
      hora falla con `P0001`.
- [x] 9.4 6 atenciones firmadas (una por cita atendida), una addenda, 5 antecedentes, 14 turnos de enfermería y 12
      códigos CIE-10 marcados como demostración (capítulo `DEMO`); verificado: modificar o eliminar una
      atención firmada sembrada falla con `42501` y su mensaje de inmutabilidad.
- [x] 9.5 `scripts/comprobar-datos-demo.ts`: una sesión por persona con un token firmado de su `clerk_user_id` real;
      verificado (26 comprobaciones, 0 fallos): el médico ve solo a sus pacientes y nunca atenciones de los del
      otro, el paciente no ve atenciones ni historias ni siquiera las suyas, el administrativo no ve contenido
      clínico y la auditoría no lo contiene, la enfermera ve solo su turno. Resultados en `docs/datos-demo.md`.
- [x] 9.6 `docs/datos-demo.md`: qué se siembra, marcadores, cómo ejecutar y reiniciar (recrear el branch: lo
      firmado no se borra), qué ve cada persona y advertencias sobre P-1 y los branches de CI.
- [x] 9.7 Suite pgTAP completa sobre un branch con los datos de demostración: pasa (477 pruebas, 0 fallos). La
      comprobación destapó dos pruebas de auditoría que contaban filas de toda la tabla; ahora se acotan por el
      id de sus propios registros, como exige la convención de no asumir tablas vacías.

## 10. Documentación y coherencia entre documentos

Regla: PRD, TECH-DESIGN, ADR, CLAUDE.md y `openspec/config.yaml` deben contar la misma historia. El
PRD solo se edita con la skill `generar-prd-conversacional` (CLAUDE.md).

- [x] 10.1 Actualizar TECH-DESIGN.md con las correcciones de D6 (trigger de rol, `security definer` de
      `validar_cancelacion()`, `TG_OP`, auditoría sin contenido clínico, `rol_actual()`) y los
      hallazgos del spike (claim en `publicMetadata.rol`, `authenticator` + `set local role`, funciones
      que leen `auth.*` como `security definer`, privilegios por defecto revocados); alinear el SQL de
      ADR-0015 y los fragmentos de ADR-0023 (`DATABASE_AUTHENTICATED_URL`, `authToken`, claim) con la
      realidad; verificar con una búsqueda que ya no quedan `auth.jwt()`, `auth.uid()` ni `user_role`
      de Supabase fuera de menciones históricas.
      Hecho (2026-10-08): TECH-DESIGN reescrito en arquitectura, modelo de datos, seguridad, reglas de negocio y pruebas;
      ADR-0003, 0012, 0013, 0014, 0015, 0021 y 0023 alineados con notas fechadas. La búsqueda de `auth.jwt()`, `auth.uid()`,
      `user_role`, `service_role` y `supabase/migrations` solo encuentra menciones históricas o explicativas (notas de
      ADR-0003, ADR-0020/0021/0023/0027 al explicar qué reemplazan, TECH-DESIGN al citar el diseño original) y la nota
      pendiente de ADR-0020.
- [x] 10.2 Barrido de coherencia entre documentos: clasificar cada mención de Supabase, Cloudflare,
      `service_role`, `supabase/migrations`, `auth.uid`/`auth.jwt` en `docs/`, CLAUDE.md y
      `openspec/config.yaml` como histórica (correcta) o desactualizada (corregir; p. ej. la ruta
      `supabase/migrations` de ADR-0014), y contrastar los invariantes que se repiten en varios
      documentos: los cuatro roles, el mensaje `Registro de cita ya agendado`, la ventana de 1 h para
      todos los roles, los 6 meses de vigencia, los roles de Postgres y sus `GRANT`
      (`authenticated`/`app_user`, `cron_notificaciones`, `sync_identidad`), la tabla de ADR vigentes de
      TECH-DESIGN contra los archivos de `docs/adrs/`, y los enlaces. Verificar con la tabla de
      hallazgos y su resolución en la descripción del PR; cada discrepancia queda corregida o marcada
      para revisión humana.
      Hecho (2026-10-08): 23 hallazgos con su resolución en `coherencia.md` (para la descripción del PR); 186 enlaces
      comprobados, 1 roto corregido; tabla de ADR de TECH-DESIGN = 23 archivos; invariantes iguales en todos los documentos.
      Dos discrepancias quedan marcadas para revisión humana: ADR-0020 y `notificaciones.tipo` (H5).
- [x] 10.3 Registrar la decisión de usar datos mock: P-1 bloquea datos **reales** de pacientes, no
      los sintéticos de demostración. Reflejarlo en TECH-DESIGN (P-1 y plan de implementación),
      CLAUDE.md («Decisiones aún abiertas») y `openspec/config.yaml` (guía de `apply`); si el PRD
      afirma lo contrario, proponer el cambio con la skill `generar-prd-conversacional` y no editarlo
      a mano. Verificar con una búsqueda que los cuatro textos dicen lo mismo.
      Hecho (2026-10-08): TECH-DESIGN (P-1 y plan de implementación), CLAUDE.md («Decisiones aún abiertas») y
      `openspec/config.yaml` dicen lo mismo (datos reales bloqueados, sintéticos permitidos, sin mezclarlos). El PRD no afirma
      lo contrario, así que no se editó.
- [x] 10.4 Si el spike mostró que `app_user` de ADR-0020 es redundante con `authenticated`, preparar
      el texto de aclaración y **marcarlo para revisión humana** sin sobrescribirlo; verificar que el
      resultado de la revisión queda anotado en `docs/spike-rls-h2.md`.
      Hecho (2026-10-08): nota de revisión pendiente al final de ADR-0020 (texto de la decisión sin tocar) y estado de la
      revisión anotado en `docs/spike-rls-h2.md`, «Revisión pendiente de ADR-0020». Sigue a la espera de decisión humana.
- [x] 10.5 Registrar en `docs/` la lista de pasos manuales de consola para producción (JWKS de la
      instancia de Clerk de producción registrada por API solo en `production`, `LOGIN` y contraseña de
      `cron_notificaciones` y `sync_identidad`, variables en Vercel, suscripción `user.updated`); verificar
      que cada paso tiene su comprobación y que se cumplen antes del merge.
      Hecho (2026-10-08): `docs/pasos-manuales-h2.md`, seis pasos con su comprobación y el orden respecto al merge, más la
      ventana entre merge y configuración (webhook en 500 si falta `DATABASE_SYNC_URL`). **Ejecutar esos pasos** (JWKS en
      Neon, contraseñas, variables de Vercel) es una acción externa que requiere OK explícito del usuario.
- [x] 10.6 Ejecutar la verificación integral en el PR: `migrate up` limpio, suite pgTAP completa y
      concurrencia en verde, E2E existente en verde y `99_rls_en_todas_las_tablas` en verde; verificar
      que no hay tablas de `public` sin RLS y que cada tabla tiene al menos una prueba negativa
      (listado tabla por prueba en la descripción del PR).
      Verificado en el PR #5 (2026-10-08) sobre `6572698`: `migrate up` limpio en el branch efímero, pgTAP 477/0,
      concurrencia 5/5, integración 7/7, E2E de Preview 9/9 y `99_rls_en_todas_las_tablas` en verde; las 19 tablas de
      `public` tienen RLS y prueba negativa (listado en la descripción del PR). El CI destapó que una reserva
      simultánea puede fallar con `40P01` además de `23P01` (ver 5.2).
- [ ] 10.7 Tras el merge, comprobar que `migrar-produccion.yml` aplicó las migraciones a producción
      y que el deployment de Vercel sigue en estado READY; verificar con el log del workflow y
      `get_deployment`. La siembra de demostración en producción, si se quiere, es una acción
      aparte y explícita (9.1), no parte del merge.
