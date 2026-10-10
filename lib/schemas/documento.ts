// Documento de identidad peruano: DNI o Carné de Extranjería (openspec/changes/agenda-y-reserva/specs/
// identificacion-de-pacientes). Se valida en el servidor, antes de consultar la base de datos, según el tipo. La base de
// datos conserva su propia validación de formato (`pacientes_documento_formato`) como segunda barrera.
//
//  - DNI: exactamente 8 dígitos.
//  - Carné de Extranjería: de 9 a 12 caracteres alfanuméricos. Los espacios al inicio y al final se descartan y las letras
//    se normalizan a mayúsculas (la unicidad de la base distingue mayúsculas, así que se guarda siempre normalizado).
//  - Un número de 8 dígitos solo es válido como DNI: como Carné de Extranjería tiene menos de 9 caracteres.
import { z } from "zod";
import { opcionDeLista } from "./comun.ts";

export const TIPOS_DOCUMENTO = ["DNI", "CE"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const MENSAJE_DNI = "El DNI debe tener 8 dígitos";
export const MENSAJE_CE = "El Carné de Extranjería debe tener entre 9 y 12 caracteres, solo letras y números";
export const MENSAJE_TIPO_DOCUMENTO = "Seleccione el tipo de documento";

const PATRON_DNI = /^[0-9]{8}$/;
const PATRON_CE = /^[A-Z0-9]{9,12}$/;

export function mensajeDocumento(tipo: TipoDocumento): string {
  return tipo === "DNI" ? MENSAJE_DNI : MENSAJE_CE;
}

// Número normalizado (sin espacios en los extremos y, para el Carné de Extranjería, en mayúsculas) o `null` si no cumple el
// formato de su tipo.
export function normalizarDocumento(tipo: TipoDocumento, numero: string): string | null {
  const limpio = numero.trim();
  if (tipo === "DNI") return PATRON_DNI.test(limpio) ? limpio : null;
  const mayusculas = limpio.toUpperCase();
  return PATRON_CE.test(mayusculas) ? mayusculas : null;
}

// Campos del documento, para incluirlos en el esquema de otro formulario (p. ej. el paciente). Con `validarDocumento`
// en su `superRefine` y `normalizarCampoDocumento` en su `transform`, o directamente con `documentoSchema`.
export const camposDocumento = {
  tipo_documento: opcionDeLista(TIPOS_DOCUMENTO, MENSAJE_TIPO_DOCUMENTO),
  numero_documento: z.preprocess(
    (valor) => (valor === null || valor === undefined ? "" : valor),
    z.string({ invalid_type_error: "Ingrese el número de documento" }),
  ),
};

interface DatosDocumento {
  tipo_documento: TipoDocumento;
  numero_documento: string;
}

// `superRefine` del documento: el mensaje de error dice qué formato se espera y cuelga de `numero_documento`. Si el tipo no
// es válido (ya reportado en su propio campo) no se puede saber qué formato aplicar y no se agrega nada.
export function validarDocumento(datos: DatosDocumento, ctx: z.RefinementCtx): void {
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(datos.tipo_documento)) return;
  if (normalizarDocumento(datos.tipo_documento, datos.numero_documento) === null) {
    // También para un número vacío: el mensaje dice qué formato se espera.
    ctx.addIssue({ code: "custom", path: ["numero_documento"], message: mensajeDocumento(datos.tipo_documento) });
  }
}

// Devuelve los datos con el número normalizado. Solo se llama con datos ya validados.
export function normalizarCampoDocumento<T extends DatosDocumento>(datos: T): T {
  const numero = normalizarDocumento(datos.tipo_documento, datos.numero_documento);
  return { ...datos, numero_documento: numero ?? datos.numero_documento };
}

export const documentoSchema = z
  .object(camposDocumento)
  .superRefine(validarDocumento)
  .transform(normalizarCampoDocumento);

export type Documento = z.infer<typeof documentoSchema>;
