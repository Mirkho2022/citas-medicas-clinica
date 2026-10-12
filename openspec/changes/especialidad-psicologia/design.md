# Design

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_tiene_paciente()`, `atenciones.profesional_id` y
> `app/profesional/**`; si la ADR se rechaza, léase `medico`, `medicos`, `medico_tiene_paciente()`, `atenciones.medico_id` y
> `app/medico/**` (y `profesion_actual()` pasa a leer `medicos.profesion`). Nada del diseño cambia por el renombre, salvo los
> identificadores.

> **Salud mental: nada de este documento declara validez legal.** Lo verificado en
> [docs/investigacion-marco-legal-y-saniape.md](../../../docs/investigacion-marco-legal-y-saniape.md) (NTS 139, DS 009-2017-SA,
> Directiva 373) no trata la salud mental; las reglas aplicables **no están verificadas** y se llevan al asesor legal (bloque
> «Para el asesor», al final). Todo supuesto mío lleva `REVISAR`.

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (cuatro capacidades). Estado de partida, **verificado
en las migraciones de H2 de este worktree** (no supuesto):

- **Quién lee hoy una atención.** `atenciones_lee_el_medico_a_cargo` (`1791437035148_politicas-historias-clinicas.sql`) exige solo
  rol `medico` y `medico_tiene_paciente(paciente_id)`; `addendas_lee_el_medico_a_cargo` se apoya en la atención;
  `antecedentes_lee_el_medico_a_cargo` repite la regla (`1791437149424_inmutabilidad-y-antecedentes.sql`). **Ninguna mira la
  profesión del autor.** Con H2c el rol es `profesional` y la regla sigue siendo «cualquier profesional a cargo».
- **Sin `FORCE ROW LEVEL SECURITY`** (lo afirma la prueba `99_rls_en_todas_las_tablas`): una función `SECURITY DEFINER` del dueño
  no pasa por RLS. Es la razón por la que toda función que lee contenido clínico es un punto a vigilar (D9).
- **Auditoría.** `registrar_auditoria()` lleva escrita la lista de tablas sin contenido (`atenciones`, `addendas`,
  `antecedentes`); `auditoria` y `accesos_historia` (actor, paciente, atención) son solo-agregar y **los lee el administrativo**.
  El administrativo también **inserta asignaciones manuales** (`asignaciones_inserta_el_administrativo`), la única vía por la
  que un profesional obtiene un paciente sin cita ni derivación.
- **`tipo_antecedente`** incluye `personal_patologico`, `familiar` y `habito_nocivo`: tres tipos donde un psicólogo escribiría
  salud mental o consumo de sustancias.

**Propuesto por los changes hermanos (leídos en este worktree; aún sin aplicar):**

- **H2c** (`profesionales-de-la-salud`): `profesionales.profesion`, que **no viaja en el token**, solo la registra el
  administrativo y **no se modifica después** (`HC010`); `profesion_actual()` es el único punto de lectura, y
  `profesional_tiene_paciente()` es la única fuente de acceso. `HC010` y `HC011` son suyos.
- **H6** (`historias-clinicas`): lectura atómica con registro de acceso (D2), guarda de modo `demostracion`/`real` (D1), sello y
  huella `v1:` (D5), `adjuntos_historia` con RLS idéntica a `atenciones` (D7), plantillas por especialidad (D15, ADR-0029,
  `plantillas_clinicas` con `unique (especialidad_id, version)`: **una plantilla vigente por especialidad**), `tipo_acceso` en
  `accesos_historia`, módulo único `lib/historias/`.
- **H6b** (`triaje-y-derivacion`): `registrar_auditoria_sin_contenido()`; una derivación de un psicólogo **no lleva texto libre**
  (`motivo` nulo, `HC024`); la enfermera ve solo una lista blanca.
- **H6c** (`recetas-medicas`): la vista `medicamentos_vigentes_del_paciente` (`security_invoker`, columnas fijadas por prueba) la ve
  todo profesional a cargo, el psicólogo incluido; `profesiones_que_recetan` deja a `psicologo` en «no», confirmado.
- **H6d** (`copia-de-historia-clinica`): `compilar_copia_historia()` es la **única** función por la que el administrativo obtiene
  contenido clínico; la copia incluye Psicología; `incluye_psicologia` se guarda **sin conteos**; la prueba de cobertura falla si
  una tabla no se clasifica.
- **H6i** (`mecanismos-clinicos-comunes`, terminado): `instrumentos_evaluacion` y `aplicaciones_instrumento` (`area = psicologia` es
  información restringida), `planes_de_sesiones` / `sesiones_del_plan`, el tipo `area_clinica` y la **función única de acceso a
  Psicología** `psicologo_tiene_paciente(paciente uuid)` con la genérica `acceso_clinico_por_area(area, paciente)`. **H6g las
  reutiliza**: no crea `es_psicologo_a_cargo()` ni un alias (una prueba de catálogo falla si existe). **Se usan por su interfaz
  cerrada** (contrato en D7 y D8; tarea 0.3).

**Restricciones que fijan el diseño (PRD y ADR-0031, 2026-10-11):** (1) solo los psicólogos que tienen al paciente a cargo ven los
resultados y las notas de las sesiones; (2) un profesional que no es psicólogo no las ve «ni abriéndolos por la dirección directa
ni de ninguna otra forma»; (3) el aislamiento se impone **en la base**; (4) los demás profesionales **sí ven los medicamentos**;
(5) la copia al paciente **incluye** Psicología; (6) administrativo, enfermera y paciente no ven historias; (7) Psicología
no receta.

## Goals / Non-Goals

**Goals:**
- Que la información de Psicología solo la lea y la escriba un psicólogo que tiene al paciente a cargo, impuesto por la base de
  datos con **falla cerrada**, para cada rol **y para cada profesión**.
- Que esa regla **no pueda deshacerse en silencio**: ni por un `alter policy` ni por una política permisiva futura, ni por una
  tabla clínica nueva que alguien olvide clasificar, ni por una función `SECURITY DEFINER` que lea las tablas reservadas.
- Que no queden canales laterales conocidos, y que los que ninguna base puede cerrar se declaren.
- Que los profesionales que no son psicólogos vean **lo mismo que hoy** de la historia compartida.
- Entregar las cuatro funciones del PRD (evaluación estructurada, tests con puntaje automático, notas de sesión reservadas y
  sesiones recurrentes) con las mismas garantías de integridad que el resto del registro clínico.

**Non-Goals:**
- Resolver P-1, la acreditación, el registro ante la ANPD o las reglas de salud mental; declarar validez legal de nada.
- **Una vía de excepción para emergencias** («romper el vidrio»): es pregunta abierta para el asesor (D10); no se construye.
- Que el paciente vea su información desde el portal; resumen compartible hacia otros profesionales; alertas por riesgo; analítica
  entre pacientes; tests con licencia comercial; imágenes o escaneos de hojas de tests (decisión abierta de H6).
- Modificar las políticas permisivas existentes, `profesional_tiene_paciente()` o la lógica de asignaciones.
- Redefinir `planes_de_sesiones` ni `instrumentos_evaluacion` (son de H6i).

## Decisions

### D1. Qué es «información de Psicología»: la reserva sigue al autor (respuesta a la pregunta 1)

**Decisión propuesta.** Es información de Psicología **toda fila clínica cuyo autor es un psicólogo**. La profesión del autor sale
de `profesionales.profesion` (H2c), un dato que el cliente no fija y que ni siquiera el administrativo puede cambiar después. Por
tanto **la fila de `atenciones` que escribe un psicólogo (motivo, anamnesis, examen, plan y diagnósticos CIE-10, más
`datos_especialidad`) es información de Psicología y se restringe entera.**

| Fila | ¿Psicología? | Por qué |
|---|---|---|
| `atenciones` de autor psicólogo (cuatro textos, diagnósticos CIE-10, `datos_especialidad`) | **Sí** | Es la evaluación; los diagnósticos del capítulo F del CIE-10 son el dato más sensible. Dejarlos legibles contradice el PRD |
| `addendas` de autor psicólogo | Sí | Corrigen o amplían esa evaluación |
| `antecedentes` y `adjuntos_historia` registrados por un psicólogo | **Sí** *(propuesta; ver U5)* | `personal_patologico`, `familiar` y `habito_nocivo` son tipos donde un psicólogo escribiría salud mental |
| `notas_sesion_psicologia`, `aplicaciones_instrumento` (psicólogo), `planes_de_sesiones` y `sesiones_del_plan` de un psicólogo | Sí | Son las notas, los resultados y el proceso |
| `atenciones`, `addendas`, `antecedentes`, `adjuntos_historia` de otras profesiones | No | Historia compartida: el psicólogo a cargo **sí** las lee |
| `recetas` y la vista de medicamentos | No | Decisión del PRD: los demás profesionales ven los medicamentos |
| `triajes`, `visitas`, `derivaciones`, `citas`, `asignaciones`, `notificaciones`, `pacientes` | No | Operativas o de otra autoría; sus fugas posibles se tratan en D9 |

*Por qué «autor» y no otro criterio (alternativas descartadas):*
(a) **Por especialidad de la plantilla** (`plantillas_clinicas`): una atención sin plantilla o con otra queda compartida; el
cliente elige la plantilla. (b) **Una bandera `reservada` que marca el autor en cada fila**: el cliente decide; un olvido o un
error filtra salud mental, que es justo lo que ADR-0031 descarta («un olvido filtra»). (c) **Por contenido** (por ejemplo, diagnósticos
del capítulo F): la base no entiende el texto libre y un falso negativo filtra. (d) **Una bandera denormalizada por fila que un
disparador sella desde el autor**: viable (se anota como variante en D2, M5) pero añade una columna a cuatro tablas, un
disparador por tabla y una posible desincronización si una migración corrige una profesión.

**Consecuencias que el usuario debe conocer (preguntas U4 y U5).**
- **El autor sin asignación vigente no conserva acceso propio.** La ADR-0031 dice «y su autor»; este diseño **no** crea una vía
  de acceso del autor independiente de la asignación, porque ADR-0016 y H2c fijan la asignación como la **única** fuente de
  acceso a una historia. Un psicólogo cuya asignación venció (o que fue dado de baja) deja de leer sus propias notas, igual que
  hoy un médico deja de leer las suyas. Las sesiones recurrentes y las citas confirmadas renuevan la asignación (6 meses,
  ADR-0016), y un psicólogo nuevo la obtiene por la asignación manual del administrativo o por una derivación tomada (H6b).
  <!-- REVISAR: «y su autor» de ADR-0031 puede leerse como lo contrario. Si el usuario lo quiere, es una condición `or profesional_id = profesional_actual()` en la función de D3 y una prueba nueva; abre una segunda fuente de acceso, por lo que se recomienda no hacerlo. -->
- **Un psicólogo no puede publicar nada hacia los otros profesionales por las tablas compartidas** (por ejemplo, una alergia que
  el paciente le cuenta). Es el precio de que la regla sea estructural y no dependa de que el autor marque lo correcto. Es
  fácil de ampliar después (una lista de tipos permitidos, por ejemplo `alergico`) y difícil de estrechar: se empieza cerrado.

### D2. Cómo se impone en la base: política restrictiva uniforme sobre la autoría (alternativas y recomendación)

**Recomendación: M1.** En cada tabla reservada, una política RLS **`AS RESTRICTIVE`** (se combina con `AND` con todas las
permisivas) cuya condición es «la fila no es de Psicología, o el usuario es un psicólogo que tiene al paciente a cargo», apoyada
en una función propia mínima (`fila_de_psicologia()`) y en la **función única de acceso a Psicología de H6i**,
`psicologo_tiene_paciente()` (que se apoya en `profesional_tiene_paciente()` de H2c). Las políticas permisivas existentes **no
se tocan**.

| | Qué es | A favor | En contra | Veredicto |
|---|---|---|---|---|
| **M1. Política restrictiva sobre la autoría** | Una `AS RESTRICTIVE FOR ALL` por tabla + `fila_de_psicologia()` y la función única `psicologo_tiene_paciente()` de H6i | **Ninguna política permisiva, presente o futura, puede ampliar la lectura** (las restrictivas se combinan con `AND`); no toca las 21 políticas que H2c acaba de reescribir; un solo predicado para todas las tablas; quitarla es un `drop policy` visible y una mutación evidente; falla cerrada | Una llamada a función por fila y por política; una migración nueva por cada tabla clínica que se añada (la fuerza una prueba de catálogo, D9) | **Recomendada** |
| M2. Reescribir las políticas permisivas (`alter policy … using (… and profesión)`) | Añadir la condición a cada política de `atenciones`, `addendas`, `antecedentes`, `adjuntos_historia` | Una sola política por comando | Dispersa la regla en 12 o más políticas ya tocadas por H2c y H6; un `alter policy` posterior de otro change la deshace sin que nada lo note; la regla se mezcla con la de «a cargo» | Descartada |
| M3. Tablas separadas para todo lo de Psicología (también la atención: `atenciones_psicologia`) | Aislamiento estructural: no hay mezcla en ninguna tabla | La más simple de razonar | Duplica firma, huella, inmutabilidad, addendas, validación CIE-10 y plantillas; rompe «una historia»; la copia y su prueba de cobertura se complican; lo compartido (antecedentes, adjuntos) sigue sin resolverse | Descartada para la atención; **sí** se usa para lo que es de otra forma (notas, D6) |
| M4. Esquema o base separada para Psicología | Aislamiento del todo | Ya descartada en la ADR-0031 | Duplica auditoría, respaldos y migraciones; la copia cruza bases | Descartada (ADR-0031) |
| M5. Columna marcadora `reservada` sellada por disparador desde el autor | La fila lleva su marca; la política lee la marca | Política más barata; admitiría categorías futuras | Una columna y un disparador por tabla; se desincroniza si una migración corrige una profesión (D1); toca `47_estructura_historia` | Variante a reconsiderar si `EXPLAIN` (tarea 1.4) muestra costo |
| M6. Cifrado por columna con clave por psicólogo | El contenido solo se descifra con la clave del psicólogo | Protege incluso contra quien lee la base | Gestión y rotación de claves; la copia al paciente la compila el servidor; Neon RLS Authorize no entrega claves por usuario; mueve el riesgo sin cerrarlo | Descartada |
| M7. Roles de Postgres por profesión (`SET ROLE`) | Un rol `psicologia` con `GRANT` propio | Privilegios de base nativos | Neon RLS Authorize usa un solo rol `authenticated` y el contexto sale del JWT ([ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md)); reabriría esa ADR | Descartada |
| M8. Vistas `security_invoker` y revocar las tablas | Se lee solo por vistas filtradas | Superficie pequeña | `atenciones` sigue siendo compartida; la prueba global de vistas de H7 las vigila; otra capa sin garantía adicional | Descartada |

*Por qué «restrictiva» importa de verdad.* Con una política permisiva adicional, PostgreSQL combina con `OR`: bastaría que un
change futuro añada, por ejemplo, «el administrativo lee `atenciones` para la copia» (H6d no lo hace, pero alguien podría) para
que la reserva se evapore sin que falle una sola aserción de lo que se probó antes. Una política restrictiva se combina con `AND`
con todas las demás: **añadir permisos no la debilita**; solo `drop policy`, `alter policy` o un rol con `BYPASSRLS` pueden
hacerlo, y las pruebas de catálogo de D9 y la verificación por mutación (D15) cubren esos tres.

*Límite honesto de M1.* Quien tiene el rol dueño o `BYPASSRLS`, y toda función `SECURITY DEFINER` del dueño, no pasa por RLS
(`FORCE ROW LEVEL SECURITY` se descartó: rompería `compilar_copia_historia()` de H6d y las migraciones, y la prueba 99 lo
afirma). El control compensatorio es la **lista cerrada de funciones que leen las tablas reservadas**, verificada por una prueba
de catálogo (D9). La reserva es contra los usuarios de la aplicación, **no contra quien administra la base**.

### D3. El cambio de política exacto (pregunta 1), sus negativos y su mutación

**Funciones (migración `psicologia-funciones-de-reserva`).** Ilustrativo; la migración real se revisa con `code-review`:

```sql
-- ¿La fila es de Psicología? Verdadero salvo que el autor sea, con certeza, de otra profesión (falla cerrada:
-- autor nulo o inexistente => reservada). SECURITY DEFINER: no debe depender de lo que el usuario pueda leer de `profesionales`.
create function public.fila_de_psicologia(p_autor uuid) returns boolean
language sql stable security definer set search_path = ''
as $f$ select not exists (select 1 from public.profesionales p where p.id = p_autor and p.profesion <> 'psicologo') $f$;

-- ¿El usuario autenticado es psicólogo y tiene a este paciente a cargo? NO se define aquí: es la función única de H6i,
-- public.psicologo_tiene_paciente(paciente uuid) (rol `profesional`, profesion_actual() = 'psicologo', perfil activo y
-- profesional_tiene_paciente(paciente): asignación vigente, fechas de Lima, profesional activo; falla cerrada). Este change la
-- REUTILIZA y no crea `es_psicologo_a_cargo()` ni un alias (una prueba de catálogo falla si existe). Las políticas la llaman por
-- posición: psicologo_tiene_paciente(paciente_id).

revoke execute on function public.fila_de_psicologia(uuid) from public;
grant  execute on function public.fila_de_psicologia(uuid) to authenticated;
```

**Política (una por tabla reservada; ejemplo en `atenciones`).** Las tres permisivas actuales (`atenciones_lee_…`,
`atenciones_registra_…`, `atenciones_actualiza_…`) **no cambian**; se añade:

```sql
create policy atenciones_reserva_psicologia on public.atenciones
  as restrictive for all to authenticated
  using      (not public.fila_de_psicologia(profesional_id) or public.psicologo_tiene_paciente(paciente_id))
  with check (not public.fila_de_psicologia(profesional_id) or public.psicologo_tiene_paciente(paciente_id));
```

| Tabla reservada | Columna de autor | Columna de paciente | Nota |
|---|---|---|---|
| `atenciones` (H6) | `profesional_id` | `paciente_id` | Cubre también `diagnosticos` y `datos_especialidad` |
| `addendas` (H2) | `profesional_id` | — | Sin `paciente_id`: la reserva es por autoría; **además** la política permisiva existente exige poder ver la atención madre, así que una addenda de otro autor sobre una atención reservada **tampoco** se ve (cascada, probada en 77) |
| `antecedentes` (H2) | `registrado_por` | `paciente_id` | Propuesta U5 |
| `adjuntos_historia` (H6) | `subido_por` | `paciente_id` | Propuesta U5 |
| `notas_sesion_psicologia` (este change) | `profesional_id` | `paciente_id` | D6 |
| `aplicaciones_instrumento`, `planes_de_sesiones` (H6i) | `profesional_id` | `paciente_id` | D7 y D8. **Decidido:** se añade la reserva por autoría como segunda barrera sobre la política por área de H6i (H6i no la implementa); prevalece el criterio más estricto |
| `sesiones_del_plan` (H6i) | — (sin columna de autor) | — | Sin restrictiva propia: hereda el área de su plan por la clave compuesta y la política por área de H6i; su aislamiento lo prueba 77 |
| `accesos_historia` (H2/H6) | `actor_id` (perfil) | `paciente_id` | **Solo `INSERT` y solo para `tipo_acceso = 'psicologia'`**: nadie fabrica un acceso a Psicología sin ser psicólogo a cargo (D12) |

**Qué cambia para cada rol (la fila de `atenciones` de un psicólogo):**
- *Psicólogo a cargo:* lee, y escribe las suyas; **sin cambio** respecto de hoy, y sigue leyendo toda la historia compartida.
- *Médico, odontólogo, fisioterapeuta o podólogo a cargo:* `SELECT`, `UPDATE`, `DELETE` y `RETURNING` sobre filas de autor
  psicólogo devuelven **cero filas**, como si no existieran; todo lo demás de la historia, **igual que hoy**. `INSERT` no cambia (su
  autor es él mismo y no es psicólogo).
- *Psicólogo sin asignación vigente, con asignación vencida o dado de baja:* cero filas (la permisiva ya lo exigía; la restrictiva
  repite la condición por profesión).
- *Administrativo, enfermera, paciente, sin rol:* ya no tenían política permisiva; nada cambia, y la restrictiva es redundante
  para ellos a propósito (defensa en profundidad). `anonymous`, `cron_notificaciones` y `sync_identidad`: sin `GRANT`.

**Prueba negativa que lo fija** (`77_psicologia_aislamiento_rls`, grupo «atenciones»): con un paciente a cargo de un psicólogo, de
un médico, de un odontólogo, de un fisioterapeuta y de un podólogo, y con una atención firmada de cada autor con texto centinela:
(i) el médico, el odontólogo, el fisioterapeuta y el podólogo hacen `select count(*)`, `select … where id = <la del psicólogo>`,
`exists`, `update … returning` y `delete … returning` sobre la atención del psicólogo y obtienen **cero filas y cero efectos**;
(ii) cada uno sigue viendo las de los demás no psicólogos; (iii) el psicólogo a cargo ve **todas**; (iv) un psicólogo sin
asignación, con la vencida y con el perfil inactivo ve cero; (v) el mismo conjunto para el paciente titular, el administrativo, la
enfermera, sin rol, `anonymous`, `cron_notificaciones` y `sync_identidad` (cero filas o falta de privilegio). *No sobre-bloqueo:*
(ii) y (iii) fallan si la restricción deja de ser exacta.

**Verificación por mutación** (tarea 1.5): (a) cambiar `as restrictive` por permisiva o `drop policy` → (i) falla; (b) hacer que
`fila_de_psicologia()` devuelva `false` → (i) falla; (c) devolver `true` siempre → (ii) falla; (d) que `psicologo_tiene_paciente()` (función de H6i; la mutación se hace en el branch y se repite en las pruebas 80 y 81) ignore la
profesión (cualquier profesional a cargo) → (i) falla; (e) que ignore al paciente (cualquier psicólogo) → (iv) falla; (f) quitar
`profesional_tiene_paciente` de la función → (iv) falla; (g) cambiar `p.profesion <> 'psicologo'` por `=` → (ii) y (i) fallan;
(h) añadir una política permisiva que dé lectura al administrativo → la prueba de catálogo de D9 y el negativo de administrativo
fallan (la restrictiva la contiene, pero el catálogo la señala). Cada mutación se anota en el PR con la prueba que la atrapó.

### D4. Qué ven los demás profesionales de un diagnóstico de Psicología (pregunta 2)

El PRD dice que los demás ven **los medicamentos**; no dice nada de diagnósticos. Opciones, para que decida el usuario:

| Opción | Qué ve un médico a cargo | Costo |
|---|---|---|
| **A. Nada** *(recomendada, literal al PRD)* | Ni diagnósticos, ni atenciones, ni notas, ni un aviso de que existen | Un médico puede no saber que su paciente sufre depresión mayor; ve lo que sí cruza fronteras clínicas: los medicamentos (vista de H6c) |
| B. Una bandera «el paciente tiene seguimiento en Psicología» | Un indicador sin contenido | **Revela la existencia** de tratamiento de salud mental a todo profesional a cargo; contradice la lectura estricta |
| C. Solo el capítulo del CIE-10 («Trastornos mentales») sin código ni descripción | Una etiqueta de categoría | Casi tan reveladora como B |
| D. Un **resumen compartible** que el psicólogo redacta a propósito para sus colegas | Solo lo que el psicólogo decide compartir | Es la solución clínicamente más sensata, pero **amplía el alcance** (una tabla y un flujo nuevos) y el PRD pide «medicamentos»; solo si el usuario lo pide |

**Recomendación: A.** Consecuencias que se implementan y se prueban: la historia de un no psicólogo **no muestra ningún marcador**
de lo oculto (ni «N atenciones reservadas», ni filas vacías, ni «sin acceso»); los contadores de la interfaz se calculan **bajo
RLS**, así que cuentan solo lo visible; «Diagnósticos registrados» (H6, D12) se arma solo con las atenciones visibles, y el
indicador `indicador_digitalizacion()` (agregado global del administrativo) cuenta historias, no diagnósticos. Pregunta U2.

### D5. Evaluación estructurada: una atención con la plantilla de Psicología (ADR-0029)

La evaluación inicial y las reevaluaciones son **filas de `atenciones`** con la plantilla de Psicología: heredan firma lógica,
huella `v1:`, inmutabilidad, addendas, validación CIE-10 y el flujo de H6 sin duplicar nada, y D1 las reserva por autoría.

**Plantilla «Evaluación psicológica» v1** (migración de datos idempotente; especialidad «Psicología», que la migración crea si
falta, como hace H6 con «Medicina general»). Tipos de ADR-0029. **Todo el contenido es una propuesta a validar con los psicólogos
de la clínica (tarea 0.8)**; no es norma clínica.

| Clave | Tipo | Obl. | Límites / opciones |
|---|---|---|---|
| `tipo_evaluacion` | opcion | sí | `inicial`, `reevaluacion` |
| `origen_consulta` | opcion | sí | `demanda_propia`, `derivado_por_profesional`, `derivado_por_institucion`, `otro` |
| `ocupacion` | texto | no | ≤ 120 |
| `convivencia` | texto | no | ≤ 300 |
| `tratamiento_psicologico_previo` | si_no | sí | — |
| `tratamiento_psiquiatrico_actual` | si_no | sí | — |
| `antecedentes_familiares_salud_mental` | texto | sí | ≤ 1 000 («ninguno referido» es un valor válido con contenido) |
| `consumo_sustancias` | opcion | sí | `ninguno_referido`, `ocasional`, `frecuente`, `no_evaluado` |
| `orientacion` | opcion | sí | `orientado`, `parcialmente_orientado`, `desorientado` |
| `animo_afecto` | opcion | sí | `eutimico`, `deprimido`, `ansioso`, `irritable`, `labil`, `otro` |
| `pensamiento` | opcion | sí | `organizado`, `desorganizado`, `otro` |
| `juicio` | opcion | sí | `conservado`, `parcialmente_conservado`, `alterado` |
| `riesgo_autolesion` | opcion | sí | `sin_riesgo_identificado`, `riesgo_bajo`, `riesgo_moderado`, `riesgo_alto` |
| `proxima_evaluacion` | fecha | no | — |

<!-- REVISAR: (1) si la evaluación debe obligar a registrar el riesgo (decisión clínica); (2) las listas de opciones; (3) marcar
`riesgo_alto` NO dispara alerta, derivación ni aviso (las alertas automáticas están fuera de alcance): el protocolo de crisis es de la
clínica y se enlaza con la pregunta de emergencia (D10). -->

- **Los cuatro textos genéricos de `atenciones`** (motivo, anamnesis, examen físico, plan) se **rotulan** en la interfaz de
  Psicología como «Motivo de consulta», «Historia del problema y antecedentes personales», «Examen mental» y «Plan terapéutico».
  Es solo presentación: las columnas, las reglas de «sin campos vacíos» y los límites de H6 D3 no cambian. <!-- REVISAR: rótulos con un psicólogo. -->
- **Diagnósticos CIE-10:** obligatorios, de uno a diez, con `tipo` (presuntivo, definitivo, repetitivo), validados por el
  disparador de H6; el catálogo completo ya trae el capítulo F (ADR-0014).
- **Qué se agrega a la base** (migración `psicologia-plantilla`): (1) columna **`plantillas_clinicas.exige_profesion`**
  (`profesion_salud`, nula por defecto) y un disparador `BEFORE INSERT OR UPDATE OF plantilla_id` en `atenciones`
  (`SECURITY DEFINER`, `search_path` vacío) que rechaza con **`HC070`** que una plantilla con `exige_profesion` la use un autor de
  otra profesión: así un profesional registrado por error en la especialidad «Psicología» no puede redactar una evaluación
  **compartida**; (2) el mismo disparador rechaza con **`HC074`** una atención de un psicólogo que no use la plantilla vigente de
  Psicología (la estructura no se salta con una atención genérica). Si otro change (H6e a H6h) ya añadió una columna equivalente,
  se reutiliza (tarea 0.4).
- **Interfaz:** `FormularioAtencion` de H6 con los campos de la plantilla, rótulos de Psicología y el panel
  `MedicamentosDelPaciente` de H6c arriba (la vista de medicamentos; sin alertas de interacción). El formulario conserva lo
  escrito ante un error; un solo botón primario («Firmar evaluación»).

*Alternativas descartadas:* (a) **tabla propia `evaluaciones_psicologicas`**: duplica el registro firmado (M3 de D2). (b) **Evaluación y nota de
sesión en la misma plantilla** con campos opcionales: ADR-0029 solo valida «obligatorio» de forma fija y H6 admite **una**
plantilla vigente por especialidad, así que la parte estructurada de la evaluación quedaría sin garantía; por eso las notas
van aparte (D6). (c) **Varias plantillas vigentes por especialidad**: cambia `plantillas_clinicas` y el validador de H6; se
plantea a H6 solo si el usuario lo prefiere.

### D6. Notas de sesión reservadas: tabla propia `notas_sesion_psicologia`

Una nota de sesión es un registro firmado, breve y frecuente (una por sesión). Meterla en `atenciones` obligaría, en cada sesión, a
escribir cuatro textos (con «examen físico» incluido) y al menos un diagnóstico; una tabla propia permite una forma adecuada y
conserva las mismas garantías (firma, huella, inmutabilidad) con el patrón de H6.

| Columna | Detalle |
|---|---|
| `id` | `uuid` PK |
| `historia_id`, `paciente_id` | Clave foránea compuesta a `historias_clinicas (id, paciente_id)`, como `atenciones` |
| `profesional_id` | Autor (`profesionales`); siempre `profesional_actual()`, y debe ser psicólogo |
| `cita_id` | Nulo o `unique` → `citas`; de **este paciente y este psicólogo** (`HC071`) |
| `sesion_id` | Nulo → `sesiones_del_plan` (H6i; nombre por confirmar, tarea 0.3); coherente con el paciente y el plan del mismo psicólogo (`HC071`) |
| `fecha_sesion` | `timestamptz not null`; no futura (tolerancia de 5 minutos); la fija el psicólogo, no es la hora de la firma |
| `tema`, `desarrollo`, `evolucion`, `plan_siguiente` | Cuatro textos **obligatorios con contenido** (`texto_con_contenido()` + Zod que rechaza invisibles); límites iniciales 300, 5 000, 2 000 y 1 000 <!-- REVISAR: campos y límites con un psicólogo (tarea 0.8) --> |
| `rectifica_a` | Nulo o `unique` → `notas_sesion_psicologia(id)`; D6.2 |
| `firmada_en`, `firma_metodo`, `firma_huella` | Sello del servidor y huella `v1:` con el mismo método que `atenciones` (H6 D5); el proveedor de firma es `lib/firma/` de H6 |
| `creado_en` | `now()`, sellado por el servidor |

**D6.1 Reglas de la tabla.**
- **Solo un psicólogo escribe** (`HC070`, disparador `BEFORE INSERT`; corre antes que la política, así que el mensaje es el propio)
  **y solo si tiene al paciente a cargo** (política permisiva más la restrictiva de D3).
- **Borrador visible solo para su autor:** `firmada_en is not null or profesional_id = profesional_actual()`. Otro psicólogo a cargo
  no lee el borrador de un colega; sí las notas firmadas. (En H6 los borradores de `atenciones` son visibles a todos los
  profesionales a cargo, hallazgo H9 de `historias-clinicas`; para las notas, de lo más sensible, se cierra.) Pregunta U6.
- **Firmar es irreversible:** una nota firmada no se modifica ni se elimina para nadie, incluido el dueño (`HC072`, disparador
  `notas_sesion_inmutables`, el mismo patrón que `proteger_atencion_firmada()`). Un borrador solo lo edita su autor.
- **Sello y huella:** disparador `BEFORE INSERT/UPDATE` que, si `current_user = 'authenticated'`, fija `creado_en` y `firmada_en` con
  `now()` y calcula `firma_metodo` y `firma_huella` al firmar (no se confía en lo que envíe el cliente). El nombre ordena después
  del de inmutabilidad, como en H6.
- **Auditoría de escritura sin contenido:** `registrar_auditoria_sin_contenido()` (H6b).
- **Guarda de datos reales:** `exigir_paciente_admisible()` (H6, `HC002`).
- **Privilegios:** `GRANT SELECT, INSERT` y `UPDATE` solo de `tema`, `desarrollo`, `evolucion`, `plan_siguiente`, `fecha_sesion` y
  `firmada_en` a `authenticated`; nada a `anonymous`, `cron_notificaciones` ni `sync_identidad`; sin `DELETE`.
- **RLS** activada con: lectura, inserción y actualización permisivas (rol `profesional`, `psicologo_tiene_paciente(paciente_id)`, autor
  para escribir) y la **restrictiva uniforme de D3**.

**D6.2 Corregir una nota firmada: rectificación por una nota nueva.** Se registra una nota que `rectifica_a` la anterior (misma
paciente, mismo autor, la anterior firmada y no rectificada ya; `HC073`). Las dos quedan visibles, la rectificada marcada
«Rectificada por la nota del [fecha]». `rectifica_a` es `unique`: dos rectificaciones simultáneas de la misma nota no prosperan
(`23505`, traducido a `HC073`; prueba de concurrencia). *Alternativa descartada:* una tabla de addendas aparte (otra tabla con RLS
y su prueba para el mismo resultado); las `addendas` existentes cuelgan de `atenciones`.

**D6.3 Relación con la cita y con la sesión: la firma no cambia ningún estado.** Igual que en H6 (D13): firmar la nota no marca la
cita «atendida» ni consume una sesión del plan; la pantalla ofrece, aparte y en secundario, «Marcar sesión como realizada»
(acción de H6i) y «Marcar cita como atendida» (acción de H3). Si esa acción falla, la nota sigue firmada.

*Alternativas descartadas para las notas:* (a) **fila de `atenciones`** con una plantilla «sesión»: fricción en cada sesión y
una sola plantilla por especialidad (D5). (b) **nota sin firma** (editable): contradice «registrar la atención en el momento en
que se da, con trazabilidad» de la NTS 139 4.3.3 (nivel A de la investigación) y la inmutabilidad del resto del registro.
(c) **Cifrado de las notas**: M6 de D2.

### D7. Tests con puntaje automático: se usa H6i; este change aporta el catálogo (REVISAR)

**Contrato cerrado con H6i** (tarea 0.3). Nombres reales de H6i: autor `profesional_id`, paciente `paciente_id`; instrumento con `clave`, `version`,
`area`, `uso_libre`, `fuente`, `licencia_referencia`, `licencia_verificada_el` y `vigente`; los tests se aplican llamando a
`registrar_aplicacion_instrumento()` (H6g no calcula puntajes ni tiene tabla de resultados propia):
1. `instrumentos_evaluacion` es un catálogo por migración con `clave`, nombre, ítems, reglas de puntaje, interpretación,
   `area` (`psicologia`, `fisioterapia`, …), `uso_libre` y una referencia de licencia.
2. `aplicaciones_instrumento` guarda respuestas, **puntaje calculado en el servidor y en la base** (el cliente no lo envía) e
   interpretación ajustable por el profesional (**el puntaje no**), con el profesional autor y el paciente.
3. Una aplicación con `area = psicologia` solo la registra un psicólogo (**`HC090` de H6i**; este change **no** añade un disparador propio
   ni `HC070` sobre esa tabla) y H6i la aísla por área con su política de lectura; **la restrictiva de D3 la cubre además por su
   autor** (un instrumento de otra área aplicado por un psicólogo también queda reservado).
4. Un instrumento sin `uso_libre`, sin referencia de licencia o sin la fecha de su verificación **no puede estar vigente** (así lo
   fija el proposal de H6i: «el catálogo no admite un instrumento vigente sin …»).
5. H6i ya entrega el tipo `area_clinica`, la **función única** `psicologo_tiene_paciente()` (H6g la reutiliza), `acceso_clinico_por_area()` y políticas por área para sus tablas; la restrictiva de
   este change se **suma** como segunda barrera y añade lo que H6i no cubre: la reserva por **autoría** (un instrumento de otra área
   aplicado por un psicólogo también queda reservado) y la comprobación de catálogo de D9. Si H6i y este change discreparan en
   el criterio, **prevalece el más estricto**.

**Catálogo propuesto (migración de datos; todo `REVISAR`).** *Las licencias no están verificadas.* Las filas se cargan con
**no se cargan en la base** hasta que alguien verifique la licencia de cada una en la fuente oficial y escriba su referencia y la fecha
de verificación (tarea 0.9); entonces una migración de datos la carga **una por una**, ya vigente. Los ítems exactos y su traducción al español de Perú **se toman de una
fuente con licencia clara y no se transcriben aquí**. Las reglas siguientes son lo que recuerdo de las versiones habituales y se
**verifican contra la fuente oficial** antes de cargarlas:

| Clave | Instrumento | Ítems y respuesta | Puntaje | Interpretación habitual (REVISAR) |
|---|---|---|---|---|
| `phq9` | PHQ-9 (depresión) | 9 ítems, 0 a 3 | Suma 0–27 | 0–4 mínima; 5–9 leve; 10–14 moderada; 15–19 moderadamente grave; 20–27 grave |
| `gad7` | GAD-7 (ansiedad) | 7 ítems, 0 a 3 | Suma 0–21 | 0–4 mínima; 5–9 leve; 10–14 moderada; 15–21 grave |
| `audit` | AUDIT (consumo de alcohol) | 10 ítems (los ítems 9 y 10 con valores 0, 2 y 4) | Suma 0–40 | Zonas de riesgo; cortes a confirmar |
| `pcl5` | PCL-5 (estrés postraumático) | 20 ítems, 0 a 4 | Suma 0–80 | Umbral orientativo a confirmar con la fuente |

- **Excluidos a propósito:** BDI-II, BAI, STAI, HADS, MMPI y pruebas de inteligencia o proyectivas (licencia comercial o
  administración restringida). El PRD pide «de uso libre».
- **Reglas que la prueba fija, por instrumento:** todo en mínimo, todo en máximo, un ítem omitido (**se rechaza; nunca se puntúa
  parcial**), un valor fuera de rango, el cálculo del servidor frente al de la base, y que el cliente no puede enviar un puntaje.
- **Ítem de ideación o autolesión** (el ítem 9 del PHQ-9): el resultado lo **muestra destacado** al psicólogo, sin alerta
  automática ni aviso a nadie (fuera de alcance); la conducta ante una respuesta positiva es del protocolo de la clínica
  (D10, `REVISAR`).
- **Quién lee los resultados:** solo los psicólogos a cargo (D3). Un instrumento de otra área aplicado por un psicólogo también
  queda reservado (la reserva sigue al autor).

### D8. Sesiones recurrentes: se usa `planes_de_sesiones` de H6i

Una **sesión recurrente** es una sesión de un plan de sesiones de H6i, con su frecuencia, su vigencia y sus citas (que son las de
H3). Este change no redefine el mecanismo; fija cómo lo usa Psicología y qué exige:

- **Plan de Psicología:** frecuencia por omisión **semanal** (7 días, editable), **total de sesiones obligatorio (1 a 60)** y vigencia: H6i no
  admite planes sin total; un tratamiento más largo se amplía con `ajustar_plan_de_sesiones` hasta el tope o se encadena con un plan nuevo
  (si Psicología necesita un plan sin fin, es decisión del usuario que cambiaría H6i). Lo crea y lo cierra **solo un psicólogo a cargo**; el plan y sus sesiones son
  **información reservada** (D3): el protocolo o la descripción son texto libre clínico.
- **Sin cobros ni saldos** (H6i). El contador de sesiones restantes lo ve el psicólogo a cargo; **recepción** solo ve, mediante la
  función de lista blanca de H6i, qué planes tienen sesiones **por agendar** y cuántas, **sin protocolo ni descripción**, porque
  sin eso no podría confirmar la serie. Es un dato operativo que revela la existencia del proceso y su ritmo, no su contenido:
  se declara en D9 y se fija con la prueba de columnas exactas de esa función.
- **Las citas de las sesiones no llevan motivo clínico.** `citas.motivo` es texto libre que lee recepción y el portal; para las
  citas que generan los planes de un psicólogo el motivo se deja vacío o neutro («Sesión»). Coordinación con H3, H4 y H6i
  (tarea 0.6); el control es de aplicación y se documenta como canal en D9.
- **Casos** (los de H6i, verificados desde Psicología): sesión a la que no asiste, reprogramada, abandono (plan `cancelado`),
  fin (plan `completado`); ninguno exige leer una nota. La **ventana de cancelación de 1 hora aplica a todos los roles**
  (ADR-0012) también a estas citas.
- **Continuidad del acceso:** confirmar una cita renueva la asignación 6 meses (ADR-0016); un plan abandonado deja de renovarla y
  la información queda «dormida» hasta que un psicólogo vuelva a tener al paciente a cargo (asignación manual o derivación).

### D9. Canales laterales (pregunta 3): cómo se cierran, cómo se prueban y cuáles no se pueden cerrar

| Canal | Riesgo | Cómo se cierra | Prueba |
|---|---|---|---|
| Lectura directa de tablas | Otro profesional o rol lee filas reservadas | D3, política restrictiva por tabla | 77 |
| Dirección directa (uuid) | Abrir una evaluación o nota por su id | RLS devuelve cero filas; la ruta responde `notFound()` **indistinguible** de un id inexistente; nunca «sin permiso» | 77 y E2E |
| Cascada de `addendas` | Una addenda visible aunque su atención no | Restrictiva por autoría y la permisiva existente exige ver la atención madre | 77 |
| Unicidad y claves foráneas | `23505` o violación de FK revelan una fila oculta | Disparadores `BEFORE` (`HC070`, `HC071`) y la política `WITH CHECK` corren antes que el índice único; `atenciones.cita_id` y las citas de las notas se validan por coherencia (`HC003`, `HC071`). *Se verifica con una prueba que un no psicólogo que reutiliza un `cita_id` de Psicología recibe `HC003`/`42501`, no `23505`; no se asume el orden de PostgreSQL* | 78 |
| Funciones `SECURITY DEFINER` | Una función que lee las tablas reservadas salta RLS | **Lista cerrada** verificada por catálogo: solo `fila_de_psicologia`, `psicologo_tiene_paciente` y `acceso_clinico_por_area` (H6i; **`es_psicologo_a_cargo` no debe existir**), los disparadores propios, `indicador_digitalizacion()` (agregado), `compilar_copia_historia()` (H6d) y las funciones de huella **sin `EXECUTE` para `authenticated`** | 78 |
| Vistas | Una vista que expone columnas reservadas | Ninguna vista depende de las tablas reservadas (`pg_depend`); la vista de medicamentos solo de recetas | 78 |
| Estadísticas (`pg_stats`) | Valores frecuentes de columnas con RLS | PostgreSQL no las muestra a un rol sujeto a RLS en esa tabla; **se verifica**, no se asume | 78 |
| Auditoría de escritura | Contenido en `auditoria` (la lee el administrativo) | `registrar_auditoria_sin_contenido()` (H6b); una prueba busca un texto centinela | 78 |
| Registro de accesos | Contenido, o accesos fabricados | Solo ids y tipo `psicologia`; inserción solo de un psicólogo a cargo (D12) | 78 |
| Conteos y listados | «N notas», filtros por diagnóstico | Los contadores de la interfaz se calculan bajo RLS; **no se construye** ninguna búsqueda ni agregado de Psicología entre pacientes; los indicadores existentes (digitalización, visitas) son globales y sin desglose por especialidad ni autor | 78 y revisión |
| Mensajes de error | Nombres de tablas, valores, o distinguir «existe» de «no existe» | Mapeo de errores en español sin texto de la base; el mismo `42501` y el mismo 404 para «no existe» y «no autorizado»; los mensajes `HC07x` no dependen de datos de ninguna fila | `node:test` y 78 |
| Copia al paciente | Única ventana; fuga de existencia | Solo `compilar_copia_historia()` (D13); `incluye_psicologia` sin conteos; la cuenta de borradores excluidos es un agregado de todas las secciones | 74 de H6d y 78 |
| Derivaciones | Texto libre de Psicología en una derivación | H6b: un psicólogo deriva **sin `motivo`** (`HC024`); no existe columna de contenido; la prueba lo cruza | 78 |
| Medicamentos | Que la lista de otros filtre Psicología | La vista depende solo de `recetas`/`receta_items`; el psicólogo no receta (catálogo `profesiones_que_recetan` en «no»; si algún día cambia, la prueba 70 de H6c obliga a revisar); `atencion_id` de una receta no puede apuntar a una atención de otro autor (`HC033`) | 78 |
| Antecedentes y adjuntos | Salud mental escrita en tablas compartidas | Reserva por autoría también en esas tablas (D1) | 77 |
| Citas, agenda y recordatorios | `citas.motivo` y el texto de los correos de recordatorio (H5) | Sesiones de Psicología sin motivo clínico (D8); **el contenido del correo de recordatorio para citas de Psicología queda como pregunta U9** (el correo llega a una bandeja que puede ser compartida) | tarea 0.6 |
| Entornos de CI y previews | Ramas efímeras que copian `production` | Condición ya fijada por H6 (D1, punto 5) para levantar el bloqueo de datos reales; **mientras haya datos reales no se levanta** | — |

**Lo que ninguna base cierra, y se declara:**
- **La existencia de la atención psicológica.** Recepción ve las citas por especialidad y el profesional de la cita; el
  administrativo ve las asignaciones; el administrativo que revisa `accesos_historia` ve que un psicólogo abrió información
  reservada de un paciente; la copia guarda `incluye_psicologia`; quien toma una derivación sabe quién la creó. Este change
  protege el **contenido**, no el hecho. Si el usuario quiere ocultar también el hecho (U3), son decisiones de agenda, portal,
  derivaciones y auditoría que reabren H3, H6b y H6, no una política RLS.
- **Que recepción vea cuántas sesiones de un plan de Psicología faltan por agendar** (lista blanca de H6i, necesaria para
  agendar): sin texto, pero con la existencia y el ritmo del proceso.
- **Quien administra la base** (consola de Neon, rol dueño, respaldos): fuera de la garantía.
- **El eslabón humano del alta y la asignación.** El administrativo registra a los profesionales y su profesión (H2c) y concede
  asignaciones manuales (H6): un administrativo malintencionado podría registrar a un cómplice como psicólogo y asignarle un
  paciente. La profesión no se puede cambiar después, y todo queda en `auditoria`; el control compensatorio es la revisión
  periódica de altas de psicólogos y de asignaciones a psicólogos (pregunta U11: ¿doble control?).

### D10. Emergencia («romper el vidrio»): PREGUNTA ABIERTA PARA EL ASESOR; no se decide ni se construye (pregunta 4)

ADR-0031 deja abierto «qué ocurre en una emergencia». No se resuelve aquí. Lo que el diseño **hace hoy**, para que el asesor decida
con los hechos: **nadie** que no sea psicólogo a cargo puede leer la información de Psicología: ni otro profesional en una
urgencia, ni el administrativo, ni la dirección de la clínica; la única copia que sale del sistema es la del paciente (D13).
**No existe ninguna función, rol ni bandera para saltarse la restricción**, y una prueba de catálogo (D9) falla si alguien la añade
sin pasar por esta decisión.

Distinciones que el asesor debe ver: (1) **emergencia clínica del paciente** (una crisis con un médico que atiende y no puede ver
los antecedentes psiquiátricos); (2) **ausencia del psicólogo** (baja o emergencia del profesional, PRD y ADR-0011), que este
diseño ya cubre con la reasignación de citas y la asignación manual a otro psicólogo, sin saltarse la regla; (3) **riesgo para
terceros o deber de reporte** (no verificado).

Opciones a evaluar por el asesor (ninguna construida): (a) **ninguna excepción** (lo actual); (b) **acceso de emergencia** de
cualquier profesional con justificación obligatoria, límite de horas, registro inmediato en `accesos_historia` y aviso a los
psicólogos a cargo; (c) **solo un psicólogo de guardia**; (d) **un resumen de emergencia** mínimo (riesgo y medicamentos) en
lugar de la información completa. Cualquiera sería una función `SECURITY DEFINER` nueva y sería la parte más delicada del
sistema: exige una ADR, `code-review` y pruebas propias. **Mientras no haya respuesta, el sistema falla cerrado.**

### D11. Matriz por rol y por profesión (pregunta 5)

| Quien consulta | Lee Psicología | Escribe Psicología | Lee la historia compartida (no psicológica) | Ve medicamentos |
|---|---|---|---|---|
| **Psicólogo a cargo** | Sí | Sí | Sí | Sí |
| Psicólogo sin asignación vigente, vencida o dado de baja | No | No | No | No |
| **Médico a cargo** | **No** | No (`HC070`) | Sí | Sí |
| **Odontólogo, fisioterapeuta o podólogo a cargo** | **No** | No | Sí | Sí |
| Cualquier profesional sin el paciente a cargo | No | No | No | No |
| **Administrativo** | No | No | No | No (solo la copia, D13) |
| **Enfermera** | No | No | No | No |
| **Paciente** (incluido el titular) | No | No | No | No (la recibe en copia) |
| Sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad` | No | No | No | No |

La pruebas 77 y 78 repiten esta matriz fila por fila, con `has_table_privilege` de lo que no se concede.

### D12. Auditoría

- **Lectura.** Toda lectura de información de Psicología se registra **en la misma transacción** (H6 D2): modo → inserción en
  `accesos_historia` → lectura; si la inserción falla, no se devuelve nada. Se añade el valor **`psicologia`** a `tipo_acceso` para las lecturas de **las tablas de este change** (notas y evaluaciones); H6i
  registra `plan_sesiones` e `instrumento` para las lecturas de **sus** tablas, también las de Psicología (contrato cerrado, tarea 0.3), y una
  columna `registro_id uuid null` (sin clave foránea, como `atencion_id`; el identificador de la nota, de la aplicación del
  test o del plan que se abrió). Una política **restrictiva de `INSERT`** exige `psicologo_tiene_paciente(paciente_id)` cuando
  `tipo_acceso = 'psicologia'`: nadie fabrica accesos a Psicología (los tipos de H6i no distinguen el área: un acceso fabricado de
  tipo `plan_sesiones` o `instrumento` solo añade ruido a la auditoría, límite declarado). **Choque conocido:** H6, H6c, H6d y H6i
  también recrean la restricción de `tipo_acceso`; esta migración **lee la restricción vigente** (`pg_get_constraintdef`) y la recrea con la unión
  de sus valores y los nuevos (tarea 6.1); la prueba 56 de H6 se actualiza a propósito.
- **Escritura.** Las tablas nuevas usan `registrar_auditoria_sin_contenido()` (H6b); `atenciones`, `addendas` y `antecedentes` ya
  se auditan sin contenido con `registrar_auditoria()`. La fila de `auditoria` no lleva `paciente_id`: revela que un psicólogo
  escribió, no sobre quién ni qué.
- **Qué NO se registra:** el contenido, nunca; ni en `auditoria`, ni en `accesos_historia`, ni en los registros del servidor (solo el
  SQLSTATE y la operación). Los **intentos denegados** de un no psicólogo no dejan fila (RLS devuelve cero filas y la aplicación
  no distingue «no existe» de «no autorizado»); es la pregunta ya abierta de H6 (¿un registro de intentos en la base?) y aquí se
  hereda sin resolverse (U12).
- **Revisión por el administrativo.** La pantalla de accesos de H6 muestra estas filas como **«Información reservada»**, sin
  distinguir si fue una nota, un test o una evaluación (menos de lo que ya saben las citas); sigue mostrando quién, cuándo y de
  qué paciente (U13).

### D13. La copia al paciente incluye Psicología: clasificación y sección del compilado (H6d)

La copia **incluye** Psicología (decisión del usuario). La única función por la que el administrativo obtiene contenido es
`compilar_copia_historia()` de H6d (`SECURITY DEFINER`); este change **no añade ninguna otra** y le entrega:

- **Clasificación de las tablas nuevas** (tarea 6.4): `notas_sesion_psicologia` → sección «Psicología»; las tablas de H6i que este
  change declara reservadas → «Psicología». `atenciones`, `addendas`, `antecedentes` y `adjuntos_historia` ya están en el compilado
  de H6d: **las filas con autor psicólogo salen en la sección «Psicología» y no en «Atenciones»** (para que la carátula distinga
  lo reservado y `incluye_psicologia` sea exacto); el compilado filtra con `fila_de_psicologia()`.
- **Contenido de la sección «Psicología»:** evaluaciones firmadas con sus diagnósticos y datos de la plantilla etiquetados, addendas,
  notas de sesión **firmadas** (con las rectificaciones), aplicaciones de tests con respuestas, puntaje e interpretación, y el
  plan de sesiones (resumen). **Borradores: no entran**; la copia declara una **sola cuenta agregada** de borradores excluidos de
  todas las secciones, no por Psicología.
- **`incluye_psicologia`** se guarda en la solicitud **sin conteos** (H6d); el documento lleva el detalle bajo el sello. La
  solicitud, `accesos_historia` y `auditoria` no contienen texto clínico (prueba 74 de H6d, ampliada con textos centinela de
  Psicología en 78).
- **Preguntas para el asesor** (que H6d ya lista y aquí se agravan): ¿puede entregarse al paciente **toda** la información,
  incluidas las notas de sesión?; ¿qué cambia si el solicitante es un **representante** (sobre todo de un **adolescente**) o una
  autoridad?; ¿hay información que la norma protege aún más (notas de psicoterapia)? El compilado es una lista de secciones:
  excluir Psicología o parte de ella sería una migración de una línea (`create or replace`).
- Si H6d aún no está aplicado cuando se aplique este change, la sección se entrega a H6d como texto y prueba (tarea 6.4), y su
  prueba de cobertura la exige.

### D14. Aplicación: guarda por profesión, módulo único y errores

- **Guarda.** `lib/historias/guardia.ts` (H6) gana `exigirProfesion("psicologo")`: lee la profesión con **`profesion_actual()`**
  (la base), nunca de un claim ni del cliente. Un profesional de otra profesión que abre una ruta de Psicología recibe
  `notFound()`; la navegación (`lib/ui/navegacion.ts`) muestra «Psicología» **solo** a un psicólogo.
- **Rutas** (`Cache-Control: private, no-store` ya cubierto por `/profesional/pacientes/:path*`; `<title>` genérico «Historia
  clínica»; direcciones solo con `uuid`; páginas dinámicas): `.../pacientes/[pacienteId]/psicologia/` (panel: evaluaciones, notas,
  tests, plan), `.../notas/nueva`, `.../notas/[notaId]`, `.../tests/nuevo`, `.../tests/[aplicacionId]`, `.../plan/` (UI de H6i). La
  evaluación usa el formulario de atención de H6 con la plantilla de Psicología.
- **Módulo único:** todo SQL contra `notas_sesion_psicologia` y las lecturas de Psicología vive en `lib/historias/psicologia.ts`
  (dentro del módulo de H6); `tests/historias/acceso-unico.test.ts` se amplía con esos nombres. Cada función abre con
  `exigir_modo_clinico()` y registra el acceso antes de leer (D12).
- **Errores** (extienden la tabla de H6; nunca se muestra texto de la base):

| Origen | Mensaje al usuario |
|---|---|
| `HC070` (notas y plantilla) / `HC090` (tests y planes, de H6i) | «Solo un psicólogo puede registrar esta información.» |
| `HC071` | «La cita o la sesión indicada no corresponde a este paciente y a este psicólogo.» |
| `HC072` | «Esta nota ya está firmada. Para corregirla, registre una nota rectificatoria.» |
| `HC073` | «La nota que quiere rectificar no se puede rectificar.» |
| `HC074` | «La evaluación de Psicología debe usar la plantilla vigente de Psicología.» |
| `42501` (RLS) y rutas | «No tiene acceso a esta información.» / 404 (sin confirmar existencia) |
| `23514` | «Hay campos vacíos o inválidos. Revise el formulario.» |
| `HC002`, `HC004` | Los de H6 |
| otros | «No se pudo completar la operación. Intente de nuevo.» |

`HC075` a `HC079` quedan reservados.

### D15. Pruebas y verificación

- **pgTAP (sugeridas):** **77** `psicologia_aislamiento_rls` (matriz de D11 sobre **todas** las tablas reservadas, por rol y por
  profesión, con el caso «no sobre-bloqueo», la cascada de `addendas`, la reserva de antecedentes y adjuntos, y la restrictiva de
  `accesos_historia`) y **78** `psicologia_notas_y_canales` (estructura y reglas de `notas_sesion_psicologia`, plantilla,
  `HC070`–`HC074`, y los canales de D9: centinela en `auditoria`/`accesos_historia`/solicitud de copia, `pg_stats`, funciones,
  vistas, derivación del psicólogo, vista de medicamentos, receta, clasificación de tablas, errores uniformes). Cada una incluye
  el caso negativo de **cada** rol y de **cada profesión** (administrativo, enfermera, paciente, sin rol, `anonymous`,
  `cron_notificaciones`, `sync_identidad`; médico, odontólogo, fisioterapeuta y podólogo a cargo; psicólogo sin asignación,
  con asignación vencida y con perfil inactivo; otro psicólogo a cargo) y `has_table_privilege` de lo que no se concede. No asumen
  tablas vacías. El runner `scripts/ejecutar-pgtap.ts` gana las identidades `psicologo_a`, `psicologo_b`, `psicologo_c` (sin
  asignación), `odontologo_a`, `fisioterapeuta_a` y `podologo_a`.
- **Pruebas de catálogo (la red contra el olvido):** (i) toda tabla de `public` con columna `paciente_id`, `atencion_id` o
  `historia_id` está en una de tres listas escritas en la prueba, **con su razón**: *reservadas* (deben tener política
  restrictiva que llame a `fila_de_psicologia`), *compartidas por construcción* (su autor nunca puede ser psicólogo: `triajes`,
  `recetas`, `receta_items`) u *operativas* (`citas`, `asignaciones…`, `visitas`, `derivaciones`, `notificaciones`, `solicitudes_copia_historia`,
  `accesos_historia`…); una tabla nueva sin clasificar **falla la suite**; (ii) las funciones `SECURITY DEFINER` cuyo cuerpo menciona
  una tabla reservada son exactamente la lista de D9; (iii) ninguna vista depende de una tabla reservada; (iv) los
  disparadores de auditoría de las tablas reservadas usan las funciones sin contenido.
- **Verificación por mutación** (como en H2 y H6; lista en la tarea 9.2): para cada política, función y disparador nuevo se
  debilita temporalmente en un branch de desarrollo y se comprueba que alguna prueba negativa falla; se anota en el PR.
- **`node:test`:** esquemas Zod (nota, campos de la plantilla), mapeo de errores, orden de sentencias del repositorio con ejecutor
  simulado (modo → acceso → lectura; si el acceso falla no se devuelve contenido), acceso único ampliado, y la guarda por profesión.
- **Concurrencia:** dos rectificaciones simultáneas de la misma nota; firma contra edición simultánea del borrador.
- **E2E (Playwright, datos de demostración con textos centinela; cuentas de H1 con TOTP):** el psicólogo registra evaluación, nota,
  test y plan y los ve; el **médico, el odontólogo y el administrativo no ven** ningún marcador ni abren la dirección directa
  (404 idéntico al de un id inexistente); la copia incluye la sección (con H6d); axe sobre las pantallas.
- Antes de cerrar: agente `code-review` sobre todo el diff, con la lectura más estricta.

## Risks / Trade-offs

- [Una política restrictiva mal escrita bloquea la historia compartida o deja pasar lo reservado] → el caso «no sobre-bloqueo» de
  77, la lista de mutaciones de D3, `code-review` por grupo y la migración en un branch de desarrollo con la suite completa antes
  del PR.
- [El costo de dos llamadas a función por fila y política] → son búsquedas por clave primaria; la tarea 1.4 mide con `EXPLAIN
  ANALYZE` sobre un paciente con cientos de atenciones; si no cabe, se pasa a la variante M5 (columna sellada).
- [`fila_de_psicologia()` depende de `profesionales.profesion`] → inmutable por dos barreras (H2c) y falla cerrada; una profesión mal
  registrada se corrige con una migración que **cambia retroactivamente** la reserva de todo lo que firmó ese autor: esa migración
  exige `code-review` y comprobar los efectos en filas firmadas.
- [**Ventana de despliegue**] Entre la aplicación de H2c/H6 y la de este change, un psicólogo registrado escribiría información
  compartida → la tarea 0.1 verifica que **no hay profesionales con profesión `psicologo` ni filas de ese autor** al aplicar las
  migraciones 1 y 2; el plan de migración las aplica juntas.
- [El mecanismo se deshace con un `drop policy` o con una función definer nueva] → pruebas de catálogo (D9, D15) y revisión
  humana; no hay protección contra el rol dueño (declarado).
- [Las tablas de H6i se crean con nombres o autoría distintos de los supuestos] → el contrato de D7 y D8 se confirma en la tarea 0.3
  y la clasificación obligatoria (D15) detecta cualquier tabla con datos de paciente que no esté en una lista.
- [Los psicólogos pierden la posibilidad de compartir un antecedente o una alergia] → decisión consciente de empezar cerrado (D1);
  ampliar es una migración de una línea (U5).
- [El autor pierde sus notas si su asignación vence] → igual que hoy para toda la historia (ADR-0016); se mitiga con las citas de
  las sesiones y la asignación manual; el aviso en pantalla explica por qué.
- [La información de Psicología sale del sistema en la copia] → es decisión del usuario; el alcance real de la garantía se declara
  en H6d (D2) y las preguntas de D13 van al asesor.
- [Nada de esto está validado legalmente] → bloque del asesor; el change no entra en producción con datos reales.
- [Los instrumentos con licencia no verificada] → no se cargan hasta verificarlos; cargar uno es una migración con su referencia y fecha.
- [Los campos de la plantilla y de la nota son una propuesta mía] → tarea 0.8; cambiarlos antes de aplicar es editar la migración de
  datos aún no aplicada; después, una plantilla v2 (ADR-0029).

## Migration Plan

1. Grupo 0: confirmaciones (H6i, H6, H6d, H3), preguntas al usuario y al asesor, licencias y validación clínica; decisiones
   documentadas antes de código.
2. Migraciones nuevas, **posteriores** a las de H2c, H6, H6b, H6c y H6i, en este orden y cada una con su prueba: `psicologia-funciones-de-reserva` →
   `psicologia-politicas-compartidas` (restrictivas sobre `atenciones`, `addendas`, `antecedentes` y `adjuntos_historia`; **van juntas con la anterior en
   el mismo despliegue**) → `psicologia-plantilla` (columna `exige_profesion`, disparador `HC070`/`HC074`, especialidad, plantilla v1) →
   `notas-sesion-psicologia` → `psicologia-mecanismos-comunes` (restrictivas por autoría sobre `planes_de_sesiones` y `aplicaciones_instrumento` de H6i; los instrumentos se cargan aparte, uno por uno, tras verificar su licencia) →
   `accesos-historia-psicologia` (tipo `psicologia`, `registro_id`, restrictiva de inserción) → `compilado-copia-psicologia` (si H6d ya está
   aplicado). Nunca se edita una migración aplicada.
3. Suite pgTAP, concurrencia e integración completas en un branch de desarrollo; PR con branch efímero y los mismos pasos.
4. Aplicación: primero lógica y repositorio, luego pantallas cuando H2b esté aplicado.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones; el modo de datos sigue en `demostracion`. Sembrar psicólogos y
   datos sintéticos de Psicología en producción es una acción explícita del usuario.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027); un defecto se corrige con una migración nueva; prohibido restaurar el
   branch principal de Neon. **Nunca se «corrige» un defecto quitando una política restrictiva**: se corrige la función o se
   reemplaza la política, y se vuelve a pasar la suite.

## Open Questions

Ninguna cambia las especificaciones; las marcadas **(bloquea)** impiden el uso con datos reales, no la construcción.

**Para el asesor legal (el change sigue con datos de demostración mientras tanto):**
- **Reglas de salud mental (bloquea).** ¿Hay una categoría de datos más estricta, consentimiento específico, notas de psicoterapia
  separadas o limitaciones de acceso que este diseño no contempla?
- **Emergencia o «romper el vidrio» (bloquea).** D10: ninguna excepción, acceso de emergencia con justificación, psicólogo de guardia
  o resumen de emergencia; y deber de reporte.
- **Copia de Psicología.** Entrega completa al paciente, a un representante (adolescentes) y a una autoridad; D13.
- **Retención y eliminación** de las notas de sesión y los resultados, junto con P-1; **datos sensibles ante la ANPD** (banco de datos
  de salud mental) y consentimiento previo (Directiva 373, Anexo 07, no leído).
- **Tests:** licencia de cada instrumento (D7) y si basta una referencia escrita.

**Para el usuario o la clínica:**
- **U1. La fila de `atenciones` de un psicólogo se restringe entera (D1).** Confirmar.
- **U2. Qué ven los demás de un diagnóstico de Psicología (D4).** Recomendación A (nada, más los medicamentos).
- **U3. ¿Debe ocultarse el hecho mismo de que el paciente se atiende en Psicología?** Hoy no se oculta (D9); ocultarlo reabre H3, H6b y H6.
- **U4. El autor sin asignación vigente no conserva acceso propio** (D1), a diferencia de la lectura literal de ADR-0031.
- **U5. Antecedentes y adjuntos registrados por psicólogos quedan reservados** (D1), con la consecuencia sobre alergias y otros datos compartibles.
- **U6. Borradores de nota visibles solo para su autor** (D6.1) y borradores de evaluación visibles a los psicólogos a cargo.
- **U7. Un psicólogo a cargo ve las notas firmadas de otro psicólogo del mismo paciente.** ¿O deben ser privadas de su autor?
- **U8. Campos de la plantilla y de la nota, rótulos, instrumentos del catálogo y frecuencia por omisión de las sesiones** (tarea 0.8).
- **U9. Citas y recordatorios de Psicología:** ¿el correo de recordatorio nombra la especialidad? ¿se pide motivo al reservar?
- **U10. Hojas de tests en papel:** escanearlas exige la decisión de H6 sobre imágenes y adjuntos reservados; no se diseña aquí.
- **U11. Alta de psicólogos y asignaciones a psicólogos:** ¿doble control o revisión periódica? (D9, eslabón humano).
- **U12. Intentos denegados:** ¿registro en la base? (heredada de H6).
- **U13. Qué ve el administrativo en la revisión de accesos** a información reservada (D12).
- **U14. Riesgo alto y respuesta positiva a un ítem de riesgo:** el sistema no alerta (D5, D7); ¿qué protocolo existe en la clínica?
- **Plan abierto:** H6i exige un total de 1 a 60 sesiones (no hay planes sin fin): ¿basta ampliar o encadenar planes para una psicoterapia sin fin fijo?; **varias plantillas por especialidad** (D5, alternativa c).
