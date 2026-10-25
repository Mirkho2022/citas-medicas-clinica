// Controles de borde de las acciones y pantallas del portal (design.md, D9): el límite por usuario y por IP y la verificación anti-bots, con
// el entorno inyectable para probarlos sin Redis, sin BotID y sin Next.
import { MENSAJE_ANTIBOTS } from "../portal/mensajes.ts";
import { esSolicitudAutomatizada } from "./antibots.ts";
import {
  esEntornoVercel,
  ipDelCliente,
  MENSAJE_DEMASIADOS_INTENTOS,
  type Limitador,
  type Regla,
} from "./limites.ts";

export interface DependenciasControles {
  limitador: Limitador;
  // Dirección del cliente para la clave del contador (ver `ipDelCliente`).
  ip: () => Promise<string>;
  // `true` si la solicitud se clasifica como automatizada.
  esBot: () => Promise<boolean>;
}

// Clerk, Next, BotID y Upstash se importan al usarse y no al cargar el módulo: las pruebas con dependencias inyectadas no los cargan.
export const dependenciasControlesReales: DependenciasControles = {
  get limitador(): Limitador {
    return {
      async limitar(regla, clave) {
        const { limitadorReal } = await import("./limitador-real.ts");
        return limitadorReal().limitar(regla, clave);
      },
    };
  },
  async ip() {
    const { headers } = await import("next/headers");
    return ipDelCliente(await headers(), esEntornoVercel());
  },
  esBot: () => esSolicitudAutomatizada(),
};

// Cuenta la petición contra el usuario Y contra su IP, con la misma regla; basta que una de las dos se pase para rechazar. El límite se
// calcula antes de tocar la base de datos.
export async function superaElLimite(
  regla: Regla,
  usuarioId: string,
  dependencias: DependenciasControles = dependenciasControlesReales,
): Promise<boolean> {
  const ip = await dependencias.ip();
  const [porUsuario, porIp] = await Promise.all([
    dependencias.limitador.limitar(regla, `u:${usuarioId}`),
    dependencias.limitador.limitar(regla, `ip:${ip}`),
  ]);
  return !porUsuario.permitido || !porIp.permitido;
}

export { MENSAJE_ANTIBOTS, MENSAJE_DEMASIADOS_INTENTOS };
