import * as React from "react";
import { CircleAlert, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface CampoProps
  extends Omit<
    React.ComponentProps<"input">,
    "id" | "aria-describedby" | "aria-invalid" | "readOnly" | "required"
  > {
  id: string;
  etiqueta: string;
  ayuda?: string;
  error?: string;
  // Dato que viene del registro del paciente: se ve como tal, se puede seleccionar y copiar, pero no se edita. No se usa
  // `disabled`, que lo haría ilegible y no seleccionable.
  soloLectura?: boolean;
  requerido?: boolean;
  multilinea?: boolean;
}

// Campo de formulario (DESIGN.md): etiqueta visible ENCIMA del control, ayuda y error debajo y asociados con
// `aria-describedby`; el error se anuncia como alerta, lleva icono y cambia el borde a `error`.
export function Campo({
  id,
  etiqueta,
  ayuda,
  error,
  soloLectura = false,
  requerido = false,
  multilinea = false,
  className,
  ...resto
}: CampoProps) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  const idSoloLectura = soloLectura ? `${id}-solo-lectura` : undefined;
  const describedBy = [idSoloLectura, idAyuda, idError].filter(Boolean).join(" ") || undefined;
  const comunes = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    readOnly: soloLectura || undefined,
    required: requerido || undefined,
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {etiqueta}
          {requerido ? (
            <>
              {" "}
              <span className="font-normal text-muted-foreground">(obligatorio)</span>
            </>
          ) : null}
        </Label>
        {soloLectura ? (
          <span
            id={idSoloLectura}
            className="inline-flex items-center gap-1 text-label-sm text-muted-foreground"
          >
            <Lock className="size-3.5" aria-hidden="true" />
            Solo lectura
          </span>
        ) : null}
      </div>
      {multilinea ? (
        <Textarea {...comunes} {...(resto as React.ComponentProps<"textarea">)} />
      ) : (
        <Input {...comunes} {...resto} />
      )}
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
