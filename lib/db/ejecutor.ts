// Contrato mínimo para ejecutar SQL como el usuario de la sesión (openspec/changes/agenda-y-reserva/design.md, D7).
//
// Las funciones de `lib/citas/*.ts` reciben un `Ejecutor` en vez de importar el cliente de Neon: en producción es
// `ejecutorAutenticado` (HTTP con el token de Clerk, `lib/db/ejecutor-autenticado.ts`) y en las pruebas es una sesión
// directa a un branch de desarrollo con la identidad firmada de un rol (tests/concurrencia/_sesion.ts). Así la misma
// lógica se prueba sin Clerk y sin red, y contra la base de datos real con la RLS del rol que llama.
//
// Las sentencias de una llamada se ejecutan en UNA transacción, en orden; los resultados vuelven en el mismo orden.

export interface Sentencia {
  texto: string;
  parametros?: readonly unknown[];
}

export type Fila = Record<string, unknown>;

export type Ejecutor = (sentencias: readonly Sentencia[]) => Promise<Fila[][]>;

// Atajo para una sola sentencia que devuelve sus filas.
export async function consultar(
  ejecutar: Ejecutor,
  texto: string,
  parametros: readonly unknown[] = [],
): Promise<Fila[]> {
  const [filas] = await ejecutar([{ texto, parametros }]);
  return filas ?? [];
}
