# Design

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_actual()`, `profesional_tiene_paciente()`,
> `atenciones.profesional_id` y `app/profesional/**`; si la ADR se rechaza, léase `medico`/`medicos`, `medico_actual()`,
> `medico_tiene_paciente()`, `atenciones.medico_id` y `app/medico/**`. La regla «solo un odontólogo escribe» necesita el atributo
> `profesion` de H2c: con la alternativa «mantener `medicos` y añadir `profesion`» el diseño no cambia.

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (cuatro capacidades). Estado de partida, verificado
en el repositorio (migraciones de H2) y en los changes vecinos (aún sin aplicar):

- **Atención clínica (H2, en producción):** `atenciones` tiene `id` como única clave (sin `unique (id, paciente_id)`),
  `paciente_id` denormalizado para RLS, `firmada_en` y cuatro textos obligatorios con contenido; su política de `UPDATE` exige
  autor, atención sin firmar y paciente a cargo, y un disparador de H2 la vuelve inmutable al firmar. Ninguna tabla clínica
  admite `DELETE`. `registrar_auditoria()` lee la columna `id` (`to_jsonb(new) ->> 'id'`), así que toda tabla auditada necesita
  una. `especialidades` solo tiene `id` y `nombre` único.
- **H6 `historias-clinicas` (sin aplicar):** `plantillas_clinicas` y las columnas `atenciones.plantilla_id` y
  `datos_especialidad` (ADR-0029; tipos `texto`, `entero`, `decimal`, `opcion`, `si_no` y `fecha`; el validador reconstruye el
  objeto con solo las claves definidas y SQLSTATE `HC005`); sello del servidor y huella `v1:` de la atención, que cubre
  `plantilla_id` y `datos_especialidad` pero **no** tablas hijas; `adjuntos_historia` **solo PDF** (D7); la guarda de datos reales
  (`exigir_paciente_admisible()` con `HC002`, `exigir_modo_clinico()` con `HC004`); la lectura atómica con registro en
  `accesos_historia` (D2) y la regla de que el SQL clínico vive en un módulo único.
- **H2c `profesionales-de-la-salud` (sin aplicar):** `profesion_actual()` (único punto de lectura de la profesión del usuario),
  `profesional_tiene_paciente()` y el valor `odontologo` de `profesion_salud`. Deja abierta a los changes de especialidad la
  compatibilidad profesión–especialidad («hoy `especialidad_id` es libre»).
- **H6b `triaje-y-derivacion` (sin aplicar):** `registrar_auditoria_sin_contenido()`, función de disparador que registra actor,
  rol, acción, tabla e id sin copiar la fila.
- **H6d `copia-de-historia-clinica` (sin aplicar):** `compilar_copia_historia()` entrega la historia completa al servidor;
  **cada tabla clínica nueva se clasifica y aporta su sección**, y la prueba de cobertura (tarea 3.4 de H6d) falla si una tabla
  de `public` no está en el compilado ni en su lista de exclusiones con razón.
- **Imágenes (P-15, TECH-DESIGN):** el diseño de adjuntos de H6 es solo PDF; admitir imágenes es **decisión abierta del usuario**.
- **Norma (NTS 188):** la que rige el odontograma **no se verificó** (PRD y `docs/investigacion-marco-legal-y-saniape.md`, que
  verificó la NTS 139, el DS 009-2017-SA y la Directiva 373, pero no esta). No se cita su contenido.
- **Interfaz:** `docs/DESIGN.md` no tiene un componente de odontograma. Los colores salen solo de sus tokens (`npm run
  tema:comprobar` falla con colores literales) y el estado nunca se comunica solo con color.
- **Plan de TECH-DESIGN:** anota H6e como dependiente de H6i. Este change no usa planes de sesiones ni instrumentos con puntaje
  (D6): la dependencia sobra.

## Goals / Non-Goals

**Goals:**
- Que el odontólogo registre el odontograma por pieza y cara (FDI, dentición adulta, infantil o mixta) con hallazgos y
  tratamientos del catálogo, y que **cualquier profesional a cargo** vea su estado actual.
- Que la lectura y la escritura se impongan **en la base de datos**: lo lee todo profesional a cargo, lo escribe solo un
  odontólogo (`profesion_actual()`), autor de la atención y solo mientras no esté firmada, con casos negativos por rol y por
  profesión.
- Que lo firmado sea inmutable y detectable si se altera (sello propio), y que una corrección sea siempre un registro nuevo con
  su autoría, nunca la edición de lo firmado.
- Que no haya pérdida de actualizaciones cuando dos borradores del mismo paciente se firman en orden distinto al de creación.
- Que la copia de la historia incluya el odontograma sin que el administrativo lo lea por ninguna otra vía.
- Que lo que no viene del PRD (catálogos, plantilla, símbolos) quede marcado como propuesta y sea corregible por migración.

**Non-Goals:**
- Resolver P-1, P-5 o P-15; declarar validez legal; verificar o reproducir la NTS 188; diseñar el almacenamiento de imágenes.
- Presupuestos, cuotas, cobros o facturación de tratamientos; receta; consentimiento informado; periodontograma, ortodoncia,
  cefalometría o implantología más allá de lo que el PRD enumera; lectura de radiografías por IA; acceso del paciente.
- Modificar las políticas de H2 o H6, el validador de plantillas, el sello de `atenciones` o la huella `v1` de la atención.
- Planes de sesiones o instrumentos con puntaje (H6i).

## Decisions

### D1. El estado del odontograma vive en tablas propias, no en un `jsonb` de `datos_especialidad`

**Decisión.** Cada atención odontológica guarda **un registro por pieza y cara** en `odontograma_registros` (D2). Los registros
son editables mientras la atención es un borrador; al firmarla quedan **inmutables y sellados** (D10). El **odontograma actual no
se guarda: se deriva** de lo último firmado en cada pieza y cara (D3), y puede pedirse «a una fecha».

**«Instantánea al firmar» significa esto:** lo que la atención registró queda congelado y verificable en el momento de la
firma. No significa que cada atención repita el odontograma completo (ver alternativa C).

| | **A. Tablas: un registro por pieza y cara y atención (elegida)** | B. `jsonb` en `datos_especialidad` | C. Instantánea completa por atención, con arrastre | D. EAV genérico |
|---|---|---|---|---|
| Encaje con ADR-0029 | Sí: es el caso «donde la plantilla no basta → tablas propias» que TECH-DESIGN prevé | Obliga a ampliar el subconjunto de tipos con arreglos u objetos, que la ADR dejó fuera a propósito (aceptada) | Igual que A | Una tabla clínica más sin ventaja |
| Validación en la base | Declarativa: `CHECK` de pieza FDI, enum de caras, `FOREIGN KEY` al catálogo, `UNIQUE (atención, pieza, cara)` | Un validador SQL sobre `jsonb` anidado, sin llave foránea al catálogo | Igual que A | Valores como texto: sin tipos ni llaves |
| Odontograma actual | Consulta relacional indexada (D3) | Recorrer el `jsonb` de varias atenciones con SQL dinámico | Se toma la última atención (simple) | Pesada |
| Pérdida de actualizaciones | No: cada registro toca solo su pieza y cara | No | **Sí** (ver abajo) | No |
| Quién registró cada hallazgo | Cada fila pertenece a su atención y a su autor | Ídem | Se pierde: un hallazgo arrastrado figura firmado por quien no lo observó | Ídem A |
| Huella de la atención | **No la cubre**: sello propio y declaración sellada en la atención (D10) | La cubre desde `v1`, sin código | No la cubre | No la cubre |
| Costo | Cinco tablas con RLS, pruebas negativas, auditoría y sección de la copia | Ninguna tabla nueva | Cuatro tablas | Dos tablas |

**Por qué no C (instantánea completa con arrastre).** Parece lo más natural (cada consulta muestra la boca entera), pero abre
una **pérdida de actualizaciones**: el odontólogo A abre un borrador a las 9:00 desde el estado S0; el odontólogo B abre otro a las
9:05 desde S0; A firma a las 9:30 con un hallazgo nuevo en la pieza 16; B firma a las 9:40 sin haberlo visto. El «actual» sería el
de B, **sin el hallazgo de A**, y nada en la base lo impide. Con A, B solo reemplaza lo que él mismo registró. C además atribuye
a quien firma lo que solo arrastró, y obliga a probar en la base que el arrastre fue fiel.

**Por qué no B (`jsonb`).** Es la alternativa más barata y la única que entra gratis en la huella de la atención. Se descarta
porque (1) el validador de la ADR-0029 no tiene arreglos ni objetos: habría que reabrir una ADR aceptada; (2) no hay llave foránea
a un catálogo, así que un hallazgo inexistente se detectaría solo con código; (3) derivar el estado actual exige recorrer
`jsonb` de varias atenciones; (4) 52 piezas × 6 posiciones por atención en un único `jsonb` hacen ilegible cualquier consulta
clínica. Lo que se pierde (la huella gratuita) se recupera con D10.

**Límite que se declara.** Con A, un `UPDATE` hecho por el dueño de la base sobre un registro firmado no cambia la huella de la
atención; lo detecta el sello propio (D10) y la declaración sellada `registra_seccion_odontologica`.

### D2. Piezas FDI, caras y las cinco tablas

**Piezas.** Numeración FDI de dos dígitos. Dentición adulta (permanente): cuadrantes 1 a 4, posiciones 1 a 8 (11–18, 21–28,
31–38, 41–48). Dentición infantil (temporal): cuadrantes 5 a 8, posiciones 1 a 5 (51–55, 61–65, 71–75, 81–85). Una función
`pieza_fdi_valida(smallint)` (`IMMUTABLE`) decide la validez y `denticion_de_pieza(smallint)` devuelve `adulta` o `infantil`. **No
hay tabla de piezas**: los 52 códigos son un estándar fijo, los nombres («primer molar superior derecho») los genera
`lib/odontologia/piezas.ts`, y una tabla más solo añadiría otra superficie con RLS y pruebas sin cambiar ningún resultado.
*Alternativa descartada:* tabla `piezas_dentales` de 52 filas con nombres: más llaves foráneas y una tabla clínicamente inerte que
blindar.

**Caras.** Tipo `cara_dental`: `vestibular`, `lingual_palatina` (lingual en el arco inferior, palatina en el superior), `mesial`,
`distal`, `oclusal_incisal` (oclusal en premolares y molares, incisal en incisivos y caninos) y `completa` (toda la pieza).
<!-- REVISAR: ¿los odontólogos necesitan más posiciones (cervical, raíz) o una distinción que este modelo junta? Se añade con un `alter type … add value` revisado. -->

**Tablas** (todas en `public`, RLS activada; columnas y reglas):

| Tabla | Contenido | Claves y reglas |
|---|---|---|
| `odontogramas` | La sección odontológica de **una** atención: `id`, `atencion_id` (única, → `atenciones`), `paciente_id`, `denticion` (`adulta`, `infantil`, `mixta`), `huella`, `sellado_en`, `creado_en` | Existe solo si la atención declara que registra la sección (D8); `huella` y `sellado_en` se llenan al firmar (D10) y van juntos o ninguno |
| `odontograma_registros` | **Un hallazgo por pieza y cara en una atención**: `id`, `atencion_id` (→ `odontogramas`), `paciente_id`, `pieza`, `cara`, `hallazgo_id` (→ catálogo), `detalle` (opcional, ≤ 500, con contenido) | `UNIQUE (atencion_id, pieza, cara)`; `pieza_fdi_valida(pieza)`; alcance del hallazgo contra la cara (D5) |
| `odontograma_tratamientos` | Tratamiento por pieza: `id`, `atencion_id`, `paciente_id`, `pieza`, `cara`, `tratamiento_id` (→ catálogo), `estado` (`indicado`/`realizado`), `indicacion_origen_id` (→ la propia tabla), `detalle` | Sin precios ni totales (D6); varios por pieza |
| `radiografias_odontologicas` | `id`, `atencion_id`, `paciente_id`, `adjunto_id` (única, → `adjuntos_historia`), `tipo`, `piezas smallint[]`, `fecha_toma`, `nota` | D7 |
| `catalogo_odontologico` | Hallazgos y tratamientos: `id`, `tipo`, `codigo`, `nombre`, `alcance`, `requiere_detalle`, `reemplaza_caras`, `vigente` | `UNIQUE (tipo, codigo)`; D5 |

**Identificadores de paciente.** `paciente_id` está denormalizado para que la política sea simple (como en H2). Lo fija un
disparador `BEFORE INSERT` a partir de la atención y **ningún rol de usuario puede enviarlo ni cambiarlo** (no está en el `GRANT`
de columnas). Así no puede haber un registro «de la atención A pero protegido como del paciente B». Se descartó la llave foránea
compuesta `(atencion_id, paciente_id)` porque exige añadir una restricción a `atenciones` (tabla de H6) que otros changes de
especialidad querrían duplicar.

**Orden de los disparadores.** PostgreSQL ejecuta los de un mismo evento en orden alfabético, y el de datos reales de H6 lee
`paciente_id`. Los nombres llevan prefijos numéricos que fijan el orden: `odontologia_10_completar` (identidad), `_20_proteger`
(profesión, autoría, atención sin firmar), `_30_validar` (reglas de D3 a D7), `_40_modo` (guarda de datos reales). Una prueba lee
`pg_trigger` y falla si el orden cambia.

### D3. Cada registro es el cambio de una atención; el «odontograma actual» se deriva de lo último firmado

Por cada pieza y cara, el estado actual es **el registro firmado más reciente** (por `atenciones.firmada_en`, y `atencion_id` como
desempate). Los borradores no cuentan. Sin registro firmado, la celda es «sin registro»: no es lo mismo que «sana» (ver
`sin_hallazgo` en D5).

**Piezas con hallazgo que reemplaza caras.** Un hallazgo de pieza completa como `ausente`, `corona` o `implante` hace obsoletos los
de cara anteriores. Se resuelve con la bandera `reemplaza_caras` del catálogo:
- **Al escribir:** en una misma atención, una pieza con un registro `completa` cuyo hallazgo reemplaza caras **no** admite
  registros por cara (`HC054`).
- **Al derivar:** de la pieza se descartan los registros por cara firmados **antes** del último registro `completa` que reemplaza
  caras.

```sql
-- función odontograma_actual(p_paciente uuid, p_hasta timestamptz default null), SECURITY INVOKER, search_path vacío
with firmados as (
  select r.*, a.firmada_en, a.profesional_id as autor
  from public.odontograma_registros r
  join public.atenciones a on a.id = r.atencion_id
  where r.paciente_id = p_paciente and a.firmada_en is not null
    and (p_hasta is null or a.firmada_en <= p_hasta)
), corte as (            -- último registro de pieza completa que reemplaza caras
  select f.pieza, max(f.firmada_en) as hasta
  from firmados f join public.catalogo_odontologico c on c.id = f.hallazgo_id
  where f.cara = 'completa' and c.reemplaza_caras group by f.pieza
)
select distinct on (f.pieza, f.cara) f.*      -- + nombre del hallazgo, atención de origen y autor
from firmados f left join corte k using (pieza)
where f.cara = 'completa' or k.hasta is null or f.firmada_en > k.hasta
order by f.pieza, f.cara, f.firmada_en desc, f.atencion_id desc;
```

- **`SECURITY INVOKER`:** la lectura pasa por las políticas de D9, así que quien no tiene al paciente a cargo recibe **cero filas**
  (sin error ni indicio de que exista). No hay una tabla de «estado actual» que mantener ni que pueda divergir.
- **«A una fecha»:** el parámetro `p_hasta` devuelve el odontograma tal como estaba tras la última atención firmada hasta
  entonces (útil para la copia y para revisar una consulta pasada).
- **Procedencia:** cada celda devuelve la atención de origen, la fecha y el autor; la pantalla enlaza a ella y avisa si esa
  atención tiene addendas (D10).
- **Índice:** `(paciente_id, pieza, cara, atencion_id)`. El volumen es pequeño (tres odontólogos, miles de filas); la tarea 5.2 mide
  con `EXPLAIN ANALYZE` y solo entonces se añade algo más.
- **Limitación declarada: gana la última firma, no la última observación.** Si dos borradores tocan la misma pieza y cara, el
  que se firma después define el estado, aunque se haya creado antes. Ambos registros se conservan, y la pantalla muestra la
  atención de origen. <!-- REVISAR con los odontólogos: ¿basta, o debe ganar la fecha clínica de la consulta? Cambiarlo exige una columna de fecha clínica y reordenar la consulta. -->

*Alternativas descartadas:* (a) tabla de «estado actual» actualizada por un disparador al firmar: dos fuentes de verdad que
pueden divergir y otra tabla clínica con RLS; (b) vista materializada: se desfasa entre refrescos; (c) la última atención con
odontograma como «actual» (alternativa C de D1): pérdida de actualizaciones.

### D4. Dentición adulta, infantil y mixta

- **La numeración FDI ya distingue las dos denticiones**: un código pertenece sin ambigüedad a una de ellas. Por eso una sola
  tabla de registros sirve para las tres, y **la dentición mixta no necesita una estructura propia**.
- **La atención declara su dentición** (`odontogramas.denticion`): `adulta` admite solo piezas 11–48, `infantil` solo 51–85 y
  `mixta` ambas. La base rechaza cualquier registro, tratamiento o radiografía con una pieza que no corresponde (`HC053`); cambiar
  la dentición de un borrador revalida lo ya registrado, y la firma lo comprueba de nuevo.
- **En dentición mixta conviven dos juegos en la misma posición del arco** (por ejemplo, el segundo molar temporal 55 y el
  premolar 15 que aún no ha salido): son dos piezas con registros independientes. Cuando una pieza temporal cae y la definitiva
  ocupa su lugar, se registra la temporal como `ausente` y la definitiva con sus hallazgos; **no hay vínculo automático** entre
  ambas (la erupción no es una regla que la base deba adivinar).
- **El odontograma actual no mira la dentición declarada de cada atención**: junta las piezas de todas las atenciones. Así un
  niño atendido a los cinco años (infantil), a los ocho (mixta) y a los quince (adulta) tiene un único historial continuo.
- **La dentición no se infiere de la edad.** La pantalla propone la de la última atención firmada y, en la primera, deja que el
  odontólogo elija; no se fija ninguna edad de corte (sería una regla clínica no verificada).

*Alternativas descartadas:* (a) **dos odontogramas separados** (uno por dentición): un niño de ocho años tiene piezas de ambos y
quedaría con dos cuadros que reconciliar; (b) **dentición como atributo del paciente**: cambia con el tiempo y no cabe en una
atención firmada; (c) **inferirla de la fecha de nacimiento**: depende de umbrales clínicos que no se verificaron; (d) **marcar
cada pieza con su dentición en una columna**: redundante, la deduce `denticion_de_pieza()`.

### D5. Catálogos de hallazgos y de tratamientos: migración, propuesta `REVISAR`

**Decisión.** `catalogo_odontologico` contiene hallazgos y tratamientos (`tipo`) con su `alcance` (`pieza`, `cara`, `ambos`), si
`requiere_detalle` y, solo en hallazgos, `reemplaza_caras`. Se carga **por migración de datos idempotente** (`on conflict
(tipo, codigo) do nothing`); ningún rol de usuario escribe. Lo lee todo profesional (necesita las etiquetas al ver un
odontograma ajeno) y nadie más. Una entrada se **retira** con `vigente = false`, nunca se borra (los registros firmados la
referencian); su significado (`tipo`, `codigo`, `alcance`, `reemplaza_caras`, `requiere_detalle`) **no se redefine** (un
disparador lo rechaza incluso al dueño) porque cambiaría el sentido de lo ya firmado; solo `nombre` y `vigente` pueden corregirse
por migración.

**Contenido inicial: propuesta de ingeniería, no de la norma.** El PRD no enumera hallazgos ni tratamientos, y la NTS 188 no se
verificó, así que **toda esta lista es `REVISAR`** y se contrasta con los odontólogos de la clínica y con el texto oficial antes de
fijar la migración (tareas 0.3 y 0.4). Se propone un conjunto mínimo y una salida `otro` con detalle obligatorio, para no
bloquear al clínico ni inventar un catálogo exhaustivo:

| Hallazgo (`codigo`) | Alcance | Reemplaza caras | Notas |
|---|---|---|---|
| `sin_hallazgo` | ambos | sí | Examinado sin hallazgo, o corrección de un registro previo. En `completa` reinicia la pieza |
| `caries`, `restauracion`, `sellante`, `desgaste` | cara | no | |
| `fractura` | ambos | no | |
| `movilidad` | pieza | no | El grado, si se quiere, va en el detalle |
| `tratamiento_de_conducto` | pieza | no | |
| `corona`, `implante`, `remanente_radicular`, `no_erupcionada`, `ausente` | pieza | sí | La causa de la ausencia, si se quiere, va en el detalle |
| `otro` | ambos | no | **Detalle obligatorio** |

| Tratamiento (`codigo`) | Alcance | Notas |
|---|---|---|
| `restauracion`, `sellante` | cara | |
| `exodoncia`, `tratamiento_de_conducto`, `corona` | pieza | |
| `aplicacion_de_fluor` | ambos | |
| `otro` | ambos | **Detalle obligatorio** |

<!-- REVISAR: lista de partida de ingeniería, sin validar. No reproduce ni se apoya en la NTS 188 (no verificada); las banderas `reemplaza_caras` y el alcance son supuestos clínicos del agente. La migración lleva este aviso en su encabezado. -->

**Qué se valida.** Un registro solo puede usar una entrada **vigente** del tipo correcto (`HC054` si es otro tipo, está retirada o
no existe); `alcance = pieza` exige `cara = completa`, `alcance = cara` la prohíbe y `ambos` admite las dos; `requiere_detalle`
exige un `detalle` con contenido. Un hallazgo **no es un diagnóstico**: los diagnósticos CIE-10 siguen en la atención (H6) y este
change no los relaciona con el catálogo.

*Alternativas descartadas:* (a) **hallazgos como `enum`**: añadir uno es un `alter type`, y los odontólogos validarán la lista;
(b) **texto libre por pieza**: no se consulta ni se valida; (c) **dos tablas de catálogo**: duplica RLS y pruebas por una
distinción que `tipo` ya hace; (d) **catálogo editable por el administrativo**: cambiar el sentido de lo firmado sin revisión.

### D6. Tratamientos por pieza: indicado y realizado, sin dinero

`odontograma_tratamientos` registra, por atención, un tratamiento sobre una pieza (y una cara o la pieza completa) como
`indicado` (plan) o `realizado`. Un `realizado` puede apuntar con `indicacion_origen_id` a la indicación que cumple, y un
disparador exige que ese origen sea **del mismo paciente, pieza, cara y tratamiento, `indicado`, de una atención firmada distinta
de la actual y aún no cumplido** (`HC055`); un índice único parcial lo respalda. Lo **pendiente** se deriva: las indicaciones
firmadas que ningún `realizado` firmado cumple (`tratamientos_odontologicos_pendientes(paciente)`, `SECURITY INVOKER`).

- **Registrar un tratamiento no cambia el odontograma**: la base no sabe qué hallazgo resulta de qué tratamiento (sería inventar
  clínica). La pantalla ofrece, al marcar un tratamiento como realizado, registrar el hallazgo resultante; el odontólogo decide.
- **Sin dinero:** la tabla no tiene precio, descuento, moneda, cuota, saldo ni estado de pago, y una prueba fija la lista exacta de
  columnas (`columns_are`), de modo que añadir una obliga a revisar. Presupuestos, cuotas y cobros están fuera del alcance del PRD.
- **Sin sesiones:** un tratamiento que lleva varias visitas se registra por atención; los planes de sesiones son de H6i y no se
  usan aquí.
- **Fuera de este change:** una indicación descartada o vencida no tiene estado propio (pregunta abierta); y la receta, si el
  odontólogo puede emitirla, es de `recetas-medicas` (H6c): un tratamiento nunca registra medicamentos.

*Alternativas descartadas:* (a) **un solo estado con fecha de realización**: no distingue lo indicado de lo hecho en otra
atención por otro odontólogo; (b) **un plan de tratamiento como cabecera con precio**: es presupuesto; fuera de alcance; (c)
**actualizar el estado de la fila indicada al realizarla**: modifica un registro firmado.

### D7. Radiografías como adjuntos de imagen: dependencia de P-15, sin diseñar el almacenamiento

**Decisión.** `radiografias_odontologicas` guarda **solo el metadato clínico** de la radiografía (`tipo`: `periapical`,
`aleta_de_mordida`, `panoramica`, `oclusal`, `otra`; `piezas` involucradas, vacío si abarca todo; `fecha_toma`; `nota`) y apunta
a un **adjunto** (`adjunto_id` → `adjuntos_historia`). El archivo, su formato, su tamaño y su almacenamiento **no se tocan aquí**.
<!-- REVISAR: los tipos de radiografía son los genéricos de la práctica odontológica, sin validar con los odontólogos ni con la NTS 188. -->

**Contrato del «adjunto de imagen» que este change necesita** (y nada más):
1. Una fila legible solo con las mismas reglas que `atenciones` (profesional a cargo), de la que depende el acceso al archivo.
2. Pertenece a un paciente, tiene autor, puede **anularse** (nunca borrarse) y su descarga se audita con el tipo `adjunto` de H6.
3. Un identificador estable. La clave de almacenamiento es opaca y no la ve este change.

**Coherencia que sí impone este change** (`_30_validar`, `HC056`): el adjunto es del **mismo paciente**, está **vigente**, lo
**subió el mismo odontólogo** que vincula y no está ya vinculado a otra radiografía. La `fecha_toma` no es futura (hora de Lima) y
cada pieza listada es FDI válida y compatible con la dentición (`HC053`). Anular después el adjunto no borra la radiografía: el
registro clínico conserva su metadato y la pantalla dice «archivo anulado».

**Qué pasa según se resuelva P-15** (decisión abierta del usuario; TECH-DESIGN la lista como «medio»):

| Resolución | Efecto en este change |
|---|---|
| **No se admiten imágenes** | La radiografía se vincula a un **PDF** (lo único que `adjuntos_historia` admite hoy). Todo funciona sin cambios |
| **Se admiten imágenes en `adjuntos_historia`** (se amplía D7 de H6 y ADR-0024) | El mismo modelo vale sin migración: cambia lo que el adjunto acepta |
| **Se crea una tabla aparte de imágenes** | Una migración nueva repunta `adjunto_id` a la tabla de imágenes; es el caso de mayor costo y se decide en P-15 |

Hasta que se decida, **la parte de imágenes de H6e no cierra** (TECH-DESIGN, P-15) y las pruebas de este change usan PDF.

*Alternativas descartadas:* (a) **guardar la imagen en esta tabla**: diseñaría el almacenamiento que el usuario no autorizó y
duplicaría la RLS, la auditoría de descarga y la anulación de H6; (b) **un `adjunto_id` polimórfico** (a dos tablas): sin llave
foránea real; (c) **sin tabla de metadatos** (la radiografía es solo un adjunto): pierde tipo, piezas y fecha de toma, que son
clínicos.

### D8. Plantilla de Odontología (ADR-0029) y quién puede usarla

**Plantilla `Odontología` v1**, por migración de datos idempotente (crea la especialidad «Odontología» si falta, como hace la
siembra) y con `exige_profesion = 'odontologo'` (ver abajo). Tres campos, deliberadamente pocos, porque el PRD no define el resto de la atención:

| Clave | Tipo | Obligatorio | Para qué |
|---|---|---|---|
| `registra_seccion_odontologica` | `si_no` | **Sí** | Declara si esta atención registra odontograma, tratamientos o radiografías (D10) |
| `observaciones_odontologicas` | `texto` (≤ 2000) | No | Observaciones del examen estomatológico que el texto genérico no cubre |
| `proxima_cita` | `fecha` | No | Igual que en la plantilla de Medicina general |

<!-- REVISAR: los campos son una propuesta mínima. No se copia `tiempo_enfermedad` de Medicina general porque no se verificó que la NTS 139 (5.2.1) lo exija en Odontología; el motivo de consulta y la anamnesis genéricos lo cubren. Validar con los odontólogos. Verificar al aplicar (tarea 0.6) que el tipo `si_no` del validador de H6 guarda un booleano JSON. -->

Las atenciones siguen exigiendo los campos genéricos de H6 (motivo, anamnesis, examen físico, diagnósticos CIE-10, plan); para
Odontología, el «examen físico» es el examen estomatológico.

**Quién puede usar la plantilla (regla común, D15 de `historias-clinicas`).** `especialidad_id` es libre en `profesionales`
(pregunta abierta de H2c), así que la especialidad del autor no basta para saber quién puede usar la plantilla. La regla «solo un
profesional de la profesión X usa la plantilla de X» la impone `historias-clinicas` (D15) para todas las especialidades, con la
columna `plantillas_clinicas.exige_profesion` (tipo `profesion_salud`; nula = cualquiera) dentro del disparador de validación de
`atenciones` que ya existe (`HC005`). Este change **solo fija el dato**: la plantilla v1 se inserta con
`exige_profesion = 'odontologo'` en su migración de datos, y **no crea un disparador propio sobre `atenciones` ni un código de
error propio para eso**. Así, aunque un médico quedara mal registrado en Odontología, no podría guardar una atención con esta
plantilla ni, por tanto, abrir su sección (que exige la plantilla, `HC051`). No se exige lo inverso (un odontólogo puede registrar
una atención genérica sin plantilla). La compatibilidad en `profesionales` (impedir un odontólogo en otra especialidad) **no** se
impone aquí: es de H2c y de la pantalla de alta (H3); el fallo es cerrado. La escritura en las tablas de la sección conserva su
propia barrera de profesión (D9, `HC050`), que es otra regla: quién escribe en esas tablas, no quién usa la plantilla.

*Alternativas descartadas:* (a) **exigir plantilla a todo odontólogo**: invento de proceso; una urgencia sin odontograma sería
imposible; (b) **identificar la especialidad por nombre en cada disparador**: se centraliza en `especialidad_odontologia_id()`;
(c) **un disparador propio de Odontología sobre `atenciones` para la profesión**: repetiría en cada especialidad una regla que es
común y que `historias-clinicas` mantiene en un solo lugar; (d) **restringir solo por política RLS de las tablas**: no cubriría el
uso de la plantilla en `datos_especialidad`.

### D9. Quién lee y quién escribe: RLS por rol y por profesión

| Rol / profesión | Lee las cuatro tablas clínicas | Escribe |
|---|---|---|
| **Odontólogo a cargo del paciente, autor de la atención sin firmar** | Sí | **Sí** (solo en esa atención) |
| Odontólogo a cargo, no autor | Sí | No (atención ajena: `HC051`) |
| Odontólogo sin el paciente a cargo, con asignación vencida o perfil inactivo | No (cero filas) | No |
| Médico, fisioterapeuta, psicólogo o podólogo a cargo | **Sí** (la historia es compartida; ADR-0031 no restringe Odontología) | **No** (`HC050`) |
| Administrativo | No | No |
| Enfermera | No | No |
| Paciente (incluido el titular) | No | No |
| Sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` | Sin `GRANT` | Sin `GRANT` |

- **Catálogo:** `SELECT` solo para `rol_actual() = 'profesional'`; ninguno escribe.
- **Políticas (cuatro tablas):** `SELECT` con `rol_actual() = 'profesional' and profesional_tiene_paciente(paciente_id)` (idéntico a
  `atenciones`, así que la visibilidad de borradores de otros profesionales sigue la de H6); `INSERT`, `UPDATE` y `DELETE` añaden
  `profesion_actual() = 'odontologo'` y que la atención sea propia y esté sin firmar. Se usa `(select …)` para forzar `InitPlan`.
- **`GRANT` por columna** (los nombres sin permiso no pueden enviarse): `odontogramas` inserta `(atencion_id, denticion)` y actualiza
  `(denticion)`; `odontograma_registros` inserta `(atencion_id, pieza, cara, hallazgo_id, detalle)` y actualiza `(hallazgo_id,
  detalle)`; `odontograma_tratamientos` inserta `(atencion_id, pieza, cara, tratamiento_id, estado, indicacion_origen_id, detalle)`
  y actualiza `(tratamiento_id, detalle)`; `radiografias_odontologicas` inserta `(atencion_id, adjunto_id, tipo, piezas,
  fecha_toma, nota)` y actualiza `(tipo, piezas, fecha_toma, nota)`. `paciente_id`, `huella`, `sellado_en`, `id` y `creado_en`
  quedan fuera.
- **`DELETE`:** se concede **solo sobre filas de una atención sin firmar** (política y disparador), porque corregir un borrador
  exige quitar un registro mal puesto. Es distinto de `atenciones`, que nunca se borra, y queda auditado. Con la atención firmada,
  nadie borra ni actualiza, ni el dueño (D10).
- **Dos barreras independientes para la profesión** (cada una se prueba y se muta por separado): la política (`42501`) y el
  disparador `_20_proteger` (`HC050`).
- **Criterio de «sesión de usuario» en los disparadores.** Los disparadores son `SECURITY DEFINER` y no pueden leer
  `current_user` del invocante (a diferencia de los de H6 D5). Las reglas de **profesión y autoría** se aplican cuando la sesión
  trae contexto de usuario (`rol_actual()` no nulo); las migraciones y la siembra del dueño no lo traen, y pueden poblar una
  atención en borrador. La regla **«atención sin firmar»** se aplica a todos, incluido el dueño.

### D10. Inmutabilidad al firmar, sello del odontograma y correcciones por addenda

**Inmutabilidad.** Mientras la atención no está firmada, su autor edita la sección. Al firmarla, `_20_proteger` rechaza todo
`INSERT`, `UPDATE` y `DELETE` sobre los registros, tratamientos, radiografías y la cabecera, **para todo rol, incluido el dueño**
(`HC051`), con el mismo criterio que `triajes` y las atenciones firmadas. Corregir un hallazgo firmado **nunca edita** la fila.

**Bloqueo contra firma concurrente.** El ayudante de `_20_proteger` lee la atención con `select … for share`. La firma es un
`UPDATE` de `atenciones`, que retiene el bloqueo de la fila mientras corren sus disparadores BEFORE: quien edita un registro en el
mismo instante **espera**, y al liberarse ve la atención firmada y recibe `HC051`; si el editor llegó primero, la firma espera,
y su huella ya incluye el cambio. La tarea 0.6 comprueba este comportamiento con dos sesiones antes de escribir la migración; si
no se sostuviera, se pasa a un ayudante `SECURITY DEFINER` con el mismo bloqueo.

**Sello propio.** `atenciones_odontologia_20_sellar` (`BEFORE UPDATE OF firmada_en`, `WHEN old.firmada_en is null and
new.firmada_en is not null`, `SECURITY DEFINER`) corre en el instante de la firma y:
1. si la atención usa la plantilla de Odontología, comprueba la **coherencia con la declaración** `registra_seccion_odontologica`
   (`HC052`): `true` exige cabecera y al menos un registro, tratamiento o radiografía; `false` prohíbe cabecera;
2. revalida las piezas contra la dentición declarada (`HC053`);
3. calcula `huella_odontograma(atencion)` y la guarda con `sellado_en` en la cabecera.

La huella es `'v1:'` + SHA-256 del `jsonb` canónico de `{atencion_id, paciente_id, denticion, registros, tratamientos,
radiografias}`, con los hallazgos y tratamientos por **código del catálogo** (estable) y las listas ordenadas de forma
determinista. No incluye `firmada_en`, de modo que no depende del orden respecto del disparador de sello de H6. La función
`verificar_odontograma(atencion)` recalcula y compara; la prueba la usa, y una alteración (con el disparador desactivado solo
dentro de la transacción de prueba) hace que deje de coincidir.

**La declaración queda dentro de la huella de la atención.** `registra_seccion_odontologica` es un campo de `datos_especialidad`,
que entra en la huella `v1` de H6. Si alguien borrara después la cabecera y los registros, la atención seguiría declarando que los
tenía y la verificación lo detectaría.

| Alternativa de sellado | Resultado |
|---|---|
| **A. Huella propia en la cabecera + declaración sellada en la atención (elegida)** | Sin tocar H6. Detecta alteración de los registros y su desaparición |
| B. Inyectar el resumen del odontograma en `datos_especialidad` al firmar | La huella de la atención lo cubriría de forma transitiva, pero obliga a modificar un objeto ya validado y depende del orden de disparadores de H6 (sin aplicar): frágil |
| C. Pedir a H6 que su huella cubra tablas hijas | Lo más limpio a largo plazo; exige cambiar el diseño de H6 y coordinar con las otras especialidades (pregunta abierta) |
| D. Sin sello | Un `UPDATE` del dueño pasaría inadvertido |

**Correcciones: addenda y atención nueva.**
1. La **addenda** (H6, texto, no editable) de la atención firmada explica el error: es la forma de corregir lo ya firmado.
2. El **registro estructurado corregido** se hace en una atención nueva (de cualquier odontólogo a cargo), con la misma pieza y
   cara, o `sin_hallazgo`. Cuando se firma, el odontograma actual lo refleja y conserva la historia completa.
3. La pantalla marca «esta atención tiene addendas» en la celda que procede de ella.

*Alternativa descartada: una corrección estructurada colgada de la addenda* (`odontograma_correcciones`): una corrección hecha
semanas después competiría en la derivación con atenciones firmadas entre medias, y habría que decidir si reemplaza «en el
lugar» del registro original o «en el tiempo». Se deja la regla simple. **Costo conocido:** corregir una cara exige abrir una
atención con su contenido genérico obligatorio; es la pregunta abierta sobre una corrección más ligera.

### D11. Auditoría: escritura sin contenido y lectura en la transacción de acceso

- **Escritura.** Las cuatro tablas clínicas llevan un disparador `AFTER INSERT OR UPDATE OR DELETE` con
  `registrar_auditoria_sin_contenido()` (H6b): queda quién, cuándo, la acción, la tabla y el `id`, **sin copiar** `detalle`, `nota`
  ni ningún dato clínico (el administrativo lee `auditoria`). Por eso `odontogramas` tiene una columna `id` además de
  `atencion_id`. La tarea 0.6 comprueba que la función cubre `DELETE` (usa `old`).
- **Lectura.** Ver un odontograma es leer contenido clínico: se registra en `accesos_historia` **en la misma transacción** que la
  lectura, como el resto de la historia (H6, D2). Las lecturas del módulo (`odontograma_actual`, pendientes, detalle de una
  atención) las llama `lib/historias/odontologia.ts` dentro de esa transacción, tras `exigir_modo_clinico()` y el registro del
  acceso. Si el registro falla, no se devuelve nada. Una lectura de la sección odontológica es de tipo `historia` (vista general)
  o `atencion` (detalle de una atención), sin tipo nuevo; descargar la radiografía es `adjunto` (H6).
- **Un solo módulo.** Todo el SQL contra las cinco tablas vive en `lib/odontologia/repositorio.ts`, y una prueba
  (`tests/odontologia/acceso-unico.test.ts`) falla si otro archivo de `app/`, `lib/` o `components/` lo contiene. Las funciones de
  lectura del repositorio **exigen un argumento de tipo `TransaccionConAcceso`**, que solo crea `lib/historias/`, de modo que no
  se puede leer sin pasar por el registro de acceso.

### D12. Copia de la historia (H6d): clasificar las tablas y escribir la sección

Cada tabla nueva se clasifica en el compilado de la copia (H6d, D6) —con el mismo criterio que triajes, recetas y las demás—:

| Tabla | Clasificación | Razón |
|---|---|---|
| `odontogramas` | **Incluida** | Cabecera y huella de la sección de cada atención firmada |
| `odontograma_registros` | **Incluida** | Hallazgos por pieza y cara |
| `odontograma_tratamientos` | **Incluida** | Tratamientos indicados y realizados |
| `radiografias_odontologicas` | **Incluida** | Metadato de la radiografía; el archivo vigente viaja como adjunto (H6d) y el anulado se declara no incluido |
| `catalogo_odontologico` | **Excluida** | Catálogo, no registro del paciente; las etiquetas se resuelven dentro de la sección |

La sección la produce `copia_seccion_odontologia(paciente, corte)` (`SECURITY DEFINER`, `search_path` vacío, **`EXECUTE` revocado
a todos los roles de usuario**: solo la invoca el compilado). Devuelve, de las atenciones **firmadas** hasta el corte, la sección
de cada una (dentición, registros, tratamientos, radiografías y su huella), el **odontograma actual al corte** y los tratamientos
pendientes. **No incluye borradores** (H6d ya declara el número de borradores no incluidos). El administrativo no obtiene la
sección por ningún otro camino.

**Coordinación con H6d (no se modifica ese change).** H6d reemplaza el compilado con `create or replace` en la migración de cada
change, y la prueba de cobertura (su tarea 3.4) busca los nombres de tabla en la definición del compilado. Si el compilado delega
en `copia_seccion_*`, esa prueba debe buscar también en esas funciones; y como un `create or replace` del compilado hecho por otro
change **pisa** lo anterior, el reemplazo de este change parte siempre de la definición vigente (`pg_get_functiondef`) y la
tarea 6.1 lo verifica. Si H6d prefiere la sección en línea, se escribe así sin cambiar el contenido.

### D13. Errores: SQLSTATE `HC050` a `HC059`

| SQLSTATE | Significado | Mensaje al usuario (usted) |
|---|---|---|
| `HC050` | Quien escribe en la sección odontológica no es odontólogo | «Solo un odontólogo puede registrar el odontograma, los tratamientos y las radiografías.» |
| `HC051` | La atención no admite cambios en la sección (firmada, de otro autor o sin plantilla de Odontología) | «Esta atención ya no admite cambios en la sección odontológica. Para corregirla, agregue una addenda y registre el cambio en una atención nueva.» |
| `HC052` | La sección no coincide con lo declarado al firmar | «Indique si registra odontograma, tratamientos o radiografías y complete al menos un registro, o declare que no.» |
| `HC053` | Pieza que no corresponde a la dentición declarada | «Hay piezas que no corresponden a la dentición elegida. Revise la dentición o las piezas.» |
| `HC054` | Hallazgo o tratamiento incompatible con la pieza o la cara, retirado, de otro tipo o sin el detalle obligatorio | «El hallazgo o el tratamiento no se puede registrar en esa pieza o cara. Revise la selección.» |
| `HC055` | Vínculo inválido de un tratamiento realizado con su indicación | «El tratamiento realizado no corresponde a una indicación pendiente de esta pieza.» |
| `HC056` | Radiografía con un adjunto inválido | «La radiografía debe vincularse a un archivo vigente de este paciente que usted haya adjuntado.» |
| `HC057`–`HC059` | Reservados | — |

Además: `23505` sobre `(atención, pieza, cara)` → «Ya hay un registro para esa cara de la pieza en esta atención. Modifíquelo»;
`23514` (`CHECK` de pieza, detalle o fecha) → «Hay campos vacíos o inválidos. Revise el odontograma»; `42501` → «No tiene permiso para
esta operación»; `HC002` y `HC004` los mensajes de H6. Ningún mensaje contiene texto de la base ni datos del paciente. La traducción
vive en `lib/odontologia/errores.ts`, una función pura con una prueba por fila. `HC050`–`HC059` no chocan con H6 (`HC001`–`HC005`),
H2c, H6b, H6c, H6d ni las otras especialidades.

### D14. Aplicación: módulo, acciones, rutas y pantalla

- **Módulo:** `lib/odontologia/piezas.ts` (estructura FDI, nombres en español, orden por arco, `denticionDePieza`),
  `lib/schemas/odontologia.ts` (Zod 3, `.strict()`, texto con contenido que rechaza invisibles y `U+0000`, NFC), `errores.ts`,
  `repositorio.ts` (con ejecutor inyectable) y `lib/historias/odontologia.ts` (lecturas con su registro de acceso, D11). Límites
  iniciales (ajustables): 312 registros, 200 tratamientos, 20 radiografías por atención; `detalle` y `nota` ≤ 500.
- **El cliente envía el `codigo` del hallazgo o tratamiento, no su `id`**; el servidor relee el catálogo bajo RLS y valida contra
  él, nunca contra lo que diga el cliente (mismo patrón que las plantillas de D15 de H6).
- **Acciones** (devuelven `{ ok: true, datos } | { ok: false, mensaje, errores? }`): `guardarSeccionOdontologica(atención, sección)`
  **reemplaza** la sección del borrador en una transacción (modo → borrar sus registros, tratamientos y radiografías → cabecera →
  insertar cada grupo con una sola sentencia `insert … select from jsonb_to_recordset`); `vincularRadiografia`;
  `desvincularRadiografia` (solo borrador). **Firmar sigue siendo `firmarAtencion` de H6**: el sello lo hace la base. Para
  «guardar y firmar en un paso» se compone la transacción de H6 con la de esta sección (tarea 0.5: contrato del repositorio de H6).
- **Rutas:** la **vista de lectura** `app/profesional/pacientes/[pacienteId]/odontograma/page.tsx` (odontograma actual, tratamientos
  pendientes y radiografías; la ve todo profesional a cargo; solo el odontólogo ve «Registrar»); el **editor** vive dentro de la
  atención del odontólogo (`.../atenciones/nueva` y `.../atenciones/[atencionId]`) como una sección del formulario que
  `FormularioAtencion` de H6 ofrece a la plantilla de Odontología. Toda página repite `auth.protect()`, `exigirRol("profesional")`
  y MFA con el ayudante de guardia de H6; `Cache-Control: private, no-store`, título fijo («Odontograma»), direcciones solo con
  `uuid`.
- **Componente `Odontograma`** (`components/clinica/odontograma/`): cuadrícula por arco en orden FDI, **una pieza = un botón**
  operable por teclado (foco rodante) con nombre accesible («Pieza 16, primer molar superior derecho; oclusal: caries»), un panel
  para fijar hallazgo y cara, y una **vista en lista** equivalente. El estado se dice con texto y símbolo, **nunca solo con
  color**, y el color sale de los tokens de DESIGN.md. Las convenciones de símbolos y colores de la NTS 188 no se asumen (no
  verificada). Hay que **documentarlo en `docs/DESIGN.md`** (componente nuevo) y regenerar el tema (`npm run tema`).
- **Estados de carga y error** como en H2b: el formulario conserva lo escrito ante un error del servidor, sin autoguardado en el
  navegador (D9 de H6).

### D15. Pruebas y verificación

- **pgTAP** (número sugerido **75**, en dos archivos con ese prefijo para no mezclar suites largas): `75_odontologia_rls`
  (catálogo y cuatro tablas, negativos por rol y por profesión) y `75_odontologia_reglas` (reglas, sello, derivación, copia). Cada
  tabla incluye el caso negativo de: administrativo, enfermera, paciente (incluido el titular), sin rol, `anonymous`,
  `cron_notificaciones`, `sync_identidad`, **y por profesión**: odontólogo a cargo (positivo), odontólogo no autor, odontólogo sin
  el paciente, con asignación vencida y con perfil inactivo; médico, fisioterapeuta, psicólogo y podólogo a cargo (leen, no
  escriben); además `has_table_privilege` de lo que no se concede y `columns_are` exacto (sin columnas de dinero). No asumen tablas
  vacías. Las identidades nuevas (`odontologo_a`, `odontologo_b`, `fisioterapeuta_a`, `psicologo_a`, `podologo_a`, `medico_a`) se
  añaden al ejecutor `scripts/ejecutar-pgtap.ts`.
- **Reglas:** las 52 piezas válidas y un conjunto de inválidas (0, 9, 19, 29, 56, 86, 90), caras y alcance, `UNIQUE`, dentición,
  `reemplaza_caras` (al escribir y al derivar), vínculo de tratamientos (`HC055`), radiografía (`HC056`, fecha futura), `HC050`
  a `HC054`, `exige_profesion = 'odontologo'` en la plantilla v1 (el rechazo del no odontólogo es `HC005` de H6), coherencia con la declaración al firmar (`HC052`), huella reproducible y alteración detectada, derivación del actual
  («a una fecha», dos borradores firmados en orden inverso a su creación), pendientes, orden de los disparadores
  (`pg_trigger`), que la auditoría y la copia no contengan un texto centinela de `detalle`, y la prueba de cobertura de H6d.
- **Concurrencia** (`tests/concurrencia/`, número sugerido 30): dos sesiones `pg` reales como `authenticated`: edición de un registro
  contra la firma de la atención (el editor recibe `HC051` o la huella ya lo incluye, nunca un sello desfasado) y dos borradores
  del mismo paciente firmados en cualquier orden (se conservan ambos registros y el actual es el último firmado). 20 rondas.
- **Verificación por mutación** (como en H2 y H6): debilitar en un branch de desarrollo cada política, disparador y función
  nuevos y comprobar que alguna prueba negativa falla (lista en la tarea 11.2).
- **`node:test`:** esquemas Zod, piezas FDI (las 52 y las inválidas), mapeo de errores, repositorio con ejecutor simulado (modo
  primero, acceso antes de leer, no se devuelve contenido si el registro falla), acceso único y `TransaccionConAcceso`.
- **E2E (Playwright) y axe:** el odontólogo registra y firma; otro profesional a cargo lo ve sin controles de edición; la enfermera,
  el administrativo y el paciente no abren la ruta; corrección por addenda y atención nueva. Lector de pantalla y 200 % de zoom.
- Antes de cerrar: `code-review` sobre todo el diff con la lectura más estricta.

### D16. Migraciones, orden y datos de demostración

Siete migraciones nuevas, después de las de H2c, H6, H6b y (para la última) H6d. Nunca se edita una aplicada; `down` vacío:

1. `catalogo-odontologico`: tipos, `pieza_fdi_valida()`, `denticion_de_pieza()`, tabla, RLS, protección del significado.
2. `catalogo-odontologico-datos`: hallazgos y tratamientos (propuesta `REVISAR`), idempotente. Se escribe tras la revisión de 0.4.
3. `plantilla-odontologia`: especialidad «Odontología» si falta y la plantilla v1 con `exige_profesion = 'odontologo'` (idempotente).
4. `odontograma-tablas`: cuatro tablas, índices, RLS, `GRANT` por columna, políticas y disparadores `_10` a `_40` y de auditoría.
5. `odontograma-sello-y-coherencia`: `huella_odontograma()`, `verificar_odontograma()`, `especialidad_odontologia_id()` y el
   disparador de sello sobre `atenciones` (`HC052`, `HC053`).
6. `odontograma-lectura-derivada`: `odontograma_actual()` y `tratamientos_odontologicos_pendientes()`.
7. `copia-seccion-odontologia`: `copia_seccion_odontologia()` y el reemplazo del compilado (H6d).

La **siembra de demostración** crea, para pacientes `@demo.invalid`, atenciones odontológicas **sin firmar**, sus registros y luego
las firma (como dueño, el sello corre igual), porque el dueño tampoco puede insertar filas en una atención ya firmada.

## Risks / Trade-offs

- [El catálogo, la plantilla y las banderas de `reemplaza_caras` son supuestos clínicos míos] → Marcados `REVISAR` en el
  encabezado de la migración; revisión con los odontólogos (0.4) antes de fijarla; un cambio posterior es una migración de datos,
  no de esquema; no se usa con datos reales mientras P-1 siga abierta.
- [La NTS 188 no está verificada: símbolos, campos mínimos o registro inicial y final podrían exigir cambios] → Tarea 0.3
  (obtener y leer el texto oficial); el modelo por pieza y cara y el catálogo por migración absorben la mayoría sin rediseño.
- [Más tablas y disparadores en el núcleo clínico] → Cada tabla con RLS, prueba negativa por rol y por profesión, verificación por
  mutación y `code-review` por grupo y final.
- [La huella de la atención no cubre las tablas hijas] → Sello propio, declaración sellada en `datos_especialidad` y verificación
  (D10); se pregunta a H6 si prefiere cubrirlas (alternativa C).
- [Los disparadores dependen del orden alfabético y de nombres de H6 aún sin aplicar] → Prefijos numéricos, prueba sobre
  `pg_trigger`, y la tarea 0.6 contrasta nombres y orden con la rama base.
- [Gana la última firma, no la última observación] → Limitación declarada; ambos registros se conservan y se muestra la atención de
  origen; pregunta abierta sobre la fecha clínica.
- [Un `create or replace` del compilado de la copia por otro change pisa esta sección] → La migración parte de la definición
  vigente, la prueba de cobertura de H6d y la prueba de contenido de la tarea 6.2 lo detectan.
- [P-15 sin decidir: las radiografías son solo PDF] → Declarado; el modelo no cambia si se admiten imágenes en `adjuntos_historia`.
- [Corregir una cara exige una atención con contenido genérico obligatorio] → Costo conocido de no editar lo firmado; pregunta
  abierta sobre una corrección más ligera.
- [Dos tratamientos o hallazgos simultáneos en una misma cara] → El PRD y el pedido fijan un registro por pieza y cara; si los
  odontólogos necesitan varios, cambia la unicidad y la derivación toma el conjunto de la última atención.
- [Interfaz densa (52 piezas, seis posiciones)] → Vista en lista equivalente, teclado, prueba con lector de pantalla y de
  usabilidad con un odontólogo; si supera el objetivo de tiempo, se ajusta la pantalla.
- [Acoplamiento al nombre «Odontología» de la especialidad] → Centralizado en `especialidad_odontologia_id()`; la plantilla lo
  crea si falta; la prueba afirma que existe exactamente una.
- [Los requisitos de este change solapan los de H6 (`plantillas-clinicas-por-especialidad`, `firma-y-addendas`)] → Este change los
  refina; al archivar, la guía de `config.yaml` exige comprobar que no se contradigan.
- [Los datos de Odontología son datos de salud y no pueden usarse con pacientes reales] → Guarda de H6 en las cuatro tablas; el
  change no entra en producción con datos reales mientras P-1, la acreditación ante el MINSA y el registro ante la ANPD sigan
  abiertos.

## Migration Plan

1. **Grupo 0:** dependencias aplicadas en un branch de desarrollo con la suite en verde; decisión de P-15 registrada (o el supuesto
   «PDF»); lectura de la NTS 188; revisión con los odontólogos; spike de bloqueo bajo RLS; coordinación con H6, H6b y H6d.
2. Migraciones en el orden de D16, cada una con su prueba, en un branch de desarrollo de Neon y luego en el branch efímero del PR
   (una copia de `production`, solo con datos de demostración). Nunca se edita una migración aplicada.
3. Suite pgTAP completa (las existentes sin tocarse, salvo las que H6 actualiza a propósito), concurrencia e integración.
4. Aplicación: primero lógica y repositorio, luego pantallas cuando H2b esté aplicado.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones; el modo de datos sigue en `demostracion`. Sembrar odontogramas de
   demostración en producción es una acción explícita del usuario.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027); un defecto se corrige con una migración nueva. Está prohibido restaurar
   el branch principal de Neon. Una función defectuosa se reemplaza con `create or replace`; un catálogo se corrige retirando la
   entrada (`vigente = false`) y publicando otra.

## Open Questions

**Obligatorias (no se resuelven aquí):**

- **P-15, imágenes como adjuntos (decisión del usuario).** ¿Se admiten imágenes y en qué formatos y tamaño? Hasta decidir, las
  radiografías son PDF y la parte de imágenes de H6e no cierra. D7 explica el efecto de cada respuesta.
- **NTS 188 (norma del odontograma), no verificada.** Obtener el texto oficial y contrastar símbolos, convenciones de color, campos
  mínimos y si exige odontograma inicial y final o fechas. Hasta entonces no se cita su contenido.
- **Catálogos y plantilla** (D5, D8): validar con los odontólogos la lista de hallazgos y tratamientos, las banderas
  `reemplaza_caras` y el alcance, las posiciones de cara, los tipos de radiografía y los campos de la plantilla.
- **¿Puede el odontólogo recetar?** Lo decide `recetas-medicas` (H6c; hoy «no» sin confirmar). Este change no emite recetas ni
  guarda medicamentos.

**Las demás no cambian las especificaciones ni el desglose de tareas:**

- **«Sin registro» frente a «sana»:** la pantalla no los confunde, pero ¿quieren los odontólogos una acción «marcar toda la boca
  sin hallazgos» (varios registros `sin_hallazgo`)?
- **Más de un hallazgo por cara** o más de un tratamiento por indicación, y un estado para una indicación descartada o vencida.
- **Corrección ligera del odontograma** sin abrir una atención completa (D10), y quién puede hacerla.
- **Quién gana ante dos borradores simultáneos** (D3): última firma (propuesta) o fecha clínica.
- **Compatibilidad profesión–especialidad en `profesionales`** (pregunta abierta de H2c): ¿se impide un odontólogo en otra
  especialidad? Aquí el fallo es cerrado.
- **Huella de la atención con tablas hijas** (D10, alternativa C): ¿la cubre H6 para todas las especialidades?
- **Visibilidad de borradores ajenos** (pregunta H9 de H6): las políticas de este change siguen las de `atenciones`.
- **Impresión del gráfico del odontograma** (la copia lleva una tabla, no el dibujo) y su relación con la NTS 188.
- **Pacientes de ambas denticiones y reglas de erupción:** no se codifica ninguna edad ni regla de erupción.
- **Consentimiento informado de tratamientos** (no está en el PRD; la NTS 139, 4.3.3 c, impide firmarlo con firma electrónica del
  paciente): fuera de este change.
- **Dependencia de H6i en TECH-DESIGN y BACKLOG:** este change no la necesita; confirmar y retirarla del plan.
