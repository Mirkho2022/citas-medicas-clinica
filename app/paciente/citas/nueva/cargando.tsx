import { Esqueleto } from "@/components/clinica/esqueleto";

// Estado de carga de «Reservar cita» (DESIGN.md: esqueletos con la forma del contenido). Un paso busca horarios en la base de datos y
// puede tardar un momento; el texto va en una región `status` para el lector de pantalla y el esqueleto es decoración.
export function CargandoReservar() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Buscando horarios…</span>
      <Esqueleto className="h-9 w-56" />
      <Esqueleto className="h-5 w-72 max-w-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Esqueleto key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
