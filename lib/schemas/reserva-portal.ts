// Entrada de la reserva del portal (specs/busqueda-y-reserva-de-cita; design.md, D5 y D7). Solo el médico y el instante de inicio que
// ofreció el servidor: el paciente sale de la sesión (`paciente_actual()` en la base de datos) y el fin del horario lo busca el servidor
// en `slots_disponibles()`. Las claves desconocidas se descartan (Zod las quita por defecto), así que un `paciente_id` o un `fin` enviados
// a mano no llegan a ninguna consulta.
import { z } from "zod";
import { identificador, instanteIso } from "./comun.ts";

export const reservaPortalSchema = z.object({
  medico_id: identificador("Seleccione un médico"),
  inicio: instanteIso("Seleccione un horario", "El horario elegido no es válido"),
});

export type DatosReservaPortal = z.infer<typeof reservaPortalSchema>;
