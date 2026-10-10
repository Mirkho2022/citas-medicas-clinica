import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type TonoAlerta = "aviso" | "error" | "informacion" | "exito";

const TONOS: Record<
  TonoAlerta,
  {
    variante: "warning" | "destructive" | "info" | "success";
    icono: LucideIcon;
    rol: "alert" | "status";
  }
> = {
  aviso: { variante: "warning", icono: TriangleAlert, rol: "status" },
  error: { variante: "destructive", icono: CircleAlert, rol: "alert" },
  informacion: { variante: "info", icono: Info, rol: "status" },
  exito: { variante: "success", icono: CircleCheck, rol: "status" },
};

// Alerta del sistema (DESIGN.md): siempre con icono y texto. Solo el error se anuncia como `alert`; el resto usa `status`
// y no le quita el foco al usuario. Para un rechazo de doble reserva el texto es exactamente `Registro de cita ya agendado`.
export function Alerta({
  tono,
  titulo,
  children,
  className,
}: {
  tono: TonoAlerta;
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { variante, icono: Icono, rol } = TONOS[tono];
  return (
    <Alert variant={variante} role={rol} className={className}>
      <Icono aria-hidden="true" />
      {titulo ? <AlertTitle>{titulo}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
