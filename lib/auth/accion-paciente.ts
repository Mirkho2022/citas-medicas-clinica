// Guardas del paciente en el portal (openspec/changes/portal-del-paciente/design.md, D5): espejo de `accion-personal.ts`, que es solo
// del personal con MFA.
//
//  - `exigirPaciente()` es la guarda de las Server Actions. Una Server Action es un `POST` que se puede invocar sin pasar por la
//    página, así que la comprobación de la página no basta: esta DEVUELVE un `ResultadoAccion` de fallo en lugar de redirigir.
//  - `exigirPacienteRegistrado()` es la guarda de las páginas: lleva al paciente sin ficha a «Complete su registro» y a quien tiene
//    otro rol a su propia área.
//
// Ninguna recibe un identificador de paciente, de perfil ni de rol: la identidad sale de la sesión (y, dentro de la base de datos,
// de `paciente_actual()`). Es una comprobación de usabilidad y de defensa en profundidad; la autoridad real sobre los datos sigue
// siendo la RLS de la base de datos.
import { RUTA_COMPLETAR_REGISTRO, rutaParaRol, type Rol } from "./rutas.ts";
import {
  exito,
  fallo,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_AUTORIZADO,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import { MENSAJE_ANTIBOTS, MENSAJE_SESION_VENCIDA } from "../portal/mensajes.ts";
import {
  dependenciasControlesReales,
  superaElLimite,
  type DependenciasControles,
} from "../seguridad/controles.ts";
import { MENSAJE_DEMASIADOS_INTENTOS, type Regla } from "../seguridad/limites.ts";

export interface SesionPaciente {
  usuarioId: string;
}

// Lo que las guardas necesitan del entorno. En producción lo dan Clerk y la base de datos; las pruebas inyectan el suyo.
export interface DependenciasAccionPaciente {
  // Identificador de usuario de la sesión actual (`null` si no hay sesión) y el rol de su claim.
  obtenerSesion: () => Promise<{ usuarioId: string | null; rol: Rol | null }>;
  // Se llama con la clase del error si una dependencia lanza (nunca con su texto).
  registrar?: (clase: string) => void;
}

export interface DependenciasPaginaPaciente {
  obtenerRol: () => Promise<Rol | null>;
  // `public.paciente_actual()`: el id de la ficha vinculada a la sesión, o `null` si aún no tiene.
  obtenerPacienteActual: () => Promise<string | null>;
  redirigir: (ruta: string) => Promise<never>;
}

// Clerk, la base de datos y Next se importan al usarse y no al cargar el módulo: así las pruebas con dependencias inyectadas no
// necesitan cargar el SDK del servidor de Clerk ni el de Neon.
const dependenciasAccion: DependenciasAccionPaciente = {
  async obtenerSesion() {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, sessionClaims } = await auth();
    return { usuarioId: userId, rol: sessionClaims?.publicMetadata?.rol ?? null };
  },
};

const dependenciasPagina: DependenciasPaginaPaciente = {
  async obtenerRol() {
    const { auth } = await import("@clerk/nextjs/server");
    const { sessionClaims } = await auth();
    return sessionClaims?.publicMetadata?.rol ?? null;
  },
  async obtenerPacienteActual() {
    const { transaccionAutenticada } = await import("../db/cliente-autenticado.ts");
    const [filas] = await transaccionAutenticada((tx) => [tx`select public.paciente_actual() as id`]);
    return (filas?.[0]?.id as string | null | undefined) ?? null;
  },
  async redirigir(ruta) {
    const { redirect } = await import("next/navigation");
    return redirect(ruta);
  },
};

function registrarPorDefecto(clase: string): void {
  console.error(`[exigirPaciente] no se pudo comprobar la sesión (clase=${clase})`);
}

// Uso en una acción:
//   const guarda = await exigirPaciente();
//   if (!guarda.ok) return guarda;
export async function exigirPaciente(
  dependencias: DependenciasAccionPaciente = dependenciasAccion,
): Promise<ResultadoAccion<SesionPaciente>> {
  try {
    const { usuarioId, rol } = await dependencias.obtenerSesion();

    if (!usuarioId) return fallo("SESION_VENCIDA", MENSAJE_SESION_VENCIDA);
    if (rol !== "paciente") return fallo("NO_AUTORIZADO", MENSAJE_NO_AUTORIZADO);

    return exito({ usuarioId });
  } catch (error) {
    // Un fallo de Clerk no debe escapar de la acción ni dejarla pasar: se rechaza con el mensaje genérico.
    (dependencias.registrar ?? registrarPorDefecto)(error instanceof Error ? error.name : typeof error);
    return fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO);
  }
}

// Controles de borde de una acción del portal (design.md, D9; specs/proteccion-del-portal-publico). Orden fijo: SESIÓN → LÍMITE → ANTI-BOTS;
// después, en la acción, validación y base de datos. Un rechazo por límite o por bot no toca la base de datos. El límite cuenta la petición por
// usuario y por IP; el anti-bots se aplica solo donde el ADR-0026 lo fija (registro y reserva), no a la búsqueda ni a la cancelación.
export interface ControlesAccion {
  regla: Regla;
  antibots?: boolean;
}

export async function exigirPacienteControlado(
  controles: ControlesAccion,
  dependencias?: DependenciasAccionPaciente,
  dependenciasControles: DependenciasControles = dependenciasControlesReales,
): Promise<ResultadoAccion<SesionPaciente>> {
  const guarda = await exigirPaciente(dependencias);
  if (!guarda.ok) return guarda;

  try {
    if (await superaElLimite(controles.regla, guarda.datos.usuarioId, dependenciasControles)) {
      return fallo("DEMASIADOS_INTENTOS", MENSAJE_DEMASIADOS_INTENTOS);
    }
    if (controles.antibots && (await dependenciasControles.esBot())) {
      return fallo("NO_AUTORIZADO", MENSAJE_ANTIBOTS);
    }
  } catch (error) {
    // Un fallo al leer la IP o al armar los controles no debe tumbar la acción: las barreras reales están en la base de datos.
    (dependencias?.registrar ?? registrarPorDefecto)(error instanceof Error ? error.name : typeof error);
  }
  return guarda;
}

// Uso al inicio de una página del portal (después de `await auth.protect()`, que la regla de ESLint de Clerk exige en el cuerpo de
// cada página): devuelve la ficha del paciente o redirige. Sin rol todavía (la cuenta se está preparando) y sin ficha van a
// «Complete su registro», que sabe esperar; un rol distinto va a su propia área.
export async function exigirPacienteRegistrado(
  dependencias: DependenciasPaginaPaciente = dependenciasPagina,
): Promise<{ pacienteId: string }> {
  const rol = await dependencias.obtenerRol();
  if (rol !== null && rol !== "paciente") return dependencias.redirigir(rutaParaRol(rol));
  if (rol === null) return dependencias.redirigir(RUTA_COMPLETAR_REGISTRO);

  const pacienteId = await dependencias.obtenerPacienteActual();
  if (!pacienteId) return dependencias.redirigir(RUTA_COMPLETAR_REGISTRO);
  return { pacienteId };
}
