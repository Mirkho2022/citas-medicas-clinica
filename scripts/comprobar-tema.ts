// Comprueba que la interfaz no se separa de docs/DESIGN.md (H2b, tarea 1.4). Tres verificaciones:
//   1. app/tema.generado.css coincide con lo que generaría DESIGN.md ahora mismo.
//   2. Ningún archivo bajo app/ ni components/ (salvo el CSS generado) declara un color literal.
//   3. El contraste WCAG de cada par de texto y fondo de DESIGN.md y de una lista de pares adicionales.
//   4. Los estilos de texto que conoce `cn` (lib/ui/estilos-texto.ts) son los de DESIGN.md.
//   5. El movimiento de DESIGN.md cumple las reglas aprobadas: nada pasa de 320 ms (salvo el ciclo del esqueleto) y salir
//      es más rápido que entrar.
// Sale con código 1 si alguna falla. Uso: npm run tema:comprobar
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ESTILOS_TEXTO } from "../lib/ui/estilos-texto.ts";
import { contraste } from "./lib/contraste.ts";
import { generarTema, leerDesign, validarMovimiento } from "./lib/tema.ts";

const DESIGN = "docs/DESIGN.md";
const CSS_GENERADO = "app/tema.generado.css";
const CARPETAS = ["app", "components"];
const EXTENSIONES = [".ts", ".tsx", ".css", ".mdx"];

// Excepciones a la regla «sin colores literales». Cada una nombra el archivo, el valor y el porqué. Hoy no hay ninguna:
// añadir una exige justificarla aquí, a la vista de la revisión.
const EXCEPCIONES: Array<{ archivo: string; valor: string; motivo: string }> = [];

// Pares de color adicionales a los `components` de DESIGN.md. [texto, fondo, mínimo]: 4,5 para texto, 3 para bordes de
// controles, anillo de foco e iconos. Los nombres son tokens de `colors`.
const PARES_ADICIONALES: Array<[string, string, number]> = [
  ["ink", "surface", 4.5],
  ["ink", "canvas", 4.5],
  ["ink", "surface-muted", 4.5],
  ["ink-muted", "surface", 4.5],
  ["ink-muted", "canvas", 4.5],
  ["ink-muted", "surface-muted", 4.5],
  ["primary", "surface", 4.5], // enlaces
  ["primary", "canvas", 4.5],
  ["primary-text", "surface", 4.5], // botón secundario
  ["primary-text", "primary-soft", 4.5], // navegación activa
  ["on-primary", "primary", 4.5],
  ["on-primary", "primary-dark", 4.5],
  ["on-primary", "error", 4.5],
  ["error", "surface", 4.5], // mensaje de error de un campo
  ["success", "surface", 4.5],
  ["warning", "surface", 4.5],
  ["info", "surface", 4.5],
  ["border-control", "surface", 3], // borde de campos
  ["border-control", "canvas", 3],
  ["primary", "surface", 3], // anillo de foco
  ["primary", "canvas", 3],
];

const problemas: string[] = [];
const normalizar = (t: string) => t.replace(/\r\n/g, "\n");

// 1. El CSS generado coincide con DESIGN.md.
const { css: esperado, avisos } = generarTema(readFileSync(DESIGN, "utf8"));
for (const aviso of avisos) console.warn(`Aviso: ${aviso}`);
if (!existsSync(CSS_GENERADO)) {
  problemas.push(`${CSS_GENERADO} no existe: ejecute «npm run tema»`);
} else if (normalizar(readFileSync(CSS_GENERADO, "utf8")) !== normalizar(esperado)) {
  problemas.push(`${CSS_GENERADO} no coincide con ${DESIGN}: ejecute «npm run tema» y revise el cambio`);
}

// 2. Sin colores literales fuera del CSS generado.
const LITERALES = [/#[0-9a-fA-F]{8}\b/g, /#[0-9a-fA-F]{6}\b/g, /#[0-9a-fA-F]{3,4}\b/g, /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g];
function archivos(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  return (readdirSync(carpeta, { recursive: true }) as string[])
    .map((r) => join(carpeta, r))
    .filter((r) => statSync(r).isFile() && EXTENSIONES.some((e) => r.endsWith(e)))
    .map((r) => relative(".", r).replaceAll("\\", "/"))
    .filter((r) => r !== CSS_GENERADO);
}
for (const archivo of CARPETAS.flatMap(archivos)) {
  readFileSync(archivo, "utf8")
    .split(/\r?\n/)
    .forEach((linea, i) => {
      for (const patron of LITERALES) {
        for (const m of linea.matchAll(patron)) {
          if (EXCEPCIONES.some((e) => e.archivo === archivo && e.valor === m[0])) continue;
          problemas.push(`${archivo}:${i + 1}: color literal «${m[0]}» (use un token de ${DESIGN})`);
        }
      }
    });
}

// 3. Contraste.
const { design } = leerDesign(readFileSync(DESIGN, "utf8"));
function colorDe(valor: string, contexto: string): string {
  const hex = design.colors[valor] ?? valor;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`${contexto}: «${valor}» no es un color de DESIGN.md`);
  return hex;
}
let pares = 0;
for (const [nombre, c] of Object.entries(design.components)) {
  if (!c.backgroundColor || !c.textColor) continue;
  pares++;
  const razon = contraste(colorDe(c.textColor, nombre), colorDe(c.backgroundColor, nombre));
  if (razon < 4.5) problemas.push(`Contraste de «${nombre}»: ${razon.toFixed(2)}:1, mínimo 4,5:1`);
}
for (const [texto, fondo, minimo] of PARES_ADICIONALES) {
  pares++;
  const razon = contraste(colorDe(texto, "pares adicionales"), colorDe(fondo, "pares adicionales"));
  if (razon < minimo) problemas.push(`Contraste de ${texto} sobre ${fondo}: ${razon.toFixed(2)}:1, mínimo ${minimo}:1`);
}

// 4. `cn` conoce los mismos estilos de texto que DESIGN.md (si no, descarta `text-label-lg` creyéndolo un color).
const enDesign = Object.keys(design.typography).sort().join(", ");
const enCn = [...ESTILOS_TEXTO].sort().join(", ");
if (enDesign !== enCn) {
  problemas.push(
    `lib/ui/estilos-texto.ts no coincide con la tipografía de ${DESIGN}: «${enCn}» frente a «${enDesign}»`,
  );
}

// 5. Movimiento.
problemas.push(...validarMovimiento(design.motion));

if (problemas.length > 0) {
  console.error(`tema:comprobar encontró ${problemas.length} problema(s):`);
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`tema:comprobar correcto: CSS al día, sin colores literales y ${pares} pares de contraste en regla.`);
