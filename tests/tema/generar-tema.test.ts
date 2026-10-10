// Pruebas del generador del tema (H2b, tarea 1.3): scripts/lib/tema.ts. Sin red ni base de datos.
// Ejecutar con: npm run test:tema
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aRem, generarTema, resolverReferencias } from "../../scripts/lib/tema.ts";

// DESIGN.md mínimo con todo lo que el generador exige (colores de la capa de shadcn/ui, rounded.md y las dos familias).
function design(extra = "", sombras = '  focus-ring: "0 0 0 2px {colors.surface}, 0 0 0 4px {colors.primary}"'): string {
  return `---
version: alpha
name: Prueba
colors:
  primary: "#0F766E"
  primary-soft: "#E6F4F1"
  primary-text: "#0B5C55"
  on-primary: "#FFFFFF"
  ink: "#14262B"
  ink-muted: "#4A5C63"
  canvas: "#F4F7F7"
  surface: "#FFFFFF"
  surface-muted: "#EAF0F0"
  border: "#CBD6D9"
  border-control: "#6F8087"
  error: "#B42318"
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: 700
    lineHeight: 44px
    letterSpacing: -0.02em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
rounded:
  md: 10px
  full: 999px
spacing:
  md: 16px
shadows:
${sombras}
${extra}---

## Cuerpo
`;
}

test("resuelve las referencias {colors.x} dentro de una sombra", () => {
  const { css } = generarTema(design());
  assert.match(css, /--shadow-focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px #0F766E;/);
});

test("resolverReferencias sustituye varias referencias en un mismo valor", () => {
  const raiz = { colors: { a: "#111111", b: "#222222" } };
  assert.equal(resolverReferencias("{colors.a} y {colors.b}", raiz), "#111111 y #222222");
});

test("rechaza una referencia rota y dice cuál", () => {
  assert.throws(
    () => generarTema(design("", '  focus-ring: "0 0 0 2px {colors.no-existe}"')),
    /Referencia rota en DESIGN\.md: \{colors\.no-existe\}/,
  );
});

test("conserva el orden de DESIGN.md", () => {
  const { css } = generarTema(design());
  const posicion = (texto: string) => css.indexOf(texto);
  assert.ok(posicion("--color-primary:") < posicion("--color-primary-soft:"));
  assert.ok(posicion("--color-surface:") < posicion("--color-error:"));
  assert.ok(posicion("--text-display-lg:") < posicion("--text-body-md:"));
});

test("convierte px a rem y conserva letterSpacing, fontWeight y el radio de las píldoras", () => {
  const { css } = generarTema(design());
  assert.match(css, /--text-display-lg: 2\.25rem;/);
  assert.match(css, /--text-display-lg--line-height: 2\.75rem;/);
  assert.match(css, /--text-display-lg--font-weight: 700;/);
  assert.match(css, /--text-display-lg--letter-spacing: -0\.02em;/);
  assert.match(css, /--space-md: 1rem;/);
  assert.match(css, /--radius-md: 0\.625rem;/);
  assert.match(css, /--radius-full: 999px;/);
  assert.equal(aRem("14px"), "0.875rem");
  assert.equal(aRem("0.5em"), "0.5em");
});

test("avisa de una clave desconocida sin romper la generación", () => {
  const { css, avisos } = generarTema(design("opacity:\n  alta: 0.9\n"));
  assert.deepEqual(avisos, ["Clave desconocida en DESIGN.md: «opacity» (se ignora)"]);
  assert.ok(!css.includes("opacity"));
});

test("falla si una familia tipográfica no se sirve en el tema", () => {
  const texto = design().replace("fontFamily: Inter", "fontFamily: Comic Sans");
  assert.throws(() => generarTema(texto), /Familia tipográfica sin servir en el tema: «Comic Sans»/);
});

test("falla si falta un color de la capa de shadcn/ui", () => {
  const texto = design().replace('  error: "#B42318"\n', "");
  assert.throws(() => generarTema(texto), /El color «error» que usa la capa de shadcn\/ui no está en DESIGN\.md/);
});

test("el DESIGN.md real genera 22 colores, 10 estilos de texto y 3 sombras, y es idempotente", () => {
  const md = readFileSync("docs/DESIGN.md", "utf8");
  const primera = generarTema(md);
  assert.deepEqual(primera.avisos, []);
  assert.equal([...primera.css.matchAll(/^ {2}--color-[a-z-]+: #[0-9A-F]{6};$/gm)].length, 22);
  assert.equal([...primera.css.matchAll(/^ {2}--text-(?:[a-z]+-?)+: [0-9.]+rem;$/gm)].length, 10);
  assert.equal([...primera.css.matchAll(/^ {2}--shadow-[a-z-]+: /gm)].length, 3);
  assert.equal(generarTema(md).css, primera.css);
});
