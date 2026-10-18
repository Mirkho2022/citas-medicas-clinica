# Design

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (`disponibilidad-y-slots`, `gestion-de-citas`,
`reasignacion-por-baja-medica`, `identificacion-de-pacientes`). Estado de partida, verificado en el repositorio:

- **H2 ya dejó** las tablas `disponibilidades`, `bloqueos_agenda` y `citas` con las dos `EXCLUDE` (`citas_sin_cruce_medico`
  y `citas_sin_cruce_paciente`), el trigger `validar_cancelacion()` (`SECURITY DEFINER`, mide contra `OLD.inicio`, excepción
  por bloqueo del mismo médico, errcode `P0001`), `hoy_lima()`, la auditoría de `citas` y las políticas: el administrativo
  gestiona `citas`, `disponibilidades` y `bloqueos_agenda`; el paciente lee las suyas y reserva con `origen = 'portal'` e
  `inicio > now()`; el paciente **no** lee `bloqueos_agenda` (el comentario de la migración de políticas dice que el cálculo
  de slots «tendrá que hacerse con una función `SECURITY DEFINER`»: lo cierra este change). `notificaciones` solo la escribe
  el rol del cron. La política del administrativo es `for all` (puede actualizar **cualquier** columna, incluido `estado`); el
  médico y la enfermera no tienen política de `UPDATE` ni de `INSERT` sobre `citas` salvo la lectura, y el paciente aún no tiene
  de `UPDATE` (la añade H4). Nada en H2 valida qué transiciones de `estado` son legítimas: eso lo cierra este change (D13).
- **No existe** `slots_disponibles`, ninguna función de reserva, ninguna pantalla ni Server Action de agenda, y nada impide que
  dos disponibilidades del mismo médico se solapen (duplicarían los slots).
- La aplicación tiene cuatro áreas planas (`/administrativo`, `/medico`, `/enfermera`, `/paciente`) con `auth.protect()` +
  `exigirRol(...)`; `lib/db/cliente-autenticado.ts` expone `transaccionAutenticada(consultas)`, que usa el driver HTTP de
  Neon: `sql.transaction([...])` es una lista **fija** de sentencias, sin lógica entre ellas.
- H2b (`sistema-de-diseno-ui`) aporta los componentes y `lib/ui/formato.ts` / `lib/ui/navegacion.ts`; está propuesto, no
  aplicado. H3 se implementa después de él.
- Los datos de demostración traen 4 médicos de 4 especialidades distintas (ninguno tiene un colega de su especialidad) y un
  bloqueo; las pruebas de reasignación necesitan un segundo médico de una misma especialidad (tarea 5.4).

## Goals / Non-Goals

**Goals:**
- Que ninguna regla de la agenda dependa de que la pantalla o la Server Action sean correctas: horario válido, doble
  reserva, ventana de 1 hora, atomicidad de reprogramar/reasignar y coherencia de la reasignación viven en la base de datos.
- Un único punto de inserción de citas que H4 reutilice, con un único traductor de errores.
- Poder demostrar con pruebas (pgTAP, concurrencia con sesiones reales, E2E) cada escenario de las specs.

**Non-Goals:**
- Tablas nuevas, columnas nuevas en `citas`, estados nuevos en `estado_cita`, o cambios en las políticas de historias clínicas.
- La pantalla de la jornada del médico y su botón «Atendida» (H7): H3 entrega la operación y la acción, no la pantalla.
- Enviar correos o crear filas en `notificaciones` (H5); alta o baja definitiva de médicos; vista de agenda del médico; gráficos.
- Búsqueda de «próximo día con horarios» o rangos de fechas: la consulta de slots es por día, como pide ADR-0010.

## Decisions

### D1. Cinco migraciones nuevas, sin tablas

Archivos nuevos en `migrations/` (con `npm run migrate create`, solo hacia adelante, sección `down` vacía), en este orden:

1. `disponibilidad-sin-solape-y-auditoria-de-bloqueos`: restricción `disponibilidades_sin_solape`, `vigente_desde` por defecto
   `public.hoy_lima()` y el disparador `bloqueos_auditoria` con la función `registrar_auditoria()` que ya existe.
2. `slots-disponibles`: `slots_agenda` (interna), `slots_disponibles` y `horario_en_agenda`.
3. `reservar-y-reprogramar-cita`: `reservar_cita` y `reprogramar_cita`.
4. `reasignacion-por-baja`: `reasignar_cita_por_baja`, `propuestas_reasignacion` y la vista `citas_por_reasignar`.
5. `transiciones-de-estado-de-cita`: `validar_transicion_estado()` con su disparador `citas_validar_transicion` y la función
   `marcar_cita_atendida` (D13).

Como no hay tablas nuevas, la regla «tabla nueva = RLS + prueba negativa» no se activa, pero cada función y la vista traen su
prueba negativa por rol y `99_rls_en_todas_las_tablas` debe seguir en verde. El orden respeta que las funciones `LANGUAGE
sql` validan al crearse los objetos que citan.

### D2. No solape de disponibilidades por `EXCLUDE`, no por la aplicación

```sql
-- Boceto a verificar contra el branch (tarea 2.1): tramo horario y vigencia, ambos como rangos.
alter table public.disponibilidades
  add constraint disponibilidades_sin_solape
  exclude using gist (
    medico_id with =,
    dia_semana with =,
    tsrange(date '2000-01-01' + hora_inicio, date '2000-01-01' + hora_fin) with &&,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  );
```

Es la misma filosofía de H2 (ADR-0005): la integridad en el motor. *Alternativa:* validar en la Server Action. Se descarta: dos
administrativos editando a la vez la saltan, y el cálculo de slots dejaría de ser confiable. La migración falla si ya hay filas
que se solapan, por eso la tarea 1.2 lo comprueba antes sobre el branch con datos de demostración y sobre producción (solo
lectura). Se aprovecha la migración para cambiar `vigente_desde` a `hoy_lima()` (con `current_date`, a las 19:00 de Lima ya sería
«mañana»; mismo defecto que H2 corrigió en las asignaciones).

### D3. Slots: tres funciones, dos `SECURITY DEFINER`, una sola definición de «slot»

- `slots_agenda(médico, fecha)` — **interna**: genera los slots de la plantilla vigente ese día (médico activo) y descarta los
  que tocan un bloqueo. No mira citas, ni la hora actual, ni el rol. `EXECUTE` revocado a todos (solo la llaman las otras
  funciones, que corren como dueño).
- `slots_disponibles(médico, fecha)` — la de ADR-0010/TECH-DESIGN: `slots_agenda` menos los que se solapan con citas
  `reservada`/`confirmada` y menos los pasados. Devuelve solo `(inicio, fin)`. Si `rol_actual()` no es `administrativo` ni
  `paciente`, devuelve vacío.
- `horario_en_agenda(médico, inicio, fin)` — `true` si `[inicio, fin)` coincide **exactamente** con un slot de `slots_agenda`
  de la fecha de Lima de `inicio`. Ignora citas (de eso se ocupa el `EXCLUDE`, para que la colisión produzca `23P01` y el
  mensaje exacto, no «horario no disponible»). Mismo guarda de rol.

Los dos públicos son `SECURITY DEFINER` con `search_path` vacío, `EXECUTE` revocado a `public` y concedido a `authenticated`,
porque el paciente no lee `bloqueos_agenda` ni citas ajenas y no se le debe abrir esa lectura (los motivos de una licencia
son datos del personal). Hay un segundo motivo, de corrección y no solo de privacidad: si el cálculo corriera como el
paciente (`SECURITY INVOKER`), la RLS le ocultaría las citas de otros pacientes y los horarios ocupados por ellos aparecerían
como **libres**; el `EXCLUDE` rechazaría la reserva, pero el portal ofrecería horarios que no existen. Como `DEFINER`, el
anti-join contra `citas` y `bloqueos_agenda` ve todas las filas, y lo único que sale es `(inicio, fin)` de los horarios que
quedan libres: ni identificadores, ni pacientes, ni motivos. Lo prueba pgTAP con un paciente que consulta un slot ocupado por
otro paciente (ausente del resultado) y luego consulta `citas` directamente (cero filas ajenas). Cambios respecto al SQL ilustrativo de TECH-DESIGN: nombres calificados, médico activo, guarda de rol,
y la fecha y el día de la semana siempre se derivan de la fecha de Lima. *Alternativa:* una política que deje al paciente leer
bloqueos: expone motivos. *Alternativa:* generar slots en TypeScript: duplica la regla y ya no la protege la base de datos.

### D4. Reservar y reprogramar son funciones, porque el driver HTTP no tiene transacciones interactivas

`reprogramar_cita` necesita leer la original, cancelarla y, solo si eso salió bien, insertar la nueva, todo o nada. Con
`sql.transaction([...])` las sentencias se fijan antes de ejecutarse: no se puede ramificar ni deshacer según un resultado
intermedio. Las alternativas están descartadas: abrir una conexión interactiva (`Pool`/WebSocket) está **prohibido** por D9 de
H2 (una conexión reutilizada podría conservar otra identidad); cancelar y crear en dos llamadas HTTP deja la cita cancelada si
la segunda falla, y la ventana de 1 hora impide deshacerlo; `SECURITY DEFINER` esquivaría la RLS y obligaría a repetir sus
comprobaciones. Se usan funciones PL/pgSQL **`SECURITY INVOKER`** con `search_path` vacío: el `INSERT`/`UPDATE` corre con la RLS y los
disparadores del rol que llama, la función verifica además `rol_actual()` (defensa en profundidad) y falla con `42501` si no
corresponde. `EXECUTE` solo para `authenticated`.

- **`reservar_cita(paciente, médico, inicio, fin, motivo)`** → `uuid`. Roles: `administrativo` (origen `administrativo`) y
  `paciente` (origen `portal`; la política de H2 ya obliga a que sea a su nombre). Comprueba `inicio > now()` y
  `horario_en_agenda`, e inserta con `creada_por = perfil_actual()`. Es el **único punto de inserción** que H4 debe usar: así
  el portal hereda las mismas validaciones y el mismo mapeo de errores.
- **`reprogramar_cita(cita, médico, inicio, fin, motivo)`** → `uuid` de la nueva. Solo administrativo. Orden: validar el nuevo
  horario → `select … for update` de la original (`reservada`/`confirmada`; si no, error de cita no vigente) → `update` a
  `cancelada` (dispara `validar_cancelacion()`: ventana de 1 h o excepción por bloqueo) → `insert` de la nueva `reservada` con
  `reprogramada_de = original`. **Cancelar antes de insertar** es obligatorio: si se insertara primero, la nueva chocaría con
  la original en `citas_sin_cruce_paciente` (mismo paciente, horarios contiguos o médico distinto a la misma hora). Cualquier
  excepción revierte las dos sentencias.
- La cita nueva **nace `reservada`**, nunca hereda `confirmada`: heredarla dispararía `extender_asignacion_por_cita()` y daría
  al médico nuevo acceso a la historia por un efecto lateral (ADR-0016). `reprogramada_de` va en la **nueva** y apunta a la
  original, como en el esquema y en los criterios de aceptación de TECH-DESIGN; el texto de ADR-0011 lo describe al revés (ver
  Open Questions).
- `cancelarCita` es una sola sentencia (`update … where estado in ('reservada','confirmada') returning id`), así que no necesita
  función: cero filas devueltas ⇒ cita no vigente.

### D5. Errores: un traductor central y `SQLSTATE` propios para las reglas nuevas

`lib/citas/errores.ts` exporta `MENSAJE_DOBLE_RESERVA = 'Registro de cita ya agendado'` (única definición del literal, con
prueba que lo compara carácter a carácter) y `traducirError(error, contexto)`, una función pura. Traduce **por contexto de la
acción y por `SQLSTATE`**, no por el nombre de la restricción: así un `23P01` de `bloqueos_agenda` o de `disponibilidades` no se
confunde con la doble reserva.

| Contexto | `SQLSTATE` | Mensaje | `codigo` |
|---|---|---|---|
| Inserción de citas (agendar, reprogramar, reasignar) | `23P01`, `40P01` | `Registro de cita ya agendado` | `DOBLE_RESERVA` |
| Cancelación (`validar_cancelacion()`) | `P0001` | No es posible cancelar con menos de 1 hora de anticipación (en reprogramar: «…reprogramar…») | `CANCELACION_TARDIA` |
| Funciones: horario pasado o fuera de agenda | `UC001` | El horario elegido ya no está disponible. Elija otro horario. | `HORARIO_NO_DISPONIBLE` |
| Funciones: cita inexistente, ajena o no vigente | `UC002` | La cita ya no está vigente | `CITA_NO_VIGENTE` |
| Reasignación: bloqueo que no la cubre o sustituto inválido | `UC003` | Esta reasignación no corresponde a la baja registrada | `REASIGNACION_INVALIDA` |
| Confirmar, «No asistió», «Atendida»: transición o condición no válida | `UC004` | según la acción: «Solo se puede confirmar una cita reservada que aún no terminó» · «Solo se puede marcar «No asistió» una cita confirmada cuya hora ya empezó» · «Solo se puede marcar «Atendida» una cita confirmada cuya hora ya empezó» | `TRANSICION_INVALIDA` |
| Rol o política (`42501`) | `42501` | No tiene permiso para realizar esta operación | `NO_AUTORIZADO` |
| Alta de paciente | `23505` | Ya existe un paciente con ese documento | `DOCUMENTO_DUPLICADO` |
| Disponibilidades / bloqueos | `23P01` | Mensajes propios de solape (ver spec) | `SOLAPE` |
| Cualquier otro | — | No se pudo completar la operación. Intente nuevamente. | `ERROR_INTERNO` |

`UC001`–`UC004` son códigos definidos por la aplicación (clase `UC`, de las reservadas por el estándar a la implementación). Las
funciones nunca usan `P0001` por su cuenta, de modo que `P0001` sigue significando únicamente «ventana de cancelación»
(ADR-0008). El error inesperado se registra en el servidor con acción y `SQLSTATE`, nunca con datos del paciente ni el texto
completo de la excepción hacia el cliente. Se verifica en la tarea 1.4 que el driver de Neon entrega `code` también para
errores levantados desde PL/pgSQL.

### D6. Resultado tipado de ADR-0006, ampliado con un código

`lib/acciones/resultado.ts`: `ResultadoAccion<T> = { ok: true; datos: T } | { ok: false; mensaje: string; codigo: CodigoError;
campos?: Record<string, string> }`. Es compatible con ADR-0006 (el contrato `{ ok, datos } | { ok: false, mensaje }` se
conserva) y añade lo que la interfaz necesita para decidir qué pintar sin comparar textos (`DOBLE_RESERVA` pinta la alerta de
error y refresca la lista; `campos` marca los campos inválidos). Lo reutilizan H4, H5 y H7.

### D7. Capas de la aplicación y guarda de las acciones

- `lib/citas/*.ts` (acceso a datos con `transaccionAutenticada`), `lib/schemas/*.ts` (Zod compartido: `documento`, `paciente`,
  `cita`, `agenda`) y `app/administrativo/<área>/acciones.ts` (`"use server"`, delgadas: guarda → Zod → `lib/citas` →
  `traducirError` → `notificarEventoCita` → `revalidatePath`).
- `lib/auth/accion-personal.ts` — `exigirPersonal('administrativo' | 'medico')` — comprueba sesión, claim de rol y
  `tieneMfaActivo()` y **devuelve** un `ResultadoAccion` de fallo (`NO_AUTORIZADO`), en vez de redirigir como `exigirRol`: una Server Action es un
  `POST` invocable sin pasar por la página. Las páginas conservan `auth.protect()` + `exigirRol()` + redirección a
  `/configurar-mfa`, que exige la regla de ESLint de Clerk. La autoridad real sigue siendo RLS y las funciones.
- Las **lecturas** (agenda del día, slots, listas) son Server Components que leen `searchParams` y consultan con
  `transaccionAutenticada`; no son acciones. Vercel BotID no se usa aquí (ADR-0026 lo reserva al registro y la reserva del
  portal; el personal entra con MFA).

### D8. Fechas: el servidor calcula los instantes; lo escrito a mano se interpreta como Lima

`lib/fechas/lima.ts` convierte (fecha `YYYY-MM-DD` y hora local de Lima ⇄ instante UTC, inicio y fin de un día de Lima, «hoy en
Lima») con `date-fns-tz`; el formato de pantalla es el de H2b (`lib/ui/formato.ts`), sin duplicarlo. Un horario elegido de la
lista viaja como el instante ISO que el servidor calculó (el `SelectorHorario` solo reenvía ese valor); solo los campos libres
(`datetime-local` de un bloqueo) se interpretan como Lima. Se prueba con el proceso en `TZ=UTC` y `TZ=Asia/Tokyo`, como en H2b.
Lima no tiene horario de verano, pero el código no lo asume: delega en la zona IANA.

### D9. Reasignación: propuestas calculadas en la base, una transacción por cita, marca derivada

- **Orden obligatorio:** primero el bloqueo (paso 1 de ADR-0011), luego las reasignaciones. La excepción de la ventana la da la
  condición de datos que `validar_cancelacion()` ya evalúa (existe un bloqueo del médico que cubre la cita); no se toca el
  trigger.
- **`propuestas_reasignacion(bloqueo, días = 7, máx = 3)`** (`SECURITY INVOKER`, solo administrativo) devuelve para cada cita
  afectada hasta `máx` candidatos ordenados por: día (0 = el mismo), cercanía de la hora del día a la original y hora de inicio.
  Marca `mismo_horario`. Usa `slots_disponibles` calculado **una vez por (médico candidato, fecha)** y no por cita, y descarta
  los horarios que se solapan con otra cita vigente del paciente. «Equivalente» se define así por falta de una definición del
  cliente (Open Questions).
- **Rendimiento medido (tarea 5.5):** con 204 citas afectadas y 3 sustitutos la función responde en ~82 ms (objetivo < 500 ms). La
  primera versión comprobaba el choque con otra cita del paciente para cada candidato (cientos por cita) y tardaba ~2,3 s; ahora
  ordena los candidatos y descarta los que chocan *después*, hasta reunir `máx`, y los slots se materializan una vez por
  (médico, fecha). La vista `citas_por_reasignar` no une `pacientes` (el médico no lee a los que no tiene a cargo): la pantalla
  del administrativo trae nombre, documento y contacto con su propia consulta.
- **`reasignar_cita_por_baja(cita, bloqueo, médico, inicio, fin)`** (`SECURITY INVOKER`, solo administrativo) verifica que el
  bloqueo sea del médico de la cita y la cubra, que el destino sea un médico activo de la **misma especialidad** y distinto del
  original (si no, `UC003`), y delega en `reprogramar_cita`. Así la regla «sustituto de la misma especialidad» no depende de la
  aplicación y la excepción de la ventana no sirve para reprogramaciones ordinarias de otros médicos.
- **Una transacción por cita:** la pantalla confirma las filas elegidas y la Server Action llama a la función una vez por
  cita; informa éxito o error por fila. ADR-0011 pide que el administrativo revise la propuesta: no existe «reasignar todo»
  automático.
- **Contacto manual sin estado nuevo:** la vista `citas_por_reasignar` (`security_invoker = true`, `GRANT SELECT` a
  `authenticated`) une citas vigentes con los bloqueos del mismo médico que las cubren (`fin > now()`). Una cita está «por
  contactar» cuando está en la vista y `propuestas_reasignacion` no le devuelve candidatos. Al derivarse de datos, no puede
  desincronizarse y desaparece sola al resolverla. *Alternativas:* una columna en `citas` o una tabla de seguimiento (cambio de
  esquema, sincronización, y la tabla exigiría su RLS y su prueba), o un valor nuevo en `estado_cita` (afecta el predicado de
  las dos `EXCLUDE` y el mapa de estados de H2b). Un registro de «quién llamó y cuándo» queda fuera: no está en el PRD.
- **La reasignación no concede acceso a la historia** (D4) y no revoca el del médico original (ADR-0016). El sustituto obtiene
  acceso cuando la recepción confirma la cita nueva (D13), como con cualquier cita; darle acceso antes (cobertura) es
  `asignarPacienteAMedico`, de H6.

### D10. Evento de cita: punto de extensión sin efecto

`lib/notificaciones/eventos-cita.ts` exporta el tipo `EventoCita` (`{ tipo: 'cita_reservada' | 'cita_cancelada' |
'cita_reprogramada'; citaId; citaAnteriorId?; motivo?: 'reprogramacion' | 'baja_medica' }`) y `notificarEventoCita(evento)`,
que en H3 **no hace nada** (registro de depuración sin datos personales). Las acciones lo llaman después del commit, dentro de
`try/catch`, y nunca cambian su resultado por un fallo (ADR-0017). Solo viajan identificadores: H5 lee lo que necesite con su
propio rol. H3 **no** inserta en `notificaciones` (hoy solo `cron_notificaciones` puede escribirla; cómo escriben las acciones
es decisión de H5) y la reprogramación emite un único `cita_reprogramada`, no una cancelación más una reserva.

### D11. Pantallas, rutas y componentes

Rutas bajo el área existente (las del árbol de TECH-DESIGN son ilustrativas; H1 ya fijó áreas planas):
`/administrativo/agenda` (día, médico y huecos), `/administrativo/agenda/nueva`, `/administrativo/pacientes`,
`/administrativo/horarios` y `/administrativo/horarios/[medicoId]` (plantilla y bloqueos), `/administrativo/bajas` y
`/administrativo/bajas/[bloqueoId]`. Se marcan `disponible: true` en `lib/ui/navegacion.ts` (la regla de H2b). Se usan los
componentes de H2b tal cual (`TablaAgenda`, `SelectorHorario`, `InsigniaEstado`, `TarjetaCita`, `Alerta`, `Campo`,
`CampoDocumento`, `ConsolaLayout`); un solo botón primario por pantalla; el estado de envío con `useActionState` y texto
(«Reservando…»). La confirmación de «Cancelar cita» usa el elemento nativo `<dialog>` (foco atrapado y teclado resueltos por el
navegador) para no añadir una dependencia de Radix que H2b no trae. La reserva es un solo formulario con tres pasos visibles
(paciente → médico y fecha → horario y confirmación); la advertencia de cancelación se calcula con la hora límite de
`lib/ui/formato.ts`. Los textos de la consola van en infinitivo o imperativo; `citas.motivo` se rotula «Motivo de la visita
(opcional, sin datos clínicos)».

### D12. Estrategia de pruebas

- **pgTAP** (`tests/pgtap/34`–`39` y `61`): una prueba por escenario de las specs que vive en la base, con el caso negativo de cada
  rol (`administrativo`, `medico_a`, `enfermera`, `paciente_a`, `paciente_b`, `sin_rol`); los datos usan identificadores propios
  (la suite no asume tablas vacías) y `now()` es fijo en la transacción, así que los límites de 1 hora son deterministas.
- **Concurrencia** (`tests/concurrencia/20_*`): como la de H2, con sesiones `pg` independientes, pero llamando a
  `reservar_cita()`/`reprogramar_cita()` **como `authenticated`**: un ayudante `_sesion.ts` firma tokens Ed25519 y abre la
  conexión con `pg_session_jwt.jwk`, igual que `scripts/ejecutar-pgtap.ts`. Cubre las 20 rondas de 5 y el mapeo de ambos
  códigos al mensaje exacto.
- **Unitarias** (`tests/agenda/*.test.ts`, `node:test`, script `test:agenda`): errores, esquemas Zod, fechas de Lima, guarda de
  acciones, evento de cita.
- **E2E** (`e2e/agenda.spec.ts`) con la cuenta de administrativo de H1 (TOTP) y los datos de demostración, más las páginas nuevas
  en `e2e/accesibilidad.spec.ts` (axe). Las citas de prueba se agendan 14 días adelante y se cancelan al terminar.
- **Rendimiento:** `EXPLAIN (ANALYZE)` de `slots_disponibles` con un volumen sintético en un branch de desarrollo, contra el
  objetivo p95 < 500 ms de TECH-DESIGN.

### D13. Ciclo de estados: un disparador cierra las transiciones y una sola función marca «Atendida»

Decisión del cliente: la recepción (administrativo) confirma y marca «No asistió»; el médico marca «Atendida». H3 es dueño
de estas transiciones; H6 y H7 las consumen. El problema de partida: la política del administrativo en H2 es `for all`, así que
hoy podría escribir cualquier `estado` (también `atendida`) con un `UPDATE` directo, y nada valida las transiciones. Esa regla
no puede vivir en la aplicación.

- **`validar_transicion_estado()`** (disparador `citas_validar_transicion`, `BEFORE INSERT OR UPDATE OF estado`, `SECURITY
  INVOKER`, `search_path` vacío). Solo actúa cuando `current_user = 'authenticated'`, es decir, en operaciones de los usuarios
  de la aplicación; no actúa sobre el dueño de la base (migraciones, siembra de demostración, la carga de H8) ni sobre las
  funciones `SECURITY DEFINER`, que corren como dueño y se validan a sí mismas. Así no se rompen las pruebas pgTAP de H2 ni la
  siembra, que preparan datos como dueño (se verifica corriendo la suite completa). Si `estado` no cambia, no hace nada.
  Corre después de `citas_validar_cancelacion` (orden alfabético) y es independiente de él.

  | Transición (por un usuario) | Quién | Condición | Si no se cumple |
  |---|---|---|---|
  | insertar una cita | cualquiera con política | `estado = 'reservada'` | `UC004` |
  | `reservada → confirmada` | `administrativo` | `now() < fin` (no se concede acceso de forma retroactiva) | `UC004` / `42501` si el rol no es administrativo |
  | `confirmada → no_asistio` | `administrativo` | `now() >= inicio` | `UC004` / `42501` |
  | `reservada` o `confirmada → cancelada` | quien la política deje | la ventana la valida `validar_cancelacion()` | — |
  | `* → atendida` por `UPDATE` directo | nadie | siempre rechazado | `42501` |
  | cualquier otra | — | — | `UC004` |

- **`marcar_cita_atendida(cita uuid)`** → `void`, `SECURITY DEFINER`, `search_path` vacío, `EXECUTE` solo a `authenticated`. Exige
  `rol_actual() = 'medico'` y un médico **activo** (`42501` si no); busca la cita **solo entre las del médico que llama**
  (`medico_id = medico_actual()`), de modo que una cita ajena y una inexistente dan el mismo `UC002` y no revelan de quién es; exige
  `estado = 'confirmada'` y `now() >= inicio` (`UC004`); y ejecuta un `update` que **solo** fija `estado = 'atendida'`. La
  auditoría de `citas` registra al médico como actor porque `perfil_actual()` lee el token, no el dueño de la función. Como
  la cita ya estaba `confirmada`, `extender_asignacion_por_cita()` no crea una asignación nueva.
- **Por qué una función y no una política de `UPDATE` para el médico:** RLS no filtra por columna; dar `UPDATE` al médico sobre
  `citas` le permitiría tocar cualquier dato de su cita aunque se limitara por privilegio de columna a `estado`, y obligaría a
  abrir una política de escritura sobre `citas` para un rol que hoy solo la lee. *Alternativa descartada:* privilegio
  `UPDATE (estado)` + política + regla por rol en el disparador: más piezas y una superficie de escritura permanente.
  *Alternativa descartada:* tres funciones `DEFINER` (una por transición): confirmar y «No asistió» ya son del administrativo,
  que tiene `UPDATE` bajo RLS, y el disparador basta; solo «Atendida» necesita saltarse la RLS.
- **Acciones:** `confirmarCita` y `marcarNoAsistio` (`app/administrativo/agenda/acciones.ts`, guarda `exigirPersonal
  ('administrativo')`) ejecutan `update public.citas set estado = … where id = … returning estado` **sin** filtrar por estado
  en el `WHERE`, para que una transición inválida llegue al disparador (`UC004`, mensaje propio de la acción) y cero filas
  signifique cita inexistente o invisible (`UC002` → «La cita ya no está vigente»); confirmar una cita ya confirmada es un
  `UPDATE` sin cambio de estado: éxito idempotente. `marcarAtendida` (`app/medico/acciones-cita.ts`, guarda
  `exigirPersonal('medico')`) llama a `public.marcar_cita_atendida()`. La lógica de datos de las tres vive en
  `lib/citas/transiciones.ts`; ninguna emite `EventoCita` (H5 no necesita avisar de ellas).
- **Confirmar es el hecho que concede acceso a la historia** (ADR-0016: `extender_asignacion_por_cita()` al pasar a
  `confirmada`). Esta decisión no cambia la regla; por eso la confirmación es exclusiva de la recepción, no es retroactiva y
  queda auditada con autor y rol. Es la parte de H3 que más merece revisión de acceso a historias clínicas.
- **UI mínima** en la agenda del día: «Confirmar» (acción secundaria, aviso `role="status"` sin robar el foco) en las citas
  `reservada` que no terminaron y «No asistió» (con diálogo de confirmación) en las `confirmada` cuya hora ya empezó; antes de
  esa hora el botón no se ofrece. No hay botón «Atendida» en la consola administrativa.
- **Consecuencia aceptada:** una cita `reservada` cuya hora pasó sin que nadie la confirmara no tiene transición de cierre
  (confirmar ya no procede, cancelar lo impide la ventana y `reservada → no_asistio` no está permitida). Queda visible en la
  agenda como `reservada` vencida (ver Open Questions).

## Contratos hacia H4, H5, H6 y H7

- **H4 (portal):** reservar solo con `public.reservar_cita()` (no un `INSERT` propio) y mapear errores con `traducirError`
  (`23P01` y `40P01`); usar `slots_disponibles()`; reutilizar `ResultadoAccion` y `lib/schemas/documento.ts` (DNI/CE) en el
  registro y la vinculación; añadir por su cuenta la política de `UPDATE` del paciente para cancelar, con su prueba negativa,
  y el mensaje de cancelación tardía de `traducirError`; el aviso de cancelación del portal habla de usted (H3 usa la forma de
  la consola).
- **H5 (notificaciones):** implementar `notificarEventoCita` (el único cambio necesario en las acciones de H3); decidir el tipo
  `reprogramacion` y quién inserta en `notificaciones`; no incluir `citas.motivo` en ningún correo (es texto libre); el motivo
  `baja_medica` distingue la reasignación; la cadena `reprogramada_de` lleva de la cita nueva a la original.
- **H6 (historias clínicas):** el acceso del médico a la historia nace cuando la **recepción** confirma la cita
  (`reservada → confirmada`, ADR-0016); H6 no construye otra vía de confirmación y debe tratar una cita solo `reservada` como
  «sin acceso todavía» (aviso, no error). La excepción de cobertura sigue siendo `asignarPacienteAMedico`, de H6.
- **H7 (turnos y dashboard):** no duplicar la reasignación ni las transiciones; el botón «Atendida» de la jornada del médico
  invoca la acción `marcarAtendida` de H3 (`app/medico/acciones-cita.ts`) y solo aparece en citas `confirmada` cuya hora ya
  empezó (la base rechaza el resto); «pacientes en espera» y «citas de mañana sin confirmar» se apoyan en los estados que
  H3 hace transitar (`confirmada` = ingresó o confirmó por teléfono; `no_asistio` lo marca la recepción); para «citas
  afectadas por una baja sin atender» usar la vista `citas_por_reasignar`; reutilizar `TablaAgenda`, `slots_disponibles()` y
  los destinos de `navegacion.ts`. Una cita `atendida` solo es posible desde `confirmada`.
- **H8:** debe normalizar los Carné de Extranjería a mayúsculas al migrar, igual que el registro, y cargar las citas históricas
  como dueño de la base (el disparador de transiciones no actúa sobre el dueño).

## Risks / Trade-offs

- **La restricción nueva de `disponibilidades` falla sobre datos existentes** → la tarea 1.2 busca solapes antes (branch de
  demostración y producción en solo lectura); si los hay, se corrigen los datos con una acción explícita antes de migrar, no
  dentro de la migración.
- **Funciones `SECURITY DEFINER` y `SECURITY INVOKER` mal acotadas abren datos** → `search_path` vacío, `EXECUTE` revocado a
  `public`, guarda de rol dentro de cada función y una prueba negativa por rol; revisión explícita (agente `code-review`) del SQL
  de la migración 2, que es la única que se salta la RLS.
- **Un bloqueo creado para esquivar la ventana de 1 hora** (riesgo residual aceptado de ADR-0012) → el bloqueo queda auditado
  con autor y momento, y la interfaz de baja avisa del efecto; el riesgo sigue siendo operativo, no técnico.
- **El disparador de transiciones rompe una prueba o un flujo existente de H2** → solo actúa sobre `authenticated`; la tarea 6.2
  corre la suite pgTAP completa y, si una prueba de H2 choca, se informa al usuario en vez de editarla en silencio.
- **Un administrativo confirma citas para conceder acceso a historias** (confirmar genera la asignación, ADR-0016) → solo la
  recepción puede confirmar, no se confirma una cita que ya terminó, queda auditado con autor y rol, y el acceso expira a los
  6 meses; el riesgo residual es el de ADR-0016 y no crece.
- **Una cita entra al rango de un bloqueo después de listar las afectadas** (carrera entre reservar y bloquear) → la lista y
  la vista se leen en vivo cada vez; no se añade un disparador sobre `citas` para no romper los datos de demostración, las
  pruebas de H2 ni la carga de H8, que insertan citas fuera de la plantilla.
- **Editar la plantilla con citas futuras** deja citas fuera de la nueva malla (y oculta slots que las tocan) → la interfaz
  advierte cuántas son; no se cancelan.
- **Pacientes reasignados no reciben aviso hasta H5** → la reasignación en producción debe acompañarse de llamada telefónica
  hasta que H5 conecte el evento; la pantalla muestra el contacto del paciente. No se activa el módulo con pacientes reales antes.
- **Un `40P01` en una operación con varias sentencias** puede no ser un choque de horario → solo se traduce a doble reserva en
  los contextos que insertan citas; en el resto cae en el mensaje genérico.
- **`propuestas_reasignacion` pesada en bajas largas** (muchas citas × candidatos × días) → slots una vez por (médico, fecha),
  `máx` por cita y `días` acotado; se mide en la tarea 5.5.
- **H2b aún no aplicado** → H3 no empieza (tarea 1.1) hasta que existan sus componentes y utilidades.
- **Las E2E dependen de los datos de demostración** (médicos y plantillas) → se documenta como requisito y la siembra se amplía
  (tarea 5.4); sin ellos las pruebas se omiten con un aviso, no pasan en falso.

## Migration Plan

1. Rama de trabajo con commits por grupo de tareas; las cinco migraciones se aplican en orden a un branch de desarrollo y
   luego al branch efímero del PR (`neon-branch-pr.yml` corre `migrate up`, pgTAP y concurrencia).
2. Comprobar antes los solapes de `disponibilidades` (tarea 1.2) y que la suite completa sigue en verde con datos de demostración.
3. Merge: `migrar-produccion.yml` aplica las migraciones (aditivas: funciones, vista, una restricción y dos disparadores) y
   después se despliega la aplicación; ninguna migración rompe a la versión anterior de la aplicación.
4. Sin variables de entorno, roles ni JWKS nuevos. La siembra de demostración ampliada es una acción explícita aparte.
5. Reversión: no hay marcha atrás destructiva; un defecto se corrige con una migración nueva, nunca restaurando el branch
   principal de Neon. Las funciones se reemplazan con `create or replace` en una migración posterior.

## Open Questions

Se pueden responder después sin cambiar las specs ni el desglose de tareas; los valores por defecto elegidos están entre paréntesis.

1. **Cita `reservada` cuya hora pasó sin confirmarse** (no hay check-in ni llamada): con las transiciones decididas por el
   cliente no puede confirmarse (terminó), cancelarse (ventana) ni marcarse «No asistió» (exige `confirmada`), y se acumula
   como `reservada` vencida. Propuesta a validar con el cliente: permitir a la recepción `reservada → no_asistio` una vez
   terminada la cita. No se implementa sin esa respuesta; H7 puede mostrar estas citas como «sin cierre».
2. **Criterio de «horario equivalente» en la reasignación** (mismo día primero, luego hasta 7 días hacia adelante, mismo
   horario antes que el más cercano). Validar con la clínica; `días` y `máx` son parámetros de la función.
3. **Baja sin fecha de término** (licencia indefinida): H3 exige fecha de fin. Un rango abierto ampliaría el alcance de la
   excepción de la ventana de ADR-0012; no se permite hasta que el cliente decida cómo representarla.
4. **Reprogramar dentro de la última hora está bloqueado**, consecuencia directa de ADR-0012 (reprogramar cancela). Confirmar con
   el cliente que el administrativo acepta ese límite; no se reabre el ADR.
5. **Dueño de la agenda de lectura del médico** («ver sus turnos y citas confirmadas», PRD): ninguna fila del plan de TECH-DESIGN
   la asigna de forma explícita (H3 es el panel administrativo). Sugerencia: H7, reutilizando `TablaAgenda`.
6. **Normalización de mayúsculas del Carné de Extranjería**: el registro lo guarda en mayúsculas porque la unicidad de la base
   distingue mayúsculas; los datos que cargue H8 deben normalizarse igual.
7. **Documentación a corregir al archivar** (no se edita en este change): ADR-0011 describe `reprogramada_de` «apuntando a la
   nueva» y el esquema lo guarda en la nueva apuntando a la original; ADR-0008 debe listar los códigos nuevos; la tabla de Server
   Actions de TECH-DESIGN debe añadir `buscarPacientes`, `guardarDisponibilidad`, `crearBloqueo` y los destinos reales de ruta.
