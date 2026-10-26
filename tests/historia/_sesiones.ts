// Una conexión de pruebas que cambia de identidad (médico, administrativo, paciente…) DENTRO de una misma transacción que al final
// se revierte. Es lo que hace pgTAP (tests.autenticar_como), pero para código de la aplicación (`node --test`): permite sembrar
// pacientes, atenciones y asignaciones como dueño y después ejecutar `lib/historia/*.ts` como cada rol, con la RLS real, sin
// dejar rastro. Imprescindible aquí: las atenciones firmadas, las historias y los accesos NO se pueden borrar por diseño, así que
// una prueba que confirmara sus datos dejaría basura permanente en la base de desarrollo.
// Mecanismo de identidad: igual que tests/concurrencia/_sesion.ts (par Ed25519 efímero, JWK pública como opción de arranque,
// token EdDSA por identidad con `jti` creciente). Se niega a correr contra producción o el pooler (urlDePruebas()).
import { generateKeyPairSync, sign } from "node:crypto";
import pg from "pg";
import type { Ejecutor, Fila } from "../../lib/db/ejecutor.ts";
import { urlDePruebas } from "../concurrencia/_conexion.ts";

export interface IdentidadDePrueba {
  sub: string;
  rol: "administrativo" | "medico" | "enfermera" | "paciente" | null;
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwkPublica = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: publicKey.export({ format: "jwk" }).x });
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function firmar({ sub, rol }: IdentidadDePrueba, jti: number): string {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64({ alg: "EdDSA", typ: "JWT" });
  const carga = b64({ sub, jti, nbf: ahora - 60, exp: ahora + 3600, publicMetadata: rol ? { rol } : {} });
  const firma = sign(null, Buffer.from(`${cabecera}.${carga}`), privateKey).toString("base64url");
  return `${cabecera}.${carga}.${firma}`;
}

export class SesionTransaccional {
  private jti = 0;
  private savepoints = 0;

  readonly cliente: pg.Client;

  private constructor(cliente: pg.Client) {
    this.cliente = cliente;
  }

  // Abre la conexión y la transacción envolvente. Quien la crea debe llamar a `revertirYCerrar()` siempre.
  static async abrir(): Promise<SesionTransaccional> {
    const cliente = new pg.Client({ connectionString: urlDePruebas(), options: `-c pg_session_jwt.jwk=${jwkPublica}` });
    await cliente.connect();
    const sesion = new SesionTransaccional(cliente);
    try {
      // Carga pg_session_jwt antes de cualquier función con cláusula SET (ver docs/07-testing/pruebas-sql.md, «Límites conocidos»).
      await cliente.query("select auth.user_id()");
      await cliente.query("begin");
    } catch (error) {
      await cliente.end().catch(() => undefined);
      throw error;
    }
    return sesion;
  }

  // Vuelve al rol dueño (BYPASSRLS) para sembrar o comprobar datos.
  async comoDueno<T = Fila>(texto: string, parametros: unknown[] = []): Promise<T[]> {
    await this.cliente.query("reset role");
    const { rows } = await this.cliente.query(texto, parametros);
    return rows as T[];
  }

  // Cambia a la identidad dada y al rol `authenticated`, igual que lib/db/cliente-autenticado.ts.
  async como(identidad: IdentidadDePrueba): Promise<void> {
    this.jti += 1;
    await this.cliente.query("reset role");
    await this.cliente.query("select auth.jwt_session_init($1)", [firmar(identidad, this.jti)]);
    await this.cliente.query("set local role authenticated");
  }

  // `Ejecutor` de la aplicación sobre esta sesión: las sentencias de cada llamada van en un savepoint (una transacción anidada):
  // si una falla se deshace TODA la llamada y la sesión sigue usable, igual que el rollback de la transacción real.
  ejecutor(): Ejecutor {
    return async (sentencias) => {
      const punto = `sp_${++this.savepoints}`;
      await this.cliente.query(`savepoint ${punto}`);
      try {
        const resultados: Fila[][] = [];
        for (const sentencia of sentencias) {
          const { rows } = await this.cliente.query(sentencia.texto, [...(sentencia.parametros ?? [])]);
          resultados.push(rows as Fila[]);
        }
        await this.cliente.query(`release savepoint ${punto}`);
        return resultados;
      } catch (error) {
        await this.cliente.query(`rollback to savepoint ${punto}`);
        throw error;
      }
    };
  }

  async revertirYCerrar(): Promise<void> {
    try {
      await this.cliente.query("rollback");
    } finally {
      await this.cliente.end().catch(() => undefined);
    }
  }
}
