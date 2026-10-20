import { Esqueleto, EsqueletoTabla } from "@/components/clinica/esqueleto";

// Estado de carga de la agenda (DESIGN.md: esqueletos con la forma del contenido).
export default function CargandoAgenda() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-56" />
        <Esqueleto className="h-4 w-80" />
      </div>
      <div className="flex gap-3">
        <Esqueleto className="h-9 w-72" />
        <Esqueleto className="h-9 w-64" />
      </div>
      <EsqueletoTabla filas={10} texto="Cargando la agenda…" />
    </div>
  );
}
