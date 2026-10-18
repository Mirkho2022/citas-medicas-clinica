// Advertencia de la ventana de cancelación que el administrativo ve ANTES de confirmar una reserva (specs/gestion-de-citas,
// «La advertencia de la ventana de cancelación se muestra antes de confirmar»; ADR-0012). Es solo presentación: la autoridad
// sigue siendo `validar_cancelacion()` en la base de datos. La hora límite es siempre la de Lima (`lib/ui/formato.ts`), no la
// del navegador. A exactamente 1 hora la cita todavía se puede cancelar (misma regla que `puedeCancelar`).
import { VENTANA_CANCELACION_MS } from "../ui/cancelacion.ts";
import { horaLimiteCancelacion, type Instante } from "../ui/formato.ts";

export interface AdvertenciaCancelacion {
  // ¿Quien agenda podrá cancelar esta cita? `false` si al agendar faltan menos de 1 hora.
  sePuedeCancelar: boolean;
  // Hora límite en Lima (`HH:mm`): 1 hora antes del inicio.
  horaLimite: string;
  texto: string;
}

export function advertenciaCancelacion(inicio: Instante, ahora: Date = new Date()): AdvertenciaCancelacion {
  const instante = inicio instanceof Date ? inicio : new Date(inicio);
  const horaLimite = horaLimiteCancelacion(instante);
  const sePuedeCancelar = instante.getTime() - ahora.getTime() >= VENTANA_CANCELACION_MS;
  return {
    sePuedeCancelar,
    horaLimite,
    texto: sePuedeCancelar
      ? `Informe al paciente: la cita solo puede cancelarse hasta 1 hora antes, a las ${horaLimite}.`
      : "Informe al paciente: esta cita no podrá cancelarse porque falta menos de 1 hora para que empiece.",
  };
}
