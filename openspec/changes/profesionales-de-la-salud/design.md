# Design

> **Nombres: sujetos a ADR-0030; si se rechaza, léase `medico`/`medicos`.** La
> [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) dio la dirección (rol `profesional`, tabla
> `profesionales`, `profesion`, `colegiatura`); este documento detalla el cómo. Si el usuario elige la alternativa «mantener
> `medicos` y añadir `profesion`», este change se reduce a la migración de D7 sobre `medicos` y desaparecen D2 a D6, D8, D9 y
> los grupos 2, 3, 5, 7, 9 y 10 de `tasks.md` (y parte del 6).

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (dos capacidades nuevas y una modificada). Estado
de partida, **verificado en el repositorio** de este worktree (rama `docs/prd-especialidades-recetas-triaje`, base `master`;
las ramas de H2b y de H3 aún no están en `master`):

- **Producción:** 24 migraciones de H2 aplicadas, 19 tablas con RLS, datos de demostración como mucho, `sync_identidad` con
  `LOGIN`. El despliegue de Vercel y la migración (`migrar-produccion.yml`) corren **en paralelo** al hacer merge a `master`; el
  propio workflow exige que «toda migración sea compatible hacia atrás con el código desplegado justo antes».
- **Código desplegado que toca el vocabulario:** solo `lib/auth/rol.ts` (tipo `Rol`, `RUTA_POR_ROL`, `exigirRol`),
  `lib/identidad/sincronizar-perfil.ts` (`ROLES`, `::public.rol_usuario`), el webhook de Clerk, `app/medico/page.tsx`,
  `types/globals.d.ts` y `app/page.tsx` (redirige con `rutaParaRol(rol)`: un rol desconocido produce `redirect(undefined)`).
  **Ninguna consulta desplegada lee `medicos`, `medico_id` ni sus funciones.** Por eso renombrar hoy no exige alias de nombres
  (D2); sí exige tolerar el valor `medico` del token (D5), que lo emite Clerk fuera de la transacción de la base.
- **Dónde se lee el rol:** en la base, un solo lugar, `public.rol_actual()` (`auth.session() -> 'publicMetadata' ->> 'rol'`);
  en la aplicación, un solo lugar, `obtenerRolSesion()`. Las pruebas pgTAP firman tokens con `publicMetadata.rol`
  (`scripts/ejecutar-pgtap.ts`).
- **Dependencias que PostgreSQL no rastrea:** el nombre de una tabla, columna o función renombrada se actualiza solo en lo
  que se guarda por identificador (políticas, restricciones, índices, privilegios, claves foráneas). **No** se actualiza dentro
  del texto de una función (`prosrc`) ni en un literal de texto de una política. De ahí que renombrar no baste (D1, D3).
- **Migraciones:** `node-pg-migrate` ^9 (ADR-0027), archivos SQL en `migrations/`, solo hacia adelante, nunca se edita una
  aplicada. El branch efímero de Neon de cada PR **copia `production`** (`neon-branch-pr.yml`): la migración de este change
  corre antes del merge sobre una copia de los datos reales de producción, que es el ensayo general.
- **Auditoría:** `registrar_auditoria()` convierte el rol del token con `v_rol::public.rol_usuario`; `auditoria.actor_rol` es
  del mismo tipo y es solo-agregar.
- **Los usuarios existentes** (cuentas de prueba de la instancia de Clerk y, si se sembró, los perfiles `mock_` de
  demostración) tienen `publicMetadata.rol = 'medico'` y `perfiles.rol = 'medico'`.

## Goals / Non-Goals

**Goals:**
- Generalizar «médico» a «profesional de la salud» en el esquema, la autenticación y el código **sin cambiar a quién se le
  concede o se le niega acceso**: un profesional a cargo ve lo mismo que ayer, y todo otro rol sigue sin ver nada.
- Que no exista ningún instante en que una tabla clínica quede sin RLS, con RLS a medias o con una política que apunte a un
  nombre inexistente, y que ningún usuario existente pierda acceso en ningún orden de despliegue.
- Que la profesión sea un dato de la base que el cliente no fije ni cambie, con un único punto de lectura.
- Que sea **demostrable** que la semántica de RLS no cambió (instantánea normalizada de políticas, suite pgTAP con la misma
  cantidad de pruebas y verificación por mutación).
- Dejar una ruta de salida cerrada: la tolerancia transitoria del valor `medico` tiene dueño, condición de retiro y prueba.

**Non-Goals:**
- Plantillas por especialidad (H6, ADR-0029), aislamiento de Psicología (ADR-0031), recetas y su permiso por profesión
  (H6c), triaje y derivaciones (H6b), tablas de especialidades y datos propios de cada una (H6e a H6h), copia de la historia
  (H6d).
- Pantallas de alta y baja de profesionales (H3, ítem 6): este change deja el modelo y sus reglas; la pantalla las usa.
- Resolver P-1 o P-5, declarar validez legal de una colegiatura, o decidir qué profesiones pueden recetar.
- Cambiar la lógica de acceso de `profesional_tiene_paciente()`; la mejora de `perfiles.activo` es de H6 (`historias-clinicas`,
  tarea 3.4) y se aplica **sobre** el nombre nuevo.
- Cambiar las políticas de `pacientes`, `notificaciones`, `auditoria` o `turnos_enfermeria` más allá de lo necesario para el
  vocabulario.

## Decisions

### D1. Inventario verificado de lo que hoy asume «médico»

Obtenido leyendo las 24 migraciones, `tests/`, `lib/`, `app/`, `scripts/`, `e2e/`, `types/`, `.github/` y `.env.example`. Las
**ramas sin mergear** (`feat/h3-fundamentos-acciones`, que incluye H2b) se leyeron con `git grep` y se listan aparte porque
se reconcilian al rebasar. Los nombres automáticos de restricciones y de índices se derivan de las reglas de nombres de
PostgreSQL; **la tarea 1.2 los confirma contra el catálogo antes de escribir la migración**.

**Base de datos (migraciones de H2, que no se editan):**

| Objeto | Archivo de migración | Qué cambia |
|---|---|---|
| Tipo `rol_usuario`, valor `medico` | `1791433252931_extensiones-y-tipos.sql` | `RENAME VALUE` → `profesional` (D4) |
| `rol_actual()` | `1791433405941_funcion-rol-actual.sql` | Cuerpo: mapea el valor heredado (D5) |
| Tabla `medicos` (`cmp`, `especialidad_id`, `activo`, `perfil_id`) | `1791435573633_identidad-y-personas.sql` | → `profesionales`; `profesion` y `colegiatura` (D7) |
| `medico_actual()` | `1791435618101_funciones-de-identidad.sql` | → `profesional_actual()`, cuerpo reescrito (D8) |
| Política `perfiles_lee_los_medicos` | `1791435781030_politicas-perfiles.sql` | Nombre y literal `'medico'` |
| Políticas `especialidades_lee_todo_rol`, `medicos_lee_todo_rol`, `medicos_inserta_el_administrativo`, `medicos_actualiza_el_administrativo` | `1791435877611_politicas-personal.sql` | Literal; nombre (las tres de `medicos`) |
| `disponibilidades.medico_id`, `bloqueos_agenda.medico_id`, `citas.medico_id`, restricciones `citas_sin_cruce_medico` y `bloqueos_agenda_medico_id_rango_excl`, índice `citas_medico_inicio_idx` | `1791436194730_agenda-y-citas.sql` | Columna, restricción, índice |
| `validar_cancelacion()` (usa `old.medico_id`, `b.medico_id`) | `1791436313650_validar-cancelacion.sql` | Cuerpo reescrito |
| Política `"medico ve su agenda"` | `1791436410965_politicas-citas.sql` | Nombre, literal, columna, función |
| Políticas `disponibilidades_lee_todo_rol`, `bloqueos_lee_el_medico_propio` | `1791436490579_politicas-disponibilidad-y-bloqueos.sql` | Literal; nombre |
| `atenciones.medico_id`, `addendas.medico_id`, índice `atenciones_medico_idx` (`antecedentes.registrado_por` ya es genérico: **no cambia**) | `1791436730253_historias-clinicas-tablas.sql` | Columnas, índice |
| Tabla `asignaciones_paciente_medico` (`medico_id`), `medico_tiene_paciente()`, `extender_asignacion_por_cita()` | `1791436932656_asignaciones-y-acceso-del-medico.sql` | Tabla, columna, funciones (cuerpos reescritos) |
| Políticas `historias_lee_el_medico_a_cargo`, `atenciones_lee_el_medico_a_cargo`, `atenciones_registra_el_medico`, `atenciones_actualiza_el_autor`, `addendas_lee_el_medico_a_cargo`, `addendas_registra_el_medico` | `1791437035148_politicas-historias-clinicas.sql` | Nombre y literal |
| Políticas `antecedentes_lee_el_medico_a_cargo`, `antecedentes_registra_el_medico`, `antecedentes_actualiza_el_medico_a_cargo`, `asignaciones_lee_el_medico_propio` | `1791437149424_inmutabilidad-y-antecedentes.sql` | Nombre y literal |
| Políticas `pacientes_lee_el_medico_con_relacion` y `cie10_lee_todo_rol` | `1791437236601_pacientes-del-medico-y-cie10.sql` | Nombre y literal; literal |
| `turnos_enfermeria.medico_id` | `1791437403857_turnos-enfermeria.sql` | Columna |
| Política `accesos_registra_el_medico` | `1791437480859_auditoria-y-accesos-historia.sql` | Nombre y literal |
| `registrar_auditoria()` (lista `'medico'` y conversión al enum) | `1791437530094_disparadores-de-auditoria.sql` | Cuerpo reescrito; **sin esto toda escritura auditada de un profesional fallaría** (D4) |

Resumen: **2 tablas** y **7 columnas `medico_id`** renombradas; **2 restricciones** y **2 índices** con `medico` en el nombre
más las restricciones automáticas de `medicos`, `asignaciones_paciente_medico` y de las claves foráneas `*_medico_id_fkey`;
**6 cuerpos de función** reescritos (`rol_actual`, `medico_actual`, `medico_tiene_paciente`, `extender_asignacion_por_cita`,
`validar_cancelacion`, `registrar_auditoria`); **21 políticas** tocadas (19 con el literal `'medico'` en su expresión y 2 solo
de nombre). Sin vistas, dominios, comentarios (`comment on`) ni secuencias afectadas. Los `GRANT` de tabla y de columna
acompañan al renombre sin acción. `cron_notificaciones` solo lee `citas` (concesión de tabla): no cambia.

**Pruebas pgTAP (`tests/pgtap/`), 24 de los 26 archivos mencionan «médico»** (41 y 99 no): detalle en D11.

**Aplicación y scripts (este worktree):**

| Archivo | Qué asume | Cambio |
|---|---|---|
| `lib/auth/rol.ts` | `Rol` con `"medico"`, `RUTA_POR_ROL.medico = "/medico"` | Rol `profesional`, `/profesional`, normalizador del valor heredado |
| `types/globals.d.ts` | `publicMetadata.rol` con `"medico"` | Unión con `profesional`; el heredado solo como entrada |
| `lib/identidad/sincronizar-perfil.ts` | `ROLES` con `"medico"`; `rolDesdeMetadata` | `profesional`; el heredado se mapea |
| `app/api/webhooks/clerk/route.ts` | Alta: `paciente` si no hay rol | Rol heredado de invitación → corrige el metadato de Clerk |
| `app/medico/page.tsx` | `exigirRol("medico")`, título «Panel del médico» | `app/profesional/page.tsx`, `exigirRol("profesional")` |
| `app/page.tsx`, `app/enfermera/page.tsx`, `app/administrativo/page.tsx`, `app/paciente/page.tsx` | Indirectos, vía `rutaParaRol` | Sin cambio propio (protegidos por el normalizador) |
| `scripts/invitar-personal.ts` | `ROLES_PERSONAL` con `medico` | `profesional`; acepta `medico` con aviso durante la transición |
| `scripts/ejecutar-pgtap.ts` | Identidades `medico_a`, `medico_b` con rol `medico` | Renombre y identidades nuevas (D11) |
| `scripts/sembrar-datos-demo.ts` | `medicos`, `cmp`, `medico_id`, `E2E_MEDICO_EMAIL`, rol `medico` | Tablas, columnas, `profesion`, variable con respaldo |
| `scripts/comprobar-datos-demo.ts` | `medicos`, `cmp`, `medico_id`, rol `medico` | Ídem |
| `tests/concurrencia/10_doble_reserva.test.ts` | Inserta en `medicos` y `citas.medico_id` | Renombre |
| `tests/integracion/sincronizar-perfil.test.ts` | `rol: "medico"`, `rolDesdeMetadata({ rol: "medico" })` | `profesional` y caso del valor heredado |
| `e2e/roles.spec.ts` | `AREAS` con `/medico`, ruta prohibida `/medico` | `/profesional` y redirección de `/medico` |
| `.env.example` | `E2E_MEDICO_EMAIL`, `E2E_MEDICO_PASSWORD` | `E2E_PROFESIONAL_*` |
| `.github/workflows/*.yml` | Sin referencias | Sin cambio (se verificó con búsqueda) |

**En ramas sin mergear (a reconciliar al rebasar; `git grep` sobre `feat/h3-fundamentos-acciones`):**
`lib/auth/accion-personal.ts` (`RolPersonal = "administrativo" | "medico"`, y la comparación `rol !== rolRequerido` sobre el
claim crudo), `lib/schemas/{agenda,cita}.ts` (campo `medico_id`), `lib/citas/errores.ts` (traduce por SQLSTATE, **no** por
nombre de restricción, así que el renombre de restricciones no la rompe), `components/clinica/navegacion.tsx`,
`lib/ui/navegacion.ts` y `lib/ui/ejemplos.ts` (H2b: `/medico`, `/medico/jornada`, `/medico/pacientes`), `app/medico/layout.tsx`
(`ConsolaLayout rol="medico"`), `app/enfermera/page.tsx` (texto), y `tests/agenda/*.test.ts`.

**Documentos (los edita el grupo 11 al aplicar):** `docs/TECH-DESIGN.md` (68 menciones: tipo, tablas, funciones, políticas,
tabla de rutas, pruebas), `docs/pruebas-sql.md` (lista de identidades), `docs/datos-demo.md`, `docs/verificacion-h1.md`
(histórico: nota, no reescritura), `docs/pruebas-e2e.md`, `.env.example`, ADR-0003, 0015, 0016, 0022 y 0023 (nota
fechada), `CLAUDE.md` (tabla de roles ya al día; solo el «Estado actual», que es del orquestador) y los changes existentes
(D12).

### D2. Renombrar frente a mantener nombres con alias de compatibilidad

**Decisión:** renombrar, **sin alias de nombres** (ni vistas `medicos`, ni la función `medico_tiene_paciente()` como envoltorio
de la nueva). Se tolera, en cambio, **un valor de dato** (el claim `medico`) durante un plazo acotado (D5).

**Por qué:**
- Ninguna consulta desplegada usa los nombres viejos (D1), así que un alias no protege a nadie. El único código que los
  usará es el que se escribe después.
- Un alias es una **segunda puerta** al núcleo de seguridad: un envoltorio `SECURITY DEFINER` de `profesional_tiene_paciente()`
  con `EXECUTE` para `authenticated` duplica la superficie más sensible del proyecto, y una vista `medicos` necesitaría su
  propio `security_invoker`, sus `GRANT` y su prueba negativa por rol. Habría que acordarse de retirarlos.
- El alias deja justo el «nombre engañoso en el núcleo de seguridad» que la ADR-0030 quiere eliminar.

**Alternativas descartadas:** (a) **mantener `medicos` y añadir `profesion`** (alternativa 1 de la ADR): el menor cambio, pero un
odontólogo viviría en `medicos`; queda como plan B del usuario (nota al inicio). (b) **Renombrar con vistas y envoltorios y
retirarlos después** (expandir/contraer en SQL): válido si hubiera código desplegado leyendo los nombres viejos; no lo hay.
(c) **Copiar a una tabla nueva `profesionales` y dejar `medicos`**: obliga a mover 9 claves foráneas y a mantener dos fuentes de
verdad sin ninguna ganancia. (d) **Renombrar solo la tabla y las funciones, dejando `medico_id`**: deja `citas.medico_id`
apuntando a `profesionales`, y H3 está a punto de escribir sus consultas contra esa columna: es el momento más barato.

### D3. Estrategia de migración: una transacción, ninguna ventana, autocomprobación

PostgreSQL ejecuta el DDL dentro de la transacción: `RENAME`, `ALTER POLICY` y `CREATE OR REPLACE FUNCTION` son atómicos y, hasta
el `COMMIT`, las demás sesiones ven el esquema anterior completo (las que toquen una tabla renombrada esperan su bloqueo
exclusivo y luego ven el esquema nuevo completo). **No existe un estado intermedio observable.** Las políticas guardan sus
referencias por identificador, así que siguen a las tablas, columnas y funciones renombradas. Esa propiedad solo aguanta si
**todo** el renombre cabe en **una** migración (archivo): dos archivos podrían confirmarse por separado.

Tres migraciones, en este orden, **nuevas** (se crean con `npm run migrate -- create`; nunca se editan las de H2):

1. **`rol-y-tabla-profesional` (M1, el renombre).** Un solo archivo. Orden interno, comprobado contra D1:
   1. `set local lock_timeout = '10s'` (si otra transacción retiene un bloqueo, la migración falla entera en vez de dejar la
      aplicación esperando; se reintenta).
   2. `alter type rol_usuario rename value 'medico' to 'profesional'` (D4).
   3. `create or replace function public.rol_actual()` con la tolerancia del valor heredado (D5).
   4. `alter table … rename` de las dos tablas, `rename column medico_id to profesional_id` en las siete tablas, y `rename
      constraint` / `alter index … rename` de las restricciones e índices del inventario (los que respaldan una restricción
      se renombran con ella).
   5. `alter function … rename` de `medico_actual()` y `medico_tiene_paciente(uuid)` (conservan identificador, dueño,
      privilegios, `SECURITY DEFINER` y `search_path`), y después `create or replace` con los cuerpos nuevos de las seis
      funciones (D8).
   6. `alter policy … rename to` y `alter policy … using / with check` de las 21 políticas (D9).
   7. **Autocomprobación** (bloque `do $$`): lanza una excepción, y por tanto revierte **toda** la migración, si queda algún
      residuo de `medic` (sin distinguir mayúsculas ni contar las menciones con tilde) en nombres de tablas, columnas,
      funciones, políticas, restricciones, índices, disparadores o etiquetas de enum del esquema `public`, en las expresiones
      de las políticas o en el cuerpo de las funciones, con una sola excepción permitida: `rol_actual()`. Es la red contra el
      error humano de omitir un objeto del inventario.
2. **`profesion-y-colegiatura` (M2).** Aditiva y sin riesgo de ventana: tipo `profesion_salud`, columnas, restricciones,
   privilegio por columna, disparadores, `profesion_actual()` (D7, D13).
3. **`retirar-tolerancia-rol-medico` (M3, posterior).** Restituye `rol_actual()` estricta. Se crea y se aplica solo después
   de verificar la migración de usuarios (D6; grupo 10 de `tasks.md`).

**Verificaciones de que no hay ventana** (grupo 2): (a) **instantánea normalizada** de `pg_policies` (nombre de política,
tabla, comando, roles, `qual`, `with_check`), de los privilegios por tabla y por columna y de `pg_proc` (propietario,
`prosecdef`, `proconfig`, ACL) **antes y después** de M1, con `medico`→`profesional` aplicado al «antes»: la diferencia debe
estar vacía salvo la lista de cambios intencionales de D5 y D8; (b) **ensayo de atomicidad con dos sesiones** en un branch de
desarrollo: una sesión ejecuta M1 y retiene la transacción abierta unos segundos; otra, autenticada con un token de
profesional y con otro de paciente, consulta `atenciones`, `citas` y `profesionales` en bucle; cada observación debe ser o
bien el esquema anterior completo o bien una espera seguida del esquema nuevo completo, nunca un error de relación inexistente
ni una fila de más; (c) **aplicar M1 sobre el branch efímero del PR**, que es una copia de `production`, y correr la suite
completa; (d) una **migración de prueba que falla a la mitad** demuestra que `node-pg-migrate` revierte todo el archivo.

*Alternativas descartadas:* (a) varias migraciones pequeñas (una por tabla): cada una se confirmaría sola y habría estados
intermedios con políticas viejas sobre tablas nuevas; (b) renombrar primero y reescribir políticas en un despliegue posterior:
mientras tanto, el literal `'medico'` seguiría comparándose contra un `rol_actual()` que ya no lo devuelve: nadie vería nada
(falla cerrada, pero con todos los profesionales fuera); (c) migración en dos fases con una tabla puente: complejidad sin
beneficio (D2).

### D4. El tipo `rol_usuario`: renombrar el valor, no añadir otro

**Decisión:** `alter type rol_usuario rename value 'medico' to 'profesional'` en M1.

**Por qué:** es atómico, conserva el identificador interno del valor (las filas de `perfiles.rol` y de `auditoria.actor_rol`
y las constantes de enum guardadas en las políticas siguen siendo válidas) y no deja una etiqueta muerta. `perfiles.rol` queda
correcto sin ningún `UPDATE` (un `UPDATE` de `rol` activaría `bloquear_cambio_de_rol()`, que solo admite al administrativo o a
`sync_identidad`, y el dueño que migra no es ninguno de los dos).

**Efectos que hay que escribir y probar:**
- `registrar_auditoria()` convierte el rol del token con `v_rol::public.rol_usuario`: tras el renombre, `'medico'::rol_usuario`
  **falla** y con él toda escritura auditada de un profesional (el disparador es `AFTER`, el error revierte la escritura). Su
  cuerpo se reescribe en M1 y la prueba 64 lo ejercita.
- **Las filas históricas de `auditoria` con `actor_rol = 'medico'` pasan a mostrar `profesional`.** La tabla es solo-agregar y
  no se toca ninguna fila: cambia la etiqueta del tipo. Las filas de `auditoria` sobre `asignaciones_paciente_medico` conservan
  ese nombre en `tabla`; las nuevas dirán `asignaciones_paciente_profesional`. Cualquier consulta de revisión (H6, H7) debe
  contemplar ambos. Se documenta en la cabecera de M1 y en `docs/pruebas-sql.md`. <!-- REVISAR: confirmar que el cliente acepta que la etiqueta histórica cambie; la alternativa es añadir un valor y dejar `medico` como etiqueta muerta para siempre, con las desventajas de abajo. -->

*Alternativas descartadas:* (a) `add value 'profesional'` + `update` de los perfiles + dejar `medico` para siempre: PostgreSQL no permite
quitar un valor de un enum, el `update` choca con `bloquear_cambio_de_rol()`, el valor nuevo no se puede usar en la misma
transacción que lo crea (obligaría a dos migraciones) y se pueden asignar por error el valor muerto; (b) crear un tipo nuevo y
convertir columnas: reescribe `perfiles` y `auditoria` y todas las políticas con constantes de enum; (c) pasar el rol a `text`:
pierde la validación de la base.

### D5. El claim `publicMetadata.rol`: tolerancia transitoria y orden de despliegue

**El problema.** Tres sistemas cambian de forma independiente y sin transacción común: la base (la migración corre al hacer
merge), la aplicación (Vercel despliega en paralelo) y Clerk (el metadato de cada usuario y los tokens ya emitidos, que dejan
de ser válidos solos al renovarse; su vida por defecto es de 60 s <!-- REVISAR: confirmar en la instancia de Clerk -->). No hay
orden de merge que evite el desfase, y un profesional con sesión abierta no debe quedarse fuera.

**Decisión: expandir, migrar, contraer sobre el **valor** del claim** (no sobre los nombres de objetos, D2).

- **Fase 1, expandir (este PR).** `rol_actual()` devuelve `profesional` cuando el claim es exactamente `medico` y el valor tal
  cual en cualquier otro caso (un rol desconocido, `Medico` o `MEDICO` siguen sin conceder nada). La aplicación hace lo mismo
  en su único punto de lectura (`obtenerRolSesion()`), de modo que `exigirRol`, `exigirPersonal` (H3) y `app/page.tsx` reciben
  siempre el rol canónico. `rolDesdeMetadata` del webhook acepta ambos valores. `/medico/**` redirige a `/profesional/**`.
  Con esto un token antiguo (`medico`) y uno nuevo (`profesional`) valen igual en la base y en la aplicación.
- **Fase 2, migrar (paso manual, D6).** Solo cuando el despliegue de Fase 1 esté `READY` **y** M1 aplicada, el script actualiza
  el metadato de cada usuario de Clerk.
- **Fase 3, contraer (M3 + código, grupo 10).** Cuando el script `--verificar` informe cero usuarios e invitaciones con `medico`
  y haya pasado más que la vida del token, M3 restituye `rol_actual()` estricta y el código retira el normalizador y la
  redirección. Una prueba negativa fija que un token con `medico` ya **no** concede nada.

**Por qué no es un riesgo de privilegios:** `publicMetadata` solo lo escribe el servidor (la invitación de personal y el
webhook); ningún cliente puede fijarlo. Aceptar `medico` como `profesional` concede exactamente lo que esa persona ya tenía.
La prueba 64 verifica que la correspondencia es solo `medico`→`profesional`.

Estados posibles durante el despliegue (todos conservan el acceso salvo el marcado, que el orden prohíbe):

| Base | Aplicación | Claim del token | Resultado |
|---|---|---|---|
| nueva | anterior (H1) | `medico` | Funciona: la base lo acepta; la aplicación anterior lee `medico` y su `/medico` existe |
| nueva | anterior (H1) | `profesional` | **Falla** (la aplicación anterior no conoce el rol y `redirect(undefined)` rompe `app/page.tsx`). **Por eso la Fase 2 no empieza hasta que el despliegue nuevo esté `READY`** |
| anterior | nueva | `medico` | Funciona (la base anterior entiende `medico`; la aplicación nueva lo normaliza). Un evento del webhook con rol `profesional` puede fallar con 5xx hasta que M1 termine: Svix reintenta y nadie pierde acceso |
| nueva | nueva | `medico` o `profesional` | Funciona |

En la práctica la migración tarda segundos y el despliegue uno o dos minutos, pero el diseño **no depende** de ese orden.

*Alternativas descartadas:* (a) **ventana de mantenimiento con cierre de sesión de todos**: simple con pocas cuentas, pero impone el
bloqueo que se quiere evitar y contradice la regla de compatibilidad hacia atrás de `migrar-produccion.yml`; (b) **dejar `medico`
para siempre en el token y mapearlo en la base y en la aplicación**: no exige script de Clerk, pero fija dos vocabularios en el
núcleo de seguridad y el claim dejaría de coincidir con `perfiles.rol`; (c) **leer el rol de `perfiles.rol` en vez del token**:
reabre la ADR-0023; (d) **un metadato adicional `profesional: true`** en Clerk: duplica la fuente del rol.

### D6. Usuarios existentes: script de Clerk, webhook de alta y sincronización

**Qué hace la migración de la base:** `perfiles.rol` queda en `profesional` sola (D4). No depende de que el webhook funcione ni de
la suscripción `user.updated` de Clerk (tarea manual 8.4 de H2, aún abierta).

**`scripts/migrar-rol-profesional.ts`** (Node 24, como los demás; `node --env-file=.env.local …`):
- `--dry-run` (por defecto, sin escribir): recorre los usuarios de Clerk con paginación, cuenta los que tienen
  `publicMetadata.rol = 'medico'` y los ya migrados, y lista invitaciones pendientes con ese rol. Imprime **solo recuentos e
  identificadores de Clerk, nunca correos ni nombres** (los datos personales de `perfiles` solo se consultan como agregados).
- `--confirmar`: para cada usuario con `medico` llama a `updateUserMetadata(id, { publicMetadata: { rol: "profesional" } })`
  (fusiona las claves, conserva el resto de metadatos). Idempotente: una segunda corrida encuentra cero. Si una llamada falla,
  sigue con el siguiente, informa los fallidos y termina con código distinto de cero.
- `--verificar`: informa cuántos usuarios de Clerk tienen `medico`, cuántos `profesional`, y compara con
  `perfiles.rol = 'profesional'` por **conteo**. Salida 0 solo si no queda ninguno con `medico`.
- No banea, no revoca sesiones y no toca otros metadatos. Cada actualización dispara `user.updated`, que el webhook sincroniza sin
  efecto (el espejo ya está al día).
- **Invitaciones pendientes** creadas antes del cambio llevan `publicMetadata.rol = 'medico'`. Al aceptarse, `user.created`
  llega con el valor heredado: el webhook lo sincroniza como `profesional` **y** corrige el metadato de Clerk (el mismo
  mecanismo que ya usa para fijar `paciente`). El script las lista para que se revoquen y se vuelvan a emitir con
  `invitar-personal.ts <correo> profesional`. <!-- REVISAR: confirmar en la API de Clerk que el metadato de una invitación pendiente no se puede editar; si se puede, el script lo actualizaría. -->
- `scripts/invitar-personal.ts` pasa a ofrecer `profesional`; mientras dure la transición acepta `medico` con un aviso y lo
  convierte. **La profesión no se pasa en la invitación** (D7): la fila de `profesionales` la crea el administrativo.

*Prueba:* un cliente de Clerk simulado verifica `--dry-run` sin escrituras, `--confirmar` idempotente, tolerancia a fallos
parciales y que ninguna salida contiene correos (tests de `node:test`).

### D7. La profesión es un dato de la base que el cliente no controla

**Modelo (M2).** Tipo `profesion_salud` con `medico`, `odontologo`, `fisioterapeuta`, `psicologo`, `podologo`. En
`profesionales`: `profesion profesion_salud not null` (se añade con valor por defecto `medico` solo para los registros existentes,
que son todos médicos, y se quita el valor por defecto: **todo alta nueva declara la profesión**); `cmp` pasa a `colegiatura`
(`text not null` con `texto_con_contenido`); la unicidad global de `cmp` pasa a `unique (profesion, colegiatura)` porque
colegios distintos pueden repetir un número. <!-- REVISAR: cómo se numeran las colegiaturas de cada profesión y si dos profesiones comparten colegio (p. ej. fisioterapeuta y podólogo) es una pregunta abierta; la unicidad por profesión no bloquea datos válidos. -->

**Quién la fija y por qué el cliente no puede:**
1. **No viaja en el token ni en Clerk.** Ni `publicMetadata`, ni la invitación, ni ningún parámetro de petición. La única fuente es
   `profesionales.profesion`. La función `profesion_actual()` (`SECURITY DEFINER`, `search_path` vacío, `EXECUTE` solo a
   `authenticated`) la lee por el perfil del token y **no lee ningún claim de profesión**: una prueba con un token que traiga un
   claim `profesion` falso demuestra que se ignora.
2. **Solo el administrativo la registra** (política de `INSERT` existente) y la ve cualquier sesión con rol válido (el paciente la
   necesita para elegir profesional). Profesional, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y
   `sync_identidad` no pueden insertar (los dos últimos ni siquiera tienen privilegios).
3. **No se modifica después, con dos barreras independientes** (el patrón de `perfiles.rol`): (a) **privilegio por columna**: se
   sustituye el `UPDATE` de tabla por `update (colegiatura, especialidad_id, activo)`, así que tocar `profesion` o `perfil_id`
   falla con `42501` antes de evaluar la RLS, para cualquier rol de usuario; (b) **disparador `proteger_profesional()`**
   (`BEFORE UPDATE`, `SECURITY INVOKER`, `search_path` vacío) que, si `current_user = 'authenticated'`, rechaza cambiar
   `profesion` o `perfil_id` con `SQLSTATE HC010`, aunque alguien ampliara el `GRANT` más adelante. El dueño (migraciones) no
   queda bloqueado: **una profesión mal registrada se corrige con una migración revisada**, no con una pantalla. Se justifica
   porque la profesión decide quién lee las notas de Psicología (ADR-0031) y quién puede recetar: reinterpretar a posteriori
   las notas firmadas de un autor cambiaría su acceso.
4. **Coherencia con el rol al alta.** El mismo disparador, en `INSERT`, exige que `perfiles.rol = 'profesional'` para el
   `perfil_id` indicado (`SQLSTATE HC011`), de modo que no haya filas de profesional atadas a un paciente o a un administrativo.
   El orden natural (invitar, el webhook crea el perfil, el administrativo registra al profesional) lo cumple.
   <!-- REVISAR: no se prevé qué pasa si el rol del perfil cambia después; ver Preguntas abiertas. -->
5. **Auditoría:** `profesionales_auditoria` (`registrar_auditoria()`, `AFTER INSERT OR UPDATE OR DELETE`) deja quién, cuándo y los
   estados anterior y nuevo. No es una tabla clínica: se guardan los valores.

*Alternativas descartadas:* (a) **claim `profesion` en el token**: lo controlaría una configuración de Clerk, no la base; (b)
**función `SECURITY DEFINER` `corregir_profesion()` para el administrativo**: obliga a comprobar que no existe nada firmado por ese
profesional en cada tabla clínica presente y futura (H6, H6c…), un acoplamiento frágil; (c) **permitir al administrativo editar
`profesion`**: un error o una cuenta comprometida cambiarían el acceso a Psicología; (d) **una tabla por profesión**: descartada por
la propia ADR-0030; (e) `text` con `CHECK` en vez de enum: se pierde la coherencia con el resto del esquema (`rol_usuario`,
`tipo_documento`), y añadir una profesión sigue siendo un `alter type … add value` revisado.

### D8. Renombrar las funciones centrales sin abrir una ventana sin RLS

`profesional_actual()` y `profesional_tiene_paciente(uuid)` se obtienen **renombrando** las funciones existentes
(`alter function … rename to`) y reemplazando después su cuerpo con `create or replace` **dentro de M1**. Así: (1) las políticas que
las invocan lo hacen por identificador y las siguen sin reescribirse; (2) conservan dueño, `SECURITY DEFINER`,
`search_path = ''` y la ACL (`EXECUTE` solo a `authenticated`; `PUBLIC` revocado), que el `create or replace` mantiene y que M1
vuelve a afirmar explícitamente; (3) no existen dos funciones a la vez; (4) todo ocurre en una transacción (D3).

**Equivalencia a revisar:** el cuerpo nuevo de `profesional_tiene_paciente()` es el de `medico_tiene_paciente()` con tres
sustituciones de identificador (`asignaciones_paciente_medico`→`asignaciones_paciente_profesional`, `medicos`→`profesionales`,
`medico_id`→`profesional_id`, y la llamada a `medico_actual()`→`profesional_actual()`); la comprobación de fechas de Lima, de
`activo` y de asignación vigente es idéntica. El PR muestra ambos cuerpos lado a lado. Lo mismo para `extender_asignacion_por_cita()`
y `validar_cancelacion()` (solo `medico_id`). Cualquier cambio de lógica va en otro change (la condición `perfiles.activo` es de H6).

`profesion_actual()` es nueva (M2): devuelve la profesión del profesional autenticado o nulo. Es el **único** punto de lectura de la
profesión que reutilizarán H6 (plantilla y autor), H6c (permiso de recetar) y ADR-0031 (psicólogo a cargo). <!-- REVISAR: si H6/H6c prefieren una función propia, se retira; se incluye aquí para que no haya cuatro formas distintas de leer la profesión. -->

*Alternativas descartadas:* (a) **función nueva + repuntar políticas + borrar la anterior**: durante la transición coexisten dos
puertas al acceso clínico y se reescriben las 21 políticas dos veces; (b) **envoltorio con el nombre viejo**: D2.

### D9. Políticas RLS: reescritura exhaustiva y verificable

Las 21 políticas del inventario se renombran con `alter policy … rename to` y, las 19 con literal, se reescriben con `alter policy …
using (…) with check (…)` copiando **exactamente** su expresión actual con las únicas sustituciones `'medico'`→`'profesional'`,
`medico_id`→`profesional_id`, `medico_actual()`→`profesional_actual()` y `medico_tiene_paciente(`→`profesional_tiene_paciente(`. No cambia
el comando, los roles destino ni la estructura `(select …)` que fuerza `InitPlan`. La política `perfiles_lee_los_profesionales`
compara contra la constante de enum, que sigue por identificador tras D4, pero se reescribe igualmente para su lista
`rol_actual() in (…)`.

**Prueba de que no cambió la semántica:** la instantánea normalizada de D3 (diferencia vacía) y la suite 20 a 60 con la misma
cantidad de pruebas. El caso negativo de cada rol sobre cada tabla clínica ya existe (`43`, `45`, `46`, `52`); no se pierde ninguno.

### D10. Aplicación, rutas y validación

- **Un normalizador único** en `lib/auth/rol.ts`: recibe el claim crudo y devuelve el rol canónico (`medico`→`profesional`; nulo
  si no es uno de los cuatro). `obtenerRolSesion()` y, cuando se mergee, la guarda `exigirPersonal` de H3 lo usan: **nadie lee
  `sessionClaims.publicMetadata.rol` directamente.** Una prueba (`node:test`) recorre `app/` y `lib/` y falla si otro archivo lo
  lee crudo (mismo estilo que la prueba de acceso único de H6).
- **Ruta:** `app/medico/**` → `app/profesional/**`; el título pasa a «Panel del profesional»; `next.config.ts` añade una redirección
  temporal `/medico/:path*` → `/profesional/:path*` (no permanente, para poder retirarla). La redirección ocurre antes de la
  autenticación, pero el destino sigue protegido por `auth.protect()` y `exigirRol`, de modo que no concede nada.
- **Webhook y sincronización:** `ROLES` pasa a `administrativo`, `profesional`, `enfermera`, `paciente`; `rolDesdeMetadata` mapea el
  valor heredado; la rama `user.created` corrige el metadato de Clerk cuando llega el heredado.
- **Mensajes de interfaz** en español con «usted»; las fechas, en `America/Lima`. Ningún texto de cara al usuario dice «médico» donde
  ahora se habla del rol (sí en los casos en que la profesión es médico).
- **Variables de entorno:** `E2E_PROFESIONAL_EMAIL/PASSWORD` con respaldo a `E2E_MEDICO_*` mientras dure la transición.

### D11. Plan de actualización de la suite pgTAP

Regla: **la actualización es mecánica**. Solo cambian identificadores, literales de rol y las columnas nuevas obligatorias en los
`INSERT`; el número de pruebas de cada archivo existente **no cambia** (salvo donde se indica); ninguna aserción se debilita; el PR
muestra el diff y un recuento antes/después. Cada archivo se corre solo y la suite completa se corre al final.

| Archivo | Qué cambia |
|---|---|
| `01_humo` | Identidad `profesional_a`; el rol esperado del token es `profesional` |
| `10_fundamentos` | `enum_has_labels` con `profesional`; `rol_actual()` lee `profesional` del token de `profesional_a` (+1 prueba: el token heredado también da `profesional`) |
| `20_identidad_tablas` | `profesionales` con RLS; `insert` con `profesion` y `colegiatura`; la unicidad pasa a `(profesion, colegiatura)` |
| `21_identidad_funciones` | `profesional_actual()` y su definición; textos |
| `22_perfiles_rls` | Perfiles con rol `profesional`; «el paciente ve los nombres de los profesionales»; `rol <> 'profesional'` |
| `23_pacientes_rls` | Solo la identidad `profesional_a` |
| `24_personal_rls` | `profesionales`, `colegiatura`; ver también 63 |
| `25_escalada_y_sincronizacion` | Rol `profesional` en el upsert del webhook; `sync_identidad` sin privilegios sobre `profesionales` |
| `30_agenda_tablas` a `33_disponibilidad_bloqueos_rls` | `profesionales`, `profesional_id`, `rol 'profesional'`, nombres de restricción |
| `40_historias_tablas`, `42` a `47` | `profesional_id`, `asignaciones_paciente_profesional`, `profesional_tiene_paciente()`, `profesional_actual()`; **`47_estructura_historia`: `columns_are` con los nombres nuevos, a propósito** |
| `50_turnos_enfermeria`, `51_notificaciones`, `52_auditoria_accesos`, `53_auditoria_disparadores` | Renombres; `53`: `actor_rol` esperado `profesional` en una escritura de profesional y nombre de tabla auditada |
| `60_roles_de_conexion` | Identidad `profesional_a` |
| `41` y `99` | Sin cambios |

**Runner (`scripts/ejecutar-pgtap.ts`)**: identidades `profesional_a` y `profesional_b` (rol `profesional`); nuevas `profesional_c`
(tercer profesional, de otra profesión), `medico_heredado` (token con `rol: "medico"`) y `profesional_forjado` (token con un claim
extra `profesion`, que la base debe ignorar). La función de firma admite claims adicionales.

**Pruebas nuevas** (numeración sugerida por el contrato de la actualización; cada una con el caso negativo de **cada** rol:
administrativo, profesional a cargo, otro profesional, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones` y
`sync_identidad`, y con `has_table_privilege` de lo que no se concede; no asumen tablas vacías):
- **`63_profesionales`**: tabla, tipo, restricciones, privilegios por columna, `proteger_profesional()` (`HC010`, `HC011`),
  auditoría, `profesion_actual()` y el claim falso ignorado; quién lee y quién escribe.
- **`64_rol_profesional_y_claim_heredado`**: `rol_actual()` con `profesional`, con `medico` y con valores no reconocidos
  (`Medico`, `MEDICO`, `medicos`, `''`); `registrar_auditoria()` con ambos; acceso a historias con el token heredado.
- **`65_sin_residuos_del_vocabulario_anterior`**: la misma comprobación de la autocomprobación de M1, como prueba permanente
  que falla si una migración futura reintroduce `medico`/`medicos`/`medico_id` en el esquema `public`.

### D12. Impacto en H3 y en cada change existente

Los changes existentes **conservan sus nombres vigentes** y solo reciben una nota de impacto (la redacta el orquestador a partir de
esta tabla); se reescriben al decidirse la ADR-0030.

| Change | Qué asume hoy | Impacto |
|---|---|---|
| `esquema-rls-pgtap` (H2, 52/54) | Requisitos con «médico»; `aislamiento-por-rol-rls`, `identidad-de-personas` | Al archivarlo, sus especificaciones llegan a `openspec/specs/` con el vocabulario anterior; este change las **refina sin contradecirlas**. Revisar al archivar (guía de `config.yaml`) |
| `agenda-y-reserva` (H3) | `exigirPersonal('administrativo' \| 'medico')`, `medico_id` en esquemas Zod y consultas, `slots_disponibles(p_medico …)`, `marcar_cita_atendida()`, `app/medico/acciones-cita.ts`, `citas_sin_cruce_medico` | Renombre completo; `RolPersonal` pasa a `administrativo \| profesional` y la guarda lee el rol por el normalizador de D10. Su ítem 6 (alta de personal) debe pedir `profesion` y `colegiatura` y ligar a `profesionales`. **Decidir la ADR antes de mergear su rama** |
| `portal-del-paciente` (H4) | Lista de médicos, `slots_disponibles(p_medico …)`, `medico_id` | Renombre; «elegir profesional» por especialidad |
| `notificaciones-email` (H5) | Lee `medicos`/`perfiles`/`especialidades` y `medico_id` para armar el correo; `asignaciones_paciente_medico` | Renombre; el rol `cron_notificaciones` no cambia (solo lee `citas`) |
| `historias-clinicas` (H6) | Tarea 3.4: `create or replace` de `medico_tiene_paciente()` con `perfiles.activo`; `exigirRol("medico")`; `app/medico/pacientes/**`; `atenciones.medico_id`; `47` con columnas; `asignarPacienteAMedico`; D15 «plantilla de la especialidad del autor» | La tarea 3.4 pasa a `profesional_tiene_paciente()`; todas las rutas y columnas con el nombre nuevo; la regla de plantilla usa `profesionales.especialidad_id` |
| `turnos-y-dashboard` (H7) | `turnos_enfermeria.medico_id`, `app/medico/jornada`, `lib/medico/`, `medico_actual()`, `E2E_MEDICO_TOTP_SECRET`, pruebas `*_jornada_medico` | Renombre; `turnos_enfermeria.profesional_id` |
| `sistema-de-diseno-ui` (H2b) | `/medico` y «Panel del médico» en la navegación y `ConsolaLayout rol="medico"` | Renombre de rutas y de rótulos |
| Changes nuevos (H6b a H6h) | Ya escriben con los nombres de la ADR-0030 | Sin impacto; consumen `profesion_actual()` |

**Orden de merge recomendado:** H2c antes que cualquier migración o código de H3 a H7. Si la rama de H3 (`feat/h3-fundamentos-acciones`)
se mergea antes, el grupo 6 de `tasks.md` incluye reconciliar sus archivos (D1). Las migraciones de H3 en adelante se crean
**después** de M1, porque `node-pg-migrate` verifica el orden por nombre.

### D13. Auditoría y observabilidad del cambio

`profesionales` entra en la auditoría de escritura con `profesionales_auditoria` (D7). `profesion_actual()` no escribe nada. El
registro de acceso a historias (`accesos_historia`) no cambia de forma; su política de `INSERT` solo cambia de vocabulario. Los
recuentos del script de Clerk y de las verificaciones manuales son agregados (sin datos personales) y se anotan en
`docs/pasos-manuales-h2c.md`.

## Risks / Trade-offs

- [Se omite un objeto con `medico` y queda una política o una función rota] → La autocomprobación de M1 revierte toda la migración
  si queda un residuo; la prueba 65 lo vigila de forma permanente; la instantánea normalizada y el ensayo sobre la copia de `production`
  del PR lo demuestran antes del merge.
- [La reescritura de una política introduce un error de transcripción y abre o cierra acceso] → La instantánea normalizada debe dar
  diferencia vacía; las pruebas negativas por rol existentes (`43`, `45`, `46`, `52`) pasan sin debilitarse; verificación por mutación de
  cada política y función tocada; `code-review` explícito.
- [Una escritura de profesional falla por la conversión al enum en `registrar_auditoria()`] → Se reescribe en M1 y la prueba 64 escribe
  como profesional con token `profesional` y con token `medico`.
- [Un token antiguo `medico` pierde acceso] → Tolerancia transitoria en la base y en la aplicación (D5); el script solo se ejecuta con el
  despliegue nuevo `READY`; M3 solo se aplica tras `--verificar` en cero y esperar más que la vida del token.
- [La tolerancia se queda para siempre] → Tiene dueño (grupo 10), condición de retiro, una migración (M3) y una prueba negativa que la
  fija; mientras exista, está acotada a la correspondencia exacta `medico`→`profesional`.
- [Cambia la etiqueta histórica de `auditoria.actor_rol` y el nombre de tabla de las asignaciones auditadas] → Documentado en M1 y en
  `docs/pruebas-sql.md`; las consultas de revisión usan ambos nombres; no se modifica ninguna fila.
- [El bloqueo exclusivo de `ALTER TABLE … RENAME` detiene el tráfico unos segundos] → Tráfico mínimo; `lock_timeout` hace que falle y se
  reintente en vez de bloquear; el ensayo de dos sesiones mide la espera.
- [Migraciones o código de otros changes escritos con el vocabulario anterior chocan al rebasar] → Fallan de forma ruidosa (relación
  inexistente) o por la prueba 65, no en silencio; D12 lista qué reescribir.
- [Una profesión mal registrada no se puede corregir desde la aplicación] → Decisión consciente (D7): se corrige con una migración revisada;
  son pocos registros (2 a 3 por especialidad). Se reevalúa si resulta frecuente.
- [El script de Clerk deja a un usuario con el valor heredado] → `--verificar` lo detecta; la tolerancia lo cubre hasta entonces; el script
  es idempotente y se puede repetir.
- [La suite pgTAP es lo único que prueba RLS y se edita en 24 archivos] → Actualización mecánica con diff revisado, mismas cantidades de
  pruebas, verificación por mutación y revisión con `code-review` de **el diff de las pruebas** además del de las migraciones.
- [El cambio de nombre de variables de entorno rompe un `.env.local`] → Respaldo a `E2E_MEDICO_*` durante la transición.

## Migration Plan

**Antes de empezar (bloqueantes):** la ADR-0030 aceptada por el usuario; H2 cerrada y su suite en verde sobre un branch de desarrollo; las
decisiones de D12 comunicadas a los changes en curso.

1. **Grupo 0 y 1:** ADR aceptada, verificaciones previas (transacciones de `node-pg-migrate`, vida del token de Clerk, invitaciones
   pendientes, objetos reales del catálogo, estado de H3 y H2b) y línea base: suite pgTAP en verde y **instantánea previa**.
2. **Grupo 2:** M1 en un branch de desarrollo; instantánea posterior y diferencia vacía; ensayo de atomicidad con dos sesiones;
   `code-review`.
3. **Grupo 3:** suite pgTAP actualizada de forma mecánica, completa en verde; `code-review` del diff de pruebas.
4. **Grupo 4:** M2 y la prueba 63; **grupo 5:** pruebas 64 y 65; **grupo 8:** mutaciones y revisión previa al merge; todos con `code-review`.
5. **Grupos 6 y 7:** aplicación, scripts y script de Clerk con sus pruebas.
6. **PR:** el branch efímero copia `production` y aplica M1 y M2 sobre sus datos (ensayo general); pgTAP, concurrencia e integración corren
   sobre él.
7. **Merge a `master` — Fase 1.** `migrar-produccion.yml` aplica M1 y M2 y Vercel despliega en paralelo (D5). Comprobar: migraciones
   aplicadas, `enum_range(null::rol_usuario)` con `profesional`, despliegue `READY`.
8. **Fase 2 (manual, grupo 9):** `--dry-run`, `--confirmar`, `--verificar` con el despliegue nuevo `READY`; comprobar en producción con
   agregados (nunca filas con datos personales) que `perfiles.rol = 'profesional'` coincide con Clerk y que el área `/profesional` abre.
9. **Fase 3 (grupo 10, PR aparte):** M3 y retiro del normalizador y de la redirección, tras `--verificar` en cero y esperar más que la vida
   del token; pruebas 64 actualizadas a propósito.
10. **Rollback:** no hay marcha atrás destructiva (ADR-0027) y **nunca se restaura el branch principal de Neon** (destruye datos clínicos).
    Si M1 falla, la transacción revierte y producción queda como estaba (se corrige y se reintenta). Un defecto posterior se corrige con
    una migración nueva. El metadato de Clerk se puede devolver a `medico` mientras la tolerancia exista (la base y la aplicación aceptan
    ambos valores); después de M3 se corrige hacia adelante.

## Open Questions

Ninguna cambia las especificaciones ni el desglose de tareas; se responden en los changes que las usan o durante la implementación.

- **Qué profesiones pueden recetar (obligatoria, no se decide aquí).** Médico sí y psicólogo no (confirmado por el usuario); odontólogo,
  fisioterapeuta y podólogo están por confirmar con el cliente y el asesor. La resuelve H6c (`profesiones_que_recetan`); este change
  solo entrega `profesion` y `profesion_actual()`.
- **Colegiatura:** qué colegio emite cada una, su formato y si los números se repiten entre colegios o profesiones (hoy `unique (profesion,
  colegiatura)`).
- **Compatibilidad profesión–especialidad:** si la base debe impedir, por ejemplo, un odontólogo en Medicina general. Lo definen los changes
  de cada especialidad (H6e a H6h) cuando existan sus tablas; hoy `especialidad_id` es libre.
- **Corrección de una profesión mal registrada:** hoy, migración revisada (D7). ¿La clínica necesita un flujo propio?
- **Coherencia posterior de `perfiles.rol` y `profesionales`:** qué ocurre con la fila si el perfil deja de ser `profesional` (hoy la
  fila queda sin efecto porque las políticas exigen el rol del token). Propuesta: no hacer nada en esta versión.
- **Vida del token de Clerk y comportamiento de las sesiones abiertas** durante la Fase 2 (se confirma en la tarea 0.3).
- **Etiqueta histórica de auditoría** (D4): confirmar que el cambio de `medico` a `profesional` en filas antiguas es aceptable.
- **Visibilidad de `colegiatura` y `profesion` para el paciente:** hoy cualquier sesión con rol válido lee `profesionales` (igual que
  `medicos`). <!-- REVISAR: ¿se expone la colegiatura al paciente en el portal, o solo la profesión y la especialidad? No cambia el esquema. -->
