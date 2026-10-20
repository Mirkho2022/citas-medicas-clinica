// Sesiones autenticadas para las pruebas de concurrencia (node --test): llamar a las funciones de la aplicación
// (reservar_cita, reprogramar_cita…) COMO `authenticated`, con la identidad y el rol de un usuario, igual que hace
// lib/db/cliente-autenticado.ts. Es el mismo mecanismo de scripts/ejecutar-pgtap.ts (validado en docs/spike-rls-h2.md):
//  - un par Ed25519 efímero por proceso; la JWK pública va en la opción de arranque pg_session_jwt.jwk de la conexión
//    (el pooler la rechaza: la URL debe ser directa);
//  - un token EdDSA firmado por sesión, con `sub`, `publicMetadata.rol` y `jti` creciente;
//  - auth.jwt_session_init(token) y `set role authenticated`.
// A diferencia de pgTAP, aquí cada sesión confirma de verdad (no hay transacción envolvente), así que dos sesiones
// compiten por los mismos datos. Se niega a correr si el destino es producción o el pooler (urlDePruebas()).
import { generateKeyPairSync, sign } from "node:crypto";
import pg from "pg";
import { urlDePruebas } from "./_conexion.ts";

export interface Identidad {
  /** `sub` del token = clerk_user_id del perfil que debe existir en la base. */
  sub: string;
  rol: "administrativo" | "medico" | "enfermera" | "paciente" | null;
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwkPublica = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: publicKey.export({ format: "jwk" }).x });

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function firmar({ sub, rol }: Identidad, jti: number): string {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64({ alg: "EdDSA", typ: "JWT" });
  const carga = b64({ sub, jti, nbf: ahora - 60, exp: ahora + 3600, publicMetadata: rol ? { rol } : {} });
  const firma = sign(null, Buffer.from(`${cabecera}.${carga}`), privateKey).toString("base64url");
  return `${cabecera}.${carga}.${firma}`;
}

/** Abre una conexión directa ya autenticada y con el rol `authenticated`. Quien llama la cierra con `end()`. */
export async function abrirSesion(identidad: Identidad): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: urlDePruebas(), options: `-c pg_session_jwt.jwk=${jwkPublica}` });
  await cliente.connect();
  try {
    // Carga pg_session_jwt antes de cualquier función con cláusula SET (ver docs/pruebas-sql.md, «Límites conocidos»).
    await cliente.query("select auth.user_id()");
    await cliente.query("select auth.jwt_session_init($1)", [firmar(identidad, 1)]);
    await cliente.query("set role authenticated");
  } catch (e) {
    await cliente.end().catch(() => undefined);
    throw e;
  }
  return cliente;
}

/** Abre una sesión por identidad, ejecuta `fn` y las cierra siempre. */
export async function conSesiones<T>(
  identidades: Identidad[],
  fn: (sesiones: pg.Client[]) => Promise<T>,
): Promise<T> {
  const sesiones: pg.Client[] = [];
  try {
    for (const identidad of identidades) sesiones.push(await abrirSesion(identidad));
    return await fn(sesiones);
  } finally {
    await Promise.all(sesiones.map((s) => s.end().catch(() => undefined)));
  }
}
