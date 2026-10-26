import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { abrirAtencion, esUuid } from "@/lib/atencion/consultas";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { exigirRol } from "@/lib/auth/rol";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { BotonMarcarAtendida } from "../_componentes/boton-marcar-atendida";
import { CargandoAtencion, ErrorAtencion, HistoriaNoHabilitada } from "../_componentes/estados";
import { FichaLateral } from "../_componentes/ficha-lateral";
import { FormularioAddenda } from "../_componentes/formulario-addenda";
import { FormularioAtencion } from "../_componentes/formulario-atencion";
import { VistaAtencion } from "../_componentes/vista-atencion";

export const metadata: Metadata = { title: "Historia clínica" };
export const dynamic = "force-dynamic";

// Una atención: si es un borrador y soy su autor, se edita (guardar y firmar); si está firmada, solo se lee y se le agregan addendas;
// el borrador de otro médico a cargo se ve como «Borrador sin firmar» y sin controles de edición. La RLS decide qué atenciones existen
// para el médico: una ajena y una inexistente dan el mismo 404.
export default async function PaginaAtencion({ params }: { params: Promise<{ pacienteId: string; atencionId: string }> }) {
  await auth.protect();
  await exigirRol("medico");
  if (!(await tieneMfaActivo())) redirect("/configurar-mfa");

  const { pacienteId, atencionId } = await params;
  if (!esUuid(pacienteId) || !esUuid(atencionId)) notFound();
  const urlFicha = `/medico/pacientes/${pacienteId}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href={urlFicha} className="inline-flex w-fit items-center gap-1.5 text-label-md text-primary-text underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a la historia
        </Link>
        <h1 className="font-display text-headline-lg text-ink">Atención clínica</h1>
      </div>
      <Suspense fallback={<CargandoAtencion />}>
        <ContenidoAtencion pacienteId={pacienteId} atencionId={atencionId} urlFicha={urlFicha} />
      </Suspense>
    </div>
  );
}

async function ContenidoAtencion({ pacienteId, atencionId, urlFicha }: { pacienteId: string; atencionId: string; urlFicha: string }) {
  const apertura = await abrirAtencion(ejecutorAutenticado, pacienteId, atencionId);
  if (apertura.estado === "no_existe") notFound();
  if (apertura.estado === "no_habilitada") return <HistoriaNoHabilitada urlFicha={urlFicha} />;
  if (apertura.estado === "error") return <ErrorAtencion />;

  const { paciente, antecedentes, atencion } = apertura.datos;
  const firmada = atencion.firmadaEn !== null;
  const editable = !firmada && atencion.esAutor;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-5">
        {editable ? (
          <FormularioAtencion
            modo="editar"
            pacienteId={paciente.id}
            citaId={atencion.citaId}
            atencionId={atencion.id}
            motivoInicial={atencion.motivoConsulta}
            inicial={{
              anamnesis: atencion.anamnesis,
              examen_fisico: atencion.examenFisico,
              plan_tratamiento: atencion.planTratamiento,
              diagnosticos: atencion.diagnosticos.map((d) => ({ cie10: d.cie10, descripcion: d.descripcion, tipo: d.tipo ?? "presuntivo" })),
            }}
            urlFicha={urlFicha}
            urlBusqueda={`/medico/pacientes/${paciente.id}/atencion/cie10`}
          />
        ) : (
          <>
            {!firmada ? (
              <Alerta tono="informacion">
                Este borrador es de {atencion.autor}: solo su autor puede editarlo o firmarlo.
              </Alerta>
            ) : null}
            <VistaAtencion atencion={atencion} accionAddenda={firmada ? <FormularioAddenda atencionId={atencion.id} /> : undefined} />
            {/* Aparte de la firma (design.md, D13): solo si la atención está vinculada a una cita CONFIRMADA del propio médico. */}
            {atencion.citaId && atencion.citaEstado === "confirmada" ? <BotonMarcarAtendida citaId={atencion.citaId} /> : null}
          </>
        )}
      </div>
      <FichaLateral paciente={paciente} antecedentes={antecedentes} />
    </div>
  );
}
