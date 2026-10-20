import { Esqueleto, EsqueletoTabla } from "@/components/clinica/esqueleto";

export default function CargandoBajas() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-52" />
        <Esqueleto className="h-4 w-2/3" />
      </div>
      <EsqueletoTabla filas={4} texto="Cargando bajas médicas…" />
    </div>
  );
}
