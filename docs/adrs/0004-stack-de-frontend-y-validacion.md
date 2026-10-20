# ADR 0004: Stack de frontend y validación

## Estado

Aceptado

## Contexto

El portal de autoservicio del paciente debe ser usable "sin ayuda" por adultos mayores (métrica de
éxito del PRD: 75% de citas autogestionadas). La historia clínica no puede guardarse "con campos
vacíos o datos inválidos" (caso borde del PRD). Se necesita un stack de UI accesible por defecto y
una estrategia de validación cuya autoridad no dependa de que el cliente ejecute JavaScript
correctamente.

## Decisión

**Tailwind CSS + shadcn/ui + `react-hook-form`** para la interfaz, y **Zod** para validación, con
esquemas compartidos entre cliente y servidor bajo `lib/schemas/`. El servidor es siempre la
validación autoritativa: toda Server Action valida con Zod antes de tocar la base de datos,
independientemente de lo que el formulario del cliente ya haya validado.

## Consecuencias

- shadcn/ui da componentes accesibles (foco, roles ARIA, contraste) sin construirlos desde cero,
  lo que ayuda a cumplir el objetivo WCAG 2.1 AA del portal.
- Compartir el esquema Zod entre cliente y servidor evita que la regla de "sin campos vacíos o
  inválidos" viva en dos sitios que puedan divergir.
- **Trade-off:** validar dos veces (cliente para UX inmediata, servidor como autoridad) duplica el
  costo de mantenimiento de cada esquema cuando cambia un campo de la historia clínica o del
  registro de paciente; un cambio de regla de negocio en un esquema Zod que se olvide replicar deja
  al cliente mostrando un mensaje que el servidor luego contradice.

> **Nota (2026-10-09):** la identidad visual (colores, tipografía, espaciado, radios y sombras) se define en
> [DESIGN.md](../DESIGN.md) y se genera como tema de Tailwind v4 con `npm run tema`; shadcn/ui queda como base de los
> componentes, ajustada a esos tokens (change `sistema-de-diseno-ui`, H2b). La decisión de este ADR no cambia.
