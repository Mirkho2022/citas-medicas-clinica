# Design

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesional_actual()`, `profesional_tiene_paciente()` y la ruta `app/profesional/**`; si la
> ADR se rechaza, léase `medico`, `medicos`, `medico_actual()`, `medico_tiene_paciente()` y `app/medico/**`. Nada de este diseño
> cambia por el renombre, salvo los nombres.

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (cuatro capacidades). Estado de partida:

**Verificado en el repositorio (H2, ya migrado)**
- No existe nada de recetas ni de medicamentos: ni tablas, ni funciones, ni texto en TECH-DESIGN o en los ADR (solo el enlace de
  ADR-0031 a este change). El esquema clínico es `historias_clinicas`, `atenciones`, `addendas`, `antecedentes`, `cie10`,
  `asignaciones_paciente_medico`, `accesos_historia` y `auditoria`, todas con RLS y sin `FORCE ROW LEVEL SECURITY` (prueba
  `99_rls_en_todas_las_tablas`): una función `SECURITY DEFINER` del dueño no pasa por RLS, que es lo que usan `registrar_auditoria()`
  y `crear_historia_clinica()`.
- El acceso del médico es `medico_tiene_paciente()` (asignación vigente, fechas de Lima, médico activo). `accesos_historia`
  (`actor_id`, `paciente_id`, `atencion_id`, `creado_en`) se inserta bajo una política que exige médico a cargo y actor propio.
  `registrar_auditoria()` lleva escrita la lista de tablas clínicas (`atenciones`, `addendas`, `antecedentes`) cuyo contenido no
  vuelca a `auditoria`. `texto_con_contenido()` rechaza solo espacios, no caracteres invisibles. `hoy_lima()` existe.
- `historias_clinicas.numero` sale de una **secuencia** (`historias_clinicas_numero_seq`), con saltos aceptados («Una secuencia no
  se revierte: puede haber saltos, nunca repetidos»). Para un expediente es irrelevante; para un documento numerado (D4) no lo es.
- La suite pgTAP corre cada archivo en una transacción que se revierte, con tokens EdDSA de prueba; `tests/concurrencia/` ya usa
  `pg_advisory_xact_lock` en su infraestructura (`00_infraestructura.test.ts`). `neon-http` ejecuta una transacción por petición.
- El proyecto de Neon de la prueba de concepto corre PostgreSQL 18 (`docs/spike-rls-h2.md`); TECH-DESIGN exige 15+. Las vistas
  `security_invoker` (PostgreSQL 15+) ya las usan las propuestas de H3.

**Propuesto por otros changes (aún no existe en el repositorio; este diseño depende de su forma final)**
- H2c (ya redactado en `openspec/changes/profesionales-de-la-salud`): tabla `profesionales` (`profesion`, `colegiatura`,
  `especialidad_id`, `activo`), tipo `profesion_salud` (`medico`, `odontologo`, `fisioterapeuta`, `psicologo`, `podologo`), rol
  `profesional`, `profesional_actual()`, `profesional_tiene_paciente()` y `profesion_actual()`, que H2c declara el **único punto
  de lectura de la profesión** (no lee ningún claim del token) y que este change reutiliza; SQLSTATE `HC010` y `HC011`.
- H6b (ya redactado en `openspec/changes/triaje-y-derivacion`): la función `registrar_auditoria_sin_contenido()` (D13 de H6b),
  que este change reutiliza (D7).
- H6 (1/88 tareas): `accesos_historia.tipo_acceso`, guarda de modo de datos (`exigir_modo_clinico`, `HC002`, `HC004`),
  `paciente_es_de_demostracion()`, módulo único `lib/historias/` con su prueba de acceso único, `AvisoModoDemostracion`.
- H6d amplía también `accesos_historia` (tipo `copia`) e incluirá las recetas en la copia; H6g consume la vista de medicamentos.

**Marco legal.** La investigación (`docs/investigacion-marco-legal-y-saniape.md`) deja el DS 014-2011-SA, art. 56, y la afirmación
de que la receta no se acepta «como imagen digital desde 2024» en el nivel C («solo por Saniape», no verificado). Este diseño
**no afirma** que la receta impresa cumpla la norma; todo el contenido mínimo está marcado `REVISAR` para el asesor. La receta
forma parte de la historia clínica, de modo que su retención queda sujeta a P-1.

**Supuesto del PRD que afecta a este change:** las computadoras de los consultorios están confirmadas, **la impresora no**
(«sin impresora no se pueden imprimir las recetas»).

## Goals / Non-Goals

**Goals:**
- Que solo un profesional de una profesión autorizada emita recetas, y que esa regla viva en la base de datos y se cambie con una
  migración.
- Que una receta emitida no pueda alterarse, tenga un número correlativo sin repetidos ni huecos aunque haya emisiones
  simultáneas, y se corrija solo anulando y emitiendo otra.
- Que todo profesional a cargo vea los medicamentos vigentes del paciente antes de recetar, que nadie más los vea y que la lista
  no filtre nada de Psicología, verificado con pruebas y no solo por construcción.
- Que cada lectura de recetas deje rastro en la misma transacción y que la auditoría de escritura no copie contenido.
- Una hoja impresa clara, con espacio para firma y sello manuscritos, y un registro de quién la imprimió y cuándo.

**Non-Goals:**
- Resolver P-1 o P-5, declarar validez legal de la receta, o decidir el contenido mínimo de la norma (D3, `REVISAR`).
- Receta electrónica y firma digital de recetas, receta especial de estupefacientes y psicotrópicos, alertas de interacción,
  integración con farmacias, catálogo licenciado de interacciones, entrega digital de la receta al paciente.
- Un catálogo de medicamentos validado en la base (D9: decisión abierta, con recomendación).
- Borradores de receta en el servidor, «renovar» una receta anterior, suspender un medicamento antes de su término, código de
  verificación impreso (listados como ideas en «Preguntas abiertas», no construidos).
- Que el administrativo, la enfermera o el paciente lean recetas; la copia de la historia (H6d) las incluye por su propio camino.

## Decisions

### D1. Quién puede recetar: catálogo por profesión, gestionado por migración y aplicado en la base

- **Tabla `profesiones_que_recetan`** (nueva, RLS activada, **sin `GRANT` ni política** para ningún rol de usuario, como
  `configuracion_clinica` de H6): `profesion` (clave primaria, tipo `profesion_salud` de H2c), `puede_recetar`,
  `confirmada`, `referencia` y `actualizado_en`. Dos `CHECK`: `confirmada or not puede_recetar` (una profesión sin confirmar
  nunca queda autorizada) y `referencia` con contenido cuando `confirmada`.
- **Semilla (migración de datos):** `medico` → sí, confirmada; `psicologo` → no, confirmada (el usuario, 2026-10-11);
  `odontologo`, `fisioterapeuta` y `podologo` → **no, sin confirmar**. Es el valor seguro por omisión: nadie receta por un
  supuesto. <!-- REVISAR: si la clínica espera que odontólogos y podólogos receten desde el primer día, la confirmación debe llegar antes del despliegue (tarea 0.1); no se afirma aquí nada sobre lo que la norma permite a cada profesión. -->
- **Función `profesional_puede_recetar()`** (`SECURITY DEFINER`, `search_path` vacío, `stable`, `EXECUTE` solo a `authenticated`):
  obtiene la profesión del profesional de la sesión con **`profesion_actual()` de H2c** (que la lee de `profesionales` y no de
  ningún claim) y devuelve el valor del catálogo; `false` para cualquier sesión que no sea un profesional activo. La interfaz la usa para ofrecer «Emitir receta»; la
  base la vuelve a aplicar en `emitir_receta()` (D2). La profesión nunca llega del navegador ni del token: la ADR-0030 la define
  como dato de la base.
- **Puerta de revisión.** La prueba 70 afirma la semilla exacta y que **toda** profesión del tipo tiene fila. La migración futura
  que autorice a otra profesión (`update ... set puede_recetar = true, confirmada = true, referencia = '...'`) la hará fallar y
  obligará a editarla de forma consciente, citando la referencia. Añadir una profesión nueva sin decidir si receta también falla.
- **Interruptor de emergencia.** Una migración que ponga todas en `false` detiene la emisión sin tocar código; las recetas ya
  emitidas siguen válidas y legibles.

*Alternativas descartadas:* (a) una columna `puede_recetar` en `profesionales` — permitiría decidir por persona y obligaría a
repetir el dato en cada alta; el PRD habla de la profesión («si puede emitir recetas» depende de ella); (b) una constante en el
código — contradice «cambiarlo con una migración sin tocar código» y deja la regla fuera de la base; (c) un atributo del token de
Clerk — la profesión no puede depender de un dato que controle el cliente (ADR-0030); (d) un rol de base de datos «recetador» —
multiplica roles y obliga a sincronizar Clerk y Postgres para algo que es un dato.

### D2. La receta se escribe solo con funciones acotadas, nunca con `INSERT` directo

Las tablas `recetas`, `receta_items` e `impresiones_receta` **no reciben `INSERT`, `UPDATE` ni `DELETE` para ningún rol de
usuario**. Se escriben con tres funciones `SECURITY DEFINER` (`search_path` vacío, `REVOKE ... FROM PUBLIC`, `EXECUTE` solo a
`authenticated`), cada una con la misma cabecera de comprobaciones: rol `profesional`, profesional activo, paciente a cargo.

| Función | Hace | Comprobaciones propias |
|---|---|---|
| `emitir_receta(p_id, p_paciente, p_atencion, p_establecimiento, p_lugar_emision, p_vigencia_dias, p_indicaciones_generales, p_items, p_reemplaza)` | Valida y llama a `insertar_receta()` | Profesión autorizada (`HC030`), contenido (`HC031`), atención (`HC033`), reemplazo (`HC036`) |
| `anular_receta(p_receta, p_motivo)` | Cambia `emitida → anulada` con motivo | Es el emisor (`HC035`), está emitida (`HC034`), motivo con contenido (`HC031`) |
| `registrar_impresion_receta(p_receta)` | Inserta la impresión con su secuencia | Es el emisor (`HC035`), está emitida (`HC034`) |

- **`insertar_receta()` es interna**: ejecuta la numeración (D4), copia los datos del emisor, calcula fecha de validez y huella e
  inserta cabecera y medicamentos. **Sin `EXECUTE` para `authenticated`**, de modo que solo la llama `emitir_receta()` y el dueño
  (la siembra de demostración, que no tiene sesión de usuario).
- **Orden de comprobaciones:** primero rol, profesional activo y paciente a cargo (`42501`, igual que una receta inexistente, sin
  revelar nada); recién después lo que podría revelar existencia (emisor, estado).
- **Idempotencia.** `p_id` lo genera el formulario al abrirse (`crypto.randomUUID()`). Si el mismo envío llega dos veces
  (doble clic, reintento tras un corte), `emitir_receta()` encuentra la receta con ese `id` del mismo emisor y paciente y devuelve
  la existente en lugar de emitir otra; si el `id` pertenece a otro emisor o paciente, rechaza con `42501`. El botón además se
  deshabilita al enviar (DESIGN.md).
- **`lock_timeout`.** Las funciones que numeran llevan `set lock_timeout = '3s'` en su definición (se restablece al salir): si el
  turno de numeración no se obtiene, falla `55P03` sin guardar nada.
- **Guarda de modo de datos (H6, D1).** Un disparador `BEFORE INSERT` en `recetas` rechaza con `HC002` a un paciente que no
  corresponde al modo de la base; reutiliza `paciente_es_de_demostracion()` de H6 (tarea 1.1 de H6) y, si
  `exigir_paciente_admisible()` no es reutilizable tal cual, lleva su propia copia de la misma lógica. La aplicación abre cada
  transacción con `exigir_modo_clinico()` (`HC004`).

*Alternativas descartadas:* (a) **políticas `INSERT` + disparadores** (el patrón de `atenciones`): la cabecera y los medicamentos
serían dos `INSERT`; no hay forma simple de exigir «al menos un medicamento» ni de impedir añadir medicamentos después de emitir
(habría que detectar «la misma transacción» con `xmin`, o una restricción diferida más un disparador de bloqueo), y el emisor, la
fecha y la numeración quedarían repartidos entre políticas, disparadores y la aplicación; (b) **estado `borrador`**: añade una
máquina de estados y un camino de edición sobre un documento que debe ser inmutable; el formulario conserva lo escrito en memoria
mientras la pestaña viva, como en H6 (D9), y la receta es corta; (c) **datos de emisor y establecimiento enviados por el
cliente**: se evita para el emisor (lo copia la base) y se acepta para el establecimiento (D3, riesgo declarado).

### D3. Modelo de datos

**`recetas`** (cabecera; inmutable salvo la anulación):

| Columna | Tipo y reglas |
|---|---|
| `id` | `uuid` clave primaria, **lo aporta el formulario** (idempotencia, D2) |
| `numero` | `bigint not null unique check (numero > 0)`, lo asigna la base (D4) |
| `paciente_id` | `uuid not null` → `pacientes(id)`, `on delete restrict`; denormalizado para RLS como en `atenciones` |
| `atencion_id` | `uuid null` → `atenciones(id)`, `on delete restrict`; del mismo paciente y profesional (`HC033`) |
| `profesional_id` | `uuid not null` → `profesionales(id)`, `on delete restrict`; **siempre** `profesional_actual()` |
| `reemplaza_a` | `uuid null unique` → `recetas(id)`; una receta se corrige una sola vez |
| `emisor_nombre`, `emisor_colegiatura`, `emisor_profesion`, `emisor_especialidad` | **instantánea** copiada por la base de `perfiles`/`profesionales`/`especialidades` al emitir |
| `establecimiento` | `jsonb not null` con `nombre` y `direccion` obligatorios y `ruc`, `telefono` opcionales (`CHECK` de forma); instantánea que aporta la aplicación |
| `lugar_emision` | `text not null` con contenido; lo aporta la aplicación |
| `emitida_en` | `timestamptz not null`; **`clock_timestamp()` tomado después de obtener el turno de numeración** (D4) |
| `valida_hasta` | `date not null`; fecha de emisión en Lima + `p_vigencia_dias` (1 a 365; valor por omisión de la aplicación en D3, nota) |
| `indicaciones_generales` | `text null`, con contenido si no es nulo |
| `estado` | `estado_receta` (`emitida`, `anulada`), `not null default 'emitida'` |
| `motivo_anulacion`, `anulada_por`, `anulada_en` | nulos mientras `emitida`; los tres con valor si `anulada` (`CHECK`); `anulada_por` → `profesionales(id)` |
| `huella` | `text not null`; `'v1:'` + SHA-256 del contenido (D5) |

**`receta_items`** (un medicamento por fila; inmutable): `id`, `receta_id` → `recetas(id)` `on delete restrict`, `orden`
(`smallint`, 1 a 8, `unique (receta_id, orden)`), `dci`, `nombre_comercial` (nulo), `concentracion`, `forma_farmaceutica`, `via`,
`dosis_por_toma`, `frecuencia`, `duracion_dias` (`smallint`, 1 a 365), `cantidad_total` (nulo) e `indicaciones` (nulo). Los
campos de texto obligatorios exigen contenido real; los opcionales, contenido si no son nulos.

**`impresiones_receta`** (solo-agregar): `id`, `receta_id` → `recetas(id)`, `secuencia` (`smallint`, `unique (receta_id,
secuencia)`), `impreso_por` → `profesionales(id)`, `impreso_en` (`timestamptz`, lo fija la base).

**Decisiones del modelo**
- **Contenido mínimo** (`REVISAR`): sale de la guía comercial de Saniape sobre el DS 014-2011-SA, art. 56 (nivel C): nombre y
  colegiatura del profesional, datos del establecimiento, nombre y edad del paciente, medicamento por su DCI (marca opcional),
  concentración, forma farmacéutica, dosis por toma y por día, duración, vía, indicaciones, lugar y fecha de emisión y de
  vigencia, firma. «Dosis por día» se cubre con `dosis_por_toma` + `frecuencia` + `duracion_dias` (la dosis diaria es su
  producto); el asesor decide si exige además un campo propio. `cantidad_total` **no figura en la lista de la guía**: es un
  supuesto del diseño (la farmacia dispensa por cantidad) y es opcional. Ningún campo se imprime ni se exige sin que el asesor
  lo valide.
- **Límites iniciales** (ajustables tras la prueba de impresión, tarea 6.8): 1 a 8 medicamentos; DCI 120 caracteres; marca 80;
  concentración 60; forma 60; vía 40; dosis 80; frecuencia 80; cantidad 40; indicaciones por medicamento 200; indicaciones
  generales 400.
- **Instantánea del emisor y no del paciente.** El nombre, la colegiatura, la profesión y la especialidad del emisor se copian
  porque la lista de medicamentos debe mostrar quién recetó a un psicólogo que no puede leer `perfiles`, y porque lo impreso debe
  poder reproducirse tal cual. Los datos de **filiación del paciente no se copian**: el DS 009-2017-SA, art. 22.g, exige separar
  la filiación de la información clínica (nivel A de la investigación); el nombre, el documento y la fecha de nacimiento se leen
  de `pacientes` al imprimir (la política que ya da al profesional a cargo lectura de `pacientes`), y la edad se calcula a la
  fecha de emisión. Una corrección del nombre del paciente se refleja en la reimpresión, que es lo deseable. <!-- REVISAR: si el asesor exige que el nombre impreso sea el vigente al emitir, se añade una instantánea con su propia revisión de separación de datos. -->
- **Establecimiento.** Lo aporta la aplicación desde variables de entorno (`lib/recetas/establecimiento.ts`: nombre, RUC,
  dirección, teléfono, lugar de emisión y vigencia por omisión) y la base solo exige que la forma sea completa; cualquier
  profesional con sesión podría, en teoría, llamar a la función con otro texto, pero lo único que falsearía es el membrete de su
  propia receta, nunca un dato de otro paciente ni de otro profesional. Si falta algún valor, la aplicación no emite ni imprime
  (falla cerrada). Los valores reales los entrega la clínica (tarea 0.5); en demostración son ficticios y están en `.env.example`.
  *Alternativa descartada:* una tabla de una fila `establecimiento` leída por la base: es la opción más pura, pero añade una
  tabla con RLS y su prueba por un dato que casi no cambia, y H6d imprimirá el mismo membrete; si H6d lo pide, se crea ahí y se
  reutiliza (pregunta abierta).
- **Vigencia de la receta.** La fecha de validez es un parámetro de la aplicación; el valor inicial es un **supuesto** que debe
  fijar el asesor o la clínica. <!-- REVISAR: no se conoce el plazo de validez de una receta; no se ha tomado de ninguna norma. -->
- **Texto con contenido real.** La emisión rechaza campos vacíos, solo espacios o solo caracteres invisibles (`U+200B–U+200D`,
  `U+2060`, `U+FEFF`, `U+00AD`) también en la base, con `texto_receta_valido()`: aquí el campo vacío acaba en papel y no puede
  depender solo de Zod (H6 D3 deja ese hueco en `texto_con_contenido()`).

### D4. Numeración correlativa, única, sin huecos y a prueba de concurrencia

**Mecanismo.** Dentro de `insertar_receta()`, ya autorizada y validada la receta y justo antes de insertar:

```sql
perform pg_advisory_xact_lock(1380271941);                       -- turno único de numeración de toda la clínica
select coalesce(max(numero), 0) + 1 into v_numero from public.recetas;
v_emitida_en := clock_timestamp();                                -- después del turno: el orden de número = el orden de emisión
insert into public.recetas (id, numero, emitida_en, ...) values (...);   -- y sus medicamentos, en la misma transacción
```

- El bloqueo es **de transacción** (`xact`): se libera al confirmar o revertir, así que sirve con `neon-http` (una transacción
  por petición) y con un pool en modo transacción; los bloqueos de sesión no sirven en este entorno.
- Con el nivel de aislamiento por omisión (READ COMMITTED), cada sentencia ve lo confirmado hasta ese momento: tras ganar el turno,
  `max(numero)` incluye la receta de la transacción anterior. La clave `1380271941` (ASCII de «RECE») es una constante
  documentada para que nadie más la use. Bajo `REPEATABLE READ` el `max` podría ser viejo: el `UNIQUE (numero)` lo rechazaría con
  `23505` (falla cerrada, no un duplicado silencioso); el proyecto no usa ese nivel.
- **Sin huecos.** Si la transacción falla o se revierte en cualquier punto, nada de lo calculado persiste: el siguiente número es
  el mismo. Una receta anulada conserva su fila y su número, de modo que todo número entre 1 y el máximo existe y ninguno se
  reutiliza (las eliminaciones están prohibidas, D5).
- **Orden.** `emitida_en` se toma con `clock_timestamp()` después del turno, no con `now()` (hora de inicio de la transacción):
  con `now()`, una transacción que empezó antes pero esperó el turno quedaría con número mayor y hora menor.
- **Costo y contención.** Las emisiones se serializan en toda la clínica, pero la sección crítica es un `max` indexado y un
  `INSERT`; con unas decenas de profesionales y cientos de recetas al día el turno se mide en milisegundos. Si el turno
  no se obtiene en 3 s, `55P03`: «No se pudo emitir la receta ahora. Intente de nuevo.»

*Alternativas descartadas*
| Alternativa | Por qué no |
|---|---|
| **Secuencia de PostgreSQL** (`nextval`), como `historias_clinicas.numero` | Nunca repite y no bloquea, pero una transacción revertida consume su número: deja **huecos** que habría que explicar a una auditoría («¿dónde está la 123?»). Es la alternativa si se acepta explicar los huecos («número consumido por una emisión que no llegó a existir») y se prioriza evitar el turno único |
| **Tabla contador** de una fila (`update ... returning`) | Sin huecos y a prueba de concurrencia, igual que el bloqueo, pero añade una tabla con RLS, su semilla y su prueba negativa para el mismo resultado |
| **`max + 1` sin bloqueo** y reintento ante `23505` | Sin huecos, pero bajo carga produce errores y reintentos visibles al profesional |
| **`SERIALIZABLE`** con reintento | Mueve la complejidad a la aplicación; el driver HTTP no reintenta transacciones |
| **Identificador aleatorio o por año** (`2026-AB12`) | No es «correlativo»; una serie por año añade una regla de reinicio que nadie pidió |

### D5. Inmutabilidad, huella y anulación

- **Disparador `proteger_receta()`** (`BEFORE UPDATE OR DELETE` en `recetas`, `SECURITY INVOKER`, solo mira `OLD`/`NEW`, vale
  también para el dueño): `DELETE` siempre `HC032`; `UPDATE` solo si `OLD.estado = 'emitida'` y `NEW.estado = 'anulada'` con los
  tres campos de anulación completos y **todas las demás columnas iguales**; cualquier otro cambio, `HC032`: «Receta emitida:
  anúlela y emita otra». `receta_items` e `impresiones_receta` rechazan todo `UPDATE` y `DELETE` (`HC032`). El mensaje de H2
  (`42501` con texto) no se reutiliza: aquí el código es propio y la aplicación no tiene que reconocer texto.
- **Huella.** `huella_receta(uuid)` calcula `'v1:' || encode(sha256(convert_to(<jsonb>::text, 'UTF8')), 'hex')` del `jsonb`
  canónico de la cabecera (`id`, `numero`, `paciente_id`, `atencion_id`, `profesional_id`, `reemplaza_a`, la instantánea del
  emisor, `establecimiento`, `lugar_emision`, `emitida_en`, `valida_hasta`, `indicaciones_generales`) y de sus medicamentos
  ordenados por `orden` con todos sus campos. **Excluye** `estado` y los campos de anulación, que cambian por diseño. Se
  calcula al emitir y la prueba la recalcula; mismo criterio que la huella de `atenciones` (H6, D5). No es firma ni sello
  certificado y no se presenta como tal.
- **Anulación.** `anular_receta()` toma la fila `for update`, comprueba y cambia estado, `motivo_anulacion`, `anulada_por`
  (`profesional_actual()`) y `anulada_en` (reloj del servidor). Solo el emisor, mientras tenga al paciente a cargo (mismo criterio
  que «firmar sin tener ya al paciente a cargo» en H6); la receta anulada sigue visible como anulada, no se imprime y sale de
  la lista de medicamentos. Anular no recupera el papel ya entregado: la clínica debe indicar al paciente que lo descarte
  (`REVISAR`, pregunta abierta).
- **Corregir en un paso.** La acción `anularReceta` con `corregir` encadena `anular_receta()` y `emitir_receta(p_reemplaza)` en
  **una sola transacción**: si la receta nueva falla, la original no queda anulada. `emitir_receta` con `p_reemplaza` exige que
  esa receta esté anulada, sea del mismo paciente y profesional y no haya sido reemplazada ya (`HC036`; `reemplaza_a` es único).

### D6. Lectura: RLS para el profesional a cargo y una vista `security_invoker` para los medicamentos

**Quién lee.** `recetas` y `receta_items` tienen `SELECT` para `authenticated` y una política que exige rol `profesional` y
`profesional_tiene_paciente(paciente_id)` (en `receta_items`, por la receta, repitiendo la comprobación como lo hace `addendas`
en H2 en lugar de apoyarse en la RLS anidada). Es la misma regla que `atenciones`: **cualquier** profesión a cargo, incluido el
psicólogo. Ahí ADR-0031 es explícito: los medicamentos «viven en otra tabla, visible para todo profesional a cargo». Administrativo,
enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad` no tienen política ni `GRANT`. Se muestran
las recetas de colegas completas en pantalla (historia compartida); solo el emisor anula o imprime.

**`impresiones_receta`:** `SELECT` solo para el profesional que emitió la receta y la tiene a cargo (necesita el rótulo
Original/Duplicado); nadie más.

**La vista `medicamentos_vigentes_del_paciente`** (`with (security_invoker = true)`, `GRANT SELECT` solo a `authenticated`):

```sql
select r.paciente_id, r.id as receta_id, r.numero as receta_numero, i.id as item_id, i.orden,
       i.dci, i.nombre_comercial, i.concentracion, i.forma_farmaceutica, i.via,
       i.dosis_por_toma, i.frecuencia, i.duracion_dias, i.cantidad_total, i.indicaciones,
       (r.emitida_en at time zone 'America/Lima')::date                    as emitida_el,
       (r.emitida_en at time zone 'America/Lima')::date + i.duracion_dias  as vigente_hasta,
       r.emisor_nombre, r.emisor_profesion
from public.receta_items i join public.recetas r on r.id = i.receta_id
where r.estado = 'emitida'
  and (r.emitida_en at time zone 'America/Lima')::date + i.duracion_dias >= public.hoy_lima();
```

- **Regla de «vigente»** (propuesta, `REVISAR`): desde la emisión hasta `fecha de emisión (Lima) + duracion_dias` inclusive.
  Ejemplo: emitida el 10/10 con 7 días, el tratamiento nominal ocupa del 10 al 16 y el medicamento figura hasta el 17: **un día de
  margen** porque el paciente suele empezar después de comprar. Sobreincluir es el lado seguro para «evitar cruces». Una
  receta anulada sale de inmediato. Todo medicamento exige duración; el uso continuo se expresa renovando la receta (pregunta
  abierta). La vista solo lista vigentes: el historial completo está en `recetas` (pestaña «Todas las recetas»).
- **Por qué `security_invoker` y no una función `SECURITY DEFINER`.** Con la vista, la regla de acceso es una sola: la RLS de las
  tablas. Un error en la vista puede mostrar de más columnas (la prueba las fija) pero no abrir filas a quien las tablas no
  se las dan. Una función `SECURITY DEFINER` obligaría a duplicar `profesional_tiene_paciente()` en su cuerpo, y un olvido
  entregaría filas a cualquiera con `EXECUTE`. *Lo que se gana con la función:* podría insertar el registro de acceso dentro de la
  misma sentencia y volver la auditoría infalible aunque la aplicación falle; se descarta porque H6 ya impone ese orden en la
  aplicación (D2 de H6) y mantener un único patrón es más revisable. Si la revisión de seguridad lo pide, esta es la alternativa.
- **Otras alternativas descartadas:** una vista materializada o tabla de «medicamentos activos» mantenida por disparador — es un
  duplicado más que blindar y puede desincronizarse de las anulaciones; filtrar en la aplicación — un olvido filtraría
  recetas ajenas, justo lo que el riesgo principal del proyecto prohíbe.
- **No filtra Psicología.** (1) La vista depende solo de `recetas` y `receta_items`; la prueba 72 lo comprueba contra
  `pg_depend`. (2) Su lista de columnas está fijada con `columns_are`: añadir una exige editar la prueba. (3) No expone
  `atencion_id`, `huella`, `establecimiento` ni `indicaciones_generales`. (4) El vínculo `atencion_id` solo puede apuntar a una
  atención del mismo profesional emisor, que hoy no puede ser un psicólogo (D1); si una migración futura autorizara a otra
  profesión con notas reservadas, la regla de H6g sobre sus atenciones prevalece y esta decisión se revisa (riesgo). (5) Lo que el
  psicólogo ve de la lista es lo mismo que ve cualquier profesional a cargo (escenario de la especificación). H6g añade a su suite
  la prueba de que el psicólogo lee la vista y de que la vista no contiene sus propias tablas.

### D7. Auditoría: lectura en `accesos_historia`, escritura sin contenido

- **Lectura.** Misma mecánica que H6 (D2): cada función del repositorio que entrega recetas abre **una transacción** con
  `transaccionAutenticada()`: `select public.exigir_modo_clinico($modo)` → `insert into accesos_historia (...)` → lectura. Si el
  `insert` falla (asignación vencida, perfil desactivado) se revierte todo y no se devuelve nada. Se amplía el catálogo de
  `tipo_acceso` con **`receta`** (lista o detalle de recetas; `receta_id` lleno en el detalle) y **`medicamentos`** (la vista) y se añade
  `receta_id uuid null` sin clave foránea (igual que `atencion_id`: la auditoría no debe bloquearse por borrados que además están
  prohibidos), con un `CHECK` `receta_id is null or tipo_acceso = 'receta'`.
- **Choque conocido.** H6 define la restricción de `tipo_acceso` y H6d (`copia`), H6g y H6b la ampliarán. Dos migraciones
  paralelas que la reemplazan con listas distintas se pisan: la última borra los valores de la anterior. Regla de esta
  migración: **leer la restricción vigente** (`pg_get_constraintdef`) y recrearla con la unión de sus valores y los nuevos, y
  coordinar el orden con H6d y H6g (tarea 0.8). <!-- REVISAR: una tabla de tipos o un tipo enumerado con ALTER TYPE ADD VALUE evitaría el choque; es un cambio de H6 que decide el orquestador. -->
- **Escritura sin contenido.** `registrar_auditoria()` lleva la lista de tablas sin contenido escrita dentro de la función y cada
  change que añade una tabla clínica la reemplazaría con su propia lista, con el mismo problema de pisarse (H6b ya lo anotó en su
  D13). Este change **no la reemplaza**: **reutiliza `registrar_auditoria_sin_contenido()`**, la función que crea H6b
  (`SECURITY DEFINER`, `search_path` vacío; registra actor, rol, acción, tabla e identificador y **nunca** `datos_antes` ni
  `datos_despues`), y la engancha a `recetas`, `receta_items` e `impresiones_receta`. Si esta migración llega antes que la de
  H6b, la crea con la **misma firma y definición** (`create or replace` idéntico, para que el orden no importe); se acuerda con
  H6b en la tarea 0.8. <!-- REVISAR: si el orquestador unifica el mecanismo de otra forma (por ejemplo, un argumento del disparador), los disparadores de este change lo adoptan. -->
- **Un solo módulo.** El SQL contra `recetas`, `receta_items`, `impresiones_receta`, `medicamentos_vigentes_del_paciente` y las tres
  funciones vive en `lib/historias/recetas.ts`; la prueba de acceso único de H6 (`acceso-unico.test.ts`) se amplía con esos
  nombres. La lógica pura (vigencia, edad, formato del número, esquema Zod) vive en `lib/recetas/` y `lib/schemas/receta.ts`, sin SQL.

### D8. Plantilla imprimible: hoja HTML con CSS de impresión

**Comparación**

| Opción | Pros | Contras |
|---|---|---|
| **A. Hoja HTML + `@media print` + `@page`** (recomendada) | Sin dependencias nuevas; la misma tipografía y componentes; accesible por defecto; se comprueba con Playwright (`emulateMedia('print')` y `page.pdf()` para contar páginas); el navegador ofrece guardar en PDF si hiciera falta | Cada navegador e impresora tiene sus márgenes; no queda un archivo servidor; hay que ocultar los encabezados y pies del navegador (margen de página cero) |
| **B. PDF generado en el servidor** (biblioteca de PDF, o navegador sin cabeza) | Diseño idéntico en cualquier equipo; archivable | Dependencia nueva y pesada para Vercel (fuentes incrustadas, tamaño de la función, arranque en frío), otro código que probar, y el PRD no pide archivo ni envío digital. **H6d elegirá una biblioteca de PDF para la copia (su tarea 0.5, «coordinada con H6c»)**: si la adopta, B pasa a costar una dependencia ya pagada y esta decisión se revisa |
| **C. PDF en el navegador** (jsPDF, pdfmake) | Sin servidor | Maquetación manual, fuentes, y el contenido clínico se arma en el cliente |

**Recomendación:** A. La receta se imprime una vez en el consultorio, no se archiva ni se envía; lo importante es que sea legible y
quepa en una hoja, y eso se verifica. Si las impresoras reales rompen el diseño, se pasa a B sin cambiar datos ni funciones.

**Distribución.** Formato propuesto A5 vertical (`@page { size: A5; margin: 0 }` con relleno interno, lo que además elimina los
encabezados del navegador). <!-- REVISAR: formato de papel e impresora no confirmados (PRD); la hoja puede ser media hoja A4 o A5; se mide con una impresión real, tarea 0.4 y 6.8. -->
De arriba abajo: membrete del establecimiento; **«Receta» y su número** (`N.º 000123`, ceros a la izquierda, tabulares) con el
rótulo «Original» o «Duplicado n.º N»; lugar, fecha de emisión y «Válida hasta»; datos del paciente (apellidos y nombres,
documento, edad); lista numerada de medicamentos (DCI en negrita, marca entre paréntesis, concentración, forma, vía, dosis,
frecuencia, duración, cantidad, indicaciones); indicaciones generales; **recuadro en blanco de firma y sello manuscritos** con
la línea «Firma y sello del profesional» y debajo, impresos, nombre, profesión, especialidad y colegiatura. Monocromo (tokens de
DESIGN.md de `ink` y `border`; el comprobador de tema prohíbe colores literales), texto mínimo de 10 pt, sin menú ni botones
(`print:hidden`). No imprime el diagnóstico (privacidad: la hoja viaja a una farmacia), el motivo ni la atención. La edad se
calcula a la fecha de emisión y, para menores de dos años, se escribe en meses (`REVISAR`).

**Flujo de impresión y registro**
1. El detalle ofrece «Imprimir receta» (solo al emisor, con la receta emitida) que abre `.../imprimir` en **vista previa**: un
   `GET` no registra nada. La hoja lleva la marca de agua «Vista previa: no válida como receta» (visible también si se
   imprime con Ctrl+P).
2. El botón «Imprimir» (componente de cliente) invoca la acción `registrarImpresionReceta`. Si responde `{ ok: true, secuencia }`,
   cambia el rótulo (secuencia 1 = «Original»; mayor = «Duplicado n.º secuencia − 1»), retira la marca de agua y llama a
   `window.print()`. Si falla, no se imprime y se muestra el mensaje.
3. La acción llama a `registrar_impresion_receta()`: toma la receta `for update`, calcula la secuencia siguiente e inserta. Así dos
   impresiones simultáneas reciben secuencias distintas y una anulación concurrente se ve (`HC034`).
- **Límites declarados.** El registro prueba que **se solicitó** imprimir: el navegador no confirma que haya salido papel. La marca
  de agua evita impresiones accidentales sin registro, no la manipulación deliberada del DOM por un profesional. «Original» y
  «Duplicado» limitan el riesgo de varias copias válidas, pero no controlan el papel una vez entregado. <!-- REVISAR: rotular reimpresiones como «Duplicado» es una propuesta; confirmar con la clínica y el asesor. -->
- Ninguna ruta de impresión pone el nombre del paciente ni medicamentos en el título, la URL o los mensajes (`<title>` es
  «Receta»); las direcciones usan solo `uuid`.

### D9. Medicamento: texto estructurado con DCI obligatoria frente a un catálogo (decisión abierta)

**Comparación**

| Opción | A favor | En contra |
|---|---|---|
| **A. Texto libre** en un solo campo | Cero fricción | No hay DCI separada de la marca; la lista de vigentes y la lectura de colegas pierden orden |
| **B. Texto estructurado, DCI obligatoria** (recomendada ahora) | Campos separados y obligatorios (DCI, concentración, forma, vía, dosis, frecuencia, duración) con la marca opcional; el profesional nunca se bloquea por un medicamento que «no está»; sin fuente de datos que mantener | La base **no puede verificar** que lo escrito en «DCI» sea una DCI (una marca podría colarse) ni evitar variantes («paracetamol», «Paracetamol 500»); no detecta estupefacientes |
| **C. Catálogo oficial validado en la base**, como CIE-10 (ADR-0014) | DCI sin errores de tipeo; permite agrupar y, más adelante, marcar controlados | Hay que **obtener, versionar y mantener** una fuente que no está en el repositorio ni se ha leído; un medicamento ausente bloquea la receta (riesgo clínico) o exige una salida de texto libre que anula el beneficio; tarea del tamaño del catálogo CIE-10 |
| **D. Catálogo con salida «otro»** | Mezcla de C y B | La complejidad de C sin su garantía |

- **Candidatas nombradas por el encargo:** el PNUME y el registro de DIGEMID. **Ninguna se ha descargado ni leído en este
  proyecto**: se desconocen su formato, licencia, frecuencia de actualización y si trae concentración y forma farmacéutica por
  separado. No se inventa una fuente; la tarea 0.3 verifica si alguna es descargable y reutilizable.
- **Recomendación:** entregar B ahora y decidir C como change aparte, con estos criterios: (1) existe una fuente oficial
  reutilizable con licencia clara; (2) alguien de la clínica puede validar la lista; (3) la tasa de medicamentos «no
  encontrados» en una muestra real es baja; (4) se quiere bloquear o advertir estupefacientes y psicotrópicos. <!-- REVISAR: decisión del usuario; no reabre ninguna ADR. -->
- **Por qué B no cierra la puerta a C.** Las recetas son inmutables y las ya emitidas conservan el texto con que se imprimieron;
  incorporar un catálogo después es una migración aditiva (una columna nueva `nullable` y una tabla), sin reescribir nada.
- **Riesgo que B no cubre.** Sin catálogo, el sistema no puede impedir que una receta **común** incluya un estupefaciente o un
  psicotrópico, para los que la norma podría exigir una receta especial (no verificado; el PRD la excluye). Mitigación mínima:
  advertencia fija en el formulario (especificación) y decisión explícita del usuario sobre C. <!-- REVISAR: llevar al asesor. -->
- **Ayudas de formulario sin validar la base:** una nota «Escriba el nombre genérico (DCI); la marca va en el campo opcional»,
  y normalización de espacios y mayúsculas al guardar (NFC, recorte de extremos), nunca conversión de valores.

### D10. Aplicación: rutas, acciones, errores y componentes

| Ruta | Rol | Contenido |
|---|---|---|
| `app/profesional/pacientes/[pacienteId]/recetas/page.tsx` | profesional | Medicamentos vigentes arriba y recetas del paciente (emitidas y anuladas) |
| `.../recetas/nueva/page.tsx` | profesional autorizado | Medicamentos vigentes y formulario de emisión; si la profesión no receta, explica por qué y no ofrece el formulario |
| `.../recetas/[recetaId]/page.tsx` | profesional | Detalle; «Anular» y «Corregir» (solo el emisor); «Imprimir receta» (solo el emisor) |
| `.../recetas/[recetaId]/imprimir/page.tsx` | profesional emisor | Vista previa e impresión (D8) |

Cada página repite `auth.protect()`, el rol y MFA con la guardia de `lib/historias/guardia.ts` (H6, D8); las cabeceras
`Cache-Control: private, no-store` de H6 para `/profesional/pacientes/:path*` ya cubren estas rutas (tarea 0.8 lo comprueba).
El panel `MedicamentosDelPaciente` se monta también en la historia (H6, 6.2) y lo reutiliza H6g.

**Acciones** (`{ ok: true, datos } | { ok: false, mensaje, errores? }`, ADR-0006): `emitirReceta`, `anularReceta` (con opción
`corregir`) y `registrarImpresionReceta`. Las lecturas son funciones del repositorio (`listarRecetas`, `abrirReceta`,
`medicamentosVigentes`, `datosParaImprimir`), cada una en su transacción de D7.

**Errores** (extienden la tabla de H6, D10; nunca se muestra texto de la base):

| Origen | Mensaje al usuario |
|---|---|
| `HC030` | «Su profesión no está autorizada para emitir recetas en este sistema.» |
| `HC031` | «Revise la receta: hay datos vacíos o inválidos.» (con el medicamento y el campo, desde Zod) |
| `HC032` | «Una receta emitida no se modifica: anúlela y emita otra.» |
| `HC033` | «La atención indicada no corresponde a este paciente y a este profesional.» |
| `HC034` | «La receta está anulada.» / «La receta ya no está emitida.» |
| `HC035` | «Solo el profesional que emitió la receta puede anularla o imprimirla.» |
| `HC036` | «La receta que quiere corregir no se puede reemplazar.» |
| `55P03` | «No se pudo emitir la receta ahora. Intente de nuevo.» |
| `42501` | «No tiene acceso a esta historia clínica.» (sin confirmar existencia) |
| `23505` sobre `numero` | «No se pudo emitir la receta ahora. Intente de nuevo.» |
| `HC002`, `HC004` | Los de H6 |
| otros | «No se pudo completar la operación. Intente de nuevo.» |

`HC037` a `HC039` quedan reservados. Un `id` repetido del mismo emisor no es error: devuelve la receta ya emitida (D2).

**Componentes nuevos de interfaz** (a añadir a `docs/DESIGN.md` cuando se aplique este change; este change **no** lo edita):
1. `MedicamentosDelPaciente`: lista de medicamentos vigentes (tarjetas en la historia, tabla en la consulta), con fecha de
   término escrita, emisor, receta de origen, aviso fijo de no detección de interacciones y estado vacío.
2. `FormularioReceta` y `FilaMedicamento`: formulario repetible (agregar y quitar hasta 8) sobre `Campo`, con errores por
   medicamento y por campo, sin vaciar lo escrito.
3. `InsigniaReceta`: estados `emitida` y `anulada` con etiqueta e icono (hoy DESIGN.md solo define estados de cita), con la
   anulada tachada y su motivo.
4. `RecetaImpresa` y el **estilo de impresión**: sección nueva de DESIGN.md (hoja A5, márgenes, tamaños en `pt`, monocromo con
   `ink`/`border`, recuadro de firma y sello, rótulo Original/Duplicado, marca de agua de vista previa).
5. `DialogoConfirmacion` para anular: un botón destructivo para una acción que no es cancelar una cita (DESIGN.md hoy lo limita a
   esa), con el motivo obligatorio.
6. Variantes de `Alerta` para «Esta receta común no sirve para estupefacientes ni psicotrópicos» (`alert-warning`) y «Receta
   anulada» (`alert-error`).

### D11. Pruebas y verificación

- **pgTAP** (sugeridas): **70** catálogo y permiso de recetar; **71** `recetas`, `receta_items` e `impresiones_receta` (estructura con
  `columns_are`, RLS, privilegios, emisión, numeración, inmutabilidad, anulación, impresión); **72** lectura, vista de medicamentos y
  auditoría. Cada una incluye el caso negativo de **cada** rol y profesión: administrativo, médico a cargo, médico sin el
  paciente, médico con asignación vencida o perfil inactivo, psicólogo a cargo (lee, no emite), otras profesiones no
  autorizadas, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad`; más `has_table_privilege` y
  `has_function_privilege` de lo que no se concede. No asumen tablas vacías. `99_rls_en_todas_las_tablas` sigue en verde.
- **Concurrencia** (`tests/concurrencia/25_recetas.test.ts`, dos o más sesiones `pg`): 20 emisiones simultáneas dan 20 números
  consecutivos; una emisión que falla no deja hueco; anulación contra impresión simultáneas; dos impresiones simultáneas dan
  secuencias distintas; el mismo `id` enviado dos veces emite una receta. Repetida 20 rondas seguidas.
- **`node:test`:** esquema Zod (campos obligatorios, invisibles, límites, claves ajenas), vigencia y edad (fechas de Lima, 19:30,
  último día), formato del número, mapeo de errores, orden de sentencias del repositorio con ejecutor simulado (modo → acceso →
  lectura; si el acceso falla no se devuelve nada), acceso único ampliado.
- **E2E (Playwright, datos de demostración):** el médico emite, ve la receta y los medicamentos vigentes; el psicólogo a cargo ve
  los medicamentos y no ve «Emitir receta»; imprimir registra la impresión y rotula Original, la segunda Duplicado; la hoja con el
  contenido máximo ocupa **una** página (`emulateMedia('print')` + `page.pdf()`); anular saca el medicamento de la lista; otro
  médico no anula; administrativo, enfermera y paciente sin acceso; aviso de demostración; **axe** sobre las pantallas.
- **Verificación por mutación** (como en H2 y H6): para cada política, función y disparador nuevo se debilita en un branch de
  desarrollo y se comprueba que alguna prueba negativa falla: ver tarea 8.2.
- Antes de cerrar: agente `code-review` sobre todo el diff, con la lectura más estricta, y corrección de sus hallazgos.

### D12. Contrato con los demás changes

- **H2c.** Se necesitan el tipo `profesion_salud`, `profesion_actual()`, `profesional_actual()`,
  `profesional_tiene_paciente()` y el rol `profesional`; la prueba de «toda profesión tiene decisión» (D1) acopla este change a la
  lista de valores de H2c. H2c reserva `HC010` y `HC011`; este change usa `HC030` a `HC036`.
- **H6.** Necesita de H6: `tipo_acceso` y su restricción (D7), `exigir_modo_clinico()` y `paciente_es_de_demostracion()`, el
  módulo `lib/historias/` y su prueba de acceso único, la guardia y la navegación (`lib/ui/navegacion.ts`: «Recetas» del
  profesional) y el panel de medicamentos en la historia. Aporta a H6: el panel, las etiquetas «Receta» y «Medicamentos» en la
  pantalla de revisión de accesos del administrativo y el cambio de la restricción de `tipo_acceso`.
- **H6g (Psicología).** Consume la vista `medicamentos_vigentes_del_paciente` y el componente `MedicamentosDelPaciente`. **Contrato
  estable:** nombre de la vista y sus columnas (D6). H6g no necesita nada de las tablas. Su suite debe comprobar que el
  psicólogo a cargo la lee y que el resto de profesionales no obtiene de ella información de Psicología.
- **H6d (copia).** Las recetas entran en la copia por **la función de compilación de H6d**, no por una política para el
  administrativo: este change no da lectura de recetas a recepción. Contrato: las columnas de `recetas` y `receta_items` son la
  fuente; se propone incluir las **anuladas marcadas como anuladas** y con su motivo, y la prueba de cobertura de H6d debe
  nombrar `recetas` e `impresiones_receta`. `emitir_receta()` no se invoca desde H6d. El membrete (`establecimiento`) y la
  biblioteca de PDF se coordinan con H6d (D3, D8).
- **H3.** Las columnas de filiación de `pacientes` (ítem 5) pueden cambiar (apellido paterno y materno, documento de pasaporte o
  provisional): la hoja imprime «tipo y número de documento» y une los apellidos tal como los entregue H3.
- **H6b (triaje y derivación).** Solo comparte `registrar_auditoria_sin_contenido()` (D7). Un profesional que «toma» a un
  paciente por derivación obtiene, por la asignación, lectura de sus recetas y medicamentos: es el comportamiento buscado.
- **H2b.** Los componentes de D10 usan `Campo`, `Alerta`, `AtencionFirmada` (como referencia visual) y `ConsolaLayout`.

## Risks / Trade-offs

- [La receta impresa sale del control del sistema: anular no recupera el papel ya entregado y varias copias pueden circular] →
  «Original»/«Duplicado», registro de cada impresión y aviso de qué hacer con una receta anulada; es un límite de la receta
  común sin firma digital ni integración con farmacias, aceptado por el alcance del PRD.
- [Sin catálogo, una marca puede escribirse en «DCI» y un estupefaciente puede ir en receta común] → Advertencia fija, ayuda de
  formulario y decisión abierta sobre el catálogo (D9). No hay detección automática.
- [El turno único de numeración serializa las emisiones] → Sección crítica de milisegundos, `lock_timeout` de 3 s, prueba de
  concurrencia de 20 rondas. Si la clínica creciera en órdenes de magnitud, se pasa a secuencia explicando los huecos (D4).
- [La lista de medicamentos solo conoce recetas emitidas desde el sistema y puede dar una falsa sensación de que está completa] →
  Estado vacío y aviso fijos que lo dicen; la regla de vigencia sobreincluye a propósito.
- [`accesos_historia` y `registrar_auditoria()` son compartidos con H6, H6b, H6d y H6g y las migraciones paralelas se pisan] →
  Este change lee la restricción vigente antes de recrearla y **no** reemplaza `registrar_auditoria()` (D7); queda anotado para
  que el orquestador unifique el mecanismo.
- [Si se autoriza a otra profesión con notas reservadas, `indicaciones` podría filtrar texto de esas notas por la vista] → Hoy solo
  recetan profesiones sin información reservada; la autorización de una profesión nueva pasa por la puerta de revisión de la
  prueba 70 y debe revisar este punto (D6, punto 4).
- [El establecimiento lo aporta la aplicación y un profesional podría falsear el membrete de su propia receta] → Riesgo acotado
  declarado en D3; la alternativa es una tabla de una fila.
- [Los datos de H2c y H6 aún no existen: el diseño depende de su forma final] → Las tareas 0.7 y 0.8 verifican nombres y tipos
  antes de escribir migraciones; las migraciones se numeran después de las suyas.
- [El contenido mínimo de la receta, la vigencia en días y la regla de «vigente» son supuestos] → Marcados `REVISAR` y en
  «Preguntas abiertas»; ninguno se presenta como norma.
- [La impresora de los consultorios no está confirmada] → Tarea 0.4: prueba de impresión real antes de dar por buena la hoja; si no
  hay impresora la métrica de 90 % no se alcanza.
- [Si ADR-0030 se rechaza, los nombres cambian] → Nota de nombres al inicio; solo cambian identificadores.

## Migration Plan

1. Grupo 0: confirmaciones (profesiones que recetan, contenido de la receta, formato de papel e impresora, datos del
   establecimiento, fuente de medicamentos), ADR y coordinación con H2c, H6, H6d y H6g; decisiones documentadas antes de código.
2. Migraciones nuevas, **posteriores a las de H2c y H6** y en este orden, cada una con su prueba: `profesiones-que-recetan` (tabla,
   semilla y `profesional_puede_recetar()`) → `recetas-tablas` (tipo, tres tablas, `texto_receta_valido()`) → `recetas-integridad`
   (huella, disparadores de inmutabilidad) → `recetas-funciones` (`insertar_receta`, `emitir_receta`, `anular_receta`,
   `registrar_impresion_receta`, guarda de modo) → `recetas-lectura` (políticas, `GRANT` y vista) → `accesos-historia-recetas`
   (tipos de acceso y `receta_id`) → `recetas-auditoria` (disparadores de `registrar_auditoria_sin_contenido()`). Nunca se edita una
   migración aplicada.
3. Suite pgTAP, concurrencia e integración completas en un branch de desarrollo; PR con branch efímero y los mismos pasos.
4. Aplicación: primero lógica y repositorio, luego pantallas cuando H2b esté aplicado.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones; el modo de datos sigue en `demostracion` y las variables
   `RECETA_*` se definen en Production y Preview de Vercel (con valores ficticios mientras P-1 siga abierta). Sembrar recetas de
   demostración en producción es una acción explícita del usuario.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027). Un defecto se corrige con una migración nueva; está prohibido restaurar
   el branch principal de Neon. La emisión se detiene con la migración de interruptor de D1 o con `CLINICA_MODO_DATOS` distinto del
   modo de la base (falla cerrado).

## Open Questions

Las dos primeras bloquean la puesta en uso, no el diseño ni las especificaciones; el resto se responde durante la
implementación.

1. **Qué profesiones pueden recetar.** Médico sí y psicólogo no (confirmado por el usuario); odontólogo, fisioterapeuta y podólogo
   **por confirmar** con la clínica y el asesor. Mientras no se confirmen quedan en «no».
2. **Contenido mínimo de la receta (DS 014-2011-SA, art. 56, solo por Saniape).** Validar con el asesor: campos exigidos,
   si «dosis por día» necesita campo propio, plazo de validez de la receta, si se imprime el diagnóstico, si se exige cantidad
   total, la edad en meses para menores de dos años y el trato de la reimpresión (Original/Duplicado).
3. **Regla de «medicamento vigente».** ¿Un día de margen? ¿Qué pasa con tratamientos de uso continuo sin duración fija o con la
   suspensión de un medicamento antes de su término? ¿Se muestran los terminados hace pocos días? Hoy: duración obligatoria,
   renovación con receta nueva y historial completo en la lista de recetas.
4. **Catálogo de medicamentos (PNUME/DIGEMID).** Recomendación: B ahora, C como change aparte (D9). Decide el usuario.
5. **Estupefacientes y psicotrópicos en una receta común.** ¿Basta la advertencia fija o se quiere un catálogo que los detecte y
   bloquee? Para el asesor: qué exige la norma.
6. **Formato de papel e impresora** del consultorio (A5, media hoja A4) y si el PRD acepta que sin impresora la métrica de 90 % no
   se puede medir.
7. **Datos del establecimiento y su fuente.** Valores reales (razón social, RUC, dirección, teléfono, lugar de emisión) por
   pedir a la clínica; ¿variables de entorno o tabla de una fila compartida con H6d?
8. **Quién puede anular y con qué efecto sobre el papel.** Hoy solo el emisor, mientras tenga al paciente a cargo. ¿Debe otro
   profesional o la dirección clínica poder anular? ¿Qué se le indica al paciente que ya recibió el papel?
9. **Visibilidad de la receta completa.** Hoy todo profesional a cargo lee las recetas completas de sus colegas (historia
   compartida, coherente con ADR-0031). Si se prefiere que solo el emisor la vea completa y los demás únicamente la lista de
   medicamentos, la política de lectura se estrecha y la vista pasa a una función `SECURITY DEFINER` (D6).
10. **Recetas en la copia de la historia (H6d).** ¿Entran las anuladas? ¿Con el motivo de anulación?
11. **Retención y marco legal (P-1).** Plazo de conservación de las recetas como parte de la historia; mientras no se cierre, solo
    datos de demostración.
12. **Ideas no pedidas, no incluidas.** Mostrar las alergias registradas (antecedentes de tipo alérgico) junto al formulario;
    «renovar» una receta anterior copiando sus medicamentos; un código corto de verificación impreso; suspender un medicamento.
    Se proponen solo como candidatas para una versión posterior.
