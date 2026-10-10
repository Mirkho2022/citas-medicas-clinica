// Datos de ejemplo de la galería de componentes (/guia-de-estilo). SINTÉTICOS: ninguna persona real. Los documentos
// empiezan por `99` (como los de docs/datos-demo.md) para que sean inconfundibles con un DNI real.
import type { EstadoCita } from "./estados-cita";

// «Ahora» fijo de la galería: así las citas "futuras" y "pasadas" no cambian con el tiempo y las pruebas son estables.
// 10 de octubre de 2026, 10:00 en Lima.
export const AHORA_EJEMPLO = new Date("2026-10-10T15:00:00Z");

export interface PacienteEjemplo {
  nombres: string;
  apellidos: string;
  tipoDocumento: "DNI" | "CE";
  documento: string;
}

export const PACIENTES_EJEMPLO: PacienteEjemplo[] = [
  { nombres: "Rosa", apellidos: "Ejemplo Quispe", tipoDocumento: "DNI", documento: "99000001" },
  { nombres: "Carlos", apellidos: "Muestra Rojas", tipoDocumento: "DNI", documento: "99000002" },
  { nombres: "Ana", apellidos: "Prueba Díaz", tipoDocumento: "CE", documento: "990000003" },
];

export interface CitaEjemplo {
  id: string;
  servicio: string;
  medico: string;
  // Instante UTC en ISO 8601, como llega de la base de datos (`timestamptz`).
  inicio: string;
  estado: EstadoCita;
  paciente: PacienteEjemplo;
}

// Una cita por estado, más una cita pasada todavía «reservada» (para probar que no se puede cancelar) y una a menos de
// una hora (ya no se puede cancelar). Fechas en Lima: la primera es el 14/10/2026 a las 14:30.
export const CITAS_EJEMPLO: CitaEjemplo[] = [
  {
    id: "ejemplo-1",
    servicio: "Medicina general",
    medico: "Dra. Lucía Ejemplo Vargas",
    inicio: "2026-10-14T19:30:00Z",
    estado: "reservada",
    paciente: PACIENTES_EJEMPLO[0],
  },
  {
    id: "ejemplo-2",
    servicio: "Cardiología",
    medico: "Dr. Mario Muestra León",
    inicio: "2026-10-15T14:00:00Z",
    estado: "confirmada",
    paciente: PACIENTES_EJEMPLO[1],
  },
  {
    id: "ejemplo-3",
    servicio: "Medicina general",
    medico: "Dra. Lucía Ejemplo Vargas",
    inicio: "2026-10-08T15:00:00Z",
    estado: "atendida",
    paciente: PACIENTES_EJEMPLO[2],
  },
  {
    id: "ejemplo-4",
    servicio: "Pediatría",
    medico: "Dra. Elena Prueba Soto",
    inicio: "2026-10-16T16:30:00Z",
    estado: "cancelada",
    paciente: PACIENTES_EJEMPLO[0],
  },
  {
    id: "ejemplo-5",
    servicio: "Medicina general",
    medico: "Dr. Mario Muestra León",
    inicio: "2026-10-09T20:00:00Z",
    estado: "no_asistio",
    paciente: PACIENTES_EJEMPLO[1],
  },
  {
    id: "ejemplo-6",
    servicio: "Cardiología",
    medico: "Dr. Mario Muestra León",
    inicio: "2026-10-10T15:30:00Z", // 10:30 en Lima: faltan 30 min respecto de AHORA_EJEMPLO
    estado: "confirmada",
    paciente: PACIENTES_EJEMPLO[2],
  },
  {
    id: "ejemplo-7",
    servicio: "Pediatría",
    medico: "Dra. Elena Prueba Soto",
    inicio: "2026-10-09T14:00:00Z", // ya pasó y quedó sin atender
    estado: "reservada",
    paciente: PACIENTES_EJEMPLO[0],
  },
];

export interface HorarioEjemplo {
  inicio: string;
  disponible: boolean;
}

// Horarios del 14/10/2026 en Lima, cada 30 minutos entre las 13:00 y las 15:30 (UTC-5); las 14:30 es el que se elige en
// las pruebas y las 15:00 está ocupado.
export const HORARIOS_EJEMPLO: HorarioEjemplo[] = [
  { inicio: "2026-10-14T18:00:00Z", disponible: true }, // 13:00
  { inicio: "2026-10-14T18:30:00Z", disponible: true }, // 13:30
  { inicio: "2026-10-14T19:00:00Z", disponible: true }, // 14:00
  { inicio: "2026-10-14T19:30:00Z", disponible: true }, // 14:30
  { inicio: "2026-10-14T20:00:00Z", disponible: false }, // 15:00 (ocupado)
  { inicio: "2026-10-14T20:30:00Z", disponible: true }, // 15:30
];

export interface AtencionEjemplo {
  fechaFirma: string;
  autor: string;
  motivo: string;
  diagnostico: string;
  indicaciones: string;
  paciente: PacienteEjemplo;
}

export const ATENCION_EJEMPLO: AtencionEjemplo = {
  fechaFirma: "2026-10-08T16:05:00Z",
  autor: "Dra. Lucía Ejemplo Vargas",
  motivo: "Tos y malestar general de tres días.",
  diagnostico: "J06.9 — Infección aguda de las vías respiratorias superiores, no especificada",
  indicaciones: "Reposo, abundante líquido y control en siete días si persisten los síntomas.",
  paciente: PACIENTES_EJEMPLO[2],
};
