# Proposal

## Why

El criterio de éxito principal del PRD es que **el 75 % de las citas se reserve o se cancele por el propio paciente** en el
portal, sin ayuda y sin llamar a la clínica. Hoy el rol `paciente` solo tiene una página de relleno (`/paciente`) y la base
de datos le deja dos huecos que H2 difirió a propósito a este hito: un paciente recién registrado en Clerk **no tiene fila
en `pacientes`** (solo el administrativo puede insertarla o vincularla) y **no puede cancelar su cita** (la política de
actualización de `citas` para el paciente «la añadirá el flujo de cancelación del portal», migración
`politicas-citas`). Además, el portal es la única superficie pública del sistema y aún no tiene los controles de borde que
fija [ADR-0026](../../../docs/03-arquitectura/adrs/0026-controles-de-borde-antibots-y-rate-limiting.md).

H3 (`agenda-y-reserva`) ya entrega la agenda y la reserva para el administrativo, y H2b (`sistema-de-diseno-ui`) los
componentes y la estructura de pantalla del portal; este change los **reutiliza** para que el paciente haga lo mismo por sí
mismo, con un flujo pensado para un adulto mayor sin ayuda.

## What Changes

- **Registro de autoservicio en dos pasos.** La cuenta se crea en `/registro` (Clerk, ya existe) y una pantalla nueva
  `/completar-registro` pide los datos de identificación: documento **DNI (8 dígitos) o Carné de Extranjería (9 a 12
  caracteres alfanuméricos)**, validados en cliente y servidor, más nombres, fecha de nacimiento y sexo. La pantalla espera
  de forma amable a que el alta de Clerk termine de propagar el rol (hoy un recién registrado cae en la portada pública).
- **Vinculación con `pacientes`.** Una función SQL `SECURITY DEFINER` crea la fila del paciente o **vincula** la que el
  administrativo ya había registrado con ese documento (`perfil_id` nulo), verificando que el correo de la cuenta y la fecha
  de nacimiento coincidan; nunca duplica, nunca une una cuenta a la ficha de otra persona. La política de verificación es
  una decisión de seguridad nueva: ver «ADR pendiente» en Impact.
- **Búsqueda y reserva propia.** Flujo de una tarea por pantalla: especialidad → médico (o médico directo) → día → horario →
  confirmar, sobre la función `slots_disponibles` de H3. Antes de confirmar se muestra médico, servicio, fecha y hora y la
  advertencia de la **ventana de cancelación de 1 hora** con su hora límite. La doble reserva se rechaza con el texto exacto
  `Registro de cita ya agendado` (mapeo de `23P01` y `40P01` de H3); un reintento del mismo paciente es idempotente. No se
  pide «motivo de consulta» en texto libre (el administrativo lee `citas` y no debe ver contenido clínico).
- **«Mis citas» y cancelación propia.** Próximas y anteriores con `TarjetaCita`/`InsigniaEstado` de DESIGN.md. Cancelar solo
  cuando faltan 1 h o más ([ADR-0012](../../../docs/03-arquitectura/adrs/0012-alcance-de-la-ventana-de-cancelacion.md)), con confirmación.
  **BREAKING (solo interno):** se añade la política `paciente cancela su cita` en `citas` y un disparador que limita al
  paciente a cambiar únicamente el estado a `cancelada`.
- **Controles de borde del portal público (ADR-0026).** Vercel BotID en el envío de los datos de registro y en la reserva;
  Upstash Ratelimit en las rutas de autenticación (5 intentos / 15 min por IP) y límites por usuario en las acciones del
  portal (registro, búsqueda, reserva, cancelación). Ninguno sustituye a RLS ni a las restricciones de la base.
- **Aislamiento del paciente comprobado.** Pruebas negativas (pgTAP, E2E y una guarda estática): un paciente no ve ni cancela
  citas de otro, no lee ninguna tabla clínica ni administrativa y el portal no tiene rutas hacia ellas.
- **Usabilidad y accesibilidad como requisitos verificables:** WCAG 2.1 AA con axe sobre cada pantalla y estado, teclado,
  reflujo a 320 px y zoom 200 %, objetivos táctiles, máximo de pasos por tarea y un protocolo de prueba con personas
  mayores. El registro de `origen = 'portal'` y `cancelada_por` deja medible la autogestión.

## Capabilities

### New Capabilities
- `registro-del-paciente`: alta de autoservicio, validación de DNI y Carné de Extranjería, espera del rol tras el alta y
  vinculación segura con la ficha de `pacientes`.
- `busqueda-y-reserva-de-cita`: elegir especialidad, médico, día y horario, ver solo horarios libres y reservar la cita
  propia con la advertencia de cancelación y el rechazo exacto de doble reserva.
- `mis-citas-y-cancelacion`: ver las citas propias (próximas y anteriores) y cancelarlas respetando la ventana de 1 hora.
- `aislamiento-del-paciente`: qué ve y qué puede hacer el rol paciente en la base de datos y en el portal, con los casos
  negativos (citas ajenas, historias clínicas, funciones administrativas).
- `proteccion-del-portal-publico`: anti-bots y rate limiting del portal público (ADR-0026) sin sustituir los límites de la
  base de datos.
- `usabilidad-y-accesibilidad-del-portal`: lenguaje en español con trato de usted, pocos pasos por tarea, WCAG 2.1 AA
  comprobable, móvil primero y autogestión medible.

### Modified Capabilities
<!-- Ninguna: `autenticacion-roles` (única capability en openspec/specs/) no cambia; el registro público sigue produciendo
solo `paciente`. Las capabilities de H2 (`aislamiento-por-rol-rls`, `integridad-de-agenda`) y de H2b/H3 aún no están
sincronizadas en openspec/specs/, así que este change no las modifica: las usa como dependencia. -->

## Impact

- **Hito:** **H4** del plan de TECH-DESIGN («Portal del paciente: registro, búsqueda, reserva, cancelación»). Depende de **H3**
  (`agenda-y-reserva`: `slots_disponibles`, `reservar_cita()`, la cancelación y el mapeo de errores) y de **H2b**
  (`sistema-de-diseno-ui`: `TarjetaCita`, `SelectorHorario`, `Campo`, `CampoDocumento`, `Alerta`, `PortalLayout`); H2 y H1 ya
  están. Los contratos que se asumen de H3 están en `design.md` («Supuestos sobre H3»).
- **Toca RLS: sí, y merece revisión explícita aparte** (riesgo principal declarado del proyecto). Cambios de acceso: una
  política de `UPDATE` nueva en `citas` para el paciente, un disparador de protección de columnas, y dos funciones
  `SECURITY DEFINER` sobre `pacientes` (`registrar_paciente_portal`, `correo_actual`). No se crea ninguna tabla.
- **Historias clínicas:** este change **no lee ni escribe contenido clínico** y no depende de la decisión legal P-1. El alta
  de un paciente crea su carpeta vacía por el disparador `crear_historia_clinica()` de H2; las pruebas de este change
  confirman que el paciente sigue sin acceso a ella. Aun sin ser clínicos, el portal maneja **datos personales** (documento,
  correo, fecha de nacimiento): la nota de P-1 sobre identidad en Clerk fuera de Perú y el eventual consentimiento de datos
  personales (pregunta abierta Q3) deben cerrarse **antes de abrir el portal a pacientes reales**; con datos sintéticos de
  demostración no hay bloqueo.
- **ADR pendiente:** la política de verificación al vincular una ficha preexistente (correo verificado de la cuenta + fecha
  de nacimiento) es una decisión de arquitectura de seguridad nueva. No se decide en este proposal: `design.md` (D3) la
  propone y la tarea 1.2 la formaliza como un ADR nuevo con la skill `architecture` **antes** de aplicar la migración
  (número por asignar al redactarlo: el change `notificaciones-email` ya propone el 0029). Los ADR vigentes que se
  respetan: 0003, 0005, 0006, 0008, 0010, 0012, 0022, 0023, 0026.
- **Código nuevo (previsto):** `migrations/*.sql` (2 archivos), `tests/pgtap/70_*.test.sql` y `71_*.test.sql`,
  `app/completar-registro/`, `app/paciente/citas/`, `app/paciente/citas/nueva/`, `lib/portal/`, `lib/schemas/paciente.ts`,
  `lib/seguridad/`, ajustes en `middleware.ts`, `next.config.ts`, `app/page.tsx` y `app/registro/`, y `e2e/portal-*.spec.ts`.
- **Dependencias nuevas** (con autorización del usuario): `botid`, `@upstash/ratelimit`, `@upstash/redis`.
- **Infraestructura y consolas (pasos manuales):** Clerk (claim `email` en el JWT, verificación de correo obligatoria,
  redirección tras el alta, protección contra bots y bloqueo de cuenta), Vercel (activar BotID, integración de Upstash) y una
  segunda cuenta de paciente de prueba para la E2E de concurrencia.
- **Fuera de alcance:** reprogramar por el paciente (lo hace el administrativo), editar los datos del paciente, recordatorios
  y correos (H5: este change no envía correos ni promete que lleguen), historias clínicas (H6), turnos y dashboard (H7),
  representante de menores o pacientes sin correo, lista de espera, pagos, telemedicina y analítica de BI.
