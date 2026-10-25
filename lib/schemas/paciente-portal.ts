// Datos que el propio paciente completa al registrarse en el portal (openspec/changes/portal-del-paciente/specs/registro-del-paciente).
// Compone el esquema de documento de H3 (DNI o Carné de Extranjería) y NO acepta nada que decida la identidad: el rol, el perfil y
// el correo salen de la sesión (design.md, D3), así que cualquier clave desconocida (`rol`, `perfil_id`, `email`…) se descarta.
//
// Obligatorios: documento, nombres, apellidos, fecha de nacimiento (ni futura ni de hace más de 120 años) y sexo (M, F o X).
// Opcionales: teléfono (7 a 15 dígitos, con o sin «+» y espacios) y dirección. Cada campo inválido lleva su propio mensaje.
import { z } from "zod";
import { hoyLima } from "../fechas/lima.ts";
import { fechaCalendario, LONGITUD_MAXIMA, opcionDeLista, textoObligatorio, textoOpcional } from "./comun.ts";
import { camposDocumento, normalizarCampoDocumento, validarDocumento } from "./documento.ts";
import { SEXOS } from "./paciente.ts";

export const MENSAJE_FECHA_NACIMIENTO_PORTAL = "Revise la fecha de nacimiento: no puede ser futura ni de hace más de 120 años";
export const MENSAJE_TELEFONO = "El teléfono debe tener entre 7 y 15 dígitos";
export const ANIOS_MAXIMOS = 120;

// Teléfono opcional: se aceptan espacios y un «+» inicial, y se guarda solo con dígitos. Vacío queda como `undefined`.
const telefonoOpcional = z.preprocess(
  (valor) => {
    if (valor === null || valor === undefined) return undefined;
    if (typeof valor !== "string") return valor;
    const limpio = valor.trim();
    return limpio === "" ? undefined : limpio;
  },
  z
    .string({ invalid_type_error: MENSAJE_TELEFONO })
    .refine((valor) => /^\+?[\d\s]+$/.test(valor) && /^\d{7,15}$/.test(valor.replace(/^\+/, "").replace(/\s/g, "")), MENSAJE_TELEFONO)
    .transform((valor) => valor.replace(/^\+/, "").replace(/\s/g, ""))
    .optional(),
);

// Fecha de hace `anios` años, como texto `YYYY-MM-DD` de Lima. Un 29 de febrero cae el 28 en un año que no es bisiesto.
function haceAnios(hoy: string, anios: number): string {
  const [anio, mes, dia] = hoy.split("-");
  const objetivo = Number(anio) - anios;
  const bisiesto = (objetivo % 4 === 0 && objetivo % 100 !== 0) || objetivo % 400 === 0;
  const diaAjustado = mes === "02" && dia === "29" && !bisiesto ? "28" : dia;
  return `${String(objetivo).padStart(4, "0")}-${mes}-${diaAjustado}`;
}

// `ahora` se inyecta para probar los límites de la fecha sin depender del reloj. «Hoy» es el día calendario de Lima.
export function crearPacientePortalSchema(ahora: () => Date = () => new Date()) {
  return z
    .object({
      ...camposDocumento,
      nombres: textoObligatorio("Ingrese sus nombres", LONGITUD_MAXIMA.nombre),
      apellidos: textoObligatorio("Ingrese sus apellidos", LONGITUD_MAXIMA.nombre),
      fecha_nacimiento: fechaCalendario("Ingrese su fecha de nacimiento", MENSAJE_FECHA_NACIMIENTO_PORTAL),
      sexo: opcionDeLista(SEXOS, "Seleccione una opción"),
      telefono: telefonoOpcional,
      direccion: textoOpcional(LONGITUD_MAXIMA.direccion),
    })
    .superRefine((datos, ctx) => {
      validarDocumento(datos, ctx);
      if (/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha_nacimiento)) {
        const hoy = hoyLima(ahora());
        if (datos.fecha_nacimiento > hoy || datos.fecha_nacimiento < haceAnios(hoy, ANIOS_MAXIMOS)) {
          ctx.addIssue({ code: "custom", path: ["fecha_nacimiento"], message: MENSAJE_FECHA_NACIMIENTO_PORTAL });
        }
      }
    })
    .transform(normalizarCampoDocumento);
}

export const pacientePortalSchema = crearPacientePortalSchema();

export type DatosPacientePortal = z.infer<typeof pacientePortalSchema>;
