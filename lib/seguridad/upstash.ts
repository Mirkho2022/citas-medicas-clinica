// Almacén real del límite de peticiones: Upstash Redis con ventana deslizante (ADR-0026). Se importa solo desde `limitador-real.ts`.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Decision, Limitador, Regla } from "./limites.ts";

// `null` si faltan las variables: entonces el portal corre sin límite de peticiones (y lo dice una vez en el registro del servidor).
export function limitadorUpstash(entorno: Record<string, string | undefined> = process.env): Limitador | null {
  const url = entorno.UPSTASH_REDIS_REST_URL;
  const token = entorno.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  const porRegla = new Map<string, Ratelimit>();
  return {
    async limitar(regla: Regla, clave: string): Promise<Decision> {
      let limitador = porRegla.get(regla.nombre);
      if (!limitador) {
        limitador = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(regla.maximo, `${regla.ventanaSegundos} s`),
          prefix: `portal:${regla.nombre}`,
          analytics: false,
        });
        porRegla.set(regla.nombre, limitador);
      }
      const r = await limitador.limit(clave);
      return r.success
        ? { permitido: true, reintentarEnSegundos: 0 }
        : { permitido: false, reintentarEnSegundos: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
    },
  };
}
