import * as React from "react";
import { CircleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface OpcionDeSeleccion {
  valor: string;
  texto: string;
}

// Selección de una opción de una lista (un `select` nativo, accesible y usable en el móvil) con el mismo contrato que `Campo`
// (DESIGN.md): etiqueta visible ENCIMA, ayuda y error debajo y asociados con `aria-describedby`; el error se anuncia como alerta y lleva
// icono. La primera opción es un marcador sin valor («Seleccione una enfermera»), que se envía vacío y la validación del servidor rechaza.
export function CampoSeleccion({
  id,
  etiqueta,
  marcador,
  opciones,
  ayuda,
  error,
  requerido = false,
  className,
  ...resto
}: Omit<React.ComponentProps<"select">, "id" | "aria-describedby" | "aria-invalid" | "required" | "children"> & {
  id: string;
  etiqueta: string;
  marcador: string;
  opciones: readonly OpcionDeSeleccion[];
  ayuda?: string;
  error?: string;
  requerido?: boolean;
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  const describedBy = [idAyuda, idError].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {etiqueta}
        {requerido ? (
          <>
            {" "}
            <span className="font-normal text-muted-foreground">(obligatorio)</span>
          </>
        ) : null}
      </Label>
      <select
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        required={requerido || undefined}
        className={cn(
          "h-11 w-full rounded-md border bg-surface px-3.5 text-body-md text-foreground",
          error ? "border-error" : "border-input",
        )}
        {...resto}
      >
        <option value="">{marcador}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {ayuda ? (
        <p id={idAyuda} className="text-body-sm text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={idError} role="alert" className="flex items-start gap-2 text-body-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
