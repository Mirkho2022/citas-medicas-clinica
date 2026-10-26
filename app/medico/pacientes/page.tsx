import { auth } from "@clerk/nextjs/server";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoTabla } from "@/components/clinica/esqueleto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { busquedaDe } from "@/lib/historia/esquemas";
import { MAXIMO_LARGO_BUSQUEDA } from "@/lib/historia/busqueda";
import { exigirPaginaMedico } from "@/lib/historia/guardia";
import { ListaDePacientes } from "./_componentes/lista-de-pacientes";

export const metadata: Metadata = { title: "Mis pacientes" };

// Cada solicitud depende de la sesión y de la base: nunca se genera ni se guarda de antemano (specs/acceso-a-historia-clinica,
// «El contenido clínico no se escapa por canales laterales»).
export const dynamic = "force-dynamic";

// «Mis pacientes» (historias-clinicas, grupo 6.1): los pacientes que el médico tiene a cargo (asignación vigente), con búsqueda por
// apellidos, nombres o documento DENTRO de esa lista. Un paciente del que solo hay una cita reservada no aparece. La búsqueda es
// un formulario GET: el texto vive en la dirección (`?q=`) y la lista se lee en el servidor con la identidad del médico. La guarda
// (sesión, rol de médico y MFA) es la de la propia página; la autoridad sobre qué filas existen es la RLS.
export default async function PaginaMisPacientes({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await auth.protect();
  await exigirPaginaMedico();

  const busqueda = busquedaDe((await searchParams).q);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-headline-lg text-ink">Mis pacientes</h1>
        <p className="text-body-sm text-muted-foreground">
          Los pacientes que tiene a su cargo. Busque por apellidos, nombres o documento.
        </p>
      </div>

      <form method="get" action="/medico/pacientes" role="search" className="flex max-w-xl flex-col gap-1.5">
        <Label htmlFor="busqueda">Buscar entre mis pacientes</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="busqueda"
              name="q"
              type="search"
              defaultValue={busqueda}
              placeholder="Apellidos, nombres o documento"
              autoComplete="off"
              maxLength={MAXIMO_LARGO_BUSQUEDA}
              className="h-9 pl-10"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Buscar
          </Button>
        </div>
      </form>

      {/* `Suspense` propio en vez de `loading.tsx` (rompe la navegación; ver docs/07-testing/pruebas-e2e.md). La clave hace que
          cada búsqueda monte un límite nuevo y muestre su esqueleto. */}
      <Suspense key={busqueda} fallback={<EsqueletoTabla filas={5} texto="Cargando pacientes…" />}>
        <ListaDePacientes busqueda={busqueda} />
      </Suspense>
    </div>
  );
}
