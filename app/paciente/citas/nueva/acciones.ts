"use server";

// Server Action de la reserva del portal (specs/busqueda-y-reserva-de-cita; design.md, D5, D7 y D8). Delgada: la guarda del paciente, el
// entorno real y `auth.protect()`; la validación, la búsqueda del horario y la llamada a `reservar_cita()` están en
// `lib/portal/reserva.ts`, donde se prueban con un ejecutor inyectado. La identidad NUNCA viene del argumento: sale de la sesión y,
// dentro de la base de datos, de `paciente_actual()`.
//
// Orden deliberado: la guarda (`exigirPaciente`) va ANTES de `auth.protect()`. `auth.protect()` redirige a quien no tiene sesión, y la spec
// pide que el paciente con la sesión vencida reciba «Su sesión venció. Inicie sesión de nuevo para terminar su reserva.» con la selección
// intacta, no una redirección que le haga perder el mensaje. `exigirPaciente` ya exige sesión Y rol de paciente (devuelve el resultado
// tipado en vez de lanzar), y `auth.protect()` sigue justo después como segunda barrera. Por eso la excepción puntual a la regla de ESLint
// de Clerk, que pide `auth.protect()` en la primera línea.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import { fallo, type ResultadoAccion } from "@/lib/acciones/resultado";
import { exigirPacienteControlado } from "@/lib/auth/accion-paciente";
import { entornoReal } from "@/lib/citas/entorno-real";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { MENSAJE_SESION_VENCIDA_RESERVA } from "@/lib/portal/mensajes";
import { reservarCitaPortal } from "@/lib/portal/reserva";
import { REGLAS } from "@/lib/seguridad/limites";

// eslint-disable-next-line @clerk/next/require-auth-protection -- la guarda del paciente va antes, ver el comentario de arriba
export async function reservarCitaDelPortal(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  // Sesión → límite → anti-bots (BotID); la validación y la base de datos vienen después.
  const guarda = await exigirPacienteControlado({ regla: REGLAS.reserva, antibots: true });
  if (!guarda.ok) {
    return guarda.codigo === "SESION_VENCIDA" ? fallo("SESION_VENCIDA", MENSAJE_SESION_VENCIDA_RESERVA) : guarda;
  }
  await auth.protect();

  const resultado = await reservarCitaPortal(ejecutorAutenticado, entradaDeFormulario(entrada), { emitir: entornoReal.emitir });
  if (resultado.ok) revalidatePath("/paciente", "layout");
  return resultado;
}
