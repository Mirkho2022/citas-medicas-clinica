// Todos los textos del portal del paciente, en un solo sitio (openspec/changes/portal-del-paciente/design.md, D5): así el trato
// de «usted», la claridad de cada error y el texto exacto de la doble reserva se prueban juntos (tests/portal/mensajes.test.ts).
//
// Reglas de redacción: trato de usted; un error dice qué pasó y qué hacer (nunca un código ni el texto de la base de datos); sin
// jerga. El portal lo usan adultos mayores sin ayuda, así que cada frase es corta y se entiende sola.
import { MENSAJE_DOBLE_RESERVA } from "../citas/errores.ts";

// Literal exacto del PRD; se reexporta para que el portal no escriba el suyo.
export { MENSAJE_DOBLE_RESERVA };

// ---- Registro ----
export const MENSAJE_REGISTRO_RECHAZADO =
  "No pudimos completar su registro con estos datos. Si ya se atendió en la clínica, comuníquese con ella para que revisen su ficha.";
export const MENSAJE_CUENTA_YA_REGISTRADA = "Su cuenta ya está registrada. Vaya a su inicio para reservar una cita.";
export const MENSAJE_SESION_NO_CONFIRMADA = "No pudimos confirmar su sesión. Cierre sesión e ingrese de nuevo.";
export const MENSAJE_REVISAR_DOCUMENTO = "Revise el número de documento.";
export const MENSAJE_PREPARANDO_CUENTA = "Estamos preparando su cuenta…";
export const MENSAJE_CUENTA_TARDA = "Su cuenta está tardando más de lo normal. Toque «Reintentar»; si el problema sigue, comuníquese con la clínica.";

// ---- Sesión y límites ----
export const MENSAJE_SESION_VENCIDA = "Su sesión venció. Ingrese de nuevo para continuar.";
export const MENSAJE_DEMASIADOS_INTENTOS = "Demasiados intentos. Espere unos minutos e intente de nuevo.";
export const MENSAJE_ANTIBOTS = "No pudimos verificar su solicitud. Intente de nuevo.";
export const MENSAJE_ERROR_INESPERADO = "No pudimos completar la operación. Intente de nuevo en unos minutos.";

// ---- Reserva ----
export const MENSAJE_HORARIO_TOMADO = "Ese horario ya no está disponible. Elija otro horario.";
// La guía va aparte del literal de la doble reserva (que debe mostrarse tal cual): se pinta en un elemento propio.
export const GUIA_DOBLE_RESERVA = "Elija otro horario.";

// Advertencia previa a confirmar. `horaLimite` es «HH:mm» de Lima: la última hora a la que todavía podrá cancelar por el portal.
export function advertenciaCancelacion(horaLimite: string): string {
  return `Podrá cancelar esta cita por el portal hasta las ${horaLimite} (1 hora antes). Después, comuníquese con la clínica.`;
}
export const AVISO_CITA_PROXIMA =
  "Esta cita es en menos de 1 hora, por lo que ya no podrá cancelarla por el portal. Si no puede asistir, comuníquese con la clínica.";

// ---- Mis citas y cancelación ----
export const MENSAJE_CANCELACION_TARDIA = "Ya no se puede cancelar por el portal. Comuníquese con la clínica.";
export const MENSAJE_CITA_NO_ENCONTRADA = "No encontramos esa cita. Revise su lista en «Mis citas».";
export const MENSAJE_CITA_YA_CANCELADA = "Esa cita ya está cancelada. Revise su lista en «Mis citas».";
export const MENSAJE_CITA_CANCELADA = "Su cita fue cancelada.";
export const MENSAJE_SIN_CITAS = "Aún no tiene citas. Toque «Reservar cita» para agendar la primera.";
