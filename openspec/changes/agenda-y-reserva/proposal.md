# Proposal

## Why

Este change es **H3** del "Plan de implementación sugerido" de TECH-DESIGN.md («Agenda: disponibilidades, slots,
reserva con anticruce (panel administrativo)»; depende de H2, ya aplicado, y de H2b `sistema-de-diseno-ui` para los
componentes visuales). H2 dejó el esquema, las restricciones y las políticas RLS, pero **no hay ninguna pantalla ni
Server Action de agenda**: hoy el personal administrativo sigue agendando en Excel y Google Forms, que es justamente la
causa de los cruces de citas, las cancelaciones sin seguimiento y el tiempo de espera de ~1 hora que el PRD quiere
eliminar. Sin este change no se puede construir el portal del paciente (H4), las notificaciones (H5) ni el dashboard
(H7), que se apoyan en los mismos cálculos de horarios y en la misma operación de reserva.

El PRD fija cinco reglas que este change hace cumplir de punta a punta: doble reserva bloqueada con el mensaje exacto
`Registro de cita ya agendado`, ventana de cancelación de 1 hora (también para el administrativo), flujo de
reasignación cuando un médico se da de baja, identificación del paciente por DNI o Carné de Extranjería, y fechas
`timestamptz` mostradas en `America/Lima`.

## What Changes

- **Disponibilidades y bloqueos** (panel administrativo): el administrativo define la plantilla semanal de cada médico y
  sus ausencias (`bloqueos_agenda`). Nueva restricción en la base de datos para que dos horarios vigentes del mismo médico
  no se solapen (hoy nada lo impide y duplicaría los slots), y auditoría de los bloqueos por su efecto sobre la ventana de
  cancelación ([ADR-0012](../../../docs/03-arquitectura/adrs/0012-alcance-de-la-ventana-de-cancelacion.md), riesgo residual).
- **Cálculo de slots en consulta** ([ADR-0010](../../../docs/03-arquitectura/adrs/0010-calculo-de-disponibilidad-de-slots.md)):
  `slots_disponibles(médico, fecha)` como función `SECURITY DEFINER` (el paciente no puede leer `bloqueos_agenda`, así que
  H2 dejó este cálculo a cargo de H3/H4), más `horario_en_agenda()` para validar en la base de datos que una reserva cae
  exactamente en un slot de la plantilla y fuera de los bloqueos.
- **Reserva, reprogramación y cancelación por el administrativo**, con la regla de negocio en la base de datos:
  `reservar_cita()` y `reprogramar_cita()` (cancela la original y crea la nueva en **una** transacción, requisito de
  atomicidad que el driver HTTP de Neon solo permite como una función, no como lógica de aplicación entre sentencias).
  La doble reserva la sigue deteniendo el `EXCLUDE` de H2; este change añade el **mapeo** de `23P01` **y** `40P01` al
  mensaje exacto en todo punto de inserción, y la prueba de concurrencia a través de esas funciones.
- **Ciclo de estados de la cita** (decisión del cliente; H3 es su dueño y H6 y H7 lo consumen): la recepción (administrativo)
  confirma una cita (`reservada → confirmada`, mientras no haya terminado) y marca «No asistió» (`confirmada → no_asistio`,
  solo desde la hora de inicio); el **médico dueño** de la cita la marca «Atendida» (`confirmada → atendida`) mediante una
  operación acotada, `marcar_cita_atendida()`, que cambia solo el estado — el médico no recibe `UPDATE` sobre `citas` ni el
  administrativo puede marcar «Atendida»—. Un disparador (`validar_transicion_estado()`) cierra el resto: ninguna otra
  transición es válida y una cita nueva solo nace `reservada`. Acciones `confirmarCita`, `marcarNoAsistio` (agenda
  administrativa) y `marcarAtendida` (para la jornada del médico de H7); ninguna emite evento: H5 no lo necesita.
- **Ventana de 1 hora y advertencia**: el formulario de reserva muestra, antes de confirmar, que la cita solo puede
  cancelarse hasta 1 hora antes (con la hora límite en Lima); `cancelarCita` y `reprogramarCita` traducen el rechazo del
  trigger `validar_cancelacion()`.
- **Reasignación por baja o emergencia** ([ADR-0011](../../../docs/03-arquitectura/adrs/0011-reasignacion-de-citas-por-baja-medica.md)): este
  change **posee** el flujo completo (H7 no lo duplica): registrar la baja, listar las citas afectadas
  (`citas_por_reasignar`), proponer sustitutos de la misma especialidad (`propuestas_reasignacion()`), reasignar cada
  cita en su propia transacción (`reasignar_cita_por_baja()`), y dejar **marcadas para contacto manual** las que no tengan
  sustituto. Nunca se cancela una cita en silencio.
- **Identificación del paciente**: esquema Zod compartido de DNI (8 dígitos) y Carné de Extranjería (9 a 12
  alfanuméricos, normalizado a mayúsculas), búsqueda de pacientes por documento o apellido y registro de pacientes por el
  administrativo (`buscarPacientes`, `registrarPaciente`). El registro público y la vinculación con una cuenta del portal
  son de H4.
- **Contratos de aplicación** ([ADR-0006](../../../docs/03-arquitectura/adrs/0006-contratos-de-api-via-server-actions.md),
  [ADR-0008](../../../docs/03-arquitectura/adrs/0008-resiliencia-y-manejo-de-errores.md)): resultado tipado
  `{ ok, datos } | { ok: false, mensaje, codigo }`, traducción central de `SQLSTATE` a mensajes en español (nunca texto
  crudo de Postgres) y un punto de extensión **sin efecto** para eventos de cita que H5 conectará a Resend.
- **Pantallas del administrativo** sobre los componentes de H2b (`TablaAgenda`, `SelectorHorario`, `InsigniaEstado`,
  `TarjetaCita`, `Alerta`, `Campo`/`CampoDocumento`): agenda del día con huecos libres, nueva cita, pacientes, horarios y
  bloqueos, y bajas médicas con reasignación. Fechas y horas siempre en `America/Lima`.

**Sin tablas nuevas.** Las migraciones añaden una restricción, dos disparadores (auditoría de bloqueos y validación de
transiciones), funciones y una vista; ninguna toca las políticas de historias clínicas.

**Fuera de alcance:** portal del paciente, registro público de pacientes y vinculación por documento (H4); envío de
correos, recordatorios y el tipo de notificación de reprogramación (H5); historias clínicas y `asignarPacienteAMedico`
(H6); turnos de enfermería y dashboard (H7); alta o baja definitiva de médicos (`medicos.activo`) y la vista de agenda del
médico. Pagos, telemedicina, laboratorios/farmacias, inventario, multi-sede y analítica de BI siguen fuera del producto.

## Capabilities

### New Capabilities

- `disponibilidad-y-slots`: plantilla semanal y bloqueos del médico gestionados por el administrativo, sin solapes, y
  cálculo en consulta de los slots libres (sin exponer bloqueos ni datos de otros pacientes).
- `gestion-de-citas`: reservar, reprogramar y cancelar por el administrativo con doble reserva bloqueada en la base de
  datos (`23P01` y `40P01` → `Registro de cita ya agendado`), ventana de 1 hora para todos los roles, advertencia al
  reservar, ciclo de estados (confirmar y «No asistió» por la recepción, «Atendida» por el médico dueño, transiciones
  inválidas rechazadas), fechas en `America/Lima`, resultado tipado y eventos de cita para H5.
- `reasignacion-por-baja-medica`: flujo de baja del médico → citas afectadas → sustitutos de la misma especialidad →
  reasignación atómica por cita → contacto manual cuando no hay sustituto, sin conceder acceso a historias clínicas.
- `identificacion-de-pacientes`: validación de DNI y Carné de Extranjería, registro y búsqueda de pacientes por el
  administrativo, sin documentos duplicados.

### Modified Capabilities

_(ninguna — `autenticacion-roles` no cambia sus requisitos. La capability `integridad-de-agenda` de H2 sigue sin archivar
y por eso no figura en `openspec/specs/`: la restricción nueva de no solape de horarios vive en `disponibilidad-y-slots`.
Al archivar ambos changes conviene revisar si se consolidan.)_

## Impact

- **Hito:** H3, tras H2 y H2b; habilita H4, H5, H6 y H7. Contratos que esos changes deben respetar: `reservar_cita()` como
  único punto de inserción de citas, el tipo `ResultadoAccion`, el traductor de errores, `slots_disponibles()`, la vista
  `citas_por_reasignar`, el punto de extensión de eventos de cita y el ciclo de estados (`marcar_cita_atendida()`,
  `marcarAtendida`; lo consumen H6 —acceso del médico desde `confirmada`, ADR-0016— y H7 —botón «Atendida» en la jornada del
  médico—). Detalle en `design.md`, «Contratos hacia H4, H5, H6 y H7».
- **RLS y datos clínicos (revisión aparte, riesgo principal del proyecto):** el change **no toca** las políticas de
  `historias_clinicas`, `atenciones`, `addendas`, `antecedentes` ni `asignaciones_paciente_medico`, y **no concede acceso
  a historias clínicas a nadie**. Sí introduce superficie de seguridad que merece revisión: dos funciones
  `SECURITY DEFINER` (`slots_disponibles`, `horario_en_agenda`) que leen `bloqueos_agenda` y `citas` saltándose la RLS del
  paciente a propósito, otra (`marcar_cita_atendida`) que actualiza `citas` por encima de la RLS pero solo el estado y solo
  para el médico dueño, funciones `SECURITY INVOKER` con comprobación de rol, un disparador de transiciones y una vista con
  `security_invoker`. Cada una trae su prueba pgTAP negativa. **Efecto sobre el acceso a historias clínicas:** confirmar una
  cita es el hecho que genera la asignación paciente-médico (ADR-0016) y por tanto el acceso del médico a la historia; este
  change añade la acción que lo dispara (solo la recepción), la acota (no se puede confirmar una cita que ya terminó, para no
  conceder acceso retroactivo) y no cambia la regla. La reasignación por baja crea la cita nueva como `reservada` y **nunca**
  hereda `confirmada`: el médico sustituto obtiene acceso solo cuando la recepción confirma esa cita nueva.
- **Decisión legal P-1:** el change no maneja contenido clínico y no depende de P-1. Sí guarda datos personales de
  pacientes (documento, correo, teléfono) y `citas.motivo` es texto libre: la consulta legal ya prevista debe cubrir esos
  datos antes de cargar pacientes reales; con datos sintéticos de demostración no hay bloqueo.
- **ADR:** no se necesita una ADR nueva; implementa los ADR 0005, 0006, 0008, 0010, 0011, 0012, 0016 y 0023. Las
  decisiones de implementación (funciones compuestas por la restricción del driver HTTP, `SQLSTATE` propios, extensión del
  resultado tipado) están razonadas en `design.md`; si la revisión las considera arquitectura, se elevan a ADR aparte. Al
  archivar se proponen notas fechadas en ADR-0008 (códigos nuevos) y ADR-0011 (dirección de `reprogramada_de`).
- **Código:** `migrations/*.sql` (5 archivos nuevos), `lib/citas/` (incluye `transiciones.ts`), `app/medico/acciones-cita.ts`, `lib/acciones/`, `lib/schemas/`, `lib/fechas/`,
  `lib/notificaciones/eventos-cita.ts`, `lib/auth/accion-personal.ts`, `app/administrativo/{agenda,pacientes,horarios,bajas}/`
  con sus `acciones.ts`, `lib/ui/navegacion.ts` (destinos disponibles), `tests/pgtap/`, `tests/concurrencia/`, `tests/agenda/`
  y `e2e/`.
- **Dependencias nuevas:** ninguna propia; usa `date-fns`, `date-fns-tz`, Zod y los componentes que H2b incorpora.
- **Infraestructura:** ninguna nueva (sin variables de entorno ni roles de Postgres); las migraciones corren en el flujo
  existente de `neon-branch-pr.yml` y `migrar-produccion.yml`.
- **Riesgos:** dos administrativos o un administrativo y un paciente reservando el mismo horario a la vez (cubierto por el
  `EXCLUDE`, ahora probado a través de las funciones); la restricción nueva sobre `disponibilidades` puede fallar si
  hubiera datos solapados (se verifica contra el branch con datos de demostración); preguntas abiertas en `design.md`.
