// Semana de turnos (specs/turnos-de-enfermeria: «Los turnos se organizan por semana»). Aritmética de calendario sobre fechas de
// Lima `YYYY-MM-DD` (lib/ui/calendario.ts, en UTC): no depende de la zona del proceso. La semana empieza el LUNES, como el selector
// de fecha de la agenda.
import { esFechaLima } from "../fechas/lima.ts";
import { diaDeLaSemana, NOMBRES_DIA, sumarDias } from "../ui/calendario.ts";

// Lunes de la semana que contiene `fecha`. Un domingo pertenece a la semana que termina en él (su lunes es 6 días antes).
export function lunesDeLaSemana(fecha: string): string {
  const dia = diaDeLaSemana(fecha); // 0 = domingo … 6 = sábado
  return sumarDias(fecha, -((dia + 6) % 7));
}

// Los siete días de la semana que empieza en `lunes`.
export function diasDeLaSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

// Semana pedida por la dirección (`?semana=AAAA-MM-DD`): una fecha real cualquiera; si falta o no es una fecha, la de hoy.
export function semanaPedida(semana: string | undefined, hoy: string): string {
  return lunesDeLaSemana(semana !== undefined && esFechaLima(semana) ? semana : hoy);
}

// «Lunes» y «12/10»: el encabezado de una columna de la semana (el año va en el título de la semana).
export function encabezadoDeDia(fecha: string): { dia: string; fecha: string } {
  const nombre = NOMBRES_DIA[diaDeLaSemana(fecha)];
  return {
    dia: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`,
    fecha: `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`,
  };
}
