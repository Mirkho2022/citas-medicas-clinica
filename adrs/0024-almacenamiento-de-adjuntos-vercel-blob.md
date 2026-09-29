# ADR 0024: Almacenamiento de adjuntos clínicos: Vercel Blob

## Estado

Aceptado — reemplaza la parte de almacenamiento de
[ADR-0002](0002-base-de-datos-y-autenticacion.md), a partir de un cambio de stack decidido por el
cliente.

## Contexto

Supabase Storage ya no aplica. [ADR-0013](0013-definicion-de-historia-clinica-digitalizada.md)
exige poder adjuntar el escaneo (PDF) de respaldo del expediente en papel a la historia clínica del
paciente. Hace falta dónde guardar ese archivo y cómo controlar quién puede leerlo — el mismo
control de acceso que exige el resto de la historia clínica (solo el médico a cargo).

## Decisión

**Vercel Blob** (`@vercel/blob`) con acceso **privado** (no público). Un adjunto se sube y se lee
únicamente a través de una Server Action que primero verifica `medico_tiene_paciente()` contra
Postgres, y solo entonces genera una URL firmada de corta duración (unos minutos) para ese archivo
específico — nunca se expone una URL pública ni permanente.

## Alternativas consideradas

- **Cloudflare R2 / AWS S3 (compatible S3)** — más portable entre proveedores (estándar S3),
  potencialmente más barato en *egress* a mayor volumen. Se descartó porque agrega una cuenta y
  credencial más que gestionar fuera del ecosistema de Vercel, sin un beneficio claro al volumen de
  adjuntos que este proyecto maneja (escaneos de respaldo, no el expediente completo — ver
  ADR-0013).
- **UploadThing** — capa de experiencia de desarrollo sobre S3, rápida de integrar. Se descartó por
  ser un proveedor adicional (y su costo) solo para esta pieza, sin resolver nada que Vercel Blob no
  resuelva ya directamente para este volumen.

## Consecuencias

- Sin cuenta ni credencial adicional que gestionar fuera de Vercel — coherente con mantener el
  despliegue en un solo proveedor.
- **Trade-off importante:** Vercel Blob no tiene un equivalente a RLS a nivel de fila como Postgres.
  Para el resto de la historia clínica, la autoridad de acceso es la base de datos (RLS) incluso si
  hay un bug en la aplicación; para los adjuntos, la autoridad de acceso pasa a ser **la Server
  Action que genera la URL firmada** — un bug ahí (por ejemplo, olvidar el chequeo de
  `medico_tiene_paciente()` antes de firmar la URL) sí puede exponer un adjunto a quien no
  corresponde, sin que RLS lo detenga. Es una excepción puntual al principio general de "RLS es la
  autoridad, no un `if` en una Server Action" que rige el resto del sistema — la función que genera
  URLs firmadas de adjuntos merece la misma revisión explícita que las políticas RLS de
  `atenciones`.
