// Nombres de los estilos de texto de docs/DESIGN.md (`typography`), tal como llegan a Tailwind (`text-<nombre>`).
// `cn` (lib/utils.ts) los necesita para no confundir `text-label-lg` con un color y descartarlo. `npm run tema:comprobar`
// falla si esta lista se separa de DESIGN.md.
export const ESTILOS_TEXTO = [
  "display-lg",
  "headline-lg",
  "headline-md",
  "title-md",
  "body-lg",
  "body-md",
  "body-sm",
  "label-lg",
  "label-md",
  "label-sm",
] as const;
