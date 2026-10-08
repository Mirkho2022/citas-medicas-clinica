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
  "E2E_ADMINISTRATIVO_EMAIL",
  "E2E_ADMINISTRATIVO_PASSWORD",
  "E2E_ADMINISTRATIVO_TOTP_SECRET",
];
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
    const valor = process.env[nombre]?.trim();
    if (!valor) {
      console.log(`OMITIDO  ${nombre} (no está en ${ENV_FILE})`);
      faltan++;
      continue;
    }
    if (dryRun) {
      console.log(`listo    ${tipo} ${nombre} (se subiría)`);
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
