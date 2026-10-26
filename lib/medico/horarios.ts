// Horarios de atención de un médico por día (specs/jornada-del-medico; design.md, D7). La plantilla semanal de `disponibilidades`
// (`dia_semana` 0 = domingo como en la base de datos, `vigente_desde`, `vigente_hasta`) se convierte en los bloques de cada FECHA de
// Lima. Es una función pura sobre fechas de calendario `YYYY-MM-DD` (aritmética en UTC de `lib/ui/calendario.ts`): no depende de la
// zona del proceso ni del navegador, y por eso da lo mismo con TZ=UTC que con TZ=Asia/Tokyo.
import { diaDeLaSemana, sumarDias } from "../ui/calendario.ts";

// Un tramo de la plantilla semanal tal como lo entrega la base de datos (`time` como `HH:mm` o `HH:mm:ss`; `date` como `YYYY-MM-DD`).
export interface TramoPlantilla {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

export interface BloqueHorario {
  // `HH:mm` (la base de datos admite `24:00` como fin).
  inicio: string;
  fin: string;
}

export interface HorariosDelDia {
  fecha: string;
  bloques: BloqueHorario[];
}

// `08:00:00` → `08:00`; `08:00` y `24:00` quedan igual.
function aHoraCorta(hora: string): string {
  return hora.length > 5 ? hora.slice(0, 5) : hora;
}

// Los bloques de atención de `dias` días seguidos desde la fecha `desde` (inclusive), en orden de fecha. Un tramo cuenta en una fecha
// si su `dia_semana` coincide con el de la fecha y la fecha está dentro de su vigencia (`vigente_desde` ≤ fecha ≤ `vigente_hasta`; sin
// fin = sin vencimiento). Todos los días de la ventana salen en el resultado, con `bloques` vacío si no atiende.
export function horariosPorDia(plantilla: readonly TramoPlantilla[], desde: string, dias: number): HorariosDelDia[] {
  const resultado: HorariosDelDia[] = [];
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(desde, i);
    const diaSemana = diaDeLaSemana(fecha);
    const bloques = plantilla
      .filter(
        (t) =>
          t.diaSemana === diaSemana &&
          t.vigenteDesde <= fecha &&
          (t.vigenteHasta === null || t.vigenteHasta >= fecha),
      )
      .map((t) => ({ inicio: aHoraCorta(t.horaInicio), fin: aHoraCorta(t.horaFin) }))
      .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : 0));
    resultado.push({ fecha, bloques });
  }
  return resultado;
}
