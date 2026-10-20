"use server";

// Server Actions de la agenda del administrativo (specs/gestion-de-citas; design.md, D7 y D13). Delgadas: `auth.protect()` (lo
// exige la regla de ESLint de Clerk, en el cuerpo de cada acción) y el entorno real; la guarda de rol y MFA, la lógica de datos
// y el refresco están en `lib/citas/casos-de-uso.ts`. La autoridad real es la RLS, las restricciones y los disparadores.
import { auth } from "@clerk/nextjs/server";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import {
  casoCancelarCita,
  casoConfirmarCita,
  casoMarcarNoAsistio,
  casoReasignarPorBaja,
  casoReprogramarCita,
  casoReservarCita,
} from "@/lib/citas/casos-de-uso";
import { entornoReal as entorno } from "@/lib/citas/entorno-real";
import type { ResultadoFilaReasignacion } from "@/lib/citas/reservas";

// `reservada → confirmada`. Confirmar concede al médico acceso a la historia del paciente (ADR-0016).
export async function confirmarCita(entrada: unknown): Promise<ResultadoAccion<{ estado: "confirmada" | "no_asistio" }>> {
  await auth.protect();
  return casoConfirmarCita(entorno, entradaDeFormulario(entrada));
}

// `confirmada → no_asistio`, cuando la hora de la cita ya empezó.
export async function marcarNoAsistio(entrada: unknown): Promise<ResultadoAccion<{ estado: "confirmada" | "no_asistio" }>> {
  await auth.protect();
  return casoMarcarNoAsistio(entorno, entradaDeFormulario(entrada));
}

// Agendar una cita en un horario libre (único punto de reserva: `public.reservar_cita()`). Emite `cita_reservada` tras el commit.
export async function reservarCita(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  await auth.protect();
  return casoReservarCita(entorno, entradaDeFormulario(entrada));
}

// Cancelar respeta la ventana de 1 hora para todos los roles; la confirmación explícita la pide la pantalla.
export async function cancelarCita(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  await auth.protect();
  return casoCancelarCita(entorno, entradaDeFormulario(entrada));
}

// Reprogramar: cancela la original y crea la nueva en una transacción; emite UN solo `cita_reprogramada`.
export async function reprogramarCita(entrada: unknown): Promise<ResultadoAccion<{ id: string; citaAnteriorId: string }>> {
  await auth.protect();
  return casoReprogramarCita(entorno, entradaDeFormulario(entrada));
}

// Reasignar por baja médica: una transacción por cita elegida y un resultado por fila.
export async function reasignarPorBaja(
  entrada: unknown,
): Promise<ResultadoAccion<{ bloqueoId: string; filas: ResultadoFilaReasignacion[] }>> {
  await auth.protect();
  return casoReasignarPorBaja(entorno, entradaDeFormulario(entrada));
}
