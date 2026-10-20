// Evento de cita: punto de extensión sin efecto (openspec/changes/agenda-y-reserva/design.md, D10; ADR-0017).
//
// Después de CONFIRMAR en la base de datos una reserva, una cancelación, una reprogramación o una reasignación por baja,
// las acciones emiten un evento con `emitirTrasCommit`. En H3 el procesamiento no hace nada: no envía correos ni inserta en
// `notificaciones` (hoy solo el rol del cron escribe esa tabla; cómo escriben las acciones es decisión de H5). H5 reemplaza
// el cuerpo de `notificarEventoCita` y no necesita tocar las acciones.
//
// Reglas del evento:
//  - solo identificadores y, en la reprogramación, el motivo (`reprogramacion` o `baja_medica`): nunca `citas.motivo` (texto
//    libre del paciente), ni diagnósticos, ni nombres. H5 lee lo que necesite con su propio rol;
//  - la reprogramación emite UN solo `cita_reprogramada` (con la cita nueva y la original), no una cancelación más una
//    reserva;
//  - confirmar, «No asistió» y «Atendida» NO emiten eventos: H5 no necesita avisar de ellas;
//  - un fallo del notificador nunca cambia el resultado de la acción (ADR-0017).

export const TIPOS_EVENTO_CITA = ["cita_reservada", "cita_cancelada", "cita_reprogramada"] as const;
export type TipoEventoCita = (typeof TIPOS_EVENTO_CITA)[number];

export const MOTIVOS_EVENTO_CITA = ["reprogramacion", "baja_medica"] as const;
export type MotivoEventoCita = (typeof MOTIVOS_EVENTO_CITA)[number];

export type EventoCita =
  // Se agendó la cita `citaId`.
  | { tipo: "cita_reservada"; citaId: string }
  // Se canceló la cita `citaId`.
  | { tipo: "cita_cancelada"; citaId: string }
  // La cita `citaAnteriorId` se reemplazó por la nueva `citaId`; `motivo` distingue una reprogramación ordinaria de la
  // reasignación por baja médica.
  | { tipo: "cita_reprogramada"; citaId: string; citaAnteriorId: string; motivo: MotivoEventoCita };

// Procesamiento del evento. En H3 no hace nada (un registro de depuración, solo en desarrollo y sin datos personales).
export async function notificarEventoCita(evento: EventoCita): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[evento-cita] ${evento.tipo} ${evento.citaId}`);
  }
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0;
}

// Reconstruye el evento con SOLO los campos permitidos, o `null` si no es un evento válido. Así, aunque una acción pase una
// fila de la base de datos o un objeto con más campos (el motivo de la cita, el paciente…), esos datos no llegan al
// notificador: el evento sale con identificadores y motivo únicamente.
export function sanearEvento(evento: unknown): EventoCita | null {
  if (typeof evento !== "object" || evento === null) return null;
  const { tipo, citaId, citaAnteriorId, motivo } = evento as Record<string, unknown>;
  if (!esTexto(citaId)) return null;

  if (tipo === "cita_reservada") return { tipo, citaId };
  if (tipo === "cita_cancelada") return { tipo, citaId };
  if (
    tipo === "cita_reprogramada" &&
    esTexto(citaAnteriorId) &&
    (MOTIVOS_EVENTO_CITA as readonly unknown[]).includes(motivo)
  ) {
    return { tipo, citaId, citaAnteriorId, motivo: motivo as MotivoEventoCita };
  }
  return null;
}

function registrarPorDefecto(clase: string): void {
  console.error(`[evento-cita] no se pudo procesar el evento (clase=${clase})`);
}

// Emite el evento DESPUÉS del commit. Nunca lanza ni cambia el resultado de la acción: si el notificador falla (o el
// evento no es válido) se registra solo la clase del error, sin su texto, y la acción sigue con su resultado de éxito.
// `notificador` y `registrar` se inyectan para probar.
export async function emitirTrasCommit(
  evento: EventoCita,
  notificador: (evento: EventoCita) => Promise<void> | void = notificarEventoCita,
  registrar: (clase: string) => void = registrarPorDefecto,
): Promise<void> {
  try {
    const limpio = sanearEvento(evento);
    if (limpio === null) {
      registrar("EventoNoValido");
      return;
    }
    await notificador(limpio);
  } catch (error) {
    try {
      registrar(error instanceof Error ? error.name : typeof error);
    } catch {
      // Registrar tampoco puede cambiar el resultado de la acción.
    }
  }
}
