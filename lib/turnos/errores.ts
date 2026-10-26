// Errores de los turnos de enfermería traducidos a mensajes de negocio (ADR-0008; openspec/changes/turnos-y-dashboard/design.md, D6).
//
// Dos piezas puras:
//  - `traducirErrorTurno`: de un error de Postgres (SQLSTATE en `error.code`, nunca su texto en inglés) o de «ninguna fila afectada»
//    a un `Fallo` en español. Lo no reconocido se registra SIN texto de la base de datos ni datos de personas y devuelve el mensaje
//    genérico. Los códigos de resultado reutilizan los de `lib/acciones/resultado.ts` (SOLAPE para el choque de turnos,
//    DATOS_INVALIDOS para lo que el usuario puede corregir, NO_AUTORIZADO para la RLS): este change no amplía la lista compartida.
//  - `validarContraEstado`: con lo que la acción leyó de la base de datos en la MISMA transacción (el día de hoy en Lima y si la
//    enfermera y el médico siguen activos), da el mensaje preciso de «fecha pasada» o «personal de baja». El escritor de la acción
//    repite estas mismas condiciones dentro del INSERT/UPDATE/DELETE, de modo que lo escrito nunca contradice lo que se dice aquí;
//    esta función solo decide QUÉ mensaje dar cuando la escritura no afectó ninguna fila.
import {
  fallo,
  MENSAJE_ERROR_INTERNO,
  type Fallo,
} from "../acciones/resultado.ts";
import { sqlstateDe } from "../citas/errores.ts";
import { MENSAJE_SIN_DESTINO } from "../schemas/turno.ts";

export const MENSAJE_TURNO_DUPLICADO = "La enfermera ya tiene un turno asignado en esa fecha y franja";
export const MENSAJE_SIN_PERMISO_TURNOS = "No tiene permiso para gestionar turnos de enfermería";
export const MENSAJE_TURNO_NO_EXISTE = "El turno ya no existe. Actualice la pantalla";
export const MENSAJE_FECHA_ANTERIOR = "La fecha del turno no puede ser anterior a hoy";
export const MENSAJE_TURNO_PASADO = "Los turnos de fechas pasadas no se modifican";
export const MENSAJE_ENFERMERA_DE_BAJA = "La enfermera está dada de baja";
export const MENSAJE_MEDICO_DE_BAJA = "El médico está dado de baja";
export const MENSAJE_ENFERMERA_INEXISTENTE = "La enfermera elegida no existe. Actualice la pantalla";
export const MENSAJE_MEDICO_INEXISTENTE = "El médico elegido no existe. Actualice la pantalla";
export const MENSAJE_SERVICIO_INEXISTENTE = "El servicio elegido no existe. Actualice la pantalla";
export const MENSAJE_REFERENCIA_INEXISTENTE = "Revise la enfermera, el médico o el servicio elegidos";

// «Ninguna fila afectada»: un UPDATE o DELETE por id que no encontró el turno (otro administrativo lo quitó).
export const SIN_FILA_AFECTADA = Object.freeze({ sinFilaAfectada: true as const });

export interface ErrorInesperadoTurno {
  sqlstate: string | null;
  clase: string;
}

function registrarPorDefecto(info: ErrorInesperadoTurno): void {
  console.error(`[acción:turnos] error inesperado (sqlstate=${info.sqlstate ?? "n/a"}, clase=${info.clase})`);
}

// Qué referencia rompió un `23503` (clave foránea): el driver informa el nombre de la restricción en `constraint`
// (`turnos_enfermeria_enfermera_id_fkey`, …). Si no viene, el mensaje es el genérico.
function referenciaRota(error: unknown): Fallo {
  const restriccion = (() => {
    for (let actual: unknown = error, nivel = 0; nivel < 3 && actual && typeof actual === "object"; nivel++) {
      const valor = (actual as { constraint?: unknown }).constraint;
      if (typeof valor === "string") return valor;
      actual = (actual as { cause?: unknown }).cause;
    }
    return "";
  })();
  if (restriccion.includes("enfermera")) {
    return fallo("DATOS_INVALIDOS", MENSAJE_ENFERMERA_INEXISTENTE, { enfermera_id: MENSAJE_ENFERMERA_INEXISTENTE });
  }
  if (restriccion.includes("medico")) {
    return fallo("DATOS_INVALIDOS", MENSAJE_MEDICO_INEXISTENTE, { medico_id: MENSAJE_MEDICO_INEXISTENTE });
  }
  if (restriccion.includes("especialidad")) {
    return fallo("DATOS_INVALIDOS", MENSAJE_SERVICIO_INEXISTENTE, { especialidad_id: MENSAJE_SERVICIO_INEXISTENTE });
  }
  return fallo("DATOS_INVALIDOS", MENSAJE_REFERENCIA_INEXISTENTE);
}

export function traducirErrorTurno(
  error: unknown,
  registrar: (info: ErrorInesperadoTurno) => void = registrarPorDefecto,
): Fallo {
  if (error === SIN_FILA_AFECTADA) return fallo("DATOS_INVALIDOS", MENSAJE_TURNO_NO_EXISTE);

  const sqlstate = sqlstateDe(error);
  switch (sqlstate) {
    // unique (enfermera_id, fecha, turno): la defensa real contra el choque, también entre dos administrativos a la vez.
    case "23505":
      return fallo("SOLAPE", MENSAJE_TURNO_DUPLICADO);
    // check (medico_id is not null or especialidad_id is not null).
    case "23514":
      return fallo("DATOS_INVALIDOS", MENSAJE_SIN_DESTINO, { _: MENSAJE_SIN_DESTINO });
    case "23503":
      return referenciaRota(error);
    // Política de RLS: un rol distinto del administrativo no escribe turnos.
    case "42501":
      return fallo("NO_AUTORIZADO", MENSAJE_SIN_PERMISO_TURNOS);
  }

  registrar({ sqlstate, clase: error instanceof Error ? error.name : typeof error });
  return fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO);
}

export type OperacionTurno = "asignar" | "modificar" | "quitar";

export interface EstadoDeTurno {
  operacion: OperacionTurno;
  // `hoy_lima()`: el día de HOY en Lima según la base de datos (`YYYY-MM-DD`), no el del servidor de la aplicación.
  hoy: string;
  // Fecha del turno (`YYYY-MM-DD`): la que se asigna, o la del turno que se modifica o quita.
  fecha: string;
  // `enfermeras.activo` de la enfermera del turno: `null` si no existe o la RLS no se la muestra a quien llama.
  enfermeraActiva: boolean | null;
  // `medicos.activo` del médico elegido: `null` si no existe o no se ve; `undefined` si el turno es de un servicio (no aplica).
  medicoActivo?: boolean | null | undefined;
}

// Primer problema de fecha o de personal, o `null` si no hay ninguno. Orden: fecha, enfermera, médico. Quitar un turno solo
// depende de la fecha: una enfermera o un médico de baja es justo la razón para quitarlo o corregirlo.
export function validarContraEstado(estado: EstadoDeTurno): Fallo | null {
  const { operacion, hoy, fecha, enfermeraActiva, medicoActivo } = estado;

  // Las fechas `YYYY-MM-DD` se comparan como texto: el orden alfabético es el cronológico.
  if (fecha < hoy) {
    const mensaje = operacion === "asignar" ? MENSAJE_FECHA_ANTERIOR : MENSAJE_TURNO_PASADO;
    return fallo("DATOS_INVALIDOS", mensaje, operacion === "asignar" ? { fecha: mensaje } : undefined);
  }
  if (operacion === "quitar") return null;

  if (enfermeraActiva === null) {
    return fallo("DATOS_INVALIDOS", MENSAJE_ENFERMERA_INEXISTENTE, { enfermera_id: MENSAJE_ENFERMERA_INEXISTENTE });
  }
  if (enfermeraActiva === false) {
    return fallo("DATOS_INVALIDOS", MENSAJE_ENFERMERA_DE_BAJA, { enfermera_id: MENSAJE_ENFERMERA_DE_BAJA });
  }
  if (medicoActivo === null) {
    return fallo("DATOS_INVALIDOS", MENSAJE_MEDICO_INEXISTENTE, { medico_id: MENSAJE_MEDICO_INEXISTENTE });
  }
  if (medicoActivo === false) {
    return fallo("DATOS_INVALIDOS", MENSAJE_MEDICO_DE_BAJA, { medico_id: MENSAJE_MEDICO_DE_BAJA });
  }
  return null;
}
