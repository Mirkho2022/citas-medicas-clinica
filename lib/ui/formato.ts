// Formato de fechas y horas de la interfaz (docs/02-diseno/DESIGN.md): siempre en America/Lima, `dd/MM/yyyy` y `HH:mm` de 24 horas,
// sin importar la zona del navegador o del servidor. En la base de datos las fechas son `timestamptz`.
import { subHours } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export const ZONA_LIMA = "America/Lima";

// Instante de una cita: un `Date` o su texto ISO 8601 (como llega de la base de datos).
export type Instante = Date | string;

function aFecha(instante: Instante): Date {
  const fecha = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Fecha no válida: «${String(instante)}»`);
  }
  return fecha;
}

// `14/10/2026`
export function fechaLima(instante: Instante): string {
  return formatInTimeZone(aFecha(instante), ZONA_LIMA, "dd/MM/yyyy");
}

// `14:30`
export function horaLima(instante: Instante): string {
  return formatInTimeZone(aFecha(instante), ZONA_LIMA, "HH:mm");
}

// `14/10/2026 14:30`
export function fechaHoraLima(instante: Instante): string {
  return `${fechaLima(instante)} ${horaLima(instante)}`;
}

// Hora límite para cancelar: una hora antes de la cita (ADR-0012), en hora de Lima. Para una cita a las 14:30, `13:30`.
export function horaLimiteCancelacion(inicio: Instante): string {
  return horaLima(subHours(aFecha(inicio), 1));
}
