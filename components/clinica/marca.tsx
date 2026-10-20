import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

// Marca de la aplicación: icono y nombre en el verde de marca (DESIGN.md). Sin logotipo: es texto con un icono genérico.
// Mientras la clínica no tenga marca propia, lleva la etiqueta provisional DEMO (docs/diseno/BRIEF-DISENO.md, sección 1): se
// retira aquí, en un solo sitio, cuando exista.
export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-display text-title-md text-primary-text", className)}>
      <HeartPulse className="size-6" aria-hidden="true" />
      Citas Médicas
      <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 font-sans text-label-sm text-muted-foreground">DEMO</span>
    </span>
  );
}
