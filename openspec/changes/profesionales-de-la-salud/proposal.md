# Proposal

> **Nombres: sujetos a ADR-0030; si se rechaza, léase `medico`/`medicos`.** Este change usa los nombres propuestos por la
> [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (rol `profesional`, tabla `profesionales`, `profesion`,
> `colegiatura`). La ADR sigue en estado **Propuesto**: **este change no se aplica hasta que el usuario la acepte**.

## Why

El PRD del 2026-10-11 reemplaza el perfil «Médico» por **Profesional de la salud**: médicos, odontólogos, fisioterapeutas,
psicólogos y podólogos (2 a 3 por especialidad), cada uno con su colegiatura y con la profesión como atributo del que
dependen la plantilla clínica, el permiso de recetar y el aislamiento de Psicología. El esquema que ya está en producción
(H2), la autenticación (H1) y el código asumen «médico» en todas partes: el valor `medico` de `rol_usuario`, la tabla
`medicos` (con `cmp`), la columna `medico_id` en seis tablas, `asignaciones_paciente_medico`, las funciones centrales
`medico_actual()` y `medico_tiene_paciente()`, 19 políticas RLS que comparan el rol con `'medico'`, la ruta `/medico` y el
valor `medico` en `publicMetadata.rol` de Clerk.

Es el momento más barato para generalizarlo: en producción solo hay datos de demostración y ningún código desplegado
consulta esas tablas todavía (H3 a H7 aún no existen), pero H3 está a punto de escribir sus primeras consultas contra
`medico_id`. Cada change que se escriba antes de renombrar multiplica el costo. Es el hito **H2c**, anterior a H3.

## What Changes

**Este change toca RLS y el acceso a historias clínicas (el riesgo principal del proyecto) y requiere revisión aparte con
el agente `code-review`** (hay una tarea de revisión al final de cada grupo que toca políticas, funciones `SECURITY
DEFINER` o disparadores, una revisión final sobre todo el diff y verificación por mutación de las pruebas negativas; ver
`tasks.md`). **Depende de que el usuario acepte la ADR-0030.**

- **Rol `profesional` en lugar de `medico`**, en la base (`rol_usuario`), en el claim `publicMetadata.rol` de Clerk, en
  `perfiles`, en el área `/profesional` (hoy `/medico`) y en la invitación de personal. Los demás roles no cambian.
- **Renombre atómico del esquema en una sola migración** (`medicos` → `profesionales`, `medico_id` → `profesional_id`,
  `asignaciones_paciente_medico` → `asignaciones_paciente_profesional`, `medico_actual()` → `profesional_actual()`,
  `medico_tiene_paciente()` → `profesional_tiene_paciente()`, índices, restricciones y políticas), con las 19 políticas
  y las funciones que contienen el literal `'medico'` reescritas en la misma transacción, de modo que no existe un
  instante sin RLS ni con RLS a medias. La lógica de acceso **no cambia**: solo cambian los nombres.
- **Profesión y colegiatura como datos de la base**: `profesionales.profesion` (`medico`, `odontologo`, `fisioterapeuta`,
  `psicologo`, `podologo`) y `profesionales.colegiatura` (reemplaza a `cmp`). La profesión **no la controla el cliente**:
  no viaja en el token, solo el administrativo la registra, no se modifica después (privilegio por columna y disparador),
  y se lee con una función única `profesion_actual()` que cada change posterior reutiliza.
- **Tolerancia transitoria del valor heredado `medico`** en el claim: la base y la aplicación tratan un token con
  `rol = 'medico'` como `profesional` hasta que todos los usuarios estén migrados, para que **nadie pierda acceso en
  ningún orden de despliegue** (la migración y el despliegue de Vercel corren en paralelo). Un cambio posterior del
  mismo change retira la tolerancia.
- **Script de migración de usuarios de Clerk** (`scripts/migrar-rol-profesional.ts`): idempotente, con `--dry-run`,
  `--confirmar` y `--verificar`, sin imprimir datos personales; el webhook de alta acepta el valor heredado de una
  invitación pendiente.
- **Auditoría**: `profesionales` entra a la auditoría de escritura (quién cambió qué).
- **Pruebas**: la suite pgTAP existente se actualiza de forma mecánica (misma cantidad de pruebas, sin debilitar ninguna
  aserción); pruebas nuevas 63 a 65 con el caso negativo de cada rol; instantánea de políticas antes y después para
  demostrar que la semántica de RLS no cambió.
- **Cambios en lo existente que no rompen a nadie** (con el orden de despliegue de `design.md`, D4): la migración renombra
  datos en sitio (no hay copia ni ventana), el webhook y la aplicación aceptan los dos valores de rol, y las URL
  `/medico/**` redirigen a `/profesional/**`.

## Capabilities

### New Capabilities

- `rol-profesional`: el rol `profesional` reemplaza a `medico` en toda la superficie (base, token, aplicación, invitación),
  el aislamiento de historias clínicas por profesional a cargo se conserva idéntico con su caso negativo por rol, el valor
  heredado se tolera de forma transitoria y acotada, la migración de usuarios existentes no deja a nadie sin acceso, y no
  quedan residuos del vocabulario anterior en el esquema.
- `profesion-del-profesional`: la profesión y la colegiatura de cada profesional, quién las registra y lee, por qué el
  cliente no puede fijarlas ni cambiarlas, su registro en la auditoría y la lectura única de la profesión del usuario
  autenticado.

### Modified Capabilities

- `autenticacion-roles`: los cuatro roles pasan a ser `administrativo`, `profesional`, `enfermera` y `paciente`; la
  invitación y el MFA de personal nombran `profesional`. (Se modifican tres requisitos de la especificación vigente;
  «Autorregistro restringido a rol paciente» no cambia.)

## Impact

- **Hito:** H2c del plan ampliado (entre H2b y H3; el orden fino lo fija `docs/BACKLOG.md`). Depende de H2 (en producción) y
  de **la aceptación de la ADR-0030**. Bloquea a H3, H4, H5, H6 y H7 en cuanto a nombres; conviene decidir la ADR **antes**
  de mergear la rama de H3 (`feat/h3-fundamentos-acciones`).
- **Decisión legal P-1: no la resuelve ni la presupone.** El change no añade datos clínicos ni habilita datos reales;
  los datos de demostración siguen siendo los únicos admisibles. No declara validez legal de ninguna colegiatura ni firma.
- **ADR relacionadas:** [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (decisión que este change
  implementa), [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0022](../../../docs/adrs/0022-autenticacion-y-sesion-clerk.md),
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md) y
  [ADR-0027](../../../docs/adrs/0027-herramienta-de-migraciones.md) (ninguna se reabre; reciben una nota al aplicar).
  [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) y
  [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) consumen `profesion` y
  `profesion_actual()`.
- **Código afectado (verificado en el repositorio, `design.md` D1):** 24 migraciones de H2 (no se editan; una migración
  nueva las renombra), 24 archivos de `tests/pgtap/`, `tests/concurrencia/10_doble_reserva.test.ts`,
  `tests/integracion/sincronizar-perfil.test.ts`, `lib/auth/rol.ts`, `lib/identidad/sincronizar-perfil.ts`,
  `app/api/webhooks/clerk/route.ts`, `app/medico/page.tsx`, `types/globals.d.ts`, `scripts/{invitar-personal,
  ejecutar-pgtap,sembrar-datos-demo,comprobar-datos-demo}.ts`, `e2e/roles.spec.ts`, `.env.example` y la
  documentación de `docs/`.
- **Código nuevo:** dos migraciones de renombre y de profesión (más una tercera, posterior, que retira la tolerancia
  transitoria), `scripts/migrar-rol-profesional.ts`, `docs/pasos-manuales-h2c.md` y las pruebas pgTAP 63 a 65.
- **Base de datos:** una tabla renombrada con dos columnas nuevas (`profesion`, `colegiatura`), un tipo nuevo
  (`profesion_salud`), tres funciones nuevas o renombradas (`profesional_actual()`, `profesional_tiene_paciente()`,
  `profesion_actual()`), seis cuerpos de función reescritos (incluido `rol_actual()`), 21 políticas tocadas y dos disparadores nuevos
  (`profesionales_proteger`, `profesionales_auditoria`). **No se crea ninguna tabla nueva**, así que `99_rls_en_todas_las_tablas`
  no cambia de alcance.
- **Dependencias nuevas:** ninguna.
- **Infraestructura:** metadatos de los usuarios existentes en Clerk (paso manual con el script); sin variables de entorno
  obligatorias nuevas (`E2E_MEDICO_*` pasa a `E2E_PROFESIONAL_*` con respaldo al nombre anterior).
- **Qué NO incluye:** plantillas por especialidad (ADR-0029, H6); recetas y el permiso de recetar por profesión (H6c);
  triaje, derivaciones y llegada del paciente (H6b); tablas de especialidades y datos propios de cada una (H6e a H6h);
  el aislamiento de Psicología (ADR-0031); la copia de la historia al paciente (H6d); la pantalla de alta de
  profesionales (H3, ítem 6; este change solo deja listo el modelo y sus reglas); tests de usabilidad; pagos, telemedicina,
  laboratorios o farmacias, inventario, multi-sede, analítica de BI.
- **Pregunta abierta obligatoria (no se decide aquí):** qué profesiones pueden recetar. Médico sí y psicólogo no (confirmado
  por el usuario); odontólogo, fisioterapeuta y podólogo están por confirmar con el cliente y el asesor. La decide H6c
  (`design.md`, «Preguntas abiertas»).
