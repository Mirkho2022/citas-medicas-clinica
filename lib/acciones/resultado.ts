// Resultado tipado de toda Server Action (ADR-0006; openspec/changes/agenda-y-reserva/design.md, D6).
//
// El contrato de ADR-0006, `{ ok: true, datos } | { ok: false, mensaje }`, se conserva y se amplía con dos campos que la
// interfaz necesita para decidir qué pintar sin comparar textos: `codigo` (p. ej. `DOBLE_RESERVA` pinta la alerta de error y
// refresca la lista) y `campos` (mensaje por campo inválido). Una acción nunca lanza la excepción de Postgres al cliente.
//
// Los objetos son planos y serializables: una Server Action los devuelve tal cual al componente cliente.

// Códigos de error de las acciones. La tabla de traducción desde SQLSTATE vive en `lib/citas/errores.ts` (design.md, D5).
export type CodigoError =
  | "DATOS_INVALIDOS" // Zod rechazó la entrada; `campos` trae un mensaje por campo
  | "NO_AUTORIZADO" // sin sesión, rol equivocado, sin MFA, o 42501 de la base de datos
  | "DOBLE_RESERVA" // 23P01 / 40P01 al insertar una cita: «Registro de cita ya agendado»
  | "CANCELACION_TARDIA" // P0001 de validar_cancelacion(): menos de 1 hora de anticipación
  | "HORARIO_NO_DISPONIBLE" // UC001
  | "CITA_NO_VIGENTE" // UC002
  | "REASIGNACION_INVALIDA" // UC003
  | "TRANSICION_INVALIDA" // UC004: confirmar, «No asistió» o «Atendida» fuera de las transiciones permitidas
  | "DOCUMENTO_DUPLICADO" // 23505 al registrar un paciente
  | "SOLAPE" // 23P01 en disponibilidades o bloqueos de agenda
  | "ERROR_INTERNO"; // cualquier otro: mensaje genérico, sin texto de la base de datos

export interface Exito<T> {
  ok: true;
  datos: T;
}

export interface Fallo {
  ok: false;
  mensaje: string;
  codigo: CodigoError;
  // Mensaje por campo (clave = nombre del campo del formulario). Solo en `DATOS_INVALIDOS`.
  campos?: Record<string, string>;
}

export type ResultadoAccion<T> = Exito<T> | Fallo;

// Mensajes genéricos que comparten la guarda de las acciones y el traductor de errores.
export const MENSAJE_NO_AUTORIZADO = "No tiene permiso para realizar esta operación";
export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intente nuevamente.";

export function exito(): Exito<void>;
export function exito<T>(datos: T): Exito<T>;
export function exito<T>(datos?: T): Exito<T | undefined> {
  return { ok: true, datos };
}

export function fallo(codigo: CodigoError, mensaje: string, campos?: Record<string, string>): Fallo {
  return campos === undefined ? { ok: false, mensaje, codigo } : { ok: false, mensaje, codigo, campos };
}

// Lo mínimo que se usa de un `ZodError`; así este módulo no depende de Zod.
interface ErrorDeValidacion {
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>;
}

// Convierte los problemas de Zod en un `DATOS_INVALIDOS` con un mensaje por campo (el primero de cada campo). Un problema
// sin ruta (de todo el objeto) se guarda bajo la clave `_` y también da el mensaje general.
export function falloPorValidacion(error: ErrorDeValidacion): Fallo {
  const campos: Record<string, string> = {};
  for (const problema of error.issues) {
    const clave = problema.path.length > 0 ? problema.path.join(".") : "_";
    if (!(clave in campos)) campos[clave] = problema.message;
  }
  const primero = error.issues[0]?.message ?? "Revise los datos ingresados";
  return fallo("DATOS_INVALIDOS", primero, campos);
}
