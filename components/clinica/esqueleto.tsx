import { cn } from "@/lib/utils";

// Esqueleto de carga (docs/DESIGN.md, «Motion»): un bloque con la forma del contenido al que sustituye. El brillo y su
// excepción con «Reducir movimiento» los pone la clase `.esqueleto` de app/globals.css. Es decoración: no lo lee el lector de
// pantalla; la página que lo usa anuncia «Cargando…» con `role="status"`.
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("esqueleto h-4 rounded-sm", className)} />;
}

// Esqueleto de una tabla de la consola: cabecera y filas de 40 px (DESIGN.md).
export function EsqueletoTabla({ filas = 8, texto = "Cargando…" }: { filas?: number; texto?: string }) {
  return (
    <div role="status" className="rounded-lg border border-border bg-surface">
      <span className="sr-only">{texto}</span>
      <div className="border-b border-border bg-muted px-4 py-3">
        <Esqueleto className="h-3 w-1/3" />
      </div>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex h-10 items-center gap-4 border-b border-border px-4 last:border-b-0">
          <Esqueleto className="w-16" />
          <Esqueleto className="w-1/4" />
          <Esqueleto className="w-24" />
          <Esqueleto className="flex-1" />
        </div>
      ))}
    </div>
  );
}
