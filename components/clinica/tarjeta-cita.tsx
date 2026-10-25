import { CalendarDays, Clock, Stethoscope } from "lucide-react";
import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { puedeCancelar } from "@/lib/ui/cancelacion";
import { esEstadoActivo, type EstadoCita } from "@/lib/ui/estados-cita";
import { fechaLima, horaLima, horaLimiteCancelacion, type Instante } from "@/lib/ui/formato";

export interface DatosTarjetaCita {
  servicio: string;
  medico: string;
  inicio: Instante;
  estado: EstadoCita;
}

// Tarjeta de una cita del portal (DESIGN.md): servicio, médico, fecha y hora en hora de Lima, estado y, solo mientras se
// pueda, la opción de cancelar con su hora límite. Una cita vigente a la que le faltan menos de 1 hora dice por qué ya no se
// puede cancelar (specs/mis-citas-y-cancelacion). `botonCancelar` lo aporta la pantalla (H4) con su acción real; la
// tarjeta decide si se muestra. `ahora` permite fijar el reloj en la galería y en las pruebas.
export function TarjetaCita({
  cita,
  ahora = new Date(),
  botonCancelar,
}: {
  cita: DatosTarjetaCita;
  ahora?: Date;
  botonCancelar?: React.ReactNode;
}) {
  const cancelable = puedeCancelar(cita.estado, cita.inicio, ahora);
  return (
    <Card data-slot="tarjeta-cita" className="text-body-lg">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{cita.servicio}</CardTitle>
          <InsigniaEstado estado={cita.estado} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="flex items-center gap-2">
          <Stethoscope className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{cita.medico}</span>
        </p>
        <p className="flex items-center gap-2 tabular-nums">
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{fechaLima(cita.inicio)}</span>
        </p>
        <p className="flex items-center gap-2 tabular-nums">
          <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{horaLima(cita.inicio)}</span>
        </p>
        {cancelable ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-body-md text-muted-foreground">
              Puede cancelar hasta las {horaLimiteCancelacion(cita.inicio)}.
            </p>
            {botonCancelar}
          </div>
        ) : esEstadoActivo(cita.estado) && new Date(cita.inicio).getTime() > ahora.getTime() ? (
          <div className="flex flex-col gap-1 border-t border-border pt-4 text-body-md text-muted-foreground">
            <p>Ya no se puede cancelar por el portal</p>
            <p>Si no puede asistir, avise a la clínica.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
