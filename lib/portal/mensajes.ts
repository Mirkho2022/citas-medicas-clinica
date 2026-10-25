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
// Al confirmar una reserva (specs/busqueda-y-reserva-de-cita): la selección se conserva en la dirección y se retoma al volver.
export const MENSAJE_SESION_VENCIDA_RESERVA = "Su sesión venció. Inicie sesión de nuevo para terminar su reserva.";
export const MENSAJE_DEMASIADOS_INTENTOS = "Demasiados intentos. Espere unos minutos e intente de nuevo.";
export const MENSAJE_ANTIBOTS = "No pudimos verificar su solicitud. Intente de nuevo.";
export const MENSAJE_ERROR_INESPERADO = "No pudimos completar la operación. Intente de nuevo en unos minutos.";

// ---- Reserva ----
// La cuenta tiene el rol de paciente pero aún no una ficha vinculada: la pantalla de registro es el siguiente paso.
export const MENSAJE_FALTA_REGISTRO = "Complete su registro antes de reservar una cita.";
export const MENSAJE_SIN_MEDICOS = "Por ahora no hay médicos con horarios para reservar por el portal. Comuníquese con la clínica.";
export const MENSAJE_MEDICO_NO_DISPONIBLE = "Ese médico ya no está disponible. Elija otro médico.";
export const MENSAJE_SIN_HORARIOS_EN_EL_PERIODO = "Este médico no tiene horarios libres en los próximos 30 días. Elija otro médico.";
export const MENSAJE_SIN_HORARIOS_EN_EL_DIA = "Ya no quedan horarios libres este día. Elija otro día.";
export const MENSAJE_RESERVA_GUARDADA = "Guardamos su cita. La encontrará en «Mis citas».";
// Texto de la spec (busqueda-y-reserva-de-cita, «Horario que dejó de existir»); es el mismo de H3, `MENSAJE_HORARIO_NO_DISPONIBLE`.
export const MENSAJE_HORARIO_TOMADO = "El horario elegido ya no está disponible. Elija otro horario.";
// La guía va aparte del literal de la doble reserva (que debe mostrarse tal cual): se pinta en un elemento propio.
export const GUIA_DOBLE_RESERVA = "Elija otro horario.";

// Advertencia previa a confirmar. `horaLimite` es «HH:mm» de Lima: la última hora a la que todavía podrá cancelar por el portal.
// Es el mismo texto que muestra `SelectorHorario` (components/clinica/selector-horario.tsx).
export function advertenciaCancelacion(horaLimite: string): string {
  return `Podrá cancelar esta cita hasta 1 hora antes, a las ${horaLimite}.`;
}
export const AVISO_CITA_PROXIMA =
  "Esta cita empieza en menos de 1 hora, por lo que ya no podrá cancelarla desde el portal. Si no puede asistir, avise a la clínica. Confirme solo si desea reservarla de todos modos.";

// ---- Mis citas y cancelación ----
// Texto de la spec (mis-citas-y-cancelacion, «Pantalla abierta desde hace rato»). El portal no promete una cancelación que la
// clínica tampoco puede hacer: pide avisarle.
export const MENSAJE_CANCELACION_TARDIA =
  "Ya no es posible cancelar esta cita porque falta menos de 1 hora. Si no puede asistir, avise a la clínica.";
export const MENSAJE_CITA_NO_ENCONTRADA = "No encontramos esa cita. Revise su lista en «Mis citas».";
export const MENSAJE_CITA_YA_CANCELADA = "Esa cita ya está cancelada. Revise su lista en «Mis citas».";
// Una cita propia y visible que no está cancelada pero tampoco vigente (atendida o «No asistió»).
export const MENSAJE_CITA_NO_CANCELABLE = "Esa cita ya no se puede cancelar. Revise su lista en «Mis citas».";
export const MENSAJE_CITA_CANCELADA = "Su cita fue cancelada.";
export const MENSAJE_SIN_CITAS = "Todavía no tiene citas. Toque «Reservar cita» para agendar la primera.";
