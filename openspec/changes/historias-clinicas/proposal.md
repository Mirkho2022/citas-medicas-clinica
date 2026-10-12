# Proposal

## Why

H2 dejó en la base de datos las tablas de la historia clínica, sus políticas RLS y sus reglas de inmutabilidad, pero **no
hay capa de aplicación encima**: ningún médico puede hoy registrar, firmar ni consultar una atención, y sin eso no existe
el objetivo del PRD de eliminar la búsqueda de historias en papel ni la métrica de **60 % de historias digitalizadas**
(ADR-0013). Este change construye esa capa: es el hito **H6** del plan de TECH-DESIGN («Historias clínicas: registro,
firma, addendas, auditoría de accesos», depende de H2 y de la decisión legal P-1).

Al leer con lupa lo que H2 entregó aparecen huecos que la capa de aplicación no debe tapar con `if` (el aislamiento
clínico es el riesgo principal declarado del proyecto): no hay dónde guardar los escaneos de respaldo (ADR-0013/0024),
los diagnósticos `jsonb` no se validan contra el catálogo CIE-10 (vacío), `firmada_en` y `creado_en` los puede fijar el
cliente, `atenciones.cita_id` no comprueba que la cita sea del mismo médico y paciente, el registro de lecturas
depende de que la aplicación se acuerde de escribirlo, y nada impide cargar datos clínicos de pacientes reales mientras
P-1 siga abierta. Se resuelven aquí, con migraciones nuevas y su prueba pgTAP.

## What Changes

**Este change toca acceso a historias clínicas y RLS (el riesgo principal del proyecto) y requiere revisión aparte con el
agente `code-review` antes de mergear (hay una tarea de revisión al final de cada grupo que lo toca y una revisión final
sobre todo el diff: `tasks.md`, 11.5), además de la verificación por mutación de sus pruebas negativas (11.2).**

- **Aplicación del médico** (`app/medico/pacientes/**`): lista de pacientes a cargo, historia clínica (ficha del paciente
  de solo lectura, antecedentes vigentes, atenciones con sus addendas, adjuntos), registro de atención con validación
  Zod **en el servidor** y diagnósticos CIE-10, edición de borrador, **firma** y **addendas**. Carga pensada para ser
  rápida (la métrica de 60 % depende de ello; ver `design.md`, D9).
- **Antecedentes** estructurados (ADR-0015): registrar, marcar como no vigentes y consultar los vigentes.
- **Punto de extensión por especialidad** (ADR-0029, `design.md` D15): la clínica atiende Medicina general, Odontología,
  Fisioterapia, Psicología y Podología, y hoy `atenciones` es una nota genérica. Se añade un catálogo `plantillas_clinicas`
  (versiones inmutables, gestionadas por migración) y dos columnas en `atenciones` (`plantilla_id`, `datos_especialidad`),
  validadas **en la base** y selladas por la firma. Solo se entrega el mecanismo y la plantilla de **Medicina general**
  (campos de la primera consulta de la NTS 139, numeral 5.2.1); las demás llegan cuando se resuelva quién las atiende
  (D15, «Cuestión abierta»).
  Cada plantilla puede además reservarse a una profesión (`exige_profesion`, con el tipo `profesion_salud` de H2c): la regla
  común vive en el mismo disparador de validación y las especialidades no crean disparadores propios (D15).
- **Adjuntos de respaldo** (ADR-0013/0024): tabla nueva `adjuntos_historia` con RLS (la autoridad de acceso al archivo es
  esa fila, no solo la Server Action), subida directa a Vercel Blob privado y descarga por el servidor.
- **Catálogo CIE-10 completo** (ADR-0014) cargado por migración de datos versionada, búsqueda por código o texto y
  **validación de cada diagnóstico en la base de datos**.
- **Auditoría de accesos** (ADR-0003): toda lectura de contenido clínico se registra **en la misma transacción** que la
  lectura (si el registro falla, no se devuelve nada) y el administrativo revisa quién vio qué y cuándo, sin ver contenido.
- **Asignación manual paciente-médico** (ADR-0016): pantalla del administrativo para conceder acceso en casos especiales.
- **Firma lógica con sello del servidor**: `firmada_en` y `creado_en` los fija la base, se guarda una huella de contenido y
  la firma queda detrás de una interfaz de proveedor (`lib/firma/proveedor.ts`, riesgo P-5). **No** se declara que la
  firma lógica cumpla la norma: eso es P-1.
- **Guarda contra datos clínicos reales (P-1)**: modo de datos `demostracion`/`real` guardado en la base y exigido por
  disparadores, más una variable de entorno que debe coincidir y un aviso visible (`design.md`, D1). Los datos
  sintéticos de [docs/datos-demo.md](../../../docs/datos-demo.md) siguen permitidos; los reales, no.
- **Indicador de digitalización** (ADR-0013): una función que devuelve solo conteos al administrativo, sin pantalla.
- **Migraciones nuevas** (nunca editar las de H2): catálogo y validación CIE-10, sello y huella, coherencia de cita,
  `medico_tiene_paciente()` también exige `perfiles.activo`, tipo de recurso en `accesos_historia`, `adjuntos_historia`,
  `configuracion_clinica`, política de asignación manual más estricta y el indicador. Cada tabla nueva nace con RLS y su
  prueba pgTAP negativa.
- **Pruebas**: pgTAP nuevas, un módulo único de acceso a datos clínicos verificado por una prueba que falla si otro
  archivo toca esas tablas, pruebas de concurrencia de firma, E2E con Playwright y accesibilidad con axe.
- **Cambios en lo existente (no rompen a ningún usuario):** `atenciones` gana cuatro columnas (`firma_metodo`,
  `firma_huella`, `plantilla_id` y `datos_especialidad`) y la prueba `47_estructura_historia` se actualiza a propósito; `registrar_auditoria()` se reemplaza para
  no volcar el nombre de los archivos adjuntos; la política de inserción de `asignaciones_paciente_medico` rechaza un
  `motivo` que empiece por `cita:` o esté vacío.

## Capabilities

### New Capabilities

- `acceso-a-historia-clinica`: quién puede abrir la historia (solo el médico a cargo) y cómo se presenta: lista de
  pacientes a cargo, ficha de solo lectura, casos negativos por rol, sin canales laterales (caché, títulos, URL, errores).
- `asignacion-paciente-medico`: el administrativo concede acceso en casos especiales; append-only, con motivo y vigencia.
- `registro-de-atencion`: registrar y editar el borrador de una atención con validación en servidor y en base de datos,
  diagnósticos CIE-10, vínculo opcional con la cita y carga rápida.
- `firma-y-addendas`: firmar con sello del servidor y huella, inmutabilidad, proveedor de firma aislado y corrección
  únicamente por addenda.
- `antecedentes-y-digitalizacion`: antecedentes que no se sobrescriben y medición objetiva de «historia digitalizada».
- `adjuntos-de-respaldo`: escaneos PDF en Vercel Blob privado con metadatos protegidos por RLS.
- `auditoria-de-accesos-clinicos`: registro atómico de lecturas, único punto de acceso a datos clínicos y revisión del
  administrativo.
- `catalogo-cie10`: carga, búsqueda y validación de diagnósticos contra el catálogo oficial.
- `bloqueo-de-datos-clinicos-reales`: el sistema solo admite datos clínicos de demostración hasta que P-1 se cierre.
- `plantillas-clinicas-por-especialidad`: catálogo de plantillas versionadas y datos de especialidad validados, sellados
  por la firma y presentados en el formulario.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/`: solo existe `autenticacion-roles`, que no cambia. Los requisitos de H2
(`integridad-historia-clinica`, `aislamiento-por-rol-rls`) viven aún en el change `esquema-rls-pgtap`; este change
los refina sin contradecirlos y, al archivarse H2, hay que revisar el solapamiento (ver design.md, «Riesgos»). -->

## Impact

- **Hito:** H6 del plan de TECH-DESIGN. Depende de H2 (cerrado) y de **P-1 (abierta)**; las pantallas dependen además de
  H2b (`sistema-de-diseno-ui`: tema, `AtencionFirmada`, `Campo`, `Alerta`, `ConsolaLayout`, `lib/ui/formato.ts`). Los
  grupos de base de datos y de lógica (0 a 3 de `tasks.md`, y la parte sin pantalla de los demás) no esperan a H2b.
- **Decisión legal P-1 (NTS del MINSA: retención, firma lógica vs. certificada, alojamiento fuera de Perú): sigue
  abierta y este change no la resuelve ni la presupone.** El módulo **no puede pasar a producción con datos reales de
  pacientes** hasta cerrarla; la guarda de D1 lo impide por construcción. Levantarla es un change posterior con sus
  propias condiciones (`design.md`, D1), no una tarea de este. También depende de P-5 (si la firma lógica no basta, el
  proveedor de firma se reemplaza sin rediseñar el flujo) y de P-10 (MFA de personal requiere Clerk Pro en producción).
- **ADR a crear antes de implementar** (skill `architecture`, revisión humana; no se deciden en este proposal):
  *modo de datos clínicos (demostración/real)* y *sello de tiempo y huella de la firma lógica*. Se apoyan en
  [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0006](../../../docs/adrs/0006-contratos-de-api-via-server-actions.md),
  [ADR-0008](../../../docs/adrs/0008-resiliencia-y-manejo-de-errores.md),
  [ADR-0013](../../../docs/adrs/0013-definicion-de-historia-clinica-digitalizada.md),
  [ADR-0014](../../../docs/adrs/0014-catalogo-cie-10.md),
  [ADR-0015](../../../docs/adrs/0015-modelo-de-antecedentes-del-paciente.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md),
  [ADR-0024](../../../docs/adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md) y
  [ADR-0027](../../../docs/adrs/0027-herramienta-de-migraciones.md); ninguno se reabre.
- **ADR ya redactada y aceptada por el usuario (2026-10-10):** [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md),
  *datos clínicos por especialidad* (D15). No resuelve la cuestión abierta de los profesionales que no son médicos.
- **Reconciliación con el PRD del 2026-10-11 y las ADR 0030 a 0036 (notas; este change no se rediseña).**
  - *Nombres (ADR-0030, `profesionales-de-la-salud`, H2c):* este change conserva `medico`. Al aplicar H2c cambiarían
    `exigirRol("medico")`, `app/medico/pacientes/**`, `atenciones.medico_id`, `asignarPacienteAMedico`, `medico_tiene_paciente()`
    (→ `profesional_tiene_paciente()`) y la prueba `47_estructura_historia`; ver `design.md`, D16.
  - *Historia compartida (ADR-0031):* la historia es **compartida entre las especialidades** para todo profesional a cargo, y la
    información de Psicología queda aparte; esa separación la implementa `especialidad-psicologia`, no este change.
  - *Integraciones:* el triaje que lee el profesional al abrir la historia (`triaje-y-derivacion`), el panel de medicamentos
    (`recetas-medicas`), la copia de la historia con su tipo de acceso `copia` (`copia-de-historia-clinica`) y la **unión de
    valores de `accesos_historia.tipo_acceso`**, que este change crea y otros amplían; ver D16.
  - *Plantillas por profesión:* regla común `exige_profesion` en el mismo disparador de validación (D15), sin disparadores por
    especialidad.
- **Código nuevo:** `migrations/*.sql`; `lib/historias/`, `lib/firma/`, `lib/cie10/`, `lib/schemas/historia-clinica.ts`;
  `app/medico/pacientes/**`, `app/administrativo/{asignaciones,accesos-historia}/`, `app/api/{cie10,historias}/**`;
  `scripts/preparar-cie10.ts` y el CSV de origen en `datos/cie10/`; `tests/pgtap/*`, `tests/historias/`, `tests/concurrencia/`,
  `e2e/historias*.spec.ts`.
- **Base de datos:** tablas nuevas `adjuntos_historia`, `configuracion_clinica` y `plantillas_clinicas` (RLS + prueba negativa cada una),
  columnas nuevas en `atenciones` y `accesos_historia`, funciones `SECURITY DEFINER` nuevas o reemplazadas
  (`medico_tiene_paciente()`, `registrar_auditoria()`), disparadores nuevos y la carga de ~14 000 filas de `cie10`.
- **Dependencias nuevas:** `@vercel/blob` (la descarga/firma exacta se verifica en la tarea 0.3); `date-fns` y
  `date-fns-tz` llegan con H2b. Zod 3, `react-hook-form` y `@hookform/resolvers` ya están.
- **Infraestructura/entorno:** store de Vercel Blob privado, `BLOB_READ_WRITE_TOKEN`, `CLINICA_MODO_DATOS`
  (por defecto `demostracion`).
- **Fuera de alcance:** pagos, telemedicina, laboratorios o farmacias, inventario, multi-sede, analítica de BI; imprimir o
  exportar la historia; las recetas (son del change `recetas-medicas`, H6c) y el triaje (es del change `triaje-y-derivacion`, H6b); acceso del paciente a su historia (el PRD lo excluye); migración de datos reales de papel
  (H8); levantar el bloqueo de datos reales; cambios en agenda, portal, notificaciones o turnos.
- **Seguimiento pedido por el usuario (2026-10-10), no incluido aquí:** *recetas* (contenido mínimo del DS 014-2011-SA,
  art. 56; la receta electrónica exige firma digital) y *triaje por enfermería* (signos vitales visibles para el
  profesional; amplía el permiso hoy mínimo de la enfermera). Cada uno será su propio change y exige antes actualizar el
  PRD y la regla de roles de `CLAUDE.md` con la skill `generar-prd-conversacional`. El punto de extensión de D15 no los
  bloquea: ni recetas ni signos vitales se guardan en `datos_especialidad`. Tampoco se resuelve aquí quién atiende
  Odontología, Fisioterapia, Psicología y Podología (profesionales que no son médicos; D15, «Cuestión abierta»).
  *Actualización del 2026-10-11:* el PRD ya se actualizó y esos seguimientos son los changes `recetas-medicas` (H6c) y
  `triaje-y-derivacion` (H6b); quién atiende las demás especialidades lo resuelve la ADR-0030 (H2c) y sus plantillas llegan con
  `especialidad-odontologia`, `especialidad-fisioterapia`, `especialidad-psicologia` y `especialidad-podologia`.
