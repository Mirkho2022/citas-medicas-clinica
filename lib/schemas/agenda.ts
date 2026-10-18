// Horarios del médico: disponibilidad semanal y bloqueos de agenda (specs/disponibilidad-y-slots). Cada campo inválido
// lleva un mensaje que dice qué corregir. La base de datos conserva sus propios CHECK y la restricción de solape como
// segunda barrera.
import { z } from "zod";
import { esFechaLima, esHoraLima, hoyLima, instanteDesdeLima } from "../fechas/lima.ts";
import {
  enteroDeFormulario,
  fechaCalendario,
  horaDelDia,
  identificador,
  identificadorOpcional,
  textoObligatorio,
} from "./comun.ts";

export const DURACION_SLOT_POR_DEFECTO = 20;

const minutos = (hora: string): number => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

// Disponibilidad semanal: día de la semana (0 = domingo a 6 = sábado), tramo horario, duración del slot y vigencia.
//  - `vigente_desde` es opcional: sin ella, la base de datos usa la fecha de hoy en Lima (`hoy_lima()`).
//  - `vigente_hasta` es opcional (sin fecha de fin = sin vencimiento); si está, no puede ser anterior a `vigente_desde`.
//  - `duracion_slot_min` vacía = 20 minutos.
export const disponibilidadSchema = z
  .object({
    medico_id: identificador("Seleccione un médico"),
    dia_semana: enteroDeFormulario({
      requerido: "Seleccione el día de la semana",
      invalido: "Seleccione un día de la semana válido",
      minimo: { valor: 0, mensaje: "Seleccione un día de la semana válido (0 = domingo a 6 = sábado)" },
      maximo: { valor: 6, mensaje: "Seleccione un día de la semana válido (0 = domingo a 6 = sábado)" },
    }),
    hora_inicio: horaDelDia("Ingrese la hora de inicio", "La hora de inicio no es válida (use HH:mm)"),
    hora_fin: horaDelDia("Ingrese la hora de fin", "La hora de fin no es válida (use HH:mm)"),
    duracion_slot_min: z.preprocess(
      (valor) => (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "") ? DURACION_SLOT_POR_DEFECTO : valor),
      enteroDeFormulario({
        requerido: "Ingrese la duración del horario en minutos",
        invalido: "La duración del horario debe ser un número entero de minutos",
        minimo: { valor: 1, mensaje: "La duración del horario debe ser mayor que cero" },
        maximo: { valor: 32767, mensaje: "La duración del horario no es válida" },
      }),
    ),
    vigente_desde: z.preprocess(
      (valor) => (valor === null || (typeof valor === "string" && valor.trim() === "") ? undefined : valor),
      fechaCalendario("Ingrese la fecha de inicio", "La fecha de inicio no es válida (use AAAA-MM-DD)").optional(),
    ),
    vigente_hasta: z.preprocess(
      (valor) => (valor === null || (typeof valor === "string" && valor.trim() === "") ? undefined : valor),
      fechaCalendario("Ingrese la fecha de fin", "La fecha de fin no es válida (use AAAA-MM-DD)").optional(),
    ),
  })
  .superRefine((datos, ctx) => {
    // Solo se comparan horas bien formadas: una hora vacía o mal escrita ya tiene su propio mensaje.
    if (esHoraLima(datos.hora_inicio) && esHoraLima(datos.hora_fin) && minutos(datos.hora_fin) <= minutos(datos.hora_inicio)) {
      ctx.addIssue({
        code: "custom",
        path: ["hora_fin"],
        message: "La hora de fin debe ser posterior a la hora de inicio",
      });
    }
    // Sin fecha de inicio, la base de datos usa la de hoy en Lima: un fin anterior a hoy sería un rango invertido.
    if (!datos.vigente_desde && datos.vigente_hasta && datos.vigente_hasta < hoyLima()) {
      ctx.addIssue({
        code: "custom",
        path: ["vigente_hasta"],
        message: "La fecha de fin no puede ser anterior a hoy",
      });
    }
    if (datos.vigente_desde && datos.vigente_hasta && datos.vigente_hasta < datos.vigente_desde) {
      ctx.addIssue({
        code: "custom",
        path: ["vigente_hasta"],
        message: "La fecha de fin no puede ser anterior a la de inicio",
      });
    }
  });

export type DatosDisponibilidad = z.infer<typeof disponibilidadSchema>;

// Texto de un campo `datetime-local` (`2026-10-20T08:00`, a veces con segundos): fecha y hora escritas en Lima.
const PATRON_FECHA_HORA_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::00)?$/;

function instanteLima(requerido: string, invalido: string) {
  return z.preprocess(
    (valor) => (valor === null || valor === undefined ? "" : valor),
    z
      .string({ invalid_type_error: invalido })
      .trim()
      .min(1, requerido)
      .refine((valor) => {
        if (valor === "") return true; // ya reportado por min(1)
        const partes = PATRON_FECHA_HORA_LOCAL.exec(valor);
        return partes !== null && esFechaLima(partes[1]!) && esHoraLima(partes[2]!);
      }, invalido)
      .transform((valor) => {
        const partes = PATRON_FECHA_HORA_LOCAL.exec(valor);
        // Lo escrito a mano se interpreta como hora de Lima y se entrega como instante ISO en UTC (design.md, D8).
        return partes ? instanteDesdeLima(partes[1]!, partes[2]!).toISOString() : valor;
      }),
  );
}

export const MENSAJE_MOTIVO_BLOQUEO = "Ingrese el motivo de la ausencia";

// Bloqueo de agenda (ausencia del médico): inicio y fin escritos en Lima (`datetime-local`) y un motivo con contenido. La
// salida trae `inicio` y `fin` ya convertidos a instantes ISO en UTC. Las acciones que modifican o eliminan validan el
// identificador del bloqueo aparte.
export const bloqueoSchema = z
  .object({
    medico_id: identificador("Seleccione un médico"),
    inicio: instanteLima("Ingrese la fecha y hora de inicio", "La fecha y hora de inicio no son válidas"),
    fin: instanteLima("Ingrese la fecha y hora de fin", "La fecha y hora de fin no son válidas"),
    motivo: textoObligatorio(MENSAJE_MOTIVO_BLOQUEO),
  })
  .superRefine((datos, ctx) => {
    if (datos.inicio !== "" && datos.fin !== "" && new Date(datos.fin).getTime() <= new Date(datos.inicio).getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["fin"],
        message: "La fecha y hora de fin deben ser posteriores a las de inicio",
      });
    }
  });

export type DatosBloqueo = z.infer<typeof bloqueoSchema>;

// Identificador de un tramo de disponibilidad o de un bloqueo que se modifica o elimina. Va con el médico dueño: la
// operación solo actúa si el tramo o el bloqueo es de ese médico, y la respuesta puede calcular el efecto sobre sus citas.
export const tramoRefSchema = z.object({
  id: identificador("Seleccione un horario"),
  medico_id: identificador("Seleccione un médico"),
});

export const bloqueoRefSchema = z.object({
  id: identificador("Seleccione una ausencia"),
  medico_id: identificador("Seleccione un médico"),
});

// Al guardar, el `id` es opcional: sin él es un alta; con él, una modificación.
export const idOpcionalSchema = z.object({ id: identificadorOpcional("El identificador no es válido") });
