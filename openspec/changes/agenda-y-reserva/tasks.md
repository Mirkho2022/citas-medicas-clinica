# Tasks

Convenciones de todo el change (de `openspec/config.yaml`): las migraciones son archivos **nuevos** en `migrations/*.sql`
(`npm run migrate create <nombre>`), solo hacia adelante y con la sección `down` vacía; nunca se edita una migración ya
aplicada. **Este change no crea tablas**; aun así, cada función, disparador y la vista nuevas llevan su prueba pgTAP negativa
por rol (`administrativo`, `medico_a`, `medico_b`, `enfermera`, `paciente_a`, `paciente_b`, `sin_rol`) y
`99_rls_en_todas_las_tablas` debe seguir en verde. Las pruebas pgTAP viven en `tests/pgtap/NN_<área>.test.sql` (34 a 39 y 61,
libres), no asumen tablas vacías y usan identificadores propios. Los datos de prueba son sintéticos (DNI `99…`/`74…`, correos
`@demo.invalid`); nunca contra `production`. Cada grupo deja sus pruebas y su documentación; el último solo integra. H3
empieza cuando H2b está aplicado.

## 1. Punto de partida y comprobaciones previas

- [x] 1.1 Comprobar que H2b está aplicado: existen `components/clinica/` con `TablaAgenda`, `SelectorHorario`,
      `InsigniaEstado`, `TarjetaCita`, `Alerta`, `Campo` y `CampoDocumento`, `lib/ui/formato.ts`, `lib/ui/navegacion.ts` y
      `ConsolaLayout`. Verificar con `ls` y `npm run typecheck`; si falta algo, detenerse y avisar al usuario en vez de
      reinventar los componentes.
- [x] 1.2 Buscar solapes ya existentes en `disponibilidades` (misma tupla médico, día de semana, tramo horario y vigencia que
      se cruzan) con una consulta de solo lectura, en el branch con datos de demostración y en producción. Verificar que
      devuelve cero filas y dejar la consulta y su resultado en la descripción del PR; si devuelve filas, parar y consultar al
      usuario (corregir datos es una acción explícita, no parte de la migración).
      Resultado (2026-10-18, solo lectura): la consulta de solapes (`a.id < b.id` con mismo médico, mismo día de la semana,
      `tsrange` de horas que se cruzan y `daterange` de vigencias que se cruzan) devolvió **0 solapes** en el branch `h3/pruebas`
      (hijo de `dev`) y en `production`; ambos tienen **0 filas** en `disponibilidades` (la siembra de demostración aún no se
      aplicó a `dev` ni a producción, así que la restricción nueva no puede fallar al migrar). Pendiente: copiar la consulta y este
      resultado a la descripción del PR.
- [x] 1.3 Revisar con el usuario las preguntas abiertas de `design.md` que condicionan pantallas (1, 2 y 3: cita `reservada`
      vencida sin confirmar, horizonte de sustitutos y baja sin fecha de término) y anotar las respuestas en `design.md` antes
      del grupo 11. Verificar que cada pregunta queda con respuesta o con el valor por defecto aceptado por escrito.
      Resultado (2026-10-20): la pregunta 1 (reservada vencida) la respondió el cliente: se cierra sola como «No asistió», sin cron (D13). El cliente
      aceptó los valores por defecto de la 2 (horizonte de sustitutos: mismo día primero y hasta 7 días) y de la 3 (baja sin fecha de término: la
      pantalla exige fecha de fin; la base ya admite el rango abierto y la vista de citas por reasignar lo trata como vigente). Quedan anotados en
      `design.md`, «Open Questions».
- [x] 1.4 Verificar con un script descartable (sin commitear) contra un branch de desarrollo que el driver HTTP de Neon entrega
      `code` en el error de una violación `23P01`, de un `raise exception … using errcode = 'UC001'` y de un `40P01`
      simulado en PL/pgSQL, y si expone `constraint`. Verificar anotando los tres resultados en el PR; el traductor de errores
      (7.1) se escribe sobre lo que el driver realmente devuelve.
      Resultado (2026-10-10, branch `dev` de Neon, driver HTTP `@neondatabase/serverless`; script descartable, no commiteado): el
      driver lanza `NeonDbError` con `code` en los tres casos, con una sentencia y dentro de `sql.transaction`. `23P01` (violación
      real de un `EXCLUDE` en una tabla temporal): `code` y `constraint` con el nombre de la restricción. `UC001` a `UC004`
      (`raise exception … using errcode`): `code` y **sin** `constraint` (solo llega si la excepción pasa `using constraint`).
      `40P01`: simulado con `raise` (solo `code`) y también real (dos transacciones con *advisory locks* cruzados): `code`
      `40P01`, mensaje `deadlock detected`. `message` trae el texto de Postgres: nunca se reenvía. El traductor (7.1) decide solo
      por `code` y contexto. Pendiente: copiar estos resultados a la descripción del PR.

## 2. Migración 1: disponibilidades sin solape, vigencia en Lima y auditoría de bloqueos

- [x] 2.1 Crear la migración `disponibilidad-sin-solape-y-auditoria-de-bloqueos`: restricción `EXCLUDE`
      `disponibilidades_sin_solape` (médico, día de semana, tramo horario y vigencia como rangos), `vigente_desde` con valor
      por defecto `public.hoy_lima()` y disparador `bloqueos_auditoria` con `registrar_auditoria()`. Verificar con
      `npm run migrate up` en un branch de desarrollo con datos de demostración (sin errores) y con `\d disponibilidades`.
- [x] 2.2 Escribir `tests/pgtap/34_disponibilidad_solape.test.sql`: tramos solapados el mismo día fallan con `23P01`, contiguos
      pasan, otro día u otro médico pasan, vigencias disjuntas pasan, el valor por defecto de `vigente_desde` es la fecha de
      Lima (con `now()` a las 02:00 UTC), y los bloqueos crean, modifican y borran dejando fila en `auditoria` con el actor
      administrativo; negativos: paciente, médico, enfermera y sesión sin rol no escriben `disponibilidades` ni
      `bloqueos_agenda`, y paciente y enfermera no leen bloqueos. Verificar con `node scripts/ejecutar-pgtap.ts 34` y que una
      mutación temporal (quitar `dia_semana with =`) hace fallar al menos una.
      Resultado: 32 pruebas, 0 fallos; con la restricción mutada (sin `dia_semana`) fallan 5 (otro día, las dos de `vigente_desde`
      y su conteo, y la de integridad de las disponibilidades). Nota: `now()` es fijo en la transacción y no puede moverse a las 02:00
      UTC; el valor por defecto se prueba con la sesión en UTC+14 y en UTC-11 (que siempre difieren en un día), de modo que
      `current_date` no puede coincidir con la fecha de Lima en ambas.

## 3. Migración 2: cálculo de slots

- [x] 3.1 Crear la migración `slots-disponibles` con `slots_agenda` (interna, `EXECUTE` revocado a todos),
      `slots_disponibles(médico, fecha)` y `horario_en_agenda(médico, inicio, fin)`: `SECURITY DEFINER`, `search_path` vacío,
      nombres calificados, médico activo, guarda de rol (`administrativo` y `paciente`; vacío o `false` para los demás), solo
      `(inicio, fin)` en la salida, `EXECUTE` a `authenticated` únicamente. Verificar con `migrate up` y con
      `select proconfig, prosecdef from pg_proc where proname in (…)`: las tres con `search_path=""` y `prosecdef` verdadero.
- [x] 3.2 Escribir `tests/pgtap/35_slots.test.sql` con todos los escenarios de `disponibilidad-y-slots`: seis slots de 08:00 a
      10:00; tramo no múltiplo (último a las 09:20); cita vigente oculta y cancelada libera; bloqueo parcial oculta tres slots;
      pasados no se ofrecen; sin disponibilidad y fuera de vigencia; médico inactivo; tramo 18:00–20:00 de Lima consultado con
      la sesión en `UTC` y en `Asia/Tokyo`; `horario_en_agenda` exacto sí y fuera de malla, duración distinta o dentro de
      bloqueo no. Negativos de RLS: un `paciente_a` consulta un slot ocupado por la cita de `paciente_b` (no aparece) y luego
      `select` directo sobre `citas` ajenas y `bloqueos_agenda` (cero filas); `medico_a`, `enfermera` y `sin_rol` reciben
      vacío; la función no devuelve más columnas que `inicio` y `fin` (`columns_are`/`function_returns`). Verificar con
      `node scripts/ejecutar-pgtap.ts 35` y por mutación: quitar `security definer` hace fallar la prueba del slot ocupado por
      otro paciente.
- [x] 3.3 Medir el rendimiento: sembrar en un branch de desarrollo un volumen sintético (p. ej. 50 médicos y 100 000 citas) y
      ejecutar `explain (analyze, buffers)` de `slots_disponibles` para un día. Verificar que usa `citas_medico_inicio_idx` o
      el GiST y que el tiempo está muy por debajo de 500 ms (p95 de TECH-DESIGN); anotar el plan y el tiempo en el PR.
      Resultado (2026-10-18, branch `h3/pruebas`, 50 médicos con lunes a viernes 08:00-18:00 y 100 000 citas sintéticas, 75 % de
      ocupación): 200 consultas de `slots_disponibles` como administrativo dan **p50 0,7 ms, p95 1,1 ms** en el servidor
      (`EXPLAIN ANALYZE`; máximo 70-90 ms en la primera) y ~110 ms con la red desde esta máquina. El anti-join contra `citas` usa
      un `Index Only Scan using citas_sin_cruce_medico` (el GiST del `EXCLUDE`), con 0 *heap fetches*; la ejecución completa de un
      día es de ~3 ms. Los datos sintéticos se borraron al terminar. Pendiente: copiar el plan y el tiempo a la descripción del PR.

## 4. Migración 3: reservar y reprogramar en la base de datos

- [x] 4.1 Crear la migración `reservar-y-reprogramar-cita` con `reservar_cita` y `reprogramar_cita` (PL/pgSQL, `SECURITY
      INVOKER`, `search_path` vacío, `EXECUTE` a `authenticated`, revocado a `public`): guarda de rol, `inicio > now()`,
      `horario_en_agenda`, errores propios `UC001` y `UC002` (nunca `P0001`), cancelar antes de insertar, `select … for update`
      de la original, cita nueva `reservada` con `reprogramada_de`, `origen` por rol y `creada_por = perfil_actual()`.
      Verificar con `migrate up` y consultando `pg_proc` (`prosecdef` falso, `search_path=""`).
- [x] 4.2 Escribir `tests/pgtap/36_reservar_cita.test.sql`: reserva del administrativo (origen `administrativo`, `reservada`,
      `creada_por`) y del paciente (origen `portal`); horario pasado, fuera de malla, dentro de bloqueo y médico inactivo fallan
      con `UC001`; segunda reserva del mismo médico y del mismo paciente con otro médico fallan con `23P01`; una cancelada
      libera el horario. Negativos: paciente a nombre de otro paciente, `medico_a`, `enfermera` y `sin_rol` fallan con `42501`
      y no dejan citas. Verificar con `node scripts/ejecutar-pgtap.ts 36`.
- [x] 4.3 Escribir `tests/pgtap/37_reprogramar_cita.test.sql`: éxito (original `cancelada` con `cancelada_por`, nueva `reservada`
      con `reprogramada_de`, nueva no hereda `confirmada` y no crea asignación); nuevo horario ocupado deja la original
      vigente; nuevo horario inválido deja la original vigente; original a 30 minutos falla con `P0001` sin cita nueva; original
      cubierta por bloqueo sí se reprograma; cita cancelada o inexistente falla con `UC002`; mover a un horario contiguo del
      mismo paciente funciona (cancelar antes de insertar). Negativos: paciente, médico, enfermera y sin rol fallan con `42501`.
      Verificar con `node scripts/ejecutar-pgtap.ts 37`.
- [x] 4.4 Crear el ayudante `tests/concurrencia/_sesion.ts` (par Ed25519 efímero, token por cliente con `sub` y
      `publicMetadata.rol`, conexión directa con `pg_session_jwt.jwk`, `auth.jwt_session_init` y `set role authenticated`) y
      `tests/concurrencia/20_reservar_cita_funcion.test.ts`: 20 rondas de 5 administrativos llamando a `reservar_cita` sobre el
      mismo horario confirman exactamente una cita y los demás reciben `23P01` o `40P01`; dos reprogramaciones simultáneas de la
      misma cita dejan una sola cita nueva y la otra recibe `UC002`. Las filas de prueba se limpian al empezar y al terminar.
      Verificar con `npm run test:concurrencia`, y que el helper se niega a correr si el destino es producción.
- [x] 4.5 Documentar en `docs/pruebas-sql.md` el helper `_sesion.ts`, los archivos 34 a 37 y cómo correr una sola prueba.
      Verificar que los comandos del documento corren tal como están escritos.

## 5. Migración 4: reasignación por baja

- [x] 5.1 Crear la migración `reasignacion-por-baja` con `reasignar_cita_por_baja` y `propuestas_reasignacion` (`SECURITY
      INVOKER`, solo administrativo, slots calculados una vez por médico y fecha, sin horarios que choquen con otra cita del
      paciente) y la vista `citas_por_reasignar` (`security_invoker = true`, `GRANT SELECT` solo a `authenticated`), error `UC003`.
      Verificar con `migrate up` y `select reloptions from pg_class where relname = 'citas_por_reasignar'`.
- [x] 5.2 Escribir `tests/pgtap/38_reasignacion_baja.test.sql`: reasignación dentro de la hora previa con bloqueo (la original
      `cancelada`, la nueva `reservada` con `reprogramada_de`); propuestas: mismo horario primero, más cercano después, otra
      especialidad, médico inactivo y médico con bloqueo excluidos, horario que choca con otra cita del paciente excluido, y
      proponer no cambia ninguna cita; `UC003` con bloqueo de otro médico, bloqueo que no cubre, sustituto de otra
      especialidad, inactivo o el mismo médico; el sustituto no obtiene filas de `atenciones` ni `antecedentes` del paciente
      (negativo de historia clínica) y no se crean ni modifican `asignaciones_paciente_medico`. Negativos: paciente, médico,
      enfermera y sin rol fallan con `42501`. Verificar con `node scripts/ejecutar-pgtap.ts 38`.
- [x] 5.3 Escribir `tests/pgtap/39_citas_por_reasignar_rls.test.sql`: el administrativo ve las vigentes cubiertas por un
      bloqueo; no aparecen canceladas, atendidas ni de otro médico; `medico_a` ve solo las suyas; `paciente_a`, `enfermera` y
      `sin_rol` ven cero filas (incluso de sus propias citas); la cita sale de la vista al acortar el bloqueo, al reprogramarla
      o cancelarla. Verificar con `node scripts/ejecutar-pgtap.ts 39` y ejecutando toda la suite (`npm run test:pgtap`) con
      `99_rls_en_todas_las_tablas` en verde.
- [x] 5.4 Ampliar `scripts/sembrar-datos-demo.ts` (idempotente, sin desactivar triggers) con un segundo médico de Medicina
      general (`CMP-DEMO-005`, perfil `mock_`) y su disponibilidad de lunes a viernes, para que exista un sustituto de la misma
      especialidad; actualizar `docs/datos-demo.md` (conteos y nota). Verificar ejecutándolo dos veces en un branch de
      desarrollo con los mismos conteos, y `node scripts/comprobar-datos-demo.ts` y la suite pgTAP completa en verde.
      Resultado: dos ejecuciones dan los mismos conteos (5 médicos, 25 disponibilidades, 14 citas…); el comprobador pasa y la suite
      completa da 680 pruebas, 0 fallos con los datos sembrados. Nota: sin `CLERK_SECRET_KEY` el paciente 99000001 queda sin
      perfil y el comprobador falla al buscarlo; en el branch descartable se vinculó a mano un perfil `mock_paciente_1` (con las
      cuentas reales de `dev` no hace falta).
- [x] 5.5 Medir `propuestas_reasignacion` en un branch con un bloqueo de 2 semanas sobre un médico con ~80 citas y 3
      sustitutos. Verificar con `explain (analyze)` que responde en una sola ronda y por debajo de 500 ms; si no, ajustar `días`
      o `máx` por defecto y anotarlo en `design.md`.
      Resultado: con un bloqueo de 2 semanas sobre un médico con 204 citas vigentes (más que las ~80 del caso) y 3 sustitutos, la
      primera versión tardaba ~2,3 s (comprobaba el choque con las citas del paciente para cientos de candidatos por cita). Se
      reescribió para ordenar los candidatos y descartar los que chocan *después*, hasta reunir `máx` (y con los CTE
      `MATERIALIZED` para calcular los slots una vez por médico y fecha): **~82 ms** para las mismas 612 propuestas, en una sola
      llamada. `días` (7) y `máx` (3) no cambian. Anotado en `design.md`, D9.

## 6. Migración 5: ciclo de estados de la cita (decisión del cliente)

- [x] 6.1 Crear la migración `transiciones-de-estado-de-cita` con `validar_transicion_estado()` y su disparador
      `citas_validar_transicion` (`BEFORE INSERT OR UPDATE OF estado`, `SECURITY INVOKER`, `search_path` vacío, actúa solo si
      `current_user = 'authenticated'`) con la matriz de `design.md`, D13, y `marcar_cita_atendida(cita uuid)` (`SECURITY
      DEFINER`, `search_path` vacío, `EXECUTE` solo a `authenticated`, revocado a `public`, solo fija `estado`), con errores
      `UC002`, `UC004` y `42501`. Verificar con `migrate up` en un branch de desarrollo con datos de demostración, con
      `pg_proc` (`prosecdef` verdadero solo en `marcar_cita_atendida`, `search_path=""` en ambas), `pg_trigger` (el disparador
      existe y es posterior a `citas_validar_cancelacion` en orden) y `npm run test:pgtap` completo sin romper ninguna prueba de
      H2; si una choca, informar al usuario en vez de editarla.
      Resultado (branch `h3/pruebas`): migración aplicada; `marcar_cita_atendida` es DEFINER y `validar_transicion_estado` INVOKER, ambas con
      `search_path=""`; `citas_validar_transicion` es BEFORE y va después de `citas_validar_cancelacion`; la suite completa (680 pruebas)
      sigue en verde: **ninguna prueba de H2 chocó** y no se editó ninguna.
- [x] 6.2 Escribir `tests/pgtap/61_transiciones_de_cita.test.sql`. Positivos: el administrativo confirma una cita futura
      (queda la asignación vigente del ADR-0016 y el médico dueño pasa a ver las atenciones del paciente; antes de confirmar,
      no); confirmar una ya confirmada es idempotente y no duplica la asignación; marca «No asistió» una `confirmada` ya
      empezada; el médico dueño marca «Atendida» una `confirmada` ya empezada y solo cambia `estado` (comparando el resto de
      columnas) con la auditoría mostrando rol `medico`; el dueño de la base inserta y actualiza estados históricos. Negativos:
      confirmar una cita que ya terminó, una `cancelada`, una `atendida` o una `no_asistio` falla con `UC004`; «No asistió» antes
      de la hora, sobre una `reservada` o sobre una `atendida` falla con `UC004`; `reservada → atendida`, `confirmada →
      reservada` y cambiar un estado final fallan; un administrativo que inserta una cita ya `confirmada` o `atendida` falla;
      el administrativo no puede `atendida` ni por `UPDATE` directo (`42501`) ni por la función (`42501`); `medico_b` sobre una cita
      de `medico_a` recibe `UC002`; enfermera, `paciente_a` y `sin_rol` reciben `42501` en la función y no cambian nada con
      `UPDATE` directo (incluso con una política temporal que se lo permita); un médico con `activo = false` recibe `42501`; una
      `reservada` o una cita futura reciben `UC004`; el `UPDATE` directo del médico dueño no cambia ninguna fila. Verificar con
      `node scripts/ejecutar-pgtap.ts 61` y por mutación: quitar `medico_id = medico_actual()` de la función hace fallar la prueba
      de `medico_b`, y quitar `now() < fin` de la confirmación hace fallar la de la cita terminada.
      Resultado: 56 pruebas, 0 fallos. Mutaciones: sin `medico_id = v_medico` en `marcar_cita_atendida` falla la de `medico_b` (34); sin
      `now() >= old.fin` fallan «confirmar una cita que ya terminó» (17) y «alargar el fin en el mismo UPDATE» (33). Ambas restauradas.
- [x] 6.3 Completar `docs/pruebas-sql.md` con los archivos 38, 39 y 61, la matriz de transiciones y la nota de que el disparador
      no actúa sobre el dueño de la base. Verificar que los comandos del documento corren tal como están escritos.
- [x] 6.4 Revisar el SQL de las cinco migraciones con el agente `code-review` (funciones `SECURITY DEFINER`, `search_path`,
      `EXECUTE`, guardas de rol, vista `security_invoker`, orden cancelar-antes-de-insertar, disparador de transiciones y
      acceso a historias clínicas vía confirmación). Verificar que no quedan hallazgos críticos abiertos y que los corregidos
      tienen su prueba pgTAP.
      Avance (marcada el 2026-10-20: los cuatro hallazgos están corregidos con su prueba pgTAP): revisión de solo lectura con el agente `code-review`
      (2026-10-18; no ejecutó pgTAP). **Sin hallazgos críticos:** no hay filtración de historias clínicas ni función `SECURITY DEFINER`
      mal acotada (`search_path` vacío, `EXECUTE` solo a `authenticated`, la interna a nadie); las funciones `INVOKER` verifican
      `rol_actual()` antes de sondear citas; la vista `citas_por_reasignar` es `security_invoker` y no une `pacientes`; reprogramar
      cancela antes de insertar y se revierte entera; `atendida` solo se alcanza por `marcar_cita_atendida`; confirmar no concede
      acceso por reprogramar ni reasignar; `UC002` no distingue una cita ajena de una inexistente. **Abiertos:**
      (1) MEDIA, reproducida en `h3/pruebas`: la ventana de 1 h solo se valida en `UPDATE OF estado` y `authenticated` tiene `UPDATE` de
      tabla completa, así que el administrativo puede mover `inicio`/`fin` de una cita que empieza en 50 minutos con un `UPDATE` y luego
      cancelarla con otro (la ventana se mide contra el `inicio` ya movido), o mover `fin` hacia adelante y confirmar una cita
      terminada, lo que concede acceso a la historia de forma retroactiva (D13 lo quiere evitar con `now() < fin`); y un paciente
      puede `INSERT` directo una cita de 400 días fuera de la malla (la RLS solo mira `paciente_id`, `origen` e `inicio > now()`; el
      `EXCLUDE` solo protege contra solapes). Hoy ninguna acción de la aplicación lo hace (solo SQL directo); H4 añadirá la política de
      `UPDATE` del paciente y lo volvería alcanzable. **No se corrigió** porque cualquier arreglo choca con pruebas de H2 que fijan el
      comportamiento actual (`31_cancelacion` líneas 85–98: mover y cancelar en el mismo `UPDATE` espera `P0001` y un `UPDATE` de otra
      columna debe pasar; `32_citas_rls` inserta citas como `authenticated` en horarios fuera de malla) y la regla es informar en vez
      de editarlas. Propuesta para decidir: un disparador `BEFORE UPDATE` (también para el administrativo) que rechace cambios fuera
      de `estado`, `cancelada_en` y `cancelada_por`, y una comprobación `BEFORE INSERT` con `horario_en_agenda`; encaja con
      `citas_proteger_columnas_paciente` de H4 (D4), que quedaría subsumido.
      **(1) corregido (2026-10-18)** con la migración `1792342500000_proteger-columnas-y-malla-de-citas`, aceptada la propuesta por el usuario:
      `citas_proteger_columnas` (`BEFORE UPDATE`, `SECURITY INVOKER`, solo actúa sobre `authenticated`) rechaza con `42501` todo `UPDATE` que cambie
      algo distinto de `estado` (`cancelada_en` y `cancelada_por` solo cambian en el `UPDATE` que cancela, que es cuando `validar_cancelacion` los
      fija), y `citas_validar_horario` (`BEFORE INSERT`) exige una hora futura que sea un hueco exacto de la agenda (`horario_en_agenda`, `UC001`) y
      da `42501` a los roles que no crean citas (un `BEFORE INSERT` corre antes que el `WITH CHECK` de la RLS; sin esa guarda, un médico recibiría
      «horario no disponible»). La comparación es de la fila entera menos `estado`, `cancelada_en`, `cancelada_por` y `rango` (generada), no una lista
      de columnas: una columna que se añada a `citas` queda protegida por defecto (con prueba). Prueba nueva `62_proteger_citas` (53) y ajustes a
      `32_citas_rls` y `61_transiciones_de_cita`: sus datos necesitaban
      una malla; la prueba del «pasado» apaga el disparador nuevo para seguir probando la política sola; y alargar `fin` ahora da `42501` (antes
      `UC004`; se conserva una prueba de que sin la barrera nueva también se rechaza). pgTAP completo: 792 pruebas, 0 fallos (antes 738); agenda 179,
      integración 44 y concurrencia 10, en verde. Mutaciones (cambios temporales sobre el branch de pruebas, restaurados): quitar la comparación de
      `creada_en` o de `inicio`, la regla de `cancelada_*` (dos variantes), la guarda del dueño, el chequeo del pasado, `horario_en_agenda` o la guarda
      de rol hacen fallar la 62 en la prueba que corresponde; dos mutantes que sobrevivieron a la primera versión de la prueba (confirmar fijando
      `cancelada_por`, y el «pasado» que solo pasaba por caer en domingo) llevaron a añadir esas pruebas. Subsume `citas_proteger_columnas_paciente`
      de H4 (ver portal-del-paciente D4 y 2.4).
      (2) MEDIA-BAJA, **corregido (ver abajo)**: un bloqueo sin fecha de fin (`tstzrange(x, null)`) hace que `citas_por_reasignar` no devuelva ninguna cita
      (`upper(b.rango) > now()` es nulo), aunque `validar_cancelacion` sí le aplica la excepción; solo la Zod exige el fin. Arreglo:
      `CHECK (not upper_inf(rango))` en `bloqueos_agenda` o `upper_inf(b.rango) or …` en la vista.
      (3) BAJA-MEDIA, **corregido (ver abajo)**: `propuestas_reasignacion` ordena por cita pero sin desempate por candidato; no garantiza que el «mismo horario» vaya
      primero con muchas citas en orden físico desordenado (la prueba 38 usa 3 citas ya ordenadas). Arreglo: `row_number()` dentro del
      lateral y `order by a.inicio, a.cita_id, t.orden`.
      (4) BAJA, **corregido (ver 6.5)**: una cita `reservada` cuya hora pasó no tiene salida (`reservada → no_asistio` no existe) y el médico
      conserva la lectura de `pacientes` mientras siga vigente; dependía de la pregunta abierta 1 de design.md, que el cliente respondió el 2026-10-20.
      **(2) y (3) corregidos (2026-10-20)** con la migración `1792343400000_ajustes-de-reasignacion` y la prueba `63_ajustes_de_reasignacion` (4 pruebas):
      (2) la vista `citas_por_reasignar` filtra `upper_inf(b.rango) or upper(b.rango) > now()`, así que una baja sin fecha de regreso sí devuelve las citas
      futuras del médico (se eligió la vista y no un `CHECK (not upper_inf(rango))`: la base admite hoy el rango abierto, la Zod pide el fin solo en la
      pantalla, y un `CHECK` obligaría a validar filas existentes y a prohibir una baja indefinida). (3) `propuestas_reasignacion` numera cada candidato con
      `row_number() over ()` sobre el flujo ya ordenado y filtrado (antes del `LIMIT`) y la salida ordena por `a.inicio, a.cita_id, t.orden`; el defecto era
      real y se reprodujo en el branch `h3/pruebas` con cinco citas insertadas en orden inverso: dentro de cada cita las propuestas salían desordenadas
      (`08:20>08:40, 08:20>08:00, 08:20>08:20*`), no solo «dependía del plan». La prueba 63 falla sobre la migración anterior (1, 2 y 4) y pasa con la nueva.
      pgTAP completo 796 pruebas, 0 fallos tras (2) y (3); agenda 206, integración 61 y concurrencia 10, en verde.
      Notas: el paciente puede distinguir «ausencia» de «cita ocupada» combinando `horario_en_agenda` y `slots_disponibles` (sin
      motivos ni identidades); la excepción de la ventana también llega por `reprogramar_cita` y por `UPDATE` directo (D9 es más fuerte
      que la realidad); el disparador de transiciones solo actúa sobre `authenticated`, así que toda función `SECURITY DEFINER`
      futura que escriba en `citas` (H4, H5, H7) debe validarse sola, como `marcar_cita_atendida`.

- [x] 6.5 Cierre automático de las citas `reservada` vencidas, **sin cron** (decisión del cliente, 2026-10-20: «que se cancele sola, indicando que
      no asistió», y luego sin cron; cierra el hallazgo 6.4 (4) y la pregunta abierta 1 de `design.md`). Migraciones
      `1792344000000_cierre-de-citas-vencidas` y `1792344600000_cierre-de-vencidas-al-usar-el-sistema`: `public.cerrar_citas_vencidas()` (interna,
      `SECURITY DEFINER`, `search_path` vacío, sin `EXECUTE` para la aplicación) pasa a `no_asistio` toda `reservada` con `fin <= now()`
      (más `inicio < now()` para usar `citas_estado_inicio_idx`: con 100 000 citas pasó de recorrer la tabla a un recorrido por índice, 19,6 ms a
      11,5 ms con 505 cierres), solo cambia `estado`, es idempotente y devuelve cuántas cerró; y `cerrar_citas_vencidas_como_personal()` (puerta de la
      aplicación, `EXECUTE` a `authenticated`, exige administrativo o médico, `42501` al resto). `lib/citas/cierre.ts` (`cerrarCitasVencidas`,
      contexto de error `cierre`) la llama desde `app/administrativo/agenda/page.tsx` **antes de leer** la agenda; si falla, la agenda se muestra
      igual. Pruebas: pgTAP `64_cierre_citas_vencidas` (28): estados tras el cierre, idempotencia, columnas sin cambios, auditoría sin actor (dueño) y
      con actor (puerta), el médico deja de leer al paciente de la cita muerta, el administrativo no cierra a mano (`UC004`), la interna no la ejecuta
      ningún rol de la aplicación y la puerta rechaza a enfermera, paciente y sesión sin rol; `tests/agenda/cierre.test.ts` (5, ejecutor doble) y 4
      pruebas nuevas en `tests/integracion/transiciones.test.ts` (con sesiones reales; van ahí porque el cierre es global y ese archivo es el
      único con reservadas ya terminadas como datos: archivos distintos corren en paralelo y se pisarían). Mutaciones (temporales sobre `h3/pruebas`,
      restauradas): `inicio` en vez de `fin`, sin filtrar por `reservada`, `EXECUTE` a `authenticated` en la interna, `EXECUTE` a `anonymous` en la
      puerta, sin guarda de rol, guarda que deja pasar a la enfermera y sin `SECURITY DEFINER`, todas detectadas. pgTAP completo 824 pruebas, 0
      fallos; agenda 211, integración 65 y concurrencia 10. **Consecuencia aceptada:** si nadie del personal abre la agenda, la cita sigue `reservada`
      hasta que alguien lo haga; **H7** debe llamar a `cerrarCitasVencidas()` al abrir la jornada del médico (contrato en `design.md`). No hay botón ni
      acción manual.

## 7. Fundamentos de la aplicación

- [x] 7.1 Crear `lib/acciones/resultado.ts` (`ResultadoAccion`, `CodigoError` con `TRANSICION_INVALIDA`, ayudantes
      `exito`/`fallo`) y `lib/citas/errores.ts` (`MENSAJE_DOBLE_RESERVA` y `traducirError(error, contexto)` con la tabla de
      `design.md`, D5, según lo comprobado en 1.4; contextos `confirmar`, `no_asistio` y `atendida` para `UC004`). Pruebas en
      `tests/agenda/errores.test.ts`: `23P01` y `40P01` en contexto de cita dan exactamente `Registro de cita ya agendado`;
      `23P01` en contexto de bloqueo y de disponibilidad dan sus mensajes y no ese; `P0001`, `UC001` a `UC004`, `42501` y `23505`
      mapean a su código; `UC004` da el mensaje propio de cada acción; un error desconocido da el mensaje genérico sin texto de
      Postgres. Verificar con `npm run test:agenda` y comparando el literal exacto carácter a carácter.
- [x] 7.2 Crear `lib/fechas/lima.ts` (hoy en Lima, inicio y fin de un día de Lima, instante ⇄ fecha y hora de Lima). Pruebas en
      `tests/agenda/lima.test.ts`: 14:30 de Lima del 14/10/2026 es `19:30Z`; las 23:30 de Lima siguen siendo del 14/10 aunque
      en UTC sea el 15; el inicio del día de Lima es `05:00Z`; todo con el proceso en `TZ=UTC` y en `TZ=Asia/Tokyo`. Verificar
      con `TZ=Asia/Tokyo npm run test:agenda` y `TZ=UTC npm run test:agenda`.
- [x] 7.3 Crear `lib/schemas/documento.ts`, `paciente.ts`, `cita.ts` y `agenda.ts` (Zod): DNI de 8 dígitos; Carné de Extranjería
      de 9 a 12 alfanuméricos, recortado y en mayúsculas, con los mensajes de la spec; paciente con correo, sexo M/F/X y
      fecha de nacimiento no futura; cita con identificadores e instantes ISO (y la entrada de una transición: solo el
      identificador de la cita); disponibilidad (día 0 a 6, inicio < fin, slot > 0) y bloqueo (fin > inicio, motivo con
      contenido). Pruebas en `tests/agenda/schemas.test.ts` con todos los escenarios de `identificacion-de-pacientes` y los de
      datos incoherentes de `disponibilidad-y-slots`. Verificar con `npm run test:agenda`.
- [x] 7.4 Crear `lib/auth/accion-personal.ts` (`exigirPersonal('administrativo' | 'medico')`: sesión, claim de rol y MFA,
      devuelve un `ResultadoAccion` de fallo en vez de redirigir). Pruebas con dependencias inyectadas en
      `tests/agenda/accion-personal.test.ts`: sin sesión, paciente, enfermera y personal sin MFA son rechazados con su código;
      un médico es rechazado donde se exige `administrativo` y un administrativo donde se exige `medico`; el rol correcto con
      MFA pasa. Verificar con `npm run test:agenda`.
- [x] 7.5 Crear `lib/notificaciones/eventos-cita.ts` (`EventoCita` y `notificarEventoCita` sin efecto) y un envoltorio
      `emitirTrasCommit(evento)` con `try/catch`. Pruebas en `tests/agenda/eventos-cita.test.ts`: un notificador que lanza no
      cambia el resultado; el evento solo contiene identificadores y motivo `reprogramacion` o `baja_medica`; el tipo
      `EventoCita` no incluye eventos de confirmación, «No asistió» ni «Atendida». Verificar con `npm run test:agenda`.
- [x] 7.6 Añadir el script `test:agenda` (`node --test "tests/agenda/*.test.ts"`) a `package.json` y como paso del job
      `typecheck-lint-build` de `.github/workflows/ci.yml` (archivo con CRLF: conservarlos). Verificar en el PR que el paso
      aparece y pasa, y que `npm run typecheck` y `npm run lint` siguen en verde.
      Avance: el script `test:agenda` y el paso de CI ya están añadidos (CRLF conservados); `npm run typecheck`, `npm run lint` y
      `npm run test:agenda` pasan en local, también con `TZ=UTC` y `TZ=Asia/Tokyo`. Pendiente (sin marcar): verificar en el PR que
      el paso aparece y pasa en `typecheck-lint-build`.
      Resultado (2026-10-20): en el PR el paso `npm run test:agenda` aparece en el job `typecheck-lint-build` y pasa (211 pruebas); `npm run typecheck`
      y `npm run lint` siguen en verde.

## 8. Pacientes: documento, búsqueda y registro

- [x] 8.1 Crear `lib/citas/pacientes.ts` y `app/administrativo/pacientes/acciones.ts` con `buscarPacientes` (documento exacto
      o inicio de apellidos, sin distinguir mayúsculas, comodines escapados, máximo 20, solo datos de identificación y contacto)
      y `registrarPaciente` (guarda, Zod, `23505` → «Ya existe un paciente con ese documento»). Verificar con pruebas unitarias
      del escape de comodines en `tests/agenda/` y ejecutando ambas acciones como administrativo en un branch de desarrollo
      (el paciente `99…` queda creado y la búsqueda lo encuentra).
      Resultado: `lib/citas/pacientes.ts` (`buscarPacientes`, `registrarPaciente`, `escaparComodines`) recibe un `Ejecutor`
      (`lib/db/ejecutor.ts`: en producción `ejecutorAutenticado`, en las pruebas una sesión firmada con la RLS del rol) y
      `app/administrativo/pacientes/acciones.ts` solo añade `auth.protect()` (lo exige la regla de ESLint de Clerk),
      `exigirPersonal('administrativo')` y `revalidatePath`. El duplicado devuelve `DOCUMENTO_DUPLICADO` con el mensaje también
      en `campos.numero_documento`, para que la pantalla lo marque y ofrezca abrir al existente (buscando por ese documento).
      Se añadió el contexto `buscar_paciente` al traductor. Pruebas: `tests/agenda/pacientes.test.ts` (12, ejecutor doble) y
      `tests/integracion/pacientes.test.ts` (8, contra el branch de pruebas como administrativo, paciente, enfermera, médico
      sin relación y sin rol: DNI exacto, prefijo sin distinguir mayúsculas, `%` y `_` literales, tope de 20, alta que la
      búsqueda encuentra, duplicado, negativos por rol). Por mutación: sin el escape de comodines fallan 3 pruebas (la
      unitaria del escape, la de la sentencia y la de integración de `%`/`_`); restaurado.
- [x] 8.2 Añadir a `tests/concurrencia/` (archivo `21_registro_paciente.test.ts`) el caso de dos altas simultáneas del mismo
      documento (una fila, la otra recibe `23505`) y, en pgTAP `34`, que el administrativo no ve `historias_clinicas` del
      paciente que acaba de registrar. Verificar con `npm run test:concurrencia` y `node scripts/ejecutar-pgtap.ts 34`.
      Resultado: `tests/concurrencia/21_registro_paciente.test.ts` (10 rondas de 5 administrativos con el mismo documento: una
      sola fila y las otras cuatro reciben `DOCUMENTO_DUPLICADO`; y dos altas simultáneas del mismo Carné escrito distinto se
      normalizan y solo una prospera). Sin restos en el branch de pruebas. **Corrección al enunciado:** la prueba pgTAP del
      administrativo y la historia del paciente recién registrado no va en `34` (que es de solapes de disponibilidad), sino en
      `41_historia_al_registrar.test.sql`, donde ya se probaba el alta por el administrativo: 10 pruebas, 0 fallos, con dos
      aserciones nuevas (no ve la historia del paciente que acaba de registrar ni ninguna otra).
- [x] 8.3 Crear la página `/administrativo/pacientes` (`auth.protect()`, `exigirRol`, redirección a MFA) con buscador por
      documento o apellido, resultado con la tabla de H2b, formulario de registro con `CampoDocumento` y estados vacío, de
      carga y de error. Verificar a mano en `next dev` con la cuenta de administrativo: DNI de 7 dígitos muestra «El DNI debe
      tener 8 dígitos» bajo el campo, un duplicado ofrece abrir el existente, y el registro nuevo aparece al buscar.
      Resultado: `app/administrativo/pacientes/` (`page.tsx` con `auth.protect()` y la guarda del administrativo con redirección a MFA, `formulario-paciente.tsx`
      con `CampoDocumento`, `acciones.ts`, `loading.tsx`). La verificación a mano se hizo con `e2e/agenda.spec.ts`: un DNI de 7 dígitos muestra «El DNI debe
      tener 8 dígitos» bajo el campo, un duplicado ofrece abrir el existente, y el paciente nuevo aparece al buscar (`tests/integracion/pacientes.test.ts`).

## 9. Horarios y bloqueos

- [x] 9.1 Crear `lib/citas/disponibilidades.ts`, `lib/citas/bloqueos.ts` y `app/administrativo/horarios/acciones.ts` con
      `guardarDisponibilidad`, `eliminarDisponibilidad`, `crearBloqueo`, `actualizarBloqueo` y `eliminarBloqueo` (guarda, Zod,
      fechas de bloqueo interpretadas como Lima, `23P01` → mensajes de solape, nunca el de doble reserva). Verificar con las
      pruebas de `traducirError` de 7.1 y ejecutando cada acción como administrativo en un branch de desarrollo (un solape de
      horario y uno de ausencia devuelven su mensaje y `SOLAPE`).
      Resultado: `lib/citas/disponibilidades.ts` (`guardarDisponibilidad`, con o sin `id`, y `eliminarDisponibilidad`) y
      `lib/citas/bloqueos.ts` (`crearBloqueo`, `actualizarBloqueo`, `eliminarBloqueo`) con el mismo `Ejecutor` que 8.1;
      `app/administrativo/horarios/acciones.ts` solo añade `auth.protect()`, la guarda y el refresco. Modificar y eliminar actúan
      solo si el tramo o el bloqueo es del médico indicado (`id` + `medico_id`). Crear o modificar una ausencia devuelve cuántas
      citas vigentes del médico caen dentro del periodo (`citasAfectadas`), para el aviso de 11.2. Pruebas:
      `tests/agenda/horarios.test.ts` (21, también con `TZ=UTC` y `TZ=Asia/Tokyo`) y `tests/integracion/horarios.test.ts` (8, contra el
      branch de pruebas como administrativo, paciente, médico, enfermera y sin rol): solape de horarios (`SOLAPE`, mensaje propio,
      distinto de la doble reserva), contiguos, otro día u otro médico, vigencias que no se cruzan, vigencia por defecto = hoy en
      Lima, 20 minutos por defecto, ausencia con fechas de Lima (08:00 → 13:00Z), solape de ausencias (`SOLAPE`, mensaje
      propio), auditoría del alta, el cambio y el borrado con rol `administrativo`, y los cuatro roles sin permiso rechazados sin
      tocar nada. En la primera corrida una prueba cayó con `ECONNRESET` (la conexión, no el código); repetida, 8 de 8.
- [x] 9.2 Crear `/administrativo/horarios` (lista de médicos con especialidad) y `/administrativo/horarios/[medicoId]`
      (plantilla semanal con alta, edición y baja de tramos; bloqueos con alta, edición y baja). Verificar a mano: alta de
      «lunes 08:00–12:00, 20 min», rechazo de uno solapado con el mensaje propio, alta de una ausencia con fechas de Lima y
      comprobación de que los slots de esa semana desaparecen en la agenda.
      Resultado: `app/administrativo/horarios/page.tsx` (médicos con especialidad, tramos y ausencias vigentes) y `horarios/[medicoId]/` (`gestor-horarios.tsx`,
      `formulario-tramo.tsx`, `formulario-ausencia.tsx`: alta, edición y baja de tramos y de ausencias, con `<dialog>`). `e2e/horarios.spec.ts`: alta de un tramo de
      domingo 08:00–09:00 cada 20 minutos y rechazo de uno que se cruza con el mensaje propio del solape; `e2e/bajas.spec.ts`: una ausencia con fechas de Lima
      (06:00–14:00) y, mientras dura, la agenda del médico no ofrece huecos. Ambas en verde en el CI del PR y contra el preview.

- [x] 9.3 Implementar la advertencia al eliminar o acortar una disponibilidad: contar las citas vigentes futuras que quedarían
      fuera de la nueva malla y mostrarlas sin cancelarlas. Verificar con una prueba unitaria de la función que decide si una cita
      cae fuera y a mano con una cita futura creada para el caso.
      Avance previo a la pantalla (entonces faltaba: falta mostrar el aviso en la pantalla de horarios, 9.2): la función que decide si una cita cae fuera
      es `citaEnLaMalla` (`lib/citas/disponibilidades.ts`), y `guardarDisponibilidad`/`eliminarDisponibilidad` devuelven
      `fueraDelHorario: { cantidad, citaIds }` calculado con la plantilla RESULTANTE en la misma transacción, sin cancelar nada.
      Pruebas: unitarias de la malla (borde del tramo, desalineada, otra duración, día, vigencia, medianoche de Lima y tramo hasta
      las 24:00; por mutación fallan al quitar el módulo de la malla, la vigencia o el día), de integración con citas futuras reales
      (acortar deja 1 fuera, eliminar deja 2, ninguna cancelada) y una comparación de ~400 horarios entre `citaEnLaMalla` y
      `horario_en_agenda` de la base de datos.
      Resultado: el aviso «N citas vigentes fuera del horario» se muestra en `horarios/[medicoId]/page.tsx` con la lista de citas y su botón «Reprogramar», sin
      cancelar nada. `e2e/horarios.spec.ts`: al eliminar el tramo, la cita queda fuera del horario, se muestra y sigue «Reservada» en la agenda; la función que
      decide si una cita cae fuera está probada en unitarias, en integración y contra `horario_en_agenda` (ver el avance).

## 10. Agenda, reserva y ciclo de estados

- [x] 10.1 Crear `/administrativo/agenda` (Server Component con `searchParams`: fecha de Lima y médico o todos): citas del día
      ordenadas con `TablaAgenda`, `InsigniaEstado`, huecos libres intercalados desde `slots_disponibles`, acciones solo donde
      corresponden (según el estado y la hora, como en la spec) y botón «Agendar» por hueco; estado vacío con la acción
      siguiente. Verificar a mano con datos de demostración y, en `e2e/agenda.spec.ts` (12.1), que una cita cancelada no muestra
      acciones.
      Resultado: `app/administrativo/agenda/page.tsx` con `tabla-del-dia.tsx`, `filtro-medico.tsx` y `loading.tsx` (fecha de Lima y médico en la URL, huecos
      libres intercalados, acciones según estado y hora con `accionesVisibles`, botón «Agendar» por hueco, estado vacío). Antes de leer, la página llama a
      `cerrarCitasVencidas` (6.5). `e2e/agenda.spec.ts`: una cita cancelada queda «Cancelada» sin acciones.

- [x] 10.2 Crear `/administrativo/agenda/nueva` y `reservarCita` en `app/administrativo/agenda/acciones.ts`: paciente por
      documento (con alta rápida), médico y fecha, `SelectorHorario` que reenvía el instante ISO del servidor, resumen con
      médico, especialidad, fecha y hora de Lima y la advertencia «Informe al paciente: la cita solo puede cancelarse hasta 1
      hora antes, a las HH:mm.» (variante si falta menos de 1 hora), botón «Reservar cita» con «Reservando…», y
      `Registro de cita ya agendado` como `Alerta` de error con la lista refrescada. Llama a `public.reservar_cita()` y emite el
      evento tras el commit. Verificar a mano con dos pestañas del mismo horario (la segunda ve el mensaje exacto) y con una
      prueba unitaria del cálculo de la hora límite.
      Avance previo a la pantalla (entonces faltaba: falta la página `/administrativo/agenda/nueva`): `reservarCita` en `lib/citas/reservas.ts` (llama a
      `public.reservar_cita()`) y su acción en `app/administrativo/agenda/acciones.ts` (`auth.protect()` + guarda + refresco +
      `cita_reservada` tras el commit, vía `lib/citas/casos-de-uso.ts`), y el cálculo de la advertencia en
      `lib/citas/advertencia.ts` (`advertenciaCancelacion`: «Informe al paciente: la cita solo puede cancelarse hasta 1 hora antes, a las
      13:30.» para una cita a las 14:30; variante si faltan menos de 1 hora; a exactamente 1 hora todavía se puede cancelar; hora de
      Lima también con `TZ=UTC` y `TZ=Asia/Tokyo`). Pruebas: `tests/agenda/reservas.test.ts` (25) y `tests/integracion/reservas.test.ts`
      (13, como administrativo, paciente, médico, enfermera y sin rol): una reserva nace `reservada`, con origen `administrativo` y
      el administrativo como autor, y el horario deja de ofrecerse; la doble reserva (mismo médico, y mismo paciente con otro médico)
      da exactamente `Registro de cita ya agendado`; horario pasado, fuera de la malla, de otra duración, dentro de una ausencia o
      de un médico dado de baja dan el mensaje de horario no disponible sin crear la cita; el paciente reserva solo a su nombre
      (origen `portal`) y médico, enfermera y sin rol no reservan.
      Resultado: `app/administrativo/agenda/nueva/` (`page.tsx`, `formulario-reserva.tsx`, `elegir-paciente-url.tsx`) y el diálogo `dialogo-agendar.tsx` por hueco.
      `e2e/agenda.spec.ts`: la advertencia «Informe al paciente: la cita solo puede cancelarse hasta 1 hora antes, a las HH:mm.» con la hora límite de Lima, la
      reserva, y la doble reserva desde un segundo contexto con el mensaje exacto «Registro de cita ya agendado».

- [x] 10.3 Añadir `cancelarCita` y `reprogramarCita` (acciones y `lib/citas`) con el diálogo de confirmación basado en `<dialog>`
      nativo, el botón deshabilitado con explicación cuando falta menos de 1 hora y no hay bloqueo, y el mensaje propio de
      «reprogramar». Verificar a mano: cancelar a más de 1 hora funciona, a menos de 1 hora está deshabilitado, y reprogramar
      hacia un horario ocupado deja la original vigente; y por prueba unitaria que el evento de reprogramación es uno solo.
      Avance previo a la pantalla (entonces faltaba: faltan el diálogo `<dialog>` y el botón deshabilitado con explicación en la pantalla): `cancelarCita` (una sola
      sentencia, solo sobre citas vigentes) y `reprogramarCita` (`public.reprogramar_cita()`) en `lib/citas/reservas.ts`, con sus
      acciones y casos de uso. La reprogramación emite UN solo `cita_reprogramada` (prueba unitaria; no se emite además una
      cancelación ni una reserva). Integración: cancelar con más de 1 hora registra quién y cuándo, libera el horario y no borra; con
      menos de 1 hora se rechaza aunque cancele el administrativo y con una ausencia del médico que la cubre se acepta; una cita atendida,
      «No asistió» o ya cancelada da «La cita ya no está vigente»; reprogramar crea la nueva `reservada` (aunque la original
      estuviera `confirmada`) con `reprogramada_de`; un destino ocupado o inválido deja la original vigente y sin cancelar; una
      original dentro de la hora previa da el mensaje de «reprogramar». **Contrato para H4:** en H3 el paciente no tiene política de
      `UPDATE` sobre `citas` (la añade `portal-del-paciente`), así que `cancelarCita` como paciente hoy no encuentra la fila.
      Resultado: `dialogo-confirmar-accion.tsx` (`<dialog>` nativo) en `tabla-del-dia.tsx`, y el botón de cancelar deshabilitado con explicación según
      `accionesVisibles` (`tests/agenda/acciones-visibles.test.ts`). `e2e/agenda.spec.ts`: reprogramar (la original queda cancelada y nace una nueva
      reservada) y cancelar con confirmación; un destino ocupado deja la original vigente en `tests/integracion/reservas.test.ts`.

- [x] 10.4 Crear `lib/citas/transiciones.ts` y las acciones `confirmarCita` y `marcarNoAsistio` en
      `app/administrativo/agenda/acciones.ts` (guarda `exigirPersonal('administrativo')`, `update … set estado … returning
      estado` sin filtrar por estado en el `WHERE`, `UC004` con el mensaje de cada acción, sin eventos), y en la agenda del día
      el botón «Confirmar» (con aviso `role="status"`) en las `reservada` que no terminaron y «No asistió» (con diálogo
      `<dialog>`) en las `confirmada` cuya hora ya empezó. Verificar con las pruebas de `traducirError` de 7.1 y a mano con la
      cuenta de administrativo: confirmar una cita futura la pasa a «Confirmada», «No asistió» no se ofrece antes de la hora,
      y una cita cancelada no ofrece ninguna de las dos.
      Avance previo a la pantalla (entonces faltaba: faltan los botones «Confirmar» y «No asistió» de la agenda del día, 10.1): `lib/citas/transiciones.ts`
      (`confirmarCita`, `marcarNoAsistio`, `update … set estado … where id = … returning estado` sin filtrar por estado) y
      `app/administrativo/agenda/acciones.ts` con `auth.protect()` y el entorno real; la guarda, el refresco y la composición están en
      `lib/citas/casos-de-uso.ts`, que se prueba con un entorno inyectado. Ninguna emite evento. Pruebas:
      `tests/agenda/transiciones.test.ts` (11) y `tests/integracion/transiciones.test.ts` (7, como administrativo, médico dueño, otro
      médico, enfermera, paciente y sin rol): confirmar una futura pasa a «Confirmada», crea la asignación (una sola, también al
      repetir) y recién entonces el médico ve la historia; confirmar una terminada, una atendida o una «No asistió» da el mensaje
      propio de confirmar (`UC004`); «No asistió» solo en una confirmada cuya hora ya empezó. Por mutación, agregar `and estado =
      'reservada'` al `WHERE` hace fallar la unitaria del SQL y las dos de integración de confirmar; restaurado.
      Resultado: los botones «Confirmar» (con aviso `role="status"`) y «No asistió» (con diálogo) viven en `tabla-del-dia.tsx`. `e2e/agenda.spec.ts`: confirmar
      pasa la insignia a «Confirmada» y «No asistió» aún no se ofrece; una cita cancelada no ofrece ninguna acción.

- [x] 10.5 Crear `app/medico/acciones-cita.ts` con la acción `marcarAtendida` (guarda `exigirPersonal('medico')`, Zod del
      identificador, llamada a `public.marcar_cita_atendida()` mediante `lib/citas/transiciones.ts`, resultado tipado, sin
      eventos, `revalidatePath` de la jornada del médico) para que H7 solo conecte el botón. Verificar con una prueba unitaria
      de la acción con dependencias inyectadas (un administrativo es rechazado; `UC002` y `UC004` se traducen) y ejecutándola como
      el médico de demostración sobre una cita `confirmada` ya empezada, preparada como dueño de la base en un branch de
      desarrollo, que pasa a `atendida`.
      Resultado: `marcarAtendida` en `lib/citas/transiciones.ts` (llama a `public.marcar_cita_atendida()`) y `app/medico/acciones-cita.ts`
      (`auth.protect()` + entorno real; la guarda `exigirPersonal('medico')` y el refresco de `/medico` están en `casoMarcarAtendida`),
      sin eventos. Pruebas unitarias con dependencias inyectadas: un administrativo, una enfermera, un paciente, sin sesión y personal
      sin MFA son rechazados sin consultar la base de datos, y `UC002`/`UC004` se traducen; de integración: el médico dueño marca
      «Atendida» una confirmada ya empezada, solo cambia `estado` (comparado el resto de la fila) y la auditoría lo registra como
      `medico`; una cita ajena y una inexistente dan el mismo «La cita ya no está vigente»; administrativo, enfermera, paciente y sin
      rol reciben «No tiene permiso…» sin cambiar la cita; una reservada o una futura reciben el mensaje de «Atendida».
- [x] 10.6 Marcar `disponible: true` los destinos de administrativo que H3 construye en `lib/ui/navegacion.ts` (Agenda,
      Pacientes, Horarios, Bajas). Verificar que la barra lateral enlaza a páginas que responden 200 y que ningún destino sigue
      como «Próximamente» por error.
      Resultado: Agenda, Pacientes, Horarios y Bajas médicas tienen `disponible: true` en `lib/ui/navegacion.ts` (Notificaciones sigue «Próximamente»: es de H5).
      `e2e/bajas.spec.ts` comprueba que Bajas médicas y Horarios son enlaces de la navegación, y la revisión visual (13.3) recorrió las cuatro pantallas.

## 11. Reasignación por baja médica

- [x] 11.1 Crear `/administrativo/bajas` (bajas vigentes y futuras con el número de citas por reasignar y por contactar) y
      `/administrativo/bajas/[bloqueoId]` (citas afectadas con paciente, horario de Lima y estado, hasta 3 propuestas por
      cita con «Mismo horario» destacado, y la marca «Contactar al paciente» con correo y teléfono cuando no hay propuestas),
      leyendo `citas_por_reasignar` y `propuestas_reasignacion`. Verificar a mano con el segundo médico sembrado en 5.4: una
      cita con propuestas y otra, de otra especialidad, con la marca de contacto manual.
      Resultado: `app/administrativo/bajas/page.tsx` (bajas vigentes y futuras con el número por reasignar y por contactar) y `bajas/[bloqueoId]/` (`page.tsx`,
      `reasignacion.tsx`: citas afectadas con paciente, hora de Lima y estado, hasta 3 propuestas con «Mismo horario» destacado y la marca «Contactar al paciente»).
      `e2e/bajas.spec.ts`: la lista cuenta las dos citas por reasignar y el detalle propone el mismo horario con el sustituto. La marca de contacto manual no se
      puede provocar desde la interfaz sin dar de baja al sustituto: la cubre `tests/integracion/consultas.test.ts` contra la base real.

- [x] 11.2 Crear la acción `reasignarPorBaja` (una llamada a `reasignar_cita_por_baja` por cita seleccionada, resultado por fila,
      `DOBLE_RESERVA` y `REASIGNACION_INVALIDA` traducidos, evento `cita_reprogramada` con motivo `baja_medica`) y el flujo de
      alta de baja que lleva del bloqueo a esta pantalla con el aviso del efecto del bloqueo. Verificar a mano: reasignar dentro
      de la hora previa funciona, tres filas con una fallida dejan dos reasignadas y la tercera vigente, y la fila fallida se
      puede reintentar con propuestas nuevas.
      Avance previo a la pantalla (entonces faltaba: falta el flujo de alta de baja que lleva del bloqueo a la pantalla de reasignación): `reasignarPorBaja` en
      `lib/citas/reservas.ts` (una llamada a `public.reasignar_cita_por_baja()` por cita, en orden, un resultado por fila, filas
      inválidas marcadas sin consultar la base de datos, máximo 50 por envío), su acción y su caso de uso, que emite un
      `cita_reprogramada` con motivo `baja_medica` por cada fila hecha y solo por ellas. Integración: con una cita reasignada y otra a un
      sustituto de otra especialidad, la primera se reasigna (original `cancelada`, nueva con `reprogramada_de` y el médico sustituto)
      y la segunda da «Esta reasignación no corresponde a la baja registrada» y queda vigente; reintentada con un sustituto válido
      se hace; una baja que no cubre la cita da el mismo mensaje. Por mutación, si una fila fallida detuviera el lote fallan 3 pruebas.
      Resultado: el flujo completo está en pantalla: la ausencia dice cuántas citas caen dentro y enlaza a reasignarlas (`e2e/bajas.spec.ts`); reasignar solo la
      primera deja la otra sin tocarla y la cita nueva queda con el sustituto, reservada y confirmable. Una fila fallida no detiene el lote (`tests/integracion/
      reservas.test.ts`, `tests/agenda/reasignacion-lote.test.ts`) y la reasignación dentro de la hora previa la cubre pgTAP 38.

## 12. Pruebas E2E y accesibilidad

- [x] 12.1 Escribir `e2e/agenda.spec.ts` con el administrativo de H1 (TOTP): registrar un paciente `99…`, agendar 14 días
      adelante, comprobar la advertencia con la hora límite en Lima, provocar la doble reserva desde un segundo contexto y ver
      `Registro de cita ya agendado`, confirmar la cita (la insignia pasa a «Confirmada» y «No asistió» aún no se ofrece),
      reprogramar, cancelar y ver la cita `Cancelada` sin acciones. Las citas se cancelan al terminar; sin datos de
      demostración la prueba se omite con un aviso. Verificar con `npm run test:e2e` contra la build de producción local y que
      falla si se cambia a propósito el literal esperado.
      Resultado: `e2e/agenda.spec.ts` en verde en el CI del PR y contra el preview (con `CAPTURAS_H3` guarda una captura por paso). Comprobación por mutación (2026-10-20):
      con el literal esperado cambiado a «El DNI debe tener 9 dígitos» la prueba falla en ese paso, en una copia temporal contra el preview.

- [x] 12.2 Escribir `e2e/bajas.spec.ts`: agendar dos citas con el médico de Medicina general 14 días adelante, crear una baja que
      las cubra, reasignar una al sustituto sembrado, confirmar la cita nueva y comprobar la marca de contacto manual de la
      otra; limpiar cancelando las citas y borrando el bloqueo. Verificar con `npm run test:e2e` y que un paciente que abre
      `/administrativo/bajas` es devuelto a su área sin ver el contenido (negativo).
      Resultado: `e2e/bajas.spec.ts` en verde en el CI del PR y contra el preview: dos citas con el titular, ausencia que las cubre, reasignar una al sustituto,
      confirmar la nueva, y el negativo (un paciente que abre `/administrativo/bajas` es devuelto a su área sin ver el contenido). La limpieza cancela las citas y
      borra la ausencia.

- [x] 12.3 Añadir las páginas nuevas a `e2e/accesibilidad.spec.ts` (axe, WCAG 2.1 AA) y corregir lo que reporte, incluidos
      objetivos táctiles de 24 px mínimo y el foco de los diálogos de confirmación. Verificar que la prueba queda en verde y que
      se pone en rojo al quitar a propósito la etiqueta de un campo en un cambio temporal revertido.
      Resultado: `e2e/accesibilidad.spec.ts` recorre las pantallas nuevas a 1280 y a 390 px con los diálogos abiertos (axe, WCAG 2.1 AA), comprueba el foco de los
      diálogos y los 24 px mínimos de los controles. Comprobación por mutación (2026-10-20): quitar las etiquetas de los campos en el navegador pone la revisión en rojo
      (`label` y `select-name`, críticos) y sin la mutación pasa.

## 13. Documentación y verificación integral

- [x] 13.1 Actualizar `CLAUDE.md` (estado: H3), la tabla de Server Actions y el árbol de rutas de TECH-DESIGN (incluidas
      `confirmarCita`, `marcarNoAsistio` y `marcarAtendida`), `docs/pruebas-e2e.md` (nuevas E2E y su requisito de datos de
      demostración) y añadir las notas fechadas propuestas en ADR-0008 (códigos `UC001`–`UC004`), ADR-0011 (dirección de
      `reprogramada_de`) y ADR-0016 (quién confirma: la recepción), **marcadas para revisión humana** y sin cambiar el texto de la
      decisión. Verificar con una búsqueda que todos los documentos citan el mismo mensaje exacto, los mismos códigos y las rutas
      reales, y que ningún enlace relativo se rompe.
      Resultado (2026-10-20): `CLAUDE.md` (estado H3), la tabla de Server Actions de `docs/TECH-DESIGN.md` (con una nota del cierre de citas vencidas),
      `docs/pruebas-e2e.md` y las notas fechadas, marcadas para revisión humana, de ADR-0008, ADR-0011 y ADR-0016. Búsqueda: el mensaje «Registro de cita ya agendado»
      aparece con un único texto en todo el repositorio y no hay enlaces relativos rotos en `CLAUDE.md`, `docs/` ni `docs/adrs/`.

- [x] 13.2 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:agenda`, la suite pgTAP
      completa, `npm run test:concurrencia`, `npm run test:integracion` y la E2E completa; verificar que todo pasa en el PR
      (`neon-branch-pr.yml`) y que la descripción trae un cuadro de cada requisito de las cuatro specs con la prueba que lo cubre.
      Resultado (2026-10-20): todo corre en limpio en el CI del PR: `ci.yml` (`npm ci`, lint, typecheck, build, `test:agenda` con 211) y `neon-branch-pr.yml` (migrar, pgTAP,
      concurrencia e integración) y el job `e2e` (34 pruebas), en verde. La descripción del PR trae el cuadro requisito → prueba de los 32 requisitos de las cuatro specs.

- [x] 13.3 Revisar en el preview de Vercel las pantallas nuevas a 1280 px y a 390 px y mostrar capturas al usuario; verificar que da su
      visto bueno o lista ajustes (se hacen antes del merge). Confirmar con `openspec validate agenda-y-reserva --strict`.
      Avance (2026-10-20): revisión hecha sobre el preview del commit e4a47cb, con
      37 capturas a 1280 y a 390 px (las pantallas nuevas, los tres diálogos y los pasos clave de las E2E; quedan fuera del repositorio). Comprobado de punta
      a punta en el preview, con la base `dev` ya migrada (se aplicaron ahí las tres migraciones nuevas, como dice el plan de migración): una `reservada`
      de ayer insertada a mano pasó a «No asistió» al abrir la agenda, sin acciones, y se borró después. Hallazgos:
      (1) corregido: el pie de la barra lateral desbordaba (`UserButton showName` con un nombre largo dejaba el avatar fuera de la barra, encima del
      contenido) → `components/clinica/pie-usuario.tsx` recorta el nombre; (2) corregido: a 390 px el destino actual (Horarios, Bajas médicas) podía quedar
      fuera de vista en la lista horizontal → se centra al cambiar de página; (3) **abierto, decisión del usuario:** a 390 px las tablas de Agenda, Bajas y
      Horarios dejan fuera de vista lo decisivo porque se desplazan por dentro (Estado y Acciones; Por reasignar, Por contactar y «Ver»; el recuento y «Ver
      horarios»). Propuesta: ocultar bajo 768 px las columnas secundarias (Documento y Médico; Periodo y Motivo; Servicio y Estado) o presentar cada fila como
      tarjeta; (4) sugerencias: ocultar o plegar las citas canceladas de la agenda (llenan el día), alinear la línea base del día y la hora del horario
      semanal, y la demostración usa especialidades (Pediatría, Cardiología, Ginecología) distintas de las cinco de la clínica.
      Resultado (2026-10-20): el cliente dio su visto bueno y decidió el punto (3): **ocultar las columnas secundarias bajo `md` (768 px)** (Agenda: Documento
      y Médico y servicio; Bajas: Periodo y Motivo; Horarios: Servicio y Estado), sin tarjetas. Hecho (`hidden md:table-cell` en cabeceras y celdas; en la
      agenda, Estado y Acciones dejan de tener ancho fijo bajo `md`; el relleno horizontal de las celdas baja de 16 a 6 px, los títulos numéricos se parten
      en dos líneas y «Ver horarios» se muestra como «Ver») y anotado en `docs/DESIGN.md`. El escritorio no cambia. Verificado en el preview (2026-10-20):
      a 390 px las tres tablas caben sin desplazarse por dentro (se midió el ancho de cada una contra su caja) y a 1280 px conservan todas sus columnas;
      el E2E del CI sigue en verde; hay capturas de las tres. Los puntos (1) y (2) ya estaban corregidos; las sugerencias de (4) quedan a criterio del cliente.
- [x] 13.4 Tras el merge, comprobar que `migrar-produccion.yml` aplicó las nueve migraciones, que el deployment de producción está
      READY y que `select proname from pg_proc where proname in (…)` muestra las funciones. La siembra ampliada en producción es una
      acción explícita aparte (5.4), no parte del merge.
      Resultado (2026-10-20): PR #13 fusionado (2be0cc7); la corrida 39503502769 de `migrar-produccion.yml` terminó en `success` y aplicó
      las nueve (1792340114067 … 1792344600000; `pgmigrations` cuenta 9); el deployment de producción 7211946302 está en `success`; y en
      el branch principal de Neon existen las trece funciones de H3 (`reservar_cita`, `reprogramar_cita`, `slots_disponibles`, `slots_agenda`,
      `reasignar_cita_por_baja`, `propuestas_reasignacion`, `cerrar_citas_vencidas`, `cerrar_citas_vencidas_como_personal`, `marcar_cita_atendida`,
      `validar_transicion_estado`, `validar_horario_cita`, `horario_en_agenda`, `proteger_columnas_cita`).
