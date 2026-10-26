// Traductor de errores de la base de datos a mensajes en español para el registro y la firma de atenciones
// (openspec/changes/historias-clinicas/design.md, D10). Es la única definición de estos mensajes. Nunca reenvía el texto de
// Postgres al cliente: traduce por SQLSTATE (`error.code`) y, solo para distinguir las reglas de H2 que comparten el SQLSTATE
// `42501`, mira el texto de la regla (que escribimos nosotros en las migraciones) para ELEGIR el mensaje, nunca para mostrarlo.
//
// El resultado es un `Fallo` de ADR-0006 con una `causa` más precisa para la pantalla (qué pintar sin comparar textos). Se
// usa un tipo propio en vez de ampliar `CodigoError` de lib/acciones/resultado.ts para no tocar un archivo compartido.
import { fallo, MENSAJE_ERROR_INTERNO, type Fallo } from "../acciones/resultado.ts";
import { sqlstateDe } from "../citas/errores.ts";

export type CausaAtencion =
  | "firmada" // la atención ya está firmada: solo admite addendas
  | "sin_acceso" // sin acceso a esa historia o a esa atención (no se distingue «ajena» de «inexistente»)
  | "no_es_autor" // un médico a cargo intentó editar o firmar el borrador de otro
  | "es_borrador" // se pidió una addenda sobre un borrador: se edita directamente
  | "diagnostico" // código inexistente en el catálogo o repetido (HC001)
  | "cita_invalida" // la cita no es de este paciente y de este médico (HC003)
  | "cita_con_atencion"; // la cita ya tiene una atención (23505)

export type FalloAtencion = Fallo & { causa?: CausaAtencion };

export const MENSAJE_DIAGNOSTICO_INVALIDO =
  "Revise los diagnósticos: hay un código que no existe en el catálogo CIE-10 o está repetido.";
export const MENSAJE_DEMOSTRACION = "Modo demostración: solo se pueden registrar datos de pacientes ficticios.";
export const MENSAJE_CITA_INVALIDA = "La cita indicada no corresponde a este paciente y a este médico.";
export const MENSAJE_CONFIGURACION = "Módulo de historias clínicas no disponible: configuración inconsistente.";
export const MENSAJE_ATENCION_FIRMADA = "Esta atención ya está firmada. Para corregirla, agregue una addenda.";
export const MENSAJE_ADDENDA_INMUTABLE = "Las addendas no se modifican ni se eliminan: registre una nueva.";
export const MENSAJE_SIN_ACCESO = "No tiene acceso a esta historia clínica.";
export const MENSAJE_NO_ES_AUTOR = "Solo el autor puede modificar o firmar este borrador.";
export const MENSAJE_ES_BORRADOR = "Esta atención aún es un borrador: edítela directamente en lugar de agregar una addenda.";
export const MENSAJE_CITA_CON_ATENCION = "Ya existe una atención registrada para esa cita.";
export const MENSAJE_CAMPOS_INVALIDOS = "Hay campos vacíos o inválidos. Revise el formulario.";
export const MENSAJE_FIRMA_NO_SOPORTADA = "No se pudo firmar la atención: método de firma no disponible.";

export const CONTEXTOS_ERROR_ATENCION = ["registrar", "actualizar", "firmar", "addenda", "abrir", "buscar_diagnostico"] as const;
export type ContextoErrorAtencion = (typeof CONTEXTOS_ERROR_ATENCION)[number];

// Información que se registra de un error inesperado: operación y SQLSTATE, nunca el texto de la excepción ni contenido clínico.
export interface ErrorInesperadoAtencion {
  contexto: ContextoErrorAtencion;
  sqlstate: string | null;
  clase: string;
}

function registrarPorDefecto(info: ErrorInesperadoAtencion): void {
  console.error(`[atención:${info.contexto}] error inesperado (sqlstate=${info.sqlstate ?? "n/a"}, clase=${info.clase})`);
}

function textoDe(error: unknown): string {
  for (let actual: unknown = error, nivel = 0; nivel < 3 && actual && typeof actual === "object"; nivel++) {
    const mensaje = (actual as { message?: unknown }).message;
    if (typeof mensaje === "string") return mensaje;
    actual = (actual as { cause?: unknown }).cause;
  }
  return "";
}

function claseDe(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function conCausa(base: Fallo, causa: CausaAtencion): FalloAtencion {
  return { ...base, causa };
}

export function traducirErrorAtencion(
  error: unknown,
  contexto: ContextoErrorAtencion,
  registrar: (info: ErrorInesperadoAtencion) => void = registrarPorDefecto,
): FalloAtencion {
  const sqlstate = sqlstateDe(error);

  switch (sqlstate) {
    case "HC001":
      return conCausa(fallo("DATOS_INVALIDOS", MENSAJE_DIAGNOSTICO_INVALIDO, { diagnosticos: MENSAJE_DIAGNOSTICO_INVALIDO }), "diagnostico");

    case "HC002":
      return fallo("NO_AUTORIZADO", MENSAJE_DEMOSTRACION);

    case "HC003":
      return conCausa(fallo("DATOS_INVALIDOS", MENSAJE_CITA_INVALIDA), "cita_invalida");

    case "HC004":
      return fallo("ERROR_INTERNO", MENSAJE_CONFIGURACION);

    // Política de RLS, privilegio de columna o regla de inmutabilidad de H2 (todas comparten 42501).
    case "42501": {
      const texto = textoDe(error);
      if (texto.includes("Atención firmada")) return conCausa(fallo("NO_AUTORIZADO", MENSAJE_ATENCION_FIRMADA), "firmada");
      if (texto.includes("addendas no se modifican")) return fallo("NO_AUTORIZADO", MENSAJE_ADDENDA_INMUTABLE);
      return conCausa(fallo("NO_AUTORIZADO", MENSAJE_SIN_ACCESO), "sin_acceso");
    }

    case "23505":
      // Con `registrar`, la única restricción única que se puede violar es la de `cita_id` (el id lo genera el servidor).
      if (contexto === "registrar") {
        return conCausa(fallo("DATOS_INVALIDOS", MENSAJE_CITA_CON_ATENCION, { cita_id: MENSAJE_CITA_CON_ATENCION }), "cita_con_atencion");
      }
      break;

    case "23514":
      return fallo("DATOS_INVALIDOS", MENSAJE_CAMPOS_INVALIDOS);
  }

  registrar({ contexto, sqlstate, clase: claseDe(error) });
  return fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO);
}
