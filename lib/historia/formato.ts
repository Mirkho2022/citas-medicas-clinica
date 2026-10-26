// Formato de fechas de calendario de la historia clínica. La fecha de nacimiento es una FECHA (`YYYY-MM-DD`), no un instante:
// pasarla por `new Date()` la interpretaría como medianoche UTC y en Lima (UTC-5) saldría el día anterior. Aquí solo se
// reordenan sus partes. Los instantes con hora (firma, creación) usan `lib/ui/formato.ts` (America/Lima).
import { esFechaLima } from "../fechas/lima.ts";

// `1990-05-17` -> `17/05/1990`. Un texto que no es una fecha válida se devuelve tal cual (no se inventa un dato).
export function fechaDeCalendario(fecha: string): string {
  if (!esFechaLima(fecha)) return fecha;
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

// Edad cumplida en años en `hoy` (ambas son fechas de calendario de Lima). `null` si alguna no es válida o si la fecha de
// nacimiento es posterior a hoy.
export function edadEnAnios(fechaNacimiento: string, hoy: string): number | null {
  if (!esFechaLima(fechaNacimiento) || !esFechaLima(hoy)) return null;
  const [an, mn, dn] = fechaNacimiento.split("-").map(Number) as [number, number, number];
  const [ah, mh, dh] = hoy.split("-").map(Number) as [number, number, number];
  let edad = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) edad -= 1;
  return edad >= 0 ? edad : null;
}

export function textoEdad(fechaNacimiento: string, hoy: string): string {
  const edad = edadEnAnios(fechaNacimiento, hoy);
  if (edad === null) return "";
  return edad === 1 ? "1 año" : `${edad} años`;
}

export const ETIQUETA_TIPO_ANTECEDENTE = {
  personal_patologico: "Personales patológicos",
  quirurgico: "Quirúrgicos",
  alergico: "Alérgicos",
  familiar: "Familiares",
  habito_nocivo: "Hábitos nocivos",
} as const;

export const ETIQUETA_SEXO = { M: "Masculino", F: "Femenino", X: "Otro o no indicado" } as const;
