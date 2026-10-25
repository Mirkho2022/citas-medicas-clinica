// Cálculo del calendario del selector de fecha (docs/02-diseno/BRIEF-DISENO.md, sección 5; DESIGN.md). Funciones puras sobre fechas
// de calendario `YYYY-MM-DD` (las «fechas de Lima» de lib/fechas/lima.ts): aritmética en UTC, así que no dependen de la zona del
// proceso ni del navegador. La semana empieza en lunes, como en el lienzo aprobado.
export const NOMBRES_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export const ABREVIATURAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"] as const;

export interface Mes {
  anio: number;
  // 0 = enero … 11 = diciembre
  mes: number;
}

function partes(fecha: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) throw new Error(`Fecha no válida: «${fecha}». Use el formato AAAA-MM-DD.`);
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}

function aTexto(anio: number, mes: number, dia: number): string {
  return new Date(Date.UTC(anio, mes, dia)).toISOString().slice(0, 10);
}

export function mesDeFecha(fecha: string): Mes {
  const [anio, mes] = partes(fecha);
  return { anio, mes };
}

export function sumarMeses({ anio, mes }: Mes, delta: number): Mes {
  const total = anio * 12 + mes + delta;
  return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
}

export function sumarDias(fecha: string, delta: number): string {
  const [anio, mes, dia] = partes(fecha);
  return aTexto(anio, mes, dia + delta);
}

// Día de la semana: 0 = domingo … 6 = sábado.
export function diaDeLaSemana(fecha: string): number {
  const [anio, mes, dia] = partes(fecha);
  return new Date(Date.UTC(anio, mes, dia)).getUTCDay();
}

// Celdas del mes en filas de 7 (lunes a domingo). `null` es una celda vacía antes del día 1; después del último día no se
// añaden celdas de relleno.
export function celdasDelMes({ anio, mes }: Mes): Array<string | null> {
  const primero = (new Date(Date.UTC(anio, mes, 1)).getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const celdas: Array<string | null> = Array.from({ length: primero }, () => null);
  for (let dia = 1; dia <= total; dia++) celdas.push(aTexto(anio, mes, dia));
  return celdas;
}

// «octubre de 2026»
export function textoMes({ anio, mes }: Mes): string {
  return `${NOMBRES_MES[mes]} de ${anio}`;
}

// «martes 20 de octubre de 2026»: el nombre accesible de un día del calendario.
export function etiquetaFecha(fecha: string): string {
  const [anio, mes, dia] = partes(fecha);
  return `${NOMBRES_DIA[diaDeLaSemana(fecha)]} ${dia} de ${NOMBRES_MES[mes]} de ${anio}`;
}

// «Martes 20/10/2026»: la fecha del selector de la agenda, con el formato de pantalla de DESIGN.md.
export function textoFechaConDia(fecha: string): string {
  const [anio, mes, dia] = partes(fecha);
  const nombre = NOMBRES_DIA[diaDeLaSemana(fecha)];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${String(dia).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${anio}`;
}

// «20/10/2026»: una fecha de calendario `AAAA-MM-DD` con el formato de pantalla de DESIGN.md, sin pasar por zonas horarias (a
// diferencia de `fechaLima`, que formatea un instante).
export function textoFecha(fecha: string): string {
  const [anio, mes, dia] = partes(fecha);
  return `${String(dia).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${anio}`;
}
