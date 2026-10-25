# Proposal

## Why

Este change es **H7** del «Plan de implementación sugerido» de TECH-DESIGN.md (turnos de enfermería y dashboard operativo;
depende de H3 y, para la interfaz, de H2b). Hoy la clínica reparte a sus enfermeras con Excel o de palabra, el médico no
tiene dónde ver su jornada y el administrativo no puede ver de un vistazo quién está esperando: de ahí las quejas por
esperas de hasta una hora que motivan el proyecto. Con H2 ya existen las tablas y las políticas (`turnos_enfermeria`,
`citas`, `disponibilidades`, `bloqueos_agenda`) y con H3 existirán la agenda y los horarios libres; falta lo que las
convierte en trabajo diario para tres de los cuatro roles.

La métrica de éxito «tiempo de espera ≤ 20 minutos (hoy ~1 hora)» no se puede mover si nadie ve la espera mientras
ocurre. El dashboard de este change no mide ni analiza: **muestra, en vivo, quién espera y desde cuándo** para que el
personal actúe. Todo lo demás (promedios, históricos, tendencias) es analítica y queda fuera de alcance (PRD, «No alcance»).

## What Changes

- **Gestión de turnos de enfermería (administrativo).** Pantalla semanal en `/administrativo/turnos` para asignar a una
  enfermera una fecha, una franja (mañana, tarde, noche) y **un médico o un servicio** (especialidad), modificar o quitar
  turnos futuros, sin choque de turnos de una misma enfermera (la restricción `unique` de H2 es la defensa real; la acción
  solo traduce el error a un mensaje en español). Server Actions `asignarTurno` (ya prevista en TECH-DESIGN),
  `actualizarTurno` y `quitarTurno`.
- **Vista de la enfermera.** `/enfermera` muestra su turno de hoy y los de los próximos 14 días, y con qué médico o servicio
  trabaja. **Nada más:** ni pacientes, ni citas, ni historias clínicas, ni turnos de otras enfermeras (caso negativo
  verificado en la base de datos).
- **Vista del médico («Mi jornada»).** `/medico` muestra sus horarios de atención y sus citas **confirmadas** de hoy y de
  los próximos 7 días, solo las suyas, sin ningún dato clínico, y un botón **«Marcar atendida»** que llama a la acción de H3
  (decisión del usuario: la recepción confirma y marca «no asistió»; el médico marca «atendida»; H3 es dueño de las
  transiciones y H7 solo las consume).
- **Dashboard operativo (administrativo).** `/administrativo/dashboard`, de solo lectura y sin gráficos: citas de hoy por
  estado, **pacientes en espera con los minutos transcurridos desde la hora de su cita** (resaltado a partir de 20 min),
  un **resumen por médico de la agenda del día con sus huecos libres visibles** (con enlace a la agenda completa que
  construye H3, que H7 no reimplementa), citas de mañana que siguen sin confirmar y cuántas citas esperan reasignación por la baja de un médico (con enlace al flujo de H3) y cuántas notificaciones
  fallidas esperan revisión (con enlace a la vista de H5, que H7 no duplica). Se actualiza solo cada 60 s y el usuario puede pausarlo.
- **Base de datos: solo vistas, ninguna tabla nueva.** Dos vistas `security_invoker` (`dashboard_citas`,
  `turnos_enfermeria_con_aviso`) para que la RLS de H2 siga siendo la autoridad, y una prueba global que falla si alguna
  vista futura del esquema `public` omite `security_invoker`.
- **Punto de contacto con H3 (baja del médico).** Si un médico cae de baja o se le crea un `bloqueo_agenda`, H3 reasigna
  sus **citas**; los **turnos de enfermería** de ese médico no se tocan solos. H7 solo los marca al administrativo como
  «turnos con aviso» para que los reasigne él. No duplica ni modifica el flujo de H3.
- **Datos de demostración:** el script de siembra suma citas de hoy y de mañana en distintos estados y un turno con
  médico ausente, para poder ver el dashboard con vida.

## Capabilities

### New Capabilities
- `turnos-de-enfermeria`: el administrativo asigna, modifica y quita turnos de enfermería sin choques; la enfermera ve su
  turno y con quién trabaja y nada más; el administrativo ve los turnos afectados por la ausencia de un médico.
- `dashboard-operativo`: vista operativa de solo lectura para el administrativo con citas de hoy por estado, pacientes en
  espera, resumen de la agenda del día por médico con huecos, citas de mañana sin confirmar y notificaciones fallidas, sin
  datos clínicos y sin analítica.
- `jornada-del-medico`: el médico consulta sus horarios de atención y sus citas confirmadas, solo las propias.

### Modified Capabilities
<!-- Ninguna: `autenticacion-roles` no cambia, y las políticas de `aislamiento-por-rol-rls` (change esquema-rls-pgtap,
     aún sin archivar) se usan tal como están; este change no añade ni cambia ninguna política. -->

## Impact

- **Hito:** H7 (TECH-DESIGN, «Plan de implementación sugerido»). Depende de **H3** (`agenda-y-reserva`: `slots_disponibles`,
  la agenda del día completa a la que enlaza el dashboard, el tipo de resultado y el traductor de errores; ver supuestos en
  `design.md`) y de **H2b** (`sistema-de-diseno-ui`: `TablaAgenda`,
  `InsigniaEstado`, `Campo`, `ConsolaLayout`, `lib/ui/navegacion.ts`, `lib/ui/formato.ts`). No depende de H4, H5 ni H6; no
  espera a la decisión legal P-1.
- **Acceso a historias clínicas y RLS:** este change **no toca** el acceso a historias clínicas ni cambia una sola
  política RLS, pero añade vistas sobre `citas`/`pacientes`/`turnos_enfermeria` y pantallas que muestran nombres y
  documentos de pacientes. Es superficie de RLS y merece la revisión aparte del agente `code-review` antes del merge
  (tarea 11.2). Los casos negativos que prueba: la enfermera no ve citas, pacientes ni historias; el médico no ve turnos de
  enfermería ni citas de otro médico; el paciente y la enfermera no leen el dashboard; ninguna pantalla ni vista expone
  diagnóstico, nota de atención ni el `motivo` de la cita.
- **Decisión legal P-1:** no depende de ella. No maneja datos clínicos. Los datos que muestra son logísticos (nombre,
  documento, hora, estado); aun así, antes de usarlo con pacientes reales rige lo de siempre: el sistema es un proyecto de
  muestra y solo usa datos sintéticos de demostración.
- **ADR relevantes (sin decisión nueva):** [ADR-0003](../../../docs/03-arquitectura/adrs/0003-control-de-acceso-a-historias-clinicas.md)
  (RLS como autoridad), [ADR-0006](../../../docs/03-arquitectura/adrs/0006-contratos-de-api-via-server-actions.md) (Server Actions con
  resultado tipado), [ADR-0008](../../../docs/03-arquitectura/adrs/0008-resiliencia-y-manejo-de-errores.md) (SQLSTATE a mensaje en
  español), [ADR-0011](../../../docs/03-arquitectura/adrs/0011-reasignacion-de-citas-por-baja-medica.md) (flujo de baja, que es de H3),
  [ADR-0016](../../../docs/03-arquitectura/adrs/0016-vigencia-de-asignacion-paciente-medico.md) (por qué el médico ve al paciente de una
  cita confirmada), [ADR-0018](../../../docs/03-arquitectura/adrs/0018-visibilidad-de-notificaciones-fallidas.md) (la vista de detalle de
  fallidas) y [ADR-0023](../../../docs/03-arquitectura/adrs/0023-contexto-de-usuario-para-rls.md) (contexto de usuario). **No requiere una
  ADR nueva:** implementa la sección «Dashboard operativo» de TECH-DESIGN, que ya decide «vistas de Postgres sin
  materialización». Lo que sí la exigiría (una columna de llegada del paciente, o que el médico vea a la enfermera
  asignada) está anotado como pregunta abierta en `design.md`, no decidido aquí.
- **Código nuevo:** `migrations/*.sql` (dos vistas), `tests/pgtap/62_*` a `67_*` y `98_*`, `tests/concurrencia/20_turnos`,
  `lib/turnos/`, `lib/dashboard/`, `lib/medico/`, `lib/schemas/turno.ts`, `components/clinica/` (resumen por médico, resumen
  por estado, lista de espera, semana de turnos, refresco automático), páginas `app/administrativo/turnos/`,
  `app/administrativo/dashboard/`, y el contenido de `app/medico/page.tsx` y `app/enfermera/page.tsx` (conservan sus
  encabezados «Panel del médico» y «Panel de enfermería»), `e2e/`.
- **Dependencias nuevas:** ninguna. Reutiliza `date-fns`, `date-fns-tz`, Zod y los componentes que trae H2b; las
  pantallas de formulario son rutas, no diálogos, para no sumar primitivos de Radix.
- **Infraestructura:** ninguna variable de entorno nueva. Un paso manual de consola: activar TOTP en las cuentas de prueba
  de médico y enfermera de la instancia de desarrollo de Clerk para poder probar sus pantallas de punta a punta
  (hoy solo el administrativo tiene TOTP en las E2E).
- **Fuera de alcance (no se construye ni se sugiere):** analítica de esperas (promedios, históricos, gráficos, exportes),
  registro de la llegada del paciente, gestión de consultorios (P-6), notificaciones de cambio de turno a la enfermera,
  intercambio o solicitud de turnos por la propia enfermera, cálculo de horas trabajadas o nómina, la agenda del día
  completa con acciones de reprogramar y cancelar (es de H3), las transiciones de estado de las citas (son de H3; H7 solo
  llama a la del médico) y cualquier cambio del flujo de reasignación por baja (H3).
