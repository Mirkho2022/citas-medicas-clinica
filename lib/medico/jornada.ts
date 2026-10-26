// Jornada del médico («Mi jornada»): sus horarios de atención, sus bloqueos de agenda y sus citas CONFIRMADAS de hoy y de los próximos
// 7 días (specs/jornada-del-medico; design.md, D7 y D11).
//
// Todo sale en UNA `transacción` con la identidad del médico y SIN vista ni política nueva: la RLS de `citas` ya limita al médico a las
// suyas, la de `bloqueos_agenda` a los propios y la de `pacientes` le deja ver a quien tiene en una cita vigente (ADR-0016). Las
// `disponibilidades` son legibles por todos los roles, así que el filtro por `medico_actual()` es de consulta y no de seguridad
// (no contienen datos sensibles). Solo datos logísticos: nombre y documento del paciente, hora y estado. NUNCA el `motivo` de la cita
// (texto libre que puede contener síntomas), ni diagnósticos, notas o antecedentes, ni el motivo de un bloqueo.
//
// Fechas: `timestamptz` en la base de datos; «hoy» es el día de Lima según la base de datos (`hoy_lima()`), y los minutos desde la hora
// de una cita se calculan con el reloj de la base de datos, no con el del navegador. `armarJornada` es pura y se prueba sin red.
import type { Ejecutor } from "../db/ejecutor.ts";
import { aIso } from "../citas/consultas.ts";
import { fechaYHoraLima, finDiaLima, inicioDiaLima } from "../fechas/lima.ts";
import { horariosPorDia, type BloqueHorario, type TramoPlantilla } from "./horarios.ts";

// Hoy y los 7 días siguientes.
export const DIAS_DE_JORNADA = 8;

export interface CitaDeJornada {
  id: string;
  // Instantes ISO 8601 en UTC; la pantalla los muestra en hora de Lima.
  inicio: string;
  fin: string;
  paciente: { nombres: string; apellidos: string; tipoDocumento: "DNI" | "CE"; documento: string };
  // Minutos transcurridos desde la hora de la cita si ya empezó; nulo si todavía no. Con el reloj de la base de datos.
  minutosDesdeInicio: number | null;
}

// Un bloqueo de agenda del médico recortado al día que se muestra: de `inicio` a `fin` (`HH:mm`; `24:00` si sigue hasta el final del día).
export interface BloqueoDelDia {
  inicio: string;
  fin: string;
  todoElDia: boolean;
}

export interface BloqueoEnBruto {
  // Instantes ISO; `null` si el rango no tiene ese extremo (una baja sin fecha de fin tiene `hasta` nulo).
  desde: string | null;
  hasta: string | null;
}

export interface DiaDeJornada {
  fecha: string;
  esHoy: boolean;
  horarios: BloqueHorario[];
  bloqueos: BloqueoDelDia[];
  citas: CitaDeJornada[];
}

export interface Jornada {
  hoy: string;
  dias: DiaDeJornada[];
  totalCitas: number;
}

// El bloqueo recortado al día de Lima `fecha`, o `null` si no lo toca. Los límites del día son semiabiertos: un bloqueo que termina a las
// 00:00 de ese día, o empieza a las 00:00 del siguiente, no lo toca.
function bloqueoDelDia(fecha: string, bloqueo: BloqueoEnBruto): BloqueoDelDia | null {
  const inicioDia = inicioDiaLima(fecha).getTime();
  const finDia = finDiaLima(fecha).getTime();
  const desde = bloqueo.desde === null ? -Infinity : new Date(bloqueo.desde).getTime();
  const hasta = bloqueo.hasta === null ? Infinity : new Date(bloqueo.hasta).getTime();
  if (!(desde < finDia && hasta > inicioDia)) return null;
  const recortadoDesde = Math.max(desde, inicioDia);
  const recortadoHasta = Math.min(hasta, finDia);
  const todoElDia = recortadoDesde === inicioDia && recortadoHasta === finDia;
  return {
    inicio: fechaYHoraLima(new Date(recortadoDesde)).hora,
    fin: recortadoHasta === finDia ? "24:00" : fechaYHoraLima(new Date(recortadoHasta)).hora,
    todoElDia,
  };
}

// Arma los días de la jornada: para cada fecha de Lima de `hoy` a `hoy` + 7, sus horarios de atención, sus bloqueos y sus citas
// (ya filtradas a `confirmada` por quien las lee). Todos los días salen; la pantalla decide cuáles mostrar.
export function armarJornada(entrada: {
  hoy: string;
  plantilla: readonly TramoPlantilla[];
  bloqueos: readonly BloqueoEnBruto[];
  citas: readonly CitaDeJornada[];
}): Jornada {
  const { hoy, plantilla, bloqueos, citas } = entrada;
  const horarios = horariosPorDia(plantilla, hoy, DIAS_DE_JORNADA);
  const dias: DiaDeJornada[] = horarios.map(({ fecha, bloques }) => ({
    fecha,
    esHoy: fecha === hoy,
    horarios: bloques,
    bloqueos: bloqueos.map((b) => bloqueoDelDia(fecha, b)).filter((b): b is BloqueoDelDia => b !== null),
    citas: citas
      .filter((c) => fechaYHoraLima(c.inicio).fecha === fecha)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
  }));
  return { hoy, dias, totalCitas: dias.reduce((n, d) => n + d.citas.length, 0) };
}

// «Hace 12 min», «Hace 1 h», «Hace 1 h 5 min».
export function textoHace(minutos: number): string {
  const total = Math.max(0, Math.floor(minutos));
  if (total < 60) return `Hace ${total} min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto === 0 ? `Hace ${horas} h` : `Hace ${horas} h ${resto} min`;
}

// Lectura de la base de datos con la identidad del médico (una sola transacción).
export async function jornadaDelMedico(ejecutar: Ejecutor): Promise<Jornada> {
  const ventanaDesde = `public.hoy_lima()::timestamp at time zone 'America/Lima'`;
  const ventanaHasta = `(public.hoy_lima() + ${DIAS_DE_JORNADA})::timestamp at time zone 'America/Lima'`;
  const [dia = [], filasPlantilla = [], filasBloqueos = [], filasCitas = []] = await ejecutar([
    { texto: `select public.hoy_lima()::text as hoy` },
    {
      texto: `select d.dia_semana, d.hora_inicio::text as hora_inicio, d.hora_fin::text as hora_fin,
                     d.vigente_desde::text as vigente_desde, d.vigente_hasta::text as vigente_hasta
                from public.disponibilidades d
               where d.medico_id = (select public.medico_actual())
                 and d.vigente_desde <= public.hoy_lima() + ${DIAS_DE_JORNADA - 1}
                 and (d.vigente_hasta is null or d.vigente_hasta >= public.hoy_lima())`,
    },
    {
      // Sin `motivo`: puede ser información personal (p. ej. una licencia médica).
      texto: `select lower(b.rango) as desde, upper(b.rango) as hasta
                from public.bloqueos_agenda b
               where b.medico_id = (select public.medico_actual())
                 and b.rango && tstzrange(${ventanaDesde}, ${ventanaHasta}, '[)')
               order by lower(b.rango)`,
    },
    {
      // Sin `motivo`. `minutos_desde_inicio` con el reloj de la base de datos.
      texto: `select c.id, c.inicio, c.fin, p.nombres, p.apellidos, p.tipo_documento::text as tipo_documento, p.numero_documento,
                     case when c.inicio <= now() then floor(extract(epoch from now() - c.inicio) / 60)::int end as minutos_desde_inicio
                from public.citas c
                join public.pacientes p on p.id = c.paciente_id
               where c.medico_id = (select public.medico_actual())
                 and c.estado = 'confirmada'
                 and c.inicio >= ${ventanaDesde}
                 and c.inicio < ${ventanaHasta}
               order by c.inicio`,
    },
  ]);

  const hoy = String(dia[0]?.hoy ?? "");
  const plantilla: TramoPlantilla[] = filasPlantilla.map((f) => ({
    diaSemana: Number(f.dia_semana),
    horaInicio: String(f.hora_inicio),
    horaFin: String(f.hora_fin),
    vigenteDesde: String(f.vigente_desde),
    vigenteHasta: f.vigente_hasta === null || f.vigente_hasta === undefined ? null : String(f.vigente_hasta),
  }));
  const bloqueos: BloqueoEnBruto[] = filasBloqueos.map((f) => ({
    desde: f.desde === null || f.desde === undefined ? null : aIso(f.desde),
    hasta: f.hasta === null || f.hasta === undefined ? null : aIso(f.hasta),
  }));
  const citas: CitaDeJornada[] = filasCitas.map((f) => ({
    id: String(f.id),
    inicio: aIso(f.inicio),
    fin: aIso(f.fin),
    paciente: {
      nombres: String(f.nombres),
      apellidos: String(f.apellidos),
      tipoDocumento: String(f.tipo_documento) === "CE" ? "CE" : "DNI",
      documento: String(f.numero_documento),
    },
    minutosDesdeInicio: f.minutos_desde_inicio === null || f.minutos_desde_inicio === undefined ? null : Number(f.minutos_desde_inicio),
  }));
  // Sin `hoy` (no debería ocurrir) no hay jornada que armar.
  if (hoy === "") return { hoy, dias: [], totalCitas: 0 };
  return armarJornada({ hoy, plantilla, bloqueos, citas });
}

