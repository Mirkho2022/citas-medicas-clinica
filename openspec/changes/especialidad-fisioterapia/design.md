# Design

> **Nombres: sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada); si se rechaza, léase
> `medico`/`medicos`.** Este change escribe `profesional`, `profesionales`, `profesion_actual()`, `profesional_actual()`,
> `profesional_tiene_paciente()`, `atenciones.profesional_id` y `app/profesional/**`; si la ADR se rechaza, léase `medico`/`medicos`,
> `medico_actual()`, `medico_tiene_paciente()`, `atenciones.medico_id` y `app/medico/**`. La regla «solo un fisioterapeuta
> escribe» necesita el atributo `profesion` de H2c: con la alternativa «mantener `medicos` y añadir `profesion`» el diseño no cambia.

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (cuatro capacidades). Estado de partida, verificado en el
repositorio (migraciones de H2) y en los changes vecinos, que **aún no están aplicados**:

- **Atención clínica (H2, en producción):** `atenciones` tiene `id` como única clave (sin `unique (id, paciente_id)`),
  `paciente_id` denormalizado para RLS, `firmada_en` y cuatro textos obligatorios con contenido más `diagnosticos` (al menos un
  código CIE-10). Su política de `UPDATE` exige autor, atención sin firmar y paciente a cargo; un disparador de H2
  (`proteger_atencion_firmada`) la vuelve inmutable al firmar y ninguna atención se borra. `registrar_auditoria()` lee la columna
  `id`, así que toda tabla auditada necesita una. `especialidades` solo tiene `id` y `nombre` único.
- **H6 `historias-clinicas`:** `plantillas_clinicas` (**una fila por versión por especialidad**, `unique (especialidad_id,
  version)`), `atenciones.plantilla_id` y `datos_especialidad` (ADR-0029: tipos `texto`, `entero`, `decimal`, `opcion`, `si_no` y
  `fecha`; **sin arreglos ni objetos anidados**; el validador reconstruye el objeto con las claves definidas, SQLSTATE `HC005`);
  sello del servidor y huella `v1:` de la atención, que cubre `plantilla_id` y `datos_especialidad` pero **no tablas hijas**;
  `accesos_historia` con `tipo_acceso` (`historia`, `atencion`, `adjunto`); la guarda de datos reales (`exigir_paciente_admisible()`,
  `HC002`; `exigir_modo_clinico()`, `HC004`); lectura atómica con registro de acceso (D2) y módulo único de acceso clínico.
- **H2c `profesionales-de-la-salud`:** `profesion_actual()` (único punto de lectura de la profesión), `profesional_tiene_paciente()`,
  el valor `fisioterapeuta` de `profesion_salud`. Deja a los changes de especialidad la compatibilidad profesión–especialidad.
- **H6b `triaje-y-derivacion`:** `registrar_auditoria_sin_contenido()` (disparador de escritura que no copia la fila).
- **H6d `copia-de-historia-clinica`:** `compilar_copia_historia()`; toda tabla clínica nueva se clasifica y aporta su sección, y su
  prueba de cobertura falla si no.
- **H6i `mecanismos-clinicos-comunes` (también sin aplicar; su diseño ya está escrito):** `planes_de_sesiones` y `sesiones_del_plan`
  (el contador, las citas y los casos de inasistencia, reprogramación y abandono son suyos), la vista `planes_de_sesiones_con_contador`,
  `instrumentos_evaluacion` y `aplicaciones_instrumento` (puntaje calculado en el servidor y verificado en la base), el tipo
  `area_clinica` (incluye `fisioterapia`) y las funciones de escritura. Una sesión es `asistida` cuando su **cita** pasa a `atendida`
  (H3), no cuando se escribe una nota. **H6f aporta los protocolos y los instrumentos por migración** y no redefine nada de H6i.
- **Hermano H6e `especialidad-odontologia` (ya escrito):** fijó el patrón que este change sigue para no abrir tres dialectos:
  tablas hijas propias de la atención, **sello propio de la sección con huella** al firmar (la huella `v1` no cubre tablas hijas),
  catálogo gestionado por migración, plantilla v1 con pocos campos, disparadores `atenciones_<especialidad>_10_coherencia` y
  `_20_sellar`, disparadores de las tablas hijas con prefijo numérico para fijar su orden, y una función
  `copia_seccion_<especialidad>()` con `EXECUTE` revocado a todo rol de usuario.
- **Lo que no está verificado y se declara:** las licencias de los cuatro tests funcionales (P-18); las versiones validadas en
  español; el contenido clínico de los catálogos (zonas, movimientos, grupos musculares, pruebas especiales, planes); y que los
  fisioterapeutas no recetan (dato de la guía comercial de Saniape, nivel C de `docs/investigacion-marco-legal-y-saniape.md`).

## Goals / Non-Goals

**Goals:**
- Que el fisioterapeuta registre la evaluación inicial, las notas por sesión, el plan y la reevaluación y el alta con **datos
  estructurados que se comparan en el tiempo** (el mismo movimiento, del mismo lado), sin escribir lo mismo dos veces.
- Que la lectura y la escritura se impongan **en la base de datos**: lo lee todo profesional a cargo, lo escribe solo un
  fisioterapeuta (`profesion_actual()`) que también tiene al paciente a cargo, con casos negativos por rol y por profesión.
- Que lo firmado sea inmutable y detectable si se altera (sello propio), y que toda corrección sea un registro nuevo con su autoría.
- Que una evaluación no se firme incompleta, y que una reevaluación repita lo que midió la inicial para poder compararse.
- Que cada medición tenga una identidad estable (vocabulario cerrado por migración) y que el puntaje del test funcional sea el que
  calcula la base (H6i), nunca uno tecleado.
- Que la copia de la historia incluya Fisioterapia sin que el administrativo la lea por ninguna otra vía.

**Non-Goals:**
- Resolver P-1, P-5, P-15 o P-18; declarar validez legal; verificar licencias (eso es una tarea con evidencia, 0.3).
- Recetas, imágenes, el informe de alta entregable, alertas o umbrales clínicos, protocolos terapéuticos con respaldo clínico,
  videos de ejercicios, el portal del paciente, pagos o saldos de sesiones, dictado por voz e IA.
- Modificar las políticas de H2 o H6, el validador de plantillas, el sello de `atenciones`, la huella `v1`, el plan o los
  instrumentos de H6i, ni añadir columnas a `atenciones`.

## Decisions

### D1. Contrato con los demás changes (qué se asume y qué se aporta)

| Con | Se usa | Se aporta | Por confirmar (`REVISAR`) |
|---|---|---|---|
| H6i, planes | `crear_plan_de_sesiones(p_id, p_paciente, p_atencion, p_protocolo_clave, …)`, `cerrar_plan_de_sesiones()`, la vista `planes_de_sesiones_con_contador` (`restantes`), `sesiones_del_plan` (estados `por_agendar`, `agendada`, `asistida`), el componente `ContadorDeSesiones`; el plan lleva `atencion_id` (misma persona y mismo profesional, `HC094`) y `area` | El **catálogo de planes de Fisioterapia** (`protocolo_clave`), un disparador que lo valida (H6i, D1, regla 3) y la regla de que un plan de Fisioterapia nace de una evaluación firmada de un episodio abierto (D11) | Nombres y estados al aplicar; si H6i prefiere guardar el catálogo de protocolos |
| H6i, instrumentos | `instrumentos_evaluacion` (`area = fisioterapia`, `uso_libre`, `licencia_referencia`, `licencia_verificada_el`), `registrar_aplicacion_instrumento(…, p_atencion, …)`, `puntajes` por escala | Una migración de datos **por instrumento**, solo con licencia verificada (D6); la asociación zona → instrumento y escala | Que cada definición quepa en las operaciones `suma` y `porcentaje` de H6i (D11 de H6i) |
| H6, atenciones | Plantillas, `datos_especialidad`, firma y huella `v1`, `accesos_historia`, módulo único, guarda de datos reales | Plantilla `Fisioterapia v1`, dos disparadores sobre `atenciones` (D8) y la sección de la evaluación dentro de `FormularioAtencion` | Nombres y orden de los disparadores de `atenciones` de H6; contrato del repositorio para «guardar y firmar en un paso» |
| H2c | `profesion_actual()`, `profesional_tiene_paciente()`, `fisioterapeuta` | La regla profesión–plantilla de Fisioterapia (D8); no impide un fisioterapeuta en otra especialidad | Compatibilidad profesión–especialidad en `profesionales` (de H2c y H3) |
| H6b | `registrar_auditoria_sin_contenido()` | — | Que cubre `DELETE` y funciona con claves llamadas `id` |
| H6d | El compilado y su prueba de cobertura | `copia_seccion_fisioterapia()` y la clasificación de las seis tablas (D14) | Cómo delega el compilado en las funciones `copia_seccion_*` |
| H6e, H6h | El patrón de tablas hijas selladas | — | Una ADR común que formalice el patrón (la propone el orquestador; este change no crea una) |
| H6c | — | Nada: este change no recetea. Si la profesión se autorizara a recetar, usa `recetas-medicas` sin cambios aquí | Quién puede recetar (pregunta abierta de H6c) |

Si un nombre de H6i cambia al aplicarse, se corrige en esta tabla y en el SQL; la lógica no cambia.

### D2. Qué va en `datos_especialidad` y qué en tablas propias

La evaluación **es una atención** (acto clínico firmado, con su huella, su addenda y su lugar en la historia) y la **plantilla**
`Fisioterapia v1` guarda en `datos_especialidad` solo lo **escalar que identifica el acto** y que la base necesita leer para decidir
reglas. Lo repetible, comparable o con ciclo de vida propio va en tablas.

| | **A. Híbrido: atención + plantilla mínima + tablas hijas (elegido)** | B. Todo en `datos_especialidad` | C. Todo en tablas propias, sin atención | D. Una tabla por tipo de medición, sin catálogo |
|---|---|---|---|---|
| Mediciones repetidas (goniometría, fuerza, pruebas: N filas por evaluación) | Filas con identidad `(tipo, clave, lado)` | **No caben**: el validador de ADR-0029 no tiene arreglos; habría que reabrir una ADR aceptada o aplanar a claves fijas (zona × movimiento × lado) | Filas | Filas |
| Comparar en el tiempo | Consulta relacional (D10) | Recorrer `jsonb` de varias atenciones | Consulta relacional | Cuatro tablas que unir |
| El acto sigue siendo una atención (CIE-10, anamnesis, addenda, copia, lista de la historia) | Sí | Sí | **No**: se duplican firma, addenda y lista | Sí |
| Huella | La de la atención cubre lo escalar; **sello propio** cubre las filas (D8) | La cubre toda desde `v1` | Hay que construir otra firma completa | Sello propio por tabla |
| Tablas con RLS y prueba negativa | 6 | 0 | 6 o más | 8 o más |
| Vocabulario controlado | Catálogo + clave foránea | Solo el `opcion` de la plantilla | Catálogo | Catálogo por tabla |

*Alternativas descartadas.* **B** es la más barata y la única que entra gratis en la huella, pero no representa el dato (N
mediciones por evaluación); aplanarla produce cientos de claves y hace ilegible toda consulta. **C** duplica el mecanismo de firma
y deja a Fisioterapia fuera de la lista de atenciones y de la copia por la ruta común. **D** multiplica tablas y pruebas negativas sin
ganar nada sobre una sola tabla con `tipo`.

**Qué va en cada sitio**

| Dato | Dónde | Por qué |
|---|---|---|
| Motivo de consulta, anamnesis, examen físico (resumen), diagnóstico CIE-10, plan de tratamiento | Campos genéricos de la atención (H6) | Ya existen, son obligatorios y validados; el «examen físico» es el resumen narrativo, las mediciones van abajo |
| `tipo_registro` (`evaluacion_inicial`, `reevaluacion`, `alta`), `zona`, `motivo_alta`, `motivo_alta_detalle` | `datos_especialidad` (plantilla `Fisioterapia v1`) | Escalares que identifican el acto; quedan en la huella `v1` de la atención; la base los lee para abrir el episodio, comparar y cerrar |
| Episodio (zona, responsable, estado) | `episodios_fisioterapia` | Tiene ciclo de vida y une varias atenciones |
| Vínculo atención–episodio, omisiones declaradas, sello | `evaluaciones_fisioterapia` (cabecera) | Como `odontogramas`: la sección de una atención |
| EVA, goniometría, fuerza, pruebas especiales, puntaje del test funcional | `mediciones_fisioterapia` | N filas por evaluación con identidad estable |
| Objetivos medibles | `objetivos_fisioterapia` | Se evalúan contra mediciones posteriores |
| Nota por sesión | `notas_sesion_fisioterapia` | Es una serie en el tiempo y no una atención (D12) |
| Plan de sesiones y su contador | H6i (`planes_de_sesiones`) | Un mecanismo, un dueño |
| Test funcional (ítems, respuestas, cálculo) | H6i (`aplicaciones_instrumento`) | Idem |
| Vocabularios | `catalogo_fisioterapia` | Gestionado por migración |

**La declaración queda dentro de la huella de la atención.** `tipo_registro` es obligatorio en la plantilla: una atención con la
plantilla de Fisioterapia **siempre** declara qué acto es y por tanto exige su cabecera y sus mediciones al firmar (D8). Si alguien
borrara después la cabecera y las filas, la atención seguiría declarándolas y la verificación lo detectaría. Un fisioterapeuta puede
registrar también una atención genérica **sin plantilla** (una consulta de orientación): no se le exige lo inverso.

**Plantilla `Fisioterapia v1`** (propuesta mínima, `REVISAR` con los fisioterapeutas):

| Clave | Tipo | Obligatorio | Contenido |
|---|---|---|---|
| `tipo_registro` | `opcion` | Sí | `evaluacion_inicial`, `reevaluacion`, `alta` |
| `zona` | `opcion` | Sí | Las claves de `region` del catálogo (D4); una prueba afirma que coinciden |
| `motivo_alta` | `opcion` | No (obligatorio si es alta: D8) | `objetivos_cumplidos`, `abandono`, `derivacion`, `a_solicitud_del_paciente`, `sin_respuesta_al_tratamiento`, `otro` |
| `motivo_alta_detalle` | `texto` (≤ 200) | No (obligatorio si `otro`: D8) | Texto con contenido |

<!-- REVISAR: los seis motivos de alta son propuesta del agente; el PRD solo dice «reevaluación y alta». El validador de H6 no expresa «obligatorio si…»: esas dependencias las impone el sello (D8), no la plantilla. Verificar al aplicar (tarea 0.6) que el tipo `opcion` acepta estas claves y que el tipo `si_no` de H6 guarda un booleano JSON (no se usa aquí). -->

### D3. Modelo: seis tablas

Todas en `public`, RLS activada, con una columna `id` (la auditoría la lee). `paciente_id` está denormalizado para que la política sea
simple, **lo fija un disparador** a partir de la atención o del episodio y ningún rol de usuario puede enviarlo ni cambiarlo
(no está en el `GRANT` de columnas). Es el mismo criterio de H6e.

| Tabla | Contenido | Claves y reglas |
|---|---|---|
| `catalogo_fisioterapia` | Vocabularios cerrados (D4) | `primary key (tipo, clave)`; sin escritura de usuarios |
| `episodios_fisioterapia` | Un tratamiento de un paciente por una zona: `id`, `paciente_id`, `zona`, `responsable_id` (→ `profesionales`), `evaluacion_inicial_id` (→ `atenciones`, único), `alta_atencion_id` (→ `atenciones`, único, nulo), `estado` (`abierto`, `cerrado`), `abierto_en`, `cerrado_en` | Índice único parcial `(paciente_id, zona) where estado = 'abierto'`; lo escriben solo los disparadores de sello (D8/D9) |
| `evaluaciones_fisioterapia` | La sección de **una** atención: `id`, `atencion_id` (único, → `atenciones`), `paciente_id`, `profesional_id`, `episodio_id` (nulo hasta que se abre, si es la inicial), `tipos_no_evaluados text[]`, `motivo_tipos_no_evaluados`, `huella`, `sellado_en`, `creado_en` | `unique (atencion_id, paciente_id)`; `huella` y `sellado_en` van juntos o ninguno; D5 y D8 |
| `mediciones_fisioterapia` | Una medición por `(atención, tipo, clave, lado)`: `id`, `atencion_id` (→ cabecera), `paciente_id`, `tipo` (`dolor`, `goniometria`, `fuerza`, `prueba_especial`, `test_funcional`), `clave`, `lado` (`derecho`, `izquierdo`, `no_aplica`), `valor`, `positiva`, `aplicacion_id` | `unique (atencion_id, tipo, clave, lado)`; forma por tipo en D5 |
| `objetivos_fisioterapia` | `id`, `atencion_id`, `paciente_id`, `indicador_tipo`, `indicador_clave`, `indicador_lado`, `valor_meta`, `descripcion` | Clave foránea compuesta a la medición del mismo indicador **en la misma evaluación**; D7 |
| `notas_sesion_fisioterapia` | La nota de una sesión (D12) | Solo-agregar |

Tipos nuevos: `tipo_medicion_fisioterapia`, `lado_fisioterapia` y `estado_episodio_fisioterapia`. Los tipos de enumeración
(en vez de texto con `CHECK`) siguen el estilo del esquema (`rol_usuario`, `estado_cita`); añadir un valor es un `alter type … add value`
revisado.

**Por qué un episodio y no solo la evaluación inicial como raíz.** Sin una entidad con estado, «una sola evaluación inicial abierta por
paciente y zona» sería una regla de aplicación; con el episodio es un índice único, a prueba de concurrencia (misma idea que la doble
reserva). El episodio **nace al firmar la evaluación inicial** (no al abrir el borrador): las atenciones nunca se borran (H2), así que
un borrador abandonado dejaría un episodio abierto para siempre y bloquearía la zona.

### D4. Vocabularios cerrados por migración: `catalogo_fisioterapia`

Una sola tabla, no cuatro: los vocabularios comparten forma y política, y cada tabla más es otra superficie con RLS y pruebas.

| Columna | Detalle |
|---|---|
| `tipo`, `clave` | `tipo` en `region`, `movimiento`, `grupo_muscular`, `prueba_especial`, `plan`; `clave` con formato `^[a-z][a-z0-9_]{1,59}$`; llave primaria `(tipo, clave)` |
| `etiqueta` | Texto en español con contenido (lo que ve el usuario; las claves no se muestran) |
| `region` | Para `movimiento`, `grupo_muscular`, `prueba_especial` y `plan`: la región a la que se asocia en la pantalla (informativa; no impide medir otra) |
| `lateral` | `true`: se registra por lado (`derecho` o `izquierdo`, dos filas si es bilateral); `false`: el lado es `no_aplica` |
| `grados_min`, `grados_max` | Solo `movimiento`: el rango de plausibilidad de los grados (puede ser negativo para una extensión por debajo de cero) |
| `instrumento_clave`, `instrumento_escala`, `instrumento_mejor_si` | Solo `region`: el test funcional de la zona (D6), la escala cuyo puntaje se compara y si un puntaje mayor o menor es mejor |
| `sesiones_sugeridas`, `frecuencia_sugerida_dias` | Solo `plan`: el catálogo de planes de Fisioterapia (D11) |
| `orden`, `vigente` | Orden de presentación; `vigente = false` retira una entrada sin borrarla |

- **Significado inmutable.** Un disparador rechaza, **incluso al dueño**, cambiar `tipo`, `clave`, `lateral`, `grados_*`,
  `sesiones_sugeridas` y `frecuencia_sugerida_dias`; `vigente` y `etiqueta` sí cambian. Las columnas `instrumento_*` de una zona
  solo pasan **de nulo a un valor, una vez** (permite asociar un instrumento cuando su licencia esté verificada sin reescribir el
  catálogo). Una entrada mal definida se retira (`vigente = false`) y se publica otra.
- **Lectura.** Solo `rol_actual() = 'profesional'`. Administrativo, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y
  `sync_identidad` no leen. Nadie escribe.
- **Contenido.** Las **regiones** son nueve propuestas: cervical, dorsal, lumbar, hombro, codo, muñeca y mano, cadera, rodilla, tobillo
  y pie. Sirven de **zona** del episodio y de **localización** del dolor. Los demás vocabularios (movimientos con su rango de
  grados, grupos musculares, pruebas especiales, planes) **no se enumeran aquí**: los redacta la migración de datos (tarea 1.2) con los
  fisioterapeutas de la clínica (tarea 0.4). Ejemplos de *forma*, no de contenido validado: `movimiento` «rodilla · flexión» (lateral,
  con rango), `grupo_muscular` «cuádriceps» (lateral), `prueba_especial` «Lachman» (lateral), `plan` «rehabilitación lumbar»
  (no lateral).
  <!-- REVISAR: todo el contenido clínico del catálogo (regiones, nombres de movimientos y pruebas, rangos de grados, planes) es propuesta de ingeniería, sin validación clínica. La migración llevará un encabezado que lo diga. Sin acceso a los fisioterapeutas, la tarea 0.4 deja el supuesto escrito y avisa al usuario. -->
- **Por qué clave estable y no texto libre.** «Flexión de rodilla derecha» debe significar lo mismo en la evaluación inicial y en la
  reevaluación; con texto libre una tilde o un sinónimo rompe la comparación. La clave foránea compuesta
  `(catalogo_tipo, clave) → catalogo_fisioterapia` (donde `catalogo_tipo` es una columna **generada** de `mediciones.tipo`:
  `dolor → region`, `goniometria → movimiento`, `fuerza → grupo_muscular`, `prueba_especial → prueba_especial`, nula para el test
  funcional) hace que un código inexistente no entre ni por la puerta del dueño.

*Alternativas descartadas.* Cuatro tablas de catálogo (más superficie sin ventaja). Tipos de enumeración de Postgres para
movimientos y pruebas (cada ampliación es una migración de esquema y no se pueden retirar valores). Texto libre con sugerencias
(sin identidad para comparar).

### D5. Mediciones: forma, rangos y omisiones por tipo

**Una fila por medición** con `valor numeric(6,2)` y `positiva boolean` (solo para pruebas especiales); un `CHECK` fija la forma de
cada tipo y un disparador valida contra el catálogo (`HC065`):

| `tipo` | `clave` | `lado` | `valor` / `positiva` |
|---|---|---|---|
| `dolor` (EVA) | `region` del catálogo (localización) | por `lateral` de la entrada | `valor` entero de 0 a 10; sin `positiva` |
| `goniometria` | `movimiento` (articulación y movimiento en una sola clave) | por `lateral` | `valor` entero dentro de `grados_min`–`grados_max` de la entrada |
| `fuerza` | `grupo_muscular` | por `lateral` | `valor` entero de 0 a 5 |
| `prueba_especial` | `prueba_especial` | por `lateral` | `positiva` obligatoria; sin `valor` |
| `test_funcional` | la `clave` del instrumento de la zona (D6) | `no_aplica` | `valor` = el puntaje de la escala de la aplicación; `aplicacion_id` obligatorio |

- **EVA:** entero de 0 a 10 (escala numérica); si la clínica necesita medios puntos es un cambio de tipo revisado.
- **Todos los textos** de este change (motivo de omisión, descripción de objetivo, notas) usan el criterio de H6 (D3): al menos un
  carácter que no sea espacio ni invisible, sin `U+0000`, NFC, límites iniciales ajustables.
- **Omisiones por tipo, declaradas.** La evaluación inicial pide al menos una medición de cada tipo; si un tipo no se evaluó (no se
  puede medir fuerza con un dolor agudo, por ejemplo) se declara en `tipos_no_evaluados` (subconjunto de `goniometria`, `fuerza`,
  `prueba_especial`, `test_funcional`) con `motivo_tipos_no_evaluados` con contenido. No hay filas de un tipo omitido. **La escala de
  dolor no se puede omitir** (es la base de toda comparación). Una omisión por medición individual no existe en esta versión
  (Preguntas abiertas).
- **Cuándo se escribe.** Las filas (y la cabecera y los objetivos) se insertan, actualizan o borran solo mientras la **atención no
  está firmada** y es del autor; `DELETE` se concede **solo sobre filas de un borrador** (política y disparador), porque corregir un
  borrador exige quitar una medición mal puesta. Es distinto de `atenciones`, que nunca se borra, y queda auditado. Con la atención
  firmada, nadie inserta, actualiza ni borra, ni el dueño (D8). El criterio de «sesión de usuario» es el de H6e: los disparadores son
  `SECURITY DEFINER` y no pueden leer `current_user` del invocante, así que las reglas de **profesión y autoría** se aplican cuando
  la sesión trae contexto de usuario (`rol_actual()` no nulo), mientras que «atención sin firmar» se aplica a todos, el dueño
  incluido (la siembra de demostración crea el borrador, las filas y luego firma).
- **`UPDATE` por columna:** `valor` y `positiva` en las mediciones; la clave de una medición no cambia (se borra y se inserta).

### D6. Test funcional según la zona y licencias (`REVISAR`)

El test funcional es un instrumento de `instrumentos_evaluacion` con `area = fisioterapia` (H6i). La zona del episodio decide cuál:

| Zona (región) | Instrumento propuesto | Sentido del puntaje |
|---|---|---|
| lumbar | Oswestry | menor es mejor |
| cervical | NDI | menor es mejor |
| hombro, codo, muñeca y mano | QuickDASH | menor es mejor |
| rodilla | Lysholm | mayor es mejor |
| dorsal, cadera, tobillo y pie | ninguno en esta versión | — |

<!-- REVISAR: el sentido del puntaje de cada instrumento y que cada uno quepa en las operaciones `suma` y `porcentaje` de H6i (D11) son lo que el agente conoce de la literatura, no una comprobación hecha con la fuente. Verificar contra la definición cargada (tarea 6.1); si el sentido difiere, manda la fuente verificada. -->

- **Licencias: no verificadas.** El proyecto no verificó la licencia de ningún instrumento (P-18) y H6i exige que un instrumento
  vigente tenga `uso_libre`, `licencia_referencia` con contenido y `licencia_verificada_el`. **Este change no copia ningún ítem ni
  puntuación:** los escribe la migración de cada instrumento (tarea 6.1) **solo después** de comprobar la licencia del texto exacto y
  del idioma que se carga (tarea 0.3) y con la fuente y la licencia citadas en su encabezado. Un instrumento sin licencia verificada
  no se carga: esa zona queda sin test funcional (ver abajo) y no es un error de la evaluación.
- **Cuándo es obligatorio.** El test es obligatorio en la evaluación inicial **si la zona tiene `instrumento_clave` en el catálogo
  y ese instrumento está vigente**; si no, no se exige. Puede omitirse con la declaración de D5 (`test_funcional` en
  `tipos_no_evaluados`) y su motivo. Cuando se aplica, el puntaje de la fila no lo teclea nadie: la fila exige una aplicación
  (`aplicacion_id`) y la base comprueba (`HC066`) que la aplicación es de ese paciente, de esa evaluación (`aplicaciones_instrumento.
  atencion_id`), vigente (no anulada), del instrumento de la zona, de `area = fisioterapia`, que no la usa otra fila y que `valor`
  es exactamente el puntaje de la escala del catálogo. La reevaluación repite **el mismo instrumento**.
- **Cómo se aplica.** El formulario del instrumento y el cálculo son de H6i (`FormularioInstrumento`); la acción registra la
  aplicación con `p_atencion` = la evaluación y luego inserta la fila de medición.
- **Versiones.** Si un instrumento publica una versión nueva, los puntajes de versiones distintas pueden no ser comparables; la
  comparación usa la `clave` y no lo distingue. Queda como pregunta abierta (no se cambia el puntaje guardado).
- **Una aplicación anulada después de firmar.** La fila de medición conserva su copia sellada; la vista de comparación marca
  `aplicacion_vigente = false` para que se vea. <!-- REVISAR: ¿debe bloquearse anular una aplicación ligada a una evaluación firmada? Es una función de H6i; aquí solo se marca. -->

### D7. Objetivos medibles con su valor inicial

Un objetivo apunta a **un indicador medido en la misma evaluación** y fija una meta. «Valor inicial» no se copia a mano: es el valor de
esa medición.

- **Clave foránea compuesta** `(atencion_id, indicador_tipo, indicador_clave, indicador_lado) → mediciones_fisioterapia (atencion_id,
  tipo, clave, lado)`: no se puede fijar un objetivo sobre algo que no se midió (ni siquiera por la puerta del dueño), y la medición no se
  borra mientras tenga un objetivo (`RESTRICT`). `indicador_tipo` es uno de `dolor`, `goniometria`, `fuerza` o `test_funcional` (una
  prueba especial no tiene un valor que mejorar; negativizarla es una pregunta abierta). Uno por indicador y evaluación.
- **La meta debe mejorar el valor inicial** en el sentido del indicador (`HC065`): `dolor` menor, `goniometria` mayor, `fuerza` mayor,
  `test_funcional` según la zona (D6); y estar dentro del rango del tipo.
- **`descripcion`** opcional (≤ 200, con contenido si existe).
- **Quién y cuándo.** Los fija el fisioterapeuta en la **evaluación inicial** (obligatorio al menos uno, D8) o en una **reevaluación**
  (opcional, con su propio valor inicial: el que esa reevaluación midió). El alta no fija objetivos. No hay plazo, reemplazo ni descarte
  de objetivos en esta versión (Preguntas abiertas).
- **Estado.** Un objetivo está `logrado` cuando el último valor firmado del mismo indicador en el episodio alcanza la meta
  (vista `objetivos_estado_fisioterapia`, D10). No se guarda: se deriva.

### D8. Completitud, sello y huella al firmar (dos disparadores sobre `atenciones`)

Dos disparadores `SECURITY DEFINER` (`search_path` vacío) sobre `atenciones`, con el patrón de H6e, **que no modifican la fila** (solo
leen la atención y escriben en las tablas de este change):

1. **`atenciones_fisioterapia_10_coherencia`** (`BEFORE INSERT OR UPDATE OF plantilla_id`): si la plantilla es la de Fisioterapia
   (identificada con `especialidad_fisioterapia_id()`, una sola función que localiza la especialidad `Fisioterapia`, que la prueba
   afirma única), la **profesión del autor** (`profesionales.profesion` del `profesional_id` de la atención) debe ser
   `fisioterapeuta` (`HC060`). El validador de H6 exige que la plantilla sea de la especialidad del autor, pero `especialidad_id` es
   libre en `profesionales`; así, aunque un médico quedara mal registrado en Fisioterapia, no podría usar la plantilla ni su sección.
2. **`atenciones_fisioterapia_20_sellar`** (`BEFORE UPDATE OF firmada_en`, `WHEN old.firmada_en is null and new.firmada_en is not
   null`): corre en el instante de la firma, y si la atención usa la plantilla de Fisioterapia:
   - exige la **cabecera** y que su tipo concuerde con `tipo_registro` (`HC062`);
   - comprueba la **completitud** según el acto (tabla siguiente);
   - revalida las mediciones (rango, lado, aplicación del test) y que cada objetivo siga apuntando a una medición de esta evaluación;
   - calcula `huella_evaluacion_fisioterapia(atencion)` y la guarda con `sellado_en` en la cabecera;
   - **abre** el episodio (evaluación inicial) o **lo cierra** (alta) (D9).

| Acto | Completitud exigida al firmar | Si falta |
|---|---|---|
| `evaluacion_inicial` | Al menos una medición de `dolor`; para `goniometria`, `fuerza` y `prueba_especial`, al menos una fila **o** declarado en `tipos_no_evaluados`; test funcional si la zona lo exige (D6) o su omisión declarada; **al menos un objetivo**; sin `motivo_alta` | `HC062` |
| `reevaluacion` | Episodio abierto y de la misma zona; al menos una medición de `dolor`; **repite todas las mediciones de la evaluación inicial** salvo los tipos declarados no evaluados; el mismo instrumento; sin `motivo_alta` | `HC062` / `HC063` / `HC064` |
| `alta` | Episodio abierto y de la misma zona; `motivo_alta` obligatorio (y `motivo_alta_detalle` si es `otro`); **repite las mediciones iniciales salvo con `abandono`**, donde el paciente no está y no se exigen; ningún plan de sesiones `activo` del episodio (el profesional lo cierra antes con `cerrar_plan_de_sesiones()`); sin objetivos nuevos | `HC062` / `HC064` |

**Huella.** `'v1:'` + SHA-256 del `jsonb` canónico de `{atencion_id, paciente_id, tipos_no_evaluados, motivo_tipos_no_evaluados,
mediciones, objetivos}` con las listas ordenadas de forma determinista por `(tipo, clave, lado)` y los códigos del catálogo (estables) en
vez de etiquetas. **No incluye `firmada_en`**, de modo que no depende del orden respecto del disparador de sello de H6. La función
`verificar_evaluacion_fisioterapia(atencion)` recalcula y compara; la prueba la usa, y una alteración (con el disparador desactivado
solo dentro de la transacción de prueba) hace que deje de coincidir.

**Inmutabilidad.** Mientras la atención no está firmada, su autor edita la sección. Al firmarla, los disparadores `_20_proteger` de las
tres tablas hijas y de la cabecera rechazan todo `INSERT`, `UPDATE` y `DELETE` **para todo rol, incluido el dueño** (`HC061`). Corregir
algo firmado **nunca edita** la fila: una addenda (H6) explica el error y una **evaluación nueva** (o una reevaluación) lo registra
bien.

**Bloqueo contra firma concurrente.** El ayudante de `_20_proteger` lee la atención con `select … for share`. La firma es un `UPDATE`
de `atenciones`, que retiene el bloqueo de la fila mientras corren los disparadores `BEFORE`: quien edita una medición en el mismo
instante **espera**, y al liberarse ve la atención firmada y recibe `HC061`; si el editor llegó primero, la firma espera y su huella ya
incluye el cambio. La tarea 0.6 lo comprueba con dos sesiones antes de escribir la migración; si no se sostuviera, se pasa a un
ayudante `SECURITY DEFINER` con el mismo bloqueo (el mismo plan de reserva de H6e).

| Alternativa de sellado | Resultado |
|---|---|
| **A. Huella propia en la cabecera + declaración sellada en la atención (elegida)** | Sin tocar H6. Detecta la alteración y la desaparición de las filas |
| B. Inyectar un resumen de las mediciones en `datos_especialidad` al firmar | La huella de la atención lo cubriría de forma transitiva, pero obliga a modificar un objeto ya validado y depende del orden de disparadores de H6 (sin aplicar): frágil |
| C. Que la huella `v1` de H6 cubra tablas hijas | Lo más limpio a largo plazo; exige cambiar el diseño de H6 y coordinar con Odontología y Podología (pregunta abierta, la lleva el orquestador) |
| D. Sin sello | Un `UPDATE` del dueño pasaría inadvertido |

**Orden de los disparadores.** PostgreSQL ejecuta los de un mismo evento en orden alfabético y el de datos reales de H6 lee
`paciente_id`. Las tablas hijas llevan prefijos numéricos: `fisioterapia_10_completar` (identidad y `paciente_id`), `_20_proteger`
(profesión, autoría y atención sin firmar), `_30_validar` (reglas de D5, D7), `_40_modo` (guarda de datos reales) y, en las notas,
`_50_sellar`; la auditoría de escritura es `fisioterapia_90_auditoria` (`AFTER`). Una prueba lee `pg_trigger` y afirma el orden y
que los dos disparadores de `atenciones` existen con esos nombres.

### D9. Ciclo de vida del episodio

```
(borrador de evaluación inicial) ── firmar ──▶ episodio ABIERTO ── firmar reevaluaciones (0..n) ──▶ ── firmar ALTA ──▶ CERRADO
```

- **Apertura.** Al firmar una evaluación inicial, `_20_sellar` inserta el episodio (`zona` = `datos_especialidad.zona`,
  `responsable_id` = el autor, `evaluacion_inicial_id` = la atención) y fija `evaluaciones_fisioterapia.episodio_id`. El índice único
  parcial `(paciente_id, zona) where estado = 'abierto'` hace que dos firmas simultáneas de una inicial para la misma zona dejen **una**
  ganadora y la otra reciba `HC063` (el `23505` se traduce). Un paciente puede tener episodios abiertos en **zonas distintas**.
  Para evitarle el trabajo en vano al usuario, la cabecera de una inicial en borrador también falla pronto si ya hay un episodio
  abierto de esa zona (`HC063`); esa comprobación temprana no sustituye al índice.
- **Reevaluaciones y alta.** Su cabecera trae `episodio_id` (lo elige el usuario si el paciente tiene más de uno) y el disparador
  exige que sea del mismo paciente, esté abierto y sea de la misma zona (`HC063`). Las firma **cualquier fisioterapeuta a cargo** que
  sea el autor de esa atención (una cobertura es válida).
- **Cierre.** Al firmar el alta, `_20_sellar` pasa el episodio a `cerrado` con `cerrado_en` y `alta_atencion_id`. Un episodio cerrado
  no admite reevaluaciones, altas, planes ni notas (`HC063`/`HC067`); un tratamiento nuevo es una evaluación inicial nueva y por tanto
  un **episodio nuevo** (como un plan cerrado en H6i: no se reabre, para no borrar la historia de por qué se cerró).
- **Protección.** `episodios_fisioterapia` se escribe solo por esos disparadores; un disparador `_20_proteger` impone, para todo rol,
  que lo único que cambia es `estado` de `abierto` a `cerrado` (junto con `cerrado_en` y `alta_atencion_id`, juntos) y rechaza todo
  `DELETE`.
- **Una evaluación inicial sin sellar no abre nada**: el borrador abandonado no deja un episodio colgado (D3).

### D10. Comparación en el tiempo: dos vistas `security_invoker`

| | **A. Vistas SQL con funciones de ventana, `security_invoker` (elegida)** | B. Cálculo en la aplicación | C. Tabla de comparaciones guardada al firmar | D. Copiar los valores iniciales dentro de cada reevaluación |
|---|---|---|---|---|
| Una sola definición de «mejora» | Sí, en la base, probada con pgTAP | Duplicada en TypeScript | Sí, pero se guarda | Duplicada |
| RLS | Hereda la de las tablas base: quien no lee la evaluación no ve la comparación | Depende de la consulta | Tabla nueva que blindar | Duplica datos clínicos |
| Datos desactualizados | No | No | **Sí** si una fila cambia o se anula una aplicación | Sí |
| Compara con la anterior y con la inicial | Sí | Sí | Solo lo que se guardó | Solo con la inicial |
| Veredicto | **Elegida** | Descartada | Descartada | Descartada |

**`comparacion_fisioterapia`** (una fila por medición de cada evaluación **firmada** del episodio): `episodio_id`, `paciente_id`,
`atencion_id`, `orden` (1 = la inicial, por `firmada_en`), `tipo_registro`, `evaluada_en`, `tipo`, `clave`, `lado`, `valor`,
`positiva`, `valor_inicial`, `positiva_inicial`, `valor_anterior`, `positiva_anterior`, `diferencia_inicial`, `diferencia_anterior`,
`sentido` (`mayor`, `menor` o `negativa`: qué es mejor), `cambio_inicial`, `cambio_anterior` (`mejora`, `sin_cambio`, `empeora`) y
`aplicacion_vigente`. **`objetivos_estado_fisioterapia`** (una fila por objetivo de una evaluación firmada): `objetivo_id`,
`episodio_id`, `paciente_id`, `atencion_id`, `indicador_tipo`, `indicador_clave`, `indicador_lado`, `descripcion`, `valor_inicial`,
`valor_meta`, `sentido`, `valor_actual`, `actual_en`, `logrado`.

- **Solo evaluaciones firmadas** (los borradores no entran), y la vista no interpreta clínicamente: `cambio_*` es el signo de la
  diferencia frente al sentido del indicador, **sin umbrales** (no hay «diferencia mínima clínicamente importante»; si la clínica la
  quiere, es una decisión nueva con su fuente), y no hay alertas ni colores de gravedad. Una prueba especial pasa de positiva a negativa
  = `mejora`. El sentido sale del tipo (dolor menor; goniometría y fuerza mayor) y, para el test funcional, del catálogo
  (`instrumento_mejor_si`).
- Ambas son `security_invoker = true` y llevan `GRANT SELECT` solo a `authenticated`; **la lista exacta de columnas se fija con
  `columns_are`** (un error en la vista puede mostrar columnas de más, no filas de más) y la prueba global de vistas de H7 las admite.
- Se leen dentro de la transacción con registro de acceso (D13).

### D11. Plan de sesiones y catálogo de planes

El plan es de H6i. Este change aporta cuatro cosas:

1. **Catálogo de planes de Fisioterapia:** entradas `plan` de `catalogo_fisioterapia` (`clave` = `protocolo_clave` del plan,
   `etiqueta`, `region` opcional, `sesiones_sugeridas`, `frecuencia_sugerida_dias`). Son planes de **duración**, no de contenido
   terapéutico: no decimos qué ejercicios se hacen. Los **valores numéricos los fija la clínica** (tarea 0.4): este documento no los
   inventa. La pantalla precarga el total y la frecuencia sugeridos y el fisioterapeuta los ajusta dentro de los límites de H6i (1 a 60
   sesiones).
2. **Un plan de Fisioterapia pertenece a un episodio.** El vínculo es la columna `atencion_id` del plan (H6i): el plan de un episodio es
   el que apunta a una de sus evaluaciones firmadas. Un disparador `planes_fisioterapia_10_episodio` sobre `planes_de_sesiones` (solo
   `area = fisioterapia`, `BEFORE INSERT`, `SECURITY DEFINER`) exige: `protocolo_clave` del catálogo y vigente, `atencion_id` no nulo,
   de una evaluación **firmada** (inicial o reevaluación) cuyo episodio esté **abierto** (`HC067`). Se prefiere esto a una columna
   `plan_id` en el episodio porque el plan ya trae `atencion_id` y porque un episodio puede tener varios planes en sucesión.
   *Alternativa descartada:* una columna mutable `plan_id` en `episodios_fisioterapia`: segunda fuente de verdad que se desincroniza.
3. **El contador no se recalcula.** La pantalla del episodio monta `ContadorDeSesiones` con `planes_de_sesiones_con_contador.restantes`
   de H6i: «Sesión 4 de 10 · quedan 6». Que una sesión no asistida, reprogramada, cancelada o abandonada se trate de una u otra forma es
   de H6i, no se repite. Al agotarse, el plan pasa solo a `completado` y la pantalla ofrece la reevaluación (sugerencia de interfaz,
   no una regla de la base).
4. **Orden de cierre.** Para dar el alta no puede quedar un plan `activo` del episodio (D8): el flujo cierra el plan con
   `cerrar_plan_de_sesiones()` (`alta_anticipada` o `abandono`) y firma el alta en la misma transacción.

<!-- REVISAR: «solo se crea un plan después de firmar la evaluación» y «todo plan de Fisioterapia lleva un protocolo del catálogo» son propuestas mías; el PRD solo dice «plan de sesiones con contador de las restantes». La alternativa es admitir planes con descripción libre y sin episodio (pregunta abierta). -->

### D12. Nota por sesión: solo-agregar, sellada al registrarse

**Alternativas**

| | A. Una atención por sesión (plantilla) | **B. Tabla propia solo-agregar (elegida)** | C. Una addenda de la evaluación |
|---|---|---|---|
| Campos obligatorios | Motivo, anamnesis, examen, **diagnóstico CIE-10** y plan en cada sesión | Los cuatro de la nota | — |
| Fricción por sesión | Alta: una sesión de 30 minutos exigiría seis campos genéricos | Baja | Baja |
| Firma y huella | Las de la atención | Sello propio al insertar (huella `v1`) | Las de la addenda |
| Veredicto | Descartada | **Elegida** | Descartada: la addenda corrige, no registra evolución |

**`notas_sesion_fisioterapia`**: `id` (lo aporta el formulario, idempotencia), `episodio_id`, `paciente_id` (del episodio, fijado por
disparador), `sesion_plan_id` (→ `sesiones_del_plan`; la nota **referencia** la sesión sin escribir en ella), `profesional_id`
(siempre `profesional_actual()`), `dolor_entrada` y `dolor_salida` (enteros 0–10), `tecnicas` (técnicas o ejercicios aplicados),
`respuesta_paciente`, `indicaciones_casa` (todas con contenido), `corrige_a_id` (→ la propia tabla), `motivo_correccion`,
`registrada_en` (`now()` del servidor) y `huella`.

- **Reglas (`HC067`).** El episodio está **abierto** (`HC063` si no); la sesión es de un plan **del episodio** (D11, punto 2), del mismo
  paciente y de `area = fisioterapia`; la sesión está `agendada` o `asistida` (una sesión `por_agendar` no ocurrió); y solo hay **una nota
  vigente por sesión** (índice único parcial sobre `sesion_plan_id where corrige_a_id is null`, a prueba de concurrencia). No exige que
  la cita esté ya marcada `atendida`: marcarla es de H3 y de H6i, y la nota no la acopla (el mismo criterio que H6 D13).
- **Sellada al instante.** `_50_sellar` calcula `huella_nota_sesion_fisioterapia()` = `'v1:'` + SHA-256 del `jsonb` canónico de los
  campos clínicos y de identidad. No hay borrador de nota (la nota es corta; el formulario conserva lo escrito ante un error del
  servidor y no se autoguarda, como en H6). **Ningún rol puede actualizar ni borrar una nota, ni el dueño** (`HC068`).
- **Corrección.** Una nota nueva con `corrige_a_id` y `motivo_correccion` obligatorio que la reemplaza para la lectura; la original
  queda, marcada «corregida por la nota N», **derivado** (no se actualiza). Solo la corrige **su autor** (`HC067`), y una nota se
  corrige una sola vez (índice único sobre `corrige_a_id`); corregir la corrección sí es posible. <!-- REVISAR: ¿un colega puede corregir la nota de otro (baja del autor)? Hoy no; es la misma pregunta que la de los antecedentes de H6. -->
- **Quién.** Cualquier fisioterapeuta con el paciente a cargo (una cobertura es válida), no solo el del plan.
- **Sesiones atendidas sin nota.** La pantalla del episodio lista las sesiones `asistida` sin nota vigente («Sin nota»), derivado de
  `sesiones_del_plan` y de esta tabla; no hay cron ni aviso.
- **Indicaciones para casa no son una receta.** El campo se rotula «Ejercicios y cuidados para casa (no es una receta)»; este change no
  tiene ninguna columna de medicamentos.

### D13. Visibilidad: RLS por rol y por profesión

| Rol / profesión | Lee las cinco tablas del paciente y las vistas | Escribe |
|---|---|---|
| **Fisioterapeuta a cargo, autor de la atención sin firmar** | Sí | **Sí** (cabecera, mediciones, objetivos de su borrador; notas) |
| Fisioterapeuta a cargo, no autor | Sí | Notas, reevaluaciones y altas **propias**; no la sección de una atención ajena (`HC061`) |
| Fisioterapeuta sin el paciente a cargo, con asignación vencida o perfil inactivo | No (cero filas) | No |
| Médico, odontólogo, psicólogo o podólogo a cargo | **Sí** (la historia es compartida; ADR-0031 no restringe Fisioterapia, y el psicólogo a cargo la lee) | **No** (`HC060`) |
| Administrativo | No (solo la sección de la copia, por función, D14) | No |
| Enfermera | No | No |
| Paciente (incluido el titular) | No | No |
| Sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` | Sin `GRANT` | Sin `GRANT` |

- **Catálogo:** `SELECT` solo para `rol_actual() = 'profesional'`; ninguno escribe.
- **Políticas `SELECT`** de las cinco tablas del paciente y, por herencia, de las vistas: `rol_actual() = 'profesional' and
  profesional_tiene_paciente(paciente_id)`, idéntica a `atenciones` (así la visibilidad de los borradores de otros profesionales sigue
  la de H6). `INSERT`, `UPDATE` y `DELETE` añaden `profesion_actual() = 'fisioterapeuta'` y, en la cabecera, las mediciones y los
  objetivos, que la atención sea propia y esté sin firmar; en las notas, `profesional_id = profesional_actual()`. Se usa `(select …)`
  para forzar `InitPlan`.
- **`GRANT` por columna** (los nombres sin permiso no pueden enviarse): `evaluaciones_fisioterapia` inserta `(id, atencion_id,
  episodio_id, tipos_no_evaluados, motivo_tipos_no_evaluados)` y actualiza `(tipos_no_evaluados, motivo_tipos_no_evaluados)`;
  `mediciones_fisioterapia` inserta `(id, atencion_id, tipo, clave, lado, valor, positiva, aplicacion_id)` y actualiza `(valor,
  positiva)`; `objetivos_fisioterapia` inserta `(id, atencion_id, indicador_tipo, indicador_clave, indicador_lado, valor_meta,
  descripcion)` y actualiza `(valor_meta, descripcion)`; `notas_sesion_fisioterapia` inserta `(id, episodio_id, sesion_plan_id,
  dolor_entrada, dolor_salida, tecnicas, respuesta_paciente, indicaciones_casa, corrige_a_id, motivo_correccion)` y nada más;
  `episodios_fisioterapia` y el catálogo, solo `SELECT`. `paciente_id`, `profesional_id`, `huella`, `sellado_en`, `registrada_en` y
  `creado_en` quedan fuera.
- **Dos barreras independientes para la profesión** (cada una se prueba y se muta por separado): la política (`42501`) y el
  disparador `_20_proteger` (`HC060`).
- **Pacientes sin cita (ADR-0032).** Un fisioterapeuta que «tomó» al paciente por derivación tiene la asignación y por tanto el mismo
  acceso; el aislamiento por profesional a cargo se conserva.

### D14. Auditoría, copia y datos reales

- **Escritura.** Las cinco tablas del paciente llevan `fisioterapia_90_auditoria` (`AFTER INSERT OR UPDATE OR DELETE`,
  `registrar_auditoria_sin_contenido()` de H6b): queda quién, cuándo, la acción, la tabla y el `id`, **sin copiar** valores, textos ni
  notas (el administrativo lee `auditoria`). El catálogo no se audita (no es dato de un paciente).
- **Lectura.** Leer Fisioterapia es leer contenido clínico: se registra en `accesos_historia` **en la misma transacción** que la lectura
  (H6, D2): `exigir_modo_clinico()` → `insert` del acceso → lectura; si el registro falla (asignación vencida, perfil desactivado) se
  revierte todo y no se devuelve nada. El tipo es `historia` (vista general del episodio, comparación, notas) o `atencion` (detalle de
  una evaluación), **sin tipo nuevo**: así este change no compite con los demás por la restricción de `tipo_acceso` (el choque que
  anotaron H6c y H6i). Las lecturas del módulo exigen un argumento `TransaccionConAcceso` que solo crea `lib/historias/`, de modo que no
  se puede leer sin pasar por el registro. La lectura del catálogo no se audita. <!-- REVISAR: ¿se quiere un tipo de acceso propio para distinguir Fisioterapia en la revisión de accesos del administrativo? Es una pregunta abierta; añadirlo es una migración y un cambio en la pantalla de H6. -->
- **Datos reales.** El disparador `_40_modo` (`exigir_paciente_admisible()`, `HC002`) protege las cinco tablas; las operaciones del módulo
  empiezan con `exigir_modo_clinico()` (`HC004`). Mientras P-1 siga abierta no entra ningún dato real.
- **Copia de la historia (H6d).** Clasificación de las tablas nuevas en el compilado:

| Tabla | Clasificación | Razón |
|---|---|---|
| `episodios_fisioterapia` | **Incluida** | Zona, responsable, apertura y cierre |
| `evaluaciones_fisioterapia` | **Incluida** | Cabecera, omisiones declaradas y huella de cada evaluación firmada |
| `mediciones_fisioterapia` | **Incluida** | Las mediciones, con las etiquetas del catálogo |
| `objetivos_fisioterapia` | **Incluida** | Objetivos con su valor inicial y su meta |
| `notas_sesion_fisioterapia` | **Incluida** | Todas, las corregidas marcadas como tales (el registro conserva ambas) |
| `catalogo_fisioterapia` | **Excluida** | Catálogo, no registro del paciente; las etiquetas se resuelven dentro de la sección |

La sección la produce `copia_seccion_fisioterapia(paciente, corte)` (`SECURITY DEFINER`, `search_path` vacío, **`EXECUTE` revocado a
todos los roles de usuario**: solo la invoca el compilado). Devuelve, hasta el corte, las evaluaciones **firmadas** con sus mediciones y
objetivos, los episodios y todas las notas; **no incluye borradores** (H6d declara el número de borradores no incluidos). El
administrativo no obtiene la sección por ningún otro camino. Los planes y los tests aplicados salen de las secciones de H6i. La
migración parte siempre de la definición vigente del compilado (`pg_get_functiondef`) para no pisar las secciones de los demás, y la
tarea 7.1 lo verifica. Como H6e, este change **no modifica** H6d.

### D15. Aplicación: módulos, acciones, rutas y pantallas

- **Módulo.** `lib/fisioterapia/repositorio.ts` (con ejecutor inyectable; todo el SQL contra las seis tablas y las vistas),
  `lib/fisioterapia/errores.ts`, `lib/historias/fisioterapia.ts` (lecturas con su registro de acceso, D14) y `lib/schemas/fisioterapia.ts`
  (Zod 3, `.strict()`; el cliente envía la **clave** del catálogo y nunca el `id`; el servidor relee el catálogo bajo RLS y valida
  contra él). Una prueba `tests/fisioterapia/acceso-unico.test.ts` falla si otro archivo de `app/`, `lib/` o `components/` contiene SQL
  contra esas tablas. La lógica pura (etiquetas, sentido de mejora) no lleva SQL.
- **Acciones** (`{ ok: true, datos } | { ok: false, mensaje, errores? }`, todas con Zod en el servidor y `exigirPersonal` de H3):
  `guardarEvaluacionFisioterapia(atención, sección)` **reemplaza** la sección del borrador en una transacción (modo → borrar sus
  objetivos y mediciones → cabecera → insertar cada grupo con una sola sentencia `insert … select from jsonb_to_recordset`),
  `registrarNotaSesion`, `corregirNotaSesion` y `crearPlanFisioterapia` (llama a `crear_plan_de_sesiones()` de H6i con el protocolo del
  catálogo). **Firmar sigue siendo `firmarAtencion` de H6**: el sello lo hace la base. «Guardar y firmar en un paso» compone la
  transacción de H6 con la de esta sección (tarea 0.5); para el **alta**, la transacción cierra antes el plan `activo`.
- **Rutas** (cada una repite `auth.protect()`, `exigirRol("profesional")` y MFA con la guardia de H6; `Cache-Control: private,
  no-store`; páginas dinámicas; título fijo («Fisioterapia»); direcciones solo con `uuid`; lo de un tercero devuelve 404, no 403):

| Ruta | Quién | Contenido |
|---|---|---|
| `app/profesional/pacientes/[pacienteId]/fisioterapia/page.tsx` | todo profesional a cargo | Episodios del paciente (abiertos y cerrados) |
| `.../fisioterapia/episodios/[episodioId]/page.tsx` | todo profesional a cargo | Plan y contador, objetivos y su estado, comparación, notas y sesiones sin nota, resumen de alta si está cerrado; los botones de escritura solo para el fisioterapeuta |
| `.../fisioterapia/episodios/[episodioId]/notas/nueva/page.tsx` | fisioterapeuta | Nota de una sesión (`?sesion=`) o su corrección (`?corrige=`) |
| `.../fisioterapia/episodios/[episodioId]/plan/nuevo/page.tsx` | fisioterapeuta | Crear el plan con el catálogo de planes |
| `.../atenciones/nueva` y `.../atenciones/[atencionId]` (de H6) | fisioterapeuta | La **sección de la evaluación** vive dentro del formulario de la atención, que H6 ofrece a la plantilla de Fisioterapia (inicial, reevaluación o alta, con el episodio elegido) |

- **Componentes** (`components/clinica/`, a documentar en `docs/DESIGN.md` al aplicar; este change no lo edita):
  `SeccionEvaluacionFisioterapia` (tabla por tipo de medición, escala de dolor con el valor en número y texto, no solo posición;
  precarga la lista de la inicial en la reevaluación), `ComparacionFisioterapia` (tabla antes/después con el cambio dicho con texto e
  icono, **nunca solo color**, sin semáforo clínico), `NotaSesionFormulario`, y el `ContadorDeSesiones` y `FormularioInstrumento` de
  H6i. Un solo botón primario por pantalla; el formulario conserva lo escrito ante un error del servidor, sin autoguardado en el
  navegador ni en el servidor (D9 de H6).
- **Resumen de alta.** Una sección de la pantalla del episodio cerrado (comparación, objetivos, motivo, número de sesiones). **No se
  imprime, exporta ni envía a nadie**: quién recibe un informe de alta y cómo es pregunta abierta, y el paciente solo puede obtener su
  historia por la copia con identidad verificada (H6d).
- **Cobertura de teclado y lector de pantalla** en la tabla de mediciones y la escala; prueba de usabilidad con un fisioterapeuta
  (tarea 10.3).

### D16. Errores: SQLSTATE `HC060` a `HC069`

| SQLSTATE | Significado | Mensaje al usuario (usted) |
|---|---|---|
| `HC060` | Quien escribe, o usa la plantilla, no es fisioterapeuta | «Solo un fisioterapeuta puede registrar evaluaciones y notas de Fisioterapia.» |
| `HC061` | La evaluación no admite cambios (firmada, de otro autor o sin plantilla de Fisioterapia) | «Esta evaluación ya no admite cambios. Para corregirla, agregue una addenda y registre el cambio en una evaluación nueva.» |
| `HC062` | Evaluación incompleta o incoherente al firmar | «Complete la evaluación antes de firmarla: revise las mediciones, los objetivos y el motivo del alta.» |
| `HC063` | Episodio no válido para la operación | «No hay un episodio abierto de esa zona para este paciente, o ya existe uno.» |
| `HC064` | La reevaluación o el alta no repite las mediciones iniciales | «Repita las mediciones de la evaluación inicial, o declare el tipo que no se evaluó con su motivo.» |
| `HC065` | Medición u objetivo inválido | «Hay una medición u objetivo que no corresponde. Revise la selección, el lado y los valores.» |
| `HC066` | Test funcional inválido | «El test funcional no corresponde a esta zona o a esta evaluación.» |
| `HC067` | Plan, sesión o nota inválidos | «La sesión no corresponde al plan de este episodio, ya tiene una nota, o la corrección no es válida.» |
| `HC068` | Nota sellada: no se modifica ni se borra | «Las notas no se modifican. Si hay un error, registre una corrección.» |
| `HC069` | Reservado | — |

Además: `23505` sobre el episodio abierto → `HC063`; sobre la nota de una sesión → `HC067`; sobre `(atención, tipo, clave, lado)` → «Ya
hay una medición de eso en esta evaluación. Modifíquela»; `23514` → «Hay campos vacíos o inválidos. Revise el formulario»; `42501` →
«No tiene permiso para esta operación»; `HC002` y `HC004` los mensajes de H6; los de H6i (`HC090`–`HC098`) los de H6i. Ningún mensaje
contiene texto de la base ni datos del paciente. La traducción vive en `lib/fisioterapia/errores.ts`, una función pura con una prueba
por fila. `HC060`–`HC069` no chocan con H6 (`HC001`–`HC005`), H2c, H6b, H6c, H6d, H6e, H6g, H6h ni H6i.

### D17. Migraciones, orden y datos de demostración

Nuevas, después de las de H2c, H6, H6b, H6i y (para la última) H6d. Nunca se edita una aplicada; `down` vacío:

1. `catalogo-fisioterapia`: tipos, tabla, RLS, protección del significado.
2. `catalogo-fisioterapia-datos`: regiones, movimientos, grupos, pruebas y planes (propuesta `REVISAR`), idempotente. Se escribe tras 0.4.
3. `plantilla-fisioterapia`: especialidad «Fisioterapia» si falta, `especialidad_fisioterapia_id()` y la plantilla v1 (idempotente).
4. `evaluacion-fisioterapia-tablas`: episodios, cabecera, mediciones y objetivos; índices, RLS, `GRANT` por columna, políticas y
   disparadores `_10` a `_40` y de auditoría.
5. `evaluacion-fisioterapia-sello-y-coherencia`: `huella_evaluacion_fisioterapia()`, `verificar_evaluacion_fisioterapia()` y los dos
   disparadores sobre `atenciones` (apertura y cierre del episodio incluidos).
6. `comparacion-fisioterapia`: las dos vistas.
7. `notas-sesion-fisioterapia`: la tabla, sus disparadores y el disparador `planes_fisioterapia_10_episodio` sobre `planes_de_sesiones`.
8. `instrumento-<clave>` (hasta cuatro, **condicionales** a la licencia verificada) y `zonas-con-instrumento` (asocia cada zona a un
   instrumento ya cargado).
9. `copia-seccion-fisioterapia`: `copia_seccion_fisioterapia()` y el reemplazo del compilado (H6d).

La **siembra de demostración** crea, para pacientes `@demo.invalid`, evaluaciones **sin firmar**, sus filas y luego las firma (el sello
corre igual como dueño), notas sobre sesiones de planes sintéticos y un episodio cerrado con su alta, porque el dueño tampoco puede
insertar filas en una atención ya firmada.

### D18. Pruebas y verificación

- **pgTAP** (número sugerido **76**, en dos archivos con ese prefijo): `76_fisioterapia_rls` (catálogo y las cinco tablas, negativos por rol
  y por profesión) y `76_fisioterapia_reglas` (reglas, sello, comparación, plan y notas, copia). Cada tabla incluye el caso negativo de
  administrativo, enfermera, paciente (incluido el titular), sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` **y por
  profesión**: fisioterapeuta a cargo (positivo), fisioterapeuta no autor, fisioterapeuta sin el paciente, con asignación vencida y con perfil
  inactivo; médico, odontólogo, psicólogo y podólogo a cargo (leen, no escriben); además `has_table_privilege` de lo que no se concede y
  `columns_are` exacto (sin columnas de dinero). No asumen tablas vacías. Las identidades `fisioterapeuta_a`, `psicologo_a`,
  `podologo_a`, `odontologo_a` y `medico_a` se esperan del ejecutor `scripts/ejecutar-pgtap.ts` (las añade H6e; se crean si faltan) y este
  change añade `fisioterapeuta_b` (otro colega) y `fisioterapeuta_c` (sin el paciente a cargo).
- **Reglas:** forma por tipo (límites y fuera de ellos), lado y lateralidad, duplicados, rango de grados por movimiento, omisiones por tipo,
  completitud de cada acto (`HC062`), repetición (`HC064`), test funcional (`HC066`: aplicación ajena, anulada, de otro instrumento o con
  puntaje distinto), objetivos (meta que no mejora, indicador no medido), apertura y cierre del episodio (`HC063`), plan y sesión (`HC067`),
  nota (una vigente por sesión, corrección, solo-agregar `HC068`), huella reproducible y alteración detectada, comparación (valores,
  sentido, solo firmadas, un paciente a cargo ve y otro no), orden de los disparadores (`pg_trigger`), que la plantilla y el catálogo
  coincidan, que la auditoría y la copia no contengan un texto centinela y la prueba de cobertura de H6d.
- **Concurrencia** (`tests/concurrencia/`, número sugerido 31; sesiones `pg` reales como `authenticated`): dos firmas de evaluación
  inicial de la misma zona (gana una, la otra `HC063`, un solo episodio); edición de una medición contra la firma (`HC061` o la huella ya la
  incluye); dos notas de la misma sesión; dos correcciones de la misma nota. 20 rondas.
- **Verificación por mutación** (como en H2 y H6): debilitar cada política, disparador y función nuevos y comprobar que alguna prueba
  negativa falla (lista en la tarea 10.2).
- **`node:test`:** esquemas Zod, mapeo de errores, repositorio con ejecutor simulado (modo primero, acceso antes de leer, no se devuelve
  contenido si el registro falla), acceso único y `TransaccionConAcceso`. **E2E (Playwright) y axe:** el fisioterapeuta evalúa, firma, crea
  el plan, anota sesiones, reevalúa y da el alta; otro profesional a cargo lo ve sin controles de edición; enfermera, administrativo y
  paciente no abren las rutas; corrección por addenda y por nota nueva. Lector de pantalla y 200 % de zoom.
- Antes de cerrar: `code-review` sobre todo el diff con la lectura más estricta.

## Risks / Trade-offs

- [El contenido clínico de los catálogos y de los planes son supuestos míos] → Marcados `REVISAR` en el encabezado de la migración;
  revisión con los fisioterapeutas (0.4) antes de fijarla; un cambio posterior es una migración de datos, no de esquema; no se usa con
  datos reales mientras P-1 siga abierta.
- [Las licencias de los cuatro tests funcionales no están verificadas] → No se carga ningún ítem hasta verificarlas (0.3, 6.1); sin
  licencia, esa zona queda sin test y la evaluación sigue siendo válida; el mecanismo de H6i exige la referencia de licencia.
- [Dos disparadores sobre `atenciones`, la tabla más sensible] → Solo leen la atención y escriben en tablas propias, solo reaccionan a la
  plantilla de Fisioterapia, no modifican la fila, llevan prueba de orden y se verifican por mutación y `code-review`.
- [La huella de la atención no cubre las tablas hijas] → Sello propio y declaración sellada en `datos_especialidad` (D8); se pregunta a H6
  si prefiere cubrirlas (alternativa C).
- [Los disparadores dependen del orden alfabético y de nombres de H6 aún sin aplicar] → Prefijos numéricos, prueba sobre `pg_trigger`, y
  la tarea 0.6 contrasta nombres y orden con la rama base.
- [Un `create or replace` del compilado de la copia por otro change pisa esta sección] → La migración parte de la definición vigente, la
  prueba de cobertura de H6d y la prueba de contenido de la tarea 7.2 lo detectan.
- [La reevaluación obliga a repetir todo y una medición puede no ser posible] → Omisión declarada por tipo con motivo; la omisión por
  medición individual es pregunta abierta; no se deja forzar un valor falso.
- [Gana la última firma, no la última medición] → El comparador ordena por `firmada_en`; una reevaluación firmada tarde aparece tarde.
  Limitación declarada, la misma que H6e.
- [Un mismo paciente con varias zonas a la vez] → Episodios independientes por zona; el plan y las notas van por episodio.
- [Una aplicación anulada después de firmar] → La copia sellada de la fila se conserva y la vista lo marca (D6).
- [Cambia el nombre «Fisioterapia» de la especialidad] → Centralizado en `especialidad_fisioterapia_id()`; la plantilla lo crea si falta;
  la prueba afirma que existe exactamente una.
- [Nombres y estados de H6i, aún sin aplicar] → La tarea 0.2 los contrasta con el change terminado antes de escribir SQL.
- [Los requisitos de este change solapan los de H6 (`plantillas-clinicas-por-especialidad`, `firma-y-addendas`)] → Este change los
  refina; al archivar, la guía de `config.yaml` exige comprobar que no se contradigan.
- [Los datos de Fisioterapia son datos de salud y no pueden usarse con pacientes reales] → Guarda de H6 en las cinco tablas; el change
  no entra en producción con datos reales mientras P-1, la acreditación ante el MINSA y el registro ante la ANPD sigan abiertos.

## Migration Plan

1. **Grupo 0:** dependencias aplicadas en un branch de desarrollo con la suite en verde; licencias; revisión con los fisioterapeutas;
   spike de bloqueo bajo RLS; coordinación con H6, H6b, H6d, H6e y H6i.
2. Migraciones en el orden de D17, cada una con su prueba, en un branch de desarrollo de Neon y luego en el branch efímero del PR (una
   copia de `production`, solo con datos de demostración). Nunca se edita una migración aplicada.
3. Suite pgTAP completa (las existentes sin tocarse), concurrencia e integración.
4. Aplicación: primero lógica y repositorio, luego pantallas cuando H2b esté aplicado.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones; el modo de datos sigue en `demostracion`. Sembrar evaluaciones de
   demostración en producción es una acción explícita del usuario.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027); un defecto se corrige con una migración nueva. Está prohibido restaurar el
   branch principal de Neon. Una función defectuosa se reemplaza con `create or replace`; un catálogo se corrige retirando la entrada
   (`vigente = false`) y publicando otra.

## Open Questions

**Obligatorias (no se resuelven aquí):**

- **Quién recibe un informe de alta.** ¿El paciente, el médico derivante, otra especialidad? ¿En qué forma? Hoy el resumen es una
  pantalla que no sale del sistema; el paciente solo obtiene su historia por la copia con identidad verificada (H6d). Imprimirlo para
  entregarlo evitaría esa verificación: decisión del usuario y del asesor legal.
- **Licencias y versiones en español de Oswestry, NDI, QuickDASH y Lysholm (`REVISAR`, P-18).** Sin verificación no se carga el
  instrumento (0.3, 6.1).
- **¿El fisioterapeuta registra un diagnóstico CIE-10?** H6 lo exige en toda atención (al menos uno). Si la clínica prefiere un
  diagnóstico fisioterapéutico sin código, hay que cambiar `atenciones` (H6), no esta especialidad.
- **¿Se admite atender sin plan de sesiones?** La propuesta exige que cada nota apunte a una sesión de un plan del episodio (D11, D12). La
  alternativa es admitir notas sueltas del episodio y planes sin protocolo.

**Para el cliente y los fisioterapeutas:**

- Todo el contenido clínico de `catalogo_fisioterapia`: regiones, movimientos y sus rangos de grados (incluidos valores negativos),
  grupos musculares, pruebas especiales y planes (sesiones y frecuencia sugeridas), y los seis motivos de alta (D2, D4, D11).
- Goniometría **activa y pasiva**, EVA con decimales, fuerza con «más» y «menos»: hoy no se distinguen (el PRD no los pide).
- Una **medición individual** que no se pudo repetir en la reevaluación (hoy solo se declara un tipo entero no evaluado).
- Objetivos: **plazo**, reemplazo o descarte de un objetivo, objetivos sobre pruebas especiales (negativizarlas).
- Qué se considera un **cambio relevante**: hoy no se usa ningún umbral; incorporar uno exige una fuente y una decisión.
- Cuándo corresponde una **reevaluación** (¿cada cierto número de sesiones?): hoy es sugerencia de interfaz al agotarse el plan.
- ¿Un colega puede **corregir la nota de otro**? ¿Una evaluación firmada puede corregirse más ligero que con una evaluación nueva?
- Tiempo objetivo de una **nota por sesión** (valor inicial: 60 segundos desde que se abre hasta que se registra, a confirmar en la
  prueba de usabilidad, tarea 10.3).
- Si cambia la **versión de un instrumento**, qué hacer con la comparación (D6).

**Para el orquestador y los demás changes:**

- Una ADR común «tablas hijas de la atención: inmutabilidad y sello» (Odontología, Fisioterapia y Podología repiten el patrón) y la
  pregunta de si la huella `v1` de H6 puede cubrir tablas hijas (alternativa C de D8).
- Un tipo de acceso propio para Fisioterapia en la revisión de accesos (hoy `historia` y `atencion`).
- La compatibilidad profesión–especialidad en `profesionales` (H2c y la pantalla de alta de H3).
- **Recetas:** los fisioterapeutas no recetan según la guía de Saniape (no verificado); lo decide H6c (`profesiones_que_recetan`). Este
  change no emite recetas y sus «indicaciones para casa» no lo son.
- Imágenes (fotos posturales): fuera de alcance; P-15 no afecta a este change.
