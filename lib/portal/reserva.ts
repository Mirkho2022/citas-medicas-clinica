// Reserva de una cita desde el portal (openspec/changes/portal-del-paciente/specs/busqueda-y-reserva-de-cita; design.md, D7 y D8).
// Recibe un `Ejecutor` (lib/db/ejecutor.ts) para poder probarse sin Clerk y sin red.
//
// El paciente NUNCA viene del envío: sale de `public.paciente_actual()` dentro de la base de datos, y la política de `citas` fuerza
// además el paciente de la sesión y el origen `portal`. El fin del horario tampoco viene del cliente: se busca en
// `slots_disponibles()` por el instante de inicio recibido. La reserva misma es `reservar_cita()` (H3, vía `lib/citas/reservas.ts`);
// aquí no se reimplementa lógica de agenda.
import { exito, fallo, falloPorValidacion, type ResultadoAccion } from "../acciones/resultado.ts";
import { MENSAJE_DOBLE_RESERVA, traducirError } from "../citas/errores.ts";
import { reservarCita } from "../citas/reservas.ts";
import { consultar, type Ejecutor } from "../db/ejecutor.ts";
import { reservaPortalSchema } from "../schemas/reserva-portal.ts";
import { citaVigenteDelPacienteEn, horarioLibre } from "./consultas.ts";
import { MENSAJE_FALTA_REGISTRO, MENSAJE_HORARIO_TOMADO, MENSAJE_SESION_VENCIDA_RESERVA } from "./mensajes.ts";
import { esSesionVencida } from "./sesion.ts";

// Lo único que el portal le dice al notificador de eventos de cita (lib/notificaciones, H5): solo identificadores.
export interface EventoReservaPortal {
  tipo: "cita_reservada";
  citaId: string;
}

export interface DependenciasReserva {
  // Se llama DESPUÉS de confirmar la reserva y nunca cambia su resultado (ADR-0017).
  emitir?: (evento: EventoReservaPortal) => Promise<void> | void;
}

async function emitirSinFallar(dependencias: DependenciasReserva, citaId: string): Promise<void> {
  try {
    await dependencias.emitir?.({ tipo: "cita_reservada", citaId });
  } catch {
    // Un fallo del notificador nunca cambia el resultado de una reserva ya confirmada.
  }
}

export interface ReservaConfirmada {
  id: string;
}

// Reserva con el médico y el instante de inicio elegidos. Casos:
//  - horario libre → se crea la cita (`reservada`, origen `portal`, a nombre del paciente de la sesión);
//  - el propio paciente ya tiene una cita vigente con ese médico a esa hora (doble clic, reintento) → éxito con ESA cita, sin error;
//  - el horario ya no existe (bloqueo reciente, ya pasó) → `HORARIO_NO_DISPONIBLE` sin intentar el `INSERT`;
//  - otra persona se llevó el horario antes → `DOBLE_RESERVA` con el literal exacto del PRD.
export async function reservarCitaPortal(
  ejecutar: Ejecutor,
  entrada: unknown,
  dependencias: DependenciasReserva = {},
): Promise<ResultadoAccion<ReservaConfirmada>> {
  const validada = reservaPortalSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { medico_id: medicoId, inicio } = validada.data;

  try {
    const filas = await consultar(ejecutar, `select public.paciente_actual() as id`);
    const pacienteId = filas[0]?.id;
    if (typeof pacienteId !== "string") return fallo("NO_AUTORIZADO", MENSAJE_FALTA_REGISTRO);

    // ¿Es un reintento de la misma reserva? Se mira primero: una vez creada la cita, su horario ya no figura entre los libres.
    const repetida = await citaVigenteDelPacienteEn(ejecutar, medicoId, inicio);
    if (repetida) return exito({ id: repetida });

    const horario = await horarioLibre(ejecutar, medicoId, inicio);
    if (!horario) return fallo("HORARIO_NO_DISPONIBLE", MENSAJE_HORARIO_TOMADO);

    const reserva = await reservarCita(ejecutar, {
      paciente_id: pacienteId,
      medico_id: medicoId,
      inicio: horario.inicio,
      fin: horario.fin,
    });

    if (reserva.ok) {
      await emitirSinFallar(dependencias, reserva.datos.id);
      return exito({ id: reserva.datos.id });
    }
    if (reserva.codigo === "DOBLE_RESERVA") {
      // Dos envíos seguidos del mismo paciente chocan entre sí: si la cita ganadora es suya, es el mismo resultado y no un error.
      const ganadora = await citaVigenteDelPacienteEn(ejecutar, medicoId, inicio);
      if (ganadora) return exito({ id: ganadora });
      // Texto exacto del PRD, sin reformular; la guía «Elija otro horario» la pone la pantalla en un elemento aparte.
      return fallo("DOBLE_RESERVA", MENSAJE_DOBLE_RESERVA);
    }
    return reserva;
  } catch (error) {
    if (esSesionVencida(error)) return fallo("SESION_VENCIDA", MENSAJE_SESION_VENCIDA_RESERVA);
    return traducirError(error, "agendar");
  }
}
