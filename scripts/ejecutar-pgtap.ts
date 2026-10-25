// Ejecuta la suite pgTAP (tests/pgtap/*.test.sql) contra una base de pruebas de Neon.
//
// Uso (Node 24 ejecuta TypeScript directamente; sirve en PowerShell y en bash):
//   node scripts/ejecutar-pgtap.ts              # toda la suite
//   node scripts/ejecutar-pgtap.ts citas        # solo los archivos cuyo nombre contiene "citas"
//
// Conexión: DATABASE_URL_PRUEBAS (o DATABASE_URL), siempre la URL DIRECTA del rol dueño de un
// branch de desarrollo o efímero — nunca production. Variables opcionales: ENV_FILE (por defecto
// .env.local) y DATABASE_URL_PRODUCCION (si coincide el host, el script se niega a correr).
//
// Cómo funciona (mecanismo validado en docs/03-arquitectura/spike-rls-h2.md):
//  - Genera un par Ed25519 efímero por ejecución. pg_session_jwt solo acepta una JWK Ed25519 y solo
//    como opción de arranque de la conexión, que el pooler rechaza: por eso la URL debe ser directa.
//  - Firma tokens EdDSA por identidad de prueba (sub + publicMetadata.rol) con `jti` creciente y los
//    deja en pg_temp.tokens; tests/pgtap/_ayudas.sql define tests.autenticar_como(identidad).
//  - Cada archivo corre en su propia conexión y transacción: `create extension pgtap`, las ayudas y
//    el archivo; al final `rollback`. Los archivos solo traen el cuerpo pgTAP (plan ... finish).
import { generateKeyPairSync, sign } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

try {
  process.loadEnvFile(process.env.ENV_FILE ?? ".env.local");
} catch {
  // sin .env.local (CI): se usa el entorno del proceso
}

const DIRECTORIO = "tests/pgtap";
const TOKENS_POR_IDENTIDAD = 100;

// Identidades de prueba: sub = `user_test_<nombre>`; `rol` va en publicMetadata.rol como en Clerk.
// `sinCorreo`: el token no lleva el claim `email` (caso PA004 de registrar_paciente_portal).
const IDENTIDADES: { nombre: string; rol: string | null; sinCorreo?: boolean }[] = [
  { nombre: "administrativo", rol: "administrativo" },
  { nombre: "medico_a", rol: "medico" },
  { nombre: "medico_b", rol: "medico" },
  { nombre: "enfermera", rol: "enfermera" },
  { nombre: "paciente_a", rol: "paciente" },
  { nombre: "paciente_b", rol: "paciente" },
  { nombre: "paciente_sin_correo", rol: "paciente", sinCorreo: true },
  { nombre: "sin_rol", rol: null },
];

const url = process.env.DATABASE_URL_PRUEBAS ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_PRUEBAS (o DATABASE_URL): URL directa del branch de pruebas.");
  process.exit(1);
}
const host = new URL(url).host;
if (host.includes("-pooler")) {
  console.error("La URL es del pooler: pg_session_jwt.jwk solo se admite en conexión directa.");
  process.exit(1);
}
const produccion = process.env.DATABASE_URL_PRODUCCION;
if (produccion && new URL(produccion).host === host) {
  console.error("El destino es producción: la suite de pruebas nunca corre contra production.");
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const x = publicKey.export({ format: "jwk" }).x;
const jwkPublica = JSON.stringify({ kty: "OKP", crv: "Ed25519", x });

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const ahora = Math.floor(Date.now() / 1000);
function firmar(nombre: string, rol: string | null, jti: number, sinCorreo = false): string {
  const cabecera = b64({ alg: "EdDSA", typ: "JWT" });
  const carga = b64({
    sub: `user_test_${nombre}`,
    jti,
    nbf: ahora - 60,
    exp: ahora + 3600,
    // Claim `email` como el de la plantilla del JWT de Clerk (H4: `correo_actual()`); sin tilde ni mayúsculas.
    ...(sinCorreo ? {} : { email: `${nombre}@pruebas.invalid` }),
    publicMetadata: rol ? { rol } : {},
  });
  const firma = sign(null, Buffer.from(`${cabecera}.${carga}`), privateKey).toString("base64url");
  return `${cabecera}.${carga}.${firma}`;
}

const columnas: { identidad: string[]; sub: string[]; rol: (string | null)[]; jti: number[]; jwt: string[] } = {
  identidad: [],
  sub: [],
  rol: [],
  jti: [],
  jwt: [],
};
for (const { nombre, rol, sinCorreo } of IDENTIDADES) {
  for (let jti = 1; jti <= TOKENS_POR_IDENTIDAD; jti++) {
    columnas.identidad.push(nombre);
    columnas.sub.push(`user_test_${nombre}`);
    columnas.rol.push(rol);
    columnas.jti.push(jti);
    columnas.jwt.push(firmar(nombre, rol, jti, sinCorreo));
  }
}

const ayudas = readFileSync(join(DIRECTORIO, "_ayudas.sql"), "utf8");
const filtro = process.argv[2];
const archivos = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith(".test.sql") && (!filtro || f.includes(filtro)))
  .sort();
if (archivos.length === 0) {
  console.error(`No hay archivos .test.sql en ${DIRECTORIO}${filtro ? ` que contengan "${filtro}"` : ""}.`);
  process.exit(1);
}

const LINEA_TAP = /^(not ok|ok) \d+|^1\.\.\d+|^# /;
let pruebas = 0;
let fallos = 0;

async function ejecutar(archivo: string): Promise<void> {
  console.log(`\n# ${archivo}`);
  const cliente = new pg.Client({
    connectionString: url,
    options: `-c pg_session_jwt.jwk=${jwkPublica}`,
  });
  await cliente.connect();
  try {
    // Carga pg_session_jwt ANTES de cualquier función con cláusula SET (p. ej. rol_actual(), que
    // fija search_path): si la extensión se carga por primera vez dentro de una, al salir se pierde
    // la JWK de arranque y el siguiente auth.jwt_session_init falla con «Missing runtime parameter».
    await cliente.query("select auth.user_id()");
    await cliente.query("begin");
    await cliente.query("create extension pgtap");
    await cliente.query(
      "create temp table tokens (identidad text, sub text, rol text, jti int, jwt text)",
    );
    await cliente.query(
      "insert into pg_temp.tokens select * from unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::text[])",
      [columnas.identidad, columnas.sub, columnas.rol, columnas.jti, columnas.jwt],
    );
    await cliente.query(ayudas);
    const resultado = await cliente.query(readFileSync(join(DIRECTORIO, archivo), "utf8"));
    const bloques = Array.isArray(resultado) ? resultado : [resultado];
    for (const bloque of bloques) {
      for (const fila of bloque.rows ?? []) {
        const valor = Object.values(fila)[0];
        if (typeof valor !== "string" || !LINEA_TAP.test(valor)) continue;
        console.log(valor);
        if (/^(not )?ok \d+/.test(valor)) pruebas++;
        if (/^not ok/.test(valor) || /^# (Looks like you planned|No tests run)/.test(valor)) fallos++;
      }
    }
  } catch (e) {
    fallos++;
    console.log(`not ok - ERROR en ${archivo}: ${(e as Error).message}`);
  } finally {
    await cliente.query("rollback").catch(() => undefined);
    await cliente.end();
  }
}

console.log(`# pgTAP contra ${host} (${archivos.length} archivos)`);
for (const archivo of archivos) await ejecutar(archivo);

console.log(`\n# ${pruebas} pruebas, ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
