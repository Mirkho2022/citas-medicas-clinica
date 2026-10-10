// Piezas comunes de los esquemas Zod de las acciones (design.md, D7): textos, identificadores, fechas y horas con el
// mensaje en español de cada campo. Los nombres de los campos son los del formulario y de la base de datos (snake_case),
// los mismos que usa `CampoDocumento` (`tipo_documento`, `numero_documento`).
//
// Un formulario HTML entrega `""` para un campo vacío y, con `FormData.get`, `null` para uno ausente: ambos se tratan como
// «vacío» para que falten con su propio mensaje en lugar del genérico «Required» de Zod. Los controles que fallan sin
// abortar (`min`, `refine`, `superRefine`) dejan que las validaciones entre campos corran en el mismo envío, de modo que la
// persona ve todos sus errores a la vez.
import { z } from "zod";
import { esFechaLima, esHoraLima } from "../fechas/lima.ts";

const aTexto = (valor: unknown): unknown => (valor === null || valor === undefined ? "" : valor);

// Texto obligatorio, sin espacios al inicio ni al final.
export function textoObligatorio(mensaje: string) {
  return z.preprocess(aTexto, z.string({ invalid_type_error: mensaje }).trim().min(1, mensaje));
}

// Texto opcional: vacío o solo espacios queda como `undefined`.
export const textoOpcional = z.preprocess(
  (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : (valor ?? undefined)),
  z.string().trim().optional(),
);

// Identificador `uuid` (de un paciente, un médico, una cita…).
export function identificador(mensaje: string) {
  return z.preprocess(aTexto, z.string({ invalid_type_error: mensaje }).trim().uuid(mensaje));
}

// Un valor de una lista cerrada (p. ej. el sexo). Un valor fuera de la lista falla con `mensaje` SIN abortar el objeto que lo
// contiene (un `z.enum` o un `transform` posterior sí lo abortarían y ocultarían los demás errores del mismo envío). Por eso
// se valida con `superRefine` y el tipo `T` se declara con una aserción: solo es cierto cuando la validación pasó.
export function opcionDeLista<const T extends string>(valores: readonly T[], mensaje: string) {
  const esquema = z.preprocess(
    aTexto,
    z.string({ invalid_type_error: mensaje }).superRefine((valor, ctx) => {
      if (!(valores as readonly string[]).includes(valor)) ctx.addIssue({ code: "custom", message: mensaje });
    }),
  );
  return esquema as unknown as z.ZodType<T, z.ZodTypeDef, unknown>;
}

// Fecha de calendario `YYYY-MM-DD` (real: rechaza `2026-02-30`).
export function fechaCalendario(requerido: string, invalida: string = requerido) {
  return z.preprocess(
    aTexto,
    z
      .string({ invalid_type_error: invalida })
      .trim()
      .min(1, requerido)
      .refine((valor) => valor === "" || esFechaLima(valor), invalida),
  );
}

// Hora `HH:mm` de 24 horas. Se acepta también `HH:mm:00` (así devuelve Postgres una columna `time`) y se normaliza a `HH:mm`.
export function horaDelDia(requerido: string, invalida: string = requerido) {
  return z.preprocess(
    aTexto,
    z
      .string({ invalid_type_error: invalida })
      .trim()
      .min(1, requerido)
      .refine((valor) => valor === "" || esHoraLima(valor.replace(/:00$/, "")) || esHoraLima(valor), invalida)
      .transform((valor) => (/^\d{2}:\d{2}:00$/.test(valor) ? valor.slice(0, 5) : valor)),
  );
}

// Instante ISO 8601 con zona (`2026-10-14T19:30:00.000Z` o con desfase). Se normaliza a ISO en UTC. Es el valor que viaja
// del servidor al formulario y de vuelta: no se reconstruye a partir de texto local (design.md, D8).
export function instanteIso(requerido: string, invalido: string = requerido) {
  return z.preprocess(
    aTexto,
    z
      .string({ invalid_type_error: invalido })
      .trim()
      .min(1, requerido)
      .refine((valor) => valor === "" || z.string().datetime({ offset: true }).safeParse(valor).success, invalido)
      .transform((valor) => (valor === "" ? valor : new Date(valor).toISOString())),
  );
}

// Número entero que llega de un formulario como texto. Vacío = ausente (no 0, como haría `z.coerce.number()`).
export function enteroDeFormulario(opciones: { requerido: string; invalido: string; minimo?: { valor: number; mensaje: string }; maximo?: { valor: number; mensaje: string } }) {
  let numero = z.number({ required_error: opciones.requerido, invalid_type_error: opciones.invalido }).int(opciones.invalido);
  if (opciones.minimo) numero = numero.min(opciones.minimo.valor, opciones.minimo.mensaje);
  if (opciones.maximo) numero = numero.max(opciones.maximo.valor, opciones.maximo.mensaje);
  return z.preprocess((valor) => {
    if (typeof valor === "string") return valor.trim() === "" ? undefined : Number(valor);
    return valor ?? undefined;
  }, numero);
}
