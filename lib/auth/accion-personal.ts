// Guarda de las Server Actions del personal (openspec/changes/agenda-y-reserva/design.md, D7).
//
// Una Server Action es un `POST` que se puede invocar sin pasar por la página, así que la comprobación de la página
// (`auth.protect()` + `exigirRol()` + redirección a `/configurar-mfa`) no basta. `exigirPersonal` comprueba sesión, rol y
// MFA y DEVUELVE un `ResultadoAccion` de fallo en lugar de redirigir (como hace `exigirRol`): la acción lo devuelve tal cual
// y no ejecuta ninguna consulta. Es una comprobación de usabilidad y de defensa en profundidad: la autoridad real sobre los
// datos sigue siendo la RLS de la base de datos y las guardas de rol de sus funciones.
//
// Orden: sesión → rol → MFA. El MFA solo se consulta (una llamada a Clerk) cuando la sesión y el rol ya son los correctos.
import type { Rol } from "./rol.ts";
import {
  exito,
  fallo,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_AUTORIZADO,
  type ResultadoAccion,
} from "../acciones/resultado.ts";

export type RolPersonal = "administrativo" | "medico";

export interface SesionPersonal {
  usuarioId: string;
  rol: RolPersonal;
}

export const MENSAJE_SESION_REQUERIDA = "Debe iniciar sesión para realizar esta operación";
export const MENSAJE_MFA_REQUERIDO =
  "Configure el segundo factor de autenticación (MFA) para realizar esta operación";

// Lo que la guarda necesita del entorno. En producción lo da Clerk; las pruebas inyectan el suyo.
export interface DependenciasPersonal {
  // Identificador de usuario de la sesión actual (`null` si no hay sesión) y el rol de su claim.
  obtenerSesion: () => Promise<{ usuarioId: string | null; rol: Rol | null }>;
  tieneMfa: () => Promise<boolean>;
  // Se llama con la clase del error si una dependencia lanza (nunca con su texto).
  registrar?: (clase: string) => void;
}

// Clerk se importa al usarse y no al cargar el módulo: así las pruebas con dependencias inyectadas no necesitan cargar el
// SDK del servidor de Clerk.
const dependenciasClerk: DependenciasPersonal = {
  async obtenerSesion() {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, sessionClaims } = await auth();
    return { usuarioId: userId, rol: sessionClaims?.publicMetadata?.rol ?? null };
  },
  async tieneMfa() {
    const { tieneMfaActivo } = await import("./mfa.ts");
    return tieneMfaActivo();
  },
};

function registrarPorDefecto(clase: string): void {
  console.error(`[exigirPersonal] no se pudo comprobar la sesión (clase=${clase})`);
}

// Uso en una acción:
//   const guarda = await exigirPersonal("administrativo");
//   if (!guarda.ok) return guarda;
export async function exigirPersonal(
  rolRequerido: RolPersonal,
  dependencias: DependenciasPersonal = dependenciasClerk,
): Promise<ResultadoAccion<SesionPersonal>> {
  try {
    const { usuarioId, rol } = await dependencias.obtenerSesion();

    if (!usuarioId) return fallo("NO_AUTORIZADO", MENSAJE_SESION_REQUERIDA);
    if (rol !== rolRequerido) return fallo("NO_AUTORIZADO", MENSAJE_NO_AUTORIZADO);
    if (!(await dependencias.tieneMfa())) return fallo("NO_AUTORIZADO", MENSAJE_MFA_REQUERIDO);

    return exito({ usuarioId, rol: rolRequerido });
  } catch (error) {
    // Un fallo de Clerk no debe escapar de la acción ni dejarla pasar: se rechaza con el mensaje genérico.
    (dependencias.registrar ?? registrarPorDefecto)(error instanceof Error ? error.name : typeof error);
    return fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO);
  }
}
