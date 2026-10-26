// Esquemas Zod de la atención clínica (openspec/changes/historias-clinicas: specs/registro-de-atencion y firma-y-addendas;
// design.md, D3). Los usan el servidor (la validación de verdad: se aplica aunque el navegador se haya saltado el formulario)
// y el formulario del navegador (los mismos mensajes, antes de enviar). Segunda barrera: los CHECK y disparadores de la base de
// datos (texto_con_contenido, validar_diagnosticos). Tercera: el traductor de errores (lib/atencion/errores.ts).
//
// Reglas (D3):
//  - Texto con contenido: al menos un carácter que no sea espacio ni invisible (espacios, tabuladores, saltos de línea,
//    U+200B–U+200D, U+2060, U+FEFF y U+00AD); el CHECK de la base solo cubre el espacio en blanco, no los invisibles.
//  - Sin U+0000 (PostgreSQL no puede guardarlo), normalizado a NFC y recortado solo en los extremos.
//  - Límites iniciales: motivo 500; anamnesis, examen físico, plan y addenda 5 000; de 1 a 10 diagnósticos únicos.
//  - `.strict()`: una clave ajena (p. ej. `medico_id`, `nombres`, `firmada_en`) rechaza la solicitud. Los datos del paciente son
//    de solo lectura y el médico sale de la sesión, nunca de la entrada.
//  - Del diagnóstico el cliente envía solo `cie10` y `tipo`; la descripción la pone la base desde el catálogo.
import { z } from "zod";

export const LIMITE_MOTIVO = 500;
export const LIMITE_TEXTO_CLINICO = 5000;
export const MAXIMO_DIAGNOSTICOS = 10;

export const TIPOS_DIAGNOSTICO = ["presuntivo", "definitivo", "repetitivo"] as const;
export type TipoDiagnostico = (typeof TIPOS_DIAGNOSTICO)[number];

export const ETIQUETA_TIPO_DIAGNOSTICO: Record<TipoDiagnostico, string> = {
  presuntivo: "Presuntivo",
  definitivo: "Definitivo",
  repetitivo: "Repetitivo",
};

// Al menos un carácter que no sea espacio en blanco ni invisible de ancho cero.
const CON_CONTENIDO = /[^\s\u200B-\u200D\u2060\uFEFF\u00AD]/u;

export function tieneContenido(texto: string): boolean {
  return CON_CONTENIDO.test(texto);
}

export function tieneCaracterNulo(texto: string): boolean {
  return texto.includes("\u0000");
}

function longitud(texto: string): number {
  return Array.from(texto).length;
}

// Texto clínico obligatorio. `obligatorio` es el mensaje de «vacío»; `nombre` encabeza los demás.
function textoClinico(obligatorio: string, nombre: string, maximo: number) {
  return z
    .string({ required_error: obligatorio, invalid_type_error: obligatorio })
    .transform((texto) => texto.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .refine(tieneContenido, { message: obligatorio })
        .refine((texto) => !tieneCaracterNulo(texto), { message: `${nombre} contiene caracteres que no se pueden guardar` })
        .refine((texto) => longitud(texto) <= maximo, {
          message: `${nombre} no puede superar los ${maximo.toLocaleString("es-PE")} caracteres`,
        }),
    );
}

export const motivoConsultaSchema = textoClinico("El motivo de consulta es obligatorio", "El motivo de consulta", LIMITE_MOTIVO);
export const anamnesisSchema = textoClinico("La anamnesis es obligatoria", "La anamnesis", LIMITE_TEXTO_CLINICO);
export const examenFisicoSchema = textoClinico("El examen físico es obligatorio", "El examen físico", LIMITE_TEXTO_CLINICO);
export const planTratamientoSchema = textoClinico("El plan de tratamiento es obligatorio", "El plan de tratamiento", LIMITE_TEXTO_CLINICO);
export const textoAddendaSchema = textoClinico("El texto de la addenda es obligatorio", "La addenda", LIMITE_TEXTO_CLINICO);

const codigoCie10Schema = z
  .string({ required_error: "Elija un diagnóstico del catálogo CIE-10", invalid_type_error: "Elija un diagnóstico del catálogo CIE-10" })
  .transform((texto) => texto.normalize("NFC").trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9.]{3,10}$/, "El código CIE-10 no es válido"));

export const diagnosticoSchema = z
  .object({
    cie10: codigoCie10Schema,
    tipo: z.enum(TIPOS_DIAGNOSTICO, {
      errorMap: () => ({ message: "Elija el tipo de diagnóstico (presuntivo, definitivo o repetitivo)" }),
    }),
  })
  .strict();

const MENSAJE_SIN_DIAGNOSTICOS = "Registre al menos un diagnóstico";

const diagnosticosSchema = z
  .array(diagnosticoSchema, { required_error: MENSAJE_SIN_DIAGNOSTICOS, invalid_type_error: MENSAJE_SIN_DIAGNOSTICOS })
  .min(1, MENSAJE_SIN_DIAGNOSTICOS)
  .max(MAXIMO_DIAGNOSTICOS, `Puede registrar hasta ${MAXIMO_DIAGNOSTICOS} diagnósticos`)
  .superRefine((diagnosticos, contexto) => {
    const vistos = new Set<string>();
    diagnosticos.forEach((diagnostico, indice) => {
      if (vistos.has(diagnostico.cie10)) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: [indice, "cie10"],
          message: `El diagnóstico ${diagnostico.cie10} está repetido`,
        });
      }
      vistos.add(diagnostico.cie10);
    });
  });

const idSchema = (mensaje: string) => z.string({ required_error: mensaje, invalid_type_error: mensaje }).uuid(mensaje);

// La cita vinculada es opcional: ausente, nula o vacía (campo de formulario sin rellenar) = sin cita.
const citaOpcionalSchema = z
  .union([z.string().uuid("La cita indicada no es válida"), z.literal(""), z.null()])
  .optional()
  .transform((valor) => (valor ? valor : null));

const contenidoClinico = {
  motivo_consulta: motivoConsultaSchema,
  anamnesis: anamnesisSchema,
  examen_fisico: examenFisicoSchema,
  diagnosticos: diagnosticosSchema,
  plan_tratamiento: planTratamientoSchema,
};

// Atención nueva. `firmar` guarda y firma en una sola operación; si firmar falla, no se guarda nada.
export const atencionNuevaSchema = z
  .object({
    paciente_id: idSchema("El paciente no es válido"),
    cita_id: citaOpcionalSchema,
    ...contenidoClinico,
    firmar: z.boolean().optional().default(false),
  })
  .strict();

// Edición del borrador por su autor: el mismo contenido, sin paciente, cita ni autor (no se pueden cambiar).
export const borradorSchema = z
  .object({
    atencion_id: idSchema("La atención no es válida"),
    ...contenidoClinico,
    firmar: z.boolean().optional().default(false),
  })
  .strict();

export const firmarAtencionSchema = z.object({ atencion_id: idSchema("La atención no es válida") }).strict();

export const addendaSchema = z
  .object({
    atencion_id: idSchema("La atención no es válida"),
    texto: textoAddendaSchema,
  })
  .strict();

export type AtencionNueva = z.infer<typeof atencionNuevaSchema>;
export type EdicionBorrador = z.infer<typeof borradorSchema>;
export type DiagnosticoEntrada = z.infer<typeof diagnosticoSchema>;

// Lo que el formulario del navegador valida y envía (la entrada del esquema, sin paciente ni cita: los pone la página).
export const formularioAtencionSchema = z.object(contenidoClinico);
export type ContenidoAtencion = z.input<typeof formularioAtencionSchema>;
