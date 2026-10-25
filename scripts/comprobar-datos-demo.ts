// Comprueba el aislamiento por rol (RLS) sobre los datos de demostración sembrados por sembrar-datos-demo.ts
// (H2, tarea 9.5). Para cada persona abre una conexión DIRECTA con una JWK Ed25519 efímera, inicia sesión con un token
// firmado cuyo `sub` es el clerk_user_id real de esa persona y ejecuta las consultas como `authenticated`, igual que
// la aplicación. Sale con código 1 si algún conteo no es el esperado.
//
// Uso: node scripts/comprobar-datos-demo.ts       (mismo destino y variables de entorno que sembrar-datos-demo.ts)
import { generateKeyPairSync, sign } from "node:crypto";
import pg from "pg";

for (const archivo of [process.env.ENV_FILE, ".env.local"]) {
  if (!archivo) continue;
  try {
    process.loadEnvFile(archivo);
  } catch {
    // el archivo es opcional
  }
}
const url = process.env.DATABASE_URL_DEMO ?? process.env.DATABASE_URL_PRUEBAS ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_DEMO (o DATABASE_URL_PRUEBAS / DATABASE_URL).");
  process.exit(1);
}
if (new URL(url).host.includes("-pooler")) {
  console.error("La URL es del pooler: usa la conexión directa.");
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: publicKey.export({ format: "jwk" }).x });
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(sub: string, rol: string): string {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64({ alg: "EdDSA", typ: "JWT" });
  const carga = b64({ sub, jti: 1, nbf: ahora - 60, exp: ahora + 3600, publicMetadata: { rol } });
  return `${cabecera}.${carga}.${sign(null, Buffer.from(`${cabecera}.${carga}`), privateKey).toString("base64url")}`;
}

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const uno = async <T extends pg.QueryResultRow>(texto: string, params: unknown[] = []) => (await admin.query<T>(texto, params)).rows[0];

// Identidades reales de la siembra.
const sub = {
  medico0: (await uno<{ s: string }>("select p.clerk_user_id s from public.medicos m join public.perfiles p on p.id = m.perfil_id where m.cmp = 'CMP-DEMO-001'")).s,
  medico1: (await uno<{ s: string }>("select p.clerk_user_id s from public.medicos m join public.perfiles p on p.id = m.perfil_id where m.cmp = 'CMP-DEMO-002'")).s,
  paciente0: (await uno<{ s: string }>("select p.clerk_user_id s from public.pacientes x join public.perfiles p on p.id = x.perfil_id where x.numero_documento = '99000001'")).s,
  enfermera0: (await uno<{ s: string }>("select p.clerk_user_id s from public.enfermeras e join public.perfiles p on p.id = e.perfil_id order by e.id limit 1")).s,
  administrativo: (await uno<{ s: string }>("select clerk_user_id s from public.perfiles where rol = 'administrativo' order by creado_en limit 1")).s,
};
await admin.end();

type Consulta = [descripcion: string, sql: string, esperado: number];
let fallos = 0;

async function comoPersona(nombre: string, clerkUserId: string, rol: string, consultas: Consulta[]) {
  const c = new pg.Client({ connectionString: url, options: `-c pg_session_jwt.jwk=${jwk}` });
  await c.connect();
  try {
    await c.query("select auth.user_id()"); // carga la extensión antes de cualquier función con SET (docs/03-arquitectura/spike-rls-h2.md)
    await c.query("select auth.jwt_session_init($1)", [token(clerkUserId, rol)]);
    await c.query("begin");
    await c.query("set local role authenticated");
    console.log(`\n# ${nombre}`);
    for (const [descripcion, sql, esperado] of consultas) {
      const { rows } = await c.query(sql);
      const obtenido = Number(Object.values(rows[0])[0]);
      const ok = obtenido === esperado;
      if (!ok) fallos++;
      console.log(`${ok ? "ok    " : "FALLO "} ${descripcion}: ${obtenido}${ok ? "" : ` (esperado ${esperado})`}`);
    }
  } finally {
    await c.query("rollback").catch(() => undefined);
    await c.end();
  }
}

const DEMO_PAC = "numero_documento like '99%' or numero_documento like 'CEDEMO%'";
const pacId = (doc: string) => `(select id from public.pacientes where numero_documento = '${doc}')`;

// Pacientes con cita vigente o asignación vigente del médico 0 (CMP-DEMO-001): P1 (99000001), P5 (99000005), P10 (99000010).
await comoPersona("Médico 1 (CMP-DEMO-001, cuenta real de médico)", sub.medico0, "medico", [
  ["pacientes que ve (con cita o asignación vigente)", `select count(*) from public.pacientes where ${DEMO_PAC}`, 3],
  ["atenciones de SUS pacientes", `select count(*) from public.atenciones`, 2],
  ["atenciones del paciente del OTRO médico (99000002)", `select count(*) from public.atenciones where paciente_id = ${pacId("99000002")}`, 0],
  ["historias clínicas que ve", `select count(*) from public.historias_clinicas`, 2],
  ["antecedentes que ve", `select count(*) from public.antecedentes`, 2],
  ["citas de su agenda", `select count(*) from public.citas where medico_id = (select id from public.medicos where cmp = 'CMP-DEMO-001')`, 4],
  ["citas de otros médicos", `select count(*) from public.citas where medico_id <> (select id from public.medicos where cmp = 'CMP-DEMO-001')`, 0],
]);

await comoPersona("Médico 2 (CMP-DEMO-002, mock)", sub.medico1, "medico", [
  ["pacientes que ve", `select count(*) from public.pacientes where ${DEMO_PAC}`, 3],
  ["atenciones de SUS pacientes", `select count(*) from public.atenciones`, 2],
  ["atenciones del paciente del OTRO médico (99000001)", `select count(*) from public.atenciones where paciente_id = ${pacId("99000001")}`, 0],
]);

await comoPersona("Paciente (99000001, cuenta real de paciente)", sub.paciente0, "paciente", [
  ["su propio registro de paciente", `select count(*) from public.pacientes where ${DEMO_PAC}`, 1],
  ["sus citas", `select count(*) from public.citas`, 2],
  ["atenciones (nunca, ni las suyas)", `select count(*) from public.atenciones`, 0],
  ["historias clínicas (nunca, ni la suya)", `select count(*) from public.historias_clinicas`, 0],
  ["antecedentes (nunca)", `select count(*) from public.antecedentes`, 0],
]);

await comoPersona("Administrativo (cuenta real de administrativo)", sub.administrativo, "administrativo", [
  ["pacientes", `select count(*) from public.pacientes where ${DEMO_PAC}`, 12],
  ["citas de demostración", `select count(*) from public.citas c join public.pacientes p on p.id = c.paciente_id where p.email like '%@demo.invalid'`, 14],
  ["atenciones (nunca)", `select count(*) from public.atenciones`, 0],
  ["addendas (nunca)", `select count(*) from public.addendas`, 0],
  ["historias clínicas (nunca)", `select count(*) from public.historias_clinicas`, 0],
  ["antecedentes (nunca)", `select count(*) from public.antecedentes`, 0],
  ["la auditoría no contiene contenido clínico", `select count(*) from public.auditoria where tabla in ('atenciones', 'addendas', 'antecedentes') and (datos_antes is not null or datos_despues is not null)`, 0],
]);

await comoPersona("Enfermera (cuenta real de enfermera)", sub.enfermera0, "enfermera", [
  ["sus turnos", `select count(*) from public.turnos_enfermeria`, 7],
  ["pacientes (nunca)", `select count(*) from public.pacientes where ${DEMO_PAC}`, 0],
  ["citas (nunca)", `select count(*) from public.citas`, 0],
  ["atenciones (nunca)", `select count(*) from public.atenciones`, 0],
]);

console.log(`\n# ${fallos === 0 ? "Aislamiento correcto con los datos de demostración" : `${fallos} comprobaciones fallaron`}`);
process.exit(fallos === 0 ? 0 : 1);
