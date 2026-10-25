// El limitador que usa la aplicación: Upstash si está configurado y, si no, ninguno (todo permitido). Siempre con fallo abierto.
import { conFalloAbierto, PERMITIDO, type Limitador } from "./limites.ts";
import { limitadorUpstash } from "./upstash.ts";

let instancia: Limitador | undefined;

function registrar(clase: string): void {
  console.error(`[limites] el almacén de contadores no respondió; se deja pasar (clase=${clase})`);
}

export function limitadorReal(): Limitador {
  if (instancia) return instancia;
  const upstash = limitadorUpstash();
  if (!upstash) {
    console.warn("[limites] faltan las variables de Upstash (UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN): el portal corre sin límite de peticiones");
    instancia = { limitar: async () => PERMITIDO };
  } else {
    instancia = conFalloAbierto(upstash, registrar);
  }
  return instancia;
}
