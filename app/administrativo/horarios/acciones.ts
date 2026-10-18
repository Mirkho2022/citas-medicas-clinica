"use server";

// Server Actions de horarios del administrativo (specs/disponibilidad-y-slots; design.md, D7). Delgadas: `auth.protect()` (lo
// exige la regla de ESLint de Clerk) → `exigirPersonal('administrativo')` → lógica de `lib/citas` (Zod, consulta con la
// identidad del usuario, traducción de errores) → `revalidatePath`. La autoridad real es la RLS y las restricciones de la base
// de datos. Las acciones de modificación y borrado devuelven, además, cuántas citas vigentes futuras quedan fuera del nuevo
// horario o dentro de la ausencia: no cancelan ninguna.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { exigirPersonal } from "@/lib/auth/accion-personal";
import {
  actualizarBloqueo as actualizar,
  crearBloqueo as crear,
  eliminarBloqueo as eliminarAusencia,
} from "@/lib/citas/bloqueos";
import {
  eliminarDisponibilidad as eliminarTramo,
  guardarDisponibilidad as guardarTramo,
  type CitasFueraDelHorario,
} from "@/lib/citas/disponibilidades";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";

function refrescar(entrada: unknown): void {
  revalidatePath("/administrativo/horarios");
  const medico = typeof entrada === "object" && entrada !== null ? (entrada as { medico_id?: unknown }).medico_id : undefined;
  if (typeof medico === "string" && medico !== "") revalidatePath(`/administrativo/horarios/${medico}`);
  revalidatePath("/administrativo/agenda");
}

// Guarda de rol y MFA, la operación y el refresco de las pantallas si salió bien. Cada acción llama antes a
// `auth.protect()` en su propio cuerpo: la regla de ESLint de Clerk lo exige ahí y no lo acepta dentro de un ayudante.
async function comoAdministrativo<T>(
  entrada: unknown,
  operacion: (datos: unknown) => Promise<ResultadoAccion<T>>,
): Promise<ResultadoAccion<T>> {
  const guarda = await exigirPersonal("administrativo");
  if (!guarda.ok) return guarda;
  const datos = entradaDeFormulario(entrada);
  const resultado = await operacion(datos);
  if (resultado.ok) refrescar(datos);
  return resultado;
}

export async function guardarDisponibilidad(
  entrada: unknown,
): Promise<ResultadoAccion<{ id: string; fueraDelHorario: CitasFueraDelHorario }>> {
  await auth.protect();
  return comoAdministrativo(entrada, (datos) => guardarTramo(ejecutorAutenticado, datos));
}

export async function eliminarDisponibilidad(
  entrada: unknown,
): Promise<ResultadoAccion<{ fueraDelHorario: CitasFueraDelHorario }>> {
  await auth.protect();
  return comoAdministrativo(entrada, (datos) => eliminarTramo(ejecutorAutenticado, datos));
}

export async function crearBloqueo(entrada: unknown): Promise<ResultadoAccion<{ id: string; citasAfectadas: number }>> {
  await auth.protect();
  return comoAdministrativo(entrada, (datos) => crear(ejecutorAutenticado, datos));
}

export async function actualizarBloqueo(entrada: unknown): Promise<ResultadoAccion<{ id: string; citasAfectadas: number }>> {
  await auth.protect();
  return comoAdministrativo(entrada, (datos) => actualizar(ejecutorAutenticado, datos));
}

export async function eliminarBloqueo(entrada: unknown): Promise<ResultadoAccion<void>> {
  await auth.protect();
  return comoAdministrativo(entrada, (datos) => eliminarAusencia(ejecutorAutenticado, datos));
}
