// Lectura de docs/DESIGN.md y generación del tema de Tailwind v4 (H2b, grupo 1). Funciones puras, sin acceso a disco:
// las usan scripts/generar-tema.ts, scripts/comprobar-tema.ts y las pruebas de tests/tema/.
import { parse } from "yaml";

export type Tokens = Record<string, unknown>;

export interface Design {
  colors: Record<string, string>;
  typography: Record<string, Record<string, string | number>>;
  rounded: Record<string, string>;
  spacing: Record<string, string>;
  shadows: Record<string, string>;
  components: Record<string, Record<string, string>>;
  // El front matter completo, ya parseado, para resolver referencias `{colors.x}`.
  raiz: Tokens;
}

const CLAVES_CONOCIDAS = [
  "version",
  "name",
  "description",
  "colors",
  "typography",
  "rounded",
  "spacing",
  "shadows",
  "components",
];
const CLAVES_TEXTO = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"];

// Familias que el tema sabe servir: la variable CSS que expone next/font y el papel que cumplen en Tailwind.
const FAMILIAS: Record<string, { variable: string; papel: "display" | "sans"; respaldo: string }> = {
  "Plus Jakarta Sans": {
    variable: "--font-jakarta",
    papel: "display",
    respaldo: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
  },
  Inter: {
    variable: "--font-inter",
    papel: "sans",
    respaldo: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
};

// Variables que shadcn/ui espera, según la tabla de correspondencia de DESIGN.md («Components») más los `*-foreground`
// que la tabla no nombra. Valor = token de color de DESIGN.md.
const SHADCN: Array<[string, string]> = [
  ["background", "canvas"],
  ["foreground", "ink"],
  ["card", "surface"],
  ["card-foreground", "ink"],
  ["popover", "surface"],
  ["popover-foreground", "ink"],
  ["primary", "primary"],
  ["primary-foreground", "on-primary"],
  ["secondary", "primary-soft"],
  ["secondary-foreground", "primary-text"],
  ["muted", "surface-muted"],
  ["muted-foreground", "ink-muted"],
  ["accent", "primary-soft"],
  ["accent-foreground", "primary-text"],
  ["destructive", "error"],
  ["destructive-foreground", "on-primary"],
  ["border", "border"],
  ["input", "border-control"],
  ["ring", "primary"],
];

export function extraerFrontMatter(md: string): string {
  const texto = md.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(texto);
  if (!m) throw new Error("DESIGN.md no tiene front matter YAML (bloque entre líneas ---)");
  return m[1];
}

// Sustituye cada `{ruta.al.token}` por su valor. Una ruta que no existe es un error. Si apunta a un grupo (como
// `{typography.label-lg}` en `components`), es un error salvo que `permitirGrupos` sea verdadero: entonces se conserva
// la referencia tal cual, porque el generador no la traduce a CSS.
export function resolverReferencias(valor: string, raiz: Tokens, permitirGrupos = false): string {
  return valor.replace(/\{([^{}]+)\}/g, (_, ruta: string) => {
    let actual: unknown = raiz;
    for (const parte of ruta.split(".")) {
      if (actual === null || typeof actual !== "object" || !(parte in actual)) {
        throw new Error(`Referencia rota en DESIGN.md: {${ruta}}`);
      }
      actual = (actual as Tokens)[parte];
    }
    if (typeof actual !== "string" && typeof actual !== "number") {
      if (permitirGrupos) return `{${ruta}}`;
      throw new Error(`La referencia {${ruta}} no apunta a un valor simple`);
    }
    return String(actual);
  });
}

function resolverGrupo<T extends string | number>(grupo: unknown, raiz: Tokens, permitirGrupos = false): Record<string, T> {
  const salida: Record<string, T> = {};
  if (grupo === undefined || grupo === null) return salida;
  if (typeof grupo !== "object") throw new Error("Un grupo de tokens de DESIGN.md debe ser un mapa");
  for (const [clave, valor] of Object.entries(grupo)) {
    salida[clave] = (typeof valor === "string" ? resolverReferencias(valor, raiz, permitirGrupos) : valor) as T;
  }
  return salida;
}

export function leerDesign(md: string): { design: Design; avisos: string[] } {
  const raiz = parse(extraerFrontMatter(md)) as Tokens;
  const avisos: string[] = [];
  for (const clave of Object.keys(raiz)) {
    if (!CLAVES_CONOCIDAS.includes(clave)) avisos.push(`Clave desconocida en DESIGN.md: «${clave}» (se ignora)`);
  }

  const typography: Design["typography"] = {};
  for (const [nombre, estilo] of Object.entries((raiz.typography ?? {}) as Record<string, Tokens>)) {
    typography[nombre] = resolverGrupo(estilo, raiz);
    for (const clave of Object.keys(estilo)) {
      if (!CLAVES_TEXTO.includes(clave)) {
        avisos.push(`Clave desconocida en typography.${nombre}: «${clave}» (se ignora)`);
      }
    }
  }
  const components: Design["components"] = {};
  for (const [nombre, c] of Object.entries((raiz.components ?? {}) as Record<string, Tokens>)) {
    components[nombre] = resolverGrupo(c, raiz, true);
  }

  return {
    design: {
      colors: resolverGrupo(raiz.colors, raiz),
      typography,
      rounded: resolverGrupo(raiz.rounded, raiz),
      spacing: resolverGrupo(raiz.spacing, raiz),
      shadows: resolverGrupo(raiz.shadows, raiz),
      components,
      raiz,
    },
    avisos,
  };
}

// `44px` → `2.75rem`. Los valores de 100 px o más (el radio de las píldoras) y los de otras unidades se conservan.
export function aRem(valor: string | number): string {
  const texto = String(valor).trim();
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(texto);
  if (!m) return texto;
  const px = Number(m[1]);
  if (Math.abs(px) >= 100) return texto;
  return `${Number((px / 16).toFixed(4))}rem`;
}

function bloque(lineas: string[]): string {
  return lineas.map((l) => (l === "" ? "" : `  ${l}`)).join("\n");
}

export function generarTema(md: string): { css: string; avisos: string[] } {
  const { design, avisos } = leerDesign(md);

  const colores = Object.entries(design.colors).map(([n, v]) => `--color-${n}: ${v};`);

  const fuentes: string[] = [];
  const papeles = new Set<string>();
  for (const estilo of Object.values(design.typography)) {
    const familia = String(estilo.fontFamily ?? "");
    const f = FAMILIAS[familia];
    if (!f) throw new Error(`Familia tipográfica sin servir en el tema: «${familia}» (añádala a scripts/lib/tema.ts)`);
    if (papeles.has(f.papel)) continue;
    papeles.add(f.papel);
    fuentes.push(`--font-${f.papel}: var(${f.variable}), ${f.respaldo};`);
  }

  const textos: string[] = [];
  for (const [nombre, e] of Object.entries(design.typography)) {
    textos.push(`--text-${nombre}: ${aRem(e.fontSize)};`);
    if (e.lineHeight !== undefined) textos.push(`--text-${nombre}--line-height: ${aRem(e.lineHeight)};`);
    if (e.fontWeight !== undefined) textos.push(`--text-${nombre}--font-weight: ${e.fontWeight};`);
    if (e.letterSpacing !== undefined) textos.push(`--text-${nombre}--letter-spacing: ${e.letterSpacing};`);
  }

  // `--space-*` y no `--spacing-*`: en Tailwind v4 `--spacing-md` redefiniría también `max-w-md`, `w-lg`… (los toma de
  // `--spacing` antes que de `--container`). La escala de 4 px de DESIGN.md ya coincide con `p-1`…`p-12`.
  const espacios = Object.entries(design.spacing).map(([n, v]) => `--space-${n}: ${aRem(v)};`);
  const radios = Object.entries(design.rounded).map(([n, v]) => `--radius-${n}: ${aRem(v)};`);
  const sombras = Object.entries(design.shadows).map(
    ([n, v]) => `--shadow-${n.replace(/^shadow-/, "")}: ${v};`,
  );

  for (const [, token] of SHADCN) {
    if (!(token in design.colors)) throw new Error(`El color «${token}» que usa la capa de shadcn/ui no está en DESIGN.md`);
  }
  if (!("md" in design.rounded)) throw new Error("DESIGN.md no define rounded.md (radio base de shadcn/ui)");

  // Alias `--color-background: var(--background)` solo para los nombres que no son ya un token de DESIGN.md.
  const alias = SHADCN.filter(([n]) => !(n in design.colors)).map(([n]) => `--color-${n}: var(--${n});`);
  const variables = SHADCN.map(([n, token]) => `--${n}: var(--color-${token});`);

  const css = [
    "/* Archivo generado por scripts/generar-tema.ts a partir de docs/DESIGN.md.",
    "   No editar a mano: cambie DESIGN.md y ejecute `npm run tema`. */",
    "",
    "@theme static {",
    bloque([...colores, "", ...fuentes, "", ...textos, "", ...espacios, "", ...radios, "", ...sombras]),
    "}",
    "",
    "/* Capa de correspondencia con shadcn/ui (tabla «Components» de DESIGN.md). */",
    "@theme inline {",
    bloque(alias),
    "}",
    "",
    ":root {",
    bloque([...variables, `--radius: ${aRem(design.rounded.md)};`]),
    "}",
    "",
  ].join("\n");

  return { css, avisos };
}
