// Bloqueos de agenda (ausencias del médico), gestionados por el administrativo (specs/disponibilidad-y-slots; design.md, D8, D9).
//
// Las fechas llegan ya como instantes ISO en UTC: `bloqueoSchema` interpreta lo escrito a mano (`datetime-local`) como hora de
// Lima. El solape de ausencias del mismo médico lo decide la restricción `EXCLUDE` (`23P01`, mensaje propio de ausencias). Todo
// cambio queda en la auditoría por el disparador `bloqueos_auditoria`, porque un bloqueo habilita la excepción de la ventana
// de cancelación (ADR-0011): por eso la modificación y el borrado actúan solo si el bloqueo es del médico indicado.
// Crear o modificar un bloqueo informa cuántas citas vigentes de ese médico caen dentro del periodo: son las que hay que
// reasignar o contactar (`/administrativo/bajas`).
import {
  exito,
  fallo,
  falloPorValidacion,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import type { Ejecutor, Sentencia } from "../db/ejecutor.ts";
import { bloqueoRefSchema, bloqueoSchema, idOpcionalSchema } from "../schemas/agenda.ts";
import { traducirError } from "./errores.ts";

export const MENSAJE_BLOQUEO_INEXISTENTE = "La ausencia ya no existe. Actualice la página.";

const RANGO = `tstzrange($1::timestamptz, $2::timestamptz, '[)')`;

// Citas vigentes (reservadas o confirmadas) del médico que se cruzan con el periodo del bloqueo.
function sentenciaCitasAfectadas(medicoId: string, inicio: string, fin: string): Sentencia {
  return {
    texto: `select count(*)::int as n from public.citas
             where medico_id = $1 and estado in ('reservada', 'confirmada')
               and rango && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    parametros: [medicoId, inicio, fin],
  };
}

const citasAfectadas = (filas: Record<string, unknown>[] | undefined): number => Number(filas?.[0]?.n ?? 0);

// Crea o modifica un bloqueo (con `id` es una modificación; el bloqueo debe ser del médico indicado).
export async function guardarBloqueo(
  ejecutar: Ejecutor,
  entrada: unknown,
): Promise<ResultadoAccion<{ id: string; citasAfectadas: number }>> {
  const validada = bloqueoSchema.safeParse(entrada);
  const identificador = idOpcionalSchema.safeParse(entrada);
  if (!validada.success || !identificador.success) {
    return falloPorValidacion({
      issues: [...(identificador.success ? [] : identificador.error.issues), ...(validada.success ? [] : validada.error.issues)],
    });
  }
  const b = validada.data;
  const id = identificador.data.id;

  try {
    if (id === undefined) {
      const [filas, afectadas] = await ejecutar([
        {
          texto: `insert into public.bloqueos_agenda (medico_id, rango, motivo)
                  values ($3, tstzrange($1::timestamptz, $2::timestamptz, '[)'), $4) returning id`,
          parametros: [b.inicio, b.fin, b.medico_id, b.motivo],
        },
        sentenciaCitasAfectadas(b.medico_id, b.inicio, b.fin),
      ]);
      const nuevo = filas?.[0]?.id;
      if (typeof nuevo !== "string") return traducirError(new Error("alta sin id"), "bloqueo");
      return exito({ id: nuevo, citasAfectadas: citasAfectadas(afectadas) });
    }

    const [modificado, afectadas] = await ejecutar([
      {
        texto: `update public.bloqueos_agenda set rango = ${RANGO}, motivo = $4
                 where id = $3 and medico_id = $5 returning id`,
        parametros: [b.inicio, b.fin, id, b.motivo, b.medico_id],
      },
      sentenciaCitasAfectadas(b.medico_id, b.inicio, b.fin),
    ]);
    if (!modificado?.length) return fallo("DATOS_INVALIDOS", MENSAJE_BLOQUEO_INEXISTENTE, { id: MENSAJE_BLOQUEO_INEXISTENTE });
    return exito({ id, citasAfectadas: citasAfectadas(afectadas) });
  } catch (error) {
    return traducirError(error, "bloqueo");
  }
}

export async function eliminarBloqueo(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAccion<void>> {
  const validada = bloqueoRefSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { id, medico_id } = validada.data;

  try {
    const [borrado] = await ejecutar([
      { texto: `delete from public.bloqueos_agenda where id = $1 and medico_id = $2 returning id`, parametros: [id, medico_id] },
    ]);
    if (!borrado?.length) return fallo("DATOS_INVALIDOS", MENSAJE_BLOQUEO_INEXISTENTE, { id: MENSAJE_BLOQUEO_INEXISTENTE });
    return exito();
  } catch (error) {
    return traducirError(error, "bloqueo");
  }
}

const comoObjeto = (entrada: unknown): Record<string, unknown> =>
  typeof entrada === "object" && entrada !== null ? (entrada as Record<string, unknown>) : {};

// Alta: nunca modifica, aunque la entrada traiga un `id`.
export function crearBloqueo(ejecutar: Ejecutor, entrada: unknown) {
  return guardarBloqueo(ejecutar, { ...comoObjeto(entrada), id: undefined });
}

// Modificación: exige el `id` del bloqueo (sin él no se convertiría en un alta).
export function actualizarBloqueo(ejecutar: Ejecutor, entrada: unknown) {
  const referencia = bloqueoRefSchema.safeParse(entrada);
  if (!referencia.success) return Promise.resolve(falloPorValidacion(referencia.error));
  return guardarBloqueo(ejecutar, entrada);
}
