import { Esqueleto } from "@/components/clinica/esqueleto";

// Estado de carga de agendar: tres bloques con la forma de los pasos.
export default function CargandoNuevaCita() {
  return (
    <div role="status" className="flex max-w-3xl flex-col gap-5">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-48" />
        <Esqueleto className="h-4 w-72" />
      </div>
      <Esqueleto className="h-24 rounded-lg" />
      <Esqueleto className="h-24 rounded-lg" />
      <Esqueleto className="h-56 rounded-lg" />
    </div>
  );
}
