// Adaptador de una sesión autenticada de pruebas (tests/concurrencia/_sesion.ts) al `Ejecutor` de lib/db/ejecutor.ts: el
// código de `lib/citas/*.ts` corre aquí tal cual, con la identidad y la RLS del rol de la sesión, igual que en producción
// (`ejecutorAutenticado`). Las sentencias de una llamada van en una transacción y, si una falla, se revierte todo.
import type pg from "pg";
import type { Ejecutor, Fila } from "../../lib/db/ejecutor.ts";

export function ejecutorDeSesion(cliente: pg.Client): Ejecutor {
  return async (sentencias) => {
    await cliente.query("begin");
    try {
      const resultados: Fila[][] = [];
      for (const sentencia of sentencias) {
        const { rows } = await cliente.query(sentencia.texto, [...(sentencia.parametros ?? [])]);
        resultados.push(rows as Fila[]);
      }
      await cliente.query("commit");
      return resultados;
    } catch (error) {
      await cliente.query("rollback").catch(() => undefined);
      throw error;
    }
  };
}
