// Turnos de enfermería: asignar y modificar (specs/turnos-de-enfermeria; design.md, D6). Cada campo inválido lleva un mensaje que
// dice qué corregir. La base de datos conserva sus propias barreras (`unique (enfermera_id, fecha, turno)` y el `check` de
// médico o servicio) como defensa real; este esquema solo da el mensaje preciso antes de llegar a ellas.
//
// «Exactamente uno» de `medico_id` / `especialidad_id` es una regla de la acción y es MÁS estricta que el `check` de la base de
// datos (que admite ambos): un turno con médico ya tiene servicio implícito (la especialidad del médico), y guardar los dos
// permitiría contradicciones (un cardiólogo «en Pediatría»). El error de ninguno o de los dos va sin ruta (`campos._`): no
// pertenece a un solo campo sino al grupo «Con un médico / En un servicio».
//
// Los nombres de los campos son los del formulario y de la base de datos (snake_case), como el resto de `lib/schemas/`.
// «Fecha de hoy o posterior» y «personal activo» dependen del estado de la base de datos y los comprueba la acción
// (lib/turnos/errores.ts, `validarContraEstado`), no este esquema.
import { z } from "zod";
import { FRANJAS } from "../turnos/franjas.ts";
import { fechaCalendario, identificador, identificadorOpcional, opcionDeLista } from "./comun.ts";

export const MENSAJE_SIN_DESTINO = "Indique el médico o el servicio con el que trabajará la enfermera";
export const MENSAJE_DESTINO_DOBLE = "Elija solo una opción: un médico o un servicio";

const franja = () => opcionDeLista(FRANJAS, "Seleccione la franja del turno: mañana, tarde o noche");

const destino = {
  medico_id: identificadorOpcional("El médico elegido no es válido"),
  especialidad_id: identificadorOpcional("El servicio elegido no es válido"),
};

// Exactamente uno de los dos. Un identificador mal formado ya tiene su propio mensaje y no se cuenta como «elegido».
function exigirUnDestino(datos: { medico_id?: string | undefined; especialidad_id?: string | undefined }, ctx: z.RefinementCtx) {
  const medico = datos.medico_id !== undefined;
  const servicio = datos.especialidad_id !== undefined;
  if (!medico && !servicio) ctx.addIssue({ code: "custom", path: [], message: MENSAJE_SIN_DESTINO });
  if (medico && servicio) ctx.addIssue({ code: "custom", path: [], message: MENSAJE_DESTINO_DOBLE });
}

export const turnoSchema = z
  .object({
    enfermera_id: identificador("Seleccione una enfermera"),
    fecha: fechaCalendario("Ingrese la fecha del turno", "La fecha del turno no es válida (use AAAA-MM-DD)"),
    turno: franja(),
    ...destino,
  })
  .superRefine(exigirUnDestino);

export type DatosTurno = z.infer<typeof turnoSchema>;

// Modificar: la enfermera y la fecha del turno no cambian (para eso se quita y se asigna otro); sí la franja, el médico o el servicio.
export const turnoActualizacionSchema = z
  .object({
    id: identificador("Seleccione un turno"),
    turno: franja(),
    ...destino,
  })
  .superRefine(exigirUnDestino);

export type DatosActualizacionTurno = z.infer<typeof turnoActualizacionSchema>;

export const turnoRefSchema = z.object({ id: identificador("Seleccione un turno") });
