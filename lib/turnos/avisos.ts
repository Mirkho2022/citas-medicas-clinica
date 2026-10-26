// Causas de un «turno con aviso» (vista `public.turnos_enfermeria_con_aviso`; specs/turnos-de-enfermeria, «El administrativo ve los
// turnos afectados por la ausencia de un médico o la baja de personal»). Es un aviso, no una orden: el administrativo decide si
// reasigna a la enfermera. NO se muestra el motivo del bloqueo de agenda (puede ser información personal del médico): solo la
// causa genérica.
export const CAUSAS_DE_AVISO = ["enfermera_de_baja", "medico_de_baja", "bloqueo_de_agenda"] as const;

export type CausaDeAviso = (typeof CAUSAS_DE_AVISO)[number];

export const TEXTO_CAUSA: Record<CausaDeAviso, string> = {
  enfermera_de_baja: "La enfermera está dada de baja",
  medico_de_baja: "El médico está dado de baja",
  bloqueo_de_agenda: "El médico tiene un bloqueo de agenda ese día",
};

export function esCausaDeAviso(valor: unknown): valor is CausaDeAviso {
  return typeof valor === "string" && (CAUSAS_DE_AVISO as readonly string[]).includes(valor);
}

// Texto de una causa. Una causa que la base de datos agregue y la aplicación no conozca lanza (se ve en desarrollo y en las pruebas)
// en vez de mostrar un código interno a quien lee la pantalla.
export function textoCausa(causa: string): string {
  if (!esCausaDeAviso(causa)) throw new Error(`Causa de aviso desconocida: «${causa}»`);
  return TEXTO_CAUSA[causa];
}
