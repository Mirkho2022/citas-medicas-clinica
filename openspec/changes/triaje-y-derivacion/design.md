# Design

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesional_actual()`, `profesional_tiene_paciente()`, `asignaciones_paciente_profesional`,
> `citas.profesional_id` y `app/profesional/**`; si la ADR se rechaza, léase `medico`/`medicos`, `medico_actual()`,
> `medico_tiene_paciente()`, `asignaciones_paciente_medico`, `citas.medico_id` y `app/medico/**`.
> <!-- REVISAR: el nombre exacto de `profesional_actual()` y de `citas.profesional_id` lo fija H2c (`profesionales-de-la-salud`). -->

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (tres capacidades). Estado de partida, verificado en
el repositorio (migraciones de H2) y en los changes vecinos (aún sin aplicar):

- **Acceso del profesional (H2, ADR-0016):** `medico_tiene_paciente()` es `SECURITY DEFINER`, lee solo asignaciones vigentes
  (fechas de Lima, `medicos.activo`) y es la **única** fuente de acceso a `historias_clinicas`, `atenciones`, `addendas` y
  `antecedentes`. `asignaciones_paciente_medico.vigente_desde/vigente_hasta` son `date` (granularidad de un día, en Lima) y el
  motivo `cita:<id>` tiene un índice único parcial. El disparador `extender_asignacion_por_cita()` crea la asignación cuando una
  cita llega a `confirmada`. **Nada concede acceso a un paciente sin cita.**
- **Lo que la enfermera puede hoy:** `enfermeras` (lee la propia), `turnos_enfermeria` (lee los suyos), catálogos
  (`especialidades`, `medicos`, `perfiles` de médicos). **No** tiene política alguna sobre `pacientes`, `citas`, tablas clínicas
  ni asignaciones. `pacientes` solo lo leen el propio paciente, el administrativo y el médico con relación vigente. Los
  privilegios por defecto de `authenticated` están revocados: cada objeto necesita su `GRANT` explícito.
- **Auditoría:** `registrar_auditoria()` vuelca filas completas salvo en `atenciones`, `addendas` y `antecedentes` (sin
  contenido); el administrativo lee `auditoria`. Otros changes (H6 con `adjuntos_historia`, H6c con recetas) también querrían
  ampliar su lista de tablas sin contenido: ver D13.
- **Citas (H3, aún sin aplicar):** estados `reservada → confirmada → atendida` o `no_asistio` o `cancelada`; la recepción
  confirma y marca «no asistió»; el profesional dueño marca «atendida» con `marcar_cita_atendida()`; `reservar_cita()` es el único
  punto de inserción. H3 **posee** esas transiciones y su ítem 5 posee el registro de pacientes y las columnas de filiación.
- **Historias clínicas (H6, aún sin aplicar):** módulo único de acceso en `lib/historias/`, lectura atómica con registro en
  `accesos_historia`, guarda de datos reales (`exigir_paciente_admisible()`, `exigir_modo_clinico()`, SQLSTATE `HC001`–`HC005`)
  y la pantalla de la historia, donde el profesional ve el triaje.
- **Dashboard (H7, aún sin aplicar):** define «en espera» desde la hora de la cita porque no existe registro de la llegada
  (D2 y Q1 de `turnos-y-dashboard`) y reserva esa decisión a una ADR.
- **ADR-0032 (propuesta):** entidad `derivaciones` con estados `pendiente`, `tomada`, `cerrada`, `vencida`; derivar no da
  acceso; «tomar» inserta la asignación (append-only, motivo `derivacion:<id>`, vigencia acotada); la vigencia no se fija.

## Goals / Non-Goals

**Goals:**
- Que ningún rol obtenga acceso a una historia por derivar: el acceso nace solo al **tomar**, lo concede la base y lo
  registra la asignación, que sigue siendo la única fuente.
- Que la enfermera registre triajes y derive **sin** poder leer historias, datos clínicos ni la ficha completa del paciente,
  y que eso lo imponga la base de datos, no la pantalla.
- Que la máquina de estados de la visita, la unicidad de la visita en curso y el «un solo ganador» al tomar sean
  invariantes de la base, a prueba de concurrencia.
- Dejar registrada la llegada con marcas de tiempo del servidor para poder medir esperas y la cobertura del triaje.

**Non-Goals:**
- La pantalla de la historia y la lectura auditada del triaje por el profesional (H6); el dashboard (H7); recetas (H6c); la
  copia de la historia (H6d); alertas por valores críticos; clasificación clínica de signos vitales.
- Resolver P-1, la acreditación ante el MINSA, el registro ante la ANPD ni las reglas de salud mental.
- Cola con llamado por pantalla, prioridades clínicas o categorías de urgencia, y agenda de enfermería (los turnos son de H7).
- Reasignar citas, cambiar estados de citas o modificar `profesional_tiene_paciente()` (se usa tal cual).

## Decisions

### D1. La visita es una entidad propia; no se tocan los estados de la cita

Una **visita** es una llegada del paciente a la clínica en un día, con cita o sin ella. Tabla `visitas`:

| Columna | Detalle |
|---|---|
| `id` | `uuid` PK; `unique (id, paciente_id)` para las claves foráneas compuestas de `triajes` y `derivaciones` |
| `paciente_id` | `references pacientes(id) on delete restrict` |
| `cita_id` | nulo = **sin cita**; `references citas(id) on delete restrict`; una visita por cita (D2) |
| `estado` | `estado_visita` (D2), por defecto `llegada` |
| `profesional_id` | quien la tiene **en atención** ahora; nulo en cualquier otro estado |
| `especialidad_destino_id` | a qué especialidad espera mientras está `derivada`; nulo en los demás estados |
| `llegada_en` | `timestamptz not null default now()`; lo sella la base (nadie escribe directamente) |
| `atencion_iniciada_en` | primera vez que un profesional la toma; nulo hasta entonces |
| `finalizada_en` | solo en estados terminales |
| `cierre_motivo` / `cierre_automatico` | código cerrado (`se_retiro`, `no_respondio`, `registro_erroneo`, `cita_cancelada`, `dia_anterior`), **no texto libre**; `cierre_automatico boolean` |
| `registrada_por` | `references perfiles(id)`, tomado del token, nunca de un parámetro |

`CHECK visitas_estado_coherente`: `en_atencion ⇒ profesional_id y atencion_iniciada_en no nulos`; `derivada ⇒
especialidad_destino_id no nulo`; terminal `⇒ finalizada_en no nulo`; no terminal `⇒ finalizada_en nulo`. Índices únicos
parciales: **una visita en curso por paciente** (`(paciente_id) where estado in ('llegada','con_triaje','derivada',
'en_atencion')`) y **una visita no anulada por cita** (`(cita_id) where cita_id is not null and estado <> 'anulada'`).

*Alternativas descartadas.* (a) **Columnas o estados nuevos en `citas`** (`llegada_en`, `en_sala`): un paciente sin cita no
tiene fila de cita; alterar `estado_cita` toca los predicados de las dos `EXCLUDE` y el mapa de estados de H2b, y la
transición es de H3. (b) **Una cita inmediata para cada paciente sin cita** (la alternativa ya descartada de ADR-0032): fija
de antemano al profesional y contamina el 75 %. (c) **Reutilizar `atenciones`**: es el acto clínico firmado e inmutable de
H6; una llegada no es una atención. (d) **Derivar los datos de la visita de `derivaciones` y `triajes`** sin tabla propia: no
hay dónde anclar «con cita», la unicidad de la visita en curso ni las marcas de tiempo.

### D2. Máquina de estados de la visita: cerrada, con una operación por transición

Estados (`estado_visita`): `llegada`, `con_triaje`, `derivada`, `en_atencion`, `atendida`, `abandonada`, `anulada`. Terminales:
`atendida`, `abandonada`, `anulada`. Un terminal nunca vuelve a no terminal.

| Desde → hacia | Operación | Quién | Condición (si falla: SQLSTATE) |
|---|---|---|---|
| — → `llegada` | `registrar_llegada` | administrativo | sin visita en curso (`HC020`); con cita: `confirmada`, del paciente, del día de Lima y sin visita (`HC021`) |
| `llegada` → `con_triaje` | `registrar_triaje` | enfermera | — (el primer triaje cambia el estado; los siguientes no) |
| `con_triaje` → `derivada` | `derivar_paciente` | enfermera | visita **sin cita**, con ≥ 1 triaje (`HC023`), sin derivación pendiente (`HC029`), especialidad con profesional activo (`HC025`) |
| `con_triaje`/`llegada` → `en_atencion` (con cita) | `tomar_paciente` | el profesional **de la cita** | cita `confirmada`/`atendida` y asignación vigente (`HC027`); puede tomarla sin triaje (D7) |
| `derivada` → `en_atencion` | `tomar_paciente` | profesional de la especialidad destino | derivación pendiente y vigente (`HC026`, `HC027`, `HC028`) |
| `en_atencion` → `derivada` | `derivar_paciente` | el profesional que la tiene | **otra** especialidad (`HC024`), con profesional activo (`HC025`) |
| `derivada` → `con_triaje` | `anular_derivacion` | la enfermera que derivó | derivación aún `pendiente` (corrige un error de especialidad) |
| `derivada` → `en_atencion` | `anular_derivacion` | el profesional que derivó | derivación aún `pendiente`; la visita vuelve a él |
| `en_atencion` → `atendida` | `terminar_atencion` | el profesional que la tiene | — |
| `llegada`/`con_triaje`/`derivada` → `abandonada` | `cerrar_visita` | administrativo o enfermera | motivo del código cerrado |
| `llegada` → `anulada` | `cerrar_visita` | administrativo | sin triajes ni derivaciones: fue un error de registro (`HC022`) |
| no terminal de un día anterior → `abandonada` / `atendida` | cierre perezoso dentro de `registrar_llegada` | (función) | `abandonada` si nunca fue tomada; `atendida` si ya estaba `en_atencion`; `cierre_automatico = true` |

Un disparador `visitas_validar_transicion` (`BEFORE UPDATE OF estado`) rechaza **cualquier** otra transición para todo rol,
incluido el dueño: es la segunda barrera si una función futura se equivoca. Cualquier otra combinación falla con `HC022`.

**Relación con la cita (decisión).** La visita y la cita **no se acoplan**: llegar no cambia el estado de la cita, tomar no la
marca «atendida» y «atendida» (H3, la marca el profesional) no cierra la visita; es el mismo desacople que H6 eligió entre
firmar y «atendida» (D13 de `historias-clinicas`) y por la misma razón: dos módulos con dueño distinto no deben dejarse a medias
el uno al otro. Dos puntos de contacto, ambos pedidos a H3 (sección «Choques», informe final): una cita con visita no anulada no
debería poder marcarse «no asistió»; y una cita cancelada o reprogramada después de la llegada deja la visita sin cita válida
(se cierra y se registra otra llegada; D9).

**Cierre perezoso, sin cron.** El plan Hobby de Vercel limita los cron (ADR-0028) y ampliar `cron_notificaciones` para que
escriba visitas rompería su `GRANT` mínimo. Por eso una visita de un día anterior se cierra la próxima vez que
`registrar_llegada` se ejecuta para ese **mismo paciente**; las de otros pacientes quedan visibles a recepción en la lista
«visitas sin cerrar de días anteriores» (un `where llegada_en < hoy` sobre una política que el administrativo ya tiene) y las
cierra a mano con `cerrar_visita`. La derivación pendiente de una visita cerrada pasa a `vencida` por un disparador (D6).

*Alternativas descartadas.* (a) Un estado explícito `en_triaje` con «llamar al paciente» de la enfermera: más fricción por
paciente y más una carrera entre enfermeras que no evita nada (varios triajes por visita son legales); el primer triaje basta.
(b) Dejar `UPDATE` de `estado` a las políticas: obliga a exponer columnas a roles que no deben ver la visita (D3). (c) Cierre
por cron: ver arriba.

### D3. Se escribe solo con funciones `SECURITY DEFINER`; se lee por política o por función con lista blanca de columnas

Las tres tablas nacen con RLS activada y **sin `GRANT` de `INSERT`, `UPDATE` ni `DELETE` para ningún rol de usuario** (ni
`anonymous`, `cron_notificaciones` ni `sync_identidad`: ningún privilegio). Toda escritura pasa por una función
`SECURITY DEFINER` con `search_path` vacío, `REVOKE ... FROM PUBLIC`, `EXECUTE` solo a `authenticated` y un **guarda de rol y
de actividad como primera sentencia** (`rol_actual()`, perfil y fila de enfermera/profesional activos; si no, `42501`). La
identidad del actor sale de `perfil_actual()` (el token), nunca de un parámetro. Funciones:

| Función | Quién | Efecto |
|---|---|---|
| `registrar_llegada(paciente, cita?)` | administrativo | crea la visita (D2) |
| `cerrar_visita(visita, resultado, motivo)` | administrativo; enfermera solo `abandonada` | termina la visita sin atención |
| `registrar_triaje(visita, mediciones…)` | enfermera | inserta un triaje y, si era el primero, `llegada → con_triaje` |
| `derivar_paciente(visita, especialidad, motivo?)` | enfermera; profesional que tiene la visita | crea la derivación (D6) y mueve la visita a `derivada` |
| `anular_derivacion(visita)` | quien creó la derivación pendiente de esa visita | `pendiente → anulada` y la visita vuelve a `con_triaje` (enfermera) o `en_atencion` (profesional); recibe la visita y no la derivación porque la enfermera no puede leer `derivaciones` |
| `tomar_paciente(visita)` | profesional (D7) | `derivada`/`con_triaje`/`llegada → en_atencion`; concede acceso (D7, D8) |
| `terminar_atencion(visita)` | el profesional que la tiene | `en_atencion → atendida` |
| `visitas_para_triaje()` | enfermera | lectura con lista blanca (D4) |
| `triajes_de_la_visita(visita)` | enfermera | lectura de los triajes de una visita aún sin tomar (D4) |
| `derivaciones_pendientes()` | profesional | lectura con lista blanca de lo pendiente de **su** especialidad (D7) |
| `indicadores_de_visitas(desde, hasta)` | administrativo | solo conteos (D15) |

Las funciones de lectura **lanzan `42501`** a quien no es del rol (no devuelven vacío): una llamada indebida debe ser visible en
la prueba y en el log. Cada función toma la visita con `select … for update` antes de decidir, de modo que las operaciones sobre
una misma visita se serializan (D7).

**Lectura directa por política (solo `SELECT`):**

| Tabla | Administrativo | Profesional | Enfermera | Paciente, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` |
|---|---|---|---|---|
| `visitas` | todas (son logísticas: sin triaje ni texto clínico) | las suyas: `profesional_id = profesional_actual()` o cita propia | **ninguna** (solo `visitas_para_triaje()`) | ninguna |
| `triajes` | **ninguna** | `profesional_tiene_paciente(paciente_id)` | **ninguna** (solo `triajes_de_la_visita()`) | ninguna |
| `derivaciones` | **ninguna** | las que creó (`creada_por`) o tomó (`tomada_por`) | **ninguna** | ninguna |

*Alternativas descartadas.* (a) **Políticas de `INSERT`/`UPDATE` más funciones `SECURITY INVOKER`** (el patrón de H3 para
reservar): sirve cuando el actor ya puede escribir la tabla, pero aquí la enfermera tendría que actualizar `visitas.estado` y
el profesional insertar asignaciones, privilegios que no deben existir; además cada operación cruza varias tablas y debe ser
atómica. (b) **`GRANT` por columna**: aplica a todo `authenticated`, no distingue roles. (c) Dejar las lecturas del profesional
sobre `derivaciones` abiertas a toda la especialidad: es la alternativa «la derivación da acceso» descartada por ADR-0032.

### D4. Qué ve la enfermera de un paciente y cómo se impone

**Decisión.** La enfermera no tiene política alguna sobre `pacientes`, `citas`, `visitas`, `triajes`, `derivaciones`,
asignaciones ni tablas clínicas. Para triar lee **solo** la función `visitas_para_triaje()`, que devuelve, de las visitas **de
hoy (día de Lima) en estado `llegada`, `con_triaje` o `derivada`**, exactamente estas columnas:

`visita_id`, `nombres`, `apellidos`, `tipo_documento`, `numero_documento`, `fecha_nacimiento`, `estado`, `llegada_en`,
`tiene_cita` (booleano, **no** el id de la cita), `triajes_registrados` (entero) y `especialidad_destino` (nombre, solo si
`derivada`).

Ve por tanto la identidad que necesita para no confundir a dos pacientes (nombre completo, documento y fecha de nacimiento, de
la que sale la edad) y el estado de la fila. **No** ve sexo, correo, teléfono, dirección, ninguna columna de filiación de H3,
`motivo` de la cita, diagnósticos, antecedentes, medicamentos, ni nada de visitas de otros días. Los triajes de la visita los lee
con `triajes_de_la_visita(visita)` mientras la visita esté en esos tres estados (las mediciones que ella misma registra y que
necesita para repetir o comparar); en cuanto un profesional la toma, la enfermera deja de poder leerlos.
<!-- REVISAR: el mínimo de identidad (¿documento completo? ¿fecha de nacimiento?) lo valida la clínica; menos columnas es siempre
posible, más requiere decisión explícita porque ensancha lo que lee un rol sin acceso a historias. -->

**Cómo se impone en la base.** (1) Sin política de `SELECT` ni privilegio de escritura sobre las tablas, una consulta directa
de la enfermera devuelve cero filas. (2) La función es `SECURITY DEFINER` (lee `pacientes`, que la enfermera no puede leer) y su
**tipo de retorno es la lista blanca**: una columna nueva exige editar la función, y la prueba pgTAP compara la lista exacta de
columnas devueltas (`pg_get_function_result`), de modo que añadir una —por ejemplo el correo— rompe la suite. (3) Filtros
dentro de la función, no en la pantalla: rol `enfermera`, enfermera y perfil activos, día de Lima, estados.

*Alternativas descartadas.* (a) **Política de `SELECT` sobre `pacientes` para la enfermera**: la RLS es por fila y expondría
todas las columnas (correo, teléfono, dirección, filiación). (b) **Vista `security_invoker`** sobre `pacientes`: hereda la RLS de
quien consulta, o sea, nada, o lo mismo que (a). (c) **Vista no `security_invoker`**: salta la RLS y la prueba global
`98_vistas_con_security_invoker` de H7 la prohíbe. (d) **Copiar nombre y documento a `visitas`**: duplica datos personales y
los deja desactualizados si se corrige al paciente. (e) **`GRANT` por columna** de `pacientes` a `authenticated`: afecta
también al administrativo y al médico.

**Pregunta que este diseño no resuelve:** una enfermera real pregunta por **alergias** al triar. Verlas exige leer
antecedentes, es decir, tocar la regla «la enfermera no accede a historias»; no se incluye (Preguntas abiertas).

### D5. Triaje: siete mediciones, IMC en la base, rangos de plausibilidad como propuesta

`triajes`: `id`, `visita_id` y `paciente_id` con **clave foránea compuesta** `(visita_id, paciente_id) → visitas(id,
paciente_id)` (no se puede atar un triaje a la visita de otro paciente), las mediciones, `registrado_por` (`perfiles`, del
token) y `registrado_en` (`default now()`, sin parámetro). Mediciones y rangos **como propuesta**:

| Medición | Columna | Tipo | Rango aceptado |
|---|---|---|---|
| Presión sistólica (mmHg) | `presion_sistolica` | `smallint` | 50–260 |
| Presión diastólica (mmHg) | `presion_diastolica` | `smallint` | 30–160 y **menor que la sistólica** |
| Frecuencia cardíaca (lpm) | `frecuencia_cardiaca` | `smallint` | 20–250 |
| Frecuencia respiratoria (rpm) | `frecuencia_respiratoria` | `smallint` | 4–70 |
| Temperatura (°C) | `temperatura_c` | `numeric(4,1)` | 30,0–43,0 |
| Saturación de oxígeno (%) | `saturacion_oxigeno` | `smallint` | 50–100 |
| Peso (kg) | `peso_kg` | `numeric(5,2)` | 0,5–400 |
| Talla (cm) | `talla_cm` | `numeric(4,1)` | 30–250 |
| IMC | `imc` | `numeric(6,1)`, **columna generada**: `peso_kg / (talla_cm/100)²`, redondeado a 1 decimal | 5–100 |

<!-- REVISAR: todos los rangos son una propuesta técnica (límites de lo posible, para cazar errores de tipeo), no rangos clínicos
de normalidad. Validarlos con el personal clínico antes de fijarlos en la migración (tarea 0.3). Cubren de lactante a adulto
mayor con límites amplios; rangos por edad quedan en Preguntas abiertas. -->

- **Imposible ≠ anormal.** Los rangos rechazan lo que no puede ser verdad (`CHECK` en la base, segunda barrera tras Zod). El
  sistema **no** marca, colorea ni avisa valores anormales (alertas automáticas están fuera de alcance) y **no** clasifica el IMC.
- **Obligatoriedad.** Las cinco constantes vitales son obligatorias. `peso_kg` y `talla_cm` son opcionales **como par**
  (`CHECK ((peso_kg is null) = (talla_cm is null))`): quien no puede ponerse de pie no debe obligar a la enfermera a inventar un
  peso. Sin el par, `imc` es nulo. <!-- REVISAR: el PRD lista siete mediciones; si la clínica las quiere todas obligatorias, es
  quitar el `CHECK` del par y poner `NOT NULL` (Preguntas abiertas). -->
- **Varios por visita, conservando los anteriores.** Sin unicidad por visita. Un disparador `triajes_proteger` rechaza
  `UPDATE` y `DELETE` **para todo rol, incluido el dueño**: corregir es registrar otro triaje; el último por `registrado_en` es
  el vigente y los anteriores se muestran como historial (la presentación es de H6).
- **Estado de la visita.** Se registra solo si la visita está en `llegada`, `con_triaje` o `derivada` (disparador
  `triajes_validar_visita`, además de la función): no se agregan mediciones a una visita ya tomada ni cerrada. Un profesional no
  registra triajes en este change (Preguntas abiertas).
- **Datos reales.** `triajes` y `derivaciones` llevan el disparador `exigir_paciente_admisible()` de H6 (D1 de
  `historias-clinicas`: modo `demostracion` ⇔ paciente `@demo.invalid`, SQLSTATE `HC002`) y las funciones clínicas empiezan con
  `exigir_modo_clinico()` (`HC004`). `visitas` no lleva contenido clínico y no se bloquea.
- **Validación en tres capas, el servidor manda.** Esquema Zod (`lib/schemas/triaje.ts`, `.strict()`, los mismos rangos
  importados de `lib/triaje/rangos.ts`), la función, y los `CHECK` (`23514` → «Revise los valores del triaje: alguno está fuera
  de lo posible»). El cliente puede mostrar una vista previa del IMC, pero el valor guardado es el de la base.

*Alternativas descartadas.* Presión arterial en un solo campo de texto (`120/80`): no se valida ni se consulta. IMC calculado en
la aplicación: dos implementaciones. Triaje editable con historial de versiones: más tabla, y «conservar los anteriores» ya se
cumple con filas inmutables. Una columna `jsonb` de mediciones (como `datos_especialidad`, ADR-0029): ADR-0029 dice
expresamente que el triaje **no** se guarda ahí.

### D6. Derivaciones: a una especialidad, nunca a un profesional

`derivaciones`: `id`; `visita_id` y `paciente_id` (clave compuesta como en D5); `especialidad_destino_id`; `origen`
(`enfermera` | `profesional`); `creada_por` (perfil, del token); `creada_en`; `vence_en`; `motivo` (≤ 300, con contenido si
existe); `estado`; `tomada_por`, `tomada_en`, `cerrada_en`; `derivacion_previa_id` (la derivación que el profesional emisor
tenía tomada, para encadenar). **No existe una columna de profesional destino y ninguna función acepta un profesional como
parámetro de derivación:** que la enfermera no pueda elegir a quién se asigna es estructural, no una regla que olvidar.

Estados (`estado_derivacion`): `pendiente`, `tomada`, `cerrada`, `vencida`, y **`anulada`** (añadido respecto de ADR-0032, para
corregir un error de la enfermera antes de que alguien tome al paciente; la ADR debería reflejarlo). Transiciones:
`pendiente → tomada | anulada | vencida`; `tomada → cerrada`; el resto, `HC022`. Índices únicos parciales: **una derivación
pendiente por visita** y **una tomada por visita**.

- **Vencimiento.** `vence_en` = las 00:00 del día siguiente en Lima a `creada_en` (un paciente que no fue tomado en el día se
  fue). Es perezoso: `pendiente` con `vence_en <= now()` se trata como vencida al leer y al tomar (`HC028`) y se marca
  `vencida` cuando la visita se cierra. Sin cron.
- **Ciclo de vida atado a la visita.** Un disparador sobre `visitas` (`AFTER UPDATE OF estado`): al pasar a `abandonada` o
  `anulada`, sus derivaciones pendientes pasan a `vencida`; al pasar a `atendida`, la tomada pasa a `cerrada` y las pendientes a
  `vencida`.
- **Motivo.** Obligatorio con contenido en una derivación de enfermera o de un profesional que no es psicólogo; **nulo si el
  emisor es psicólogo** (D10). Texto libre y potencialmente clínico: por eso `administrativo` no lee `derivaciones` (D3).
- **Coherencia.** `especialidad_destino_id` debe coincidir con `visitas.especialidad_destino_id` mientras la derivación está
  pendiente; `origen = 'enfermera'` exige `derivacion_previa_id` nulo.
- **Una especialidad sin profesional activo se rechaza al derivar** (`HC025`): existe al menos un profesional con
  `profesionales.activo` y perfil activo en esa especialidad. Si el profesional se da de baja después, la derivación queda
  pendiente y la bandeja de recepción la marca «sin profesional disponible»; vence a fin del día.
- **Paciente derivado dos veces.** Con una derivación pendiente, derivar de nuevo falla con `HC029` («Anule la derivación
  actual para elegir otra especialidad»); `anular_derivacion` la anula y se deriva otra. Es deliberadamente de dos pasos: queda
  rastro de la corrección y se evita reemplazar en silencio una derivación que otro profesional puede estar tomando.

*Alternativas descartadas.* Derivar a un profesional concreto (la alternativa que ADR-0032 ya descartó). Reemplazar
automáticamente la pendiente: oculta el error. Borrar la derivación equivocada: contradice append-only y la auditoría.

### D7. Tomar al paciente: una función, un bloqueo de fila, una asignación estructural

`tomar_paciente(visita)`:

1. Guarda: `rol_actual() = 'profesional'`, perfil y `profesionales.activo` verdaderos; si no, `42501`.
2. `select … from visitas where id = $1 for update`. Bajo `READ COMMITTED` el segundo que llega espera el bloqueo y, al
   liberarse, **vuelve a evaluar la fila**: ve `en_atencion` y falla con `HC026` («Otro profesional ya tomó a este paciente»).
   Nadie puede tomarla dos veces aunque lo intenten en el mismo milisegundo.
3. **Visita `derivada`:** debe haber una derivación `pendiente` con `vence_en > now()` (`HC028` si venció) cuya
   `especialidad_destino_id` sea la del profesional (`HC027` si no). Marca la derivación `tomada` (`tomada_por`, `tomada_en`) y
   la visita `en_atencion` con `profesional_id`, `atencion_iniciada_en` (si era la primera vez).
4. **Visita con cita en `llegada` o `con_triaje`:** el profesional debe ser el de la cita, la cita `confirmada` o `atendida` y
   `profesional_tiene_paciente()` verdadero (la asignación de la cita ya existe, H3/ADR-0016); si no, `HC027`. **No crea una
   asignación nueva.** No se exige triaje previo: bloquear al profesional por un triaje faltante pararía la consulta cuando no
   hay enfermera de turno; la falta se **mide** (D15) y la bandeja la muestra («sin triaje»), no se impide.
5. Una visita sin cita en `llegada`/`con_triaje` (sin derivar) **no se puede tomar** (`HC022`): la enfermera deriva primero.
   Otra vía de acceso a un paciente en la sala de espera sería exactamente la «autoasignación» que ADR-0032 evita.

**El acceso es una consecuencia estructural.** Un disparador `derivaciones_conceder_asignacion` (`SECURITY DEFINER`, `AFTER
UPDATE OF estado WHEN (old.estado = 'pendiente' and new.estado = 'tomada')`) inserta en
`asignaciones_paciente_profesional`: `(paciente_id, profesional_id = tomada_por, vigente_desde = hoy_lima(), vigente_hasta =
hoy_lima() + vigencia_asignacion_derivacion(), motivo = 'derivacion:' || id)`, igual que `extender_asignacion_por_cita()` hace
con las citas (ADR-0016). Así «tomada ⇒ asignación» vale aunque una función futura lo olvide, y es el **único** escritor del
motivo `derivacion:`. Un índice único parcial (`motivo like 'derivacion:%'`) impide duplicarla. Y un disparador
`BEFORE UPDATE` sobre `derivaciones` repite, como segunda barrera, la regla de pertenencia: `tomada_por` debe ser un profesional
activo de la especialidad destino.

**Política de asignaciones (cambio sobre H6).** La política de inserción del administrativo (`historias-clinicas`, tarea 5.1:
motivo con contenido y sin prefijo `cita:`) se endurece con `alter policy` para rechazar también el prefijo `derivacion:`.
Es un cambio de dos condiciones sobre una política de acceso: revisión explícita. Ningún otro rol puede insertar asignaciones.

**`derivaciones_pendientes()`** (profesional) devuelve de las derivaciones **pendientes y vigentes de su propia especialidad**:
`visita_id`, `nombres`, `apellidos`, `llegada_en`, `creada_en`, `origen`. Nada más: ni documento, ni fecha de
nacimiento, ni `motivo`, ni triaje, ni sexo. Los dos o tres profesionales de la especialidad ven *quién espera y desde cuándo*
(lo que vería cualquiera en la sala), no contenido clínico: «derivar no da acceso» se conserva. <!-- REVISAR: ¿nombre completo o
iniciales y edad antes de tomar? Más restrictivo es posible; el nombre permite llamar al paciente. -->

*Alternativas descartadas.* (a) Que la derivación dé acceso a toda la especialidad (ADR-0032). (b) Asignación automática por el
sistema al «próximo disponible»: elegiría a quién sin que el profesional lo sepa y ensancha el acceso sin decisión clínica; la
regla «la enfermera no puede elegir» se burlaría con el sistema como intermediario. (c) Conceder el acceso con una política
sobre `historias_clinicas` basada en `derivaciones`: crea una **segunda** fuente de acceso y rompe el principio de ADR-0016
(la asignación es la única).

### D8. Vigencia de la asignación por derivación (pregunta abierta obligatoria)

ADR-0032 no la fija y pide «un valor corto». Opciones evaluadas, con la consecuencia concreta sobre H6 (el autor necesita
`profesional_tiene_paciente()` para editar y firmar su borrador y para agregar addendas):

| Opción | Efecto | Contra |
|---|---|---|
| Mismo día (`vigente_hasta = hoy_lima()`) | Mínimo acceso | Cruzar la medianoche o firmar al día siguiente deja al autor sin poder editar ni firmar un borrador |
| 3 días | Cubre un fin de semana corto | Un atendido el viernes y firmado el lunes queda en el borde |
| **7 días (propuesta provisional)** | Cubre firmar el lunes lo atendido el viernes y una consulta de resultados | Siete días de acceso a un paciente que quizá no vuelva |
| 30 días | Seguimientos cortos | Acceso amplio a quien nunca tuvo cita |
| 6 meses (como una cita) | Cero fricción | Contradice «vigencia acotada»; el paciente sin cita acaba con el acceso de una cita |
| Atada a la visita (se revoca al terminar) | Mínimo | La asignación es append-only y por fecha: revocar exige cambiar ADR-0016 |

**Provisional: 7 días calendario de Lima desde el día de la toma (`vigente_hasta = hoy_lima() + 7`).** El valor vive en **una
sola función** `public.vigencia_asignacion_derivacion()` (`IMMUTABLE`, devuelve `7`); cambiarlo es una migración
`create or replace` y actualizar la prueba. No altera las asignaciones ya creadas (append-only). Consecuencias a aceptar o
rechazar: el acceso **no se revoca** cuando la visita termina ni cuando el profesional deriva a otro (el emisor conserva su
acceso hasta que venza el suyo); cualquier seguimiento posterior se agenda como cita, que crea su propia asignación de 6 meses
(ADR-0016). Decide el usuario con la clínica y, por tratarse de acceso a datos de salud, conviene llevarlo al asesor legal.
<!-- REVISAR: 7 días es mi propuesta, no una decisión; ver también la vigencia de la derivación pendiente (fin del día, D6). -->

### D9. Pacientes sin cita, pacientes con cita y la métrica del 75 %

- **Registro.** Recepción busca al paciente por documento; si no existe lo registra y abre su historia con la filiación mínima
  (NTS 139) **en el flujo de `agenda-y-reserva`, ítem 5** (`registrarPaciente`, `buscarPacientes`, columnas de filiación;
  pasaporte y número provisional): este change lo referencia y **no** define columnas ni reglas de filiación. Después registra
  la llegada con `registrar_llegada(paciente)`. Son dos operaciones no atómicas a propósito: si la segunda falla, el paciente
  queda registrado y se reintenta (no hay efecto lateral).
- **Con cita.** `registrar_llegada(paciente, cita)` exige la cita `confirmada`, del paciente, del día de Lima y sin visita
  (`HC021`). Si está `reservada`, la pantalla ofrece primero la acción `confirmarCita` de H3 (que es lo que concede el acceso
  por cita, ADR-0016) y reintenta. Si la cita `reservada` ya terminó (la pregunta 1 de H3), no se puede confirmar: la persona se
  atiende **como sin cita** (visita sin `cita_id`), por el camino de triaje y derivación.
- **La métrica del 75 %.** El indicador se mide sobre `citas` (portal frente al total). Una visita sin cita **no crea fila en
  `citas`**, de modo que sale del denominador por construcción; una visita con cita no vuelve a contarse. No hay forma de que
  recepción «convierta» a un paciente sin cita en una cita administrativa por esta vía.
- **Cita cancelada o reprogramada después de la llegada.** La visita queda atada a una cita que ya no es válida y no puede
  tomarse (`HC027`). Recepción la cierra (`anulada` si aún no tiene triaje; `abandonada` con motivo `cita_cancelada` si lo tiene)
  y registra otra llegada con la cita nueva o sin cita; el triaje ya hecho queda en la visita cerrada.

### D10. Derivación entre profesionales y la información de Psicología

Un profesional que **tiene la visita en atención** (`en_atencion` con su `profesional_id`) puede derivar a **otra** especialidad
(`HC024` si es la suya: para un colega de la misma especialidad existe la asignación manual de H6, no la derivación). Es la misma
`derivar_paciente`: cierra su derivación tomada (`cerrada`), crea una nueva con `derivacion_previa_id` y la visita vuelve a
`derivada`. Un profesional **no puede derivar a un paciente que no tiene en atención** (si pudiera, derivaría a su propia
especialidad y tomaría: una puerta trasera a cualquier paciente en la sala). El profesional destino toma como en D7.

**Respeto a ADR-0031 (sin rediseñarla).** Este change no crea ni lee resultados de tests ni notas de sesión. Pero un `motivo`
de derivación escrito por un psicólogo podría colar contenido de Psicología a otras especialidades; por eso el disparador
rechaza un `motivo` no nulo cuando el emisor tiene `profesion = 'psicologo'` (`HC024`), y la interfaz lo explica («Los detalles
de Psicología no se comparten al derivar»). Derivar **hacia** Psicología es una derivación normal: el psicólogo que toma
obtiene acceso por asignación, y el aislamiento de ADR-0031 se aplica por encima de ese acceso. Que se sepa que un paciente fue
derivado a Psicología es información sensible que ven la enfermera y recepción (la especialidad destino); no se oculta porque
recepción ya ve las citas por especialidad. <!-- REVISAR con el asesor legal (datos de salud mental), junto con ADR-0031. -->

### D11. El triaje que lee el profesional, y el módulo `lib/triaje/`

**Contrato con H6 (no se construye aquí).** El profesional lee los `triajes` de los pacientes que tiene a cargo
(`profesional_tiene_paciente(paciente_id)`, políticas de D3), incluidos los de visitas anteriores. La lectura es contenido
clínico: debe vivir en `lib/historias/`, dentro de la **misma transacción** que registra el acceso en `accesos_historia`
(D2 de `historias-clinicas`), y mostrarse en la historia (el último triaje destacado, los anteriores como historial, y la
`derivación` recibida con su motivo si el profesional la tomó). H6b entrega: el esquema, la política, el orden y las columnas
(`registrado_en desc`), y una tarea de coordinación para que `abrirHistoria` los incluya. Mientras H6 no lo integre, el
profesional no ve triajes en pantalla (la política ya los protege).

**Módulo propio.** Todo el SQL contra `visitas`, `triajes` y `derivaciones` vive en `lib/triaje/` (repositorio con ejecutor
inyectable), con una prueba `tests/triaje/acceso-unico.test.ts` que falla si otro archivo de `app/`, `lib/` o `components/` lo
contiene, **salvo** la lectura de triajes del profesional en `lib/historias/`. Cada función del módulo que toca contenido clínico
abre su transacción con `exigir_modo_clinico()` (H6, D1).

### D12. Errores: SQLSTATE `HC020` a `HC029`

| SQLSTATE | Significado | Mensaje al usuario (usted) |
|---|---|---|
| `HC020` | El paciente ya tiene una visita en curso | «Este paciente ya tiene una visita en curso. Ábrala desde la lista del día.» |
| `HC021` | La cita no es válida para la llegada | «La cita no corresponde a este paciente, no está confirmada o no es de hoy.» |
| `HC022` | Operación no permitida en el estado actual de la visita | «Esta operación ya no es posible: la visita cambió de estado. Actualice la pantalla.» |
| `HC023` | Derivar sin triaje previo | «Registre el triaje antes de derivar al paciente.» |
| `HC024` | Derivación no permitida (visita con cita, misma especialidad, sin tener la visita, detalle de Psicología) | «No se puede derivar así. Revise la especialidad o el motivo.» |
| `HC025` | Especialidad sin profesional activo | «No hay profesionales activos en esa especialidad. Elija otra.» |
| `HC026` | Ya tomada por otro profesional (concurrencia) | «Otro profesional ya tomó a este paciente.» |
| `HC027` | No corresponde que este profesional la tome | «Este paciente no está derivado a su especialidad ni corresponde a su cita.» |
| `HC028` | Derivación vencida | «La derivación venció. Pida a enfermería que derive de nuevo.» |
| `HC029` | Ya hay una derivación pendiente | «Ya hay una derivación pendiente. Anúlela para elegir otra especialidad.» |

`42501` («No tiene permiso para esta operación») cubre rol, perfil o profesional inactivo y es el único código de autorización;
`23514` cubre los `CHECK` de rangos; `23505` de la visita en curso se traduce a `HC020` dentro de la función. `HC020`–`HC029` no
chocan con `HC001`–`HC005` (H6) ni `HC010`–`HC019` (H2c). La traducción vive en `lib/triaje/errores.ts` (función pura con una
prueba por fila); ningún mensaje contiene texto de la base ni datos del paciente.

### D13. Auditoría

Las tres tablas se auditan por disparador. `visitas` con `registrar_auditoria()` existente (datos logísticos). `triajes` y
`derivaciones` son clínicas y **no copian contenido** (el administrativo lee `auditoria`): en vez de ampliar la lista cerrada de
`registrar_auditoria()` —que H6 (adjuntos), H6c (recetas) y otros también querrían reemplazar, con el riesgo de que el último
`create or replace` borre los nombres de los demás—, este change crea su propia función `registrar_auditoria_sin_contenido()`
(`SECURITY DEFINER`, `search_path` vacío, registra actor, rol, acción, tabla e id) y la deja disponible para los demás.
La **lectura** del profesional se audita en `accesos_historia` (H6). La lectura que hace la enfermera de la lista de triaje no se
audita (solo ve datos que ella misma registra, de hoy); si se quisiera, es una función de auditoría de lectura aparte
(Preguntas abiertas).

### D14. Contrato hacia H7: qué estados entrega este change para definir «en espera»

H7 (`turnos-y-dashboard`) hoy define «en espera» desde la hora de la cita (D2) y deja el registro de la llegada como Q1. Con
este change Q1 queda **respondida** y H7 puede (lo adopta él en su propio change) definir:

| Estado de la visita | Qué espera | ¿En espera? |
|---|---|---|
| `llegada` | su triaje | sí (`esperando_triaje`) |
| `con_triaje`, sin cita | que la enfermera lo derive | sí (`por_derivar`) |
| `con_triaje`, con cita | a su profesional | sí (`esperando_profesional`) |
| `derivada` | un profesional de `especialidad_destino_id` | sí (`esperando_profesional`) |
| `en_atencion` | — | no |
| `atendida`, `abandonada`, `anulada` | — | no |

El reloj es `now() - llegada_en` (reloj de la base, minutos enteros) y se detiene en `atencion_iniciada_en`; la espera hasta
la atención es `atencion_iniciada_en - llegada_en`, que es lo que mide el criterio de ≤ 20 minutos (`atencion_iniciada_en` es
el momento en que el profesional «toma», un sustituto razonable del inicio real de la consulta). H7 lee `visitas` mediante su
propia vista `security_invoker` (el administrativo ya tiene `SELECT`); no necesita `triajes` ni `derivaciones` y la vista **no
debe** exponer ninguno de sus campos. Una cita `confirmada` sin visita deja de ser «en espera»: solo espera quien llegó. Una
visita de un día anterior no terminal no es «en espera» de hoy: va a «visitas sin cerrar».

### D15. Indicadores de solo conteo

`indicadores_de_visitas(desde date, hasta date)` (`SECURITY DEFINER`, administrativo, `42501` a los demás) devuelve una fila con
conteos, sin identificadores ni textos: `visitas`, `con_cita`, `sin_cita`, `atenciones_iniciadas`, `con_triaje_previo` (algún
triaje con `registrado_en <= atencion_iniciada_en`), `sin_triaje_previo` y `espera_hasta_20_min` (`atencion_iniciada_en -
llegada_en <= 20 min`), por día de llegada en Lima. Mide el criterio «≥ 90 % de las atenciones con triaje antes de la
consulta, con y sin cita» y la espera de ≤ 20 minutos, sin construir analítica: no hay pantalla, históricos ni exportes.
<!-- REVISAR: ¿se quiere esta función o la medición queda para el cierre de H8? Es pequeña y sigue el precedente de
`indicador_digitalizacion()` de H6. -->

### D16. Migraciones, rutas y pantallas

Cinco migraciones nuevas, después de las de H2c, H3 y H6 (nunca se edita una aplicada): **(1)** `visitas` — tipo, tabla,
índices, `CHECK`, RLS y política, disparadores (transición, sin borrado, auditoría), `registrar_llegada`, `cerrar_visita`;
**(2)** `triajes` — tabla, rangos, IMC, RLS y política, `triajes_proteger`, `triajes_validar_visita`, guarda de datos reales,
`registrar_auditoria_sin_contenido()`, `registrar_triaje`, `visitas_para_triaje`, `triajes_de_la_visita`; **(3)** `derivaciones`
— tipo, tabla, índices, RLS y política, disparadores de transición y de asignación, ciclo de vida sobre `visitas`,
`vigencia_asignacion_derivacion()`, índice único de `derivacion:`, `alter policy` de asignaciones; **(4)**
`flujo-de-derivacion` — `derivar_paciente`, `anular_derivacion`, `tomar_paciente`, `terminar_atencion`,
`derivaciones_pendientes`; **(5)** `indicadores-de-visitas` — `indicadores_de_visitas`.

| Ruta | Rol | Contenido |
|---|---|---|
| `app/administrativo/llegadas/` | administrativo | Registrar llegada (buscar o registrar paciente, elegir cita de hoy o «sin cita»), lista del día con espera, cerrar visita, visitas sin cerrar |
| `app/enfermera/triaje/` y `.../[visitaId]/` | enfermera | Pacientes por triar, formulario de triaje, derivar, repetir triaje |
| `app/profesional/pacientes-en-espera/` | profesional | Llegaron para mí (con cita), derivados a mi especialidad (**Tomar**), en atención (**Terminar**, **Derivar a otra especialidad**) |

Cada página y acción repite `auth.protect()`, el guarda de rol y la comprobación de MFA (`exigirPersonal` de H3 en las acciones);
`Cache-Control: private, no-store` en las tres rutas, título fijo («Llegadas», «Triaje», «Pacientes en espera») y direcciones
solo con `uuid` de visita. Estados con texto e icono, no solo color (`lib/ui/estados-visita.ts`, tokens de DESIGN.md). Un
botón primario por pantalla; el formulario de triaje conserva lo escrito ante un error del servidor.

### D17. Pruebas y verificación

- **pgTAP (sugeridas):** `66_visitas`, `67_triajes`, `68_derivaciones`. Cada una incluye el caso negativo de **cada** rol
  —administrativo, profesional a cargo, otro profesional, profesional de la especialidad destino que no tomó, enfermera,
  paciente, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`— y `has_table_privilege` falso de `insert`, `update`
  y `delete` para todos. No asumen tablas vacías. Casos clave: derivar no da acceso (ningún profesional de la especialidad
  destino pasa a `profesional_tiene_paciente()` ni lee una fila clínica), tomar crea **exactamente una** asignación
  `derivacion:<id>` con la vigencia propuesta, la lista exacta de columnas de las lecturas con lista blanca, la enfermera con
  cero filas en `pacientes`, `citas`, historias, atenciones, antecedentes, asignaciones y triajes, el administrativo sin
  triajes, y que el administrativo no puede insertar una asignación `derivacion:`.
- **Concurrencia** (`tests/concurrencia/20_tomar_paciente.test.ts`, sesiones `pg` reales como `authenticated`): 5 profesionales
  de la especialidad toman a la vez; 20 rondas; exactamente una gana, las demás reciben `HC026`, y queda **una** asignación. Dos
  recepciones registran la misma llegada: una gana y la otra recibe `HC020`. Derivar contra tomar: solo uno prospera.
- **Verificación por mutación** (como en H2 y H6): para cada política, función, disparador e índice nuevo se debilita en un
  branch de desarrollo y se comprueba que alguna prueba negativa falla (lista en la tarea 7.2).
- **`node:test`:** esquemas Zod y rangos, mapeo de errores, estados, repositorio con ejecutor simulado (orden de sentencias,
  modo primero), acceso único. **E2E (Playwright) y axe** con las cuentas de H1 y datos de demostración; las cuentas de
  profesional y enfermera necesitan TOTP (paso manual ya previsto en H7).
- **`code-review`** al final de cada grupo que toca RLS, funciones `SECURITY DEFINER`, disparadores o asignaciones, y revisión
  final sobre todo el diff.

## Risks / Trade-offs

- [Mucha confianza concentrada en funciones `SECURITY DEFINER`] → `search_path` vacío, `EXECUTE` solo a `authenticated`, guarda
  de rol como primera sentencia, ningún parámetro de identidad, una prueba negativa por rol y por función, mutación y revisión
  `code-review` por grupo.
- [La lista blanca de la enfermera crece sin que nadie lo note] → la prueba compara la lista exacta de columnas del tipo de
  retorno; añadir una rompe la suite.
- [Sin enfermera de turno, los pacientes sin cita no avanzan: solo la enfermera deriva] → es la consecuencia de que ningún otro
  rol pueda abrir una puerta de acceso; mitigación operativa (turnos de H7) y pregunta abierta; no se crea una vía de
  autoasignación.
- [7 días de acceso a un paciente sin cita pueden parecer muchos, o pocos para firmar] → una sola función a cambiar; decisión
  del usuario y, por ser acceso a datos de salud, del asesor.
- [Los profesionales de la especialidad ven el nombre de quien espera antes de tomar] → lista blanca mínima (nombre y espera);
  alternativa: iniciales y edad.
- [El triaje queda visible a todo profesional a cargo, incluidos los psicólogos] → coherente con el PRD (historia compartida;
  el triaje no es información de Psicología); a revisar con el asesor junto con ADR-0031.
- [Rangos de plausibilidad sin validación clínica] → marcados `REVISAR`, constantes en un solo archivo y en `CHECK` con nombre;
  cambiarlos es una migración.
- [Tres changes querrían reemplazar `registrar_auditoria()` y pisarse] → función de auditoría propia (D13).
- [`alter policy` de asignaciones depende de la forma exacta que deje H6 (tarea 5.1) y del nombre tras H2c] → este change corre
  después de H6; la tarea 3.3 lee la política vigente antes de cambiarla y la prueba cubre ambos prefijos.
- [Visitas obsoletas de otros pacientes se acumulan sin cron] → lista «visitas sin cerrar» para recepción y cierre perezoso por
  paciente; si molesta, una función de cierre llamada por el cron existente sería una decisión aparte (amplía un rol).
- [Cita cancelada o reprogramada con la visita abierta] → `HC027` y flujo de cierre de D9; se pide a H3 que la cancelación o el
  «no asistió» tengan en cuenta la visita.
- [Los requisitos de este change solapan los de `asignacion-paciente-medico` de H6] → este change solo añade un motivo reservado;
  al archivar ambos, la guía de `config.yaml` exige comprobar que no se contradigan.
- [Los datos de triaje son datos de salud: no pueden usarse con pacientes reales] → guarda de H6 en `triajes` y
  `derivaciones`; el change no entra en producción con datos reales mientras P-1 siga abierta.

## Migration Plan

1. Rama de trabajo con commits locales por grupo de tareas. Aplicar solo cuando H2c, H3 y H6 estén migrados (tarea 0.1);
   migraciones nuevas en el orden de D16, cada una con su prueba; nunca se edita una aplicada, `down` vacío (ADR-0027).
2. Suite pgTAP, concurrencia e integración completas en un branch de desarrollo de Neon y luego en el branch efímero del PR.
3. Aplicación: primero lógica y repositorio, luego pantallas cuando H2b esté aplicado.
4. Merge a `master`: `migrar-produccion.yml` aplica las migraciones (solo tablas, tipos, funciones y disparadores nuevos, y un
   `alter policy`); la guarda de H6 mantiene el modo `demostracion`. Sembrar visitas de demostración es una acción explícita.
5. **Rollback:** sin marcha atrás destructiva; un defecto se corrige con una migración nueva. Prohibido restaurar el branch
   principal de Neon. Una función defectuosa se reemplaza con `create or replace`; el acceso concedido por error se deja vencer
   o se corrige con una nueva asignación (append-only).

## Open Questions

**Obligatoria — vigencia de la asignación por derivación.** Propuesta provisional: **7 días** (D8). Cambia una constante, no la
estructura. Decide el usuario con la clínica (¿hasta cuándo debe poder un profesional abrir y firmar lo que atendió sin cita?);
por tratarse de acceso a datos de salud, conviene validarlo con el asesor legal. Junto con ella: ¿la derivación pendiente debe
vencer a fin del día (propuesta) o antes?

Las demás no cambian las especificaciones ni el desglose de tareas:

- **Rangos de plausibilidad** de D5 (`REVISAR`): validar con el personal clínico; si hacen falta rangos por edad (lactante,
  niño, adulto mayor) se añaden con la fecha de nacimiento sin cambiar el modelo. ¿Se quiere además una confirmación en pantalla
  para valores inusuales (no es una alerta: solo pide confirmar el dato antes de guardarlo)? No se incluye.
- **Triaje parcial:** ¿peso y talla obligatorios (todas las mediciones del PRD) u opcionales como par (propuesta)?
- **Derivar sin triaje previo:** la enfermera no puede (`HC023`); ¿hace falta una excepción por urgencia? Y, si no hay enfermera de
  turno, ¿cómo avanza un paciente sin cita? Es una decisión de proceso (¿otro rol?), no se resuelve con un atajo de acceso.
- **Derivación de la enfermera a pacientes con cita:** no se permite (el profesional de la cita ya los tiene); ¿debe poder
  derivar a otra especialidad un paciente con cita si el triaje lo sugiere?
- **Alergias al triar:** verlas es leer antecedentes y toca la regla de roles; no se incluye. ¿Se quiere un campo de «alergias
  declaradas» capturado por la enfermera (que ella escribe pero no lee más)?
- **Quién ve qué en la lista de la enfermera:** hoy todas las visitas de hoy; ¿filtrar por la especialidad o el profesional del
  turno de esa enfermera (H7)? ¿Solo enfermeras con turno hoy?
- **Nombre completo o iniciales** de quien espera, visible a los profesionales de la especialidad antes de tomar.
- **Cierre de visitas vencidas por cron:** ¿se quiere? Ampliaría un rol de servicio.
- **Registro de signos vitales por el profesional** durante la consulta: no incluido.
- **Salud mental:** la regla de que una derivación desde Psicología no lleva texto libre y la visibilidad de «derivado a
  Psicología» para enfermería y recepción, con el asesor legal (junto con ADR-0031).
- **Auditar la lectura de la lista de triaje de la enfermera** (`accesos_historia` no aplica): ¿hace falta?
- **Ping-pong entre profesionales:** sin tope de derivaciones encadenadas por visita; ¿se quiere uno?
- **Cola de turnos con llamado por pantalla, categorías de urgencia y autorregistro «ya llegué» del paciente:** fuera de alcance
  del PRD; no se preparan.
- **Estado `anulada` de las derivaciones** y la vigencia de D8: reflejarlos en ADR-0032 (la ADR sigue «Propuesta»).
