import { CalendarDays, Moon, Stethoscope, Sun, Sunset, TriangleAlert, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { etiquetaFranja, type Franja } from "@/lib/turnos/franjas";
import { textoFechaConDia } from "@/lib/ui/calendario";

export const NOTA_MEDICO_FUERA_DE_SERVICIO = "Fuera de servicio; consulte al personal administrativo";

const ICONO_FRANJA: Record<Franja, LucideIcon> = { manana: Sun, tarde: Sunset, noche: Moon };

export interface DatosTarjetaTurno {
  // Fecha de calendario de Lima `YYYY-MM-DD`.
  fecha: string;
  franja: Franja;
  medico: { nombre: string; especialidad: string; activo: boolean } | null;
  servicio: string | null;
}

// Tarjeta de un turno de la enfermera (specs/turnos-de-enfermeria, «La enfermera ve su turno y con quién trabaja, y nada más»): fecha
// (`dd/MM/yyyy` con el día de la semana en español), franja SOLO con su nombre (sin horas: la clínica no las ha definido) y el médico
// con su especialidad o el servicio. Nada de pacientes, citas ni enlaces a funciones administrativas. Si el médico está de baja, lo dice
// con texto e icono. Pensada para el móvil: texto grande y una columna.
export function TarjetaTurno({ turno, destacado = false }: { turno: DatosTarjetaTurno; destacado?: boolean }) {
  const IconoFranja = ICONO_FRANJA[turno.franja];
  return (
    <Card data-slot="tarjeta-turno" data-destacado={destacado ? "" : undefined} className="text-body-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconoFranja className="size-5 shrink-0 text-primary-text" aria-hidden="true" />
          {etiquetaFranja(turno.franja)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="flex items-center gap-2 tabular-nums">
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{textoFechaConDia(turno.fecha)}</span>
        </p>
        {turno.medico ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2">
              <Stethoscope className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="font-semibold">{turno.medico.nombre}</span>
                <span className="text-muted-foreground"> · {turno.medico.especialidad}</span>
              </span>
            </p>
            {turno.medico.activo ? null : (
              <p className="flex items-start gap-2 pl-7 text-body-md text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                {NOTA_MEDICO_FUERA_DE_SERVICIO}
              </p>
            )}
          </div>
        ) : null}
        {turno.servicio ? (
          <p className="flex items-center gap-2">
            <Stethoscope className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Servicio: {turno.servicio}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
