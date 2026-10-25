# Design

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/`. Estado de partida, verificado en el
repositorio (2026-10-08):

- **Base de datos (H2, aplicada):** `turnos_enfermeria` ya existe con `unique (enfermera_id, fecha, turno)`,
  `check (medico_id is not null or especialidad_id is not null)`, RLS activada y dos políticas: la enfermera lee los suyos,
  el administrativo gestiona todo; médico y paciente no tienen política. `enfermeras_lee_la_propia`,
  `medicos_lee_todo_rol`, `especialidades_lee_todo_rol` y `perfiles_lee_los_medicos` permiten a la enfermera resolver el
  nombre y la especialidad de su médico **sin ninguna política nueva**. `citas`: el administrativo gestiona todas, el médico
  lee las suyas, la enfermera no tiene política. `bloqueos_agenda`: el administrativo lee todos, el médico los propios.
  `notificaciones`: solo lectura del administrativo. `pacientes`: el médico ve a quien tiene en una cita vigente. No hay
  **ninguna vista** en el esquema, y los privilegios por defecto de `authenticated` están revocados (cada objeto necesita su
  `GRANT`).
- **Aplicación (H1):** `app/administrativo`, `app/medico` y `app/enfermera` son páginas de relleno que ya hacen
  `auth.protect()`, `exigirRol(...)` y la comprobación de MFA, con los encabezados que buscan las E2E («Panel del médico»,
  «Panel de enfermería»). `lib/db/cliente-autenticado.ts` expone `transaccionAutenticada(consultas)`: una transacción HTTP
  de Neon cuya primera sentencia es `set local role authenticated`.
- **Lo que este change no puede asumir que ya existe** (se verifica en la tarea 1.1, con punto de parada). Los changes de H3
  (`agenda-y-reserva`) y H5 (`notificaciones-email`) se planifican en paralelo; esto es lo que declaran hoy:
  - **H3:** `slots_disponibles(médico, fecha)` como función `SECURITY DEFINER` que devuelve vacío si el rol no es
    administrativo ni paciente (sirve al dashboard, no a la jornada del médico); la **agenda del día completa** del
    administrativo con citas, estados y huecos (`gestion-de-citas`); la vista `citas_por_reasignar` (`security_invoker`);
    `ResultadoAccion`, el traductor central de errores y `exigirPersonal('administrativo')`; el destino `app/administrativo/…`
    de agenda, pacientes, horarios y bajas. H3 **no** construye la vista del médico (su Q5 la sugiere para H7). Por **decisión del usuario**,
    H3 es dueño de las transiciones de estado: la recepción (administrativo) confirma y marca «no asistió»; el médico marca
    «atendida» con una función acotada (`confirmada → atendida`, solo en sus propias citas, sin `UPDATE` directo sobre `citas`).
  - **H5:** la vista de notificaciones fallidas (ADR-0018) en `app/administrativo/notificaciones/`; H5 dice que H7 solo enlaza.
  - **H2b** (`sistema-de-diseno-ui`, 0/29 tareas): `InsigniaEstado`, `TablaAgenda`, `Campo`, `Alerta`, `ConsolaLayout`,
    `lib/ui/navegacion.ts`, `lib/ui/formato.ts`, `lib/ui/estados-cita.ts` y los tokens de `docs/02-diseno/DESIGN.md`.
- **TECH-DESIGN, «Dashboard operativo»,** ya decide el contenido (citas de hoy por estado, agenda del día por médico con
  huecos, pacientes en espera y minutos, citas de mañana sin confirmar, notificaciones fallidas con 3+ intentos) y el
  mecanismo («vistas de Postgres sobre `citas`… sin materialización»). Este design lo concreta; no lo reabre.
- **E2E:** hoy solo el paciente y el administrativo (con TOTP) tienen sesión automatizada; las cuentas de médico y enfermera
  existen en `.env.example` pero no tienen secreto TOTP, y el MFA obligatorio las redirige a `/configurar-mfa`.

## Goals / Non-Goals

**Goals:**
- Que la RLS de H2 siga siendo la **única** autoridad de acceso: ninguna vista ni pantalla de este change amplía quién ve qué.
- Que «en espera» y «hueco» tengan una definición única, documentada y probada, y que el dashboard no pueda desviarse de
  ella (ni de la lógica de reserva de H3).
- Pantallas pequeñas y rápidas de usar para el administrativo; accesibles (WCAG 2.1 AA) y sin sumar dependencias.

**Non-Goals:**
- Analítica de esperas (promedios, históricos, gráficos, exportes): es BI y está fuera de alcance.
- Cambiar el estado de las citas desde el dashboard o implementar las transiciones (son de H3; H7 solo ofrece al médico el
  botón que llama a la suya), reimplementar la agenda del día completa o la reasignación por baja
  (H3), duplicar la vista de notificaciones fallidas (H5), notificar cambios de turno a la enfermera, gestionar consultorios
  (P-6).
- Registrar la llegada del paciente (columna o estado nuevo): requeriría ADR (ver preguntas abiertas).

## Decisions

### D1. Dos vistas `security_invoker` y ninguna tabla nueva; una prueba global que las vigila
El dashboard lee de `public.dashboard_citas`: una fila por cita de **hoy y de mañana** (día calendario de Lima) con
médico, especialidad, paciente (nombres, tipo y número de documento), `estado`, `inicio`, `fin`, `dia` (`'hoy'`/`'manana'`)
y `minutos_espera` (nulo salvo que la cita esté en espera, ver D2). **No incluye `motivo`** ni ningún dato clínico. Los
turnos con aviso salen de `public.turnos_enfermeria_con_aviso` (D8). Ambas:

```sql
-- Ilustrativo; la migración real fija nombres de columna y se prueba con pgTAP.
create view public.dashboard_citas with (security_invoker = true) as
select c.id as cita_id, c.inicio, c.fin, c.estado, /* dia, medico, especialidad, paciente… */
       case when c.estado = 'confirmada' and c.inicio <= now()
            then floor(extract(epoch from now() - c.inicio) / 60)::int end as minutos_espera
from public.citas c
  join public.medicos m on m.id = c.medico_id /* … perfiles, especialidades, pacientes … */
where (select public.rol_actual()) = 'administrativo'
  and c.inicio >= public.hoy_lima()::timestamp at time zone 'America/Lima'
  and c.inicio <  (public.hoy_lima() + 2)::timestamp at time zone 'America/Lima';
grant select on public.dashboard_citas to authenticated;   -- sin acceso para anonymous
```

- **Por qué `security_invoker`:** una vista normal se ejecuta con los privilegios de su dueño (`neondb_owner`, que tiene
  `BYPASSRLS`) y **saltaría la RLS** de `citas` y `pacientes`: sería exactamente la filtración que ADR-0003 y CLAUDE.md
  prohíben. Con `security_invoker = true` (PostgreSQL 15+, la versión mínima de TECH-DESIGN) cada tabla de la vista se evalúa
  con la identidad del usuario que consulta.
- **Doble cerrojo:** además de la RLS, la propia vista filtra por `rol_actual() = 'administrativo'`. Si alguien concediera
  por error más acceso a `citas`, la vista seguiría devolviendo cero filas a los demás roles.
- **Rango del día:** intervalo semiabierto en horas de Lima calculado desde `hoy_lima()` (que ya se usa en H2 porque
  `current_date` depende del `TimeZone` del servidor). Se expresa como rango sobre `inicio` y no como
  `inicio::date = …` para que la consulta use `citas_estado_inicio_idx` / `citas_medico_inicio_idx`. Perú no tiene horario de
  verano, así que el día de Lima mide siempre 24 h.
- **Prueba global nueva** `98_vistas_con_security_invoker`: toda vista de `public` debe tener `security_invoker=true` en
  `reloptions`. Es el equivalente, para vistas, de `99_rls_en_todas_las_tablas`: una vista futura que omita la opción rompe
  la suite en vez de abrir un hueco en silencio.
- *Alternativas:* (a) vistas normales o `SECURITY DEFINER` con filtros manuales: descartadas, trasladan la seguridad a
  cada `WHERE` escrito a mano. (b) Consultas SQL sueltas en el código de la aplicación: funcionan con RLS, pero repiten el
  rango de Lima y la definición de espera en cada sitio y no se pueden probar con pgTAP; TECH-DESIGN ya eligió vistas.
  (c) Vistas materializadas: sin motivo con el volumen de una clínica y obligarían a refrescarlas.

### D2. «En espera» es un estado derivado, no un campo nuevo
Un paciente **está en espera** cuando su cita de hoy está `confirmada`, su `inicio` ya llegó y todavía no es `atendida`. Los
minutos son `floor((now() − inicio) / 60 s)` con el reloj de la base de datos (no el del navegador). El umbral de resalte es
la constante `UMBRAL_ESPERA_MIN = 20` (la métrica de éxito del PRD), aplicada en la capa de presentación; el resalte lleva
siempre texto e icono.

- **Decisión del usuario sobre las transiciones:** la recepción confirma la cita (y marca «no asistió»); el médico la marca
  atendida. Por eso solo `confirmada` cuenta: una cita `reservada` con la hora vencida todavía no pasó por recepción y no se
  trata como espera (sigue visible en el resumen por estado). La cita sale de la lista cuando el médico la marca atendida, la
  recepción la marca «no asistió» o se cancela.
- **Limitación aceptada:** sin registro de la llegada real del paciente, la espera se mide desde la hora de la cita y no desde
  que el paciente llegó, y un paciente confirmado que nunca llegó cuenta como «en espera» hasta que la recepción lo marque
  «no asistió». Y el criterio de éxito «≤ 20 min» **no se puede medir** con lo que existe: el dashboard ayuda a reducir la
  espera en vivo, no a certificarla. Queda como pregunta abierta (Q1), sin resolver aquí.
- *Alternativas descartadas:* estado nuevo `en_sala` o columna `llegada_en` (cambia el esquema y el proceso de recepción:
  exige ADR y decisión del cliente); contar también `reservada` (contradice la decisión del usuario de que la recepción
  confirma y haría crecer la lista con citas que nadie ha atendido en recepción).

### D3. Resumen por médico con huecos: reutiliza el cálculo de la reserva y no reimplementa la agenda de H3
H3 construye la **agenda del día completa** (citas, estados, huecos y acciones de agendar, reprogramar y cancelar). El
dashboard no la repite: ofrece una **fila de resumen por médico** (citas por estado, pacientes en espera y mayor espera,
huecos libres que quedan hoy como rangos, bloqueo del día) con un enlace «Ver agenda» a la de H3. Los datos salen de la misma
transacción: las filas de `dashboard_citas`, los bloqueos de hoy y `slots_disponibles(medico, hoy)`. Los slots contiguos
(`fin` de uno = `inicio` del siguiente) se agrupan en rangos en TypeScript (`fusionarHuecos`, función pura con pruebas) y la
fila muestra hasta cuatro, con «+N más». Se consulta solo a médicos activos con `disponibilidades` vigentes hoy o con citas hoy.

- **Por qué reutilizar:** ADR-0010 fija una única definición de «horario libre» (descarta citas `reservada`/`confirmada` y
  bloqueos). Un cálculo propio divergiría de lo que ofrecen la reserva y la agenda de H3. `slots_disponibles` ya descarta lo
  que pasó (`inicio > now()`), justo lo que interesa: huecos aprovechables hoy.
- **Dependencia de H3:** la función y la ruta de la agenda son de H3. Si al aplicar H7 no existen o cambiaron de firma o de
  parámetros, se detiene (tarea 1.1) y se adapta el único punto que las usa, `lib/dashboard/huecos.ts` (y el enlace). Como la
  función devuelve vacío a quien no es administrativo ni paciente, el dashboard (solo administrativo) la usa correctamente y la
  jornada del médico **no** la usa.
- El bloqueo se muestra **sin motivo** (puede ser información personal, p. ej. una licencia médica).
- *Alternativas descartadas:* incrustar la agenda completa de H3 en el dashboard (acopla los dos changes y duplica sus
  acciones); recalcular huecos en el cliente desde `disponibilidades` y `citas` (duplica ADR-0010).

### D4. Rutas dentro de las áreas existentes, sin grupos de rutas
Se respeta la decisión D8 de H2b (cada área conserva su ruta y gana su `layout.tsx`; TECH-DESIGN dibujaba `(personal)/…`
antes de que existiera la aplicación):

| Ruta | Rol | Contenido |
|---|---|---|
| `/administrativo/turnos` | administrativo | Semana de turnos (tabla enfermeras × días), avisos, acceso a asignar/editar |
| `/administrativo/turnos/nuevo` | administrativo | Formulario de asignación (admite `?enfermera=&fecha=&franja=`) |
| `/administrativo/turnos/[id]` | administrativo | Edición y baja de un turno |
| `/administrativo/dashboard` | administrativo | Dashboard operativo |
| `/medico` | médico | «Panel del médico» + «Mi jornada» |
| `/enfermera` | enfermera | «Panel de enfermería» + «Mi turno» |

Cada página llama a `auth.protect()`, `exigirRol(...)` y la comprobación de MFA, como las de H1 (la regla de ESLint
`@clerk/next/require-auth-protection` lo exige). Los destinos nuevos se activan en `lib/ui/navegacion.ts`
(`disponible: true`). Los enlaces salientes del dashboard van a destinos de otros changes y solo se muestran si el destino
está `disponible`: la agenda de H3 (`/administrativo/agenda`), las bajas médicas de H3 (`/administrativo/bajas`) y la revisión
de fallidas de H5 (`/administrativo/notificaciones`); los nombres exactos se confirman en la tarea 1.1.
*Alternativa:* crear `/medico/jornada` y `/enfermera/turno`: no aporta nada con una sola pantalla por área y rompe el
patrón de portadas de H1/H2b.

### D5. Los formularios de turnos son rutas, no diálogos
Asignar y editar usan páginas con Server Actions y `useActionState`, los componentes `Campo`/`Alerta` de H2b y navegación
normal. Los diálogos modales exigen primitivos de Radix que H2b no instala (solo `button`, `input`, `label`, `textarea`,
`alert`, `badge`, `card`, `table`) y trampas de foco que hay que probar; una ruta es accesible y recuperable por defecto
(botón «atrás», enlace directo desde la tabla). El administrativo elige **«Con un médico»** o **«En un servicio»** con un
grupo de opciones, y el formulario solo muestra el selector de la opción elegida.

### D6. Server Actions de turnos, con la base de datos como autoridad
`asignarTurno` (ya listada en TECH-DESIGN), `actualizarTurno` y `quitarTurno`, en `lib/turnos/`. Cada una: (1) valida con Zod
(`lib/schemas/turno.ts`): uuid de enfermera, fecha `YYYY-MM-DD` real, franja del enum y **exactamente uno** de
`medicoId`/`especialidadId`; (2) en la misma transacción HTTP lee `hoy_lima()` y el estado `activo` de la enfermera y del
médico para dar el mensaje preciso; (3) escribe como `authenticated`; (4) traduce el error y devuelve
`{ ok: true, datos } | { ok: false, mensaje }` (ADR-0006), nunca la excepción cruda (ADR-0008). Reutiliza el
`ResultadoAccion`, el traductor central de errores y `exigirPersonal('administrativo')` de H3 (una Server Action no redirige:
devuelve el fallo `NO_AUTORIZADO`); los códigos propios de turnos se registran en ese traductor, o quedan en
`lib/turnos/errores.ts` si H3 no admite extenderlo.

| SQLSTATE | Origen | Mensaje |
|---|---|---|
| `23505` | `unique (enfermera_id, fecha, turno)` | La enfermera ya tiene un turno asignado en esa fecha y franja |
| `23514` | `check` médico o servicio | Indique el médico o el servicio con el que trabajará la enfermera |
| `23503` | enfermera, médico o especialidad inexistente | (mensaje del campo afectado) |
| `42501` | RLS (rol distinto de administrativo) | No tiene permiso para gestionar turnos de enfermería |
| UPDATE/DELETE sin fila afectada | otro administrativo lo quitó | El turno ya no existe. Actualice la pantalla |

- **«Exactamente uno»** (médico **o** servicio) es una regla de la acción, más estricta que el `check` de la base de datos
  (que admite ambos). Un turno con médico ya tiene servicio implícito (la especialidad del médico); guardar ambos permitiría
  contradicciones (un cardiólogo «en Pediatría»). La vista de la enfermera sigue mostrando correctamente turnos antiguos
  con ambos valores.
- **Turnos pasados:** la acción rechaza crear, modificar o quitar turnos con `fecha < hoy_lima()` (conservan el registro de
  quién trabajó). Es una regla de aplicación; la RLS de H2 deja al administrativo escribir cualquier fecha. Se acepta: es
  un administrador de confianza, y un trigger por una regla de historial sería más ruido que protección.
- **Carrera aceptada:** como la transacción HTTP de Neon no es interactiva, las comprobaciones de «activo» y de fecha y la
  escritura no son atómicas. La consecuencia peor es un turno asignado a alguien dado de baja en ese instante, y lo atrapa
  la vista de avisos (D8). La unicidad, que sí importa bajo concurrencia, es del motor.
- `fecha` es `date`, no `timestamptz`: es un **día calendario de trabajo en Lima**, no un instante. Es una excepción
  consciente y ya presente en el esquema de H2 a la regla «fechas siempre `timestamptz`»; no se cambia.

### D7. Vista de la enfermera y del médico: lecturas con la RLS existente
- **Enfermera** (`lib/turnos/mis-turnos.ts`): una consulta a `turnos_enfermeria` de hoy a hoy + 14 días, con `medicos`,
  `perfiles` y `especialidades`. Sin vista: la RLS ya limita sus filas (`enfermeras_lee_la_propia`,
  `turnos_lee_la_enfermera_propia`) y no hace falta ninguna política nueva. Si el médico de un turno fue dado de baja, se
  muestra su nombre con la nota «Fuera de servicio; consulte al personal administrativo».
- **Médico** (`lib/medico/jornada.ts`): `disponibilidades` vigentes del propio médico (filtradas por `medico_actual()`: la
  tabla es legible por todos, así que el filtro es de consulta y no de seguridad; no contiene datos sensibles), sus
  `bloqueos_agenda` (RLS propia) y sus `citas` `confirmada` de hoy a hoy + 7 días con `pacientes` (el médico ve a quien tiene
  una cita vigente). Los horarios por día salen de la plantilla semanal con una función pura (`horariosPorDia`, con `dia_semana`
  0 = domingo como en la base). Sin vista: la RLS de `citas` ya limita al médico a las suyas.
- **«Marcar atendida»** (único botón de escritura de la jornada): cada cita confirmada lleva un botón que llama a la acción de
  H3 para la transición `confirmada → atendida` del propio médico. La acción es `marcarAtendida`
  (`app/medico/acciones-cita.ts`, definida por `agenda-y-reserva` D13); H7 no escribe en `citas`, no crea la función ni sus políticas y solo la invoca con su
  `ResultadoAccion`. Un componente de cliente (`MarcarAtendida`, con `useActionState`) deshabilita el botón mientras envía,
  muestra «Cita marcada como atendida» con `role="status"`, pasa el foco a la siguiente cita (o al encabezado si no quedan) y
  traduce «la cita ya no está confirmada» a un mensaje accionable. La RLS actual no concede `UPDATE` de `citas` al médico: la
  prueba negativa de que sigue sin tenerlo es de H3 y se repite aquí como guarda (tarea 8.1).
- **«Sus turnos» del médico** se interpreta como **sus horarios de atención**, y se rotula «Mi horario de atención» para no
  confundirlo con los turnos de enfermería. Que además vea qué enfermera lo acompaña requiere una política nueva sobre
  `turnos_enfermeria` y leer perfiles de enfermeras: cambia la matriz de acceso y merece revisión explícita, así que queda como
  pregunta abierta (Q3) y **no** se incluye.

### D8. Punto de contacto con la baja del médico (H3): un aviso, no un efecto
`public.turnos_enfermeria_con_aviso` (`security_invoker`, filtrada a `administrativo`) devuelve los turnos con `fecha >= hoy_lima()`
cuya situación es una de: `enfermera_de_baja`, `medico_de_baja`, o `bloqueo_de_agenda` (existe un bloqueo del médico cuyo `rango`
se solapa con el día de Lima de la `fecha`). La pantalla de turnos los lista arriba con la causa y un enlace «Modificar turno».

- **Qué hace H3 y qué no:** el flujo de H3 (ADR-0011) cancela y recrea **citas**. No toca `turnos_enfermeria`. H7 no escucha ese
  flujo ni lo modifica; solo reacciona al dato (`bloqueos_agenda`, `medicos.activo`). Así los dos changes no se pisan y el aviso
  también cubre bajas que nadie «reasignó» (un médico simplemente desactivado).
- Un bloqueo parcial (p. ej. 15:00–17:00) marca todos los turnos del día de ese médico, porque las franjas no tienen horas
  definidas (Q2): es un aviso para que el administrativo revise, no una orden. Es un falso positivo posible y aceptado.
- No se muestra el motivo del bloqueo. La enfermera **no** ve el aviso (no puede leer `bloqueos_agenda`; ampliarlo sería
  cambiar la matriz de acceso): se entera cuando el administrativo corrige el turno.
- **Segundo punto de contacto (dashboard):** el recuento «citas por reasignar» lee la vista `citas_por_reasignar` de H3 y
  enlaza a su pantalla de bajas; no reasigna nada ni calcula sustitutos.
- *Alternativa descartada:* un trigger que reasigne o borre turnos al crearse un bloqueo (decisión de negocio automática,
  invisible y difícil de revertir; contradice el principio de ADR-0011 de no actuar en silencio).

### D9. Notificaciones fallidas: solo el recuento; el detalle es de H5
El dashboard cuenta `notificaciones` con `estado = 'fallida' and intentos >= 3` (el administrativo ya puede leerlas) y enlaza a la
vista de revisión que construye **H5** en `/administrativo/notificaciones` (decisión D11 de `notificaciones-email`, que dice que
H7 solo enlaza). H7 no crea esa ruta ni su consulta. El enlace se muestra solo si el destino está `disponible` en
`lib/ui/navegacion.ts`.

### D10. Actualización por sondeo, pausable
Un componente de cliente (`RefrescoAutomatico`) llama a `router.refresh()` cada 60 s mientras `document.visibilityState ===
'visible'`, refresca al volver a la pestaña, muestra «Actualizado a las HH:mm» (hora de Lima enviada por el servidor) y ofrece
«Actualizar ahora» y «Pausar/Reanudar actualización». Pausable por WCAG 2.1 SC 2.2.2; sin región `aria-live` (un anuncio por
minuto sería ruido); el foco se conserva porque React reconcilia los mismos nodos (filas con clave por `cita_id`). Un
`error.tsx` de la ruta muestra «No se pudo cargar el panel. Intente de nuevo.» con «Reintentar».

- *Alternativas descartadas:* WebSockets o suscripciones (el driver autenticado es solo HTTP por ADR-0023/D9 de H2; una
  conexión persistente podría conservar la identidad de otro usuario); actualizar cada 10 s (más costo para Neon sin valor
  para minutos de espera).
- **Costo:** un dashboard abierto todo el horario de atención mantiene despierto el cómputo de Neon; el intervalo es una
  constante (`INTERVALO_REFRESCO_MS`) y se mide en el preview (riesgos).

### D11. Datos mostrados y minimización
El dashboard y la jornada muestran nombre y documento del paciente (el administrativo ya los lee todos; el médico, los de sus
citas), médico, especialidad, hora y estado. **No** `motivo` de la cita (texto libre que el paciente o el administrativo
escriben y que puede contener síntomas), diagnósticos, notas ni antecedentes. El título de la pestaña es fijo y la URL no
lleva identificadores de pacientes (los filtros son `?especialidad=` y `?medico=`, ids de catálogo). Los mensajes de error no
incluyen datos de pacientes.

### D12. Pruebas
- **pgTAP** (`tests/pgtap/`): `62_dashboard_citas` (opciones de la vista, filas por rol, frontera de Lima, `minutos_espera`,
  ausencia de `motivo`), `63_turnos_con_aviso`, `64_contrato_slots` (contrato con H3), `65_turnos_escritura` (negativas de
  escritura por rol), `66_vista_enfermera`, `67_jornada_medico` y `98_vistas_con_security_invoker`. Las
  negativas de `turnos_enfermeria`, `citas` y `pacientes` por rol ya existen en H2 (`50`, `32`, `23`); aquí se añade la
  negativa nueva: la vista no devuelve nada a enfermera, médico, paciente ni sesión sin rol.
- **Concurrencia** (`tests/concurrencia/20_turnos.test.ts`): N asignaciones simultáneas de la misma enfermera, fecha y
  franja dejan exactamente una fila y las demás reciben `23505`.
- **Unitarias** (`node --test`, con `TZ=UTC` y `TZ=Asia/Tokyo`, como en H2b): `fusionarHuecos`, `horariosPorDia`,
  `resumenPorMedico`, `agruparPorEstado`, `superaUmbral`, `traducirErrorTurno`, esquema Zod, etiquetas de franja.
- **E2E** (`e2e/`): administrativo asigna y rechaza un choque; enfermera ve solo lo suyo y no entra a otras áreas; médico ve sus
  citas confirmadas y marca una atendida; dashboard con citas de ahora; actualización automática con el reloj simulado de Playwright
  (`page.clock`); axe sobre las pantallas nuevas (extiende `e2e/accesibilidad.spec.ts` de H2b). Para médico y enfermera hace
  falta un **paso manual**: activar TOTP en sus cuentas de prueba de la instancia de desarrollo de Clerk y guardar el secreto
  (`E2E_*_TOTP_SECRET`); si no se concede, esas pantallas se verifican con pgTAP, pruebas de integración con token firmado
  (como `scripts/comprobar-datos-demo.ts`) y revisión manual, y se anota en `docs/07-testing/pruebas-e2e.md`.
- Las pruebas **no asumen tablas vacías** (hay datos de demostración) y usan fechas lejanas (p. ej. 2032) para turnos.

### D13. Datos de demostración
El script de siembra solo crea citas con día relativo y hora fija; no sirve para ver «en espera». Se le añade la opción
opt-in `--citas-de-ahora`, que crea citas confirmadas que empezaron hace 5, 18 y 32 minutos, dos citas `reservada` para mañana
y una cita en cada estado restante, y un turno con un médico que tiene un bloqueo; las rehace en cada ejecución (solo las
marcadas y aún no atendidas) para no acumular filas. Sigue sin tocar producción sin `--incluir-produccion`.

### D14. Sin ADR nueva
Las decisiones de este change se apoyan en ADR existentes (ver proposal). Lo que **sí** requeriría una ADR y por eso no se
decide aquí: registrar la llegada del paciente (D2), y que el médico vea a su enfermera (D7).

## Risks / Trade-offs

- [Una vista olvida `security_invoker` y salta la RLS] → opción obligatoria en la migración, prueba pgTAP con una fila por
  rol y la prueba global `98_` que falla ante cualquier vista de `public` sin ella.
- [«En espera» infla la lista con pacientes confirmados que nunca llegaron, o queda vacía si nadie confirma ni marca atendidas]
  → la definición está escrita (D2) y visible en la pantalla («Se cuenta desde la hora de la cita»); depende de que H3 aporte
  las transiciones de la decisión del usuario; la tarea 1.1 se detiene si no existen. Una cita `reservada` con hora vencida no
  cuenta hasta que la recepción la confirme.
- [H3 cambia `slots_disponibles` o no la expone a `authenticated`] → un solo adaptador (`lib/dashboard/huecos.ts`) y una prueba de
  contrato (tarea 2.5) que falla de forma clara.
- [H2b aún no está aplicado cuando empiece H7] → H7 no arranca el trabajo de interfaz sin sus componentes; las migraciones y las
  pruebas de base de datos (grupo 2) no dependen de H2b y pueden ir antes.
- [Sondeo cada 60 s mantiene despierto el cómputo de Neon] → pausa con pestaña oculta, intervalo en una constante, medición en el
  preview; si pesa en el plan gratuito, se sube a 120 s sin tocar la spec (dice «cada 60 segundos»: se actualizaría la spec).
- [El aviso por bloqueo parcial marca de más] → la causa dice «tiene un bloqueo de agenda ese día», no «no atiende»; el
  administrativo decide.
- [La carrera entre lectura y escritura de una asignación] → aceptada y cubierta por la vista de avisos (D6, D8).
- [Cuentas de médico y enfermera sin TOTP bloquean las E2E] → paso manual indicado; alternativa documentada (D12).
- [El dashboard muestra datos personales de pacientes en una pantalla compartida de recepción] → solo nombre y documento; el
  acceso exige sesión, MFA y rol; sin analítica ni exportes. El uso de un televisor compartido no está previsto (Q4).

## Migration Plan

1. Rama de trabajo con commits locales por grupo de tareas (como en H2). Las migraciones son archivos **nuevos** en
   `migrations/*.sql` (`npm run migrate create`), solo hacia adelante (ADR-0027); un defecto se corrige con otra migración.
2. El branch efímero de Neon del PR corre `migrate up` y la suite pgTAP; las vistas se crean sin tocar datos.
3. Preview de Vercel por PR: revisión visual a 390 px (solo la enfermera y el médico, las pantallas más estrechas posibles) y a
   1280 px, E2E y axe antes del merge.
4. Producción con el merge (el job `migrar-produccion` aplica las vistas). Sin variables de entorno nuevas.
5. Reversión: revertir el commit de la aplicación; las vistas inocuas pueden quedarse o retirarse con una migración nueva
   (`drop view`). Nunca restaurar el branch principal de Neon.

## Supuestos adoptados (si cambian, se revisa este change)

- **A1 (H3):** existen `slots_disponibles(p_medico uuid, p_fecha date)` (devuelve horarios futuros no ocupados ni bloqueados,
  solo a administrativo o paciente) y la agenda del día completa en `/administrativo/agenda`, con parámetros de médico y fecha.
- **A2 (H3):** por decisión del usuario, H3 expone las transiciones de estado: el administrativo confirma una cita y la marca
  «no asistió»; el médico la marca atendida con una función acotada (`confirmada → atendida`, solo propias). H7 las consume
  (el botón «Marcar atendida» llama a la acción `marcarAtendida` de H3) y no las implementa; el
  dashboard es de solo lectura.
- **A3 (H3):** H3 no construye la vista del médico (su Q5 la sugiere para H7); esa portada es de H7.
- **A4 (H3):** `ResultadoAccion`, el traductor central de errores y `exigirPersonal` existen y admiten uso desde H7.
- **A5 (H3):** el flujo de reasignación por baja no escribe en `turnos_enfermeria` y expone `citas_por_reasignar` a
  `authenticated` con `security_invoker`.
- **A6 (H5):** la vista de notificaciones fallidas es de H5, en `/administrativo/notificaciones`.

## Open Questions

Ninguna cambia las tablas de este change (no crea ninguna). **Q1 sí podría cambiar la spec del dashboard**: no se pudo
consultar con el cliente al planificar y queda abierta, con la definición derivada de D2 como supuesto. Cada pregunta dice
qué se toca si la respuesta es otra.

- **Q1. ¿Se registra la llegada real del paciente (columna `llegada_en` o estado nuevo)?** Sin ella la espera se mide desde la
  hora de la cita y el objetivo de ≤ 20 min **no se puede medir** (D2). Es cambio de esquema y de proceso en recepción: ADR
  aparte y decisión del cliente. Si se acepta, `minutos_espera` pasaría a medirse desde la llegada, cambiaría quién la
  registra (¿la recepción?) y habría que decidir si la analítica sigue fuera de alcance. No se resuelve en este change.
- **Q2. ¿Qué horas tiene cada franja (mañana, tarde, noche) y qué pasa con la noche que cruza la medianoche?** Hoy no hay
  horas en ningún documento; no se inventan. Afecta a: cómo cruzar un turno con el horario del médico, y qué ve una
  enfermera a las 02:00 (¿su turno de noche de «ayer»?). La vista de la enfermera muestra «Hoy» por fecha calendario.
- **Q3. ¿Debe el médico ver qué enfermera trabaja con él?** Es una política nueva sobre `turnos_enfermeria` y lectura de
  perfiles de enfermeras: cambia la matriz de acceso (revisión explícita). Por defecto, no.
- **Q4. ¿Se usará el dashboard en una pantalla compartida de recepción?** Cambiaría qué datos de pacientes conviene mostrar
  (iniciales en lugar de nombre completo) y el cierre automático de sesión.
- **Q5. Duda de alcance (BI):** ¿se necesita ver cuántos pacientes esperaron más de 20 minutos *ayer* o *esta semana*? Sería
  analítica y está fuera de alcance; no se construye ni se prepara (no se guardan históricos de espera).
