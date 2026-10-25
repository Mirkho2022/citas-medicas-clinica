// Genera app/tema.generado.css (tema de Tailwind v4) a partir del front matter de docs/02-diseno/DESIGN.md (H2b, tarea 1.2).
// DESIGN.md es la única fuente de los tokens; el CSS generado se commitea para que el build no dependa de este script.
//
// Uso: npm run tema        (equivale a: node scripts/generar-tema.ts)
import { readFileSync, writeFileSync } from "node:fs";
import { generarTema } from "./lib/tema.ts";

const ENTRADA = "docs/02-diseno/DESIGN.md";
const SALIDA = "app/tema.generado.css";

const { css, avisos } = generarTema(readFileSync(ENTRADA, "utf8"));
for (const aviso of avisos) console.warn(`Aviso: ${aviso}`);
writeFileSync(SALIDA, css, "utf8");
console.log(`${SALIDA} generado desde ${ENTRADA}`);
