import { Esqueleto } from "@/components/clinica/esqueleto";

// Estado de carga de «Mis citas» (DESIGN.md: esqueletos con la forma del contenido).
export function CargandoMisCitas() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando sus citas…</span>
      <Esqueleto className="h-9 w-40" />
      <Esqueleto className="h-12 w-full rounded-md" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }, (_, i) => (
          <Esqueleto key={i} className="h-44 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
