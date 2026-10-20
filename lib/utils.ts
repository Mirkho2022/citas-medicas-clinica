import { createCn } from "cn/config"
import { ESTILOS_TEXTO } from "./ui/estilos-texto.ts"

// `cn` de shadcn/ui (une clases y resuelve conflictos) con los estilos de texto de DESIGN.md registrados como tamaños de
// letra. Sin esto, `cn("text-label-lg", "text-primary-foreground")` descarta `text-label-lg` por creerlo un color y el
// botón pierde su tamaño y su peso. Si regenera este archivo con la CLI de shadcn/ui, restaure esta versión.
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...ESTILOS_TEXTO] }] } },
})
