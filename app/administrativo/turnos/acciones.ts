"use server";

// Server Actions de los turnos de enfermería del administrativo (specs/turnos-de-enfermeria; design.md, D6). Delgadas:
// `auth.protect()` (lo exige la regla de ESLint de Clerk, en el cuerpo de cada acción) y el entorno real; la guarda de rol y MFA
// (`exigirPersonal('administrativo')`), la validación con Zod, la escritura y el refresco están en `lib/turnos/`, donde se prueban con
// un entorno inyectado. La autoridad real sobre los datos es la RLS de `turnos_enfermeria` y su restricción `unique`. Una acción nunca
// recibe identificadores de rol ni de perfil del cliente: el rol sale de la sesión.
import { auth } from "@clerk/nextjs/server";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { entornoReal } from "@/lib/citas/entorno-real";
import { casoActualizarTurno, casoAsignarTurno, casoQuitarTurno } from "@/lib/turnos/casos-de-uso";

export async function asignarTurno(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  await auth.protect();
  return casoAsignarTurno(entornoReal, entradaDeFormulario(entrada));
}

export async function actualizarTurno(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  await auth.protect();
  return casoActualizarTurno(entornoReal, entradaDeFormulario(entrada));
}

export async function quitarTurno(entrada: unknown): Promise<ResultadoAccion<void>> {
  await auth.protect();
  return casoQuitarTurno(entornoReal, entradaDeFormulario(entrada));
}
