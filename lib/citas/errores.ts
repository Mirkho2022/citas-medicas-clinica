// Traductor central de errores de la base de datos a mensajes de negocio (ADR-0008; openspec/changes/agenda-y-reserva/
// design.md, D5). Es la única definición de estos mensajes: ninguna acción ni pantalla vuelve a escribirlos.
//
// Traduce por CONTEXTO de la acción y por SQLSTATE (`error.code`), no por el nombre de la restricción: así un `23P01` de
// `bloqueos_agenda` o de `disponibilidades` no se confunde con la doble reserva. Verificado en la tarea 1.4 contra el
// branch de desarrollo: el driver HTTP de Neon entrega un `NeonDbError` con `code` en TODOS los casos (violación real de
// `EXCLUDE`, `raise exception … using errcode = 'UC00x'` y `40P01`, tanto con una sentencia como dentro de
// `sql.transaction`). `constraint` solo viene cuando la base lo informa (violaciones reales de restricciones, o
// `using constraint = …` en PL/pgSQL), y NO viene en los `UC00x` ni en `40P01`; por eso aquí no se usa para decidir nada.
// `message` trae el texto de Postgres en inglés: nunca se reenvía al cliente.
import {
  fallo,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_AUTORIZADO,
  type Fallo,
} from "../acciones/resultado.ts";

// Mensaje exacto del PRD para la doble reserva. Es el único lugar donde se escribe este literal; se compara carácter a
// carácter en tests/agenda/errores.test.ts. Si se traduce o reformula, se rompe el criterio de aceptación.
export const MENSAJE_DOBLE_RESERVA = "Registro de cita ya agendado";

export const MENSAJE_CANCELACION_TARDIA = "No es posible cancelar con menos de 1 hora de anticipación";
export const MENSAJE_REPROGRAMACION_TARDIA = "No es posible reprogramar con menos de 1 hora de anticipación";
export const MENSAJE_HORARIO_NO_DISPONIBLE = "El horario elegido ya no está disponible. Elija otro horario.";
export const MENSAJE_CITA_NO_VIGENTE = "La cita ya no está vigente";
export const MENSAJE_REASIGNACION_INVALIDA = "Esta reasignación no corresponde a la baja registrada";
export const MENSAJE_DOCUMENTO_DUPLICADO = "Ya existe un paciente con ese documento";
export const MENSAJE_SOLAPE_DISPONIBILIDAD = "Este horario se cruza con otro ya definido para el médico";
export const MENSAJE_VIGENCIA_INVERTIDA = "La fecha de fin no puede ser anterior a la de inicio";
export const MENSAJE_SOLAPE_BLOQUEO = "Ya existe una ausencia registrada que se cruza con ese periodo";

// Mensaje de `UC004` según la acción que lo provocó.
export const MENSAJE_TRANSICION = {
  confirmar: "Solo se puede confirmar una cita reservada que aún no terminó",
  no_asistio: "Solo se puede marcar «No asistió» una cita confirmada cuya hora ya empezó",
  atendida: "Solo se puede marcar «Atendida» una cita confirmada cuya hora ya empezó",
} as const;

// Contexto de la acción que falló.
//  - agendar, reprogramar, reasignar: insertan una cita (23P01 y 40P01 = doble reserva).
//  - cancelar: además de reprogramar y reasignar, que cancelan la original, puede recibir P0001 (ventana de 1 hora).
//  - confirmar, no_asistio, atendida: transiciones de estado (UC004 con el mensaje propio de cada una).
//  - registrar_paciente: 23505 es documento duplicado. buscar_paciente: solo 42501 y el error inesperado.
//  - disponibilidad, bloqueo: 23P01 es solape de horarios o de ausencias.
export const CONTEXTOS_ERROR = [
  "agendar",
  "reprogramar",
  "reasignar",
  "cancelar",
  "confirmar",
  "no_asistio",
  "atendida",
  "registrar_paciente",
  "buscar_paciente",
  "disponibilidad",
  "bloqueo",
] as const;
export type ContextoError = (typeof CONTEXTOS_ERROR)[number];

// Contextos que insertan citas: los únicos donde 23P01 y 40P01 significan «doble reserva». Un 40P01 en una operación con
// varias sentencias que no inserta citas puede no ser un choque de horario (design.md, Riesgos).
const INSERTAN_CITAS: ReadonlySet<ContextoError> = new Set<ContextoError>(["agendar", "reprogramar", "reasignar"]);

// Información que se registra de un error inesperado: acción y SQLSTATE, nunca el texto de la excepción ni datos del
// paciente (design.md, D5).
export interface ErrorInesperado {
  contexto: ContextoError;
  sqlstate: string | null;
  clase: string;
}

function registrarPorDefecto(info: ErrorInesperado): void {
  console.error(
    `[acción:${info.contexto}] error inesperado (sqlstate=${info.sqlstate ?? "n/a"}, clase=${info.clase})`,
  );
}

// SQLSTATE de un error del driver (`NeonDbError.code`) o, si viene envuelto, de su `cause`. Un código que no tiene la
// forma de un SQLSTATE (5 caracteres: dígitos y mayúsculas) se ignora, p. ej. `ECONNRESET`.
export function sqlstateDe(error: unknown): string | null {
  for (let actual: unknown = error, nivel = 0; nivel < 3 && actual && typeof actual === "object"; nivel++) {
    const code = (actual as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    actual = (actual as { cause?: unknown }).cause;
  }
  return null;
}

function claseDe(error: unknown): string {
  if (error instanceof Error) return error.name;
  return typeof error;
}

// `traducirError(error, contexto)`: devuelve el `Fallo` listo para devolver desde la acción. Es pura salvo en el último
// caso (error desconocido), que lo registra con `registrar` (por defecto `console.error`, solo acción y SQLSTATE) y
// devuelve el mensaje genérico, sin texto de Postgres.
export function traducirError(
  error: unknown,
  contexto: ContextoError,
  registrar: (info: ErrorInesperado) => void = registrarPorDefecto,
): Fallo {
  const sqlstate = sqlstateDe(error);

  switch (sqlstate) {
    case "23P01":
      if (INSERTAN_CITAS.has(contexto)) return fallo("DOBLE_RESERVA", MENSAJE_DOBLE_RESERVA);
      if (contexto === "disponibilidad") return fallo("SOLAPE", MENSAJE_SOLAPE_DISPONIBILIDAD);
      if (contexto === "bloqueo") return fallo("SOLAPE", MENSAJE_SOLAPE_BLOQUEO);
      break;

    case "40P01":
      if (INSERTAN_CITAS.has(contexto)) return fallo("DOBLE_RESERVA", MENSAJE_DOBLE_RESERVA);
      break;

    // validar_cancelacion(): significa únicamente «ventana de 1 hora» (las funciones nunca usan P0001 por su cuenta).
    case "P0001":
      if (contexto === "cancelar" || contexto === "reasignar") {
        return fallo("CANCELACION_TARDIA", MENSAJE_CANCELACION_TARDIA);
      }
      if (contexto === "reprogramar") return fallo("CANCELACION_TARDIA", MENSAJE_REPROGRAMACION_TARDIA);
      break;

    case "UC001":
      return fallo("HORARIO_NO_DISPONIBLE", MENSAJE_HORARIO_NO_DISPONIBLE);

    case "UC002":
      return fallo("CITA_NO_VIGENTE", MENSAJE_CITA_NO_VIGENTE);

    case "UC003":
      return fallo("REASIGNACION_INVALIDA", MENSAJE_REASIGNACION_INVALIDA);

    case "UC004":
      if (contexto === "confirmar" || contexto === "no_asistio" || contexto === "atendida") {
        return fallo("TRANSICION_INVALIDA", MENSAJE_TRANSICION[contexto]);
      }
      break;

    // `daterange(vigente_desde, vigente_hasta)` con el fin anterior al inicio (`data_exception`): solo se llega aquí cuando la
    // fecha de inicio que se conserva (al modificar) o la de hoy (al crear) es posterior al fin que se envió.
    case "22000":
      if (contexto === "disponibilidad") {
        return fallo("DATOS_INVALIDOS", MENSAJE_VIGENCIA_INVERTIDA, { vigente_hasta: MENSAJE_VIGENCIA_INVERTIDA });
      }
      break;

    // Política de RLS o guarda de rol de una función.
    case "42501":
      return fallo("NO_AUTORIZADO", MENSAJE_NO_AUTORIZADO);

    case "23505":
      if (contexto === "registrar_paciente") return fallo("DOCUMENTO_DUPLICADO", MENSAJE_DOCUMENTO_DUPLICADO);
      break;
  }

  // Lo que no se reconoce en este contexto se trata como inesperado: se registra sin texto de la base de datos.
  registrar({ contexto, sqlstate, clase: claseDe(error) });
  return fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO);
}
