"use server";

// Server Actions de horarios del administrativo (specs/disponibilidad-y-slots; design.md, D7). Delgadas: `auth.protect()` (lo
// exige la regla de ESLint de Clerk, en el cuerpo de cada acción) y el entorno real; la guarda de rol y MFA, la lógica de datos y
// el refresco están en `lib/citas/casos-de-uso.ts`, donde se prueban con un entorno inyectado. La autoridad real es la RLS y las
// restricciones de la base de datos. Las acciones de modificación y borrado devuelven, además, cuántas citas vigentes futuras
// quedan fuera del nuevo horario o dentro de la ausencia: no cancelan ninguna.
import { auth } from "@clerk/nextjs/server";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import {
  casoActualizarBloqueo,
  casoCrearBloqueo,
  casoEliminarBloqueo,
  casoEliminarDisponibilidad,
  casoGuardarDisponibilidad,
} from "@/lib/citas/casos-de-uso";
import type { CitasFueraDelHorario } from "@/lib/citas/disponibilidades";
import { entornoReal } from "@/lib/citas/entorno-real";

export async function guardarDisponibilidad(
  entrada: unknown,
): Promise<ResultadoAccion<{ id: string; fueraDelHorario: CitasFueraDelHorario }>> {
  await auth.protect();
  return casoGuardarDisponibilidad(entornoReal, entradaDeFormulario(entrada));
}

export async function eliminarDisponibilidad(
  entrada: unknown,
): Promise<ResultadoAccion<{ fueraDelHorario: CitasFueraDelHorario }>> {
  await auth.protect();
  return casoEliminarDisponibilidad(entornoReal, entradaDeFormulario(entrada));
}

export async function crearBloqueo(entrada: unknown): Promise<ResultadoAccion<{ id: string; citasAfectadas: number }>> {
  await auth.protect();
  return casoCrearBloqueo(entornoReal, entradaDeFormulario(entrada));
}

export async function actualizarBloqueo(entrada: unknown): Promise<ResultadoAccion<{ id: string; citasAfectadas: number }>> {
  await auth.protect();
  return casoActualizarBloqueo(entornoReal, entradaDeFormulario(entrada));
}

export async function eliminarBloqueo(entrada: unknown): Promise<ResultadoAccion<void>> {
  await auth.protect();
  return casoEliminarBloqueo(entornoReal, entradaDeFormulario(entrada));
}
