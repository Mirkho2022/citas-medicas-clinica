// Casos de uso de las acciones de citas (design.md, D7): guarda de rol y MFA → lógica de datos → evento tras el commit →
// refresco de pantallas. Las Server Actions (`app/**/acciones.ts`) solo construyen el `Entorno` real y llaman aquí; así la
// composición completa se prueba con un entorno inyectado, sin Clerk, sin Next y sin red (tests/agenda/casos-de-uso.test.ts).
import type { ResultadoAccion } from "../acciones/resultado.ts";
import type { RolPersonal, SesionPersonal } from "../auth/accion-personal.ts";
import type { Ejecutor } from "../db/ejecutor.ts";
import { confirmarCita, marcarAtendida, marcarNoAsistio } from "./transiciones.ts";

export interface Entorno {
  // `exigirPersonal`: sesión, claim de rol y MFA; devuelve un fallo en vez de redirigir.
  guarda: (rol: RolPersonal) => Promise<ResultadoAccion<SesionPersonal>>;
  ejecutar: Ejecutor;
  // `revalidatePath` de cada ruta (solo se llama cuando la operación salió bien).
  refrescar: (rutas: readonly string[]) => void;
}

export const RUTAS_AGENDA = ["/administrativo/agenda"] as const;
// La jornada del médico la construye H7; revalidar su ruta hoy no tiene efecto visible, pero deja la acción lista.
export const RUTAS_JORNADA_MEDICO = ["/medico"] as const;

// Guarda → operación → refresco. Una guarda fallida se devuelve tal cual y no ejecuta ninguna consulta.
async function conGuarda<T>(
  entorno: Entorno,
  rol: RolPersonal,
  rutas: readonly string[],
  operacion: () => Promise<ResultadoAccion<T>>,
): Promise<ResultadoAccion<T>> {
  const guarda = await entorno.guarda(rol);
  if (!guarda.ok) return guarda;
  const resultado = await operacion();
  if (resultado.ok) entorno.refrescar(rutas);
  return resultado;
}

export function casoConfirmarCita(entorno: Entorno, entrada: unknown) {
  return conGuarda(entorno, "administrativo", RUTAS_AGENDA, () => confirmarCita(entorno.ejecutar, entrada));
}

export function casoMarcarNoAsistio(entorno: Entorno, entrada: unknown) {
  return conGuarda(entorno, "administrativo", RUTAS_AGENDA, () => marcarNoAsistio(entorno.ejecutar, entrada));
}

export function casoMarcarAtendida(entorno: Entorno, entrada: unknown) {
  return conGuarda(entorno, "medico", RUTAS_JORNADA_MEDICO, () => marcarAtendida(entorno.ejecutar, entrada));
}
