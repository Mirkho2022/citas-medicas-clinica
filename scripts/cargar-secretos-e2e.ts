// Carga en GitHub (Actions) los secretos y la variable que necesita el workflow e2e.yml,
// leyendo los valores de .env.local. Imprime solo los nombres, nunca los valores.
//
// Uso (Node 24 ejecuta TypeScript directamente; sirve en PowerShell y en bash):
//   node scripts/cargar-secretos-e2e.ts            # sube a GitHub
//   node scripts/cargar-secretos-e2e.ts --dry-run  # solo comprueba qué valores hay en .env.local
//
// Requisitos: `gh` autenticado con permiso sobre el repo, y .env.local con los valores
// (incluida VERCEL_AUTOMATION_BYPASS_SECRET: Vercel > proyecto > Settings > Deployment
// Protection > Protection Bypass for Automation).
// Variables opcionales: REPO (por defecto Mirkho2022/citas-medicas-clinica), ENV_FILE.
import { spawnSync } from "node:child_process";

const REPO = process.env.REPO ?? "Mirkho2022/citas-medicas-clinica";
const ENV_FILE = process.env.ENV_FILE ?? ".env.local";
const dryRun = process.argv.includes("--dry-run");

const SECRETOS = [
  "CLERK_SECRET_KEY",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "E2E_PACIENTE_EMAIL",
  "E2E_PACIENTE_PASSWORD",
  "E2E_PACIENTE2_EMAIL",
  "E2E_PACIENTE2_PASSWORD",
  "E2E_DATABASE_URL",
  "E2E_ADMINISTRATIVO_EMAIL",
  "E2E_ADMINISTRATIVO_PASSWORD",
  "E2E_ADMINISTRATIVO_TOTP_SECRET",
];
// Secretos de GitHub cuyo valor está en .env.local con OTRO nombre. `E2E_DATABASE_URL` es la URL directa del dueño de la rama `dev` de Neon
// (la que sirve a los previews): con ella las E2E del portal siembran sus datos (e2e/datos-portal.ts). NUNCA la de producción.
const ALIAS: Record<string, string> = { E2E_DATABASE_URL: "DATABASE_URL_UNPOOLED" };

// La clave publicable de Clerk es pública: va como variable, no como secreto.
const VARIABLES = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  console.error(`No se pudo leer ${ENV_FILE} (¿estás en la raíz del proyecto?)`);
  process.exit(1);
}

function gh(args: string[], entrada?: string): boolean {
  const r = spawnSync("gh", args, {
    input: entrada,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.error || r.status !== 0) {
    console.error(`  gh falló: ${(r.stderr || r.error?.message || "").trim()}`);
    return false;
  }
  return true;
}

let faltan = 0;
let fallos = 0;

for (const [tipo, nombres] of [
  ["secreto ", SECRETOS],
  ["variable", VARIABLES],
] as const) {
  for (const nombre of nombres) {
    const origen = ALIAS[nombre] ?? nombre;
    const valor = process.env[origen]?.trim();
    if (!valor) {
      console.log(`OMITIDO  ${nombre} (no está ${origen} en ${ENV_FILE})`);
      faltan++;
      continue;
    }
    if (nombre === "E2E_DATABASE_URL") {
      // Una URL de producción o del pooler no sirve (y la de producción sería peligrosa): se niega a subirla.
      const { host } = new URL(valor);
      const produccion = process.env.DATABASE_URL_PRODUCCION;
      if (host.includes("-pooler") || (produccion && new URL(produccion).host === host)) {
        console.error(`RECHAZADO ${nombre}: ${origen} es del pooler o de producción; hace falta la URL directa de la rama dev`);
        fallos++;
        continue;
      }
    }
    if (dryRun) {
      console.log(`listo    ${tipo} ${nombre} (se subiría${origen === nombre ? "" : `, desde ${origen}`})`);
      continue;
    }
    const ok =
      tipo === "secreto "
        ? gh(["secret", "set", nombre, "--repo", REPO], valor)
        : gh(["variable", "set", nombre, "--repo", REPO, "--body", valor]);
    console.log(`${ok ? "subido " : "FALLÓ  "}  ${tipo} ${nombre}`);
    if (!ok) fallos++;
  }
}

if (faltan > 0) console.log(`\n${faltan} valor(es) faltan en ${ENV_FILE}.`);
if (fallos > 0) process.exit(1);
