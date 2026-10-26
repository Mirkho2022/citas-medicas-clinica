// Franjas de un turno de enfermería (specs/turnos-de-enfermeria, «Las franjas se muestran sin inventar horarios»).
// Los valores son los del enum `tipo_turno` de la base de datos, en el orden del día. Las etiquetas son SOLO el nombre de la
// franja: mientras la clínica no defina las horas exactas de cada una (design.md, Q2) ninguna pantalla muestra ni calcula horarios
// para ellas, así que este módulo no tiene horas de inicio ni de fin a propósito.

export const FRANJAS = ["manana", "tarde", "noche"] as const;

export type Franja = (typeof FRANJAS)[number];

export const ETIQUETA_FRANJA: Record<Franja, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
};

export function esFranja(valor: unknown): valor is Franja {
  return typeof valor === "string" && (FRANJAS as readonly string[]).includes(valor);
}

// «Mañana», «Tarde» o «Noche». Un valor fuera del enum lanza: se ve en desarrollo y en las pruebas en vez de mostrar un texto
// inventado (igual que `datosEstado` con los estados de cita).
export function etiquetaFranja(franja: string): string {
  if (!esFranja(franja)) throw new Error(`Franja de turno desconocida: «${franja}»`);
  return ETIQUETA_FRANJA[franja];
}

// Posición de la franja dentro del día (0 = mañana), para ordenar.
export function ordenFranja(franja: Franja): number {
  return FRANJAS.indexOf(franja);
}
