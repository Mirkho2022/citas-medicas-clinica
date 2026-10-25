# Backlog: Sistema de Gestión de Citas e Historias Clínicas Electrónicas

Generado el 2026-10-08 con la skill `generar-backlog` a partir de [PRD.md](../01-producto/PRD.md), [TECH-DESIGN.md](../03-arquitectura/TECH-DESIGN.md) y
[docs/03-arquitectura/adrs/](../03-arquitectura/adrs/). Fuente de verdad ante cualquier contradicción: el PRD, luego los ADR vigentes, luego TECH-DESIGN.

**Estado al generar:** 35 ítems. 2 hechos (H1, H2), 1 propuesto (H2b) y 32 pendientes (H3 a H8). Este backlog no
contiene código ni decisiones nuevas: despieza lo que los tres documentos ya establecen. Lo que no está resuelto en
ellos queda en «Preguntas abiertas».

Leyenda de la columna «Hito · change»: `H3 · agenda-y-reserva` significa hito H3 del plan de TECH-DESIGN y change de
OpenSpec que lo contiene. Cada fila es una capability o spec dentro de ese change; si un change resulta demasiado
grande para un solo ciclo, se parte por filas de este backlog (el tamaño se discute en «Notas por ítem»).

## Backlog

| # | Item | Hito · change | Alcance | Depende de | Contexto extra requerido |
|---|---|---|---|---|---|
| 1 | Esqueleto con autenticación y roles | H1 · `esqueleto-app-vercel-neon-clerk` (HECHO, archivado 2026-10-07) | Next.js 15 en Vercel, Neon, Clerk, rol en `publicMetadata`, webhook de alta, invitación y revocación de personal, CI | — | — |
| 2 | Esquema completo, RLS, pgTAP y datos de demostración | H2 · `esquema-rls-pgtap` (HECHO, PR #5; quedan los pasos manuales 8.4 y 10.7) | Tablas del modelo con RLS y GRANT explícito, disparadores, suite pgTAP y de concurrencia, sembrado sintético | 1 | — |
| 3 | Sistema de diseño UI | H2b · `sistema-de-diseno-ui` (PROPUESTO) | Tema Tailwind v4 desde DESIGN.md, componentes base, layouts del portal y la consola, Clerk en español, pruebas axe | 1 | `docs/02-diseno/DESIGN.md` (aprobado) |
| 4 | Fundamentos de las acciones de servidor | H3 · `agenda-y-reserva` | Tipo `Resultado`, mapeo central de SQLSTATE a mensajes en español, envoltorio del cliente autenticado, utilidades de fecha `America/Lima` | 2 | — |
| 5 | Registro y búsqueda de pacientes (administrativo) | H3 · `agenda-y-reserva` | `registrarPaciente` con validación DNI/CE, documento único, búsqueda y edición de contacto en `pacientes/` | 2, 4 | — |
| 6 | Gestión de especialidades y personal clínico | H3 · `agenda-y-reserva` | Altas de médico y enfermera por invitación ligadas a `medicos`/`enfermeras`, especialidades, baja con revocación de sesión | 2, 4 | — |
| 7 | Disponibilidad semanal del médico | H3 · `agenda-y-reserva` | Alta, edición y baja de plantillas de `disponibilidades` (día, rango, duración de slot, vigencia) | 2, 4 | — |
| 8 | Consulta de disponibilidad (slots) | H3 · `agenda-y-reserva` | Función `slots_disponibles` en migración, selector de horario, p95 < 500 ms | 7 | — |
| 9 | Agendar cita con anticruce (administrativo) | H3 · `agenda-y-reserva` | `reservarCita` sobre el `EXCLUDE`, mensaje exacto `Registro de cita ya agendado`, advertencia de 1 h, prueba de concurrencia | 5, 8 | — |
| 10 | Cancelar y reprogramar citas (administrativo) | H3 · `agenda-y-reserva` | `cancelarCita` con ventana de 1 h para todos los roles; `reprogramarCita` en una transacción | 9 | — |
| 11 | Ciclo de estados de la cita | H3 · `agenda-y-reserva` | Confirmar y registrar asistencia (`confirmada`, `atendida`, `no_asistio`) con las políticas RLS que hoy faltan | 9 | Regla de negocio de la clínica sobre quién confirma (ver Q1) |
| 12 | Vista de agenda (administrativo y médico) | H3 · `agenda-y-reserva` | `agenda/` por día y médico con estados y huecos; el médico ve sus turnos y citas confirmadas | 9 | — |
| 13 | Reasignación por baja o emergencia médica | H3 · `agenda-y-reserva` | `bloqueo_agenda`, citas afectadas, propuesta de sustitutos, ejecución transaccional, contacto manual | 6, 8, 10 | Criterios de la clínica para sustituir a un médico, si los tiene (Q4) |
| 14 | Controles de borde y cabeceras de seguridad | H4 · `portal-del-paciente` | Rate limiting Upstash en rutas de auth, helper de BotID, CSP, HSTS y `X-Frame-Options` | 1 | Cuentas de Upstash y BotID |
| 15 | Registro público del paciente y vinculación por documento | H4 · `portal-del-paciente` | Alta en `/registro`, creación o vinculación de `pacientes` por documento sin duplicar | 5, 14 | — |
| 16 | Portal: buscar disponibilidad y reservar | H4 · `portal-del-paciente` | `citas/nueva`, advertencia de cancelación, `reservarCita` como paciente, BotID, E2E de reserva y concurrencia | 8, 9, 14, 15 | — |
| 17 | Portal: mis citas y cancelación | H4 · `portal-del-paciente` | `citas/` con estados, cancelación propia dentro de la ventana, política RLS nueva | 10, 15 | — |
| 18 | Proveedor de correo y plantillas | H5 · `notificaciones-email` | Interfaz `lib/notificaciones/proveedor.ts` con Resend, plantillas es-PE sin datos clínicos, tipo `reprogramacion` | 2 | Dominio del remitente de la clínica (SPF, DKIM, DMARC) |
| 19 | Notificaciones transaccionales integradas a las acciones de cita | H5 · `notificaciones-email` | Confirmación y cancelación síncronas, `recordatorio_24h` al crear la cita, fallo sin revertir | 9, 10, 13, 18 | — |
| 20 | Cron de recordatorios y reintentos | H5 · `notificaciones-email` | `/api/cron/notificaciones` diario, rol `cron_notificaciones`, guarda de cita futura, reintentos hasta 3, idempotencia | 2, 18 | — |
| 21 | Vista de notificaciones fallidas | H5 · `notificaciones-email` | `dashboard/notificaciones` solo para administrativo, fallidas con 3 o más intentos | 3, 20 | — |
| 22 | Catálogo CIE-10 completo | H6 · `historias-clinicas` | Migración de datos versionada e idempotente (MINSA/SUSALUD, respaldo OMS) y búsqueda por código y texto | 2 | **Dominio clínico:** fuente CIE-10 vigente y descargable |
| 23 | Acceso del médico a la historia clínica | H6 · `historias-clinicas` | Mis pacientes, ficha de solo lectura, auditoría de lecturas en `accesos_historia`, guarda de entorno por P-1 | 2, 3 | **Dominio clínico:** estructura de la historia en papel y NTS del MINSA |
| 24 | Asignación manual paciente–médico | H6 · `historias-clinicas` | `asignarPacienteAMedico` (administrativo), solo inserción, `vigente_hasta` opcional | 2, 5 | — |
| 25 | Antecedentes del paciente | H6 · `historias-clinicas` | Registrar, marcar no vigente y consultar antecedentes en las 5 categorías | 23 | **Dominio clínico:** validar las 5 categorías con el personal médico |
| 26 | Registrar atención clínica | H6 · `historias-clinicas` | `registrarAtencion` con validación estricta, diagnósticos CIE-10, datos del paciente de solo lectura | 22, 23 | **Dominio clínico:** campos y formato de la nota de atención |
| 27 | Firma de atención y addendas | H6 · `historias-clinicas` | `firmarAtencion` tras `lib/firma/proveedor.ts`, inmutabilidad, `agregarAddenda` | 26 | **Dominio legal:** firma lógica o certificada (P-1, P-5) |
| 28 | Adjuntos escaneados de respaldo | H6 · `historias-clinicas` | PDF en Vercel Blob privado, URL firmada tras `medico_tiene_paciente()`, tabla nueva de adjuntos | 23 | **Dominio clínico:** formato y tamaño de los escaneos |
| 29 | Turnos de enfermería | H7 · `turnos-y-dashboard` | `asignarTurno` sin choque (administrativo) y consulta del propio turno y médico/servicio (enfermera) | 3, 6 | — |
| 30 | Dashboard operativo | H7 · `turnos-y-dashboard` | Vistas de citas de hoy por estado, agenda con huecos, pacientes en espera, citas de mañana sin confirmar | 11, 12 | Definición de «en espera» (Q1) |
| 31 | Importación de catálogos y maestro de pacientes | H8 (sin change) | Fases 1 y 2 de ADR-0019, deduplicación por documento, bandeja de revisión manual | 5, 6, 7 | **Operativo:** muestra anonimizada del Excel y el Google Form actuales |
| 32 | Importación de citas futuras | H8 (sin change) | Fase 3: solo citas a futuro, con el mismo anticruce de la base | 9, 31 | Decisión sobre correos masivos al importar (Q9) |
| 33 | Digitalización progresiva de historias clínicas | H8 (sin change) | Fase 4: carga de antecedentes y diagnósticos activos, adjuntos y consulta del indicador de 60 % | 25, 26, 28 | **Dominio clínico y legal:** P-1 para datos reales |
| 34 | Respaldo diario cifrado y prueba de recuperación | H8 (sin change) | Export diario cifrado fuera de Neon, prueba de restauración en un branch, RPO y RTO documentados | 2 | — |
| 35 | Manual de usuario y capacitación | H8 (sin change) | Manual por rol, material de capacitación, plan de doble registro y corte (entregable sin código) | 16, 17, 23, 26, 27, 29, 30 | Fecha de corte que fija la clínica |

## Cómo usar este backlog

Cada ítem es una spec independiente. Al implementarlo, se arranca un ciclo de Spec-Driven Development (en este
repositorio, `/opsx:propose` con el nombre del change de la columna «Hito · change») usando el ítem como el alcance de
la spec, no el proyecto completo. Reglas del repositorio que cada ítem hereda:

- Indicar en el proposal a qué hito corresponde y, si toca acceso a historias clínicas o RLS, decirlo explícitamente
  (marca `[RLS]` y `[HC]` en las notas).
- Toda tabla nueva en `public` nace con RLS activada y con su prueba pgTAP negativa (marca `[TABLA]`).
- Los textos de cara al usuario van en español, con el diseño de [DESIGN.md](../02-diseno/DESIGN.md) y las fechas en `America/Lima`.
- Si la columna «Contexto extra requerido» marca **Dominio**, antes de generar la spec de ese ítem comparte la
  documentación de reglas de negocio de ese dominio como contexto, si la tienes. El backlog no la genera ni la pide.
- Si un ítem exige una decisión de arquitectura nueva (por ejemplo Q4, Q10), se crea como ADR aparte y se enlaza; no se
  decide dentro del proposal.

## Orden propuesto y paralelismo

El orden sale de las dependencias, no de prioridades supuestas. Camino crítico: `4 → 7 → 8 → 9`, y de ahí dos ramas
largas: `10 → 13 → 19` (notificaciones integradas a todas las acciones de cita) y `11 → 30 → 35` (dashboard y cierre).

| Ola | Ítems que pueden ir en paralelo | Condición |
|---|---|---|
| 0 | 1, 2 | Hechos. Cerrar los pasos manuales 8.4 y 10.7 de H2. |
| 1 | 3, 4, 14, 18, 22, 34 | Tras el ítem 2 (el 3 y el 14 solo necesitan el 1). No comparten archivos. El 18 es adelantable: no tiene dependencia de código con H3, aunque el plan sitúa H5 después de H3; los ítems 19 a 21 sí esperan a H3. |
| 2 | 5, 6, 7 | Tras el ítem 4. Tres pantallas administrativas distintas. |
| 3 | 8, 15, 23, 24 | 8 tras el 7; 15 tras 5 y 14; 23 tras el 3 (H6 corre en paralelo a H3 a H5, con datos de demostración); 24 tras el 5. |
| 4 | 9, 25, 26, 28, 31 | 9 tras 5 y 8; 25 y 28 tras el 23; 26 tras 22 y 23; 31 tras 5, 6 y 7. |
| 5 | 10, 11, 12, 27 | 10, 11 y 12 tras el 9 (tres acciones y vistas distintas sobre `citas`); 27 tras el 26. |
| 6 | 13, 16, 17, 20, 29 | 13 tras 6, 8 y 10; 16 tras 8, 9, 14 y 15; 17 tras 10 y 15; 20 tras 18; 29 tras 3 y 6. |
| 7 | 19, 30, 32, 33 | 19 tras 9, 10, 13 y 18; 30 tras 11 y 12; 32 tras 9 y 31; 33 tras 25, 26 y 28 (y P-1 para datos reales). |
| 8 | 21, 35 | 21 tras 3 y 20; 35 cuando las pantallas ya son estables. |

Las olas son una guía, no una barrera: un ítem arranca en cuanto cumple su columna «Depende de».

**Carriles independientes:** H6 (ítems 22 a 28) puede avanzar entero en paralelo con H3 a H5, porque su única
dependencia del plan es H2. Solo no debe entrar en producción con datos reales (P-1).

**Riesgo de conflicto de archivos al paralelizar:**

- Los ítems 10, 11 y 17 añaden políticas o disparadores sobre `citas`. Son migraciones distintas, pero hay que
  coordinar el orden de los archivos de `migrations/`.
- El ítem 19 modifica las acciones que crean los ítems 9, 10 y 13. Por eso los precede un punto de extensión vacío
  (ver nota del ítem 9) y no al revés.
- Los ítems 16 y 9 comparten `reservarCita`: el 16 solo debe añadir el rol paciente, no reescribirla.

## Notas por ítem

Marcas: `[RLS]` toca políticas o permisos; `[HC]` toca acceso a historias clínicas (revisión explícita obligatoria);
`[TABLA]` crea una tabla nueva (RLS y prueba pgTAP negativa); `[P-1]` no puede pasar a producción con datos reales.

### Hechos y en curso

- **1.** Spec vigente: `openspec/specs/autenticacion-roles/`. Dejó fuera la superficie de gestión de personal (ítem 6).
- **2.** Dejó sin política, a propósito, lo que construyen los hitos siguientes: que el paciente cancele, que el médico
  confirme o marque atendida (ítems 11 y 17), y la escritura de `notificaciones` por una acción de usuario (ítem 19).
  Pendientes manuales: 8.4 (suscripción `user.updated` y nombre y apellido obligatorios en Clerk) y 10.7 (verificar que
  `migrar-produccion.yml` aplicó las migraciones).
- **3.** Es una fila nueva entre H2 y H3 en el plan; depende de H1, no de H2. Las pantallas de H3 a H7 usan sus
  componentes (`SelectorHorario`, `TablaAgenda`, `InsigniaEstado`, `AtencionFirmada`).

### H3 · `agenda-y-reserva`

- **4. Fundamentos de las acciones de servidor.** Fuente: ADR-0006, ADR-0008, TECH-DESIGN «Server Actions» y «Doble
  reserva». `{ ok: true, datos } | { ok: false, mensaje }`; mapeo de `23P01` y `40P01` al texto exacto, `P0001` a la
  cancelación tardía y `42501` a inmutabilidad o cambio de rol; envoltorio con `set local role authenticated` dentro de
  una transacción. Sin tablas. *Tamaño en el límite inferior*: se acepta porque desbloquea en paralelo los ítems 5, 6 y 7;
  si el equipo prefiere, se fusiona con el 9.
- **5. Pacientes (administrativo).** Fuente: criterios «Registro de paciente»; PRD (DNI o Carné de Extranjería).
  DNI de 8 dígitos y CE de 9 a 12 alfanuméricos, validados en Zod antes de la base; segundo registro con el mismo
  documento falla sin crear fila. La historia clínica nace sola por el disparador de H2. `[RLS]` caso negativo: roles
  distintos del administrativo no registran pacientes.
- **6. Personal clínico.** Fuente: matriz de acceso de TECH-DESIGN (el administrativo gestiona `especialidades`,
  `medicos` y `enfermeras`), ADR-0022 (invitaciones desde acciones del administrativo), ADR-0011 (baja). Ninguna fila del
  plan de TECH-DESIGN lo nombra (Q5). `[RLS]` `perfiles.rol` y `activo` solo los cambia el administrativo o el webhook;
  la baja revoca sesiones en Clerk, no solo cambia la fila. MFA obligatorio para personal. *Tamaño en el límite
  superior*: si crece, separar «altas y catálogos» de «baja».
- **7. Disponibilidad.** Fuente: «Agenda y citas», hito H3. El esquema no impide que dos plantillas del mismo médico se
  solapen, y `slots_disponibles` generaría horarios duplicados: la spec debe decidir cómo prevenirlo.
- **8. Slots.** Fuente: ADR-0010, «Disponibilidad y cálculo de slots». La función **no existe aún** en `migrations/`.
  `[RLS]` Tal como está escrita en TECH-DESIGN (`stable`, sin `security definer`) corre con los permisos de quien la
  llama: un paciente solo ve sus propias citas y ningún bloqueo, así que le mostraría como libres horarios ocupados por
  otros. Para el portal debe devolver ocupación real sin exponer citas ajenas (ver Q3). Criterios: excluye citas
  `reservada` y `confirmada`, bloqueos y horarios pasados.
- **9. Agendar.** Fuente: criterios «Reserva de cita» y «Agendamiento». La acción valida disponibilidad solo para dar un
  mensaje amable; la garantía es el `EXCLUDE`. Prueba de concurrencia real, no secuencial. Deja un punto de extensión
  (sin efecto) para que el ítem 19 conecte los correos sin reescribir la acción. Este ítem la habilita para el
  administrativo; el ítem 16 añade el rol paciente.
- **10. Cancelar y reprogramar.** Fuente: ADR-0012. Límites exactos: 61 minutos se permite, 59 se rechaza. Reprogramar
  cancela la original y crea la nueva en una transacción; si la nueva falla, la original no queda cancelada.
  La cancelación de la original sigue sujeta a la ventana de 1 h. Confirmación previa (botón destructivo de DESIGN.md).
- **11. Estados de la cita.** Fuente: enum `estado_cita`, ADR-0016, políticas denegadas por H2. `[RLS]` `[HC]` Pasar a
  `confirmada` dispara `extender_asignacion_por_cita` y concede acceso de 6 meses a la historia clínica del paciente:
  quién puede confirmar es una decisión de seguridad. Ningún documento define quién confirma ni cómo (Q1).
- **12. Agenda.** Fuente: PRD (el médico consulta sus turnos y citas confirmadas), «Rutas» (`agenda/`). Sin datos
  clínicos. Estados con etiqueta e icono, nunca solo color.
- **13. Reasignación.** Fuente: ADR-0011, criterios «Reasignación por baja». El bloqueo debe existir antes de
  cancelar, porque el disparador de cancelación lo consulta para eximir la ventana. El administrativo revisa y confirma la
  propuesta: el sistema no reasigna solo. Sin sustituto, la cita queda marcada para contacto manual, nunca cancelada en
  silencio: el esquema no tiene dónde guardar esa marca `[TABLA]` (migración nueva con su prueba negativa; Q4).
  Deja el punto de extensión de la notificación de reprogramación, que conecta el ítem 19.

### H4 · `portal-del-paciente`

- **14. Controles de borde.** Fuente: ADR-0026, «Controles adicionales». Hoy no hay código de rate limiting, BotID ni
  cabeceras. Límite de 5 intentos por 15 minutos por IP; la CSP debe seguir permitiendo Clerk y las pruebas E2E de H1.
  TECH-DESIGN menciona Turnstile en «Rutas»: está obsoleto, manda ADR-0026. Sin hito explícito en el plan (Q5).
- **15. Registro y vinculación.** Fuente: criterios «Registro de paciente» (4.º y 5.º). `[RLS]` Hoy un usuario
  autenticado no puede insertar en `pacientes` ni vincular `perfil_id`: hace falta una función acotada o una política
  nueva, con prueba negativa. El registro público solo produce rol `paciente`. Riesgo de suplantación al vincular solo
  por documento (Q3).
- **16. Reservar.** Fuente: criterios «Reserva de cita — portal del paciente», DESIGN.md. Advertencia de 1 h antes de
  confirmar; mensaje exacto si hay doble reserva; no se puede reservar en el pasado ni a nombre de otro paciente.
  Texto base de 18 px, controles de 48 px, trato de usted. E2E del recorrido completo con dos sesiones simultáneas.
- **17. Mis citas y cancelación.** Fuente: PRD (el paciente cancela su propia cita). `[RLS]` Falta la política de
  cancelación del paciente, y RLS no restringe por columna: la spec debe decidir cómo permitir solo
  `estado → cancelada` sobre citas propias (por ejemplo una función acotada), con pruebas negativas (cita ajena,
  otros campos). Esta ruta es la que enlaza el recordatorio por correo.

### H5 · `notificaciones-email`

- **18. Proveedor y plantillas.** Fuente: «Notificaciones», ADR-0017. Ningún correo contiene datos clínicos. El tipo
  `reprogramacion` que pide ADR-0011 no cabe en el `CHECK` de `notificaciones.tipo` (decisión heredada de H2): requiere
  migración nueva. SPF, DKIM y DMARC son una tarea manual del dominio.
- **19. Transaccionales.** Fuente: ADR-0017. La fila se inserta con el estado ya resuelto (`enviada` o `fallida`),
  nunca `pendiente`. `[RLS]` Hoy solo el cron escribe en `notificaciones`: una acción ejecutada por un paciente no
  podría insertar (Q2).
- **20. Cron.** Fuente: ADR-0028, ADR-0017. Un solo cron diario (`0 13 * * *`), `CRON_SECRET`, rol `cron_notificaciones`
  (hoy `NOLOGIN`), solo en los Route Handlers de cron y en CI. La guarda de ADR-0017 comprueba `inicio > now()` pero no el
  estado de la cita: un recordatorio pendiente de una cita cancelada se enviaría. La spec debe excluir también las
  canceladas. Dos ejecuciones seguidas producen un solo envío.
- **21. Fallidas.** Fuente: ADR-0018. Solo lectura, sin reenvío manual. La ruta vive bajo `dashboard/`: el ítem 30 solo
  la enlaza (Q7).

### H6 · `historias-clinicas` (`[HC]` y `[P-1]` en todo el hito)

- **22. CIE-10.** Fuente: ADR-0014. La tabla `cie10` existe; la demostración trae 12 códigos con capítulo `DEMO`, que no
  deben mezclarse con el catálogo real. Migración posterior, nunca edición de la inicial. Operativo: confirmar qué fuente
  está descargable en formato reutilizable.
- **23. Acceso del médico.** Fuente: ADR-0003, ADR-0016, criterios «Control de acceso». `[RLS]` Casos negativos
  obligatorios: administrativo, paciente, enfermera y médico ajeno no reciben fila ni un error que confirme que
  el paciente existe. Registra cada lectura en `accesos_historia`. Incluye la guarda de entorno que impide datos clínicos
  reales mientras P-1 siga abierto (ver `openspec/config.yaml`). *Tamaño en el límite superior*: si crece, separar la
  guarda de entorno.
- **24. Asignación manual.** Fuente: ADR-0016. `[RLS]` El administrativo inserta pero no edita ni borra; el paciente no
  tiene política. *Tamaño en el límite inferior*: se mantiene aparte porque concede acceso a historias y merece su propia
  revisión y pruebas.
- **25. Antecedentes.** Fuente: ADR-0015. Un antecedente resuelto no se borra: se marca `vigente = false`. Si las 5
  categorías no cubren lo que se registra en papel, es un `ALTER TYPE`.
- **26. Registrar atención.** Fuente: criterios «Historia clínica — registro y firma». Motivo, anamnesis, examen físico y
  plan no pueden estar vacíos ni ser solo espacios; al menos un diagnóstico, validado contra `cie10` (el mecanismo
  `CHECK`, disparador o clave foránea funcional lo fija esta spec). Ningún campo editable viene del registro del paciente.
  E2E del recorrido del médico. Ver Q6 sobre historias migradas.
- **27. Firma y addendas.** Fuente: P-1, P-5, criterios de firma. `firmarAtencion` queda detrás de
  `lib/firma/proveedor.ts` para poder cambiarla por una firma certificada. Tras firmar, `UPDATE` y `DELETE` fallan; solo
  se corrige con addenda.
- **28. Adjuntos.** Fuente: ADR-0013, ADR-0024. `[TABLA]` El modelo de datos no tiene dónde vincular el archivo a la
  historia: la spec debe definirla. La autoridad de acceso es la acción que firma la URL, no RLS: es la excepción
  documentada a la regla de CLAUDE.md y exige la misma revisión que las políticas de `atenciones`.

### H7 · `turnos-y-dashboard`

- **29. Turnos de enfermería.** Fuente: criterios «Turnos de enfermería», `asignarTurno`. Sin choque
  `(enfermera, fecha, turno)` y al menos médico o especialidad. `[RLS]` La enfermera solo ve sus turnos y no accede a
  historias ni a funciones administrativas (caso negativo en E2E y pgTAP). Incluye las dos superficies (asignar y
  consultar) porque la segunda es una vista de solo lectura.
- **30. Dashboard.** Fuente: «Dashboard operativo», DESIGN.md. Vistas de Postgres sin materializar. `[RLS]` Las vistas
  deben respetar las políticas del que consulta (`security_invoker`); si no, ignoran RLS. Sin datos clínicos ni gráficos
  analíticos (el PRD excluye BI). «Pacientes en espera» no tiene un estado propio en el enum (Q1).

### H8 (sin change todavía)

- **31. Importación inicial.** Fuente: ADR-0019, fases 1 y 2. `[TABLA]` La bandeja de revisión manual no existe: tabla
  nueva con RLS solo para el administrativo y pantalla de resolución. Se ejecuta con el rol dueño, nunca con el
  de tráfico de usuario, y primero contra un branch de staging. En este proyecto de muestra se ejercita con archivos
  sintéticos. Dueño y plazo de la bandeja: Q8.
- **32. Citas futuras.** Fuente: ADR-0019, fase 3. Las que choquen con el `EXCLUDE` se reportan, no se descartan en
  silencio. No se importa el histórico de citas pasadas.
- **33. Digitalización.** Fuente: ADR-0013, ADR-0019 fase 4. Fase que nunca se «cierra». El indicador de «digitalizada»
  (al menos un antecedente o diagnóstico activo estructurado) se entrega como consulta verificable en base de datos, no
  como módulo de analítica. `[P-1]` Como el administrativo no puede leer ni escribir contenido clínico, la carga recae
  en los médicos a cargo, lo que condiciona alcanzar el 60 % (Q6).
- **34. Respaldo.** Fuente: «Requisitos no funcionales» (export diario cifrado, RPO ≤ 5 min, RTO ≤ 4 h), P-9. Derivado
  de los requisitos no funcionales, no del plan de hitos (Q10). Nunca se restaura el branch principal de Neon.
- **35. Manual y capacitación.** Fuente: PRD, «Supuestos» (migración del 100 % del personal previa capacitación y con
  manual). Entregable de documentación, no de código; se trata como spec solo para que quede planificado y trazable.

## Preguntas abiertas

Dudas que los documentos no resuelven. Donde se propone un punto de partida, es solo para que la spec correspondiente
tenga algo que discutir, no una decisión.

| # | Pregunta | Ítems | Punto de partida sugerido |
|---|---|---|---|
| Q1 | ¿Quién pasa una cita de `reservada` a `confirmada`, y a `atendida` o `no_asistio`, y cómo? ¿Qué significa «paciente en espera»? No hay acción de servidor ni estado definidos, y de `confirmada` depende el acceso del médico (ADR-0016). | 11, 12, 23, 30 | El administrativo confirma y marca asistencia; el médico marca `atendida`; «en espera» es una cita `confirmada` cuya hora ya pasó y no está atendida. Validar con el cliente. **Resuelta (2026-10-08, decisión del cliente):** recepción confirma y marca `no_asistio`; el médico marca `atendida` con una función acotada; lo implementa `agenda-y-reserva` (D13). «En espera» queda como `confirmada` con hora vencida; falta decidir si se registra la llegada real (H7, Q1). |
| Q2 | ¿Cómo escribe `notificaciones` una acción ejecutada por un paciente o administrativo, si solo el cron tiene política de escritura? | 19 | Función acotada con `security definer`, o política de inserción restringida. Decidir en la spec con prueba negativa. **Propuesta en `notificaciones-email`:** función `registrar_aviso_transaccional` (`SECURITY DEFINER`); se formaliza en un ADR nuevo. |
| Q3 | La vinculación por documento del paciente puede permitir que alguien se registre con un DNI ajeno y vea sus citas. ¿Qué verifica la titularidad? Además, `slots_disponibles` debe mostrar ocupación real al paciente sin exponer citas ajenas. | 8, 15 | Comparar al menos correo y fecha de nacimiento con el registro previo; función de slots con `security definer` y solo `inicio` y `fin`. **Propuesta en `portal-del-paciente` y `agenda-y-reserva`:** vinculación por correo verificado + fecha de nacimiento (ADR nuevo) y `slots_disponibles` `SECURITY DEFINER` que devuelve solo `(inicio, fin)`. |
| Q4 | La reasignación por baja necesita una marca de «contacto manual» que el esquema no tiene, y «horario equivalente» no está definido (¿mismo día y hora, tolerancia?). | 13 | Columna o tabla nueva con su prueba negativa; si cambia el modelo, ADR aparte. Tolerancia a fijar con la clínica. |
| Q5 | Tres ítems no pertenecen a una fila explícita del plan de TECH-DESIGN: fundamentos de las acciones (4), gestión de personal y especialidades (6) y controles de borde (14). ¿Se aceptan en H3, H3 y H4? | 4, 6, 14 | Se dejan en H3 (4 y 6) y H4 (14). |
| Q6 | ¿Cómo se modelan los «diagnósticos activos» de ADR-0013 en una historia migrada de papel, si `atenciones` exige los cuatro textos, al menos un diagnóstico y firma? ADR-0013 los ubica en `atenciones` y ADR-0015 los antecedentes en su propia tabla. Quién carga los datos, si el administrativo no puede tocar contenido clínico? | 26, 28, 33 | Decidir en la spec del 26 o con un ADR; probablemente tipo de atención de migración o diagnóstico vigente en el paciente. |
| Q7 | La vista de notificaciones fallidas puede caer en H5 (ADR-0018) o en H7 (dashboard). Este backlog la pone en H5 y el dashboard solo la enlaza. | 21, 30 | Que los changes `notificaciones-email` y `turnos-y-dashboard` no la dupliquen ni la omitan. |
| Q8 | Dueño y plazo de la bandeja de revisión manual de pacientes con documento inválido (pendiente del cliente en ADR-0019). | 31 | Preguntar antes de empezar H8. |
| Q9 | Al importar citas futuras, ¿se envía correo de confirmación a cada paciente? | 32 | No enviar confirmaciones masivas; sí programar `recordatorio_24h`. Validar con el cliente. |
| Q10 | Con un único cron diario ya ocupado por las notificaciones (ADR-0028), ¿con qué mecanismo corre el export diario cifrado? | 34 | Un flujo programado de GitHub Actions; si implica un proveedor nuevo, ADR aparte. |

## Puertas de salida a producción

No son ítems de código; son condiciones que el backlog no puede cerrar y que se arrastran desde TECH-DESIGN:

- **P-1 (bloqueante):** plazo de retención, firma lógica o certificada, y alojamiento fuera de Perú para historias
  clínicas. Sin esto, los ítems 23 a 28 y 33 solo operan con datos sintéticos. Si la respuesta exige datos en Perú, se
  reabre la decisión de hosting (ADR-0020, ADR-0021).
- **P-5:** si la firma lógica no basta, el ítem 27 se completa con un proveedor certificado.
- **P-10:** el MFA obligatorio del personal requiere el plan Pro de Clerk en producción; no desactivarlo para evitar el
  costo.
- **P-9:** confirmar la ventana real de PITR del plan gratuito de Neon.
- **Resend:** dominio propio con SPF, DKIM y DMARC (ítem 18).
- **Neon:** registrar la JWKS de Clerk de producción por API y fijar `LOGIN` y contraseña de `cron_notificaciones` y
  `sync_identidad` por entorno.
- **Riesgos aceptados que no se construyen:** WAF genérico (ADR-0026), segundo canal de notificación (P-7) y gestión de
  consultorios (P-6).

## Desajustes entre documentos detectados (no corregidos aquí)

- TECH-DESIGN, «Rutas»: `registro/` dice Turnstile, pero ADR-0026 lo reemplazó por Vercel BotID. Además describe
  grupos `app/(publico)/`, `app/(paciente)/` y `app/(personal)/`, mientras el código vigente usa `/paciente`,
  `/administrativo`, `/medico` y `/enfermera`.
- ADR-0017 sigue hablando de «cron horario de reintentos»; ADR-0028 lo cambió a diario (ADR-0008 sí lo anota).
- ADR-0018 afirma que el cron «no pasa por RLS» y usa `auth.session() ->> 'rol'`; TECH-DESIGN y las migraciones de H2
  lo hacen pasar por RLS con `rol_actual()`.
- ADR-0011 (y el paso 4 de «Doctor de baja» en TECH-DESIGN) dicen que la cita original se cancela «con
  `reprogramada_de` apuntando a la nueva»; el esquema y los criterios de aceptación de TECH-DESIGN lo guardan en la cita
  nueva, apuntando a la original (columna `citas.reprogramada_de`).
- ADR-0017: la guarda del cron no excluye citas canceladas (ver ítem 20).
