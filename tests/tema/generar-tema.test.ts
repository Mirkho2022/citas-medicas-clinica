// Pruebas del generador del tema (H2b, tarea 1.3): scripts/lib/tema.ts. Sin red ni base de datos.
// Ejecutar con: npm run test:tema
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  aRem,
  generarTema,
  leerDesign,
  resolverReferencias,
  validarKeyframes,
  validarMovimiento,
} from "../../scripts/lib/tema.ts";

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

test("el DESIGN.md real genera 22 colores, 10 estilos de texto, 3 sombras y 18 valores de movimiento, y es idempotente", () => {
  const md = readFileSync("docs/DESIGN.md", "utf8");
  const primera = generarTema(md);
  assert.deepEqual(primera.avisos, []);
  assert.equal([...primera.css.matchAll(/^ {2}--color-[a-z-]+: #[0-9A-F]{6};$/gm)].length, 22);
  assert.equal([...primera.css.matchAll(/^ {2}--text-(?:[a-z]+-?)+: [0-9.]+rem;$/gm)].length, 10);
  assert.equal([...primera.css.matchAll(/^ {2}--shadow-[a-z-]+: /gm)].length, 3);
  assert.equal([...primera.css.matchAll(/^ {2}--ease-[a-z-]+: cubic-bezier\(/gm)].length, 2);
  assert.equal([...primera.css.matchAll(/^ {2}--motion-[a-z-]+: \d+ms;$/gm)].length, 16);
  assert.equal(generarTema(md).css, primera.css);
});

const MOVIMIENTO = '  ease-salida-rapida: "cubic-bezier(0.23, 1, 0.32, 1)"\n  press: 120ms\n  toast-in: 240ms\n  toast-out: 140ms\n';

test("las curvas van a --ease-* y las duraciones a --motion-*, sin pisar las de Tailwind", () => {
  const { css, avisos } = generarTema(design(`motion:\n${MOVIMIENTO}`));
  assert.deepEqual(avisos, []);
  assert.match(css, /^ {2}--ease-salida-rapida: cubic-bezier\(0\.23, 1, 0\.32, 1\);$/m);
  assert.match(css, /^ {2}--motion-press: 120ms;$/m);
  assert.match(css, /^ {2}--motion-toast-in: 240ms;$/m);
  assert.ok(!/--ease-out:/.test(css) && !/--motion-ease/.test(css));
});

test("sin grupo motion no se genera ninguna variable de movimiento", () => {
  const { css } = generarTema(design());
  assert.ok(!css.includes("--motion-") && !css.includes("--ease-"));
});

test("validarMovimiento acepta el movimiento del DESIGN.md real", () => {
  const { design: real } = leerDesign(readFileSync("docs/DESIGN.md", "utf8"));
  assert.deepEqual(validarMovimiento(real.motion), []);
});

test("validarMovimiento rechaza una duración mayor de 320 ms, pero deja pasar el ciclo del esqueleto", () => {
  assert.deepEqual(validarMovimiento({ skeleton: "1400ms", "sheet-in": "320ms" }), []);
  assert.deepEqual(validarMovimiento({ "sheet-in": "321ms" }), ["motion.sheet-in: 321 ms supera el máximo de 320 ms"]);
});

test("validarMovimiento exige que salir sea más rápido que entrar", () => {
  assert.deepEqual(validarMovimiento({ "toast-in": "240ms", "toast-out": "140ms" }), []);
  assert.deepEqual(validarMovimiento({ "toast-in": "240ms", "toast-out": "240ms" }), [
    "motion.toast-out: 240 ms no es más rápido que toast-in (240 ms): salir debe ser más rápido que entrar",
  ]);
  assert.equal(validarMovimiento({ "dialog-in": "200ms", "dialog-out": "300ms" }).length, 1);
});

test("validarMovimiento rechaza valores que no son curvas ni milisegundos", () => {
  const problemas = validarMovimiento({ "ease-rara": "ease-in-out", press: "0.12s", reduced: "150" });
  assert.equal(problemas.length, 3);
  assert.match(problemas[0], /ease-rara.*cubic-bezier/);
  assert.match(problemas[1], /press.*milisegundos/);
  assert.match(problemas[2], /reduced.*milisegundos/);
});

test("validarKeyframes acepta transform y opacity, aunque haya comentarios y varios pasos", () => {
  const css = `/* @keyframes falso { a { color: red; } } */
    @keyframes brillo { from { transform: translateX(-100%); } 50% { opacity: .5; transform: none } to { transform: translateX(100%); } }`;
  assert.deepEqual(validarKeyframes(css, "x.css"), []);
});

test("validarKeyframes rechaza animar otra propiedad y dice cuál y dónde", () => {
  const css = "@keyframes brillo { from { background-position: 200% 0; } to { background-position: -200% 0; } }";
  assert.deepEqual(validarKeyframes(css, "app/globals.css"), [
    "app/globals.css: @keyframes brillo anima «background-position»; solo se animan transform y opacity",
    "app/globals.css: @keyframes brillo anima «background-position»; solo se animan transform y opacity",
  ]);
  assert.equal(validarKeyframes("@keyframes a { to { transform: none; color: red } } @keyframes b { to { opacity: 1 } }", "x").length, 1);
});

test("los CSS propios de app/ solo animan transform y opacity, y el esqueleto lo hace con transform", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.deepEqual(validarKeyframes(css, "app/globals.css"), []);
  assert.match(css, /@keyframes brillo\s*\{\s*from\s*\{\s*transform: translateX\(-100%\);/);
  assert.match(css, /\.esqueleto::after[\s\S]*?animation: brillo var\(--motion-skeleton\) linear infinite;/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.esqueleto::after\s*\{\s*display: none;/);
});
