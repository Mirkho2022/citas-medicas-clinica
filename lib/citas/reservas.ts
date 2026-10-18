// Reservar, cancelar, reprogramar y reasignar por baja (specs/gestion-de-citas y reasignacion-por-baja-medica; design.md, D4, D5
// y D9). Las reglas viven en la base de datos: `reservar_cita()` y `reprogramar_cita()` (SECURITY INVOKER, con la RLS y los
// disparadores del rol que llama), la ventana de 1 hora en `validar_cancelacion()` y la doble reserva en las restricciones
// `EXCLUDE` de `citas`. Estas funciones validan con Zod ANTES de consultar, invocan la operación y traducen los errores con
// `traducirError`; no emiten eventos (lo hacen los casos de uso, tras el commit).
import {
  exito,
  fallo,
  falloPorValidacion,
  type CodigoError,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import { consultar, type Ejecutor } from "../db/ejecutor.ts";
import {
  citaIdSchema,
  citaNuevaSchema,
  reasignacionFilaSchema,
  reasignarPorBajaSchema,
  reprogramarCitaSchema,
} from "../schemas/cita.ts";
import { MENSAJE_CITA_NO_VIGENTE, traducirError } from "./errores.ts";

// Agenda una cita en un horario libre. `reservar_cita` fija el origen según el rol y el autor con `perfil_actual()`; la cita
// nace `reservada`. Un horario ocupado es `23P01`/`40P01` (doble reserva) y uno pasado o fuera de la agenda es `UC001`.
export async function reservarCita(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const validada = citaNuevaSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const c = validada.data;

  try {
    const filas = await consultar(ejecutar, `select public.reservar_cita($1, $2, $3, $4, $5) as id`, [
      c.paciente_id,
      c.medico_id,
      c.inicio,
      c.fin,
      c.motivo ?? null,
    ]);
    const id = filas[0]?.id;
    if (typeof id !== "string") return traducirError(new Error("reserva sin id"), "agendar");
    return exito({ id });
  } catch (error) {
    return traducirError(error, "agendar");
  }
}

// Cancela una cita vigente (`reservada` o `confirmada`) en UNA sentencia, sin función. El disparador `validar_cancelacion()`
// rechaza con `P0001` si falta menos de 1 hora (también para el administrativo) salvo que un bloqueo del médico cubra la cita,
// y fija `cancelada_en` y `cancelada_por`. Cero filas: la cita no existe, no es visible o ya no está vigente.
export async function cancelarCita(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const validada = citaIdSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);

  try {
    const filas = await consultar(
      ejecutar,
      `update public.citas set estado = 'cancelada' where id = $1 and estado in ('reservada', 'confirmada') returning id`,
      [validada.data.cita_id],
    );
    if (filas.length === 0) return fallo("CITA_NO_VIGENTE", MENSAJE_CITA_NO_VIGENTE);
    return exito({ id: validada.data.cita_id });
  } catch (error) {
    return traducirError(error, "cancelar");
  }
}

// Reprogramar: `reprogramar_cita()` cancela la original y crea la nueva (otro horario y, opcionalmente, otro médico) en una
// sola transacción; si algo falla, la original queda intacta. La nueva nace `reservada` y apunta a la original.
export async function reprogramarCita(
  ejecutar: Ejecutor,
  entrada: unknown,
): Promise<ResultadoAccion<{ id: string; citaAnteriorId: string }>> {
  const validada = reprogramarCitaSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const c = validada.data;

  try {
    const filas = await consultar(ejecutar, `select public.reprogramar_cita($1, $2, $3, $4, $5) as id`, [
      c.cita_id,
      c.medico_id,
      c.inicio,
      c.fin,
      c.motivo ?? null,
    ]);
    const id = filas[0]?.id;
    if (typeof id !== "string") return traducirError(new Error("reprogramación sin id"), "reprogramar");
    return exito({ id, citaAnteriorId: c.cita_id });
  } catch (error) {
    return traducirError(error, "reprogramar");
  }
}

// Resultado de una fila de la reasignación por baja: la cita nueva o el motivo por el que esa fila no se pudo hacer.
export type ResultadoFilaReasignacion =
  | { ok: true; citaId: string; id: string }
  | { ok: false; citaId: string | null; codigo: CodigoError; mensaje: string };

// Reasigna las citas elegidas a un médico sustituto de la misma especialidad (ADR-0011). UNA transacción por cita: la pantalla
// confirma las filas elegidas y aquí se llama a `reasignar_cita_por_baja()` una vez por cita, en orden, e informa éxito o error
// por fila (una fila fallida no deshace las demás). La función valida que el bloqueo cubra la cita, que el destino sea un médico
// activo de la misma especialidad y distinto (`UC003`) y delega en `reprogramar_cita`; la excepción de la ventana de 1 hora la
// da el bloqueo, no esta función. No existe «reasignar todo» automático: solo se ejecutan las filas que el administrativo envía.
export async function reasignarPorBaja(
  ejecutar: Ejecutor,
  entrada: unknown,
): Promise<ResultadoAccion<{ bloqueoId: string; filas: ResultadoFilaReasignacion[] }>> {
  const validada = reasignarPorBajaSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { bloqueo_id, reasignaciones } = validada.data;

  const filas: ResultadoFilaReasignacion[] = [];
  for (const fila of reasignaciones) {
    const valida = reasignacionFilaSchema.safeParse(fila);
    if (!valida.success) {
      const rechazo = falloPorValidacion(valida.error);
      const citaId = typeof (fila as { cita_id?: unknown } | null)?.cita_id === "string" ? (fila as { cita_id: string }).cita_id : null;
      filas.push({ ok: false, citaId, codigo: rechazo.codigo, mensaje: rechazo.mensaje });
      continue;
    }
    const r = valida.data;
    try {
      const resultado = await consultar(ejecutar, `select public.reasignar_cita_por_baja($1, $2, $3, $4, $5) as id`, [
        r.cita_id,
        bloqueo_id,
        r.medico_id,
        r.inicio,
        r.fin,
      ]);
      const id = resultado[0]?.id;
      if (typeof id !== "string") throw new Error("reasignación sin id");
      filas.push({ ok: true, citaId: r.cita_id, id });
    } catch (error) {
      const rechazo = traducirError(error, "reasignar");
      filas.push({ ok: false, citaId: r.cita_id, codigo: rechazo.codigo, mensaje: rechazo.mensaje });
    }
  }
  return exito({ bloqueoId: bloqueo_id, filas });
}
