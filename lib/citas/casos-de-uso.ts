// Casos de uso de las acciones de citas (design.md, D7): guarda de rol y MFA → lógica de datos → evento tras el commit →
// refresco de pantallas. Las Server Actions (`app/**/acciones.ts`) solo construyen el `Entorno` real y llaman aquí; así la
// composición completa se prueba con un entorno inyectado, sin Clerk, sin Next y sin red (tests/agenda/casos-de-uso.test.ts).
import type { ResultadoAccion } from "../acciones/resultado.ts";
import type { RolPersonal, SesionPersonal } from "../auth/accion-personal.ts";
import type { Ejecutor } from "../db/ejecutor.ts";
import type { EventoCita } from "../notificaciones/eventos-cita.ts";
import { cancelarCita, reasignarPorBaja, reprogramarCita, reservarCita } from "./reservas.ts";
import { confirmarCita, marcarAtendida, marcarNoAsistio } from "./transiciones.ts";

export interface Entorno {
  // `exigirPersonal`: sesión, claim de rol y MFA; devuelve un fallo en vez de redirigir.
  guarda: (rol: RolPersonal) => Promise<ResultadoAccion<SesionPersonal>>;
  ejecutar: Ejecutor;
  // `revalidatePath` de cada ruta (solo se llama cuando la operación salió bien).
  refrescar: (rutas: readonly string[]) => void;
  // `emitirTrasCommit`: avisa a las notificaciones DESPUÉS de confirmar en la base de datos y nunca lanza (ADR-0017).
  emitir: (evento: EventoCita) => Promise<void> | void;
}

export const RUTAS_AGENDA = ["/administrativo/agenda"] as const;
export const RUTAS_BAJAS = ["/administrativo/agenda", "/administrativo/bajas"] as const;
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

// Emite el evento y, pase lo que pase, no cambia el resultado de la acción: el `Entorno` real ya no lanza, pero un entorno de
// prueba o un cambio futuro no pueden convertir un fallo del notificador en un fallo de una operación ya confirmada.
async function emitirSinFallar(entorno: Entorno, evento: EventoCita): Promise<void> {
  try {
    await entorno.emitir(evento);
  } catch {
    // Un fallo del notificador nunca cambia el resultado (ADR-0017).
  }
}

// Agendar: `cita_reservada` tras el commit.
export function casoReservarCita(entorno: Entorno, entrada: unknown) {
  return conGuarda(entorno, "administrativo", RUTAS_AGENDA, async () => {
    const r = await reservarCita(entorno.ejecutar, entrada);
    if (r.ok) await emitirSinFallar(entorno, { tipo: "cita_reservada", citaId: r.datos.id });
    return r;
  });
}

// Cancelar: `cita_cancelada` tras el commit.
export function casoCancelarCita(entorno: Entorno, entrada: unknown) {
  return conGuarda(entorno, "administrativo", RUTAS_AGENDA, async () => {
    const r = await cancelarCita(entorno.ejecutar, entrada);
    if (r.ok) await emitirSinFallar(entorno, { tipo: "cita_cancelada", citaId: r.datos.id });
    return r;
  });
}

// Reprogramar: UN solo `cita_reprogramada` (cita nueva y original), no una cancelación más una reserva.
export function casoReprogramarCita(entorno: Entorno, entrada: unknown) {
  return conGuarda(entorno, "administrativo", RUTAS_AGENDA, async () => {
    const r = await reprogramarCita(entorno.ejecutar, entrada);
    if (r.ok) {
      await emitirSinFallar(entorno, {
        tipo: "cita_reprogramada",
        citaId: r.datos.id,
        citaAnteriorId: r.datos.citaAnteriorId,
        motivo: "reprogramacion",
      });
    }
    return r;
  });
}

// Reasignar por baja: un `cita_reprogramada` con motivo `baja_medica` por cada fila que se hizo.
export function casoReasignarPorBaja(entorno: Entorno, entrada: unknown) {
  return conGuarda(entorno, "administrativo", RUTAS_BAJAS, async () => {
    const r = await reasignarPorBaja(entorno.ejecutar, entrada);
    if (r.ok) {
      for (const fila of r.datos.filas) {
        if (fila.ok) {
          await emitirSinFallar(entorno, {
            tipo: "cita_reprogramada",
            citaId: fila.id,
            citaAnteriorId: fila.citaId,
            motivo: "baja_medica",
          });
        }
      }
    }
    return r;
  });
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
