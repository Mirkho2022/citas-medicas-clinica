import { Badge } from "@/components/ui/badge";
import { datosEstado, type EstadoCita } from "@/lib/ui/estados-cita";

// Insignia del estado de una cita (DESIGN.md): etiqueta de texto + icono + color; nunca solo color. Un estado fuera de los
// cinco lanza (ver lib/ui/estados-cita.ts) en lugar de pintar un color arbitrario.
export function InsigniaEstado({
  estado,
  className,
}: {
  estado: EstadoCita;
  className?: string;
}) {
  const { etiqueta, icono: Icono, tono } = datosEstado(estado);
  return (
    <Badge variant={tono} className={className} data-estado={estado}>
      <Icono aria-hidden="true" />
      {etiqueta}
    </Badge>
  );
}
