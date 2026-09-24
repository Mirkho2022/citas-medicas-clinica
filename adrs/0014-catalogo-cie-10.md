# ADR 0014: Fuente y alcance del catálogo CIE-10

## Estado

Aceptado

## Contexto

El esquema de `atenciones` (ver «Modelo de datos» en [TECH-DESIGN.md](../TECH-DESIGN.md)) ya guarda
diagnósticos como `jsonb` con la forma `{cie10, descripcion, tipo}`, pero el diseño inicial dejaba
sin resolver de dónde sale ese código y qué universo cubre: sin catálogo, el campo `cie10` es texto
libre de facto y el formulario de diagnóstico no puede autocompletar ni validar el código contra
nada.

## Decisión

Catálogo **completo** de CIE-10 (el publicado por OMS, adoptado por MINSA para Perú — el mismo
marco normativo que rige la historia clínica, ver riesgo P-1), cargado en una tabla `cie10`
(`codigo`, `descripcion`, y campos de jerarquía/capítulo si la fuente los distingue) por migración
de datos, no escrito a mano. El formulario de diagnóstico busca sobre esta tabla por código o
texto, y `atenciones.diagnosticos` valida cada entrada contra un código existente en `cie10`.

## Alternativas consideradas

- **Subconjunto curado** — un catálogo más pequeño, limitado a los códigos que usan las
  especialidades actuales de la clínica, haría el buscador más rápido y el formulario más simple
  de construir. Se descartó porque un diagnóstico fuera del subconjunto obligaría a una vía de
  "agregar código nuevo" no trivial de gobernar (¿quién aprueba agregar un código?), y porque la
  clínica ya está en expansión de personal médico (PRD, "Problema") — nuevas especialidades
  ampliarían el subconjunto constantemente.
- **Texto libre por ahora** — es lo más rápido de construir (nada que cargar ni mantener), pero dos
  médicos podrían registrar el mismo diagnóstico con dos textos distintos, y los diagnósticos no
  se podrían consultar ni agregar de forma fiable; migrarlos a un catálogo real después implica
  reprocesar todo el histórico ya registrado como texto libre.

## Consecuencias

- El formulario de diagnóstico puede ofrecer autocompletado y el sistema puede validar que todo
  código de diagnóstico registrado exista realmente en CIE-10, sin depender de que el médico lo
  escriba bien.
- Al ser el catálogo oficial completo, cualquier especialidad futura (fuera de alcance de esta
  versión, pero el sistema no bloquea su crecimiento) ya tiene sus códigos disponibles sin migrar
  el catálogo de nuevo.
- **Trade-off:** el catálogo CIE-10 completo tiene del orden de 14 000 códigos y se revisa
  periódicamente (nuevas versiones/actualizaciones publicadas por OMS/MINSA); alguien debe
  responsabilizarse de conseguir la fuente oficial vigente para la carga inicial y de aplicar
  actualizaciones futuras como una migración versionada más — no es una carga de una sola vez y
  luego olvidada.

## Nota de implementación: fuente y mecanismo de carga

**Fuente**, en orden de preferencia (a verificar cuál está vigente al momento de construir H6):

1. **Tabla del MINSA/SUSALUD** (vía su portal de datos abiertos o REUNIS) — es la referencia que la
   NTS peruana de historia clínica cita directamente, por lo que reduce el riesgo de discrepancia
   frente a P-1 (marco legal). Preferida si está disponible y descargable en un formato tabular.
2. **CIE-10 de la OMS** (`https://icd.who.int/browse10`, formato ClaML/XML) — fuente autoritativa
   internacional si la tabla local del MINSA no está disponible en formato reutilizable; requiere
   convertir de ClaML a filas `(codigo, descripcion)`.
3. Datasets de terceros (ministerios de salud de otros países hispanohablantes, o mirrors
   comunitarios) — usar solo como referencia de formato/estructura, nunca como fuente de verdad
   para la carga, porque no hay garantía de que coincidan con la versión que la norma peruana
   exige.

**Carga**: migración de datos versionada como cualquier otra
(`supabase/migrations/NNNN_seed_cie10.sql`), con el CSV de origen commiteado en el repo (o
referenciado por hash/fecha de descarga en el propio archivo de migración) y un
`INSERT ... ON CONFLICT (codigo) DO NOTHING` para que sea repetible sin duplicar filas. Una
actualización futura del catálogo (nueva revisión de la OMS/MINSA) se aplica como una migración
adicional, nunca editando la de carga inicial — regla general de
[CLAUDE.md](../CLAUDE.md) para el esquema `public`.
