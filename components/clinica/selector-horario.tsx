"use client";

import { useState } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { cn } from "@/lib/utils";
import { horaLima, horaLimiteCancelacion } from "@/lib/ui/formato";

export interface HorarioSeleccionable {
  // Instante UTC en ISO 8601 (`timestamptz`).
  inicio: string;
  disponible: boolean;
}

// Selector de horario del portal (DESIGN.md): botones de 48 px en cuadrícula. El horario ocupado se ve deshabilitado Y con
// el texto «No disponible» (no solo por color). Al elegir uno aparece la advertencia de cancelación con su hora límite.
// El horario elegido viaja en un campo oculto con el nombre dado, para el formulario de la reserva.
export function SelectorHorario({
  horarios,
  nombre = "inicio",
  valorInicial = null,
}: {
  horarios: HorarioSeleccionable[];
  nombre?: string;
  valorInicial?: string | null;
}) {
  const [elegido, setElegido] = useState<string | null>(valorInicial);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Horarios disponibles"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {horarios.map((h) => {
          const seleccionado = elegido === h.inicio;
          return (
            <button
              key={h.inicio}
              type="button"
              disabled={!h.disponible}
              aria-pressed={seleccionado}
              onClick={() => setElegido(h.inicio)}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-md border text-label-lg tabular-nums transition-colors",
                h.disponible
                  ? seleccionado
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-control bg-surface text-primary-text hover:bg-primary-soft"
                  : "cursor-not-allowed border-border bg-muted text-muted-foreground",
              )}
            >
              {horaLima(h.inicio)}
              {h.disponible ? null : (
                <span className="text-label-sm leading-none">No disponible</span>
              )}
            </button>
          );
        })}
      </div>
      <input type="hidden" name={nombre} value={elegido ?? ""} />
      <div aria-live="polite">
        {elegido ? (
          <Alerta tono="aviso">
            Podrá cancelar esta cita hasta 1 hora antes, a las {horaLimiteCancelacion(elegido)}.
          </Alerta>
        ) : null}
      </div>
    </div>
  );
}
