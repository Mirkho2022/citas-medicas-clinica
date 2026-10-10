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
- [ ] 1.2 Buscar solapes ya existentes en `disponibilidades` (misma tupla médico, día de semana, tramo horario y vigencia que
      se cruzan) con una consulta de solo lectura, en el branch con datos de demostración y en producción. Verificar que
      devuelve cero filas y dejar la consulta y su resultado en la descripción del PR; si devuelve filas, parar y consultar al
      usuario (corregir datos es una acción explícita, no parte de la migración).
- [ ] 1.3 Revisar con el usuario las preguntas abiertas de `design.md` que condicionan pantallas (1, 2 y 3: cita `reservada`
      vencida sin confirmar, horizonte de sustitutos y baja sin fecha de término) y anotar las respuestas en `design.md` antes
      del grupo 11. Verificar que cada pregunta queda con respuesta o con el valor por defecto aceptado por escrito.
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

- [ ] 2.1 Crear la migración `disponibilidad-sin-solape-y-auditoria-de-bloqueos`: restricción `EXCLUDE`
      `disponibilidades_sin_solape` (médico, día de semana, tramo horario y vigencia como rangos), `vigente_desde` con valor
      por defecto `public.hoy_lima()` y disparador `bloqueos_auditoria` con `registrar_auditoria()`. Verificar con
      `npm run migrate up` en un branch de desarrollo con datos de demostración (sin errores) y con `\d disponibilidades`.
- [ ] 2.2 Escribir `tests/pgtap/34_disponibilidad_solape.test.sql`: tramos solapados el mismo día fallan con `23P01`, contiguos
      pasan, otro día u otro médico pasan, vigencias disjuntas pasan, el valor por defecto de `vigente_desde` es la fecha de
      Lima (con `now()` a las 02:00 UTC), y los bloqueos crean, modifican y borran dejando fila en `auditoria` con el actor
      administrativo; negativos: paciente, médico, enfermera y sesión sin rol no escriben `disponibilidades` ni
      `bloqueos_agenda`, y paciente y enfermera no leen bloqueos. Verificar con `node scripts/ejecutar-pgtap.ts 34` y que una
      mutación temporal (quitar `dia_semana with =`) hace fallar al menos una.

## 3. Migración 2: cálculo de slots

- [ ] 3.1 Crear la migración `slots-disponibles` con `slots_agenda` (interna, `EXECUTE` revocado a todos),
      `slots_disponibles(médico, fecha)` y `horario_en_agenda(médico, inicio, fin)`: `SECURITY DEFINER`, `search_path` vacío,
      nombres calificados, médico activo, guarda de rol (`administrativo` y `paciente`; vacío o `false` para los demás), solo
      `(inicio, fin)` en la salida, `EXECUTE` a `authenticated` únicamente. Verificar con `migrate up` y con
      `select proconfig, prosecdef from pg_proc where proname in (…)`: las tres con `search_path=""` y `prosecdef` verdadero.
- [ ] 3.2 Escribir `tests/pgtap/35_slots.test.sql` con todos los escenarios de `disponibilidad-y-slots`: seis slots de 08:00 a
      10:00; tramo no múltiplo (último a las 09:20); cita vigente oculta y cancelada libera; bloqueo parcial oculta tres slots;
      pasados no se ofrecen; sin disponibilidad y fuera de vigencia; médico inactivo; tramo 18:00–20:00 de Lima consultado con
      la sesión en `UTC` y en `Asia/Tokyo`; `horario_en_agenda` exacto sí y fuera de malla, duración distinta o dentro de
      bloqueo no. Negativos de RLS: un `paciente_a` consulta un slot ocupado por la cita de `paciente_b` (no aparece) y luego
      `select` directo sobre `citas` ajenas y `bloqueos_agenda` (cero filas); `medico_a`, `enfermera` y `sin_rol` reciben
      vacío; la función no devuelve más columnas que `inicio` y `fin` (`columns_are`/`function_returns`). Verificar con
      `node scripts/ejecutar-pgtap.ts 35` y por mutación: quitar `security definer` hace fallar la prueba del slot ocupado por
      otro paciente.
- [ ] 3.3 Medir el rendimiento: sembrar en un branch de desarrollo un volumen sintético (p. ej. 50 médicos y 100 000 citas) y
      ejecutar `explain (analyze, buffers)` de `slots_disponibles` para un día. Verificar que usa `citas_medico_inicio_idx` o
      el GiST y que el tiempo está muy por debajo de 500 ms (p95 de TECH-DESIGN); anotar el plan y el tiempo en el PR.

## 4. Migración 3: reservar y reprogramar en la base de datos

- [ ] 4.1 Crear la migración `reservar-y-reprogramar-cita` con `reservar_cita` y `reprogramar_cita` (PL/pgSQL, `SECURITY
      INVOKER`, `search_path` vacío, `EXECUTE` a `authenticated`, revocado a `public`): guarda de rol, `inicio > now()`,
      `horario_en_agenda`, errores propios `UC001` y `UC002` (nunca `P0001`), cancelar antes de insertar, `select … for update`
      de la original, cita nueva `reservada` con `reprogramada_de`, `origen` por rol y `creada_por = perfil_actual()`.
      Verificar con `migrate up` y consultando `pg_proc` (`prosecdef` falso, `search_path=""`).
- [ ] 4.2 Escribir `tests/pgtap/36_reservar_cita.test.sql`: reserva del administrativo (origen `administrativo`, `reservada`,
      `creada_por`) y del paciente (origen `portal`); horario pasado, fuera de malla, dentro de bloqueo y médico inactivo fallan
      con `UC001`; segunda reserva del mismo médico y del mismo paciente con otro médico fallan con `23P01`; una cancelada
      libera el horario. Negativos: paciente a nombre de otro paciente, `medico_a`, `enfermera` y `sin_rol` fallan con `42501`
      y no dejan citas. Verificar con `node scripts/ejecutar-pgtap.ts 36`.
- [ ] 4.3 Escribir `tests/pgtap/37_reprogramar_cita.test.sql`: éxito (original `cancelada` con `cancelada_por`, nueva `reservada`
      con `reprogramada_de`, nueva no hereda `confirmada` y no crea asignación); nuevo horario ocupado deja la original
      vigente; nuevo horario inválido deja la original vigente; original a 30 minutos falla con `P0001` sin cita nueva; original
      cubierta por bloqueo sí se reprograma; cita cancelada o inexistente falla con `UC002`; mover a un horario contiguo del
      mismo paciente funciona (cancelar antes de insertar). Negativos: paciente, médico, enfermera y sin rol fallan con `42501`.
      Verificar con `node scripts/ejecutar-pgtap.ts 37`.
- [ ] 4.4 Crear el ayudante `tests/concurrencia/_sesion.ts` (par Ed25519 efímero, token por cliente con `sub` y
      `publicMetadata.rol`, conexión directa con `pg_session_jwt.jwk`, `auth.jwt_session_init` y `set role authenticated`) y
      `tests/concurrencia/20_reservar_cita_funcion.test.ts`: 20 rondas de 5 administrativos llamando a `reservar_cita` sobre el
      mismo horario confirman exactamente una cita y los demás reciben `23P01` o `40P01`; dos reprogramaciones simultáneas de la
      misma cita dejan una sola cita nueva y la otra recibe `UC002`. Las filas de prueba se limpian al empezar y al terminar.
      Verificar con `npm run test:concurrencia`, y que el helper se niega a correr si el destino es producción.
- [ ] 4.5 Documentar en `docs/pruebas-sql.md` el helper `_sesion.ts`, los archivos 34 a 37 y cómo correr una sola prueba.
      Verificar que los comandos del documento corren tal como están escritos.

## 5. Migración 4: reasignación por baja

- [ ] 5.1 Crear la migración `reasignacion-por-baja` con `reasignar_cita_por_baja` y `propuestas_reasignacion` (`SECURITY
      INVOKER`, solo administrativo, slots calculados una vez por médico y fecha, sin horarios que choquen con otra cita del
      paciente) y la vista `citas_por_reasignar` (`security_invoker = true`, `GRANT SELECT` solo a `authenticated`), error `UC003`.
      Verificar con `migrate up` y `select reloptions from pg_class where relname = 'citas_por_reasignar'`.
- [ ] 5.2 Escribir `tests/pgtap/38_reasignacion_baja.test.sql`: reasignación dentro de la hora previa con bloqueo (la original
      `cancelada`, la nueva `reservada` con `reprogramada_de`); propuestas: mismo horario primero, más cercano después, otra
      especialidad, médico inactivo y médico con bloqueo excluidos, horario que choca con otra cita del paciente excluido, y
      proponer no cambia ninguna cita; `UC003` con bloqueo de otro médico, bloqueo que no cubre, sustituto de otra
      especialidad, inactivo o el mismo médico; el sustituto no obtiene filas de `atenciones` ni `antecedentes` del paciente
      (negativo de historia clínica) y no se crean ni modifican `asignaciones_paciente_medico`. Negativos: paciente, médico,
      enfermera y sin rol fallan con `42501`. Verificar con `node scripts/ejecutar-pgtap.ts 38`.
- [ ] 5.3 Escribir `tests/pgtap/39_citas_por_reasignar_rls.test.sql`: el administrativo ve las vigentes cubiertas por un
      bloqueo; no aparecen canceladas, atendidas ni de otro médico; `medico_a` ve solo las suyas; `paciente_a`, `enfermera` y
      `sin_rol` ven cero filas (incluso de sus propias citas); la cita sale de la vista al acortar el bloqueo, al reprogramarla
      o cancelarla. Verificar con `node scripts/ejecutar-pgtap.ts 39` y ejecutando toda la suite (`npm run test:pgtap`) con
      `99_rls_en_todas_las_tablas` en verde.
- [ ] 5.4 Ampliar `scripts/sembrar-datos-demo.ts` (idempotente, sin desactivar triggers) con un segundo médico de Medicina
      general (`CMP-DEMO-005`, perfil `mock_`) y su disponibilidad de lunes a viernes, para que exista un sustituto de la misma
      especialidad; actualizar `docs/datos-demo.md` (conteos y nota). Verificar ejecutándolo dos veces en un branch de
      desarrollo con los mismos conteos, y `node scripts/comprobar-datos-demo.ts` y la suite pgTAP completa en verde.
- [ ] 5.5 Medir `propuestas_reasignacion` en un branch con un bloqueo de 2 semanas sobre un médico con ~80 citas y 3
      sustitutos. Verificar con `explain (analyze)` que responde en una sola ronda y por debajo de 500 ms; si no, ajustar `días`
      o `máx` por defecto y anotarlo en `design.md`.

## 6. Migración 5: ciclo de estados de la cita (decisión del cliente)

- [ ] 6.1 Crear la migración `transiciones-de-estado-de-cita` con `validar_transicion_estado()` y su disparador
      `citas_validar_transicion` (`BEFORE INSERT OR UPDATE OF estado`, `SECURITY INVOKER`, `search_path` vacío, actúa solo si
      `current_user = 'authenticated'`) con la matriz de `design.md`, D13, y `marcar_cita_atendida(cita uuid)` (`SECURITY
      DEFINER`, `search_path` vacío, `EXECUTE` solo a `authenticated`, revocado a `public`, solo fija `estado`), con errores
      `UC002`, `UC004` y `42501`. Verificar con `migrate up` en un branch de desarrollo con datos de demostración, con
      `pg_proc` (`prosecdef` verdadero solo en `marcar_cita_atendida`, `search_path=""` en ambas), `pg_trigger` (el disparador
      existe y es posterior a `citas_validar_cancelacion` en orden) y `npm run test:pgtap` completo sin romper ninguna prueba de
      H2; si una choca, informar al usuario en vez de editarla.
- [ ] 6.2 Escribir `tests/pgtap/61_transiciones_de_cita.test.sql`. Positivos: el administrativo confirma una cita futura
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
- [ ] 6.3 Completar `docs/pruebas-sql.md` con los archivos 38, 39 y 61, la matriz de transiciones y la nota de que el disparador
      no actúa sobre el dueño de la base. Verificar que los comandos del documento corren tal como están escritos.
- [ ] 6.4 Revisar el SQL de las cinco migraciones con el agente `code-review` (funciones `SECURITY DEFINER`, `search_path`,
      `EXECUTE`, guardas de rol, vista `security_invoker`, orden cancelar-antes-de-insertar, disparador de transiciones y
      acceso a historias clínicas vía confirmación). Verificar que no quedan hallazgos críticos abiertos y que los corregidos
      tienen su prueba pgTAP.

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
- [ ] 7.5 Crear `lib/notificaciones/eventos-cita.ts` (`EventoCita` y `notificarEventoCita` sin efecto) y un envoltorio
      `emitirTrasCommit(evento)` con `try/catch`. Pruebas en `tests/agenda/eventos-cita.test.ts`: un notificador que lanza no
      cambia el resultado; el evento solo contiene identificadores y motivo `reprogramacion` o `baja_medica`; el tipo
      `EventoCita` no incluye eventos de confirmación, «No asistió» ni «Atendida». Verificar con `npm run test:agenda`.
- [ ] 7.6 Añadir el script `test:agenda` (`node --test "tests/agenda/*.test.ts"`) a `package.json` y como paso del job
      `typecheck-lint-build` de `.github/workflows/ci.yml` (archivo con CRLF: conservarlos). Verificar en el PR que el paso
      aparece y pasa, y que `npm run typecheck` y `npm run lint` siguen en verde.

## 8. Pacientes: documento, búsqueda y registro

- [ ] 8.1 Crear `lib/citas/pacientes.ts` y `app/administrativo/pacientes/acciones.ts` con `buscarPacientes` (documento exacto
      o inicio de apellidos, sin distinguir mayúsculas, comodines escapados, máximo 20, solo datos de identificación y contacto)
      y `registrarPaciente` (guarda, Zod, `23505` → «Ya existe un paciente con ese documento»). Verificar con pruebas unitarias
      del escape de comodines en `tests/agenda/` y ejecutando ambas acciones como administrativo en un branch de desarrollo
      (el paciente `99…` queda creado y la búsqueda lo encuentra).
- [ ] 8.2 Añadir a `tests/concurrencia/` (archivo `21_registro_paciente.test.ts`) el caso de dos altas simultáneas del mismo
      documento (una fila, la otra recibe `23505`) y, en pgTAP `34`, que el administrativo no ve `historias_clinicas` del
      paciente que acaba de registrar. Verificar con `npm run test:concurrencia` y `node scripts/ejecutar-pgtap.ts 34`.
- [ ] 8.3 Crear la página `/administrativo/pacientes` (`auth.protect()`, `exigirRol`, redirección a MFA) con buscador por
      documento o apellido, resultado con la tabla de H2b, formulario de registro con `CampoDocumento` y estados vacío, de
      carga y de error. Verificar a mano en `next dev` con la cuenta de administrativo: DNI de 7 dígitos muestra «El DNI debe
      tener 8 dígitos» bajo el campo, un duplicado ofrece abrir el existente, y el registro nuevo aparece al buscar.

## 9. Horarios y bloqueos

- [ ] 9.1 Crear `lib/citas/disponibilidades.ts`, `lib/citas/bloqueos.ts` y `app/administrativo/horarios/acciones.ts` con
      `guardarDisponibilidad`, `eliminarDisponibilidad`, `crearBloqueo`, `actualizarBloqueo` y `eliminarBloqueo` (guarda, Zod,
      fechas de bloqueo interpretadas como Lima, `23P01` → mensajes de solape, nunca el de doble reserva). Verificar con las
      pruebas de `traducirError` de 7.1 y ejecutando cada acción como administrativo en un branch de desarrollo (un solape de
      horario y uno de ausencia devuelven su mensaje y `SOLAPE`).
- [ ] 9.2 Crear `/administrativo/horarios` (lista de médicos con especialidad) y `/administrativo/horarios/[medicoId]`
      (plantilla semanal con alta, edición y baja de tramos; bloqueos con alta, edición y baja). Verificar a mano: alta de
      «lunes 08:00–12:00, 20 min», rechazo de uno solapado con el mensaje propio, alta de una ausencia con fechas de Lima y
      comprobación de que los slots de esa semana desaparecen en la agenda.
- [ ] 9.3 Implementar la advertencia al eliminar o acortar una disponibilidad: contar las citas vigentes futuras que quedarían
      fuera de la nueva malla y mostrarlas sin cancelarlas. Verificar con una prueba unitaria de la función que decide si una cita
      cae fuera y a mano con una cita futura creada para el caso.

## 10. Agenda, reserva y ciclo de estados

- [ ] 10.1 Crear `/administrativo/agenda` (Server Component con `searchParams`: fecha de Lima y médico o todos): citas del día
      ordenadas con `TablaAgenda`, `InsigniaEstado`, huecos libres intercalados desde `slots_disponibles`, acciones solo donde
      corresponden (según el estado y la hora, como en la spec) y botón «Agendar» por hueco; estado vacío con la acción
      siguiente. Verificar a mano con datos de demostración y, en `e2e/agenda.spec.ts` (12.1), que una cita cancelada no muestra
      acciones.
- [ ] 10.2 Crear `/administrativo/agenda/nueva` y `reservarCita` en `app/administrativo/agenda/acciones.ts`: paciente por
      documento (con alta rápida), médico y fecha, `SelectorHorario` que reenvía el instante ISO del servidor, resumen con
      médico, especialidad, fecha y hora de Lima y la advertencia «Informe al paciente: la cita solo puede cancelarse hasta 1
      hora antes, a las HH:mm.» (variante si falta menos de 1 hora), botón «Reservar cita» con «Reservando…», y
      `Registro de cita ya agendado` como `Alerta` de error con la lista refrescada. Llama a `public.reservar_cita()` y emite el
      evento tras el commit. Verificar a mano con dos pestañas del mismo horario (la segunda ve el mensaje exacto) y con una
      prueba unitaria del cálculo de la hora límite.
- [ ] 10.3 Añadir `cancelarCita` y `reprogramarCita` (acciones y `lib/citas`) con el diálogo de confirmación basado en `<dialog>`
      nativo, el botón deshabilitado con explicación cuando falta menos de 1 hora y no hay bloqueo, y el mensaje propio de
      «reprogramar». Verificar a mano: cancelar a más de 1 hora funciona, a menos de 1 hora está deshabilitado, y reprogramar
      hacia un horario ocupado deja la original vigente; y por prueba unitaria que el evento de reprogramación es uno solo.
- [ ] 10.4 Crear `lib/citas/transiciones.ts` y las acciones `confirmarCita` y `marcarNoAsistio` en
      `app/administrativo/agenda/acciones.ts` (guarda `exigirPersonal('administrativo')`, `update … set estado … returning
      estado` sin filtrar por estado en el `WHERE`, `UC004` con el mensaje de cada acción, sin eventos), y en la agenda del día
      el botón «Confirmar» (con aviso `role="status"`) en las `reservada` que no terminaron y «No asistió» (con diálogo
      `<dialog>`) en las `confirmada` cuya hora ya empezó. Verificar con las pruebas de `traducirError` de 7.1 y a mano con la
      cuenta de administrativo: confirmar una cita futura la pasa a «Confirmada», «No asistió» no se ofrece antes de la hora,
      y una cita cancelada no ofrece ninguna de las dos.
- [ ] 10.5 Crear `app/medico/acciones-cita.ts` con la acción `marcarAtendida` (guarda `exigirPersonal('medico')`, Zod del
      identificador, llamada a `public.marcar_cita_atendida()` mediante `lib/citas/transiciones.ts`, resultado tipado, sin
      eventos, `revalidatePath` de la jornada del médico) para que H7 solo conecte el botón. Verificar con una prueba unitaria
      de la acción con dependencias inyectadas (un administrativo es rechazado; `UC002` y `UC004` se traducen) y ejecutándola como
      el médico de demostración sobre una cita `confirmada` ya empezada, preparada como dueño de la base en un branch de
      desarrollo, que pasa a `atendida`.
- [ ] 10.6 Marcar `disponible: true` los destinos de administrativo que H3 construye en `lib/ui/navegacion.ts` (Agenda,
      Pacientes, Horarios, Bajas). Verificar que la barra lateral enlaza a páginas que responden 200 y que ningún destino sigue
      como «Próximamente» por error.

## 11. Reasignación por baja médica

- [ ] 11.1 Crear `/administrativo/bajas` (bajas vigentes y futuras con el número de citas por reasignar y por contactar) y
      `/administrativo/bajas/[bloqueoId]` (citas afectadas con paciente, horario de Lima y estado, hasta 3 propuestas por
      cita con «Mismo horario» destacado, y la marca «Contactar al paciente» con correo y teléfono cuando no hay propuestas),
      leyendo `citas_por_reasignar` y `propuestas_reasignacion`. Verificar a mano con el segundo médico sembrado en 5.4: una
      cita con propuestas y otra, de otra especialidad, con la marca de contacto manual.
- [ ] 11.2 Crear la acción `reasignarPorBaja` (una llamada a `reasignar_cita_por_baja` por cita seleccionada, resultado por fila,
      `DOBLE_RESERVA` y `REASIGNACION_INVALIDA` traducidos, evento `cita_reprogramada` con motivo `baja_medica`) y el flujo de
      alta de baja que lleva del bloqueo a esta pantalla con el aviso del efecto del bloqueo. Verificar a mano: reasignar dentro
      de la hora previa funciona, tres filas con una fallida dejan dos reasignadas y la tercera vigente, y la fila fallida se
      puede reintentar con propuestas nuevas.

## 12. Pruebas E2E y accesibilidad

- [ ] 12.1 Escribir `e2e/agenda.spec.ts` con el administrativo de H1 (TOTP): registrar un paciente `99…`, agendar 14 días
      adelante, comprobar la advertencia con la hora límite en Lima, provocar la doble reserva desde un segundo contexto y ver
      `Registro de cita ya agendado`, confirmar la cita (la insignia pasa a «Confirmada» y «No asistió» aún no se ofrece),
      reprogramar, cancelar y ver la cita `Cancelada` sin acciones. Las citas se cancelan al terminar; sin datos de
      demostración la prueba se omite con un aviso. Verificar con `npm run test:e2e` contra la build de producción local y que
      falla si se cambia a propósito el literal esperado.
- [ ] 12.2 Escribir `e2e/bajas.spec.ts`: agendar dos citas con el médico de Medicina general 14 días adelante, crear una baja que
      las cubra, reasignar una al sustituto sembrado, confirmar la cita nueva y comprobar la marca de contacto manual de la
      otra; limpiar cancelando las citas y borrando el bloqueo. Verificar con `npm run test:e2e` y que un paciente que abre
      `/administrativo/bajas` es devuelto a su área sin ver el contenido (negativo).
- [ ] 12.3 Añadir las páginas nuevas a `e2e/accesibilidad.spec.ts` (axe, WCAG 2.1 AA) y corregir lo que reporte, incluidos
      objetivos táctiles de 24 px mínimo y el foco de los diálogos de confirmación. Verificar que la prueba queda en verde y que
      se pone en rojo al quitar a propósito la etiqueta de un campo en un cambio temporal revertido.

## 13. Documentación y verificación integral

- [ ] 13.1 Actualizar `CLAUDE.md` (estado: H3), la tabla de Server Actions y el árbol de rutas de TECH-DESIGN (incluidas
      `confirmarCita`, `marcarNoAsistio` y `marcarAtendida`), `docs/pruebas-e2e.md` (nuevas E2E y su requisito de datos de
      demostración) y añadir las notas fechadas propuestas en ADR-0008 (códigos `UC001`–`UC004`), ADR-0011 (dirección de
      `reprogramada_de`) y ADR-0016 (quién confirma: la recepción), **marcadas para revisión humana** y sin cambiar el texto de la
      decisión. Verificar con una búsqueda que todos los documentos citan el mismo mensaje exacto, los mismos códigos y las rutas
      reales, y que ningún enlace relativo se rompe.
- [ ] 13.2 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:agenda`, la suite pgTAP
      completa, `npm run test:concurrencia`, `npm run test:integracion` y la E2E completa; verificar que todo pasa en el PR
      (`neon-branch-pr.yml`) y que la descripción trae un cuadro de cada requisito de las cuatro specs con la prueba que lo cubre.
- [ ] 13.3 Revisar en el preview de Vercel las pantallas nuevas a 1280 px y a 390 px y mostrar capturas al usuario; verificar que da su
      visto bueno o lista ajustes (se hacen antes del merge). Confirmar con `openspec validate agenda-y-reserva --strict`.
- [ ] 13.4 Tras el merge, comprobar que `migrar-produccion.yml` aplicó las cinco migraciones, que el deployment de producción está
      READY y que `select proname from pg_proc where proname in (…)` muestra las funciones. La siembra ampliada en producción es una
      acción explícita aparte (5.4), no parte del merge.
