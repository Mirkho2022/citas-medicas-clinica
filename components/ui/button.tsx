// Ajustado a docs/DESIGN.md (H2b). Si regenera este archivo con la CLI de shadcn/ui, reaplique estos ajustes (git diff).
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// DESIGN.md: 44 px de alto (48 px la acción principal del portal), radio md, texto label-lg. Un solo primario por
// pantalla; el secundario es blanco con borde de control; el destructivo solo para cancelar una cita.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-label-lg whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-dark",
        secondary:
          "border-border-control bg-surface text-primary-text hover:bg-primary-soft",
        outline:
          "border-border-control bg-surface text-primary-text hover:bg-primary-soft",
        ghost: "text-primary-text hover:bg-primary-soft",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        lg: "h-12 px-6",
        sm: "h-9 px-3 text-label-md",
        xs: "h-6 px-2 text-label-sm",
        icon: "size-11",
        "icon-lg": "size-12",
        "icon-sm": "size-9",
        "icon-xs": "size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
