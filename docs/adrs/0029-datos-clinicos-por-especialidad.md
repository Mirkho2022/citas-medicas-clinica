# ADR 0029: Datos clínicos por especialidad: plantillas versionadas y datos validados en la base

## Estado

**Aceptado** por el usuario el 2026-10-10, tal como está escrita. Acepta el mecanismo; **no** resuelve la cuestión abierta de
los profesionales que no son médicos (ver abajo). Tarea 0.8 del change `historias-clinicas`. Detalle de diseño en `openspec/changes/historias-clinicas/design.md`, D15.

## Contexto

La clínica atiende Medicina general, Odontología, Fisioterapia, Psicología y Podología (dato del usuario del 2026-10-10;
Estética y Capilar queda fuera). Hoy `atenciones` es una nota genérica: motivo de consulta, anamnesis, examen físico,
diagnósticos CIE-10 y plan de tratamiento, todos obligatorios y con contenido real. No hay dónde guardar datos propios de una
especialidad (por ejemplo, los de la primera consulta que pide la NTS 139, numeral 5.2.1).

Añadir esos campos **después** de que existan la firma, la huella del contenido, la inmutabilidad y las pruebas de RLS obliga
a revisar políticas, disparadores y la prueba `47_estructura_historia` con datos ya firmados. Prepararlo ahora, antes de
construir H6, cuesta una tabla y dos columnas.

## Decisión

- Un catálogo **`plantillas_clinicas`**: una fila por versión de cada plantilla de una especialidad, **inmutable** y gestionada
  **por migración**. Lectura solo para el médico; ningún rol de usuario escribe. Los campos se definen en un `jsonb` con un
  subconjunto mínimo de tipos (`texto`, `entero`, `decimal`, `opcion`, `si_no`, `fecha`).
- Dos columnas nuevas en `atenciones`: **`plantilla_id`** (la plantilla exacta, versión incluida) y **`datos_especialidad`**
  (`jsonb`, objeto, vacío por defecto).
- Un disparador de validación en la base, como el de los diagnósticos, que reconstruye el objeto con las claves definidas y
  exige campos obligatorios con contenido, tipo, rango y opciones. La plantilla debe estar vigente al insertar y ser de la
  especialidad del médico autor.
- Los datos son parte de la fila: quedan inmutables al firmar y **entran en la huella** desde su primera versión, por lo que
  esta migración va antes que la de sello y huella.
- Se entrega el mecanismo y **solo la plantilla de Medicina general**. Recetas y triaje no se guardan aquí.

## Alternativas consideradas

- **Una tabla por especialidad.** Tipado fuerte, pero cada especialidad exige una migración, una política RLS, una prueba
  negativa por rol y un cambio en `47`, y ver todas las atenciones de un paciente obliga a unir tablas.
- **Modelo clave-valor (EAV).** Validación y consultas pesadas, y una tabla clínica más que blindar con RLS.
- **`jsonb` sin plantilla.** Sin un catálogo no hay contrato que validar: cualquier clave pasaría.
- **JSON Schema completo en la base** (`pg_jsonschema`). Exige sumar una extensión a Neon; el subconjunto de tipos basta.

## Consecuencias

- Cada especialidad nueva es una migración de datos revisada, no una migración de esquema.
- Cambiar una plantilla es publicar la versión siguiente: las atenciones ya registradas conservan la suya.
- Una tabla nueva (`plantillas_clinicas`) con RLS y su prueba pgTAP negativa, y la prueba `47` se actualiza a propósito.
- El validador en SQL es código a mantener; se acota con el subconjunto de tipos, pruebas por tipo y revisión de `code-review`.

## Cuestión abierta (esta ADR no la resuelve)

Odontología, Fisioterapia, Psicología y Podología las atienden profesionales colegiados que **no son médicos**, y el esquema
de H2 asume «médico» (`medicos`, `atenciones.medico_id`, `medico_tiene_paciente()`, el rol `medico`). Generalizar a
«profesional de salud» toca el esquema ya en producción y la regla de roles de `CLAUDE.md`. Requiere decisión explícita del
usuario, actualizar el PRD con la skill `generar-prd-conversacional` y revisión con `code-review`. Esta ADR no lo prejuzga:
las plantillas cuelgan de `especialidades`, no de `medicos`.

## Relación con otras decisiones

[ADR-0013](0013-definicion-de-historia-clinica-digitalizada.md) (qué es una historia digitalizada),
[ADR-0014](0014-catalogo-cie-10.md) (validación de diagnósticos en la base, el mismo patrón),
[ADR-0015](0015-modelo-de-antecedentes-del-paciente.md) y [ADR-0023](0023-contexto-de-usuario-para-rls.md) (contexto de
usuario para RLS). No resuelve P-1 ni P-5.
