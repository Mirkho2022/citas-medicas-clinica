// Fechas y horas en la zona de la clínica (America/Lima), sin depender de la zona del proceso ni del navegador
// (openspec/changes/agenda-y-reserva/design.md, D8). En la base de datos todo es `timestamptz`; aquí se convierte entre un
// instante (`Date`) y la fecha `YYYY-MM-DD` / hora `HH:mm` de Lima. El formato de pantalla (`dd/MM/yyyy`) es el de
// `lib/ui/formato.ts`, que no se duplica. Lima no tiene horario de verano, pero nada de aquí lo supone: se delega en la zona
// IANA.
//
// Convenciones:
//  - una «fecha de Lima» es el texto `YYYY-MM-DD` (el calendario de Lima), y una «hora de Lima» es `HH:mm` (24 horas);
//  - el día de Lima `d` es el intervalo semiabierto [inicioDiaLima(d), finDiaLima(d)).
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ZONA_LIMA } from "../ui/formato.ts";

export { ZONA_LIMA };

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PATRON_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

// `true` si el texto es una fecha de calendario real `YYYY-MM-DD` (rechaza `2026-02-30` y `2026-13-01`).
export function esFechaLima(texto: string): boolean {
  const partes = PATRON_FECHA.exec(texto);
  if (!partes) return false;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  if (anio < 1000 || mes < 1 || mes > 12 || dia < 1) return false;
  // El día 0 del mes siguiente es el último del mes; Date.UTC no depende de la zona del proceso.
  return dia <= new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

// `true` si el texto es una hora `HH:mm` de 24 horas.
export function esHoraLima(texto: string): boolean {
  return PATRON_HORA.test(texto);
}

function exigirFecha(fecha: string): void {
  if (!esFechaLima(fecha)) throw new Error(`Fecha de Lima no válida: «${fecha}». Use el formato AAAA-MM-DD.`);
}

function exigirHora(hora: string): void {
  if (!esHoraLima(hora)) throw new Error(`Hora de Lima no válida: «${hora}». Use el formato HH:mm.`);
}

function aFecha(instante: Date | string): Date {
  const fecha = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(fecha.getTime())) throw new Error(`Fecha no válida: «${String(instante)}»`);
  return fecha;
}

// Fecha del calendario de Lima (`YYYY-MM-DD`) que contiene el instante dado. A las 23:30 de Lima del 14/10 (04:30 UTC del
// 15/10) sigue siendo `2026-10-14`. `ahora` se inyecta para poder probar; por defecto, el instante actual.
export function hoyLima(ahora: Date = new Date()): string {
  return formatInTimeZone(aFecha(ahora), ZONA_LIMA, "yyyy-MM-dd");
}

// Instante en que empieza el día de Lima `fecha`: 00:00 de Lima. Para `2026-10-14` es `2026-10-14T05:00:00.000Z`.
export function inicioDiaLima(fecha: string): Date {
  return instanteDesdeLima(fecha, "00:00");
}

// Instante en que termina (exclusivo) el día de Lima `fecha`: 00:00 de Lima del día calendario siguiente. No se calcula como
// «inicio + 24 horas» para no suponer que todos los días duran lo mismo.
export function finDiaLima(fecha: string): Date {
  return inicioDiaLima(diaSiguiente(fecha));
}

// Fecha `YYYY-MM-DD` del día calendario siguiente (aritmética de calendario en UTC: no depende de la zona del proceso).
function diaSiguiente(fecha: string): string {
  exigirFecha(fecha);
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

// Instante que corresponde a una fecha y hora escritas en Lima. 14:30 de Lima del 14/10/2026 es `2026-10-14T19:30:00.000Z`.
// Es lo que se usa para los campos libres (p. ej. un `datetime-local`): lo escrito a mano se interpreta como hora de Lima.
export function instanteDesdeLima(fecha: string, hora: string): Date {
  exigirFecha(fecha);
  exigirHora(hora);
  return fromZonedTime(`${fecha}T${hora}:00`, ZONA_LIMA);
}

// Fecha y hora de Lima de un instante (el inverso de `instanteDesdeLima`, a precisión de minuto).
export function fechaYHoraLima(instante: Date | string): { fecha: string; hora: string } {
  const valor = aFecha(instante);
  return {
    fecha: formatInTimeZone(valor, ZONA_LIMA, "yyyy-MM-dd"),
    hora: formatInTimeZone(valor, ZONA_LIMA, "HH:mm"),
  };
}
