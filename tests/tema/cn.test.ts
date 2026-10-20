// `cn` debe conocer los estilos de texto de DESIGN.md (H2b, hallazgo de la revisión de accesibilidad): `text-label-lg` es un
// tamaño de letra y no un color. Ejecutar con: npm run test:tema
import assert from "node:assert/strict";
import { test } from "node:test";
import { cn } from "../../lib/utils.ts";
import { ESTILOS_TEXTO } from "../../lib/ui/estilos-texto.ts";

test("un estilo de texto del sistema y un color conviven", () => {
  assert.equal(cn("text-label-lg", "text-primary-foreground"), "text-label-lg text-primary-foreground");
  assert.equal(cn("text-body-md text-foreground", "text-info"), "text-body-md text-info");
});

test("dos estilos de texto sí compiten: gana el último", () => {
  assert.equal(cn("text-label-lg", "text-label-md"), "text-label-md");
  assert.equal(cn("text-body-md", "text-title-md text-ink"), "text-title-md text-ink");
});

test("todos los estilos de ESTILOS_TEXTO se tratan como tamaño de letra", () => {
  for (const estilo of ESTILOS_TEXTO) {
    assert.equal(cn(`text-${estilo}`, "text-primary"), `text-${estilo} text-primary`, estilo);
  }
});
