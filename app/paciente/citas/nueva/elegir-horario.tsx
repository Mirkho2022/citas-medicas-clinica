"use client";

import { useRouter } from "next/navigation";
import { SelectorHorario, type HorarioSeleccionable } from "@/components/clinica/selector-horario";

// Paso «horario» de «Reservar cita» (design.md, D7): los horarios del día en botones de 48 px; al elegir uno se navega al paso de
// confirmación con el instante en la dirección. La advertencia de cancelación la muestra ese paso, antes del botón de confirmar, así que
// aquí se apaga la del selector. `hrefBase` ya trae el médico y el día (y por eso un `?`): solo falta agregar la hora.
export function ElegirHorario({ horarios, hrefBase }: { horarios: HorarioSeleccionable[]; hrefBase: string }) {
  const router = useRouter();
  return (
    <SelectorHorario
      horarios={horarios}
      mostrarAdvertencia={false}
      alElegir={(inicio) => router.push(`${hrefBase}&hora=${encodeURIComponent(inicio)}`)}
    />
  );
}
