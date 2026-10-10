// Ajustado a docs/DESIGN.md (H2b). Si regenera este archivo con la CLI de shadcn/ui, reaplique estos ajustes (git diff).
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// DESIGN.md: insignia de estado en píldora (radio full), texto label-sm y relleno 4×10 px. Los tonos (info, success,
// neutral, error, warning) son los de los cinco estados de cita; ver lib/ui/estados-cita.ts.
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-1 text-label-sm whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border-control text-foreground",
        info: "bg-info-soft text-info",
        success: "bg-success-soft text-success",
        neutral: "bg-neutral-state-soft text-neutral-state",
        error: "bg-error-soft text-error",
        warning: "bg-warning-soft text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
