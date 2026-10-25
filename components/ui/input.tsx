// Ajustado a docs/02-diseno/DESIGN.md (H2b). Si regenera este archivo con la CLI de shadcn/ui, reaplique estos ajustes (git diff).
import * as React from "react"
import { cn } from "@/lib/utils"

// DESIGN.md: 44 px de alto, relleno 10×14 px, borde de control, radio md; el error cambia el borde a `error` y un campo de
// solo lectura usa `surface-muted` sin borde de control (y sin `disabled`: el dato sigue siendo seleccionable).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3.5 py-2.5 text-body-md text-foreground tabular-nums outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-label-md file:text-foreground placeholder:text-muted-foreground read-only:border-border read-only:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
