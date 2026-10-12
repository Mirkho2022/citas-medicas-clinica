# Design

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_actual()`, `profesional_tiene_paciente()`,
> `atenciones.profesional_id` y `app/profesional/**`; si la ADR se rechaza, léase `medico`/`medicos`, `medico_actual()`,
> `medico_tiene_paciente()`, `atenciones.medico_id` y `app/medico/**`. La regla «solo un podólogo escribe» necesita el atributo
> `profesion` de H2c: con la alternativa «mantener `medicos` y añadir `profesion`» el diseño no cambia.

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (cuatro capacidades). Estado de partida, verificado en
el repositorio y en los changes vecinos (todos aún sin aplicar salvo H2):

- **Atención clínica (H2, en producción):** `atenciones` tiene `id` como única clave (sin `unique (id, paciente_id)`),
  `paciente_id` denormalizado para RLS, `firmada_en` y cuatro textos obligatorios con contenido; su política de `UPDATE` exige
  autor, atención sin firmar y paciente a cargo, y un disparador de H2 la vuelve inmutable al firmar. Ninguna tabla clínica admite
  `DELETE`. `registrar_auditoria()` lee la columna `id`. `especialidades` solo tiene `id` y `nombre` único.
- **H6 `historias-clinicas`:** `plantillas_clinicas` y las columnas `atenciones.plantilla_id` y `datos_especialidad` (ADR-0029;
  tipos `texto`, `entero`, `decimal`, `opcion`, `si_no`, `fecha`; el validador reconstruye el objeto con las claves definidas;
  SQLSTATE `HC005`; **una sola serie de versiones por especialidad**: `unique (especialidad_id, version)`); sello del servidor y
  huella `v1:` de la atención, que cubre `plantilla_id` y `datos_especialidad` pero **no** tablas hijas; `adjuntos_historia`
  **solo PDF** (D7: `subido_por`, `vigente`, lectura de la fila bajo RLS antes de entregar el archivo); guarda de datos reales
  (`exigir_paciente_admisible()` con `HC002`, `exigir_modo_clinico()` con `HC004`); lectura atómica con registro en
  `accesos_historia` (tipos `historia`, `atencion`, `adjunto`; D2) y la regla de que el SQL clínico vive en un módulo único.
- **H2c `profesionales-de-la-salud`:** `profesion_actual()` (único punto de lectura de la profesión), `profesional_tiene_paciente()`
  y el valor `podologo` de `profesion_salud`. Deja a los changes de especialidad la **compatibilidad profesión–especialidad**
  («hoy `especialidad_id` es libre»).
- **H6b `triaje-y-derivacion`:** `registrar_auditoria_sin_contenido()` (actor, rol, acción, tabla e id, sin copiar la fila). Un
  profesional puede derivar a otra especialidad (D10 de H6b), lo que importa para la pregunta de recetas (D10 de este change).
- **H6c `recetas-medicas`:** `profesiones_que_recetan` deja a odontólogo, fisioterapeuta y **podólogo** en «no, sin confirmar».
- **H6d `copia-de-historia-clinica`:** `compilar_copia_historia()` entrega la historia completa solo al servidor; **cada tabla
  clínica nueva se clasifica y aporta su sección** y su prueba de cobertura (tarea 3.4) falla si una tabla de `public` no está en
  el compilado ni en la lista de exclusiones con razón. Para las atenciones firmadas ya incluye los `datos_especialidad` con las
  etiquetas de su plantilla.
- **H6e `especialidad-odontologia` (terminado, es el patrón a alinear):** tablas hijas propias de la atención; **sello propio de la
  sección** (la huella `v1` de la atención no cubre tablas hijas); catálogo gestionado por migración; plantilla v1 con pocos
  campos que declara si la atención registra la sección; disparadores `atenciones_<especialidad>_10_coherencia` y `_20_sellar`;
  función `copia_seccion_<especialidad>()` con `EXECUTE` revocado a todo rol de usuario; identidades pgTAP por profesión; las
  imágenes se vinculan hoy a un PDF de `adjuntos_historia` hasta que se decida P-15.
- **H6i `mecanismos-clinicos-comunes` (por escribir; no hay archivos en disco):** se usa **solo por su interfaz** (contrato común,
  sección 8): `planes_de_sesiones` (un plan de un paciente con un profesional: descripción o protocolo, total de sesiones,
  frecuencia en días, vigencia, estado `activo`/`completado`/`cancelado`) y `sesiones_del_plan` (cada sesión es una cita de H3 o
  queda por agendar), con el contador de sesiones restantes. Los supuestos concretos están en D4 y la tarea 0.2 los confirma.
- **Imágenes (P-15):** el diseño de adjuntos de H6 es solo PDF; admitir imágenes es decisión abierta del usuario (TECH-DESIGN).
- **Norma:** `docs/investigacion-marco-legal-y-saniape.md` no verificó ninguna norma de podología ni la que rige fotografiar al
  paciente. Este change no cita ni reproduce ninguna. De la NTS 139 solo se usa (nivel A) que la firma electrónica del paciente no
  vale para el consentimiento informado (4.3.3 c), y únicamente como advertencia en la pregunta de consentimiento.

## Goals / Non-Goals

**Goals:**
- Que el podólogo registre la evaluación de pie, uñas, piel y pisada con pocos clics en un control y completa en la primera
  visita, y que **cualquier profesional a cargo** la lea, impuesto **en la base de datos** y no solo en la interfaz.
- Que lo firmado sea inmutable y detectable si se altera, incluidas las fotos (que la huella `v1` de la atención no cubre).
- Que los cuatro protocolos conocidos estén cargados sin presentarse como validados y que una base en modo `real` no pueda
  conservarlos sin validar.
- Que el podólogo compare cómo evoluciona un pie entre controles, con una vista que solo muestra y no interpreta.
- Que la copia de la historia incluya lo nuevo sin que el administrativo lo lea por otra vía.
- Que lo que no viene del PRD (campos, opciones, protocolos, zonas) quede marcado como propuesta y sea corregible por migración.

**Non-Goals:**
- Resolver P-1, P-5, P-15 o P-17; declarar validez legal de plantilla, protocolo o consentimiento; diseñar el almacenamiento de
  imágenes; verificar una norma de podología.
- Recetas y la respuesta a si un podólogo puede recetar (H6c); planes de sesiones (H6i); pagos, cobros, presupuestos o cuotas;
  inventario de insumos u órtesis; puntajes, alertas o clasificación automática de hallazgos; analítica de BI; acceso del
  paciente a su historia o a sus fotos; dictado por voz e IA.
- Modificar las políticas de H2 o H6, el validador de plantillas, el sello de `atenciones` o la huella `v1` de la atención.
- Registrar lesiones localizadas con tamaño y seguimiento propio (ver D1, «Límite»).

## Decisions

### D1. Qué va en `datos_especialidad` y qué necesita tablas propias

**Decisión.**

| Contenido del PRD | Dónde vive | Por qué |
|---|---|---|
| Evaluación de pie, uñas, piel y pisada | **Plantilla «Podología» v1 en `datos_especialidad`** (D2) | Es un conjunto **fijo** de observaciones por lado, que cabe en el subconjunto de tipos de ADR-0029; entra en la huella `v1` y queda inmutable al firmar sin código nuevo |
| Plan de controles y protocolos por sesiones | **`planes_de_sesiones` de H6i** + catálogo **`protocolos_podologia`** (tabla nueva, D4) | El mecanismo es común; Podología solo aporta su catálogo |
| Fotos de evolución | **Tabla hija de la atención `fotos_evolucion`** (tabla nueva, D5) | Son un número variable de filas con su propio metadato y un archivo; no caben en un `jsonb` plano |
| Comparación de la evolución | **Ninguna tabla**: una lectura sobre lo anterior (D7) | Es una vista derivada de lo ya firmado |

| | **A. Plantilla + planes de H6i + catálogo + fotos hijas (elegida)** | B. Todo en tablas propias (`evaluaciones_podologicas`, `hallazgos_*`) | C. Todo en `datos_especialidad` (incluidas las fotos) | D. Modelo clave-valor |
|---|---|---|---|---|
| Encaje con ADR-0029 | Sí: «tablas propias solo donde la plantilla no basta» | Contradice la ADR para un conjunto fijo de campos | Sí, pero las fotos no caben | Descartada por la ADR |
| Huella `v1` de la atención | **Cubre la evaluación**; las fotos se sellan aparte (D5) | No cubre nada; habría que sellar cada tabla | Cubre todo, pero sin llaves ni auditoría de los archivos | No cubre |
| Cambiar un campo | Una plantilla nueva por migración de datos | Una migración de esquema por campo | Igual que A | Igual que A |
| Costo | **Dos tablas** con RLS y prueba negativa | Tres a cinco tablas, una por grupo | Ninguna, pero sin integridad sobre el adjunto | Dos tablas con valores como texto |

**Por qué no B.** La evaluación son 34 observaciones fijas por lado o por dedo: sin cardinalidad variable no hay razón para una
tabla, y cada tabla hija obliga a sellarla aparte porque la huella `v1` no la cubre (H6e lo resolvió así porque un odontograma
sí es de cardinalidad variable: 52 piezas por varias caras). **Por qué no C para las fotos.** Una foto es un archivo (un adjunto
con su propia fila bajo RLS) más metadato; guardar el identificador del adjunto como texto dentro de un `jsonb` pierde la llave
foránea, la unicidad y la comprobación de que el archivo es del mismo paciente.

**Límite que se declara.** La evaluación es una foto por lado y por dedo; **no** modela una lista variable de lesiones con tamaño
y seguimiento individual (por ejemplo, tres lesiones en un talón). Se cubre con las observaciones de texto y con las fotos. Si los
podólogos piden lesiones localizadas, serían tablas hijas en una versión posterior con el patrón de H6e (pregunta abierta).

### D2. Plantilla «Podología» v1: campos propuestos, convención de claves y agrupación

**Plantilla `Podología` v1**, por migración de datos idempotente (crea la especialidad «Podología» si falta, como hace la
siembra). Un solo campo de contenido obligatorio (`momento`) y uno técnico (`fotos_registradas`, D3); los demás son opcionales
mientras la atención es un borrador y la **evaluación inicial los exige completos al firmar** (D3). Un campo opcional que se
envía se valida por tipo, rango y opciones como cualquier otro.

<!-- REVISAR: todos los campos, opciones y rótulos de esta tabla son una propuesta del agente, no una definición clínica. La
terminología (p. ej. «cavo», «onicocriptosis», «hiperqueratosis»), la numeración de los dedos y los tipos de pisada deben
validarlos los podólogos de la clínica antes de fijar la migración (tarea 0.3). Se publica como v1 con la advertencia, y una
validación posterior que cambie opciones es la versión 2 (las claves no cambian de significado: D2, «Estabilidad»). -->

| Grupo (prefijo) | Claves | Tipo y opciones | Notas |
|---|---|---|---|
| Momento | `momento` | `opcion`: `evaluacion_inicial`, `control` | **Obligatorio** |
| Declaración | `fotos_registradas` | `entero` 0–20 | **Obligatorio**; lo calcula el servidor, no se teclea (D3) |
| Pie (`pie_`) | `pie_tipo_d`, `pie_tipo_i` | `opcion`: `normal`, `plano`, `cavo`, `otro`, `no_evaluado` | `_d` derecho, `_i` izquierdo |
| | `pie_pulsos_d`, `pie_pulsos_i` | `opcion`: `presentes`, `disminuidos`, `ausentes`, `no_evaluados` | |
| | `pie_sensibilidad_d`, `pie_sensibilidad_i` | `opcion`: `conservada`, `disminuida`, `ausente`, `no_evaluada` | |
| | `pie_deformidades` | `texto` (≤ 300) | Ambos pies, en palabras del profesional |
| Uñas (`unas_`) | `unas_d1` … `unas_d5`, `unas_i1` … `unas_i5` | `opcion`: `sana`, `encarnada`, `micotica`, `engrosada`, `traumatica`, `ausente`, `otra` | Dedo 1 = dedo gordo, 5 = meñique |
| | `unas_observaciones` | `texto` (≤ 500) | |
| Piel (`piel_`) | `piel_hiperqueratosis_*`, `piel_fisuras_*`, `piel_lesion_abierta_*`, `piel_maceracion_*`, `piel_verrugas_*` (con `_d` y `_i`) | `si_no` | Diez campos |
| | `piel_observaciones` | `texto` (≤ 500) | |
| Pisada (`pisada_`) | `pisada_tipo_d`, `pisada_tipo_i` | `opcion`: `neutra`, `pronadora`, `supinadora`, `no_evaluada` | |
| | `pisada_observaciones` | `texto` (≤ 500) | Huella plantar, apoyo y marcha |

Treinta y cuatro claves. Las atenciones de Podología siguen exigiendo los campos genéricos de H6 (motivo, anamnesis, examen
físico, diagnósticos CIE-10, plan de tratamiento); la plantilla **no repite** antecedentes (ADR-0015), receta ni signos vitales
(triaje).

- **Agrupación en pantalla por prefijo de clave.** `pie_`, `unas_`, `piel_` y `pisada_` agrupan los campos en secciones con su
  rótulo (`lib/podologia/grupos.ts`). No se añade ningún atributo a la definición de la plantilla ni se toca el validador de H6;
  si `FormularioAtencion` no admite grupos, la tarea 0.7 acuerda un parámetro opcional de presentación.
- **Estabilidad de las claves entre versiones.** Una clave nunca cambia de significado ni de tipo entre versiones de la plantilla:
  un cambio de significado es una clave nueva. La comparación de la evolución (D7) se apoya en esto. Una prueba pgTAP la fija
  recorriendo las versiones consecutivas (`79_podologia_reglas`).
- **Una sola plantilla por especialidad.** `unique (especialidad_id, version)` impide una plantilla «evaluación» y otra «control»:
  por eso `momento` distingue los dos usos dentro de la misma.

*Alternativas descartadas:* (a) **campos obligatorios en todos los usos**: 29 respuestas por cada control haría imposible la
métrica de carga rápida; (b) **dos plantillas (evaluación y control)**: choca con la unicidad de H6; (c) **campos condicionales en
el validador de H6** (`obligatorio_si`): cambia una ADR aceptada; la regla se impone al firmar con un disparador propio (D3);
(d) **selección múltiple de deformidades**: no existe en el subconjunto de tipos; texto libre y observaciones bastan por ahora;
(e) **mediciones numéricas** (ángulos, índice de la huella plantar): sin una norma o criterio validado por los podólogos, no se
inventan.

### D3. Coherencia profesión–plantilla, evaluación inicial completa y declaración de fotos

Dos disparadores sobre `atenciones`, `SECURITY DEFINER` con `search_path` vacío, con el patrón de nombres de H6e (el prefijo
numérico fija el orden alfabético respecto de los de H6, y una prueba lee `pg_trigger` y falla si cambia):

- **`atenciones_podologia_10_coherencia`** (`BEFORE INSERT OR UPDATE OF plantilla_id`): si la plantilla es la de Podología
  (`especialidad_podologia_id()`, que centraliza la búsqueda por nombre), la **profesión del autor**
  (`profesionales.profesion` del `profesional_id` de la atención) debe ser `podologo`; si no, `HC080`. El validador de H6 ya exige
  que la plantilla sea de la especialidad del autor, pero `especialidad_id` es libre (H2c): así, aunque un médico quedara mal
  registrado en Podología, no podría usar su plantilla ni su sección. **No** se exige lo inverso (un podólogo puede registrar una
  atención genérica sin plantilla), y la compatibilidad dentro de `profesionales` no se impone aquí (D8 de H6e: es de H2c y de la
  pantalla de alta de H3; el fallo es cerrado).
- **`atenciones_podologia_20_sellar`** (`BEFORE UPDATE OF firmada_en`, `WHEN old.firmada_en is null and new.firmada_en is not
  null`): corre en el instante de la firma, antes del sello y la huella de H6, y si la atención usa la plantilla de Podología:
  1. **Declaración de fotos** (`HC082`): `fotos_registradas` debe ser igual al número de filas de `fotos_evolucion` de la
     atención. La declaración está en `datos_especialidad`, que **entra en la huella `v1`** de la atención: si alguien borrara o
     añadiera después una foto, la verificación (D5) lo detecta por el recuento.
  2. **Evaluación inicial completa** (`HC084`): si `momento = evaluacion_inicial`, todas las claves de la plantilla **excepto**
     `momento`, `fotos_registradas` y las que terminan en `_observaciones` deben estar presentes. Es la forma de imponer una regla
     condicional que el validador genérico no tiene, **en la base y al firmar** (un borrador incompleto se puede guardar). La lista
     sale de la propia definición de la plantilla vigente de la atención; una prueba recorre cada versión y afirma que toda clave
     está exigida o excluida a propósito, de modo que una versión 2 no deje una clave sin clasificar.

`fotos_registradas` **no se teclea**: el servidor la calcula con el recuento de fotos del borrador y la escribe en el mismo
`UPDATE` del borrador cada vez que las fotos cambian (una escritura que la política de `atenciones` de H6 ya permite al autor). La
interfaz muestra «Fotos: N» sin campo.

*Alternativas descartadas:* (a) **exigir la evaluación completa al guardar el borrador**: impide guardar a medias, que es lo que
hace un control interrumpido; (b) **validarla solo en la aplicación**: un cliente que se salte el servidor firmaría una evaluación
inicial vacía; (c) **ampliar el validador de H6 con campos condicionales**: toca una ADR aceptada y el código de otro change;
(d) **no declarar las fotos y confiar en la huella de cada fila**: no detectaría una foto borrada por el dueño de la base.

### D4. Protocolos por sesiones y plan de controles: catálogo propio sobre los planes de H6i

**Catálogo `protocolos_podologia`** (tabla nueva, RLS activada, gestionada **por migración**, como `plantillas_clinicas`):

| Columna | Detalle |
|---|---|
| `id`, `clave` | `uuid` y `text` única (por ejemplo `onicomicosis`) |
| `nombre` | Rótulo en español |
| `modalidad` | `sesiones` o `controles` |
| `total_sesiones` | `smallint` nula, `≥ 1`; **nula si la fuente no lo da** |
| `frecuencia_dias` | `smallint` nula, `≥ 1`; **nula si la fuente no lo da** |
| `estado_validacion` | `por_validar` (todos hoy) o `validado` |
| `validado_por`, `validado_en` | Obligatorios si `validado` (`CHECK`); nombre y colegiatura del podólogo que validó, y fecha |
| `fuente` | Texto obligatorio: de dónde salió el dato |
| `vigente`, `creado_en` | |

**Contenido inicial: exactamente cuatro protocolos y ninguno más**, tomados de lo que conocemos de la web de una referencia
comercial. **No están validados**: ninguno se presenta como validado y la migración anota la URL y la fecha de consulta en `fuente`
(tarea 2.1).

| `clave` | Nombre | Modalidad | Total | Frecuencia |
|---|---|---|---|---|
| `onicomicosis` | Hongos en las uñas | `sesiones` | 6 | 15 días |
| `verruga_plantar` | Verruga plantar | `sesiones` | 4 | 7 días (semanal) |
| `ortonixia` | Ortonixia | `controles` | 3 | **nula** (la fuente no la da) |
| `pie_diabetico` | Pie diabético | `controles` | **nulo** (la fuente no lo da) | 30 días (**«mensual»**) |

<!-- REVISAR: los cuatro protocolos y sus cifras salen de la web de una referencia comercial y no están validados por los
podólogos de la clínica; la migración los marca `por_validar`. «Mensual» se carga como 30 días porque el plan usa días, pero un mes
de calendario no son 30 días: confirmarlo. Ortonixia no trae frecuencia ni pie diabético trae total: no se inventan; el podólogo
los indica al abrir el plan. No se añade ningún otro protocolo (sin validar tampoco: la lista se amplía por migración cuando los
podólogos la den). -->

**Puerta de revisión (como la del modo de datos de H6, D1).** Una prueba pgTAP afirma que, si el modo de la base es `real`, no
queda ningún protocolo `por_validar`; con el modo `demostracion` actual pasa en vacío, y la migración futura que fije `real` la
hará fallar hasta que los podólogos validen y una migración de datos los marque `validado`. La interfaz muestra la insignia «Por
validar» (texto e icono, no solo color) junto a cada protocolo no validado.

**Cómo se usan con H6i (sin redefinir nada).** El plan de un paciente es de H6i; este change aporta el **selector de protocolo** y
el **prellenado**:
- *Protocolo por sesiones:* el podólogo elige un protocolo; el formulario del plan (de H6i) se prellena con su total y su
  frecuencia; los valores nulos **hay que indicarlos** (sin ellos el plan no se abre) y todos son editables. El plan guarda **sus
  propios valores** y el nombre y la clave del protocolo en su campo de descripción o protocolo: cambiar el catálogo después no
  altera un plan abierto.
- *Plan de controles:* un plan sin protocolo (descripción propia, total, frecuencia y vigencia que fija el podólogo). Es el mismo
  mecanismo; `modalidad` solo sugiere la etiqueta («sesiones» o «controles») en la interfaz.
- Cada sesión es una cita de H3 (con su anticruce y su ventana de cancelación de 1 hora) o queda por agendar; el contador de
  restantes, la sesión a la que no se asiste, la reprogramada y el paciente que abandona son de H6i.

**Supuestos sobre la interfaz de H6i (la tarea 0.2 los confirma; si alguno falla, se ajusta solo esta sección):**
1. el plan de un podólogo pertenece al área Podología y H6i impone su visibilidad: lo leen todos los profesionales a cargo y lo
   escribe solo un profesional de esa profesión (contrato común, sección 8);
2. el plan admite un texto de descripción o protocolo donde guardar la clave y el nombre del protocolo;
3. el total y la frecuencia se indican al crear el plan, y el plan puede no tener protocolo;
4. H6i ofrece la operación de crear el plan y este change la invoca con los valores prellenados (no escribe sobre sus tablas);
5. H6i clasifica sus propias tablas en el compilado de la copia.

*Alternativas descartadas:* (a) **tabla puente `planes_podologia`** (plan ↔ protocolo con el protocolo como llave foránea): una
tabla clínica más con RLS y pruebas para un dato que el texto del plan ya conserva, y sin ningún reporte que lo pida; (b) **guardar
los protocolos como constantes en el código**: un cambio exigiría despliegue y no hay rastro de quién validó qué; (c) **protocolos
de edición libre por el podólogo**: ningún rol de usuario escribe catálogos (ADR-0029); (d) **cargar solo los protocolos y que el
plan los referencie por `id`**: acopla el plan de H6i a una tabla de Podología.

### D5. Fotos de evolución: tabla hija de la atención sobre un adjunto, con sello propio

**Decisión.** `fotos_evolucion` guarda **solo el metadato clínico** de cada foto y apunta a un **adjunto** (`adjunto_id` →
`adjuntos_historia`, D7 de H6). El archivo, su formato, su tamaño y su almacenamiento **no se tocan aquí**: es lo que decide
P-15. Es una tabla hija de la atención: **editable mientras la atención es un borrador, inmutable y sellada al firmarla** (mismo
criterio que las tablas de H6e).

| Columna | Detalle |
|---|---|
| `id` | `uuid` PK |
| `atencion_id` | → `atenciones`; la atención debe ser propia, sin firmar y con la plantilla de Podología |
| `paciente_id` | Lo fija un disparador a partir de la atención; ningún rol de usuario lo envía ni lo cambia |
| `adjunto_id` | → `adjuntos_historia`, **única**: un adjunto es una sola foto |
| `lado` | `derecho` o `izquierdo` |
| `zona` | `unas`, `dedos`, `antepie`, `mediopie`, `talon`, `planta`, `dorso`, `interdigital`, `otra` |
| `dedo` | `smallint` 1–5; **obligatorio si `zona` es `unas` o `dedos`** y nulo en las demás (`CHECK`) |
| `etapa` | `inicial`, `control` o `final` |
| `nota` | Texto opcional ≤ 300, con contenido si existe; obligatorio si `zona = 'otra'` |
| `consentimiento_confirmado` | `boolean not null` con `CHECK (consentimiento_confirmado)` |
| `tomada_en` | `timestamptz`, sellada por el servidor |
| `huella` | `'v1:'` + SHA-256 del `jsonb` canónico de la fila (`id`, `atencion_id`, `paciente_id`, `adjunto_id`, `lado`, `zona`, `dedo`, `etapa`, `nota`, `consentimiento_confirmado`), calculada por un disparador en cada escritura del borrador |
| `creado_en` | `timestamptz` |

<!-- REVISAR: las zonas, las etapas y el límite de 20 fotos por atención son una propuesta; los podólogos pueden necesitar más
posiciones o fotos de ambos pies a la vez (hoy son dos fotos, una por lado). -->

- **Coherencia del adjunto (`HC083`).** El adjunto es del **mismo paciente**, está **vigente**, lo **subió el mismo podólogo** que
  la vincula y no está vinculado a otra foto. Anular después el adjunto (mecanismo de H6) no borra la fila: el registro clínico
  conserva su metadato y la pantalla dice «archivo anulado».
- **Contrato del «adjunto de imagen» que este change necesita** (y nada más): (1) una fila legible solo con las reglas de
  `atenciones` (profesional a cargo), de la que depende el acceso al archivo; (2) pertenece a un paciente, tiene autor, puede
  anularse y nunca se borra, y su descarga se audita con el tipo `adjunto` de H6; (3) un identificador estable; la clave de
  almacenamiento es opaca y no la ve este change.
- **Qué pasa según se resuelva P-15** (decisión del usuario):

| Resolución | Efecto en este change |
|---|---|
| **No se admiten imágenes** | La foto se vincula a un **PDF** (lo único que `adjuntos_historia` admite hoy). Todo funciona; la comparación visual de fotos (D7) no se puede mostrar como imagen |
| **Se admiten imágenes en `adjuntos_historia`** (se amplía D7 de H6 y ADR-0024) | El mismo modelo vale **sin migración**: cambia lo que el adjunto acepta |
| **Se crea una tabla aparte de imágenes** | Una migración nueva repunta `adjunto_id`; es el caso de mayor costo |

Hasta que se decida, **la parte de imágenes de H6h no cierra** (TECH-DESIGN, P-15): las pruebas usan PDF y la vista de pares de
fotos (tarea 6.5) queda bloqueada. Conviene que la decisión incluya retirar los metadatos de ubicación de las fotos y fijar
tamaño y cuota (preguntas de P-15, no de aquí).

- **Consentimiento (propuesta).** La foto no se registra sin que el podólogo **confirme que el paciente fue informado y aceptó**
  (`consentimiento_confirmado`). No se guarda ningún documento ni imagen del consentimiento. <!-- REVISAR: no se verificó qué
  consentimiento exige la norma para fotografiar al paciente ni su forma; el asesor lo decide. Si se exigiera consentimiento
  informado firmado, la NTS 139 (4.3.3 c, nivel A) indica que la firma electrónica del paciente no lo cubre: no se puede resolver
  con una casilla. -->
- **Sello propio.** `fotos_evolucion_50_huella` calcula la huella en cada `INSERT` o `UPDATE` del borrador; a partir de la firma
  nada cambia (D6). La función `verificar_fotos_podologia(atencion)` recalcula la huella de cada fila y compara con la guardada y
  con `fotos_registradas`; la prueba la usa, y una alteración (con el disparador desactivado solo dentro de la transacción de
  prueba) hace que deje de coincidir. **Límite que se declara:** un `UPDATE` del dueño de la base sobre una foto firmada, con los
  disparadores activos, lo rechaza `_20_proteger`; con ellos desactivados, la huella ya no coincide y se detecta; una foto
  añadida o borrada se detecta por el recuento declarado dentro de la huella `v1` de la atención.
- **Correcciones.** Una foto firmada no se edita ni se quita. La **addenda** (H6, texto) explica el error y la foto correcta se
  registra en una atención nueva; si el archivo equivocado debe dejar de verse, se anula el adjunto (H6).

*Alternativas descartadas:* (a) **tabla independiente de la atención, anulable** (una foto se agrega o se anula en cualquier
momento): obliga a modelar estados `vigente` y motivo de anulación y a decidir quién anula, y rompe la regla de que lo firmado
no cambia; (b) **cabecera `fotos_atencion` con huella** (como `odontogramas`): una tabla más con RLS y pruebas para sellar un solo
grupo de filas, cuando la declaración dentro de la huella `v1` y la huella por fila cumplen lo mismo; (c) **metadato en
`adjuntos_historia`** (columnas `lado`, `zona`…): modifica una tabla de H6 cuya estructura fija la prueba `47` y que Odontología
no extiende tampoco; (d) **un `adjunto_id` polimórfico**: sin llave foránea real; (e) **guardar la imagen en esta tabla**: diseña
el almacenamiento que el usuario no autorizó y duplica la RLS y la auditoría de descarga de H6.

### D6. Quién lee y quién escribe: RLS por rol y por profesión

| Rol / profesión | Lee evaluación, fotos y planes | Escribe la evaluación y las fotos |
|---|---|---|
| **Podólogo a cargo, autor de la atención sin firmar** | Sí | **Sí** |
| Podólogo a cargo, no autor | Sí | No (atención ajena: `HC081`) |
| Podólogo sin el paciente a cargo, con asignación vencida o perfil inactivo | No (cero filas) | No |
| Médico, odontólogo, fisioterapeuta o psicólogo a cargo | **Sí** (la historia es compartida; ADR-0031 no restringe Podología) | **No** (`HC080`) |
| Administrativo | No | No |
| Enfermera | No | No |
| Paciente (incluido el titular) | No | No |
| Sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` | Sin `GRANT` | Sin `GRANT` |

- **Evaluación:** es `atenciones`: sus políticas (H6) no cambian. Lo que añade este change es el disparador `HC080` (D3).
- **`fotos_evolucion`:** `SELECT` con `rol_actual() = 'profesional' and profesional_tiene_paciente(paciente_id)` (idéntico a
  `atenciones`, así que la visibilidad de borradores de otros profesionales sigue la de H6); `INSERT`, `UPDATE` y `DELETE` añaden
  `profesion_actual() = 'podologo'` y que la atención sea propia y esté sin firmar. Se usa `(select …)` para forzar `InitPlan`.
- **`protocolos_podologia`:** `SELECT` solo para `rol_actual() = 'profesional'`; **nadie** inserta, actualiza ni borra (sin
  `GRANT`); el administrativo, la enfermera, el paciente, `anonymous`, `cron_notificaciones` y `sync_identidad` no lo leen.
- **`GRANT` por columna** de `fotos_evolucion`: inserta `(atencion_id, adjunto_id, lado, zona, dedo, etapa, nota,
  consentimiento_confirmado)` y actualiza `(lado, zona, dedo, etapa, nota)`; `paciente_id`, `tomada_en`, `huella`, `id` y
  `creado_en` quedan fuera. `DELETE` solo sobre filas de una atención sin firmar (política y disparador), auditado; con la
  atención firmada nadie borra ni actualiza, ni el dueño.
- **Orden de disparadores de `fotos_evolucion`** (prefijos numéricos; una prueba lee `pg_trigger`): `_10_completar` (`paciente_id`
  y `tomada_en`), `_20_proteger` (profesión `HC080`, autoría y atención sin firmar `HC081`), `_30_validar` (adjunto `HC083`, zona y
  dedo), `_40_modo` (guarda de datos reales de H6, que lee `paciente_id`), `_50_huella`.
- **Dos barreras independientes para la profesión:** la política (`42501`) y el disparador `_20_proteger` (`HC080`); se prueban y se
  mutan por separado.
- **Criterio de «sesión de usuario» en los disparadores** (igual que H6e): son `SECURITY DEFINER` y las reglas de **profesión y
  autoría** se aplican cuando la sesión trae contexto de usuario (`rol_actual()` no nulo); las migraciones y la siembra del dueño
  no lo traen. La regla **«atención sin firmar»** se aplica a todos, incluido el dueño.

### D7. Comparación de la evolución

**Qué es.** Una lectura (sin tabla ni función de cálculo) que arma, para un paciente a cargo:
1. **Matriz de evaluaciones:** las **últimas cinco atenciones firmadas** con la plantilla de Podología (cualquier versión),
   ordenadas por `firmada_en`, una columna por atención con fecha y hora de Lima y autor, y una fila por **clave** de la plantilla,
   agrupadas como en D2. Una celda que difiere de la columna anterior de la misma fila se marca con **texto y un icono** («Cambió»)
   y no solo con color (DESIGN.md). Una clave ausente en una atención (campo opcional vacío, o clave que la versión de esa atención
   no tiene) se muestra «No registrado», sin convertir ni suponer.
2. **Series de fotos:** las fotos de las atenciones firmadas agrupadas por serie (`lado`, `zona`, `dedo`), ordenadas por
   `tomada_en`; para cada serie, el par **primera / más reciente** y la línea de tiempo completa. Las filas cuyo archivo fue
   anulado se listan como «archivo anulado».

**Qué no es.** No calcula puntajes, no clasifica una celda como mejoría o empeoramiento, no resalta «valores críticos», no avisa
ni genera gráficos: muestra y el profesional decide (el PRD excluye alertas automáticas; la analítica está fuera de alcance). La
etiqueta de cada fila sale de la **versión más reciente** que la define; el valor de una atención se muestra con la etiqueta de
**su** versión si la opción cambió de rótulo.

**Reglas.**
- Solo atenciones **firmadas**: un borrador no es el registro (incluidos los del propio autor); la vista lo declara con el
  número de borradores no incluidos.
- Las lee **todo profesional a cargo** (psicólogo incluido); el paciente sin asignación vigente no devuelve nada.
- **Una sola transacción**: `exigir_modo_clinico()` → un registro de acceso por cada atención incluida (tipo `atencion`) → las
  lecturas. Si el registro falla, no se devuelve contenido (D2 de H6). Descargar un archivo es el tipo `adjunto` de H6.
- Cuántas atenciones se comparan (cinco) y la selección de dos atenciones a voluntad son una propuesta (pregunta abierta).

*Alternativas descartadas:* (a) **tabla de mediciones en serie** (`mediciones_podologicas`) con una fila por clave y fecha: duplica
la evaluación firmada y abre una segunda fuente de verdad; (b) **gráficos y tendencias**: analítica fuera de alcance; (c) **un
puntaje de gravedad por escala**: sin instrumento validado ni licencia comprobada (P-18); (d) **marcar mejoría o empeoramiento**:
es una interpretación clínica que el sistema no debe hacer sin criterio validado; (e) **función `SECURITY DEFINER` de
comparación**: no hace falta, las políticas de `atenciones` y de `fotos_evolucion` ya imponen la lectura.

### D8. Auditoría

- **Escritura.** `fotos_evolucion` lleva un disparador `AFTER INSERT OR UPDATE OR DELETE` con
  `registrar_auditoria_sin_contenido()` (H6b): queda quién, cuándo, la acción, la tabla y el `id`, **sin copiar** `nota` ni ningún
  dato clínico (el administrativo lee `auditoria`). La tarea 0.6 comprueba que la función cubre `DELETE` (usa `old`). La
  evaluación se audita como el resto de `atenciones` (H2/H6). `protocolos_podologia` no tiene escritura de usuarios, así que no
  lleva disparador.
- **Lectura.** Toda lectura de evaluación o de fotos es contenido clínico y se registra en `accesos_historia` **en la misma
  transacción** (tipos `historia`, `atencion` y `adjunto` de H6; **no se añade ningún tipo ni columna**). Las lecturas del módulo
  las llama `lib/historias/podologia.ts` tras `exigir_modo_clinico()` y el registro del acceso.
- **Un solo módulo.** Todo el SQL contra `fotos_evolucion` vive en `lib/podologia/repositorio.ts` y una prueba
  (`tests/podologia/acceso-unico.test.ts`) falla si otro archivo de `app/`, `lib/` o `components/` lo contiene. Sus funciones de
  lectura **exigen un argumento de tipo `TransaccionConAcceso`**, que solo crea `lib/historias/`, de modo que no se puede leer
  sin pasar por el registro de acceso.

### D9. Copia de la historia (H6d): clasificar las tablas y escribir la sección

| Tabla | Clasificación | Razón |
|---|---|---|
| `fotos_evolucion` | **Incluida** | Metadato de cada foto de atenciones firmadas; el archivo vigente viaja como adjunto (H6d) y el anulado se declara no incluido |
| `protocolos_podologia` | **Excluida** | Catálogo de referencia, no registro del paciente; el nombre del protocolo ya figura en el plan |
| Evaluación podológica | Ya incluida | Vive en `atenciones.datos_especialidad`, que H6d incluye con las etiquetas de su plantilla (tarea 4.2 lo verifica) |
| Planes de sesiones | De H6i | H6i clasifica sus tablas |

La sección la produce `copia_seccion_podologia(paciente, corte)` (`SECURITY DEFINER`, `search_path` vacío, **`EXECUTE` revocado a
todos los roles de usuario**: solo la invoca el compilado). Devuelve, de las atenciones **firmadas** hasta el corte, las fotos con
su lado, zona, dedo, etapa, fecha de Lima, nota y adjunto. **No incluye borradores.** El administrativo no obtiene la sección por
otro camino. Como un `create or replace` del compilado hecho por otro change **pisa** lo anterior, el reemplazo parte siempre de la
definición vigente (`pg_get_functiondef`), y la prueba de cobertura de H6d debe buscar también en las funciones `copia_seccion_*`
(coordinación en la tarea 0.7). Si H6d llegara después de este change, la tarea 4.1 queda pendiente de él y la tabla figura en la
lista de exclusiones provisional con su razón.

### D10. Recetas y Podología: no se diseñan aquí

`profesiones_que_recetan` (H6c) deja al podólogo en «no, sin confirmar»: **no puede emitir recetas** hasta que el cliente y el
asesor lo confirmen. Este change no toca recetas, no añade campos de medicación a la plantilla y no usa `medicamentos_vigentes_del_paciente`
(el podólogo la ve como cualquier profesional a cargo, por H6c). Consecuencia práctica a vigilar: varios protocolos (hongos,
verruga plantar) suelen acompañarse de tratamientos que podrían requerir receta. Si se confirma que el podólogo no receta, el camino
es la derivación a otra especialidad que H6b ya ofrece. **Pregunta abierta, no se decide.**

### D11. Errores: SQLSTATE `HC080` a `HC089`

| SQLSTATE | Significado | Mensaje al usuario (usted) |
|---|---|---|
| `HC080` | Quien escribe no es podólogo, o usa la plantilla de Podología sin serlo | «Solo un podólogo puede registrar la evaluación podológica y las fotos de evolución.» |
| `HC081` | La atención no admite cambios en la sección (firmada, de otro autor o sin plantilla de Podología) | «Esta atención ya no admite cambios en la sección podológica. Para corregirla, agregue una addenda y registre el cambio en una atención nueva.» |
| `HC082` | El recuento declarado de fotos no coincide con las fotos de la atención | «El número de fotos no coincide. Guarde de nuevo la atención antes de firmarla.» |
| `HC083` | Foto con un adjunto inválido | «La foto debe vincularse a un archivo vigente de este paciente que usted haya adjuntado y que no esté usado en otra foto.» |
| `HC084` | Evaluación inicial incompleta al firmar | «Complete la evaluación inicial (pie, uñas, piel y pisada) para firmarla. Solo las observaciones son opcionales.» |
| `HC085`–`HC089` | Reservados | — |

Además: `23505` sobre `adjunto_id` → «Ese archivo ya está usado en otra foto»; `23514` (zona y dedo, nota, consentimiento) → «Hay
campos vacíos o inválidos. Revise la foto» y, para el consentimiento, «Confirme que el paciente fue informado y aceptó la foto»;
`42501` → «No tiene permiso para esta operación»; `HC002`, `HC004` y `HC005` los mensajes de H6. Ningún mensaje contiene texto de
la base ni datos del paciente. La traducción vive en `lib/podologia/errores.ts`, una función pura con una prueba por fila.
`HC080`–`HC089` no chocan con H6 (`HC001`–`HC005`), H2c, H6b a H6e ni las otras especialidades.

### D12. Aplicación: módulo, acciones, rutas y pantallas

- **Módulo:** `lib/podologia/grupos.ts` (prefijos y rótulos), `evaluacion-inicial.ts` (qué claves exige la evaluación inicial, la
  misma regla de `HC084` para dar el error antes de firmar), `comparar.ts` (función **pura** que arma la matriz y las series; prueba
  con `node:test`), `protocolos.ts` (lectura del catálogo y prellenado), `errores.ts`, `repositorio.ts` (con ejecutor inyectable) y
  `lib/historias/podologia.ts` (lecturas con su registro de acceso, D8); `lib/schemas/podologia.ts` (Zod 3, `.strict()`, texto
  con contenido que rechaza invisibles y `U+0000`, NFC). Los esquemas de la plantilla los construye el mecanismo de H6
  (`lib/schemas/plantilla.ts`): este change no duplica el validador.
- **El cliente envía las claves de la plantilla y el `codigo` del protocolo, no ids**; el servidor relee la plantilla vigente y el
  catálogo bajo RLS y valida contra ellos, nunca contra lo que diga el cliente.
- **Acciones** (devuelven `{ ok: true, datos } | { ok: false, mensaje, errores? }`): `guardarFotosPodologicas(atención, fotos)`
  **reemplaza** el conjunto de fotos del borrador en una transacción (modo → borrar sus filas → insertar → recalcular
  `fotos_registradas` en la misma atención); `abrirPlanDeProtocolo` e `abrirPlanDeControles` (invocan la operación de H6i con los
  valores prellenados y el mapeo de errores). **Firmar sigue siendo `firmarAtencion` de H6**: el sello lo hace la base.
- **Rutas:** la **vista de evolución** `app/profesional/pacientes/[pacienteId]/podologia/page.tsx` (matriz, series de fotos y planes
  del paciente; la ve todo profesional a cargo, solo el podólogo ve los botones de registrar); la **evaluación** y las **fotos**
  viven dentro de la atención del podólogo (`.../atenciones/nueva` y `.../atenciones/[atencionId]`) como secciones del formulario
  que `FormularioAtencion` de H6 ofrece a la plantilla de Podología. Toda página repite `auth.protect()`, `exigirRol("profesional")`
  y MFA con el ayudante de guardia de H6 y, para escribir, comprueba la profesión **leída de la base** (la pantalla no es la
  barrera); `Cache-Control: private, no-store`, título fijo («Evolución podológica»), direcciones solo con `uuid`.
- **Componentes** (`components/clinica/podologia/`): `MatrizEvolucion` (tabla accesible con encabezados, «Cambió» como texto e
  icono, tokens de DESIGN.md), `ParDeFotos` y `SelectorProtocolo` con la insignia «Por validar». Se documentan en `docs/DESIGN.md`
  (componentes nuevos) y se regenera el tema (`npm run tema`; `npm run tema:comprobar` en CI). Un solo botón primario por
  pantalla; el formulario conserva lo escrito ante un error del servidor, sin autoguardado en el navegador (D9 de H6).

### D13. Pruebas y verificación

- **pgTAP** (número sugerido **79**, en dos archivos con ese prefijo, como H6e): `79_podologia_rls` (catálogo y `fotos_evolucion`,
  negativos por rol y por profesión) y `79_podologia_reglas` (plantilla, disparadores, sello, estabilidad de claves, puerta de
  revisión, copia). Cada tabla incluye el caso negativo de: administrativo, enfermera, paciente (incluido el titular), sin rol,
  `anonymous`, `cron_notificaciones`, `sync_identidad`, **y por profesión**: podólogo a cargo (positivo), podólogo no autor,
  podólogo sin el paciente, con asignación vencida y con perfil inactivo; médico, odontólogo, fisioterapeuta y psicólogo a cargo
  (leen, no escriben); además `has_table_privilege` de lo que no se concede y `columns_are` exacto. No asumen tablas vacías. Las
  identidades por profesión (`podologo_a`, `podologo_b`, `medico_a`, `odontologo_a`, `fisioterapeuta_a`, `psicologo_a`) se
  reutilizan de las que añade H6e a `scripts/ejecutar-pgtap.ts`; la tarea 0.1 comprueba cuáles existen y añade `podologo_b`.
- **Reglas:** `HC080` a `HC084` cada una por separado; la evaluación inicial con una clave ausente (`HC084`), con todas presentes,
  con solo observaciones vacías y un control con solo `momento` y `fotos_registradas`; la declaración de fotos con una foto de más,
  de menos y borrada con el disparador desactivado en la prueba; zona y dedo; adjunto de otro paciente, anulado, subido por otro
  profesional o ya usado; fotos sobre una atención ya firmada, ajena o sin plantilla; huella reproducible y alteración detectada;
  estabilidad de las claves entre versiones consecutivas; cada clave de cada versión exigida o excluida en la evaluación inicial;
  las cuatro semillas exactas (claves, cifras, nulos) y ninguna otra; `por_validar` con y sin los datos de validación; la
  **puerta de revisión**; orden de los disparadores (`pg_trigger`); que la auditoría y la copia no contengan un texto centinela
  de `nota`; y la prueba de cobertura de H6d.
- **Concurrencia** (`tests/concurrencia/`, número sugerido 31): dos sesiones `pg` reales como `authenticated`: agregar o quitar una
  foto contra la firma de la atención (el editor recibe `HC081` o `HC082`, o la huella ya lo incluye; nunca un sello desfasado);
  20 rondas. La tarea 0.6 comprueba antes el bloqueo `for share` que H6e usa.
- **Verificación por mutación** (como en H2 y H6): debilitar en un branch de desarrollo cada política, disparador y función nuevos
  y comprobar que alguna prueba negativa falla (lista en la tarea 7.2).
- **`node:test`:** esquemas Zod, agrupación, evaluación inicial, la función pura de comparación (columnas, «Cambió», «No
  registrado», versiones distintas, series de fotos, solo firmadas, máximo cinco), mapeo de errores, repositorio con ejecutor
  simulado (modo primero, acceso antes de leer, no se devuelve contenido si el registro falla), acceso único y
  `TransaccionConAcceso`.
- **E2E (Playwright) y axe:** el podólogo registra una evaluación inicial, firma, hace dos controles y abre la comparación; otro
  profesional a cargo ve la matriz sin controles de edición; la enfermera, el administrativo y el paciente no abren la ruta; una
  evaluación inicial incompleta no se firma; protocolo prellenado con insignia «Por validar». Lector de pantalla y 200 % de zoom.
- Antes de cerrar: `code-review` sobre todo el diff con la lectura más estricta.

### D14. Migraciones, orden y datos de demostración

Cinco migraciones nuevas, después de las de H2c, H6, H6b y H6i y (para la última) H6d; nunca se edita una aplicada y `down`
queda vacío (ADR-0027): **(1)** `plantilla-podologia` (especialidad si falta, `especialidad_podologia_id()`, plantilla v1 y los
dos disparadores de `atenciones`; `_20_sellar` nace solo con `HC084`); **(2)** `protocolos-podologia` (tabla, `CHECK`, RLS,
`GRANT` de lectura, las cuatro semillas); **(3)** `fotos-evolucion` (tabla, índices, disparadores, políticas, `GRANT` por columna,
auditoría, `verificar_fotos_podologia()`); **(4)** `sellado-de-fotos-podologia` (`create or replace` de `_20_sellar` partiendo de
la definición vigente, para añadir `HC082` cuando la tabla de fotos ya existe); **(5)** `copia-seccion-podologia` (la función de la
sección y el reemplazo del compilado de H6d). Datos de demostración: opción
opt-in de `scripts/sembrar-datos-demo.ts` con un podólogo, un paciente `@demo.invalid` con una evaluación inicial y dos controles
firmados, un plan de protocolo y, con PDF, dos fotos; rehace solo lo marcado.

## Risks / Trade-offs

- [Los campos, opciones y protocolos son una propuesta sin validar clínicamente] → Marcados `REVISAR` y `por_validar`; la puerta de
  revisión impide el modo `real` con protocolos sin validar; las opciones son versionables por migración de datos sin tocar el
  esquema; la tarea 0.3 los valida con los podólogos antes de fijar la migración.
- [Una evaluación inicial de 29 respuestas puede frenar la primera visita] → Solo se exige al firmar, no al guardar; cada lista de
  opciones incluye un valor «no evaluado» o «ausente»; se mide en la prueba de usabilidad (tarea 7.3).
- [La evaluación es fija por lado y no modela lesiones localizadas] → Límite declarado en D1; observaciones de texto y fotos; las
  tablas hijas quedan como evolución posible con el patrón de H6e.
- [Las fotos se vinculan hoy a un PDF] → Es lo que admite H6 hasta que el usuario decida P-15; el modelo no cambia si se amplía
  `adjuntos_historia`; la comparación visual queda bloqueada hasta entonces y el resto funciona.
- [Fotografiar al paciente sin consentimiento adecuado] → Casilla de confirmación obligatoria como propuesta y pregunta al asesor
  legal; los datos reales siguen bloqueados por P-1.
- [Metadatos de ubicación en las fotos] → Pertenece a la decisión de P-15; se anota allí como condición recomendada.
- [El recuento declarado se desfasa de las fotos] → El servidor lo recalcula en cada escritura de fotos y `HC082` bloquea la firma
  desfasada; pruebas de concurrencia.
- [El `create or replace` del compilado de la copia pisa lo de otros changes] → Se parte siempre de `pg_get_functiondef`; la prueba
  de cobertura de H6d lo detecta; coordinación en 0.7.
- [Un disparador sobre `atenciones` interactúa con los de H6 y los de H6e] → Prefijos numéricos, prueba del orden en `pg_trigger` y
  la tarea 0.6 comprueba que `atenciones_podologia_20_sellar` corre antes del sello y la huella de H6.
- [Las claves de la plantilla cambian de significado en una versión futura y la comparación miente] → Prueba pgTAP de estabilidad
  entre versiones consecutivas y regla de revisión de migraciones.
- [Los supuestos sobre H6i no se cumplen] → Aislados en D4; la tarea 0.2 los confirma antes de escribir la apertura de planes; el
  resto del change no depende de ellos.
- [Los nombres `profesional` dependen de ADR-0030] → Nota al inicio; este change usa los nombres propuestos.

## Migration Plan

1. Grupo 0: validación con los podólogos, interfaz de H6i, decisión de P-15 y preguntas al asesor, antes de escribir la
   migración de la plantilla y del catálogo.
2. Migraciones nuevas en el orden de D14, cada una con su prueba y su revisión con `code-review`. Nunca se edita una aplicada.
3. Suite pgTAP, concurrencia e integración completas en un branch de desarrollo; PR con branch efímero y los mismos pasos.
4. Aplicación: lógica y repositorio primero; pantallas cuando H2b esté aplicado; la vista de pares de fotos cuando P-15 se resuelva.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones. El modo de datos queda en `demostracion`; este change **no**
   lo cambia. Sembrar datos de demostración en producción sigue siendo una acción explícita del usuario.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027). Un defecto se corrige con una migración nueva; está prohibido restaurar
   el branch principal de Neon. Para desactivar la plantilla basta marcarla no vigente en una migración de datos nueva.

## Open Questions

**Obligatorias, que el usuario o el cliente deben responder (este change no las decide):**

- **Imágenes como adjuntos (P-15).** ¿Se admiten imágenes? Formatos, tamaño, miniaturas, cuota, retiro de metadatos de ubicación
  y qué hacer si la respuesta es «solo PDF» (la foto como PDF escaneado). Define cuándo cierra la parte de fotos de H6h.
- **¿Puede un podólogo recetar?** H6c lo deja en «no, sin confirmar». Si no, ¿se deriva a otra especialidad para los tratamientos
  que requieran receta (D10)?
- **Validación con los podólogos de la clínica:** los 34 campos y sus opciones de la plantilla, la numeración de los dedos, las
  zonas y etapas de las fotos y, sobre todo, los **cuatro protocolos** (cifras de la web de una referencia comercial; «mensual» =
  30 días; total de ortonixia sin frecuencia y de pie diabético sin total).

**Para el asesor legal:**

- **Consentimiento para fotografiar al paciente:** si se exige, su forma (escrito, verbal registrado) y si la firma del paciente
  puede ser electrónica; retención y conservación de las fotos; si las fotos de los pies son datos sensibles.

**Las demás no cambian las especificaciones ni el desglose de tareas:**

- **Compatibilidad profesión–especialidad** (H2c la deja a H6e–H6h): hoy cada especialidad impone solo «quien usa mi plantilla es de
  mi profesión» (`HC080`). Conviene una **regla común única** para las cuatro (por ejemplo, que `profesionales` impida un podólogo
  fuera de Podología y a quien no es podólogo dentro de ella) en lugar de cuatro disparadores: decisión para el orquestador.
- **Obligatoriedad de la evaluación inicial:** ¿se exige al firmar (propuesta) o solo se recomienda? ¿Qué campos son realmente
  obligatorios?
- **Cuántas evaluaciones se comparan** (cinco) y si el profesional elige dos a voluntad; si se comparan también las fotos por
  plan de sesiones y no solo por fecha.
- **Fotos de ambos pies en una sola imagen,** más zonas (p. ej. por cara del pie) y más de 20 fotos por atención.
- **Lesiones localizadas con seguimiento propio** (D1, «Límite»): ¿hacen falta?
- **Plan de controles sin total** (pie diabético): H6i exige un total; ¿se renueva por periodos?
- **Corrección ligera de una foto o de una evaluación firmada:** hoy exige una atención nueva (costo conocido, igual que H6e).
- **Quién valida un protocolo** y cómo se registra (`validado_por` como texto): ¿basta el nombre y la colegiatura?
