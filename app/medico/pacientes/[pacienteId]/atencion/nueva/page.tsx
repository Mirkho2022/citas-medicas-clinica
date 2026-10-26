import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { abrirFormularioNuevo, esUuid } from "@/lib/atencion/consultas";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { exigirRol } from "@/lib/auth/rol";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { CargandoAtencion, ErrorAtencion, HistoriaNoHabilitada } from "../_componentes/estados";
import { FichaLateral } from "../_componentes/ficha-lateral";
import { FormularioAtencion } from "../_componentes/formulario-atencion";

// Título uniforme: no revela el nombre del paciente en la pestaña ni en el historial (design.md, D8).
export const metadata: Metadata = { title: "Historia clínica" };
export const dynamic = "force-dynamic";

// Nueva atención (specs/registro-de-atencion): una sola pantalla con la ficha y los antecedentes a la vista, y la barra fija de
// guardar y firmar. La protección es por recurso: sesión, rol médico y MFA; el acceso al paciente lo decide la RLS (si el médico no
// lo tiene a cargo, el registro del acceso falla y no se muestra nada clínico).
export default async function PaginaNuevaAtencion({
  params,
  searchParams,
}: {
  params: Promise<{ pacienteId: string }>;
  searchParams: Promise<{ cita?: string | string[] }>;
}) {
  await auth.protect();
  await exigirRol("medico");
  if (!(await tieneMfaActivo())) redirect("/configurar-mfa");

  const { pacienteId } = await params;
  if (!esUuid(pacienteId)) notFound();
  const consulta = await searchParams;
  const cita = Array.isArray(consulta.cita) ? consulta.cita[0] : consulta.cita;
  const urlFicha = `/medico/pacientes/${pacienteId}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href={urlFicha} className="inline-flex w-fit items-center gap-1.5 text-label-md text-primary-text underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a la historia
        </Link>
        <h1 className="font-display text-headline-lg text-ink">Nueva atención</h1>
      </div>
      <Suspense fallback={<CargandoAtencion />}>
        <ContenidoNueva pacienteId={pacienteId} citaId={cita ?? null} urlFicha={urlFicha} />
      </Suspense>
    </div>
  );
}

async function ContenidoNueva({ pacienteId, citaId, urlFicha }: { pacienteId: string; citaId: string | null; urlFicha: string }) {
  const apertura = await abrirFormularioNuevo(ejecutorAutenticado, pacienteId, citaId);
  if (apertura.estado === "no_existe") notFound();
  if (apertura.estado === "no_habilitada") return <HistoriaNoHabilitada urlFicha={urlFicha} />;
  if (apertura.estado === "error") return <ErrorAtencion />;

  const { paciente, antecedentes, cita } = apertura.datos;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <FormularioAtencion
        modo="nueva"
        pacienteId={paciente.id}
        citaId={cita?.id ?? null}
        motivoInicial={cita?.motivo ?? ""}
        urlFicha={urlFicha}
        urlBusqueda={`/medico/pacientes/${paciente.id}/atencion/cie10`}
      />
      <FichaLateral paciente={paciente} antecedentes={antecedentes} />
    </div>
  );
}
