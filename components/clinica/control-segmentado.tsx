import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpcionSegmentada {
  valor: string;
  texto: string;
}

// Control segmentado (docs/diseno/BRIEF-DISENO.md, sección 5): una opción entre pocas, a la vista (sexo, filtros). Son botones de
// radio nativos con aspecto de segmentos: se envían con el formulario, se operan con las flechas del teclado y el lector de
// pantalla los anuncia como un grupo. La opción marcada no se distingue solo por el color: lleva el fondo de selección Y un borde
// de marca. Un error se muestra debajo, con icono y como alerta (DESIGN.md, «Campo de formulario»).
export function ControlSegmentado({
  nombre,
  etiqueta,
  opciones,
  valorInicial,
  error,
  className,
}: {
  nombre: string;
  etiqueta: string;
  opciones: readonly OpcionSegmentada[];
  valorInicial?: string;
  error?: string;
  className?: string;
}) {
  const idError = error ? `${nombre}-error` : undefined;
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-1.5", className)} aria-describedby={idError}>
      <legend className="mb-1.5 text-label-md text-foreground">{etiqueta}</legend>
      <div className="inline-flex self-start overflow-hidden rounded-md border border-border-control bg-surface">
        {opciones.map((opcion) => (
          <label key={opcion.valor} className="relative cursor-pointer border-l border-border-control first:border-l-0">
            <input
              type="radio"
              name={nombre}
              value={opcion.valor}
              defaultChecked={opcion.valor === valorInicial}
              className="peer sr-only"
            />
            <span className="flex min-h-9 min-w-12 items-center justify-center px-4 text-label-md text-primary-text transition-colors hover:bg-primary-soft peer-checked:bg-primary-soft peer-checked:shadow-[inset_0_0_0_2px_var(--color-primary)] peer-focus-visible:shadow-focus-ring">
              {opcion.texto}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={idError} role="alert" className="flex items-start gap-2 text-body-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
