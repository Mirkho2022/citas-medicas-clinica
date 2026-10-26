// Casos de uso de las acciones de turnos de enfermería (design.md, D6): guarda de rol y MFA → operación → refresco de pantallas.
// Las Server Actions (`app/administrativo/turnos/acciones.ts`) solo construyen el entorno real y llaman aquí; así la composición
// completa se prueba con un entorno inyectado, sin Clerk, sin Next y sin red (tests/turnos-dashboard/casos-de-uso.test.ts).
//
// El entorno es un subconjunto del `Entorno` de `lib/citas/casos-de-uso.ts` (la guarda, el ejecutor y el refresco; los turnos no
// emiten eventos de notificación), de modo que el `entornoReal` de las citas sirve tal cual.
import type { ResultadoAccion } from "../acciones/resultado.ts";
import type { RolPersonal, SesionPersonal } from "../auth/accion-personal.ts";
import type { Ejecutor } from "../db/ejecutor.ts";
import { actualizarTurno, asignarTurno, quitarTurno } from "./operaciones.ts";

export interface EntornoTurnos {
  // `exigirPersonal`: sesión, claim de rol y MFA; devuelve un fallo en vez de redirigir.
  guarda: (rol: RolPersonal) => Promise<ResultadoAccion<SesionPersonal>>;
  ejecutar: Ejecutor;
  // `revalidatePath` de cada ruta (solo se llama cuando la operación salió bien).
  refrescar: (rutas: readonly string[]) => void;
}

// Un cambio de turnos se ve en la semana del administrativo y en la pantalla de la enfermera.
export const RUTAS_TURNOS = ["/administrativo/turnos", "/enfermera"] as const;

// Guarda → operación → refresco. Una guarda fallida se devuelve tal cual y no ejecuta ninguna consulta.
async function conGuarda<T>(entorno: EntornoTurnos, operacion: () => Promise<ResultadoAccion<T>>): Promise<ResultadoAccion<T>> {
  const guarda = await entorno.guarda("administrativo");
  if (!guarda.ok) return guarda;
  const resultado = await operacion();
  if (resultado.ok) entorno.refrescar(RUTAS_TURNOS);
  return resultado;
}

export function casoAsignarTurno(entorno: EntornoTurnos, entrada: unknown) {
  return conGuarda(entorno, () => asignarTurno(entorno.ejecutar, entrada));
}

export function casoActualizarTurno(entorno: EntornoTurnos, entrada: unknown) {
  return conGuarda(entorno, () => actualizarTurno(entorno.ejecutar, entrada));
}

export function casoQuitarTurno(entorno: EntornoTurnos, entrada: unknown) {
  return conGuarda(entorno, () => quitarTurno(entorno.ejecutar, entrada));
}
