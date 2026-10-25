"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SelectorHorario, type HorarioSeleccionable } from "@/components/clinica/selector-horario";
import { cn } from "@/lib/utils";
import { horaLima } from "@/lib/ui/formato";

const FRANJAS = [
  { id: "manana", nombre: "Mañana", desde: 0, hasta: 12 },
  { id: "tarde", nombre: "Tarde", desde: 12, hasta: 18 },
  { id: "noche", nombre: "Noche", desde: 18, hasta: 24 },
] as const;

const horaDelDia = (inicio: string) => Number.parseInt(horaLima(inicio).slice(0, 2), 10);

// Paso «horario» de «Reservar cita» (design.md, D7): primero la franja del día (Mañana, Tarde o Noche) y debajo solo los horarios de esa franja,
// para no mostrar de golpe la lista completa del día. Al elegir un horario se navega al paso de confirmación con el instante en la dirección.
// La advertencia de cancelación la muestra ese paso, antes del botón de confirmar, así que aquí se apaga la del selector. `hrefBase` ya trae el
// médico y el día (y por eso un `?`): solo falta agregar la hora. La franja es solo presentación: no viaja en la dirección.
export function ElegirHorario({ horarios, hrefBase }: { horarios: HorarioSeleccionable[]; hrefBase: string }) {
  const router = useRouter();
  const franjas = FRANJAS.map((f) => {
    const delaFranja = horarios.filter((h) => horaDelDia(h.inicio) >= f.desde && horaDelDia(h.inicio) < f.hasta);
    return { ...f, horarios: delaFranja, libres: delaFranja.filter((h) => h.disponible).length };
  }).filter((f) => f.horarios.length > 0);

  const [franjaElegida, setFranjaElegida] = useState<string | null>(null);
  const activa = franjas.find((f) => f.id === franjaElegida) ?? franjas.find((f) => f.libres > 0) ?? franjas[0];
  if (!activa) return null;

  const selector = (
    <SelectorHorario
      key={activa.id}
      horarios={activa.horarios}
      mostrarAdvertencia={false}
      alElegir={(inicio) => router.push(`${hrefBase}&hora=${encodeURIComponent(inicio)}`)}
    />
  );
  if (franjas.length === 1) return selector;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Franja del día" className="grid grid-cols-3 gap-3">
        {franjas.map((f) => {
          const seleccionada = f.id === activa.id;
          return (
            <button
              key={f.id}
              type="button"
              disabled={f.libres === 0}
              aria-pressed={seleccionada}
              onClick={() => setFranjaElegida(f.id)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-md border px-2 py-2 transition-colors",
                f.libres === 0
                  ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                  : seleccionada
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-control bg-surface text-primary-text hover:bg-primary-soft",
              )}
            >
              <span className="text-label-lg">{f.nombre}</span>
              <span className="text-label-sm">
                {f.libres === 0 ? "Sin horarios" : f.libres === 1 ? "1 horario" : `${f.libres} horarios`}
              </span>
            </button>
          );
        })}
      </div>
      {selector}
    </div>
  );
}
