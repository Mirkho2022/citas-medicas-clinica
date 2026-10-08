# ADR 0013: Definición de "historia clínica digitalizada"

## Estado

Aceptado

## Contexto

El criterio de éxito del PRD exige que el 60% de las historias clínicas estén "digitalizadas y
disponibles en el sistema" a los 4-5 meses de uso, pero no define qué cuenta como digitalizado. El
diseño inicial señalaba esto como riesgo ("cambia el esfuerzo de migración en un orden de
magnitud") y dejaba una propuesta pendiente de confirmación del cliente: sin esta definición no se
puede diseñar la fase 4 de migración ni medir si el 60% se cumplió.

## Decisión

**Híbrido**: se estructuran en campos de `atenciones` los antecedentes y diagnósticos activos del
paciente (los datos que el médico realmente necesita consultar en tiempo real durante una
atención), y el resto del expediente en papel se adjunta como escaneo (PDF) en Vercel Blob ([ADR-0024](0024-almacenamiento-de-adjuntos-vercel-blob.md)),
vinculado a la historia clínica del paciente como respaldo. Una historia cuenta como
"digitalizada" quiere decir: tiene al menos un registro estructurado de antecedentes/diagnósticos
activos en el sistema (con o sin adjunto de respaldo).

## Alternativas consideradas

- **Solo escaneo PDF** — la migración es rápida y el 60% sería alcanzable con holgura, pero el
  médico no podría buscar ni filtrar nada dentro del PDF: no cumple el beneficio real que el PRD
  persigue ("se elimina la búsqueda de historias en papel a último momento — las historias están
  disponibles en tiempo real"). Un PDF escaneado no está "disponible en tiempo real" en ningún
  sentido útil para la consulta médica.
- **Todo estructurado** — es lo clínicamente más valioso, pero transcribir el expediente completo
  de cada paciente a campos estructurados cuesta un orden de magnitud más por historia; pone en
  riesgo real llegar al 60% en el plazo de 4-5 meses del PRD, dado el volumen de historias en
  papel a migrar.

## Consecuencias

- El médico puede consultar antecedentes y diagnósticos activos de un paciente sin abrir un PDF,
  que es el escenario que sostiene el objetivo de reducir el tiempo de espera a ≤20 minutos.
- La medición del 60% tiene una definición objetiva y verificable en base de datos (existencia de
  al menos un registro estructurado), en vez de depender de un juicio caso por caso.
- **Trade-off:** el expediente histórico completo del paciente (todo lo que no sean antecedentes o
  diagnósticos activos) permanece solo como escaneo no consultable; si más adelante se necesita
  buscar dentro de ese histórico completo, requiere una segunda fase de digitalización no cubierta
  por este alcance.
