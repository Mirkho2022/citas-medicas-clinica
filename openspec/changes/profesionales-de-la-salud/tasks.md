# Tasks

Convenciones de todo el change (leer antes de empezar):

- **Nombres: sujetos a ADR-0030; si se rechaza, léase `medico`/`medicos`. Nada de este change se aplica hasta que el usuario acepte la
  ADR-0030 (tarea 0.1).**
- **Este change toca RLS, funciones `SECURITY DEFINER` y el acceso a historias clínicas, el riesgo principal del proyecto.** Cada grupo que
  cambia políticas, funciones `SECURITY DEFINER`, disparadores o la lectura del rol termina con una tarea de **revisión con el agente
  `code-review`** y no se da por cerrado hasta corregir o justificar sus hallazgos. Hay además verificación por mutación (grupo 8) y
  una revisión final de todo el diff (11.6).
- **Datos reales: prohibidos.** La decisión legal P-1 sigue abierta; este change no añade datos clínicos ni fija el modo `real`.
- Las migraciones son archivos nuevos en `migrations/*.sql` (se crean con `npm run migrate -- create <nombre>`); **nunca se edita una ya
  aplicada**, y las secciones `down` quedan vacías (ADR-0027). Este change **no crea tablas**: `99_rls_en_todas_las_tablas` debe seguir en
  verde. Las migraciones de H3 en adelante se crean **después** de M1 (el orden lo verifica `node-pg-migrate`).
- Las pruebas pgTAP no asumen tablas vacías y se corren siempre en un branch de desarrollo o efímero de Neon, **nunca en `production`**. Los
  números de las pruebas nuevas (63 a 65) son los reservados para este change. Códigos SQLSTATE propios: `HC010` y `HC011` (rango
  `HC010` a `HC019`).
- Nada de acciones externas al redactar; las tareas que ejecutan algo contra Neon, Vercel o Clerk son del momento de aplicar y las
  marca cada una. Los textos de interfaz y los mensajes de error van en español; las fechas, en `America/Lima`.
- Los archivos del repositorio usan saltos de línea CRLF: se editan con anclas de una línea o con un guion que respete el fin de línea.
- Cada grupo deja sus pruebas y su documentación; el último grupo es de coherencia e integración, no de pruebas pendientes.

## 0. Decisiones previas y verificaciones

- [ ] 0.1 **Bloqueante.** El usuario acepta la [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (estado «Aceptado»). Si la
      rechaza, se detiene este change; si elige «mantener `medicos` y añadir `profesion`», se reescribe según la nota inicial de
      `design.md`. Verificar que la ADR dice «Aceptado» con fecha antes de seguir con cualquier otra tarea.
- [ ] 0.2 Comprobar el estado de las ramas con `git log` y `git branch --merged master`: si `feat/h2b-sistema-de-diseno-ui` y
      `feat/h3-fundamentos-acciones` ya están en `master`, activar la tarea 6.9 (reconciliar sus archivos); si no, anotar que se
      reconcilian al rebasar. Verificar que el resultado consta en la descripción del PR.
- [ ] 0.3 Verificar en la documentación vigente de Clerk (sin tocar la instancia): (a) vida por defecto del token de sesión y cuándo se
      renueva con el metadato nuevo; (b) si `updateUserMetadata` fusiona claves y conserva las demás; (c) si el metadato de una
      invitación pendiente se puede editar o hay que revocarla y reemitirla; (d) paginación de `getUserList`. Anotar resultado, fecha y
      enlaces en `design.md`, D5 y D6, y corregir sus `REVISAR`. Verificar que las notas existen.
- [ ] 0.4 Verificar que `node-pg-migrate` ^9 aplica cada archivo en una transacción: en un branch de desarrollo de Neon, aplicar una
      migración desechable que crea una tabla y luego falla. Verificar que la tabla no existe después y que `pgmigrations` no registra la
      migración; borrar el archivo desechable. Anotar el resultado en `design.md`, D3.
- [ ] 0.5 Confirmar con el usuario dos supuestos de `design.md`: (a) que en `auditoria` la etiqueta histórica `medico` pase a mostrarse como
      `profesional` (D4); (b) la lista de cinco profesiones. Verificar que las respuestas constan en «Preguntas abiertas» o en las decisiones.
- [ ] 0.6 Dejar escritas, sin responderlas, las preguntas abiertas que otros changes heredan (qué profesiones pueden recetar; formato y
      unicidad de la colegiatura; compatibilidad profesión–especialidad) y avisar al orquestador para que consten en `docs/BACKLOG.md` y en
      H6c. Verificar que `design.md`, «Preguntas abiertas» las contiene y que ninguna tarea las decide.

## 1. Línea base e inventario en el catálogo

- [ ] 1.1 Crear un branch de desarrollo de Neon a partir de `production` (copia de sus datos) y aplicar las migraciones existentes. Correr
      `npm run test:pgtap`, `npm run test:concurrencia` y `npm run test:integracion` contra él. Verificar que todo está en verde y anotar en el
      PR el número de pruebas por archivo (cuadro «antes» que usa 3.6).
- [ ] 1.2 Inventario real contra el catálogo del branch: consultas sobre `pg_class`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_proc`
      (nombre y `prosrc`), `pg_policies`, `pg_trigger` y `pg_enum` con el patrón `medic` (sin distinguir mayúsculas). Comparar con
      `design.md`, D1 y corregir D1 si difiere (nombres automáticos de restricciones, objetos olvidados). Verificar que la lista final de
      objetos a renombrar consta en D1 y que no queda ningún objeto del catálogo fuera de ella.
- [ ] 1.3 **Instantánea previa**: guardar, fuera del repositorio, el resultado de consultas sobre `pg_policies` (política, tabla, comando,
      roles, `qual`, `with_check`), privilegios por tabla y por columna, claves foráneas y `pg_proc` (propietario, `prosecdef`, `proconfig`,
      ACL). Documentar las consultas y el procedimiento de normalización (`medico`→`profesional` y equivalentes) en `docs/pruebas-sql.md`.
      Verificar que otra persona puede reproducir la instantánea siguiendo solo ese documento.
- [ ] 1.4 En el branch (copia de `production`) contar con agregados: perfiles por rol, filas de `medicos`, citas y atenciones. No leer filas con
      datos personales. Verificar que todas las filas de `medicos` son de profesionales que pueden quedar con profesión `medico` y anotar los
      conteos en el PR.

## 2. M1: renombre atómico del esquema

- [ ] 2.1 Crear la migración `rol-y-tabla-profesional` (un solo archivo). Cabecera: qué cambia, que `auditoria.actor_rol` y
      `auditoria.tabla` históricos cambian de etiqueta sin tocar filas (D4) y la lista de cambios intencionales. Primera sección: `set local
      lock_timeout`, `alter type rol_usuario rename value 'medico' to 'profesional'` y `rol_actual()` con la correspondencia exacta
      `medico`→`profesional` (D5). Verificar que se aplica en un branch de desarrollo, que `enum_range(null::rol_usuario)` contiene
      `profesional` y no `medico`, y que `perfiles.rol` de los perfiles antes `medico` ya es `profesional` sin ningún `UPDATE`.
- [ ] 2.2 En la misma migración, renombres de tablas (`medicos`, `asignaciones_paciente_medico`), de las siete columnas `medico_id`, de las
      restricciones e índices del inventario (D1, confirmado por 1.2). Verificar con una consulta al catálogo que ninguna tabla, columna,
      restricción ni índice del esquema `public` contiene `medic`, que las claves foráneas apuntan a las mismas columnas y que los
      privilegios de tabla y de columna no cambiaron.
- [ ] 2.3 En la misma migración, `alter function … rename` de `medico_actual()` y `medico_tiene_paciente(uuid)` y `create or replace` de los
      seis cuerpos (`rol_actual`, `profesional_actual`, `profesional_tiene_paciente`, `extender_asignacion_por_cita`,
      `validar_cancelacion`, `registrar_auditoria`) con `security definer set search_path = ''`, reafirmando `revoke … from public` y
      `grant execute … to authenticated` donde ya existían. Verificar que el diff de cada cuerpo contra el anterior muestra solo las
      sustituciones de identificadores de D8 (adjuntar los diffs al PR) y que la ACL y `proconfig` de las funciones coinciden con la
      instantánea previa.
- [ ] 2.4 En la misma migración, `alter policy … rename to` y `alter policy … using / with check` de las 21 políticas de D9, copiando
      cada expresión con solo las cuatro sustituciones de identificador. Verificar con `pg_policies` que las 21 tienen el nombre nuevo, que
      ninguna expresión contiene `medic` y que comando y roles destino son los mismos que en la instantánea previa.
- [ ] 2.5 En la misma migración, el bloque de **autocomprobación** (residuo de `medic` en nombres, expresiones de políticas, cuerpos de
      función y etiquetas de enum del esquema `public`, con la única excepción de `rol_actual()`), que lanza una excepción. Verificar de dos
      maneras: la migración completa pasa, y con un residuo deliberado (una política sin reescribir, en un branch desechable) la migración
      falla y deja el esquema intacto.
- [ ] 2.6 **Instantánea posterior y diferencia.** Con M1 aplicada en el branch, repetir las consultas de 1.3 y comparar con la previa
      normalizada. Verificar que la diferencia es vacía salvo la lista de cambios intencionales (cuerpo de `rol_actual()`, nombres, y nada
      más) y adjuntar la comparación al PR.
- [ ] 2.7 **Ensayo de atomicidad con dos sesiones** en un branch de desarrollo antes de aplicar M1: una sesión ejecuta el contenido de M1 en una
      transacción que retiene unos segundos antes de confirmar; otra, con el token de un profesional a cargo y otra con el de un paciente,
      consulta en bucle `atenciones`, `citas` y `historias_clinicas`. Verificar que cada observación es el esquema anterior completo o una
      espera seguida del esquema nuevo completo (sin errores de relación inexistente y con las mismas filas por rol) y anotar la espera
      máxima medida.
- [ ] 2.8 Revisión con el agente `code-review` de M1 (la función central de acceso, `rol_actual()` y su tolerancia, `registrar_auditoria()`, las 21
      políticas, `SECURITY DEFINER`, `search_path`, bloqueos). Verificar que cada hallazgo queda corregido o justificado por escrito en el PR.

## 3. La suite pgTAP existente, actualizada de forma mecánica

- [ ] 3.1 Actualizar `scripts/ejecutar-pgtap.ts`: identidades `profesional_a` y `profesional_b` (rol `profesional`), nuevas `profesional_c`,
      `medico_heredado` (rol `medico`) y `profesional_forjado` (claim extra `profesion`), con la función de firma admitiendo claims
      adicionales. Verificar que `01_humo` pasa con `profesional_a` y que las identidades nuevas autentican.
- [ ] 3.2 Actualizar `01`, `10`, `20`, `21`, `22`, `23`, `24` y `25` (identidades, literales de rol, `profesionales`, `colegiatura`, `profesion` en los
      `INSERT`, `profesional_actual()`; en `10`, la prueba adicional de que el token heredado también da `profesional`). Verificar que cada
      archivo pasa por separado y que su `plan(n)` es igual al anterior (salvo el +1 de `10`).
- [ ] 3.3 Actualizar `30`, `31`, `32` y `33` (`profesionales`, `profesional_id`, rol `profesional`, nombres de restricción). Verificar que cada archivo
      pasa por separado con el mismo `plan(n)`.
- [ ] 3.4 Actualizar `40`, `42`, `43`, `44`, `45`, `46` y `47` (`profesional_id`, `asignaciones_paciente_profesional`, `profesional_tiene_paciente()`,
      `profesional_actual()`; **`47`: la lista exacta de columnas con los nombres nuevos, a propósito**). Verificar que pasan por separado con el
      mismo `plan(n)` y que `41` y `99` pasan sin tocarse.
- [ ] 3.5 Actualizar `50`, `51`, `52`, `53` y `60` (renombres; en `53`, el `actor_rol` esperado `profesional` y el nombre de la tabla auditada
      de asignaciones). Verificar que pasan por separado con el mismo `plan(n)`.
- [ ] 3.6 **Control de que no se debilitó ninguna aserción**: contar, antes y después, las pruebas de cada archivo (planes y llamadas a
      `is`, `ok`, `throws_ok`, `lives_ok`, `is_empty`) y comparar. Verificar que las cantidades coinciden salvo las diferencias anotadas y que
      el diff de cada archivo contiene únicamente cambios de identificador, de literal de rol, de columnas obligatorias nuevas y de etiquetas.
- [ ] 3.7 Actualizar `tests/concurrencia/10_doble_reserva.test.ts` y `tests/integracion/sincronizar-perfil.test.ts` (`profesionales`,
      `profesional_id`, rol `profesional`, y el caso del valor heredado en `rolDesdeMetadata`). Verificar `npm run test:concurrencia` (20 rondas
      seguidas en verde) y `npm run test:integracion`.
- [ ] 3.8 Documentar en `docs/pruebas-sql.md` las identidades nuevas, el control de 3.6 y la instantánea de 1.3. Verificar que el documento no
      menciona identidades que ya no existen y que sus enlaces resuelven.
- [ ] 3.9 Correr la suite pgTAP completa contra el branch con M1 aplicada. Verificar que todo está en verde y que el total de pruebas es el
      de 1.1 más las diferencias anotadas.
- [ ] 3.10 Revisión con el agente `code-review` **del diff de las pruebas** (que ninguna negativa por rol se haya relajado, que `47` fije las
      columnas correctas) además de M1. Verificar que los hallazgos quedan resueltos o justificados.

## 4. M2: profesión, colegiatura y su protección

- [ ] 4.1 Crear la migración `profesion-y-colegiatura`: tipo `profesion_salud` (`medico`, `odontologo`, `fisioterapeuta`, `psicologo`, `podologo`);
      `profesionales.profesion` `not null` añadida con valor por defecto `medico` solo para los registros existentes y luego **sin valor por
      defecto**; `cmp`→`colegiatura` con comprobación de texto con contenido; la unicidad global pasa a `unique (profesion, colegiatura)`.
      Verificar que se aplica sobre un branch con filas existentes (quedan con `medico` y conservan su colegiatura) y que un alta sin profesión
      falla.
- [ ] 4.2 En la misma migración, sustituir el `UPDATE` de tabla de `authenticated` por `update (colegiatura, especialidad_id, activo)` y crear
      `proteger_profesional()` (`SECURITY INVOKER`, `search_path` vacío; si `current_user = 'authenticated'`: `HC010` al cambiar `profesion` o
      `perfil_id`, `HC011` al insertar sobre un perfil sin rol `profesional`) con su disparador `BEFORE INSERT OR UPDATE`. Verificar con
      `has_column_privilege` que `authenticated` no puede actualizar `profesion` ni `perfil_id` y sí las otras tres columnas, y que
      `sync_identidad`, `cron_notificaciones` y `anonymous` siguen sin privilegios sobre la tabla.
- [ ] 4.3 En la misma migración, `profesion_actual()` (`SECURITY DEFINER`, `search_path` vacío, `revoke … from public`, `grant execute … to
      authenticated`) que devuelve la profesión del profesional del perfil de la sesión o nulo, sin leer ningún claim de profesión, y el
      disparador `profesionales_auditoria` con `registrar_auditoria()`. Verificar que `profesion_actual()` no aparece como ejecutable por
      `anonymous` ni `cron_notificaciones` y que un alta y un cambio de especialidad dejan dos filas en `auditoria`.
- [ ] 4.4 Prueba pgTAP `tests/pgtap/63_profesionales.test.sql`: restricciones (cinco profesiones, profesión obligatoria, colegiatura con
      contenido y única por profesión, mismo número en otra profesión admitido, un registro por perfil); privilegios por columna;
      inmutabilidad en dos barreras (`42501` por privilegio y `HC010` por disparador tras ampliar temporalmente el `GRANT` dentro de la
      transacción de prueba); `HC011`; `profesion_actual()` por profesión y nulo para los demás roles; el **claim `profesion` falso del
      token `profesional_forjado` se ignora**; auditoría. Incluye el **caso negativo de cada rol** sobre `profesionales`: el administrativo
      registra y actualiza pero no cambia `profesion`; profesional a cargo, otro profesional, enfermera y paciente no registran ni editan
      (`42501` o cero filas) y sí leen; sin rol no lee ni escribe; `anonymous`, `cron_notificaciones` y `sync_identidad` sin privilegios
      (`has_table_privilege`); nadie borra. Verificar que pasa, que `99_rls_en_todas_las_tablas` sigue en verde y que `24` y la suite completa
      pasan.
- [ ] 4.5 Revisión con el agente `code-review` de M2 y de la prueba 63 (privilegios por columna, disparador `INVOKER`, `HC010`/`HC011`,
      `profesion_actual()` `SECURITY DEFINER`, la auditoría de `profesionales`). Verificar que los hallazgos quedan resueltos o justificados.

## 5. El claim heredado y la ausencia de residuos

- [ ] 5.1 Prueba pgTAP `tests/pgtap/64_rol_profesional_y_claim_heredado.test.sql`: `rol_actual()` con `profesional`, con `medico` (identidad
      `medico_heredado`) y con valores no reconocidos (`Medico`, `MEDICO`, `medicos`, cadena vacía, ausente) que dan sin rol; los otros
      tres roles sin transformación; acceso a atenciones, historias y antecedentes del profesional a cargo con el token heredado igual que con
      el nuevo; **caso negativo de cada rol** sobre esas tablas (otro profesional, administrativo, enfermera, paciente, sin rol, `anonymous`,
      `cron_notificaciones`, `sync_identidad`); una escritura auditada con ambos tokens deja `actor_rol = 'profesional'`. Verificar que pasa.
- [ ] 5.2 Prueba pgTAP `tests/pgtap/65_sin_residuos_del_vocabulario_anterior.test.sql`: el esquema `public` no contiene `medic` en nombres de
      tablas, columnas, funciones, políticas, restricciones, índices, disparadores ni etiquetas de enum, ni en expresiones de políticas, ni en
      cuerpos de función (excepción: `rol_actual()` mientras exista la tolerancia). Verificar que pasa y que falla si se recrea a propósito,
      dentro de la transacción de prueba, una política con el literal anterior.
- [ ] 5.3 Actualizar `docs/pruebas-sql.md` con las pruebas 63 a 65 y su finalidad. Verificar que la lista de archivos de la suite del documento
      coincide con `tests/pgtap/`.
- [ ] 5.4 Revisión con el agente `code-review` de la tolerancia del claim (pruebas 64 y 65, `rol_actual()`): que solo se asigne
      `medico`→`profesional`, que ningún valor ajeno conceda acceso y que no quede un camino de ampliación de rol. Verificar que los hallazgos
      quedan resueltos o justificados.

## 6. Aplicación y scripts

- [ ] 6.1 En `lib/auth/rol.ts`: tipo `Rol` con `profesional`, `RUTA_POR_ROL.profesional = "/profesional"` y un **normalizador único** del claim
      crudo (`medico`→`profesional`; nulo si no es uno de los cuatro), que usan `obtenerRolSesion()` y `exigirRol()`. Pruebas `node:test`
      (`tests/auth/rol.test.ts`): cada rol, el valor heredado, mayúsculas y valores desconocidos (nulo) y la ruta de cada rol. Verificar que
      pasan y que `app/page.tsx` nunca recibe un rol sin ruta.
- [ ] 6.2 Prueba `node:test` (`tests/auth/lectura-unica-del-rol.test.ts`) que recorre `app/`, `lib/` y `components/` y falla si otro archivo
      lee `publicMetadata.rol` sin pasar por el normalizador (excluye `tests/`, `scripts/` y `e2e/`). Verificar que pasa y que falla si se
      añade una lectura cruda de prueba.
- [ ] 6.3 Actualizar `types/globals.d.ts` (rol `profesional`) y `lib/identidad/sincronizar-perfil.ts` (`ROLES` y `rolDesdeMetadata`, que mapea el valor
      heredado). Verificar con `npm run typecheck` y con los casos nuevos de `tests/integracion/sincronizar-perfil.test.ts` (valor heredado,
      `profesional`, desconocido y nulo).
- [ ] 6.4 Webhook de Clerk (`app/api/webhooks/clerk/route.ts`): en `user.created` con el valor heredado, sincronizar como `profesional` y corregir
      el metadato de Clerk; el resto sin cambio. Verificar con una prueba que el metadato se corrige solo en ese caso, que `user.updated` no
      escribe en Clerk y que un `paciente` sigue sin poder obtener otro rol por autorregistro.
- [ ] 6.5 Mover `app/medico/page.tsx` a `app/profesional/page.tsx` (`exigirRol("profesional")`, MFA, título «Panel del profesional») y añadir en
      `next.config.ts` la redirección temporal `/medico/:path*` → `/profesional/:path*` (no permanente). Verificar con `npm run build` y
      `npm run lint` (la regla `@clerk/next/require-auth-protection` cubre la ruta) y con la E2E de 6.8.
- [ ] 6.6 Actualizar `scripts/invitar-personal.ts`: `profesional` entre los roles de personal, `medico` aceptado con un aviso y convertido, y sin
      ningún parámetro de profesión. Verificar con una prueba del esquema de entrada y ejecutando el script sin correo con una cuenta
      `+clerk_test` en la instancia de desarrollo (acción sobre Clerk de desarrollo: pedir OK).
- [ ] 6.7 Actualizar `scripts/sembrar-datos-demo.ts` y `scripts/comprobar-datos-demo.ts` (`profesionales`, `profesion` `medico` y `colegiatura` por
      profesional, `profesional_id`, rol `profesional`, `E2E_PROFESIONAL_*` con respaldo a `E2E_MEDICO_*`), `.env.example` y
      `docs/datos-demo.md`. Verificar en un branch de desarrollo que la siembra corre dos veces con los mismos conteos y que
      `comprobar-datos-demo.ts` pasa.
- [ ] 6.8 Actualizar `e2e/roles.spec.ts` (`AREAS` con `/profesional`; la redirección de `/medico`; un paciente que abre `/profesional` vuelve a
      `/paciente`). Verificar con `npx playwright test` contra el preview del PR (acción sobre el preview: pedir OK) o `npm run test:e2e`
      local.
- [ ] 6.9 **Condicional (0.2):** si H2b y H3 ya están en `master`, reconciliar sus archivos: `lib/auth/accion-personal.ts` (`RolPersonal`
      `administrativo | profesional`, lectura del rol por el normalizador), `lib/schemas/{agenda,cita}.ts` (`profesional_id`), `lib/ui/navegacion.ts`,
      `components/clinica/navegacion.tsx`, `lib/ui/ejemplos.ts`, `app/medico/layout.tsx` (`ConsolaLayout rol="profesional"`), `app/enfermera/page.tsx` y
      `tests/agenda/*.test.ts`. Verificar con `npm run test:agenda` (o el script vigente), `typecheck`, `lint` y `build`.
- [ ] 6.10 Ejecutar `npm run lint`, `npm run typecheck` y `npm run build`. Verificar que pasan limpios y que una búsqueda de `medico` en `app/`, `lib/`
      y `types/` solo encuentra el normalizador, la redirección y los comentarios que lo explican.
- [ ] 6.11 Revisión con el agente `code-review` de la lectura del rol, el webhook (rol heredado y corrección del metadato), la redirección y la
      protección de `/profesional`. Verificar que los hallazgos quedan resueltos o justificados.

## 7. Script de migración de usuarios de Clerk

- [ ] 7.1 Crear `scripts/migrar-rol-profesional.ts` con los modos `--dry-run` (por defecto), `--confirmar` y `--verificar` de `design.md`, D6: paginación,
      actualización de `publicMetadata.rol` fusionando claves, informe de fallos parciales con código de salida distinto de cero, listado de
      invitaciones pendientes con el rol heredado y salida con solo recuentos e identificadores de Clerk. Verificar con `--dry-run` contra la
      instancia de desarrollo de Clerk (lectura; pedir OK) que informa los recuentos esperados y no modifica nada.
- [ ] 7.2 Pruebas `node:test` con un cliente de Clerk simulado (`tests/scripts/migrar-rol-profesional.test.ts`): simulación sin escrituras;
      `--confirmar` idempotente (la segunda corrida encuentra cero); fallo parcial que no detiene a los demás; `--verificar` con error mientras quede
      alguien con `medico`; ninguna salida contiene correos ni nombres. Verificar que pasan.
- [ ] 7.3 Redactar `docs/pasos-manuales-h2c.md` con el runbook de las fases 2 y 3 (precondiciones, comandos, qué mirar, qué hacer si algo falla, cómo
      revocar y reemitir una invitación pendiente). Verificar que cada comando del documento se puede copiar y que remite a `design.md`, D5 y D6.
- [ ] 7.4 Revisión con el agente `code-review` del script (escrituras en Clerk, idempotencia, fugas de datos personales en la salida, manejo de
      fallos). Verificar que los hallazgos quedan resueltos o justificados.

## 8. Verificación por mutación y revisión previa al merge

Cada mutación se hace en un branch de desarrollo, se corre la suite y se **revierte**; se anota en el PR la mutación y la prueba que falló.

- [ ] 8.1 Mutar las políticas y funciones de acceso: (a) quitar `profesional_tiene_paciente` de la política de lectura de `atenciones`;
      (b) quitar `m.activo` de `profesional_tiene_paciente()`; (c) dejar una política (p. ej. la de `historias_clinicas`) con el literal `'medico'`;
      (d) hacer que `extender_asignacion_por_cita()` no inserte; (e) quitar de `validar_cancelacion()` la excepción por bloqueo. Verificar que al menos
      una prueba negativa o de regla falla por cada una (43/45, 42, 43 y 65, 42, 31 respectivamente).
- [ ] 8.2 Mutar la tolerancia del claim: (a) mapear cualquier valor desconocido a `profesional`; (b) comparar sin distinguir mayúsculas; (c) dejar
      `'medico'` en la lista de `registrar_auditoria()`. Verificar que 64 falla en (a) y (b) y que 64 o 53 fallan en (c).
- [ ] 8.3 Mutar la profesión: (a) ampliar el `GRANT` de actualización a todas las columnas; (b) quitar `proteger_profesional()` con el `GRANT` ampliado
      en la prueba; (c) quitar la comprobación `HC011`; (d) hacer que `profesion_actual()` lea el claim del token; (e) quitar `to authenticated` de
      la política de lectura de `profesionales` o añadir un rol de más; (f) quitar `profesionales_auditoria`. Verificar que 63 falla en cada caso.
- [ ] 8.4 Mutar el alcance de la migración: dejar una tabla o columna con el nombre anterior en una copia de M1. Verificar que la autocomprobación
      (2.5) revierte la migración y que 65 falla si el residuo llegara a aplicarse.
- [ ] 8.5 Revisión previa al merge con el agente `code-review` sobre **todo** el diff de los grupos 2 a 7 con el checklist más estricto
      (RLS, `SECURITY DEFINER`, migraciones, claims, webhook, script de Clerk). Verificar que no quedan hallazgos abiertos sin justificación escrita y
      que el resultado se enlaza en el PR para la revisión humana aparte que exige el proposal.

## 9. Despliegue por fases (fases 1 y 2)

- [ ] 9.1 Abrir el PR. Verificar que el branch efímero (copia de `production`) aplica M1 y M2, que corren y pasan pgTAP, concurrencia e integración, que
      `ci.yml` pasa y que el PR trae: la comparación de instantáneas (2.6), el control de 3.6, el ensayo de 2.7, el cuadro de mutaciones (grupo 8) y el
      cuadro requisito→prueba (11.5). El PR declara que **no entra en producción con datos reales** y que depende de la ADR-0030 aceptada.
- [ ] 9.2 **Fase 1 (merge a `master`).** Esperar a `migrar-produccion.yml` y al despliegue de Vercel. Verificar: el workflow terminó en verde; el despliegue
      de producción está `READY`; `select enum_range(null::public.rol_usuario)` incluye `profesional`; los conteos agregados de `perfiles` por rol y de
      `profesionales` coinciden con los de 1.4; `/api/db-sesion` con una cuenta de prueba devuelve el rol esperado. **No se pasa a 9.3 hasta que ambas cosas
      estén confirmadas.**
- [ ] 9.3 **Fase 2.** Con el despliegue nuevo `READY` y M1 aplicada: `node --env-file=.env.local scripts/migrar-rol-profesional.ts` (`--dry-run`), revisar recuentos,
      `--confirmar` y `--verificar` (acciones sobre Clerk: pedir OK explícito). Verificar que `--verificar` termina en cero usuarios con `medico`, que
      `perfiles.rol = 'profesional'` coincide por conteo y que las invitaciones pendientes con el valor heredado, si hay, fueron revocadas y reemitidas.
- [ ] 9.4 Comprobación manual con cuentas de prueba: un profesional con una sesión abierta antes de 9.3 sigue entrando, una nueva sesión lo dirige a
      `/profesional`, `/medico` redirige, y un paciente que abre `/profesional` vuelve a su portal. Marcar en `docs/pasos-manuales-h2c.md` cada paso con la
      fecha. Verificar que las cuatro comprobaciones constan.
- [ ] 9.5 Documentar en `docs/pasos-manuales-h2c.md` la fecha de 9.2 y de 9.3, y el instante a partir del cual puede empezar el grupo 10 (más que la vida del
      token de Clerk). Verificar que el documento contiene las fechas y la condición.

## 10. Cierre de la transición (fase 3, PR aparte)

No empezar hasta que 9.3 y 9.4 estén verificadas y haya pasado más tiempo que la vida del token de sesión.

- [ ] 10.1 Precondiciones: `scripts/migrar-rol-profesional.ts --verificar` en cero (usuarios e invitaciones) el mismo día. Verificar que el resultado consta
      en el PR; si no es cero, repetir 9.3 y no continuar.
- [ ] 10.2 Crear la migración `retirar-tolerancia-rol-medico`: `create or replace` de `rol_actual()` sin la correspondencia (devuelve el claim tal cual).
      Verificar que se aplica en un branch de desarrollo y que `65` ya no necesita la excepción de `rol_actual()`.
- [ ] 10.3 Actualizar **a propósito** la prueba `64`: un token con `medico` ya no concede nada (caso negativo, y 10 en `10_fundamentos` pasa a afirmar nulo) y
      quitar la identidad `medico_heredado` o dejarla solo para ese caso negativo. Verificar que la suite completa pasa.
- [ ] 10.4 Retirar del código el valor heredado: normalizador, `rolDesdeMetadata`, alias de `scripts/invitar-personal.ts`, respaldo `E2E_MEDICO_*`, redirección
      `/medico` y la corrección del metadato en el webhook. Verificar con `typecheck`, `lint`, `build`, `node:test` y E2E, y que una búsqueda de `medico` en `app/`,
      `lib/`, `types/` y `scripts/` no encuentra nada fuera de comentarios históricos.
- [ ] 10.5 Verificación por mutación de M3: dejar el mapeo en `rol_actual()` y comprobar que 64 falla. Verificar y anotar en el PR.
- [ ] 10.6 Revisión con el agente `code-review` de M3 y del retiro. Verificar que los hallazgos quedan resueltos o justificados.
- [ ] 10.7 Tras el merge y el despliegue, comprobar que una cuenta con `profesional` entra y que la base trata `medico` como sin rol (prueba 64 en el branch y
      `/api/db-sesion` con una cuenta de prueba). Verificar y anotarlo en `docs/pasos-manuales-h2c.md`.

## 11. Coherencia documental y cierre

- [ ] 11.1 Actualizar `docs/TECH-DESIGN.md` con el modelo vigente: el tipo `rol_usuario`, `profesionales` (`profesion`, `colegiatura`), `profesion_actual()`, las
      columnas `profesional_id`, `asignaciones_paciente_profesional`, las funciones y políticas con sus nombres nuevos, la tabla de rutas (`/profesional`), la fila H2c del plan y
      las pruebas 63 a 65. Verificar con una búsqueda que ya no quedan `medicos`, `medico_id`, `medico_actual()` ni `medico_tiene_paciente()` fuera de las notas históricas.
- [ ] 11.2 Añadir una nota fechada, sin tocar la decisión, en las ADR-0003, 0015, 0016, 0022 y 0023 (los nombres que usan cambiaron por la ADR-0030) y registrar en la ADR-0030 el
      enlace a este change cuando el usuario la acepte. Verificar que cada nota enlaza al change y que los enlaces relativos resuelven.
- [ ] 11.3 Actualizar `docs/datos-demo.md`, `docs/pruebas-e2e.md`, `docs/verificacion-h1.md` (nota histórica: las áreas y el rol se llaman ahora `profesional`) y
      `.env.example`. Verificar que ningún documento contradice a otro sobre el nombre del rol y de la ruta.
- [ ] 11.4 Entregar al orquestador el texto de las notas de impacto para los changes existentes (`design.md`, D12) y para `CLAUDE.md` (sección «Estado actual») y
      `openspec/config.yaml` (hitos), que son suyos. Verificar que la lista de D12 coincide con los archivos de esos changes y que ninguno quedó con una referencia a
      `medico_tiene_paciente()` como función vigente sin nota.
- [ ] 11.5 **Cuadro requisito→prueba** en el PR para los requisitos de `rol-profesional`, `profesion-del-profesional` y `autenticacion-roles` (63, 64, 65, `node:test`,
      E2E o verificación manual, según el caso). Verificar que cada requisito y cada caso negativo por rol tiene al menos una prueba que falla si se rompe.
- [ ] 11.6 Revisión final con el agente `code-review` sobre **todo** el diff del change (RLS, migraciones, claims, webhook, script de Clerk, pruebas). Verificar que no
      quedan hallazgos abiertos sin justificación escrita; el resultado se enlaza en el PR.
- [ ] 11.7 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:pgtap`, `npm run test:concurrencia`, `npm run test:integracion`,
      las pruebas `node:test` y la suite E2E. Verificar que todo pasa; y archivar el change (`/opsx:archive`) solo después del grupo 10, sincronizando las
      especificaciones (el «Purpose» de `autenticacion-roles` se corrige a mano) y comprobando que no contradicen `CLAUDE.md` ni las ADR vigentes.
