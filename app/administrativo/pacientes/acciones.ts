"use server";

// Server Actions de pacientes del administrativo (specs/identificacion-de-pacientes; design.md, D7). Delgadas: `auth.protect()` (lo
// exige la regla de ESLint de Clerk, en el cuerpo de cada acción) y el entorno real; la guarda de rol y MFA, la lógica de datos
// (Zod, consulta con la identidad del usuario, traducción de errores) y el refresco están en `lib/citas/casos-de-uso.ts`, donde se
// prueban con un entorno inyectado. La autoridad real sobre los datos es la RLS de la base de datos.
import { auth } from "@clerk/nextjs/server";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { casoBuscarPacientes, casoRegistrarPaciente } from "@/lib/citas/casos-de-uso";
import { entornoReal } from "@/lib/citas/entorno-real";
import type { PacienteEncontrado } from "@/lib/citas/pacientes";

export async function buscarPacientes(entrada: unknown): Promise<ResultadoAccion<PacienteEncontrado[]>> {
  await auth.protect();
  return casoBuscarPacientes(entornoReal, entradaDeFormulario(entrada));
}

export async function registrarPaciente(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  await auth.protect();
  return casoRegistrarPaciente(entornoReal, entradaDeFormulario(entrada));
}
