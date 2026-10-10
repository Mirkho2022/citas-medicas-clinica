import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

// Marca de la aplicación: icono y nombre en el verde de marca (DESIGN.md). Sin logotipo: es texto con un icono genérico.
export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-display text-title-md text-primary-text", className)}>
      <HeartPulse className="size-6" aria-hidden="true" />
      Citas Médicas
    </span>
  );
}
