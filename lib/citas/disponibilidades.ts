// Disponibilidad semanal de los médicos, gestionada por el administrativo (specs/disponibilidad-y-slots; design.md, D2 y D7).
//
// Las funciones reciben un `Ejecutor` (lib/db/ejecutor.ts). El solape de tramos lo decide la restricción `EXCLUDE` de la base de
// datos (`23P01`, que en el contexto `disponibilidad` es «Este horario se cruza con otro ya definido para el médico», nunca el
// mensaje de la doble reserva). Al modificar o eliminar un tramo se informa cuántas citas vigentes futuras quedaron fuera de la
// plantilla; ninguna se cancela (specs: «Advertencia al recortar una disponibilidad con citas futuras»).
import {
  exito,
  fallo,
  falloPorValidacion,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import type { Ejecutor, Fila, Sentencia } from "../db/ejecutor.ts";
import { fechaYHoraLima } from "../fechas/lima.ts";
import { disponibilidadSchema, idOpcionalSchema, tramoRefSchema } from "../schemas/agenda.ts";
import { traducirError } from "./errores.ts";

export const MENSAJE_HORARIO_INEXISTENTE = "El horario ya no existe. Actualice la página.";

// Un tramo de la plantilla semanal tal como lo devuelve la base de datos (`time` y `date` como texto).
export interface TramoSemanal {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  duracion_slot_min: number;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export interface CitaFutura {
  id: string;
  inicio: string | Date;
  fin: string | Date;
}

const minutosDelDia = (hora: string): number => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

// Día de la semana (0 = domingo) de una fecha de calendario `YYYY-MM-DD`, sin depender de la zona del proceso.
function diaSemana(fecha: string): number {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

// ¿La cita ocupa EXACTAMENTE uno de los slots que genera alguno de los tramos? Es la misma regla de la malla de
// `slots_agenda` (la base de datos es la fuente de verdad al reservar; esta función solo sirve para avisar) SIN mirar bloqueos
// ni si el médico está activo: la pregunta es si la plantilla semanal sigue cubriendo la cita. Los días y las horas son los de
// Lima. Un slot que empieza a las 08:00 y dura 20 minutos es `[08:00, 08:20)`; una cita de otra duración (p. ej. tras cambiar
// el slot de 20 a 30 minutos) cae fuera.
export function citaEnLaMalla(cita: Pick<CitaFutura, "inicio" | "fin">, tramos: readonly TramoSemanal[]): boolean {
  const inicio = fechaYHoraLima(cita.inicio);
  const fin = fechaYHoraLima(cita.fin);
  const inicioMin = minutosDelDia(inicio.hora);
  // Un slot no cruza la medianoche, salvo que termine justo en ella (tramo hasta 24:00).
  let finMin: number;
  if (fin.fecha === inicio.fecha) finMin = minutosDelDia(fin.hora);
  else if (fin.hora === "00:00" && fin.fecha === siguienteFecha(inicio.fecha)) finMin = 24 * 60;
  else return false;

  const dia = diaSemana(inicio.fecha);
  return tramos.some((tramo) => {
    if (tramo.dia_semana !== dia) return false;
    if (tramo.vigente_desde > inicio.fecha) return false;
    if (tramo.vigente_hasta !== null && tramo.vigente_hasta < inicio.fecha) return false;
    const desde = minutosDelDia(tramo.hora_inicio);
    const hasta = minutosDelDia(tramo.hora_fin);
    const duracion = tramo.duracion_slot_min;
    return (
      duracion > 0 &&
      inicioMin >= desde &&
      finMin <= hasta &&
      finMin - inicioMin === duracion &&
      (inicioMin - desde) % duracion === 0
    );
  });
}

function siguienteFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

export interface CitasFueraDelHorario {
  cantidad: number;
  citaIds: string[];
}

// Las citas que la plantilla `tramos` ya no cubre. Solo informa: no cancela ni mueve nada.
export function citasFueraDeLaMalla(citas: readonly CitaFutura[], tramos: readonly TramoSemanal[]): CitasFueraDelHorario {
  const citaIds = citas.filter((cita) => !citaEnLaMalla(cita, tramos)).map((cita) => cita.id);
  return { cantidad: citaIds.length, citaIds };
}

// Sentencias que, DESPUÉS de cambiar la plantilla y en la misma transacción, leen las citas vigentes futuras del médico y su
// plantilla resultante. El cálculo del aviso lo hace `citasFueraDeLaMalla`.
function sentenciasDeEfecto(medicoId: string): Sentencia[] {
  return [
    {
      texto: `select id, inicio, fin from public.citas
               where medico_id = $1 and estado in ('reservada', 'confirmada') and inicio > now()
               order by inicio, id`,
      parametros: [medicoId],
    },
    {
      texto: `select dia_semana, hora_inicio::text as hora_inicio, hora_fin::text as hora_fin, duracion_slot_min,
                     vigente_desde::text as vigente_desde, vigente_hasta::text as vigente_hasta
                from public.disponibilidades where medico_id = $1`,
      parametros: [medicoId],
    },
  ];
}

function efecto(citas: Fila[] | undefined, tramos: Fila[] | undefined): CitasFueraDelHorario {
  return citasFueraDeLaMalla((citas ?? []) as unknown as CitaFutura[], (tramos ?? []) as unknown as TramoSemanal[]);
}

// Crea o modifica un tramo (con `id` es una modificación). `vigente_desde` vacío = hoy en Lima, que fija la base de datos.
export async function guardarDisponibilidad(
  ejecutar: Ejecutor,
  entrada: unknown,
): Promise<ResultadoAccion<{ id: string; fueraDelHorario: CitasFueraDelHorario }>> {
  const validada = disponibilidadSchema.safeParse(entrada);
  const identificador = idOpcionalSchema.safeParse(entrada);
  if (!validada.success || !identificador.success) {
    return falloPorValidacion({
      issues: [...(identificador.success ? [] : identificador.error.issues), ...(validada.success ? [] : validada.error.issues)],
    });
  }
  const d = validada.data;
  const id = identificador.data.id;

  try {
    if (id === undefined) {
      const [filas] = await ejecutar([
        {
          texto: `insert into public.disponibilidades
                    (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde, vigente_hasta)
                  values ($1, $2, $3::time, $4::time, $5, coalesce($6::date, public.hoy_lima()), $7::date)
                  returning id`,
          parametros: [d.medico_id, d.dia_semana, d.hora_inicio, d.hora_fin, d.duracion_slot_min, d.vigente_desde ?? null, d.vigente_hasta ?? null],
        },
      ]);
      const nuevo = filas?.[0]?.id;
      if (typeof nuevo !== "string") return traducirError(new Error("alta sin id"), "disponibilidad");
      // Agregar un tramo no puede dejar citas fuera de la plantilla.
      return exito({ id: nuevo, fueraDelHorario: { cantidad: 0, citaIds: [] } });
    }

    const [modificada, citas, tramos] = await ejecutar([
      {
        texto: `update public.disponibilidades
                   set dia_semana = $3, hora_inicio = $4::time, hora_fin = $5::time, duracion_slot_min = $6,
                       vigente_desde = coalesce($7::date, vigente_desde), vigente_hasta = $8::date
                 where id = $1 and medico_id = $2
                 returning id`,
        parametros: [id, d.medico_id, d.dia_semana, d.hora_inicio, d.hora_fin, d.duracion_slot_min, d.vigente_desde ?? null, d.vigente_hasta ?? null],
      },
      ...sentenciasDeEfecto(d.medico_id),
    ]);
    if (!modificada?.length) return fallo("DATOS_INVALIDOS", MENSAJE_HORARIO_INEXISTENTE, { id: MENSAJE_HORARIO_INEXISTENTE });
    return exito({ id, fueraDelHorario: efecto(citas, tramos) });
  } catch (error) {
    return traducirError(error, "disponibilidad");
  }
}

// Elimina un tramo y avisa de las citas vigentes futuras que quedan fuera de la plantilla (no las cancela).
export async function eliminarDisponibilidad(
  ejecutar: Ejecutor,
  entrada: unknown,
): Promise<ResultadoAccion<{ fueraDelHorario: CitasFueraDelHorario }>> {
  const validada = tramoRefSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { id, medico_id } = validada.data;

  try {
    const [borrada, citas, tramos] = await ejecutar([
      { texto: `delete from public.disponibilidades where id = $1 and medico_id = $2 returning id`, parametros: [id, medico_id] },
      ...sentenciasDeEfecto(medico_id),
    ]);
    if (!borrada?.length) return fallo("DATOS_INVALIDOS", MENSAJE_HORARIO_INEXISTENTE, { id: MENSAJE_HORARIO_INEXISTENTE });
    return exito({ fueraDelHorario: efecto(citas, tramos) });
  } catch (error) {
    return traducirError(error, "disponibilidad");
  }
}
