# Proposal

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales`, `profesion_actual()`, `profesional_actual()`, `profesional_tiene_paciente()` y
> `atenciones.profesional_id`; si la ADR se rechaza, léase `medico`, `medicos`, `medico_actual()`, `medico_tiene_paciente()` y
> `atenciones.medico_id`. La profesión `odontologo` es un valor del tipo `profesion_salud` que define `profesionales-de-la-salud`.

## Why

El PRD del 2026-10-11 pide cinco especialidades «completas» y entregadas juntas. Para **Odontología** eso significa, y no más:
**odontograma** (dentición adulta e infantil, piezas y caras), **hallazgos y tratamientos por pieza** y **radiografías como
adjuntos**. Hoy el odontograma se dibuja en papel: no se puede consultar desde otro consultorio, no se sabe cuál es el estado
actual de la boca sin releer todas las fichas, y un paciente que se atiende también con un médico o un psicólogo no tiene su
información dental a la vista del resto de los profesionales a cargo (la historia es compartida, salvo Psicología).

La atención clínica de [`historias-clinicas`](../historias-clinicas/proposal.md) (H6) guarda una nota genérica y, por
[ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md), un `datos_especialidad` validado contra una plantilla.
Esa plantilla solo admite seis tipos escalares (`texto`, `entero`, `decimal`, `opcion`, `si_no`, `fecha`): no alcanza para un
odontograma (hasta 52 piezas, seis posiciones por pieza, un catálogo de hallazgos, un «estado actual» que se deriva de varias
atenciones). TECH-DESIGN y la propia ADR prevén justo este caso: «donde la plantilla no basta (odontograma, …), tablas propias
de su change». Este change es el hito **H6e**.

## What Changes

**Este change toca RLS y el acceso a historias clínicas (el riesgo principal del proyecto): crea cuatro tablas clínicas con
política propia, funciones y disparadores `SECURITY DEFINER`, y dos disparadores sobre `atenciones`. Exige revisión aparte con el
agente `code-review` al final de cada grupo que lo toca y sobre todo el diff, y verificación por mutación de las pruebas
negativas (`tasks.md`, grupos 1 a 6 y 11).**

- **Cinco tablas nuevas**, todas con RLS activada y su prueba pgTAP negativa por rol y por profesión:
  - `odontogramas`: la «sección odontológica» de una atención (dentición declarada y sello propio al firmar).
  - `odontograma_registros`: **un registro por pieza y cara en cada atención** (numeración FDI), con un hallazgo del catálogo.
  - `odontograma_tratamientos`: tratamientos **por pieza** (`indicado` o `realizado`), sin precios, presupuestos ni cuotas.
  - `radiografias_odontologicas`: metadatos de cada radiografía (tipo, piezas, fecha de toma) que apunta a un **adjunto**.
  - `catalogo_odontologico`: catálogo de hallazgos y de tratamientos, **gestionado por migración**.
- **Estado del odontograma en tablas y no en un `jsonb`** (`design.md`, D1): cada atención registra lo que observó o hizo;
  al firmarla, esos registros quedan inmutables y sellados con una huella propia; el **odontograma actual se deriva** de lo
  último firmado en cada pieza y cara, y puede consultarse «a una fecha».
- **Dentición adulta, infantil y mixta** (D4): la numeración FDI distingue las dos denticiones, así que la mixta no necesita
  una estructura aparte; la atención declara su dentición y la base rechaza piezas que no le corresponden.
- **Catálogos de hallazgos y de tratamientos por migración** (D5): lo que no viene del PRD es **propuesta marcada `REVISAR`**
  para los odontólogos de la clínica; la norma del odontograma (NTS 188) **no se verificó** y este change no cita su contenido.
- **Plantilla de Odontología** (D8, ADR-0029): tres campos para el resto de la atención, uno de ellos la declaración «registra
  odontograma, tratamientos o radiografías» que la base comprueba al firmar; un disparador impide que otra profesión use esa
  plantilla.
- **Radiografías como adjuntos de imagen** (D7): se modela un «adjunto» abstracto —hoy el PDF de `adjuntos_historia`— y la
  radiografía lo vincula. **No se diseña el almacenamiento** y la admisión de imágenes (P-15) sigue siendo decisión abierta del
  usuario.
- **Quién lee y quién escribe** (D9): lo lee todo profesional que tiene al paciente a cargo (como `atenciones`); lo escribe
  **solo un odontólogo** (`profesion_actual()`), autor de la atención y mientras no esté firmada. Casos negativos por rol y por
  profesión.
- **Auditoría** (D11): toda escritura queda registrada sin copiar contenido (`registrar_auditoria_sin_contenido()` de H6b); la
  lectura se registra en la misma transacción que abre la historia (H6).
- **Copia de la historia** (D12): se clasifican las cinco tablas y se escribe la sección de Odontología en el compilado de
  `copia-de-historia-clinica` (H6d); la prueba de cobertura de H6d falla si se omite alguna.
- **Pantallas** (D14): editor del odontograma dentro de la atención del odontólogo, vista «odontograma actual» para todo
  profesional a cargo, tratamientos pendientes y radiografías, sobre el sistema de diseño de H2b (con un componente nuevo que
  se documenta en `docs/DESIGN.md`).
- **Pruebas** (D15): pgTAP 75 (sugerida), concurrencia de firma contra edición, `node:test`, E2E y axe.

## Capabilities

### New Capabilities

- `odontograma-por-pieza-y-cara`: piezas FDI, caras, dentición adulta, infantil y mixta, un registro por pieza y cara en cada
  atención, y el odontograma actual derivado de lo último firmado.
- `hallazgos-y-tratamientos-por-pieza`: catálogos de hallazgos y de tratamientos gestionados por migración (propuesta
  pendiente de revisión), tratamientos indicados y realizados por pieza, y la ausencia de presupuestos, cuotas y cobros.
- `radiografias-como-adjuntos`: la radiografía como adjunto vinculado a la atención odontológica, con su metadato clínico y su
  dependencia de la decisión abierta sobre imágenes.
- `acceso-y-sello-de-la-seccion-odontologica`: lectura por todo profesional a cargo, escritura solo del odontólogo autor,
  plantilla de Odontología, inmutabilidad y sello al firmar, correcciones por addenda, auditoría, datos reales prohibidos y
  sección de la copia de la historia.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/`: solo existe `autenticacion-roles`, que no cambia. Este change añade dos disparadores sobre
`atenciones` (coherencia profesión–plantilla y sellado de la sección odontológica) que no contradicen los requisitos de
`firma-y-addendas` ni de `plantillas-clinicas-por-especialidad` de H6; al archivar ambos hay que comprobar el solapamiento
(ver design.md, Riesgos). -->

## Impact

- **Hito:** H6e del plan ampliado (el orden fino lo fija `docs/BACKLOG.md`). **Depende de:** H6 `historias-clinicas`
  (`atenciones`, `plantillas_clinicas` y su validador de `datos_especialidad`, sello y huella, `adjuntos_historia`, guarda de
  datos reales, registro atómico de accesos), H2c `profesionales-de-la-salud` (`profesion_actual()`,
  `profesional_tiene_paciente()`), H6b `triaje-y-derivacion` (solo por `registrar_auditoria_sin_contenido()`) y H6d
  `copia-de-historia-clinica` (el compilado donde se escribe la sección). Las pantallas dependen además de H2b
  (`sistema-de-diseno-ui`). **No usa H6i** (`mecanismos-clinicos-comunes`): Odontología no tiene planes de sesiones ni
  instrumentos con puntaje; la dependencia que TECH-DESIGN anota para H6e sobra y conviene retirarla del plan.
- **RLS y acceso a historias clínicas (revisión aparte):** cuatro tablas clínicas nuevas con política, `GRANT` por columna y
  disparadores; un catálogo de solo lectura; dos disparadores sobre `atenciones`; funciones de lectura derivada y la sección de la
  copia. Casos negativos por rol y por profesión (administrativo, odontólogo a cargo, otro odontólogo sin el paciente, médico /
  fisioterapeuta / psicólogo / podólogo a cargo, enfermera, paciente, sin rol, `anonymous`, `cron_notificaciones`,
  `sync_identidad`): prueba pgTAP 75 (sugerida).
- **Decisión legal P-1:** el odontograma, los tratamientos y las radiografías son datos clínicos de salud: **este change no
  puede pasar a producción con datos reales de pacientes** hasta cerrar P-1 y los puntos nuevos (acreditación ante el MINSA,
  registro ante la ANPD). Se apoya en la guarda de datos reales de H6 (`exigir_paciente_admisible()` sobre las cuatro tablas);
  con datos sintéticos de demostración no hay bloqueo.
- **Imágenes (P-15, decisión abierta del usuario):** este change **no resuelve** si se admiten imágenes como adjuntos ni diseña
  su almacenamiento. Mientras no se decida, la radiografía se vincula a un adjunto PDF, que es lo único que `adjuntos_historia`
  admite; la parte de imágenes de H6e no cierra hasta que se decida (TECH-DESIGN, P-15).
- **Norma del odontograma (NTS 188): no verificada.** Este change no cita su contenido ni asume sus símbolos, colores o campos
  mínimos; el catálogo y la plantilla son propuesta `REVISAR` y se contrastan con el texto oficial antes de usar datos reales
  (tarea 0.3).
- **ADR:** apoya y aplica [ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (aceptada; las tablas propias
  que ella prevé donde la plantilla no basta), y respeta [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0024](../../../docs/adrs/0024-almacenamiento-de-adjuntos-vercel-blob.md),
  [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (propuesta) y
  [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (propuesta; no restringe nada de
  Odontología). No requiere una ADR propia; si Fisioterapia y Podología repiten el patrón «tabla hija de la atención con sello
  propio», conviene una ADR común (ver `design.md`, D10).
- **Código nuevo:** `migrations/*.sql` (siete archivos nuevos, D16); `lib/odontologia/` (piezas FDI, errores, repositorio),
  `lib/schemas/odontologia.ts`, `lib/historias/odontologia.ts` (composición de la lectura con su registro de acceso);
  `app/profesional/pacientes/[pacienteId]/odontograma/` y el editor dentro de la atención (hoy `app/medico/**` si se rechaza
  ADR-0030); `components/clinica/odontograma/`; `tests/pgtap/75_*`, `tests/concurrencia/` (una prueba), `tests/odontologia/`,
  `e2e/odontologia.spec.ts`.
- **Base de datos:** tablas `odontogramas`, `odontograma_registros`, `odontograma_tratamientos`, `radiografias_odontologicas` y
  `catalogo_odontologico`; seis tipos `enum`; funciones `pieza_fdi_valida()`, `denticion_de_pieza()`,
  `especialidad_odontologia_id()`, `huella_odontograma()`, `verificar_odontograma()`, `odontograma_actual()`,
  `tratamientos_odontologicos_pendientes()` y `copia_seccion_odontologia()`; SQLSTATE `HC050` a `HC056` (`HC057`–`HC059`
  reservados). No se editan migraciones aplicadas ni políticas de H2 o H6.
- **Dependencias nuevas:** ninguna. **Infraestructura:** ninguna variable de entorno ni rol de Postgres nuevos.
- **Qué NO incluye (no se construye ni se sugiere):** **presupuestos, cuotas, cobros ni facturación de tratamientos**; receta
  (si el odontólogo puede recetar es la pregunta abierta de H6c y la resuelve `recetas-medicas`); el diseño del almacenamiento de
  imágenes ni la decisión P-15; periodontograma, ortodoncia, cefalometría ni implantología más allá de lo que el PRD enumera;
  consentimientos informados (no están en el PRD); dictado por voz e inteligencia artificial (también para leer radiografías);
  acceso del paciente a su odontograma desde el portal; integración con laboratorios o farmacias, inventario de insumos,
  telemedicina, multi-sede y analítica de BI; las otras especialidades.
- **Preguntas abiertas que no se deciden aquí** (`design.md`, «Open Questions»): P-15 (imágenes), contenido y símbolos de la
  NTS 188, revisión de los catálogos con los odontólogos, si el odontólogo puede recetar, y cómo corregir el odontograma sin
  tener que abrir una atención completa.
