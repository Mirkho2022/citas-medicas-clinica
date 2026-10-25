// Cliente de base de datos con la identidad del usuario (ADR-0023; docs/03-arquitectura/spike-rls-h2.md; design.md, D9).
//
// Este módulo es una CONVENIENCIA, no el límite de seguridad: Neon valida el JWT de Clerk contra la JWKS y las
// políticas RLS deciden dentro de Postgres. Lo que sí impone, por cómo funciona Neon:
//  - Se conecta como `authenticator` (rol de login sin privilegios sobre ninguna tabla) y cada petición ejecuta
//    `set local role authenticated` como PRIMERA sentencia de una transacción. Si algo olvidara ese paso, la
//    consulta falla cerrada (permission denied) en vez de abrirse (ver tests/pgtap/60_roles_de_conexion).
//  - Solo HTTP: `neon(url, { authToken })` abre una sesión por petición. Está prohibido usar Pool o Client (WebSocket)
//    para consultas autenticadas: una conexión reutilizada podría conservar la identidad de otro usuario.
//  - DATABASE_AUTHENTICATED_URL es la URL DIRECTA (no pooled) del rol `authenticator`. Es un secreto del servidor:
//    nunca con prefijo NEXT_PUBLIC_.
import { auth } from "@clerk/nextjs/server";
import {
  neon,
  type NeonQueryFunctionInTransaction,
  type NeonQueryInTransaction,
} from "@neondatabase/serverless";

export class SesionRequerida extends Error {
  constructor() {
    super("Se requiere una sesión autenticada para consultar la base de datos");
    this.name = "SesionRequerida";
  }
}

export type ConsultasEnTransaccion = (
  tx: NeonQueryFunctionInTransaction<false, false>,
) => NeonQueryInTransaction[];

// Ejecuta las consultas como el usuario dueño del token, en una sola transacción. No depende de Clerk: recibe el
// token ya obtenido, así que se puede probar y reutilizar. Devuelve los resultados de `consultas`, en su orden.
export async function ejecutarComoUsuario(
  urlConexion: string,
  authToken: string,
  consultas: ConsultasEnTransaccion,
) {
  const sql = neon(urlConexion, { authToken });
  const resultados = await sql.transaction((tx) => [
    tx`set local role authenticated`,
    ...consultas(tx),
  ]);
  return resultados.slice(1);
}

// Ejecuta las consultas como el usuario de la sesión de Clerk actual (Server Components, Server Actions y Route
// Handlers). Lanza SesionRequerida si no hay sesión.
export async function transaccionAutenticada(consultas: ConsultasEnTransaccion) {
  const url = process.env.DATABASE_AUTHENTICATED_URL;
  if (!url) {
    throw new Error("Falta DATABASE_AUTHENTICATED_URL (ver .env.example)");
  }
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new SesionRequerida();
  return ejecutarComoUsuario(url, token, consultas);
}
