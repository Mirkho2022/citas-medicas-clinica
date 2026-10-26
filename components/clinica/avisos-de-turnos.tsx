import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { textoCausa } from "@/lib/turnos/avisos";
import type { AvisoDeTurno } from "@/lib/turnos/consultas";
import { etiquetaFranja } from "@/lib/turnos/franjas";
import { textoFecha } from "@/lib/ui/calendario";

// «Turnos con aviso» (specs/turnos-de-enfermeria, «El administrativo ve los turnos afectados por la ausencia de un médico o la baja de
// personal»; design.md, D8): los turnos de hoy en adelante cuyo médico tiene un bloqueo de agenda ese día o está de baja, o cuya
// enfermera está de baja. Cada uno dice la causa (texto + icono, nunca solo color) y lleva a modificarlo. Es un AVISO: no cambia ni quita
// turnos, y la decisión de reasignar a la enfermera es del administrativo. No muestra el motivo de ningún bloqueo. Sin avisos no
// ocupa lugar en la pantalla.
export function AvisosDeTurnos({ avisos }: { avisos: AvisoDeTurno[] }) {
  if (avisos.length === 0) return null;
  return (
    <section aria-labelledby="titulo-avisos-turnos" className="flex flex-col gap-3 rounded-lg border border-border bg-warning-soft p-4">
      <h2 id="titulo-avisos-turnos" className="flex items-center gap-2 font-heading text-title-md text-ink">
        <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
        Turnos que necesitan revisión ({avisos.length})
      </h2>
      <ul className="flex flex-col gap-2 text-body-md text-foreground">
        {avisos.map((a) => (
          <li key={a.turnoId} className="flex flex-col gap-1 rounded-md bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <p>
                <span className="font-semibold">{a.enfermera}</span>
                <span className="tabular-nums"> · {textoFecha(a.fecha)} · {etiquetaFranja(a.franja)}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {a.medico ?? (a.servicio ? `Servicio: ${a.servicio}` : "")}
                </span>
              </p>
              <ul className="text-body-sm">
                {a.causas.map((causa) => (
                  <li key={causa}>{textoCausa(causa)}</li>
                ))}
              </ul>
            </div>
            <Button asChild variant="secondary" size="sm" className="self-start sm:self-auto">
              <Link href={`/administrativo/turnos/${a.turnoId}`}>
                Modificar turno
                <span className="sr-only">
                  {" "}
                  de {a.enfermera} del {textoFecha(a.fecha)}, {etiquetaFranja(a.franja)}
                </span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
