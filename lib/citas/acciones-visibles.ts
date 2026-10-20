// Qué acciones ofrece la agenda del día en cada fila (specs/gestion-de-citas; design.md, D13). Es solo presentación: la autoridad
// son los disparadores de la base de datos (`validar_transicion_estado`, `validar_cancelacion`), que rechazan lo que aquí no
// se ofrece. Se calcula con la hora actual para decidir qué botones mostrar, no para permitir nada.
//
//   Confirmar       reservada que todavía no terminó (`now() < fin`); la hace la recepción.
//   «No asistió»    confirmada cuya hora ya empezó (`now() >= inicio`); la hace la recepción. «Atendida» la marca el médico.
//   Cancelar        reservada o confirmada con 1 hora o más de anticipación, o cubierta por una baja del médico (ADR-0011/0012).
//   Reprogramar     lo mismo que cancelar: reprogramar cancela la original (design.md, D4; ADR-0012 no se reabre).
//   Aviso           si es vigente y ya no puede cancelarse ni reprogramarse, la fila lo explica en vez de dejar un botón apagado.
import { VENTANA_CANCELACION_MS } from "../ui/cancelacion.ts";
import type { EstadoCita } from "../ui/estados-cita.ts";
import { esEstadoActivo } from "../ui/estados-cita.ts";

export interface DatosAcciones {
  estado: EstadoCita;
  inicio: string;
  fin: string;
  porBaja: boolean;
}

export interface AccionesVisibles {
  confirmar: boolean;
  noAsistio: boolean;
  cancelar: boolean;
  reprogramar: boolean;
  avisoMenosDeUnaHora: boolean;
}

export const TEXTO_MENOS_DE_UNA_HORA = "Falta menos de 1 hora: ya no se puede cancelar ni reprogramar";

export function accionesVisibles(cita: DatosAcciones, ahora: Date): AccionesVisibles {
  const inicio = new Date(cita.inicio).getTime();
  const fin = new Date(cita.fin).getTime();
  const t = ahora.getTime();
  const vigente = esEstadoActivo(cita.estado);
  const cancelable = vigente && (cita.porBaja || inicio - t >= VENTANA_CANCELACION_MS);
  return {
    confirmar: cita.estado === "reservada" && t < fin,
    noAsistio: cita.estado === "confirmada" && t >= inicio,
    cancelar: cancelable,
    reprogramar: cancelable,
    avisoMenosDeUnaHora: vigente && !cancelable,
  };
}
