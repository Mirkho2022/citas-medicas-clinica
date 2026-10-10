// Ventana de cancelación de la interfaz (ADR-0012): solo se muestra la opción de cancelar mientras falte 1 hora o más.
// Es solo presentación: la autoridad es el disparador `validar_cancelacion` de la base de datos, que rechaza la cancelación
// cuando `inicio - now() < 1 hora` (por eso una cita a exactamente 1 hora todavía se puede cancelar).
import type { EstadoCita } from "./estados-cita.ts";
import { esEstadoActivo } from "./estados-cita.ts";
import type { Instante } from "./formato.ts";

export const VENTANA_CANCELACION_MS = 60 * 60 * 1000;

export function puedeCancelar(estado: EstadoCita, inicio: Instante, ahora: Date): boolean {
  if (!esEstadoActivo(estado)) return false;
  const instante = inicio instanceof Date ? inicio : new Date(inicio);
  return instante.getTime() - ahora.getTime() >= VENTANA_CANCELACION_MS;
}
