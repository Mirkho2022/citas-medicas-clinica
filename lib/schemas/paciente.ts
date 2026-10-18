// Registro de un paciente por el administrativo (specs/identificacion-de-pacientes). No pide ni muestra datos clínicos.
// Obligatorios: nombres, apellidos, documento (DNI o Carné de Extranjería), fecha de nacimiento (no futura), sexo (M, F o X)
// y correo electrónico válido. Opcionales: teléfono y dirección. Cada campo inválido lleva su propio mensaje.
import { z } from "zod";
import { hoyLima } from "../fechas/lima.ts";
import { fechaCalendario, opcionDeLista, textoObligatorio, textoOpcional } from "./comun.ts";
import { camposDocumento, normalizarCampoDocumento, validarDocumento } from "./documento.ts";

export const SEXOS = ["M", "F", "X"] as const;
export type Sexo = (typeof SEXOS)[number];

export const MENSAJE_FECHA_NACIMIENTO_FUTURA = "La fecha de nacimiento no puede ser futura";

// `ahora` se inyecta para probar el límite de «no futura» sin depender del reloj; por defecto, el instante actual. «Hoy» es el
// día calendario de Lima, no el del servidor.
export function crearPacienteSchema(ahora: () => Date = () => new Date()) {
  return z
    .object({
      ...camposDocumento,
      nombres: textoObligatorio("Ingrese los nombres"),
      apellidos: textoObligatorio("Ingrese los apellidos"),
      fecha_nacimiento: fechaCalendario("Ingrese la fecha de nacimiento", "Ingrese una fecha de nacimiento válida"),
      sexo: opcionDeLista(SEXOS, "Seleccione el sexo (M, F o X)"),
      email: z.preprocess(
        (valor) => (valor === null || valor === undefined ? "" : valor),
        z
          .string({ invalid_type_error: "Ingrese el correo electrónico" })
          .trim()
          .min(1, "Ingrese el correo electrónico")
          .email("Ingrese un correo electrónico válido"),
      ),
      telefono: textoOpcional,
      direccion: textoOpcional,
    })
    .superRefine((datos, ctx) => {
      validarDocumento(datos, ctx);
      // La fecha ya es una fecha de calendario real si pasó su propio control; texto `YYYY-MM-DD` se compara por orden.
      if (/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha_nacimiento) && datos.fecha_nacimiento > hoyLima(ahora())) {
        ctx.addIssue({ code: "custom", path: ["fecha_nacimiento"], message: MENSAJE_FECHA_NACIMIENTO_FUTURA });
      }
    })
    .transform(normalizarCampoDocumento);
}

export const pacienteSchema = crearPacienteSchema();

export type DatosPaciente = z.infer<typeof pacienteSchema>;

export const MENSAJE_BUSQUEDA_VACIA = "Ingrese un documento o un apellido";
export const LONGITUD_MAXIMA_BUSQUEDA = 100;

// Texto de búsqueda de pacientes: un documento exacto o el inicio de los apellidos. Sin espacios en los extremos y con un
// largo acotado (el texto va a un `ilike`, y uno desmedido solo sirve para castigar la base de datos).
export const busquedaPacienteSchema = z.object({
  termino: textoObligatorio(MENSAJE_BUSQUEDA_VACIA).pipe(
    z.string().max(LONGITUD_MAXIMA_BUSQUEDA, `El texto de búsqueda no puede superar los ${LONGITUD_MAXIMA_BUSQUEDA} caracteres`),
  ),
});

export type BusquedaPaciente = z.infer<typeof busquedaPacienteSchema>;
