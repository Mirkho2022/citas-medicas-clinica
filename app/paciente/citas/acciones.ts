"use server";

// Server Action de la cancelación del portal (specs/mis-citas-y-cancelacion; design.md, D4 y D8). Delgada: la guarda del paciente, el
// entorno real y `auth.protect()`; el `UPDATE`, la traducción de rechazos y el aviso están en `lib/portal/cancelacion.ts`. La identidad
// NUNCA viene del argumento: la política de `citas` solo deja actualizar las del paciente de la sesión, y el disparador
// `validar_cancelacion()` aplica la ventana de 1 hora con el reloj del servidor, no con el del navegador.
//
// Orden deliberado, igual que en la reserva (app/paciente/citas/nueva/acciones.ts): la guarda va antes de `auth.protect()` para que una
// sesión terminada reciba el resultado tipado `SESION_VENCIDA` y no una redirección sin explicación. `exigirPaciente` ya exige sesión y
// rol de paciente; `auth.protect()` queda justo después como segunda barrera.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { exigirPacienteControlado } from "@/lib/auth/accion-paciente";
import { entornoReal } from "@/lib/citas/entorno-real";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { cancelarMiCita as cancelarCitaDelPortal } from "@/lib/portal/cancelacion";
import { REGLAS } from "@/lib/seguridad/limites";

// eslint-disable-next-line @clerk/next/require-auth-protection -- la guarda del paciente va antes, ver el comentario de arriba
export async function cancelarMiCita(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  // Sesión → límite; la cancelación no lleva anti-bots (el alcance del ADR-0026 es el registro y la reserva).
  const guarda = await exigirPacienteControlado({ regla: REGLAS.cancelacion });
  if (!guarda.ok) return guarda;
  await auth.protect();

  const resultado = await cancelarCitaDelPortal(ejecutorAutenticado, entradaDeFormulario(entrada), { emitir: entornoReal.emitir });
  // Solo si se canceló. Con un rechazo («ya no se puede», «ya estaba cancelada») NO se revalida aquí: la lista nueva ya no ofrece el botón y
  // desmontaría el diálogo antes de que la persona lea el motivo. El diálogo vuelve a leer la lista al cerrarse (`boton-cancelar.tsx`).
  if (resultado.ok) revalidatePath("/paciente", "layout");
  return resultado;
}
