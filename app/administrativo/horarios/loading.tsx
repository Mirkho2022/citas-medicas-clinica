import { Esqueleto, EsqueletoTabla } from "@/components/clinica/esqueleto";

export default function CargandoHorarios() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-40" />
        <Esqueleto className="h-4 w-2/3" />
      </div>
      <EsqueletoTabla filas={6} texto="Cargando horarios…" />
    </div>
  );
}
