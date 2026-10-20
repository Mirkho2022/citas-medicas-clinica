// Ciclo de estados de la cita: confirmar, «No asistió» y «Atendida» (specs/gestion-de-citas; design.md, D13).
//
// La REGLA vive en la base de datos: el disparador `validar_transicion_estado()` valida cada transición según el rol (solo el
// administrativo confirma y marca «No asistió»; «Atendida» solo la fija `marcar_cita_atendida()`, que solo llama el médico
// dueño de la cita). Estas funciones solo la invocan y traducen sus errores:
//  - `confirmarCita` y `marcarNoAsistio` hacen `update … set estado = … where id = … returning estado` SIN filtrar por estado en
//    el `WHERE`, para que una transición inválida llegue al disparador (`UC004`, con el mensaje propio de la acción) y cero
//    filas signifique cita inexistente o invisible («La cita ya no está vigente»). Confirmar una cita ya confirmada es un
//    `UPDATE` sin cambio de estado: éxito idempotente.
//  - `marcarAtendida` llama a la función `public.marcar_cita_atendida()`; una cita ajena y una inexistente dan el mismo `UC002`.
//  - Ninguna emite un `EventoCita`: H5 no necesita avisar de estas transiciones.
//  - Confirmar es el hecho que concede al médico acceso a la historia del paciente (ADR-0016, `extender_asignacion_por_cita`).
import {
  exito,
  fallo,
  falloPorValidacion,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import { consultar, type Ejecutor } from "../db/ejecutor.ts";
import { citaIdSchema } from "../schemas/cita.ts";
import { MENSAJE_CITA_NO_VIGENTE, traducirError } from "./errores.ts";

type AccionAdministrativo = "confirmar" | "no_asistio";

const ESTADO_DE: Record<AccionAdministrativo, "confirmada" | "no_asistio"> = {
  confirmar: "confirmada",
  no_asistio: "no_asistio",
};

async function cambiarEstado(
  ejecutar: Ejecutor,
  entrada: unknown,
  accion: AccionAdministrativo,
): Promise<ResultadoAccion<{ estado: "confirmada" | "no_asistio" }>> {
  const validada = citaIdSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);

  try {
    const filas = await consultar(
      ejecutar,
      `update public.citas set estado = $2 where id = $1 returning estado::text as estado`,
      [validada.data.cita_id, ESTADO_DE[accion]],
    );
    // Cero filas: la cita no existe o la RLS no se la muestra a quien llama (misma respuesta que `UC002`).
    if (filas.length === 0) return fallo("CITA_NO_VIGENTE", MENSAJE_CITA_NO_VIGENTE);
    return exito({ estado: ESTADO_DE[accion] });
  } catch (error) {
    return traducirError(error, accion);
  }
}

// `reservada → confirmada` (administrativo, antes de que termine la cita).
export function confirmarCita(ejecutar: Ejecutor, entrada: unknown) {
  return cambiarEstado(ejecutar, entrada, "confirmar");
}

// `confirmada → no_asistio` (administrativo, cuando la hora de la cita ya empezó).
export function marcarNoAsistio(ejecutar: Ejecutor, entrada: unknown) {
  return cambiarEstado(ejecutar, entrada, "no_asistio");
}

// `confirmada → atendida` (solo el médico dueño de la cita, cuando su hora ya empezó).
export async function marcarAtendida(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAccion<void>> {
  const validada = citaIdSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);

  try {
    await consultar(ejecutar, `select public.marcar_cita_atendida($1)`, [validada.data.cita_id]);
    return exito();
  } catch (error) {
    return traducirError(error, "atendida");
  }
}
