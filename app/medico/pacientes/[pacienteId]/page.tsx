import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import { identificadorValido, paginaDe } from "@/lib/historia/esquemas";
import { exigirPaginaMedico } from "@/lib/historia/guardia";
import { abrirHistoria } from "@/lib/historia/repositorio";
import { AntecedentesVigentes } from "../_componentes/antecedentes-vigentes";
import { AtencionResumen } from "../_componentes/atencion-resumen";
import { BorradoresSinFirmar } from "../_componentes/borradores-sin-firmar";
import { DiagnosticosRegistrados } from "../_componentes/diagnosticos-registrados";
import { FichaDelPaciente } from "../_componentes/ficha-del-paciente";
import { PaginacionDeAtenciones } from "../_componentes/paginacion-de-atenciones";

// Título genérico: el nombre del paciente no sale en la pestaña, ni en el historial del navegador, ni en la dirección (que solo lleva
// el identificador interno). Specs/acceso-a-historia-clinica, «El contenido clínico no se escapa por canales laterales».
export const metadata: Metadata = { title: "Historia clínica" };
export const dynamic = "force-dynamic";

// Historia clínica de un paciente a cargo del médico (historias-clinicas, grupo 6.2): ficha de SOLO LECTURA, antecedentes vigentes,
// atenciones firmadas con sus addendas (paginadas) y los diagnósticos registrados. Sin adjuntos (llegan en otro grupo).
//
// La lectura y su registro de acceso van en UNA transacción (lib/historia/repositorio.ts, `abrirHistoria`): si el registro falla, no se
// devuelve nada. Un paciente que el médico no tiene a cargo, que otro médico tiene, con asignación vencida o que no existe da
// EXACTAMENTE la misma respuesta (404): la página no revela su existencia. La lectura se espera ANTES de dibujar (sin `Suspense`) a
// propósito, para que ese 404 sea un estado HTTP real y no una pantalla de «no encontrado» dentro de una respuesta 200.
export default async function PaginaHistoriaClinica({
  params,
  searchParams,
}: {
  params: Promise<{ pacienteId: string }>;
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  await auth.protect();
  await exigirPaginaMedico();

  const { pacienteId: pacienteIdCrudo } = await params;
  const pacienteId = identificadorValido(pacienteIdCrudo);
  if (!pacienteId) notFound();
  const pagina = paginaDe((await searchParams).pagina);

  const apertura = await abrirHistoria(ejecutorAutenticado, { pacienteId, pagina });

  if (apertura.estado === "no_encontrada") notFound();

  if (apertura.estado === "no_habilitada") {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-headline-lg text-ink">Historia clínica</h1>
        <Alerta tono="aviso" titulo="Historia aún no habilitada">
          La historia clínica de este paciente se habilita cuando recepción confirma su cita. Si necesita acceder antes, pida a
          recepción que confirme la cita o que le conceda acceso.
        </Alerta>
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/medico/pacientes">
              <ArrowLeft aria-hidden="true" />
              Volver a Mis pacientes
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { ficha, antecedentes, atenciones, diagnosticosRegistrados, borradores } = apertura.datos;
  const hoy = hoyLima();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/medico/pacientes">
            <ArrowLeft aria-hidden="true" />
            Mis pacientes
          </Link>
        </Button>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-headline-lg text-ink">Historia clínica</h1>
            <p className="break-words text-body-md text-muted-foreground">
              {ficha.apellidos}, {ficha.nombres} · {ficha.tipoDocumento} {ficha.numeroDocumento}
            </p>
          </div>
          {/* Único botón primario de la pantalla. La ruta del formulario la construye el registro de atenciones. */}
          <Button asChild>
            <Link href={`/medico/pacientes/${ficha.id}/atencion/nueva`} prefetch={false}>
              <ClipboardPlus aria-hidden="true" />
              Registrar atención
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <FichaDelPaciente ficha={ficha} hoy={hoy} />
          <AntecedentesVigentes antecedentes={antecedentes} />
          <DiagnosticosRegistrados diagnosticos={diagnosticosRegistrados} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="titulo-atenciones" className="flex flex-col gap-3">
            <h2 id="titulo-atenciones" className="font-display text-headline-md text-ink">
              Atenciones firmadas
            </h2>
            {atenciones.items.length > 0 ? (
              <ol className="flex flex-col gap-4" aria-label="Atenciones firmadas, de la más reciente a la más antigua">
                {atenciones.items.map((atencion) => (
                  <AtencionResumen key={atencion.id} atencion={atencion} />
                ))}
              </ol>
            ) : (
              <div className="rounded-lg border border-border bg-surface p-6">
                <p role="status" className="text-body-md text-muted-foreground">
                  {atenciones.total > 0
                    ? "No hay atenciones en esta página."
                    : "Este paciente aún no tiene atenciones firmadas."}
                </p>
                {atenciones.total > 0 ? (
                  <Button asChild variant="secondary" size="sm" className="mt-3">
                    <Link href={`/medico/pacientes/${ficha.id}`} prefetch={false}>
                      Ir a las más recientes
                    </Link>
                  </Button>
                ) : null}
              </div>
            )}
            <PaginacionDeAtenciones pacienteId={ficha.id} paginas={atenciones} />
          </section>
          <BorradoresSinFirmar borradores={borradores} />
        </div>
      </div>
    </div>
  );
}
