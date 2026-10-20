// Cierre de las citas `reservada` que terminaron sin confirmarse (specs/gestion-de-citas; design.md, D13). Decisión del cliente
// (2026-10-20): pasan solas a `no_asistio`, y sin cron: lo dispara la aplicación cuando el personal usa el sistema.
//
// La REGLA vive en la base de datos: `cerrar_citas_vencidas()` (interna, sin EXECUTE para la aplicación) pasa a `no_asistio` toda
// `reservada` con `fin <= now()`, solo cambia `estado` y es idempotente. Esta función llama a su puerta,
// `cerrar_citas_vencidas_como_personal()`, que exige administrativo o médico (42501 al resto) y devuelve cuántas cerró.
//  - Se invoca al abrir la agenda del administrativo (y la jornada del médico, H7), ANTES de leer, para que la lista ya las muestre
//    como «No asistió». Es barata: usa `citas_estado_inicio_idx` y en régimen no encuentra nada.
//  - No emite un `EventoCita`: H5 no necesita avisar de esta transición.
//  - Quien la llama no debe fallar si el cierre falla: el resultado es un `ResultadoAccion` y nunca lanza.
import { exito, type ResultadoAccion } from "../acciones/resultado.ts";
import { consultar, type Ejecutor } from "../db/ejecutor.ts";
import { traducirError } from "./errores.ts";

export async function cerrarCitasVencidas(ejecutar: Ejecutor): Promise<ResultadoAccion<{ cerradas: number }>> {
  try {
    const filas = await consultar(ejecutar, `select public.cerrar_citas_vencidas_como_personal() as cerradas`);
    return exito({ cerradas: Number(filas[0]?.cerradas ?? 0) });
  } catch (error) {
    return traducirError(error, "cierre");
  }
}
