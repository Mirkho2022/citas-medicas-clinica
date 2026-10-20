"use server";

// Server Action del médico sobre sus citas (specs/gestion-de-citas; design.md, D13). H7 solo conecta el botón «Atendida» de la
// jornada del médico a esta acción. Delgada: `auth.protect()` y el entorno real; la guarda `exigirPersonal('medico')` y la
// llamada a `public.marcar_cita_atendida()` están en `lib/citas/casos-de-uso.ts`. Esa función solo deja marcar una cita
// `confirmada` cuya hora ya empezó y que sea del médico que llama; una cita ajena y una inexistente dan el mismo error.
import { auth } from "@clerk/nextjs/server";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import { casoMarcarAtendida } from "@/lib/citas/casos-de-uso";
import { entornoReal as entorno } from "@/lib/citas/entorno-real";

export async function marcarAtendida(entrada: unknown): Promise<ResultadoAccion<void>> {
  await auth.protect();
  return casoMarcarAtendida(entorno, entradaDeFormulario(entrada));
}
