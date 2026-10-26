// Lógica pura del botón «Marcar atendida» de la jornada del médico (specs/jornada-del-medico; design.md, D7). El componente de cliente
// (`components/clinica/marcar-atendida.tsx`) solo la usa; así lo que importa se prueba sin navegador (tests/turnos-dashboard/marcar-atendida.test.ts).
//
// La transición `confirmada → atendida` y sus reglas son de la agenda (H3, `app/medico/acciones-cita.ts`); la jornada solo la invoca y
// traduce su resultado para quien la usa.
import type { ResultadoAccion } from "../acciones/resultado.ts";

export const MENSAJE_CITA_ATENDIDA = "Cita marcada como atendida";
export const MENSAJE_CITA_YA_NO_CONFIRMADA = "La cita ya no está confirmada. Actualice la pantalla";

// Identificador del encabezado de la jornada: a donde pasa el foco si no queda otra cita.
export const ID_ENCABEZADO_JORNADA = "titulo-jornada";

export type MensajeDeAtendida = { tipo: "exito"; texto: string } | { tipo: "error"; texto: string };

// Traduce el resultado de la acción:
//  - éxito → «Cita marcada como atendida»;
//  - la cita ya no está confirmada (la recepción la canceló o la marcó «No asistió», o ya estaba atendida: `TRANSICION_INVALIDA`) o ya no
//    existe para el médico (`CITA_NO_VIGENTE`: una cita ajena y una inexistente dan lo mismo, y no se revela si existe) → un mensaje
//    accionable;
//  - sin permiso, sesión vencida o cualquier otro fallo → el mensaje que ya trae la acción, en español y sin texto de la base de datos.
export function mensajeDeResultado(resultado: ResultadoAccion<void>): MensajeDeAtendida {
  if (resultado.ok) return { tipo: "exito", texto: MENSAJE_CITA_ATENDIDA };
  if (resultado.codigo === "TRANSICION_INVALIDA" || resultado.codigo === "CITA_NO_VIGENTE") {
    return { tipo: "error", texto: MENSAJE_CITA_YA_NO_CONFIRMADA };
  }
  return { tipo: "error", texto: resultado.mensaje };
}

// A qué cita pasa el foco al marcar atendida la `citaId`: la siguiente de la lista (en el orden en que se ven), o `null` si no queda
// ninguna y el foco va al encabezado de la jornada. Una `citaId` que no está en la lista también da `null`.
export function siguienteFoco(idsEnOrden: readonly string[], citaId: string): string | null {
  const indice = idsEnOrden.indexOf(citaId);
  if (indice === -1) return null;
  return idsEnOrden[indice + 1] ?? null;
}
