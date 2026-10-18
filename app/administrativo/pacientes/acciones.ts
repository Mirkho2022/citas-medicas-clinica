"use server";

// Server Actions de pacientes del administrativo (specs/identificacion-de-pacientes; design.md, D7). Delgadas: guarda de rol
// y MFA → lógica de `lib/citas/pacientes.ts` (Zod, consulta con la identidad del usuario, traducción de errores) →
// `revalidatePath`. La autoridad real sobre los datos es la RLS de la base de datos. `auth.protect()` va primero en cada
// acción (lo exige la regla de ESLint de Clerk): sin sesión corta la llamada; el rol y el MFA los devuelve `exigirPersonal`
// como un resultado tipado.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { exigirPersonal } from "@/lib/auth/accion-personal";
import {
  buscarPacientes as buscar,
  registrarPaciente as registrar,
  type PacienteEncontrado,
} from "@/lib/citas/pacientes";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";

export async function buscarPacientes(entrada: unknown): Promise<ResultadoAccion<PacienteEncontrado[]>> {
  await auth.protect();
  const guarda = await exigirPersonal("administrativo");
  if (!guarda.ok) return guarda;
  return buscar(ejecutorAutenticado, entradaDeFormulario(entrada));
}

export async function registrarPaciente(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  await auth.protect();
  const guarda = await exigirPersonal("administrativo");
  if (!guarda.ok) return guarda;
  const resultado = await registrar(ejecutorAutenticado, entradaDeFormulario(entrada));
  if (resultado.ok) revalidatePath("/administrativo/pacientes");
  return resultado;
}
