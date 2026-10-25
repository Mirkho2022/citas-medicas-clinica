"use server";

// Server Action del registro del paciente (specs/registro-del-paciente; design.md, D5). Delgada: `auth.protect()` (lo exige la regla de
// ESLint de Clerk, en el cuerpo de cada acción), la guarda del paciente y el entorno real; la validación, la llamada a la función SQL y
// la traducción de errores están en `lib/portal/registro.ts`, donde se prueban con un ejecutor inyectado. La identidad NUNCA viene del
// argumento: sale de la sesión (y, dentro de la base de datos, del token que valida Neon).
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { exigirPacienteControlado } from "@/lib/auth/accion-paciente";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { registrarPacientePortal } from "@/lib/portal/registro";
import { REGLAS } from "@/lib/seguridad/limites";

export async function completarRegistro(entrada: unknown): Promise<ResultadoAccion<void>> {
  await auth.protect();
  // Sesión → límite → anti-bots (BotID); la validación y la base de datos vienen después.
  const guarda = await exigirPacienteControlado({ regla: REGLAS.registro, antibots: true });
  if (!guarda.ok) return guarda;

  const resultado = await registrarPacientePortal(ejecutorAutenticado, entradaDeFormulario(entrada));
  if (!resultado.ok) return resultado;

  revalidatePath("/paciente", "layout");
  // Fuera de cualquier try/catch: `redirect` funciona lanzando una excepción que Next captura.
  redirect("/paciente");
}
