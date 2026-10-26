import Link from "next/link";
import { Alerta } from "@/components/clinica/alerta";
import { Esqueleto } from "@/components/clinica/esqueleto";
import { Button } from "@/components/ui/button";

// Estado de carga mientras se lee la historia (con `Suspense`, no con `loading.tsx`: ver docs/07-testing/pruebas-e2e.md).
export function CargandoAtencion() {
  return (
    <div role="status" className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-20 w-full" />
        <Esqueleto className="h-32 w-full" />
        <Esqueleto className="h-24 w-full" />
        <Esqueleto className="h-28 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-40 w-full" />
        <Esqueleto className="h-28 w-full" />
      </div>
    </div>
  );
}

// El médico ve al paciente (tiene una cita con él) pero aún no lo tiene a cargo: la asignación nace al confirmarse la cita.
export function HistoriaNoHabilitada({ urlFicha }: { urlFicha: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Alerta tono="informacion" titulo="Historia aún no habilitada">
        La historia clínica de este paciente se habilita cuando la cita se confirma. Si necesita acceso antes, pida a la recepción que
        confirme la cita o registre una asignación.
      </Alerta>
      <div>
        <Button asChild variant="secondary">
          <Link href={urlFicha}>Volver</Link>
        </Button>
      </div>
    </div>
  );
}

export function ErrorAtencion() {
  return <Alerta tono="error">No se pudo abrir la pantalla. Intente de nuevo en unos segundos.</Alerta>;
}
