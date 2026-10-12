# Design

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_actual()` y `profesional_tiene_paciente()`; si la ADR se
> rechaza, léase `medico`, `medicos`, `medico_actual()` y `medico_tiene_paciente()`. Nada de este diseño cambia por el renombre,
> salvo los identificadores.
> <!-- REVISAR: los nombres exactos que deja H2c (y `citas.profesional_id` de H3) se confirman en la tarea 0.1. -->

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (cuatro capacidades). Estado de partida. **Ninguno de los
changes de los que depende está aplicado** (H2c, H3, H6, H6b a H6d son documentos); este diseño se escribió contra ellos y contra
las migraciones de H2 ya aplicadas, y las tareas 0.1 y 0.5 verifican los nombres reales antes de escribir SQL:

- **Citas (H3, `agenda-y-reserva`).** `citas` tiene los estados `reservada → confirmada → atendida`, `no_asistio` y `cancelada`;
  `reprogramada_de` va en la cita **nueva** y apunta a la original. `reservar_cita(paciente, profesional, inicio, fin, motivo)` es
  `SECURITY INVOKER`, solo la ejecutan el administrativo y el paciente, y es el **único punto de inserción**; `reprogramar_cita()`
  cancela la original **antes** de insertar la nueva, en una transacción. La recepción confirma (`reservada → confirmada`) y marca
  «no asistió»; **solo el profesional dueño de la cita** la marca `atendida`, con `marcar_cita_atendida()` (`SECURITY DEFINER`),
  y el disparador de transiciones solo actúa sobre `authenticated`. La doble reserva la impiden dos restricciones `EXCLUDE`
  (`Registro de cita ya agendado`); `validar_cancelacion()` impone la ventana de 1 hora (ADR-0012) y la excepción por bloqueo de
  agenda. **H3 declara como no-objetivo agregar columnas o estados a `citas`.** El profesional lee solo **su** agenda (política
  «médico ve su agenda»): no lee las citas de un colega. Las citas no llevan datos clínicos (`citas.motivo` se rotula «sin datos
  clínicos»), y los recordatorios de H5 salen de `citas`.
- **Profesión (H2c).** `profesion_actual()` es el **único punto de lectura de la profesión** (de `profesionales.profesion`, nunca del
  token); `profesional_tiene_paciente()` es la única fuente de acceso a la historia (asignación vigente, fechas de Lima, profesional
  activo). La profesión de un profesional no se modifica desde la aplicación.
- **Historia (H6).** `accesos_historia` (solo-agregar) con `tipo_acceso`; lectura atómica con registro de acceso en la misma
  transacción (D2 de H6); guarda de datos reales (`exigir_paciente_admisible()`, `exigir_modo_clinico()`, `HC002` y `HC004`);
  módulo único `lib/historias/` con su prueba de acceso único; `atenciones` y el patrón de D15 (catálogo por migración,
  subconjunto mínimo de tipos validado en la base, ADR-0029 aceptada).
- **Triaje y auditoría (H6b).** `registrar_auditoria_sin_contenido()`: función de **disparador de escritura** (`SECURITY DEFINER`,
  `search_path` vacío) que registra actor, rol, acción, tabla e identificador y nunca el contenido. Un disparador no puede
  observar un `SELECT`: las lecturas se auditan en `accesos_historia` (D15).
- **Recetas (H6c).** Fija los patrones que este change reutiliza: escritura solo por funciones `SECURITY DEFINER`, `id`
  idempotente aportado por el formulario, vista `security_invoker`, instantánea del autor, y el **choque conocido** de la
  restricción de `tipo_acceso` (cada change que la reemplaza puede borrar los valores de otro).
- **Copia (H6d).** `compilar_copia_historia()` incluye la información de Psicología; su prueba de cobertura (tarea 3.4) falla si
  existe una tabla de `public` que el compilado no menciona ni figura en su lista de exclusiones con razón: **toda tabla clínica
  nueva se clasifica y aporta su sección** (D16).
- **TECH-DESIGN, «Mecanismos comunes de las especialidades» (Propuesta).** Fija lo que el PRD ya decidió: nombres de las cuatro
  tablas, estados del plan, `area` e `uso_libre`, visibilidad por área, pruebas 80–81 y SQLSTATE `HC090`–`HC099`. Deja como
  supuesto que las citas de la serie «se crean al crear el plan» y marca que no puede exigir un cron nuevo (ADR-0028);
  este diseño lo precisa en D9.
- **Plataforma.** Neon por HTTP: `transaccionAutenticada()` ejecuta una **lista fija** de sentencias, sin lógica entre ellas;
  cualquier operación de varios pasos con condiciones es una función de la base (D4 de H3). Vercel Hobby con un solo cron diario
  ocupado por las notificaciones (ADR-0028). PostgreSQL 15 o superior (vistas `security_invoker`).

## Goals / Non-Goals

**Goals:**
- Que el contador de sesiones restantes **no pueda desincronizarse** de las citas: se calcula en la base a partir de las
  sesiones, y la sesión sigue a su cita aunque la agenda se use por las pantallas de H3.
- Que ninguna regla de la agenda de H3 se debilite: el plan agenda citas **con** su doble reserva, su ventana de 1 hora y sus
  recordatorios; no las reemplaza ni las copia.
- Que el puntaje de un instrumento **no lo pueda fijar quien lo aplica**: lo calcula el servidor, lo recalcula la base y una
  discrepancia se rechaza, también para el dueño.
- Que lo de Psicología esté aislado **en la base**, por profesión, con un mecanismo que H6g reutiliza sin abrir una vía paralela.
- Que cada especialidad use los mecanismos con su propio catálogo sin tocar sus tablas ni sus políticas.

**Non-Goals:**
- Resolver P-1, P-5, P-11, P-12, P-14 o P-18; declarar validez legal de nada; verificar la licencia de un instrumento.
- Catálogos concretos de protocolos o de instrumentos, notas de sesión, evaluaciones estructuradas y cualquier tabla propia de una
  especialidad (H6e a H6h).
- Cobros, saldos en dinero, paquetes prepagados, presupuestos y cuotas; agendar sesiones en segundo plano; pantalla del
  paciente para sus sesiones; alertas automáticas por respuestas o puntajes; baremos por edad o sexo.
- Modificar `profesional_tiene_paciente()`, las políticas de las tablas clínicas existentes o las tablas y funciones de H3.

## Decisions

### D1. Qué entrega este change y cómo lo usa cada especialidad

El principio del hito: **un mecanismo, un dueño**. Las especialidades lo **usan**; no lo redefinen ni agregan columnas a sus tablas.

| Mecanismo | Lo aporta H6i (este change) | Lo aporta cada especialidad (H6e a H6h) |
|---|---|---|
| Plan de sesiones | Las dos tablas, las funciones de creación, ajuste, cierre y agenda, el contador, los estados, el aislamiento por área, los componentes y las pantallas de recepción | El `protocolo_clave` que entiende su catálogo y su validación en la aplicación; sus propias pantallas, que montan el componente del plan; su nota por sesión (tabla propia) que puede referenciar `sesiones_del_plan.id` **sin escribir en ella** |
| Instrumento | Las dos tablas, el validador de definiciones, el cálculo y la verificación del puntaje, el aislamiento por área, el formulario genérico y el resultado | Las **filas del catálogo**: una migración propia por instrumento, con su licencia verificada (D14), su fuente y sus vectores de prueba |

Reglas de uso (las verifica la tarea 9.3 y las pruebas de cada especialidad):
1. Ninguna especialidad inserta ni actualiza las cuatro tablas directamente: usa las funciones de D7. Todo SQL contra ellas vive
   en `lib/historias/planes.ts` y `lib/historias/instrumentos.ts` (la prueba de acceso único de H6 se amplía).
2. Un instrumento nuevo es **una migración de datos propia** (`insert ... on conflict (clave, version) do nothing`), con **una sola
   `clave`** y su licencia verificada **individualmente** antes de escribirla: nunca un lote de instrumentos en una migración, y ninguno
   se carga mientras su licencia no esté verificada (D14). Es un dato, no un cambio de esquema; una definición nueva es la **versión
   siguiente**, nunca una edición.
3. Una especialidad que guarde su catálogo de protocolos en una tabla propia puede validar `protocolo_clave` con un disparador
   suyo sobre `planes_de_sesiones`; este change solo exige el formato (D3).
4. Lo que una especialidad escriba con su propia profesión lo lee todo profesional a cargo salvo Psicología (D2); cualquier tabla
   clínica nueva suya se clasifica en el compilado de la copia (D16).

*Alternativa descartada:* que cada especialidad lleve su propio plan y su propio instrumento. Triplica tablas con RLS y pruebas
negativas, tres cálculos de puntaje que verificar y tres versiones del aislamiento de Psicología; es exactamente lo que ADR-0029
evitó con `plantillas_clinicas`.

### D2. Área clínica, profesión y aislamiento de Psicología (el mecanismo de ADR-0031)

**Tipo y funciones (migración 1).**
- Tipo `area_clinica`: `medicina_general`, `odontologia`, `fisioterapia`, `psicologia`, `podologia` (las cinco áreas del PRD).
- `area_de_profesion(profesion_salud) → area_clinica`, `IMMUTABLE`: `medico → medicina_general`, `odontologo → odontologia`,
  `fisioterapeuta → fisioterapia`, `psicologo → psicologia`, `podologo → podologia`. Una prueba enumera el tipo
  `profesion_salud` y falla si una profesión no tiene área (agregar una profesión obliga a decidir su área).
- `public.psicologo_tiene_paciente(paciente uuid) returns boolean` (`SECURITY DEFINER`, `STABLE`, `search_path` vacío, `REVOKE ... FROM
  PUBLIC`, `EXECUTE` solo a `authenticated`): verdadero solo si `rol_actual() = 'profesional'`, `profesion_actual() = 'psicologo'`, el
  perfil del token está activo y `profesional_tiene_paciente(paciente)` (asignación vigente, fechas de Lima, profesional activo); **falla
  cerrada**: cualquier nulo, ausencia o error de lectura da `false` (`coalesce(..., false)`). **Es la función única de acceso a
  Psicología del proyecto**: la define este change (que se construye antes) y `especialidad-psicologia` (H6g) la **reutiliza** en vez
  de crear `es_psicologo_a_cargo()` (contrato exacto abajo).
- `public.acceso_clinico_por_area(area public.area_clinica, paciente uuid) returns boolean` (mismo régimen): `psicologo_tiene_paciente(paciente)`
  si `area = 'psicologia'`; `profesional_tiene_paciente(paciente)` con rol `profesional` en cualquier otro caso; `false` si `area` es nula.
- `profesion_puede_planificar_sesiones(profesion_salud) → boolean`, `IMMUTABLE`: `fisioterapeuta`, `psicologo` y `podologo` → sí
  (lo que pide el PRD); `medico` y `odontologo` → no. Es la misma «puerta de revisión» que `profesiones_que_recetan` de H6c:
  la prueba afirma el conjunto exacto, y cambiarlo es una migración que obliga a editarla de forma consciente.
  <!-- REVISAR: el PRD nombra el plan de sesiones solo para Fisioterapia, Podología y Psicología; médicos y odontólogos quedan en «no» hasta que la clínica lo pida. -->

**Cómo se aplica.** `area` es una **columna** de `planes_de_sesiones`, `sesiones_del_plan`, `instrumentos_evaluacion` y
`aplicaciones_instrumento`; la fija la base, nunca el cliente: en el plan, como `area_de_profesion(profesion_actual())` al crearlo; en
la sesión, por la clave foránea compuesta con su plan; en la aplicación, por la clave foránea compuesta con su instrumento. La
política `SELECT` de las tres tablas de datos del paciente es **una sola expresión**: rol `profesional` y
`acceso_clinico_por_area(area, paciente_id)`. El catálogo de instrumentos lo leen los profesionales de su propia área y, para
mostrar los resultados de las demás, los de cualquier área salvo Psicología (D11).

| Rol / profesión | Planes y sesiones | Aplicaciones | Catálogo de instrumentos |
|---|---|---|---|
| Psicólogo a cargo | Todos (incluidos los de Psicología) | Todas (incluidas las de `psicologia`) | Todos |
| Psicólogo **sin** el paciente a cargo | Cero filas | Cero filas | Todos |
| Médico, odontólogo, fisioterapeuta o podólogo a cargo | Los de **otras** áreas; cero filas de Psicología | Las de otras áreas; cero filas de `psicologia` | Los de áreas distintas de `psicologia` |
| Profesional sin el paciente a cargo, asignación vencida o perfil inactivo | Cero filas | Cero filas | Como arriba |
| Administrativo | Cero filas (solo las funciones con lista blanca de D10) | Cero filas | Cero filas |
| Enfermera, paciente (incluido el titular), sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` | Cero filas o sin privilegio | Cero filas o sin privilegio | Cero filas o sin privilegio |

**Quién escribe.** Solo funciones (D7), y todas comprueban que `area_de_profesion(profesion_actual())` sea el área del plan o del
instrumento (`HC090`): un fisioterapeuta no aplica un instrumento de Psicología ni un psicólogo cierra el plan de un fisioterapeuta.
Esto cumple «lo escribe solo un profesional de la profesión que corresponde» sin una lista de profesiones por tabla.

**Qué es un plan «de Psicología».** El plan lleva el área de **quien lo crea**; el de un psicólogo es `psicologia` y queda
restringido, como pide TECH-DESIGN («los planes de sesiones de un psicólogo»). La razón: `protocolo_clave` y `descripcion` pueden
revelar el motivo de la terapia, y ADR-0031 reserva la información de salud mental. Lo que **no** se oculta es que existen citas
con un psicólogo (recepción las ve en la agenda como las de cualquier especialidad); D10 explica qué ve recepción de un plan.
<!-- REVISAR con el asesor legal (P-14): ADR-0031 dice «(y su autor)». Aquí el autor es siempre un psicólogo y solo lee mientras
tenga al paciente a cargo (la misma regla que las atenciones). Si un autor sin asignación vigente debe seguir leyendo lo suyo, es
una política distinta y una decisión del usuario. -->

*Alternativas descartadas.* (a) **Tablas aparte para Psicología** (`planes_psicologia`, `aplicaciones_psicologia`): duplica
tablas, políticas y pruebas, y deja a H6g con un mecanismo propio, que es lo que este change evita. (b) **Una columna
`restringido boolean` por fila que fije el autor:** un error o un cliente manipulado dejaría un test de salud mental legible; el
área se **deriva** de la profesión (plan) y del catálogo (aplicación). (c) **Filtrar en la aplicación:** un olvido filtra salud
mental. (d) **Reutilizar `profesion_salud` como área:** mezcla «quién» con «qué», y obligaría a reabrir el tipo si algún día un
instrumento de Psicología lo aplica otra profesión. (e) **FK a `especialidades`:** sus filas son datos de demostración sin clave
estable.

**Contrato con `especialidad-psicologia` (H6g), decidido por el orquestador del 2026-10-12.** Es explícito para que no existan dos
definiciones de «psicólogo a cargo»:

| Punto | Lo que fija este change (H6i) | Lo que hace H6g |
|---|---|---|
| Función única de acceso | `public.psicologo_tiene_paciente(paciente uuid) returns boolean` y la genérica `public.acceso_clinico_por_area(area public.area_clinica, paciente uuid) returns boolean`, ambas `SECURITY DEFINER`, `search_path` vacío, `STABLE`, falla cerrada, `EXECUTE` solo a `authenticated`. Las políticas las llaman **por posición**, no por nombre de parámetro | **Las reutiliza.** No crea `es_psicologo_a_cargo()` ni un alias; sus políticas permisivas de las tablas propias (evaluación, notas, adjuntos) y su restrictiva usan `psicologo_tiene_paciente(paciente_id)` |
| Qué tablas ya quedan aisladas | `planes_de_sesiones` (autor psicólogo ⇒ `area = psicologia`), `sesiones_del_plan` (hereda el área de su plan por la clave compuesta) y `aplicaciones_instrumento` (el área sale del instrumento), con una política de lectura por área en cada una | No escribe políticas permisivas sobre estas tablas |
| Reserva por **autoría** | No la implementa | Es de H6g: una política `RESTRICTIVE` adicional (`not fila_de_psicologia(profesional_id) or psicologo_tiene_paciente(paciente_id)`) sobre `atenciones`, `addendas`, sus tablas propias y, si lo decide (H6g, D1/D3), sobre `planes_de_sesiones` y `aplicaciones_instrumento`, cuya columna de autor es `profesional_id`. `sesiones_del_plan` no tiene columna de autor: su reserva es solo por área |
| Si ambos criterios discrepan | Prevalece el **más estricto**: las políticas restrictivas se combinan con `AND` con la permisiva por área, así que la restrictiva de H6g nunca amplía lo de H6i ni al revés | Su prueba negativa por profesión incluye las filas de H6i |
| Ventana entre migraciones | No existe: la política por área de H6i ya aísla `psicologia` desde su propia migración, antes de que llegue H6g | La restrictiva de H6g se **suma** como segunda barrera |
| Nombres y columnas reales (para su tarea 0.3a) | Autor: `profesional_id`; paciente: `paciente_id`; `area`; instrumento: `clave`, `version`, `uso_libre`, `fuente`, `licencia_referencia`, `licencia_verificada_el`, `vigente`; plan: `total_sesiones`, `frecuencia_dias`, `vigente_desde`, `vigente_hasta`, `estado` | Los usa tal cual |
| Planes abiertos | **No hay planes sin total**: el total es obligatorio (1 a 60); un tratamiento más largo se amplía con `ajustar_plan_de_sesiones` hasta el tope o se encadena con un plan nuevo | Si «sesiones recurrentes» de Psicología necesita un plan sin fin, es una decisión del usuario que cambiaría este change |
| Lista blanca de recepción | La de D10, igual para los planes de un psicólogo (sin protocolo ni descripción) | — |
| `tipo_acceso` | `plan_sesiones` e `instrumento` para las lecturas de **estas** tablas, también las de Psicología | `psicologia` para las lecturas de **sus** tablas; ambos recrean la restricción con la unión de valores (D15) |
| Quién aplica instrumentos de Psicología | Solo un psicólogo (`HC090`); H6i no admite que otra profesión aplique un instrumento de `area = psicologia` | Aplica sus tests llamando a `registrar_aplicacion_instrumento()`: **no** calcula puntajes ni tiene tabla de resultados propia |

Si H6g se aplicara **antes** que este change, su migración define provisionalmente `psicologo_tiene_paciente(paciente uuid)` con esta misma
firma y semántica y este change la reemplaza con `create or replace` idéntico: nunca existen dos nombres (tarea 0.7).

### D3. El plan: una fila de plan y una fila por sesión, creadas juntas

**`planes_de_sesiones`** (RLS activada; solo-lectura para los roles de usuario; se escribe con funciones):

| Columna | Detalle |
|---|---|
| `id` | `uuid` PK, **lo aporta el formulario** (idempotencia, D7); `unique (id, paciente_id)` y `unique (id, paciente_id, area)` para las claves compuestas de `sesiones_del_plan` |
| `paciente_id` | `references pacientes(id) on delete restrict` |
| `profesional_id` | `references profesionales(id)`: quien crea el plan y responde por él; siempre `profesional_actual()` |
| `profesion_autor`, `area` | instantánea de `profesion_actual()` y `area_de_profesion(...)`, fijadas por la base (D2) |
| `especialidad_id` | `references especialidades(id)`; la del profesional al crear; decide qué colegas pueden atender las sesiones (D4) |
| `atencion_id` | nulo; `references atenciones(id)`; debe ser del mismo paciente y del mismo profesional (`HC094`) |
| `protocolo_clave` | nulo; formato `^[a-z][a-z0-9_]{1,59}$`; lo valida la aplicación contra el catálogo de la especialidad (D1, regla 3) |
| `descripcion` | nulo; hasta 1 000 caracteres con contenido real; `CHECK`: al menos uno de `protocolo_clave` y `descripcion` |
| `total_sesiones` | `smallint`, 1 a 60 (límite inicial, ajustable) |
| `frecuencia_dias` | `smallint`, 1 a 90: el **intervalo objetivo** entre sesiones, en días |
| `vigente_desde`, `vigente_hasta` | `date`; `vigente_desde = hoy_lima()` al crear; `vigente_hasta >= vigente_desde` y a lo sumo 365 días después |
| `estado` | `estado_plan_sesiones` (`activo`, `completado`, `cancelado`), por defecto `activo` |
| `cierre_motivo`, `cerrado_por`, `cerrado_en` | D6 |
| `creado_en` | `timestamptz not null default now()`, sellado por la base |

**`sesiones_del_plan`** (RLS activada; la escriben solo funciones y los disparadores de D4):

| Columna | Detalle |
|---|---|
| `id` | `uuid` PK |
| `plan_id`, `paciente_id`, `area` | clave foránea **compuesta** `(plan_id, paciente_id, area) → planes_de_sesiones`: una sesión no puede declarar otro paciente ni otra área |
| `numero` | `smallint >= 1`, `unique (plan_id, numero)`: la «casilla» k del plan, no un orden obligatorio |
| `estado` | `estado_sesion_plan`: `por_agendar`, `agendada`, `asistida` (D5) |
| `cita_id` | nulo; `references citas(id) on delete restrict`; índice único parcial `where cita_id is not null` |
| `cita_inicio`, `cita_fin`, `cita_profesional_id` | **espejo** de la cita vinculada (D4); todos nulos o todos con valor junto con `cita_id` |
| `resultado_ultima_cita` | nulo, `no_asistio` o `cancelada`: por qué la sesión volvió a `por_agendar` |
| `inasistencias` | `smallint not null default 0` |
| `asistida_en` | `timestamptz` nulo |
| `vinculada_por` | nulo; `references perfiles(id)`; quien la agendó o vinculó |

`CHECK sesiones_estado_coherente`: `agendada` y `asistida` exigen cita y espejo completos; `asistida` exige `asistida_en`; `por_agendar`
no tiene `asistida_en`; `agendada` no tiene `resultado_ultima_cita`. Los límites numéricos y los motivos de cierre de D6 están en
`CHECK` con nombre, para ajustarlos con una migración revisada.

**Por qué filas por sesión desde el principio.** La «casilla» tiene identidad (para agendarla, para que la nota por sesión de
una especialidad la referencie, para mostrar «Sesión 3 de 10») y su estado cabe en una fila que el profesional puede leer sin leer
citas ajenas.

*Alternativas descartadas.* (a) **Una sola fila de plan con un contador `restantes` que se decrementa:** se desincroniza ante la
primera cancelación o reprogramación que no pase por el plan y no dice cuál sesión falta. (b) **Una columna `plan_id` en `citas`:**
cambia una tabla de H3 (no-objetivo suyo), ensancha `reservar_cita()`, y filtraría la existencia de un plan (y por tanto del
tratamiento) a todo el que lea citas: el paciente, recepción y cualquier profesional con política sobre su agenda. (c) **Solo
filas de sesión creadas al agendar (sin casillas por agendar):** no hay dónde expresar «quedan 6 por agendar» ni qué hacer cuando se
cancela una. (d) **Contar solo `citas atendidas` vinculadas por un identificador:** sin plan no hay total ni vigencia ni estado.

### D4. Una cita por sesión, creada al agendar; la sesión sigue a su cita

**Opciones evaluadas**

| | A. Una cita por sesión, creada **al agendar** (recomendada) | B. Todas las citas al crear el plan | C. La sesión es un registro propio sin cita |
|---|---|---|---|
| Reglas de H3 (doble reserva, ventana de 1 h) | Se aplican a cada cita: es una cita | Se aplican, pero se reservan meses de agenda de golpe | No se aplican: hay que reimplementarlas |
| Recordatorio un día antes (H5), dashboard (H7), agenda | Gratis: son citas | Gratis | Hay que duplicarlos |
| Quién crea las citas | Recepción (o el paciente, a futuro): los únicos con `reservar_cita()` | El **profesional**, que no puede crear citas (H3 solo lo permite a administrativo y paciente) | Cualquiera |
| Un conflicto o una cancelación | Afecta a una sesión | Una colisión rompe toda la serie o deja una serie incompleta | — |
| Fechas que el paciente no aceptó | No: se acuerdan al agendar | Sí: 10 recordatorios por correo de fechas no confirmadas | — |
| Veredicto | **Elegida** | Descartada | Descartada |

**Mecánica.**
- `vincular_cita_a_sesion(sesion, cita)` (`SECURITY DEFINER`, solo administrativo): bloquea el **plan** y luego la **sesión**
  (D8) y exige: plan `activo`, sesión `por_agendar` (`HC092`); cita del **mismo paciente**, en estado `reservada` o `confirmada`, aún
  no vinculada, con fecha (Lima) dentro de `[vigente_desde, vigente_hasta]` y cuyo profesional sea de la **especialidad del
  plan** (`HC093`). Fija `estado = agendada`, el espejo y `vinculada_por`. No exige el mismo profesional: una cobertura o una baja
  la atiende un colega de la misma especialidad.
- `agendar_sesion_del_plan(sesion, paciente, profesional, inicio, fin)` (`SECURITY INVOKER`, como `reprogramar_cita` de H3): llama a
  `public.reservar_cita()` y después a `vincular_cita_a_sesion()` **en la misma transacción**. Si el vínculo falla, la cita no
  existe (el error revierte ambos). Mantiene intacto el contexto de seguridad de H3: la cita se inserta con las políticas del
  rol que llama. El motivo de la cita es el texto fijo «Sesión de un plan de sesiones», sin datos clínicos.
- La cita **nace `reservada`** como siempre; confirmarla (recepción) no cambia la sesión. El acceso del profesional a la historia
  nace al confirmar (ADR-0016), y es lo que le permite leer el plan: el plan no concede acceso.

**La sesión sigue a su cita, sin que nadie recuerde actualizarla.** Dos disparadores `AFTER ... FOR EACH ROW` sobre `citas`
(`SECURITY DEFINER`, `search_path` vacío; escriben solo en `sesiones_del_plan` y `planes_de_sesiones`; se registran para toda
sesión de cualquier plan sin importar el rol de quien opera la cita, también el dueño y el paciente en el portal):

| Evento en `citas` | Efecto en la sesión que la tiene como `cita_id` |
|---|---|
| `UPDATE OF estado` → `atendida` | `asistida`, `asistida_en = now()`; si ya no queda ninguna sesión sin asistir, el plan pasa a `completado` (D6) |
| → `no_asistio` | `por_agendar`, `inasistencias + 1`, `resultado_ultima_cita = 'no_asistio'` |
| → `cancelada` | `por_agendar`, `resultado_ultima_cita = 'cancelada'` |
| `INSERT` con `reprogramada_de` = la cita de una sesión que quedó `por_agendar` por **cancelación** | la sesión pasa a `agendada` con la cita nueva (esto cubre `reprogramar_cita()` y la reasignación por baja, que delega en ella) |
| `reservada → confirmada` | sin efecto |

La sesión conserva el `cita_id` de su último intento (para mostrar «cancelada el 12/10», «no asistió el 12/10» y para seguir la
cadena `reprogramada_de`); se reemplaza cuando se agenda de nuevo. **Se prefiere un espejo mantenido por disparador a una vista que
una la sesión con la cita en cada lectura:** el profesional no lee las citas de un colega (política de H3), así que esa vista le
mostraría una sesión vacía justo cuando la cubre un colega. El espejo solo guarda lo inmutable de la cita (los horarios de una
cita nunca cambian: reprogramar crea otra), y una prueba de coherencia compara el estado de cada sesión con el de su cita.

**Lo que el plan no hace.** No cancela citas al cerrarse (D5), no cambia el estado de ninguna cita y no relaja la ventana de
cancelación de 1 hora. La reprogramación dentro de la última hora sigue bloqueada por ADR-0012; una sesión cuya cita no se puede
cancelar sigue `agendada`.

*Alternativas descartadas.* (a) **Vista `security_invoker` que une sesión y cita:** falla para el colega de cobertura (arriba). (b)
**Función `SECURITY DEFINER` envoltorio que inserte la cita:** ejecutaría `reservar_cita()` como dueño, saltándose las políticas
con las que H3 la diseñó. (c) **Que la aplicación actualice la sesión después de cada operación de agenda:** cualquier ruta de H3,
H4 o H5 que no lo haga deja la sesión mal; el disparador la cubre por construcción.

### D5. Qué cuenta como sesión «asistida» (sin cobros) y los casos del tratamiento

**Criterio.** Una sesión es `asistida` cuando su cita pasa a **`atendida`**. Esa transición es la que H3 reserva al profesional dueño
de la cita (`marcar_cita_atendida()`), solo desde `confirmada` y una vez que la hora empezó.

| Criterio evaluado | Pros | Contras / veredicto |
|---|---|---|
| **1. Cita `atendida`** | Una sola fuente de verdad; la fija quien dio la sesión; ya está probada y auditada en H3 | Si el profesional olvida marcarla, no cuenta. Se mitiga con «sesiones sin cerrar» (abajo). **Elegida** |
| 2. Nota o atención firmada vinculada | Evidencia clínica del acto | Acopla el contador a H6 y, en Psicología, a notas reservadas; firmar puede demorar horas. Descartada |
| 3. Llegada registrada (visita de H6b) | La registra recepción al instante | No toda cita tiene visita; recepción no certifica que hubo atención. Descartada |
| 4. Marca manual en la sesión | Flexible | Segunda fuente de verdad que se desincroniza de la cita. Descartada |

«Sin cobros» significa que **ningún** monto, saldo ni pago interviene: asistida no es «pagada» ni «consumida del paquete».
**Sesiones sin cerrar:** una sesión `agendada` cuya `cita_fin` ya pasó se muestra al profesional como «Sin cerrar» (derivado del
espejo, sin tocar `citas`) para que marque la cita atendida o recepción la marque «no asistió».

**Casos (la base los hace cumplir; los escenarios están en `specs/sesiones-y-citas`).**

| Caso | Sesión | Plan |
|---|---|---|
| El paciente **no asiste** (recepción marca «no asistió», H3) | `por_agendar`, `inasistencias + 1`; **no se consume** | Sigue `activo`; el profesional ve el número de inasistencias y decide |
| Se **reprograma** | La sesión pasa sola a la cita nueva | `activo` |
| Se **cancela** y no se reprograma | `por_agendar` (cancelada) | `activo` |
| **Baja del profesional**: sus citas se reasignan (H3) | Sigue la cita nueva; `cita_profesional_id` es el colega | `activo`; el colega la lee porque, al confirmarse la cita, tiene al paciente a cargo |
| El paciente **abandona** | Las ya agendadas quedan en `citas` | El profesional lo cierra como `cancelado` / `abandono`; la pantalla avisa cuántas citas futuras siguen vigentes para cancelarlas desde la agenda |
| Se **cumplen todas** | Todas `asistida` | Pasa solo a `completado` |
| **Alta anticipada** | Las pendientes quedan como están | El profesional lo cierra como `completado` / `alta_anticipada` |
| Vence la **vigencia** con sesiones pendientes | Sin cambio | Sigue `activo` y se muestra «Vencido»: ya no se pueden vincular citas fuera de la vigencia; el profesional la extiende o lo cierra |

**Inasistencias.** Propuesta: la sesión no se consume porque el tratamiento se mide en sesiones **dadas**; no existe un umbral
automático de abandono. <!-- REVISAR: decisión del usuario con la clínica (¿cuántas inasistencias cierran el plan? ¿se cobra la sesión perdida? esto último es de cobros, fuera de alcance). -->

### D6. El contador de sesiones restantes, los estados y el cierre

**El contador se calcula en la base, nunca se guarda.** La vista `planes_de_sesiones_con_contador` (`security_invoker = true`,
`GRANT SELECT` a `authenticated`) une el plan con la agregación de sus sesiones y expone, además de las columnas del plan:

| Columna | Definición |
|---|---|
| `asistidas`, `agendadas`, `por_agendar` | Número de sesiones en cada estado |
| `restantes` | `asistidas` excluidas: `agendadas + por_agendar`. Por la invariante de abajo, es `total_sesiones − asistidas` |
| `inasistencias` | Suma de `inasistencias` de las sesiones |
| `sesiones_sin_cerrar` | Sesiones `agendada` con `cita_fin < now()` |
| `proxima_sesion_en` | El menor `cita_inicio` de una sesión `agendada` futura |
| `vencido` | `estado = 'activo'` y `vigente_hasta < hoy_lima()` |

Como es `security_invoker`, la vista hereda la RLS de ambas tablas: quien no lee el plan no lo ve, y la restricción de Psicología
(D2) se cumple por construcción. Un error en la vista puede mostrar columnas de más (la prueba fija la lista exacta con
`columns_are`), no filas de más.

**Invariante.** `count(sesiones) = total_sesiones` en todo plan. Los dos únicos escritores (crear y ajustar) respetan el número, y un
disparador de restricción **diferido** (`planes_total_coherente`, `DEFERRABLE INITIALLY DEFERRED`, en las dos tablas) lo comprueba al
confirmar, para todo rol incluido el dueño: es la segunda barrera si una función futura se equivoca.

**Estados y transiciones del plan** (un disparador `planes_proteger` las impone a todo rol, incluido el dueño, y rechaza todo
`DELETE`):
- `activo → completado`: automática cuando no queda ninguna sesión sin asistir (`cierre_motivo = 'sesiones_cumplidas'`, `cerrado_por`
  nulo), o a mano como **alta anticipada** (`alta_anticipada`).
- `activo → cancelado`: a mano, con `abandono`, `indicacion_clinica`, `error_de_registro` o `reemplazado`.
- `completado` y `cancelado` son terminales: un tratamiento nuevo es un plan nuevo. Los motivos son un conjunto **cerrado**, no
  texto libre: el relato clínico va en la historia, no en el plan.
- `vigente_hasta` solo puede **aumentar** y `total_sesiones` solo puede aumentar (con sus filas nuevas), mientras el plan esté
  `activo`. Todo lo demás del plan es inmutable.

**Quién cierra y ajusta.** `cerrar_plan_de_sesiones()` y `ajustar_plan_de_sesiones()` los ejecuta un profesional activo con el
paciente a cargo **y** de la profesión del plan (el autor, o un colega de la misma profesión que lo cubre tras una baja). La
completitud automática no la ejecuta nadie: la dispara el disparador de D4 en la misma transacción que marca la cita.

*Alternativas descartadas.* (a) **Columna `restantes` mantenida por disparador:** una segunda fuente de verdad que puede
quedar mal. (b) **Contador en la aplicación:** la regla dejaría de estar en la base y dos pantallas podrían contar distinto.
(c) **Estado `vencido` almacenado:** necesita un proceso que lo cambie a medianoche (un cron que ADR-0028 no permite); es una
condición derivada. (d) **Reabrir un plan cerrado:** borra la historia de por qué se cerró; se crea uno nuevo.

### D7. Se escribe solo con funciones; qué hace cada rol

Las cuatro tablas nacen con RLS activada y **sin `GRANT` de `INSERT`, `UPDATE` ni `DELETE` para ningún rol de usuario** (ni
`anonymous`, `cron_notificaciones` ni `sync_identidad`: ningún privilegio). Toda escritura pasa por una función con `search_path`
vacío, `REVOKE ALL ... FROM PUBLIC`, `EXECUTE` solo a `authenticated`, **guarda de rol y de actividad como primera sentencia**
(`rol_actual()`, perfil y fila de profesional activos; si no, `42501`) y **ningún parámetro que identifique al actor**: el actor sale
de `perfil_actual()` y `profesional_actual()`. Las fechas y las horas las pone la base. Comprobaciones que revelarían existencia
(el paciente, el plan) van después de rol y paciente a cargo, para que un plan ajeno y uno inexistente den el mismo `42501`.

| Función | `SECURITY` | Quién | Qué hace |
|---|---|---|---|
| `crear_plan_de_sesiones(p_id, p_paciente, p_atencion, p_protocolo_clave, p_descripcion, p_total, p_frecuencia_dias, p_vigente_hasta)` | DEFINER | profesional activo, de una profesión de `profesion_puede_planificar_sesiones()` (`HC090`), con el paciente a cargo | Inserta el plan y sus N sesiones en una transacción. Idempotente: el mismo `p_id` del mismo autor y paciente devuelve el plan existente; de otro autor o paciente, `42501` |
| `ajustar_plan_de_sesiones(p_plan, p_vigente_hasta, p_sesiones_adicionales)` | DEFINER | profesional activo de la profesión del plan, con el paciente a cargo (`HC090`) | Amplía la vigencia o el total (solo hacia arriba, `HC091`), plan `activo` (`HC092`) |
| `cerrar_plan_de_sesiones(p_plan, p_estado, p_motivo)` | DEFINER | igual que arriba | `activo → completado` (`alta_anticipada`) o `cancelado` (motivo cerrado) |
| `vincular_cita_a_sesion(p_sesion, p_cita)` | DEFINER | administrativo | D4 |
| `agendar_sesion_del_plan(p_sesion, p_paciente, p_profesional, p_inicio, p_fin)` | **INVOKER** | administrativo (lo comprueba además `rol_actual()`) | `reservar_cita()` + `vincular_cita_a_sesion()` en una transacción |
| `proponer_serie_sesiones(p_plan, p_desde, p_profesional, p_tolerancia_dias)` | DEFINER | administrativo | D9 |
| `planes_para_agendar()` y `sesiones_del_plan_para_agendar(p_plan)` | DEFINER | administrativo | Lectura con lista blanca (D10) |
| `registrar_aplicacion_instrumento(p_id, p_paciente, p_instrumento, p_atencion, p_respuestas, p_calculo_servidor, p_interpretacion_profesional)` | DEFINER | profesional activo, con el paciente a cargo y de la profesión del área del instrumento (`HC090`) | D13 |
| `ajustar_interpretacion_aplicacion(p_aplicacion, p_texto)` y `anular_aplicacion_instrumento(p_aplicacion, p_motivo)` | DEFINER | el profesional que la registró, mientras tenga al paciente a cargo | D13 |

Funciones internas, **sin `EXECUTE` para `authenticated`**: `calcular_puntajes_instrumento()`, `instrumento_definicion_valida()` (puras,
`IMMUTABLE`) y las funciones de disparador. El `GRANT SELECT` de las cuatro tablas y de la vista es el único privilegio directo; las
políticas son las de D2 (planes, sesiones, aplicaciones) y D11 (catálogo).

*Alternativas descartadas.* (a) **Políticas `INSERT`/`UPDATE` más disparadores** (el patrón de `atenciones`): el plan y sus N
sesiones son varias filas que deben nacer juntas y cuadrar, y las sesiones las cambia un disparador de otra tabla (D4), no un
usuario. (b) **Privilegio por columna:** no distingue por rol ni por profesión. (c) **Dejar al profesional crear citas:** H3
reserva `reservar_cita()` a recepción y al paciente; ampliarlo es un cambio de H3 y de su regla de roles.

### D8. Concurrencia: un orden de bloqueo fijo y cuatro carreras probadas

**Orden de bloqueo:** siempre **plan primero, sesión después**. Las funciones de D7 que modifican un plan (`vincular`, `ajustar`,
`cerrar`) y el disparador de `atendida` toman `select ... from planes_de_sesiones where id = $1 for update` antes de tocar sus
sesiones. Los disparadores de `no_asistio`, `cancelada` y reprogramación tocan **solo la fila de la sesión** (no bloquean el plan),
de modo que no pueden cerrar un ciclo con los anteriores. Un `40P01` entre una reprogramación y una reserva del mismo horario
es un choque legítimo de horario y H3 ya lo traduce a `Registro de cita ya agendado`.

| Carrera | Mecanismo | Resultado |
|---|---|---|
| Dos recepciones agendan **la misma sesión** a la vez (con horarios distintos) | `vincular` bloquea plan y sesión; la segunda ve la sesión `agendada` | Una gana; la otra recibe `HC092` y, como todo ocurre en una transacción, **su cita no queda creada** |
| Dos recepciones vinculan **la misma cita** a dos sesiones | índice único parcial de `cita_id` | Una gana; la otra, `HC093` (el `23505` se traduce) |
| Dos profesionales (uno de cobertura) marcan **atendida** las dos últimas sesiones a la vez | el disparador bloquea el plan; la segunda transacción, ya liberado el bloqueo, cuenta con una instantánea nueva (`READ COMMITTED`) | El plan pasa a `completado` **una sola vez**, en la segunda, y ambas sesiones quedan `asistida` |
| **Cerrar** el plan contra una cita que se marca atendida | ambos bloquean el plan | El plan queda `cancelado` o `completado`, nunca los dos; la sesión queda `asistida` en ambos órdenes |
| **Crear** el mismo plan dos veces (doble clic) | `p_id` idempotente | Un plan y N sesiones |
| **Ajustar** el total contra vincular | ambos bloquean el plan | Las filas nuevas existen antes o después, y el diferido `planes_total_coherente` pasa |

`tests/concurrencia/30_planes_de_sesiones.test.ts` (sesiones `pg` reales como `authenticated`, con el ayudante `_sesion.ts` de H3)
cubre las cuatro primeras, 20 rondas.

### D9. Sesiones recurrentes «programadas solas», sin cron: la base propone, recepción confirma

**Alternativas**

| | A. Propuesta de la base + confirmación de recepción, una transacción por sesión (elegida) | B. Todas las citas al crear el plan (el supuesto de TECH-DESIGN) | C. Siguiente sesión propuesta al marcar la anterior | D. Cron que agenda |
|---|---|---|---|---|
| Quién tiene permiso para crear citas | Recepción: sí | El profesional que crea el plan: **no** (H3) | Recepción | Un rol de servicio con alcance de escritura: rompe la regla de credenciales de CLAUDE.md |
| El paciente acordó las fechas | Sí: recepción las acuerda y confirma | No | Sí | No |
| Una colisión | Esa sesión queda por agendar; el resto se agenda | Todo o nada | — | Agenda a ciegas |
| Agenda bloqueada de golpe, recordatorios de fechas no acordadas | No | Sí | No | Sí |
| Cron nuevo | No | No | No | **Sí** (ADR-0028 lo prohíbe) |
| Veredicto | **Elegida** | Descartada | Posible mejora futura | Descartada |

**Cómo funciona.** `proponer_serie_sesiones(plan, desde, profesional, tolerancia)` devuelve, para cada sesión `por_agendar` por orden
de `numero`, `(sesion_id, numero, inicio, fin)`:
- La fecha objetivo de la primera es `desde` (por omisión mañana, hora de Lima); la de cada una siguiente es la anterior propuesta o
  agendada más `frecuencia_dias`: **ninguna se propone antes de su fecha objetivo**.
- Para cada fecha toma el primer hueco de `slots_disponibles(profesional, fecha)` dentro de la tolerancia (por omisión 2 días,
  máximo 7), prefiriendo la misma hora del día que la sesión anterior, sin repetir un hueco ya propuesto y descartando los que se
  cruzan con otra cita vigente del paciente (misma idea que `propuestas_reasignacion` de H3).
- Sin hueco, o con la fecha posterior a `vigente_hasta`, devuelve `inicio` y `fin` nulos: esa sesión se agenda a mano.
- `p_profesional` es opcional: por omisión el del plan; si está de baja, recepción elige a un colega **de la misma especialidad**
  (`HC093` si no lo es).

La Server Action muestra la serie, recepción **confirma las filas** y se llama a `agendar_sesion_del_plan()` **una vez por sesión**,
informando éxito o error por fila (como la reasignación de H3: no hay «agendar todo» automático). Nada se agenda en segundo plano.
<!-- REVISAR: esto precisa el supuesto de TECH-DESIGN («las citas de la serie se crean al crear el plan»), que choca con que el profesional no puede crear citas. -->

### D10. Qué ve recepción: lista blanca, no lectura de la tabla

El administrativo no tiene política de `SELECT` sobre ninguna de las cuatro tablas (el protocolo y la descripción del plan son
clínicos). Para agendar usa dos funciones cuyo **tipo de retorno es la lista blanca**; una columna nueva exige editar la función y la
prueba compara la lista exacta con `pg_get_function_result`:

- `planes_para_agendar()`: de los planes `activo` con sesiones `por_agendar`: `plan_id`, `paciente_id`, `profesional_id`,
  `profesional_activo`, `especialidad_id`, `total_sesiones`, `asistidas`, `agendadas`, `por_agendar`, `frecuencia_dias`,
  `vigente_hasta`, `vencido`, `proxima_sesion_en`. Nombre y documento del paciente y nombre del profesional los lee recepción de
  `pacientes`, `profesionales` y `perfiles` con sus políticas actuales.
- `sesiones_del_plan_para_agendar(plan)`: `sesion_id`, `numero`, `estado`, `cita_inicio`, `cita_fin`, `resultado_ultima_cita`,
  `inasistencias`.

**No** devuelven `protocolo_clave`, `descripcion`, `atencion_id`, `profesion_autor` ni `area`, también para los planes de un
psicólogo: recepción ya ve las citas de cada especialidad, y estos datos no añaden nada que sea clínico. <!-- REVISAR con el asesor
(P-14): que recepción sepa «8 sesiones con un psicólogo» es igual de visible que las citas, pero es salud mental. -->

### D11. El instrumento: una definición mínima validable en SQL

**Opciones**

| | A. `jsonb` con un subconjunto mínimo validado por una función de la base (elegida) | B. Tablas normalizadas (`instrumento_items`, `instrumento_opciones`, `instrumento_escalas`) | C. JSON Schema completo (`pg_jsonschema`) | D. Puntaje en código de aplicación, catálogo en TypeScript | E. Una función SQL escrita a mano por instrumento |
|---|---|---|---|---|---|
| Tablas clínicas nuevas que blindar | 0 más | 3 más, cada una con RLS y prueba negativa | 0 | 0 | 0 |
| Extensión nueva en Neon | No | No | **Sí** | No | No |
| El puntaje se verifica en la base | Sí | Sí | Solo la forma | **No** | Sí |
| Revisar un instrumento nuevo | Datos + vectores | Datos + vectores | Datos | Código | Código arbitrario por instrumento |
| Veredicto | **Elegida** | Descartada (el encargo fija cuatro tablas) | Descartada (ADR-0029) | Descartada | Descartada |

Es el mismo criterio que D15 de `historias-clinicas`: un subconjunto mínimo de tipos, validado por un disparador, y una extensión
solo por migración revisada.

**Forma de la definición** (`items` y `escalas`, ambas `jsonb` en `instrumentos_evaluacion`):

```
items:   [ { clave, texto, tipo: "opcion" | "entero", obligatorio?, opciones?: [{ valor, etiqueta }], min?, max? } ]
escalas: [ { clave, nombre, items: [clave...], operacion: "suma" | "porcentaje", multiplicador?, minimo_respondidos?,
             rangos: [ { desde, hasta, etiqueta } ] } ]
```

Reglas de `instrumento_definicion_valida(items, escalas)` (devuelve el primer error o nulo; la ejecuta un disparador `BEFORE INSERT`
para **todo rol, incluido el dueño**, de modo que una migración defectuosa no puede cargar un instrumento roto):

| Regla | Detalle |
|---|---|
| Ítems | 1 a 120; `clave` única con formato `^[a-z][a-z0-9_]{0,29}$`; `texto` con contenido (hasta 300) |
| `opcion` | 2 a 12 opciones; `valor` entero, distinto en cada opción (la respuesta guardada es el `valor`); `etiqueta` con contenido y distinta |
| `entero` | `min` y `max` enteros, `min < max`, amplitud a lo sumo 1 000 |
| `obligatorio` | Por defecto `true`; un ítem opcional solo puede estar en escalas `porcentaje` |
| Escalas | 1 a 8; `clave` única; cada ítem aparece en al menos una; los ítems de una escala existen y no se repiten |
| `suma` | Suma de los valores × `multiplicador` (entero de 1 a 10, por defecto 1); todos sus ítems obligatorios. Un valor invertido se expresa **en los `valor` de las opciones** (no hay operación de inversión) |
| `porcentaje` | `100 × (Σ − Σmín) / (Σmáx − Σmín)` sobre los ítems respondidos, redondeado a un decimal; exige `minimo_respondidos` (entre 1 y el número de ítems). Cubre las escalas de incapacidad que prorratean un ítem omitido |
| `rangos` | 1 a 10, ordenados y contiguos: el primero empieza en el **mínimo posible** de la escala, el último termina en el **máximo posible**, y cada `desde` es el `hasta` del anterior. Un puntaje cae en el primer rango con `desde <= puntaje < hasta`; el último incluye su `hasta`. `etiqueta` con contenido (hasta 80) |
| Mínimo y máximo posibles | `suma`: Σ de los mínimos y de los máximos × `multiplicador`; `porcentaje`: 0 y 100 |

Lo que la forma **no** expresa y por tanto no se soporta: puntajes estandarizados o con baremos por edad o sexo, ponderaciones no
lineales, ítems de texto libre, lógica condicional entre ítems. Si un instrumento lo necesita, es una `operacion` nueva: cambio de
esquema revisado, con el validador, el cálculo en SQL y en TypeScript y sus pruebas (no un dato).

### D12. El puntaje: lo calcula el servidor, lo verifica la base, el profesional no lo toca

1. **Dos implementaciones del mismo cálculo.** `lib/instrumentos/puntaje.ts` (TypeScript, puro, **aritmética entera**) y
   `calcular_puntajes_instrumento(items, escalas, respuestas) → jsonb` (SQL, `IMMUTABLE`, sin acceso a tablas). Ambas validan las
   respuestas (`HC095`: clave ajena, ítem obligatorio ausente, valor que no es una opción del ítem, entero fuera de rango, número no
   entero) y devuelven `{ puntajes: { escala: número }, interpretaciones: { escala: etiqueta } }`.
2. **El redondeo no es de coma flotante.** `suma` es entera; `porcentaje` es `round(1000 × (Σ − Σmín) / (Σmáx − Σmín))` con
   redondeo de mitades hacia arriba en enteros, dividido entre 10, tanto en TypeScript (enteros o `BigInt`) como en SQL (`numeric`).
   Así los empates (`x,x5`) no dependen de la representación binaria.
3. **El servidor calcula primero.** La Server Action relee la definición del instrumento **bajo RLS** (nunca confía en una definición
   del cliente), calcula el puntaje y llama a `registrar_aplicacion_instrumento()` con las respuestas y su resultado en
   `p_calculo_servidor`. El cliente puede mostrar una vista previa con el mismo `puntaje.ts`, pero lo guardado nunca es lo que envió
   el navegador.
4. **La base verifica.** La función recalcula con SQL y compara los **puntajes** con los del servidor; si difieren,
   `HC097` y no se guarda nada (es un defecto en alguna de las dos implementaciones o una manipulación). Inserta siempre el cálculo
   de la **base**. Una segunda barrera, el disparador `aplicaciones_verificar` (`BEFORE INSERT`, todo rol incluido el dueño),
   recalcula desde `respuestas` y el instrumento y rechaza una fila cuyos `puntajes` o `interpretaciones` no coincidan.
5. **Paridad.** Un archivo de vectores (`tests/instrumentos/casos-puntaje.json`) con instrumentos sintéticos (suma, suma con
   multiplicador y valores invertidos, porcentaje con ítem omitido, límites de cada rango, respuestas inválidas) se ejecuta
   contra TypeScript (`node:test`) y contra `calcular_puntajes_instrumento()` en un branch de desarrollo (prueba de
   integración); una discrepancia rompe la suite. La prueba pgTAP 81 repite en SQL los casos clave.
6. **Verificación posterior.** `verificar_aplicacion(id)` no hace falta como función: la prueba recalcula todas las aplicaciones
   guardadas y falla si alguna no coincide (el catálogo es inmutable, así que el recálculo siempre es posible).

*Alternativas descartadas.* (a) **Solo SQL:** una implementación, sin riesgo de divergencia, pero el encargo pide que el servidor
calcule y la base verifique, y sin segunda implementación la «verificación» sería circular; es la alternativa si se juzga que el
costo de mantener dos supera el valor (borra `puntaje.ts`, `p_calculo_servidor`, la paridad y la tarea 7.2).
<!-- REVISAR: decisión del usuario; el diseño recomienda las dos implementaciones por lo que pidió el encargo. -->
(b) **Que el cliente calcule y envíe el puntaje:** el cliente no es de confianza. (c) **Guardar solo las respuestas y calcular al
leer:** el catálogo es inmutable, pero una columna que no existe no se puede auditar ni consultar sin recalcular y la interpretación
del profesional quedaría sin el resultado al que se refiere.

### D13. Aplicaciones: registro, interpretación ajustable, anulación

**`aplicaciones_instrumento`** (RLS activada; se escribe con las funciones de D7):

| Columna | Detalle |
|---|---|
| `id` | `uuid` PK, lo aporta el formulario (idempotencia) |
| `paciente_id` | `references pacientes(id)` |
| `profesional_id` | quien la aplicó; siempre `profesional_actual()` |
| `instrumento_id`, `area` | clave foránea compuesta `(instrumento_id, area) → instrumentos_evaluacion`: el área sale del catálogo y no se puede declarar otra |
| `atencion_id` | nulo; misma persona y mismo profesional (`HC094`); la nota o evaluación en la que se aplicó |
| `aplicada_en` | `timestamptz`, `now()` del servidor |
| `respuestas`, `puntajes`, `interpretaciones` | `jsonb` objetos (D12) |
| `interpretacion_profesional` | texto nulo, hasta 1 000 caracteres con contenido |
| `revisiones_interpretacion` | `jsonb` arreglo, por defecto `[]`: historial solo-agregar de `{ texto, por, en }` |
| `estado`, `motivo_anulacion`, `anulada_por`, `anulada_en` | `vigente` / `anulada`; los tres últimos con valor solo si `anulada` |

**Reglas.**
- Registrar exige instrumento **vigente** y con licencia verificada (`HC096`), profesión del área (`HC090`), paciente a cargo y
  respuestas válidas (`HC095`). La profesión y el área no las controla el cliente.
- **El puntaje es inmutable.** `aplicaciones_proteger` (todo rol, incluido el dueño) rechaza todo `DELETE` y todo `UPDATE` salvo dos:
  (i) la **anulación** (`vigente → anulada` con sus tres campos, nada más cambia) y (ii) el **ajuste de la interpretación**: cambia
  `interpretacion_profesional` y **agrega exactamente un elemento** a `revisiones_interpretacion` cuyo `texto` es el nuevo valor,
  `por` el profesional actual y `en` el reloj de la base (`HC098` en cualquier otro cambio). El puntaje, las respuestas y la
  interpretación automática no se pueden editar por ninguna vía.
- **«Ajustar la interpretación» significa dos cosas, ambas permitidas:** escribir una interpretación propia al registrar (primer
  elemento del historial) y revisarla después (elementos siguientes). La interpretación automática del instrumento se conserva
  siempre al lado; la del profesional nunca la reemplaza.
- **Anular** es para una aplicación a la persona equivocada o con respuestas mal digitadas: se anula y se registra otra. La anulada
  se muestra «Anulada», no se borra y no aparece como último resultado.

*Alternativas descartadas para el historial de la interpretación.* (a) Una interpretación fijada al registrar, sin edición:
corregir un error de redacción obliga a anular y volver a digitar todo el cuestionario. (b) Texto editable sin historial: pierde
lo que se escribió antes. (c) Una tabla de revisiones: una quinta tabla clínica (el encargo fija cuatro). (d) Llevar el criterio
clínico solo a la nota de sesión: es válido, pero entonces «el profesional puede ajustar la interpretación» no queda en el
registro del resultado.

### D14. Licencias y «uso libre»: el mecanismo no puede garantizarlas, solo exigir la verificación

El proyecto **no verificó la licencia de ningún instrumento** (P-18). Por eso:
- **Este change no carga ningún instrumento, y ninguno se carga hasta verificar su licencia uno por uno.** Sus pruebas usan
  instrumentos sintéticos creados dentro de la transacción de la prueba; nada de eso llega a una migración. La siembra de
  demostración agrega uno sintético con clave `demo_` (D18). Cada instrumento real entra en **su propia migración**, con su licencia
  verificada de forma individual (texto exacto e idioma) y citada en el encabezado; verificar un instrumento no verifica a los demás
  ni al conjunto de una especialidad.
- **Catálogo.** `uso_libre` (booleano), `fuente` (cita de la escala: autor, año), `licencia_referencia` (texto con el documento o la
  URL de la licencia o permiso) y `licencia_verificada_el` (fecha). `CHECK`: `vigente` implica `uso_libre`, `licencia_referencia` con
  contenido y `licencia_verificada_el` no nula. Un instrumento no libre puede existir como fila **no vigente** (para documentar que se
  evaluó y se descartó), nunca aplicarse (`HC096`).
- **Puerta de revisión.** La prueba 81 afirma que el catálogo de una base recién migrada solo tiene instrumentos con esa
  referencia; cada migración de instrumento (de H6f, H6g o H6h) la mantiene y debe citar la licencia en su encabezado.
- **Qué NO garantiza.** La marca `uso_libre` es tan fiable como la verificación humana que la respalda. Las licencias de muchas
  escalas restringen su reproducción, su traducción o su uso con fines comerciales, y una «escala gratuita» no es lo mismo que una de
  uso libre. Antes de cargar uno, H6f/H6g/H6h comprueban la licencia **del texto exacto y del idioma** que cargan y la anotan; quien
  no pueda, no lo carga. No se declara licenciada ninguna escala en este change ni en sus documentos.

### D15. Auditoría: escrituras con la función de H6b, lecturas en `accesos_historia`

- **Escritura.** Las cuatro tablas llevan un disparador `AFTER INSERT OR UPDATE OR DELETE` con **`registrar_auditoria_sin_contenido()`**
  de H6b (actor, rol, acción, tabla, identificador; nunca `datos_antes` ni `datos_despues`), porque el plan, las respuestas y la
  interpretación son clínicos y `auditoria` la lee el administrativo. Si esta migración llegara antes que la de H6b, crea la función
  con la **misma firma y definición** (`create or replace` idéntico).
- **Lectura.** `registrar_auditoria_sin_contenido()` es una función de disparador de escritura: **no puede auditar un `SELECT`**.
  Las lecturas se registran como en H6 (D2): cada función de `lib/historias/planes.ts` o `instrumentos.ts` que entrega contenido
  abre **una transacción** con `exigir_modo_clinico()` → `insert` en `accesos_historia` → lectura; si la inserción falla (asignación
  vencida, perfil desactivado) se revierte todo y no se devuelve nada. Tipos nuevos de `tipo_acceso`: **`plan_sesiones`** (lista o
  detalle de planes del paciente; `plan_id` en el detalle) e **`instrumento`** (lista o detalle de aplicaciones; `aplicacion_id` en
  el detalle), con `CHECK` de que cada columna solo se llena con su tipo. No se audita la lectura del catálogo (no es información
  de un paciente) ni las listas con lista blanca de recepción (no devuelven contenido clínico; mismo criterio que H6b con la
  enfermera).
- **Choque conocido (el mismo que anotó H6c).** Dos migraciones paralelas que reemplazan la restricción de `tipo_acceso` pueden borrar
  los valores una de otra. Regla: **leer la restricción vigente** (`pg_get_constraintdef`) y recrearla con la unión de sus valores y
  los nuevos; coordinar el orden con H6c, H6d y H6g (tarea 0.6).
- **Lo que la revisión de accesos del administrativo ve:** que un profesional abrió `plan_sesiones` o `instrumento` de un paciente, sin
  contenido ni área. <!-- REVISAR: igual que las citas, revela que un psicólogo accedió; el asesor (P-14) decide si el tipo de una lectura de Psicología se oculta a recepción. -->

### D16. La copia de la historia (H6d): estas tablas se clasifican y aportan su sección

La prueba de cobertura de H6d (su tarea 3.4) falla si una tabla de `public` no está mencionada en el compilado ni en su lista de
exclusiones con razón. Clasificación de este change:

| Tabla | Clasificación | Sección en la copia |
|---|---|---|
| `planes_de_sesiones`, `sesiones_del_plan` | Clínica: **incluida** | «Planes de sesiones»: protocolo o descripción, total, frecuencia, vigencia, estado y motivo de cierre, y por sesión su número, estado, fecha de Lima de la cita y la fecha en que se asistió. Incluye los de Psicología (la copia la incluye por decisión del usuario) |
| `aplicaciones_instrumento` | Clínica: **incluida** | «Instrumentos aplicados»: nombre y versión del instrumento, fecha, quién la aplicó, cada ítem con la etiqueta de la opción elegida, los puntajes, las interpretaciones (automática y del profesional con su historial) y las **anuladas marcadas como anuladas** |
| `instrumentos_evaluacion` | Catálogo, **no es dato del paciente**; se **lee** para dar sentido a las respuestas y por eso figura en el compilado | Ninguna propia |

El compilado debe marcar `incluye_psicologia` cuando entre cualquiera de estas secciones con `area = psicologia`. Orden de
construcción: si `compilar_copia_historia()` ya existe, la migración 8 (condicional) la reemplaza con `create or replace` agregando
las secciones; si H6d aún no se aplicó, la tarea 6.5 deja la lista en su `design.md` y su prueba de cobertura las exigirá.

### D17. Errores: SQLSTATE `HC090` a `HC098`

`HC099` queda reservado. No chocan con `HC001`–`HC005` (H6), `HC010`–`HC019` (H2c), `HC020`–`HC029` (H6b), `HC030`–`HC039` (H6c), `HC040`–`HC049` (H6d) ni
`HC050`–`HC089` (H6e a H6h).

| SQLSTATE | Significado | Mensaje al usuario (usted) |
|---|---|---|
| `HC090` | Profesión no autorizada (crear un plan, aplicar un instrumento de otra área, cerrar el plan de otra profesión) | «Su profesión no puede realizar esta operación en este sistema.» |
| `HC091` | Datos del plan vacíos o inválidos; ajuste que reduce | «Revise el plan: hay datos vacíos o inválidos.» |
| `HC092` | El estado del plan o de la sesión no permite la operación | «Esta operación ya no es posible: el plan o la sesión cambió de estado. Actualice la pantalla.» |
| `HC093` | La cita no corresponde a la sesión | «La cita no corresponde a esta sesión: revise el paciente, el profesional, la fecha y la vigencia del plan.» |
| `HC094` | La atención indicada no corresponde al paciente y al profesional | «La atención indicada no corresponde a este paciente y a este profesional.» |
| `HC095` | Respuestas o definición inválidas | «Revise las respuestas: falta alguna o hay un valor que no corresponde.» |
| `HC096` | Instrumento inexistente, no vigente o sin licencia verificada | «Este instrumento no está disponible.» |
| `HC097` | El puntaje no coincide con el calculado en la base | «No se pudo guardar: el puntaje no coincide con las respuestas. Intente de nuevo.» |
| `HC098` | Registro inmutable | «Este registro no se modifica. Si hay un error, anúlelo y regístrelo de nuevo.» |
| `42501` | Rol, perfil, profesional inactivo o paciente no a cargo | «No tiene acceso a esta historia clínica.» (sin confirmar existencia) |
| `23505` | Cita ya vinculada / id duplicado | Se traduce a `HC093` o devuelve el registro existente (idempotencia) |
| `23514` | `CHECK` | «Hay campos vacíos o inválidos. Revise el formulario.» |
| `23P01`, `40P01` en agendar | Doble reserva | `Registro de cita ya agendado` (el literal único de `lib/citas/errores.ts`, H3) |
| `HC002`, `HC004` | Los de H6 | Los de H6 |
| otros | — | «No se pudo completar la operación. Intente de nuevo.» |

La traducción vive en `lib/sesiones/errores.ts` y `lib/instrumentos/errores.ts` (funciones puras, una prueba por fila); ningún mensaje
contiene texto de la base ni datos del paciente.

### D18. Aplicación: módulos, rutas y componentes

- **Módulos.** SQL contra las cuatro tablas, la vista y las funciones: solo en `lib/historias/planes.ts` y
  `lib/historias/instrumentos.ts` (con ejecutor inyectable; cada operación abre con `exigir_modo_clinico()`); la prueba de acceso
  único de H6 se amplía. Lógica pura sin SQL: `lib/instrumentos/{definicion,puntaje,errores}.ts` y `lib/sesiones/{estados,errores}.ts`.
  Esquemas Zod 3 `.strict()` en `lib/schemas/plan-sesiones.ts` y `lib/schemas/instrumento.ts` (este se construye a partir de la
  definición leída bajo RLS, como `lib/schemas/plantilla.ts` de H6).
- **Rutas** (cada una repite `auth.protect()`, el rol y MFA con la guardia de H6/H3; `Cache-Control: private, no-store`; páginas
  dinámicas; direcciones solo con `uuid`; lo de un tercero o de otra área devuelve 404, no 403):

| Ruta | Rol | Contenido |
|---|---|---|
| `app/administrativo/planes-de-sesiones/page.tsx` y `[planId]/page.tsx` | administrativo | Planes con sesiones por agendar, serie propuesta y confirmación, agendar una sesión, vincular una cita |
| `app/profesional/pacientes/[pacienteId]/planes/**` | profesional | Planes del paciente (con contador), crear (solo profesiones autorizadas), ajustar, cerrar |
| `app/profesional/pacientes/[pacienteId]/instrumentos/**` | profesional | Aplicaciones, aplicar un instrumento de su área, resultado, ajustar interpretación, anular |

- **Componentes nuevos** (a añadir a `docs/DESIGN.md` al aplicar; este change **no** lo edita): `ContadorDeSesiones` (restantes, texto
  y número, no solo barra), `FilaSesion` con insignia de estado (icono y texto, no solo color), `SeriePropuesta` (tabla de
  confirmación de recepción), `FormularioInstrumento` (dibuja los ítems desde la definición, uno por pantalla en móvil, errores por
  ítem, vista previa del puntaje rotulada «Vista previa: el puntaje oficial lo calcula el sistema al guardar») y
  `ResultadoInstrumento` (puntajes, interpretación automática y la del profesional, historial). Las especialidades los montan en
  sus pantallas.
- **Acciones:** `crearPlan`, `ajustarPlan`, `cerrarPlan`, `agendarSesion`, `agendarSerie` (itera por sesión), `vincularCita`,
  `aplicarInstrumento`, `ajustarInterpretacion` y `anularAplicacion`; todas con Zod en el servidor, guarda con `exigirPersonal`
  (H3) y resultado tipado (`{ ok, datos } | { ok: false, mensaje, codigo, campos? }`).
- **Sin autoguardado** de respuestas en el navegador ni en el servidor (mismo criterio que D9 de H6: `localStorage` en un equipo
  compartido es una fuga); el formulario conserva el estado en memoria mientras la pestaña viva.
- **Portal del paciente (H4):** no cambia. Reservar sus sesiones por el portal es una pregunta abierta; cuando se decida, usará
  `reservar_cita()` y el vínculo de recepción.

### D19. Migraciones, pruebas y verificación

**Migraciones** (archivos nuevos en `migrations/`, **después** de las de H2c, H3, H6 y H6b; nunca se edita una aplicada): **(1)**
`area-clinica-y-acceso-por-area`; **(2)** `planes-de-sesiones` (tipos, dos tablas, índices, `CHECK`, RLS y políticas, disparadores de
protección y de total, vista del contador, auditoría); **(3)** `funciones-de-planes` (crear, ajustar, cerrar); **(4)** `sesiones-y-citas`
(vincular, agendar, serie, listas con lista blanca, los dos disparadores sobre `citas`); **(5)** `instrumentos-de-evaluacion` (tabla,
validador, protección, política); **(6)** `aplicaciones-de-instrumentos` (cálculo puro, tabla, disparadores, funciones de registro,
ajuste y anulación, política); **(7)** `accesos-historia-mecanismos-clinicos` (tipos de acceso con la regla de la unión);
**(8, condicional)** `compilado-copia-mecanismos-clinicos` (D16).

**pgTAP** (sugeridas): **`80_planes_de_sesiones`** y **`81_instrumentos_de_evaluacion`**. Cada una incluye el caso negativo de **cada** rol
—administrativo, profesional a cargo, otro profesional, enfermera, paciente (incluido el titular), sin rol, `anonymous`,
`cron_notificaciones`, `sync_identidad`— y **de cada profesión** —médico, odontólogo, fisioterapeuta, psicólogo, podólogo, a cargo y
sin el paciente a cargo, con asignación vencida y con perfil inactivo—, más `has_table_privilege` falso de `insert`, `update` y `delete`
y `has_function_privilege` de lo que no se concede. Casos clave: `80`: el psicólogo a cargo lee el plan de Psicología y ninguna otra
profesión; el plan de un fisioterapeuta lo lee todo profesional a cargo; solo las tres profesiones autorizadas lo crean; la lista exacta
de la vista y de las funciones de recepción; el contador tras cada evento de cita (atendida, no asistió, cancelada, reprogramada,
reasignada); la invariante de total; la sesión sigue a su cita aunque la opere el dueño o el paciente; transiciones ilegales y
terminales; el administrativo con cero filas. `81`: la lista exacta de columnas; catálogo inmutable y su validador (cada regla de D11,
tanto aceptación como rechazo); `uso_libre` y licencia exigidos al vigente; cálculo con los vectores clave; puntaje manipulado
rechazado incluso como dueño; interpretación con historial y puntaje intocable; aplicación de un área ajena rechazada; cero filas de
`psicologia` para las demás profesiones; la auditoría que lee el administrativo no contiene respuestas ni textos. No asumen tablas
vacías. `99_rls_en_todas_las_tablas` sigue en verde.

**Otras pruebas.** `node:test`: `puntaje.ts` con los vectores, esquemas Zod, mapeo de errores, estados, repositorio con ejecutor
simulado (modo → acceso → lectura; si el acceso falla no se devuelve nada), acceso único ampliado. Paridad TypeScript/SQL (D12).
Concurrencia (D8). E2E (Playwright, cuentas de H1 y datos de demostración): recepción agenda una serie y ve el contador bajar al
marcar atendida; el profesional crea, ajusta y cierra un plan; un psicólogo ve su plan y un fisioterapeuta recibe 404 en la dirección
directa; una aplicación con puntaje y ajuste de interpretación; axe sobre las pantallas.

**Verificación por mutación** (como en H2 y H6), anotada en el PR, una por elemento: quitar la comprobación de área de la política,
quitar `psicologo_tiene_paciente()` del caso de Psicología, permitir `INSERT` directo, quitar el bloqueo del plan en el disparador de
`atendida`, quitar el índice único de `cita_id`, saltarse la comprobación de especialidad al vincular, aceptar un puntaje del
cliente, quitar el disparador `aplicaciones_verificar`, permitir editar `puntajes`, quitar `licencia_referencia` del `CHECK` y quitar
la regla de contigüidad de los rangos. En cada una debe fallar al menos una prueba negativa.

### D20. Contrato con los demás changes

| Con | Qué | Dónde |
|---|---|---|
| H2c | Usa `profesion_actual()`, `profesional_tiene_paciente()` y el tipo `profesion_salud`; la prueba de «toda profesión tiene área» acopla este change a esa lista | D2 |
| H3 | Dos disparadores `AFTER` sobre `citas` (sin columnas, políticas ni estados nuevos); `agendar_sesion_del_plan()` llama a `reservar_cita()` sin cambiarla; la reasignación por baja y la reprogramación siguen la cadena `reprogramada_de`. Pide a H3 que `marcar_cita_atendida()` siga siendo la única vía a `atendida` | D4 |
| H4, H5 | Sin cambios: una sesión es una cita, así que el recordatorio de un día antes y el portal funcionan como siempre. Las citas de sesiones agendadas por recepción tienen `origen = administrativo` (ver riesgos) | D4, D18 |
| H6 | `accesos_historia` gana dos tipos (regla de la unión); módulo único `lib/historias/`; guarda de datos reales; `atenciones` como destino opcional de `atencion_id` | D15 |
| H6b | Reutiliza `registrar_auditoria_sin_contenido()` | D15 |
| H6c | Ninguna especialidad receta por esta vía; coordina la restricción de `tipo_acceso` | D15 |
| H6d | Secciones nuevas del compilado y clasificación; `incluye_psicologia` | D16 |
| H6e | Odontología usa los **instrumentos** (si necesita alguno) y no el plan de sesiones (no está autorizado) | D2 |
| H6f, H6h | Usan plan e instrumentos: aportan sus protocolos e instrumentos por migración y montan los componentes; su «nota por sesión» referencia `sesiones_del_plan.id` | D1 |
| H6g | **Contrato exacto en D2:** reutiliza `psicologo_tiene_paciente(paciente uuid)` y `acceso_clinico_por_area(area, paciente uuid)` (no crea `es_psicologo_a_cargo()`); suma su política restrictiva por autoría; aplica sus tests y planes con estos mecanismos | D2 |
| H7 | Las sesiones son citas y aparecen en la agenda; el dashboard no necesita el plan | D4 |
| H8 | La carga de citas históricas se hace como dueño: los disparadores de D4 no encuentran sesión y no hacen nada | D4 |

## Risks / Trade-offs

- [Un disparador sobre `citas` escribe en tablas clínicas y se ejecuta en cada operación de agenda] → Solo busca por `cita_id` con un
  índice único parcial, escribe solo en este change, es `SECURITY DEFINER` con `search_path` vacío, y se prueba con cada camino
  (recepción, profesional, paciente en el portal, dueño, reprogramación, reasignación). Revisión `code-review` explícita.
- [El estado de la sesión es un espejo del de la cita y puede quedar mal si un camino lo omite] → Es escrito solo por esos
  disparadores y por `vincular`; la prueba de coherencia recorre todas las sesiones contra su cita; si el espejo fallara, el
  `estado` de la cita (la verdad de H3) sigue intacto.
- [El profesional olvida marcar «atendida» y el contador no baja] → «Sesiones sin cerrar» en el plan y en la lista de recepción; la
  cita no marcada tampoco cuenta en H3, así que el mismo olvido ya existe.
- [Las citas de sesiones que agenda recepción cuentan en el denominador del 75 % del portal] → Con planes de 10 sesiones, la meta de
  autogestión se aleja aunque el paciente nunca haya pedido ayuda. Es una **pregunta para el usuario** (excluirlas del
  indicador o permitir que el paciente reserve sus sesiones en el portal); este change no la decide.
- [La licencia de un instrumento se marca «libre» sin estarlo] → El catálogo exige referencia y fecha, la migración la cita y
  `code-review` la revisa; el change no carga ninguno. La responsabilidad final de la verificación es humana (D14).
- [Dos implementaciones del puntaje divergen] → Aritmética entera, vectores comunes ejecutados contra ambas, discrepancia =
  `HC097` en vez de un puntaje distinto guardado en silencio.
- [Un puntaje inconsistente con un instrumento nuevo bloquea a los profesionales] → La verificación falla cerrado (no se guarda);
  una migración corrige la definición como versión nueva.
- [Los datos de salud mental dejan rastro en `accesos_historia` y en recepción (existencia de sesiones)] → Solo existencia y
  tipo, nunca contenido; mismo nivel que las citas; se lleva al asesor (P-14).
- [La profesión autorizada a crear planes es una suposición del PRD] → Función `IMMUTABLE` con prueba de conjunto exacto; cambiarla
  es una migración de una línea.
- [Un plan cerrado deja citas futuras vigentes] → La pantalla de cierre cuenta y lista esas citas; no se cancelan solas
  (ADR-0012 y la propiedad de H3).
- [Muchos mecanismos `SECURITY DEFINER` en el núcleo de seguridad] → Guarda de rol como primera sentencia, ningún parámetro de
  identidad del actor, `search_path` vacío, `EXECUTE` mínimo, una prueba negativa por rol, profesión y función, mutación y
  `code-review` al final de cada grupo.
- [Cualquier migración o change escrito con otros nombres choca al rebasar] → Nota de nombres al inicio; las tareas 0.1 y 0.5 verifican.
- [`psicologo_tiene_paciente()` y la restricción de `tipo_acceso` los tocan varios changes] → Este change es el dueño del primero
  (H6g lo reutiliza) y aplica la regla de la unión en el segundo.

## Migration Plan

1. Grupo 0: ADR, confirmaciones (profesiones, inasistencias, licencias, 75 %), coordinación con H2c, H3, H6, H6b, H6d y H6g, y la
   consulta al asesor (P-14); decisiones documentadas antes de código.
2. Migraciones nuevas, en el orden de D19, cada una con su prueba y **posteriores a las de H2c, H3, H6 y H6b**. Nunca se edita una
   aplicada.
3. Suite pgTAP, concurrencia, paridad e integración completas en un branch de desarrollo de Neon; luego en el branch efímero del PR
   (que copia `production`).
4. Aplicación: primero lógica y repositorios, luego pantallas cuando H2b esté aplicado.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones (solo tipos, tablas, funciones, una vista y disparadores
   nuevos; el único objeto existente que se toca es la restricción de `tipo_acceso`, recreada con la unión de valores). El modo de
   datos queda en `demostracion`. Sembrar planes e instrumentos de demostración en producción es una acción explícita.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027); un defecto se corrige con una migración nueva y está prohibido restaurar el
   branch principal de Neon. Los disparadores de `citas` se desactivan con una migración que los suelte; las funciones de escritura
   se retiran revocando `EXECUTE`.

## Open Questions

**Decisiones del usuario o de la clínica (la propuesta de este change se mantiene mientras tanto; ninguna cambia la estructura):**

- **Qué profesiones crean planes.** Propuesta: fisioterapeuta, psicólogo y podólogo (lo que dice el PRD). ¿El odontólogo (controles de
  tratamientos) o el médico?
- **Inasistencia.** Propuesta: no consume la sesión y no hay umbral automático. ¿Cuántas inasistencias cierran un plan? (Cobrar
  una sesión perdida es de pagos: fuera de alcance.)
- **Las citas de sesiones y el 75 % del portal.** ¿Se excluyen del indicador, o el paciente podrá reservar sus sesiones en el portal
  (un change de H4 que usaría este vínculo)?
- **Sesión sin cita.** Un paciente que llega sin cita (H6b) a una sesión de su plan no descuenta: hoy el contador exige una cita
  `atendida`. ¿Se agenda en el día (propuesta) o se quiere otra vía?
- **Frecuencia.** `frecuencia_dias` es un intervalo; «dos veces por semana» se aproxima a 3 días. ¿Hace falta «sesiones por semana»?
- **Instrumentos entre áreas.** Hoy solo aplica un instrumento la profesión de su área. ¿Un médico debe poder aplicar una escala de
  Psicología (p. ej., en atención primaria)? Abre la regla de ADR-0031 y es del usuario y del asesor.
- **Quién cierra el plan de un colega.** Propuesta: cualquier profesional de la misma profesión con el paciente a cargo. ¿Solo el autor?
- **Valores de partida:** 60 sesiones, 90 días de frecuencia, 365 días de vigencia máxima, 8 escalas y 120 ítems por instrumento.

**Para el asesor legal (P-14, P-18):** reglas de salud mental sobre planes y tests de Psicología y qué ve recepción; **escalas con ítems
de riesgo** (por ejemplo, ideación suicida) y los protocolos de emergencia: este change **no** construye alertas, por lo que quien cargue
un instrumento así debe definir antes con la clínica qué ve el profesional y qué se hace; licencia de cada instrumento antes de cargarlo.

**Se responden durante la implementación:** presentación exacta de «Sin cerrar» y «Vencido»; si la tolerancia de la serie debe ser
configurable por la clínica; si recepción necesita imprimir el calendario de la serie para el paciente (fuera de alcance si implica
datos clínicos); si el 404 de un plan de otra área debe registrarse sin contenido en el log del servidor.
