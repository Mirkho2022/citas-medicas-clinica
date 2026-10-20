import { Esqueleto, EsqueletoTabla } from "@/components/clinica/esqueleto";

// Estado de carga de Pacientes (DESIGN.md: esqueletos con la forma del contenido, no un indicador giratorio a pantalla completa).
export default function CargandoPacientes() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-48" />
        <Esqueleto className="h-4 w-2/3" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="flex flex-col gap-3">
          <Esqueleto className="h-9" />
          <EsqueletoTabla filas={5} texto="Cargando pacientes…" />
        </div>
        <Esqueleto className="h-[28rem] rounded-lg" />
      </div>
    </div>
  );
}
