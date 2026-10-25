// Ajustado a docs/02-diseno/DESIGN.md (H2b). Si regenera este archivo con la CLI de shadcn/ui, reaplique estos ajustes (git diff).
import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-md border border-input bg-surface px-3.5 py-2.5 text-body-md text-foreground outline-none placeholder:text-muted-foreground read-only:border-border read-only:bg-muted disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
