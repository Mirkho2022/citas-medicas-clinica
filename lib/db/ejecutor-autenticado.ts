// `Ejecutor` de producción: cada llamada abre una sesión HTTP de Neon con el token de Clerk del usuario actual y ejecuta
// sus sentencias en una transacción como `authenticated` (lib/db/cliente-autenticado.ts). Solo lo importan las Server
// Actions y los Server Components; `lib/citas/*.ts` recibe el ejecutor por parámetro para poder probarse sin Clerk.
import { transaccionAutenticada } from "./cliente-autenticado.ts";
import type { Ejecutor, Fila } from "./ejecutor.ts";

export const ejecutorAutenticado: Ejecutor = async (sentencias) => {
  const resultados = await transaccionAutenticada((tx) =>
    sentencias.map((sentencia) => tx.query(sentencia.texto, [...(sentencia.parametros ?? [])])),
  );
  return resultados as Fila[][];
};
