// Cancelación de una cita propia desde el portal (openspec/changes/portal-del-paciente/specs/mis-citas-y-cancelacion; design.md, D4 y
// D8). Recibe un `Ejecutor` (lib/db/ejecutor.ts) para poder probarse sin Clerk y sin red.
//
// Cancelar es UN solo `UPDATE … SET estado = 'cancelada'` bajo la identidad del paciente (`cancelarCita` de H3): la política
// «paciente cancela su cita», el disparador de columnas y `validar_cancelacion()` (ventana de 1 hora, con el reloj del servidor) son
// quienes deciden. Este módulo solo traduce los rechazos a los textos del portal, en usted y sin revelar nada de citas ajenas.
import { exito, fallo, type ResultadoAccion } from "../acciones/resultado.ts";
import { traducirError } from "../citas/errores.ts";
import { cancelarCita } from "../citas/reservas.ts";
import type { Ejecutor } from "../db/ejecutor.ts";
import { citaIdSchema } from "../schemas/cita.ts";
import { estadoDeCitaPropia } from "./consultas.ts";
import {
  MENSAJE_CANCELACION_TARDIA,
  MENSAJE_CITA_NO_CANCELABLE,
  MENSAJE_CITA_NO_ENCONTRADA,
  MENSAJE_CITA_YA_CANCELADA,
  MENSAJE_SESION_VENCIDA,
} from "./mensajes.ts";
import { esSesionVencida } from "./sesion.ts";

// Lo único que el portal le dice al notificador de eventos de cita (lib/notificaciones, H5): solo identificadores.
export interface EventoCancelacionPortal {
  tipo: "cita_cancelada";
  citaId: string;
}

export interface DependenciasCancelacion {
  // Se llama DESPUÉS de confirmar la cancelación y nunca cambia su resultado (ADR-0017).
  emitir?: (evento: EventoCancelacionPortal) => Promise<void> | void;
}

async function emitirSinFallar(dependencias: DependenciasCancelacion, citaId: string): Promise<void> {
  try {
    await dependencias.emitir?.({ tipo: "cita_cancelada", citaId });
  } catch {
    // Un fallo del notificador nunca cambia el resultado de una cancelación ya confirmada.
  }
}

const noEncontrada = () => fallo("CITA_NO_VIGENTE", MENSAJE_CITA_NO_ENCONTRADA);

export async function cancelarMiCita(
  ejecutar: Ejecutor,
  entrada: unknown,
  dependencias: DependenciasCancelacion = {},
): Promise<ResultadoAccion<{ id: string }>> {
  // Un identificador que ni siquiera es un `uuid` se trata como una cita que no existe: el mismo mensaje que para una ajena.
  const validada = citaIdSchema.safeParse(entrada);
  if (!validada.success) return noEncontrada();
  const citaId = validada.data.cita_id;

  try {
    const cancelada = await cancelarCita(ejecutar, { cita_id: citaId });
    if (cancelada.ok) {
      await emitirSinFallar(dependencias, citaId);
      return exito({ id: citaId });
    }
    if (cancelada.codigo === "CANCELACION_TARDIA") return fallo("CANCELACION_TARDIA", MENSAJE_CANCELACION_TARDIA);
    if (cancelada.codigo !== "CITA_NO_VIGENTE") return cancelada;

    // Cero filas: la cita es ajena, no existe o ya no está vigente. La RLS decide qué ve el paciente: si no la ve, ajena e
    // inexistente son indistinguibles; si la ve, se le dice por qué no se pudo (típicamente, un doble envío).
    const estado = await estadoDeCitaPropia(ejecutar, citaId);
    if (estado === null) return noEncontrada();
    if (estado === "cancelada") return fallo("CITA_NO_VIGENTE", MENSAJE_CITA_YA_CANCELADA);
    return fallo("CITA_NO_VIGENTE", MENSAJE_CITA_NO_CANCELABLE);
  } catch (error) {
    if (esSesionVencida(error)) return fallo("SESION_VENCIDA", MENSAJE_SESION_VENCIDA);
    return traducirError(error, "cancelar");
  }
}
