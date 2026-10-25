// Los pasos de «Reservar cita» y su estado en la dirección (openspec/changes/portal-del-paciente/design.md, D7). Un paso por pantalla:
// especialidad → médico → día → horario → confirmar → listo. El servidor decide el paso por los parámetros presentes y válidos; cada
// paso es una navegación por enlace, de modo que el botón «atrás» funciona, recargar no pierde el avance y una sesión vencida conserva
// la selección. La dirección solo lleva identificadores de médico y especialidad, una fecha de Lima y un instante: nada del paciente.
//
// Todo es puro: `leerParametros` descarta lo que no es válido (así una dirección manipulada cae en un paso anterior en vez de romper)
// y `hrefReserva` arma la dirección con los parámetros en un orden fijo.
import { esUuid } from "../citas/consultas.ts";
import { esFechaLima, fechaYHoraLima } from "../fechas/lima.ts";
import { sumarDias } from "../ui/calendario.ts";
import { DIAS_DE_BUSQUEDA } from "./consultas.ts";

export const RUTA_INICIO = "/paciente";
export const RUTA_MIS_CITAS = "/paciente/citas";
export const RUTA_RESERVAR = "/paciente/citas/nueva";

// Códigos de choque que la pantalla de confirmación deja en la dirección al volver a los horarios.
export const CONFLICTOS = ["DOBLE_RESERVA", "HORARIO_NO_DISPONIBLE"] as const;
export type Conflicto = (typeof CONFLICTOS)[number];

export interface ParametrosReserva {
  especialidad?: string;
  // «Ya sé con qué médico»: lista todos los médicos sin pasar por la especialidad.
  modo?: "medico";
  medico?: string;
  // Fecha de Lima `AAAA-MM-DD` dentro del horizonte de búsqueda.
  dia?: string;
  // Instante UTC ISO 8601 de inicio del horario elegido; cae en `dia` (hora de Lima).
  hora?: string;
  conflicto?: Conflicto;
  // Instante que acaba de tomar otra persona: la lista de horarios lo muestra «No disponible».
  tomado?: string;
  // Cita recién reservada (pantalla de confirmación de la reserva).
  cita?: string;
}

export type PasoReserva = "especialidades" | "todosLosMedicos" | "medicos" | "dias" | "horarios" | "confirmar" | "listo";

type Consulta = Record<string, string | string[] | undefined>;

const una = (valor: string | string[] | undefined): string | undefined => (Array.isArray(valor) ? valor[0] : valor);

function instanteIso(valor: string | undefined): string | undefined {
  if (!valor) return undefined;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha.toISOString();
}

// Los parámetros de la dirección que son válidos, y solo esos. `hoy` es la fecha de Lima de hoy: el día debe estar entre hoy y el
// último día del horizonte. Sin médico no hay día; sin día no hay hora; y la hora debe caer en ese día de Lima.
export function leerParametros(consulta: Consulta, hoy: string): ParametrosReserva {
  const parametros: ParametrosReserva = {};

  const especialidad = una(consulta.especialidad);
  if (esUuid(especialidad)) parametros.especialidad = especialidad;
  if (una(consulta.modo) === "medico") parametros.modo = "medico";

  const cita = una(consulta.cita);
  if (esUuid(cita)) parametros.cita = cita;

  const medico = una(consulta.medico);
  if (!esUuid(medico)) return parametros;
  parametros.medico = medico;

  const dia = una(consulta.dia);
  if (!dia || !esFechaLima(dia) || dia < hoy || dia > sumarDias(hoy, DIAS_DE_BUSQUEDA - 1)) return parametros;
  parametros.dia = dia;

  const hora = instanteIso(una(consulta.hora));
  if (hora && fechaYHoraLima(hora).fecha === dia) parametros.hora = hora;

  const conflicto = una(consulta.conflicto);
  if ((CONFLICTOS as readonly string[]).includes(conflicto ?? "")) parametros.conflicto = conflicto as Conflicto;
  const tomado = instanteIso(una(consulta.tomado));
  if (tomado && fechaYHoraLima(tomado).fecha === dia) parametros.tomado = tomado;

  return parametros;
}

// El paso que corresponde a los parámetros. La pantalla de «listo» manda sobre el resto.
export function pasoDe(p: ParametrosReserva): PasoReserva {
  if (p.cita) return "listo";
  if (p.medico && p.dia && p.hora) return "confirmar";
  if (p.medico && p.dia) return "horarios";
  if (p.medico) return "dias";
  if (p.especialidad) return "medicos";
  if (p.modo === "medico") return "todosLosMedicos";
  return "especialidades";
}

const ORDEN: ReadonlyArray<keyof ParametrosReserva> = ["especialidad", "modo", "medico", "dia", "hora", "conflicto", "tomado", "cita"];

// Dirección de «Reservar cita» con los parámetros dados, en un orden fijo y sin los vacíos. `urlSearchParams` codifica el instante
// (`:` y `+`), así que el valor sobrevive al ida y vuelta por la barra de direcciones.
export function hrefReserva(parametros: ParametrosReserva = {}): string {
  const consulta = new URLSearchParams();
  for (const clave of ORDEN) {
    const valor = parametros[clave];
    if (valor) consulta.set(clave, valor);
  }
  const texto = consulta.toString();
  return texto ? `${RUTA_RESERVAR}?${texto}` : RUTA_RESERVAR;
}

// El paso anterior (el enlace «Atrás»): conserva lo que sigue siendo válido y quita lo del paso actual. `null` en el primer paso.
export function parametrosAtras(p: ParametrosReserva, especialidadDelMedico?: string): ParametrosReserva | null {
  switch (pasoDe(p)) {
    case "especialidades":
    case "listo":
      return null;
    case "todosLosMedicos":
    case "medicos":
      return {};
    case "dias":
      if (p.especialidad) return { especialidad: p.especialidad };
      if (p.modo === "medico") return { modo: "medico" };
      return especialidadDelMedico ? { especialidad: especialidadDelMedico } : {};
    case "horarios":
      return sinVacios({ especialidad: p.especialidad, modo: p.modo, medico: p.medico });
    case "confirmar":
      return sinVacios({ especialidad: p.especialidad, modo: p.modo, medico: p.medico, dia: p.dia });
  }
}

function sinVacios(parametros: ParametrosReserva): ParametrosReserva {
  return Object.fromEntries(Object.entries(parametros).filter(([, valor]) => valor !== undefined)) as ParametrosReserva;
}
