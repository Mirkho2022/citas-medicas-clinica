// Estados de la cita y cómo se muestran (docs/02-diseno/DESIGN.md, «Estados de cita»). Es el único mapa del código: el tipo
// `EstadoCita` es igual al enum `estado_cita` de la base de datos. El estado nunca se comunica solo con el color:
// siempre lleva etiqueta de texto e icono.
import {
  CheckCheck,
  CircleCheck,
  CircleX,
  Clock,
  UserRoundMinus,
  type LucideIcon,
} from "lucide-react";

export const ESTADOS_CITA = [
  "reservada",
  "confirmada",
  "atendida",
  "cancelada",
  "no_asistio",
] as const;

export type EstadoCita = (typeof ESTADOS_CITA)[number];

// Tono de color del sistema (variantes de `Badge`): info, éxito, neutro, error y aviso.
export type TonoEstado = "info" | "success" | "neutral" | "error" | "warning";

export interface DatosEstado {
  etiqueta: string;
  icono: LucideIcon;
  tono: TonoEstado;
}

export const DATOS_ESTADO: Record<EstadoCita, DatosEstado> = {
  reservada: { etiqueta: "Reservada", icono: Clock, tono: "info" },
  confirmada: { etiqueta: "Confirmada", icono: CircleCheck, tono: "success" },
  atendida: { etiqueta: "Atendida", icono: CheckCheck, tono: "neutral" },
  cancelada: { etiqueta: "Cancelada", icono: CircleX, tono: "error" },
  no_asistio: { etiqueta: "No asistió", icono: UserRoundMinus, tono: "warning" },
};

// Un valor fuera del mapa no se pinta con un color arbitrario: lanza (se ve en desarrollo y en las pruebas).
export function datosEstado(estado: string): DatosEstado {
  if (!Object.hasOwn(DATOS_ESTADO, estado)) {
    throw new Error(`Estado de cita desconocido: «${estado}»`);
  }
  return DATOS_ESTADO[estado as EstadoCita];
}

// Citas sobre las que todavía se puede actuar (reprogramar, cancelar). `atendida`, `cancelada` y `no_asistio` son finales.
export function esEstadoActivo(estado: EstadoCita): boolean {
  return estado === "reservada" || estado === "confirmada";
}
