# Design

> **Nombres: sujetos a ADR-0030; si se acepta, léase `profesional`.** Este change conserva `medico` (rol, columnas y nombres de
> código) porque ADR-0030 y su change `profesionales-de-la-salud` (H2c) están propuestos. No se renombra a mano: si se acepta,
> H2c hace el renombre en sus migraciones y este change se ajusta al aplicarse después (tarea 1.7). Lo que cambiaría:
> `exigirPersonal('medico')` → `exigirPersonal('profesional')` y el rol `medico` que comprueba `marcar_cita_atendida()`;
> `medico_id` (en `citas`, `disponibilidades` y `bloqueos_agenda`), `medico_actual()` y la tabla `medicos`;
> `slots_disponibles(p_medico, …)`, `horario_en_agenda()` y `propuestas_reasignacion()` (que además de la especialidad
> compararían la **profesión**: un psicólogo no sustituye a un médico); `app/medico/acciones-cita.ts` → `app/profesional/…`;
> la ruta `/administrativo/horarios/[medicoId]`; los usuarios de prueba `medico_a` y `medico_b` y `asignaciones_paciente_medico`;
> y los textos «médico dueño» y «el médico» de las specs y la interfaz. El **alta de personal** no es de este change (fuera de
> alcance); la de H2c pedirá `profesion` y `colegiatura`.

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
- **Pacientes, verificado en `migrations/`:** `pacientes` tiene `tipo_documento` (`DNI`, `CE`), `numero_documento`, nombres,
  apellidos, `fecha_nacimiento`, `sexo`, `telefono`, `email` (obligatorio) y `direccion`, con `pacientes_documento_unico` y
  `pacientes_documento_formato` (solo DNI y CE). El disparador `pacientes_crear_historia` (función `crear_historia_clinica()`,
  migración `crear-historia-al-registrar-paciente`) inserta la fila de `historias_clinicas`, con su correlativo `HC-000001`, al
  registrar un paciente: de él dependen la prueba `41_historia_al_registrar`, la siembra de demostración y lo que H4 y H6
  suponen de la historia (D15). El administrativo no lee `historias_clinicas`. Con el PRD del 2026-10-11 la recepción registra
  al paciente con o sin cita y **abre** su historia con la filiación mínima de la NTS 139 (D14, D15).

## Goals / Non-Goals

**Goals:**
- Que ninguna regla de la agenda dependa de que la pantalla o la Server Action sean correctas: horario válido, doble
  reserva, ventana de 1 hora, atomicidad de reprogramar/reasignar y coherencia de la reasignación viven en la base de datos.
- Un único punto de inserción de citas que H4 reutilice, con un único traductor de errores.
- Poder demostrar con pruebas (pgTAP, concurrencia con sesiones reales, E2E) cada escenario de las specs.
- Que abrir una historia clínica sea una acción explícita, única por paciente y con la filiación mínima completa, y que el
  documento de un paciente no cambie salvo para confirmar una identidad provisional: ambas reglas viven en la base de datos.

**Non-Goals:**
- Tablas nuevas salvo `pacientes_datos_sensibles` (D14), columnas nuevas en `citas`, estados nuevos en `estado_cita`, o cambios
  en las políticas de historias clínicas.
- La pantalla de la jornada del médico y su botón «Atendida» (H7): H3 entrega la operación y la acción, no la pantalla.
- Enviar correos o crear filas en `notificaciones` (H5); alta o baja definitiva de médicos; vista de agenda del médico; gráficos.
- Búsqueda de «próximo día con horarios» o rangos de fechas: la consulta de slots es por día, como pide ADR-0010.
- Registrar la llegada, las visitas, el triaje y la derivación (H6b), las recetas (H6c) y la copia de la historia (H6d): H3 deja un
  punto de extensión y reglas de contacto (D16) y no define sus tablas ni pantallas. Tampoco une historias duplicadas.

## Decisions

### D1. Siete migraciones nuevas y una sola tabla

Archivos nuevos en `migrations/` (con `npm run migrate create`, solo hacia adelante, sección `down` vacía), en este orden:

1. `disponibilidad-sin-solape-y-auditoria-de-bloqueos`: restricción `disponibilidades_sin_solape`, `vigente_desde` por defecto
   `public.hoy_lima()` y el disparador `bloqueos_auditoria` con la función `registrar_auditoria()` que ya existe.
2. `slots-disponibles`: `slots_agenda` (interna), `slots_disponibles` y `horario_en_agenda`.
3. `reservar-y-reprogramar-cita`: `reservar_cita` y `reprogramar_cita`.
4. `reasignacion-por-baja`: `reasignar_cita_por_baja`, `propuestas_reasignacion` y la vista `citas_por_reasignar`.
5. `transiciones-de-estado-de-cita`: `validar_transicion_estado()` con su disparador `citas_validar_transicion` y la función
   `marcar_cita_atendida` (D13) y el punto de extensión `cita_tiene_visita()` (D16).
6. `tipos-de-documento-pas-y-prov`: `alter type tipo_documento add value` para `PAS` y `PROV`. **Va sola en su archivo**: Postgres no
   deja usar en la misma transacción un valor de enum recién añadido, y `node-pg-migrate` corre cada archivo en una
   transacción; la restricción que los usa va en la migración siguiente.
7. `filiacion-y-apertura-de-historia`: columnas de filiación en `pacientes`, `pacientes_documento_formato` ampliada, tabla
   `pacientes_datos_sensibles`, secuencia del número provisional, protección del documento, `abrir_historia_interna()`,
   `abrir_historia_clinica()`, `historias_abiertas()` y `confirmar_identidad_paciente()`, y retiro del disparador
   `pacientes_crear_historia` y de `crear_historia_clinica()` (D14, D15).

La única tabla nueva (`pacientes_datos_sensibles`) nace con RLS y su prueba negativa, y cada función y la vista traen su
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
| «No asistió» sobre una cita con visita registrada | `UC005` | El paciente ya llegó: la cita tiene una visita registrada y no puede marcarse «No asistió» | `CITA_CON_VISITA` |
| Abrir la historia con la filiación mínima incompleta | `UC006` | Falta completar la filiación del paciente para abrir su historia clínica | `FILIACION_INCOMPLETA` |
| Cambiar el documento de un paciente que no es provisional | `UC007` | El documento de este paciente no se puede modificar | `DOCUMENTO_NO_MODIFICABLE` |
| Disponibilidades / bloqueos | `23P01` | Mensajes propios de solape (ver spec) | `SOLAPE` |
| Cualquier otro | — | No se pudo completar la operación. Intente nuevamente. | `ERROR_INTERNO` |

`UC001`–`UC007` son códigos definidos por la aplicación (clase `UC`, de las reservadas por el estándar a la implementación). Las
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

### D14. Registro de pacientes: documentos, filiación mínima de la NTS 139 y datos sensibles

La lista sale del informe legal (`docs/investigacion-marco-legal-y-saniape.md`, §4.1, «Formato de filiación», NTS 139,
numeral 5.2.2, nivel A) y del reparto de TECH-DESIGN (el dueño del detalle es este change, ítem 5). Todas las columnas nuevas
son **nulables**: un paciente registrado por el portal, o por recepción sin completar la filiación, es válido; lo que se exige
es completar la filiación **para abrir la historia** (D15). Los obligatorios se validan con Zod en el servidor y otra vez en la
base de datos, dentro de `abrir_historia_interna()` (una `CHECK` de tabla no puede depender de si existe la historia).

| Campo de la NTS 139 | Dónde vive | Para abrir la historia |
|---|---|---|
| Identificación estándar y categoría de la IPRESS | constante de la clínica en la configuración de la aplicación (se imprime en los formatos y en la copia); no es dato del paciente | no aplica |
| Número de historia clínica | `historias_clinicas.numero` (existe) | lo asigna el sistema |
| Nombres y apellidos | `nombres`, `apellidos` (existen) | obligatorio |
| Fecha de nacimiento y edad | `fecha_nacimiento` (existe); la edad se **calcula** en Lima y nunca se guarda | obligatorio |
| Lugar de nacimiento | `lugar_nacimiento` (nueva, texto) | obligatorio |
| Sexo | `sexo` (existe: M, F, X) | obligatorio |
| Grupo sanguíneo y factor Rh | `grupo_sanguineo` (A, B, AB, O) y `factor_rh` (+, −) (nuevas) | opcional (nulo = no informado) |
| Domicilio actual | `direccion` (existe; se conserva el nombre) | obligatorio |
| Domicilio de procedencia | `domicilio_procedencia` (nueva) | opcional |
| Teléfono | `telefono` (existe) | opcional |
| Documento de identificación | `tipo_documento` y `numero_documento`: DNI, CE, `PAS` o `PROV` | obligatorio |
| Número de seguro (EsSalud, SIS, SOAT u otros) | `seguro_tipo` (essalud, sis, soat, privado, otro) y `seguro_numero` (nuevas); el número exige el tipo | opcional |
| Estado civil | `estado_civil` (nueva: soltero, casado, conviviente, divorciado, viudo) | obligatorio si es mayor de 18 años |
| Grado de instrucción | `grado_instruccion` (nueva: sin_instruccion, inicial, primaria, secundaria, superior_tecnica, superior_universitaria, posgrado) | obligatorio si es mayor de 18 años |
| Ocupación | `ocupacion` (nueva, texto; «Ninguna» es válida) | obligatorio si es mayor de 18 años |
| Acompañante o responsable: nombre, documento, domicilio y parentesco | `responsable_nombre`, `responsable_documento`, `responsable_domicilio`, `responsable_parentesco` (nuevas) | obligatorio si es menor de 18 años; opcional si no |
| Religión | `pacientes_datos_sensibles.religion` | opcional, dato sensible |
| Pertenencia étnica (formatos de primera atención) | `pacientes_datos_sensibles.pertenencia_etnica` | opcional, dato sensible |

<!-- REVISAR: la norma lista estos campos como contenido mínimo del formato, pero no dice cuáles debe llenar recepción ni qué hacer si el paciente no los sabe. La propuesta exige un núcleo (identidad, nacimiento, sexo, domicilio) y, para los mayores de 18 años, estado civil, instrucción y ocupación; exime a los menores a cambio del responsable; y deja opcional lo que el paciente puede ignorar o no querer decir (sangre, procedencia, teléfono, seguro). Confirmar con la clínica y con el asesor legal (pregunta 9). -->

- **Restricciones.** Listas cerradas por `CHECK` (grupo, Rh, estado civil, instrucción, tipo de seguro), `seguro_numero` solo con
  `seguro_tipo`, y ningún texto vacío o de solo espacios (`length(btrim(x)) > 0`), por la regla de no guardar campos vacíos.
  `email` sigue siendo obligatorio (H2): pregunta 10.
- **Documentos.** `tipo_documento` gana `PAS` (pasaporte, extranjero en tránsito) y `PROV` (número correlativo provisional para
  quien no tiene documento hasta confirmar su identidad), como adelanta TECH-DESIGN. `pacientes_documento_formato` se
  reemplaza en la migración 7: DNI `^[0-9]{8}$` y CE `^[A-Za-z0-9]{9,12}$` (sin cambio), `PAS` `^[A-Za-z0-9]{6,20}$` (la
  aplicación lo normaliza a mayúsculas) y `PROV` `^PROV-[0-9]{6,}$` (pregunta 13). `pacientes_documento_unico` no cambia: un
  mismo documento no abre una segunda historia.
- **El número provisional lo genera el sistema**, nunca el usuario: `documento_provisional_siguiente()` (`nextval` de una
  secuencia propia con `'PROV-' || lpad(…, 6, '0')`, guarda `administrativo`) se llama dentro del `INSERT` de
  `registrarPaciente`, en una sola sentencia. Zod no admite `PROV` como entrada. La base no distingue quién escribió el número
  (la política de `INSERT` del administrativo es de H2): si alguien insertara a mano uno que la secuencia emitirá después, la
  unicidad lo detiene (`23505`) y se reintenta.
- **El documento no cambia, salvo de provisional a definitivo.** El disparador `pacientes_proteger_documento` (`BEFORE UPDATE OF
  tipo_documento, numero_documento`, actúa solo si `current_user = 'authenticated'`, como el de D13) rechaza con `UC007` todo
  cambio hecho por un usuario. La única vía es `confirmar_identidad_paciente(paciente, tipo, numero)` (`SECURITY DEFINER`,
  solo `administrativo`): exige que el paciente sea `PROV` y que el nuevo tipo no lo sea, y reemplaza el documento **sobre el
  mismo `paciente_id`**, de modo que la historia no se duplica ni cambia de dueño. El cambio queda en `auditoria` por
  `pacientes_auditoria`, con el administrativo como actor (sale del token, como en D13). Si el documento definitivo ya
  pertenece a otro paciente, `23505` y no cambia nada: unir la historia provisional con la existente queda fuera de alcance
  (pregunta 12).
- **Datos sensibles en una tabla aparte.** `pacientes_datos_sensibles(paciente_id uuid primary key references pacientes(id) on
  delete cascade, religion text, pertenencia_etnica text, actualizado_en timestamptz)`, con RLS activada y política solo para
  el rol `administrativo` (lectura, alta y modificación; sin `DELETE`) y ningún acceso para médico, enfermera ni paciente.
  Quedan fuera de `buscarPacientes`, del portal, de las notificaciones y de los registros del servidor, y **no** se les conecta
  el disparador de auditoría de H2, porque copiaría el valor a `auditoria` (pregunta 11). *Alternativa descartada:* dos columnas
  en `pacientes` con privilegio de columna; la RLS no filtra por columna, el médico lee la fila entera de sus pacientes y habría
  que revisar los privilegios con cada columna nueva. <!-- REVISAR: tabla aparte y acceso solo del administrativo son una propuesta; la lista de roles que pueden leerlos la decide el usuario. -->
- **Pacientes sin cita.** `registrarPaciente` no crea ni exige una cita. Un paciente sin cita no entra al denominador del
  indicador del 75 % (que mide citas reservadas o canceladas por el propio paciente) porque no genera ninguna cita; su
  llegada, su visita, el triaje y la derivación son de H6b (D16).

### D15. Abrir la historia es una acción explícita; el disparador de H2 se sustituye

Hoy `pacientes_crear_historia` inserta la historia al registrar al paciente. El PRD del 2026-10-11 pide que recepción la abra
con la filiación mínima. Alternativas:

- **(a) Conservar el disparador** y tratar «abrir» como «completar la filiación». No toca H2, H4 ni H6 y mantiene que todo
  paciente tiene historia. Pero la historia nacería con la filiación incompleta, los registros del portal consumirían
  correlativos `HC-` y contarían en el 60 % de historias digitalizadas sin haberse atendido, y no habría un momento en que
  recepción consulte el registro antes de abrir (NTS 139, numeral 5.3.1).
- **(b) Sustituirlo por una acción explícita (recomendada).** Una migración nueva retira el disparador y su función. La historia
  se abre con `abrir_historia_clinica(paciente)`: `SECURITY DEFINER`, `search_path` vacío, `EXECUTE` solo a `authenticated`,
  guarda `rol_actual() = 'administrativo'` (`42501`), paciente inexistente `UC002`. Si el paciente ya tiene historia **la
  devuelve** con `ya_existia = true` (no crea otra ni gasta correlativo); si no, exige la filiación mínima (`UC006`) e inserta
  con `on conflict (paciente_id) do nothing`, de modo que dos aperturas simultáneas dan una sola historia (el correlativo puede
  saltar, como hoy). Devuelve solo el número.
- **(c) Híbrida:** el disparador abre sola la historia únicamente si el `INSERT` ya trae la filiación completa. Ahorra un clic,
  pero oculta el acto de abrir y deja dos caminos con reglas distintas. Descartada.

Se adopta (b) como propuesta, **sujeta a la pregunta 14** y a la decisión del usuario sobre el efecto en H4, H6 y H6b.

- **Dos funciones, una interna.** `abrir_historia_interna(paciente)` hace la inserción y la comprobación de filiación, sin guarda
  de rol y **sin `EXECUTE` para ningún rol de usuario**; la usan `abrir_historia_clinica()` (con su guarda), la siembra de
  demostración y la carga de H8, que corren como dueño de la base (donde una guarda por rol no se puede cumplir).
- **Recepción ve el número, nada más.** `historias_abiertas(pacientes uuid[])` (`SECURITY DEFINER`, solo `administrativo`)
  devuelve `(paciente_id, numero)` de los pacientes pedidos, para que `buscarPacientes` muestre «Historia HC-000123» o «Sin
  historia clínica». Cierra el `REVISAR` de TECH-DESIGN sin darle al administrativo política alguna sobre `historias_clinicas`
  (se mantiene lo que dice H6). El número no es dato clínico.
- **Un documento, una historia.** `pacientes_documento_unico` impide la segunda fila y `historias_clinicas.paciente_id` único, la
  segunda historia. Si `registrarPaciente` recibe `23505`, la acción **busca al paciente existente y muestra su ficha y el número
  de su historia**, no solo el error. El formulario de registro se ofrece después de la búsqueda por documento o apellido: así se
  «consulta el registro» antes de abrir y se ven posibles duplicados de quien no tiene documento.
- **Interfaz.** En la ficha del paciente: «Sin historia clínica» con el botón «Crear historia clínica» (desactivado y con la lista
  de lo que falta si la filiación está incompleta, que se completa ahí mismo) o «Historia HC-…». El formulario de registro ofrece
  «Registrar» y «Registrar y crear historia clínica»: la segunda ejecuta `registrarPaciente` y luego `crearHistoriaClinica`; si
  la segunda falla, el paciente queda registrado y la ficha muestra la acción pendiente (un paciente sin historia es ahora un
  estado válido, así que no hace falta atomicidad entre ambas).
- **Solo lectura desde la historia.** El médico y los demás roles no tienen `UPDATE` sobre `pacientes` (H2): la filiación solo se
  corrige en `/administrativo/pacientes`, con `pacientes_auditoria` registrando el cambio. Las pantallas de H6 la muestran sin
  campos editables. Se prueba con un `UPDATE` directo del médico a cargo (cero filas).
- **Citas y asignaciones no dependen de la historia:** se puede agendar y confirmar la cita de un paciente aún sin historia.
- **Efectos sobre otros changes** (a coordinar, no se editan aquí): la prueba `41_historia_al_registrar` y toda prueba o ayuda de
  H2 que registre un paciente y espere su historia se actualizan **a propósito** (tarea 8.7) y se informa al usuario; la siembra
  de demostración abre las historias con `abrir_historia_interna()`; el requisito «Una carpeta de historia por paciente» de
  `esquema-rls-pgtap` queda sustituido; H4 (registro por el portal) crea pacientes **sin** historia; H6 y H6b no pueden suponer
  que existe (pregunta 14).

### D16. Puntos de contacto con la llegada del paciente (H6b)

H6b (`triaje-y-derivacion`) es dueño de `visitas`, `triajes`, `derivaciones` y de la llegada con o sin cita
(`registrar_llegada(paciente, cita?)`); H3 es dueño de las citas y de sus transiciones. Este change no define esas tablas. Dos
puntos de contacto que H6b le pidió a H3:

1. **Una cita con visita no anulada no puede marcarse «No asistió».** El paciente llegó, aunque la visita ya esté atendida o
   abandonada. `visitas` no existe hasta H6b, así que H3 deja un punto de extensión: `public.cita_tiene_visita(p_cita uuid,
   p_solo_abiertas boolean default false) returns boolean`, `LANGUAGE sql STABLE SECURITY INVOKER`, `search_path` vacío, con
   cuerpo `select false` mientras no haya visitas. `validar_transicion_estado()` la llama en la fila `confirmada → no_asistio`
   (con `p_solo_abiertas = false`: cualquier visita no anulada) y rechaza con `UC005`. H6b la reemplaza con `create or replace`
   sin cambiar la firma ni la seguridad (la lee el administrativo con la política de `visitas` que H6b le da; no se abre
   superficie `SECURITY DEFINER`). *Alternativas:* (a) un disparador propio de H6b sobre `citas`, que reparte la matriz en dos
   disparadores; (b) la función de extensión (**recomendada**): la matriz queda en un solo lugar y H3 la prueba con un
   sustituto dentro de la transacción de la prueba pgTAP (`create or replace` revertido por el `rollback`); (c) que H6b
   reemplace `validar_transicion_estado()` entera, lo que duplica la matriz y la deja divergir.
2. **Una cita cancelada, reprogramada o reasignada con la visita abierta.** La visita queda atada a una cita que ya no es válida;
   H6b la cierra a mano (su D9: `anulada` si no tiene triaje, `abandonada` con motivo `cita_cancelada` si lo tiene). Qué hace H3
   queda como **pregunta 8**; el valor por defecto es permitir y avisar: la agenda marca «Paciente ya llegó»
   (`cita_tiene_visita(cita, true)`) y el diálogo de cancelar o reprogramar lo advierte. La baja del médico incluye este caso
   (la excepción de la ventana permite cancelar una cita cuyo paciente ya llegó).

`cita_tiene_visita()` se crea en la migración 5, junto a la matriz que la usa.

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
- **H4 (registro por el portal), añadido:** el paciente que se registra por el portal queda **sin historia**; la abre recepción
  (D15). Reutilizar `lib/schemas/documento.ts` (DNI, CE y pasaporte; `PROV` no se acepta como entrada) y no crear historias desde
  el portal.
- **H6 y H6b (historias y llegada), añadido:** una historia puede no existir todavía: la lectura, la llegada (`registrar_llegada`) y
  las pantallas tratan «sin historia» como un estado con la acción «Crear historia clínica» de H3 (`abrir_historia_clinica()`),
  no como un error. La filiación se lee de `pacientes`, en solo lectura. `cita_tiene_visita()` es de H3 y la reemplaza H6b (D16);
  H6b decide qué hace con una visita cuya cita se cancela (pregunta 8).
- **H6d (copia de la historia):** el compilado debe clasificar `pacientes_datos_sensibles` (su prueba de cobertura falla con una
  tabla clínica sin clasificar) y decidir si la copia incluye religión y pertenencia étnica; se propone a H6b adjuntar
  `registrar_auditoria_sin_contenido()` a esa tabla (D14).
- **H6i (mecanismos clínicos comunes):** añade dos disparadores `AFTER` sobre `citas` y llama a `reservar_cita()` sin alterarla.
  H3 se compromete a no cambiar su firma ni su semántica sin coordinarlo; los disparadores de H6i no escriben `citas.estado` (si
  lo hicieran como dueño de la base, saltarían la matriz de D13, que no actúa sobre el dueño); y `marcar_cita_atendida()` sigue
  siendo la **única** vía a `atendida` (un `UPDATE` directo da `42501` a todo usuario). `citas_validar_transicion` es `BEFORE` y
  los de H6i `AFTER`, así que no hay conflicto de orden.
- **H8:** debe normalizar los Carné de Extranjería a mayúsculas al migrar, igual que el registro, y cargar las citas históricas
  como dueño de la base (el disparador de transiciones no actúa sobre el dueño). Los pacientes sin documento válido entran como
  `PROV` y sus historias se abren con `abrir_historia_interna()`, no con el disparador retirado.

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
- **Retirar el disparador de H2 deja pacientes sin historia y rompe lo que lo suponía** (`41_historia_al_registrar`, ayudas y
  fixtures de pgTAP, la siembra, H4, H6, H6b) → la tarea 1.6 lista de antemano lo que depende de él; la 8.7 lo actualiza a
  propósito y lo informa; `abrir_historia_interna()` mantiene a la siembra y a H8 sin elevar privilegios de usuario; «sin
  historia» es un estado explícito de la interfaz. Es un cambio de comportamiento de H2: se confirma con el usuario antes de
  aplicar (pregunta 14).
- **`ALTER TYPE … ADD VALUE` y su uso en la misma transacción** → `PAS` y `PROV` van en una migración propia (D1, 6); la
  restricción que los usa, en la siguiente.
- **Los datos sensibles se filtran por un camino lateral** (auditoría, búsqueda, registros, copia, correos) → tabla aparte con
  RLS solo para el administrativo, sin disparador de auditoría de contenido, fuera de `buscarPacientes` y de los esquemas
  públicos; prueba negativa por rol y una que comprueba que `auditoria` no contiene el valor.
- **Un paciente con identidad provisional que se duplica después** (el mismo paciente registrado como `PROV` y luego con su DNI) →
  la búsqueda por apellido previa al registro lo hace visible; unir historias no se resuelve aquí (pregunta 12).
- **Un correo inventado para poder registrar** (el campo es obligatorio) → pregunta 10; mientras no se responda, el registro exige
  un correo real.

## Migration Plan

1. Rama de trabajo con commits por grupo de tareas; las siete migraciones se aplican en orden a un branch de desarrollo y
   luego al branch efímero del PR (`neon-branch-pr.yml` corre `migrate up`, pgTAP y concurrencia).
2. Comprobar antes los solapes de `disponibilidades` (tarea 1.2) y que la suite completa sigue en verde con datos de demostración.
3. Merge: `migrar-produccion.yml` aplica las migraciones (aditivas salvo la 7, que retira el disparador `pacientes_crear_historia`; el resto son funciones, una vista, restricciones,
   columnas nulables, una tabla y disparadores) y
   después se despliega la aplicación. Salvo la 7, ninguna migración rompe a la versión anterior de la aplicación; hasta que se
   despliegue «Crear historia clínica», un paciente registrado quedaría sin historia, así que la migración 7 y el despliegue se
   aplican en la misma ventana.
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
   Actions de TECH-DESIGN debe añadir `buscarPacientes`, `registrarPaciente`, `completarFiliacion`, `crearHistoriaClinica`, `confirmarIdentidadPaciente`,
   `guardarDisponibilidad`, `crearBloqueo` y los destinos reales de ruta; el requisito «Una carpeta de historia por paciente» de
   `esquema-rls-pgtap` debe corregirse a la apertura explícita.
8. **Cita cancelada, reprogramada o reasignada con la visita abierta** (D16). Propuesta por defecto: permitir y avisar («Paciente ya
   llegó» en la agenda y en el diálogo; recepción cierra la visita, como ya prevé H6b). Alternativas: bloquear mientras haya una
   visita abierta (choca con la baja del médico, que sí debe poder cancelar) o que la cancelación cierre la visita en la misma
   operación (exige que H6b exponga esa función). Validar con el usuario y con H6b.
9. **Qué campos de la filiación son obligatorios para abrir la historia** (D14). Propuesta en la tabla de D14; confirmar con la
   clínica y con el asesor legal, incluidos el lugar de nacimiento (texto libre o catálogo de ubigeo) y qué escribir cuando el
   paciente no tiene ocupación.
10. **`email` obligatorio.** Un paciente sin cita, de urgencia o con número provisional rara vez tiene correo; hoy habría que
    inventar uno. Propuesta: volverlo opcional (`alter column email drop not null`), lo que afecta a H4 (vinculación por correo)
    y a H5 (sin correo no hay recordatorio). No se hace sin la decisión del cliente; por defecto sigue obligatorio.
11. **Religión y pertenencia étnica:** por defecto solo los lee y modifica el administrativo; decidir si el profesional a cargo
    debe verlos, si la copia de la historia (H6d) los incluye (son datos del titular) y cómo se audita su cambio sin copiar el
    valor (`registrar_auditoria_sin_contenido()` es de H6b, posterior a este change). Marcado `REVISAR` en D14.
12. **Unión de historias duplicadas.** Si un paciente `PROV` ya tiene historia y su documento definitivo corresponde a otro
    paciente, la confirmación se rechaza y nada se une. Decidir si hace falta un flujo de unión (con revisión y auditoría) o se
    resuelve a mano.
13. **Formatos del pasaporte y del número provisional.** Propuesta: pasaporte de 6 a 20 caracteres alfanuméricos en mayúsculas;
    provisional `PROV-` más seis dígitos o más. Confirmar con recepción y con el asesor legal (la NTS los admite junto al DNI y
    el Carné de Extranjería).
14. **Efecto de retirar el disparador sobre H4, H6 y H6b.** Ellos suponen que la historia existe desde el registro. Decidir (a) si
    se acepta la apertura explícita (propuesta) o se conserva el disparador (alternativa a de D15), y (b) si la llegada de H6b
    exige historia abierta (propuesta: sí, ofreciendo «Crear historia clínica») o puede abrirla.
