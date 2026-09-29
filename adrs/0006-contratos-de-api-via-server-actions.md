# ADR 0006: Contratos de API vía Server Actions

## Estado

Aceptado

## Contexto

Con un único componente desplegable ([ADR 0020](0020-arquitectura-de-componentes-y-hosting-vercel.md)),
no hay dos servicios independientes que necesiten un contrato de red entre sí. Aun así, hace falta
definir cómo el cliente (formularios, portal) invoca mutaciones — reservar, cancelar, registrar
una atención — de forma que la validación de servidor sea siempre la autoridad y que ningún error
interno de Postgres se filtre al usuario.

## Decisión

Toda mutación pasa por **Server Actions de Next.js** (`reservarCita`, `cancelarCita`,
`reprogramarCita`, `registrarPaciente`, `registrarAtencion`, `firmarAtencion`, `agregarAddenda`,
`asignarTurno`, `reasignarPorBaja`), no por una API REST o GraphQL separada. Cada Server Action
valida con Zod en servidor antes de tocar la base de datos y devuelve un resultado tipado
`{ ok: true, datos } | { ok: false, mensaje }` — nunca deja escapar una excepción cruda de
PostgreSQL hacia el cliente.

## Consecuencias

- No hay que versionar ni documentar un contrato de API separado del propio código: el tipo de
  retorno de la Server Action y su firma en TypeScript **son** el contrato, verificados en tiempo
  de compilación.
- El formato uniforme de retorno permite mapear errores de base de datos (como `SQLSTATE 23P01`)
  a mensajes de negocio en español en un solo lugar por acción, sin filtrar estructura interna.
- **Trade-off:** las Server Actions solo sirven mientras el único consumidor sea la propia
  aplicación Next.js; si en el futuro un tercero (una app móvil, un partner) necesita invocar estas
  mismas operaciones, no hay contrato de API reutilizable y habría que construir uno desde cero.
