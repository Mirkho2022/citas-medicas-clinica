// Entrada de las acciones sobre citas (specs/gestion-de-citas). Identificadores `uuid` e instantes ISO 8601: el horario
// elegido de la lista de libres viaja como el instante exacto que calculó el servidor, nunca reconstruido a partir de texto
// local (design.md, D8). Los instantes salen normalizados a ISO en UTC (`…Z`).
import { z } from "zod";
import { identificador, instanteIso, textoOpcional } from "./comun.ts";

export const MENSAJE_HORARIO_REQUERIDO = "Seleccione un horario";
export const MENSAJE_FIN_ANTERIOR = "El horario de fin debe ser posterior al de inicio";

// Entrada de una operación sobre una cita existente: cancelar y las transiciones de estado (confirmar, «No asistió»,
// «Atendida»). Solo el identificador de la cita: el resto lo decide la base de datos.
export const citaIdSchema = z.object({
  cita_id: identificador("Seleccione una cita"),
});

export type CitaId = z.infer<typeof citaIdSchema>;

const camposHorario = {
  medico_id: identificador("Seleccione un médico"),
  inicio: instanteIso(MENSAJE_HORARIO_REQUERIDO, "El horario elegido no es válido"),
  fin: instanteIso(MENSAJE_HORARIO_REQUERIDO, "El horario elegido no es válido"),
  // «Motivo de la visita (opcional, sin datos clínicos)»
  motivo: textoOpcional,
};

function finPosteriorAlInicio(datos: { inicio: string; fin: string }, ctx: z.RefinementCtx): void {
  if (datos.inicio !== "" && datos.fin !== "" && new Date(datos.fin).getTime() <= new Date(datos.inicio).getTime()) {
    ctx.addIssue({ code: "custom", path: ["fin"], message: MENSAJE_FIN_ANTERIOR });
  }
}

// Agendar: paciente, médico y horario (inicio y fin) de un slot que ofreció el servidor.
export const citaNuevaSchema = z
  .object({
    paciente_id: identificador("Seleccione un paciente"),
    ...camposHorario,
  })
  .superRefine(finPosteriorAlInicio);

export type DatosCitaNueva = z.infer<typeof citaNuevaSchema>;

// Reprogramar: la cita original y el nuevo médico y horario (mismas validaciones que agendar).
export const reprogramarCitaSchema = z
  .object({
    cita_id: identificador("Seleccione una cita"),
    ...camposHorario,
  })
  .superRefine(finPosteriorAlInicio);

export type DatosReprogramacion = z.infer<typeof reprogramarCitaSchema>;
