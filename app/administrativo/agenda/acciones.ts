"use server";

// Server Actions de la agenda del administrativo (specs/gestion-de-citas; design.md, D7 y D13). Delgadas: `auth.protect()` (lo
// exige la regla de ESLint de Clerk, en el cuerpo de cada acción) y el entorno real; la guarda de rol y MFA, la lógica de datos
// y el refresco están en `lib/citas/casos-de-uso.ts`. La autoridad real es la RLS, las restricciones y los disparadores.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import { exigirPersonal } from "@/lib/auth/accion-personal";
import { casoConfirmarCita, casoMarcarNoAsistio, type Entorno } from "@/lib/citas/casos-de-uso";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";

const entorno: Entorno = {
  guarda: (rol) => exigirPersonal(rol),
  ejecutar: ejecutorAutenticado,
  refrescar: (rutas) => rutas.forEach((ruta) => revalidatePath(ruta)),
};

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
