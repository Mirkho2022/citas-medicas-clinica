import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Alerta } from "@/components/clinica/alerta";
import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import {
  bloqueosDelMedico,
  citasFueraDeLaPlantilla,
  esUuid,
  medicosConHorarios,
  plantillaDelMedico,
} from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { fechaHoraLima } from "@/lib/ui/formato";
import { GestorHorarios } from "./gestor-horarios";

// Horarios de un médico (specs/disponibilidad-y-slots; design.md, D11): la plantilla semanal con alta, edición y baja de tramos y
// las ausencias con alta, edición y baja. Si la plantilla actual ya no cubre citas vigentes futuras (porque se recortó o eliminó un
// tramo), se muestran aquí, SIN cancelarlas: la recepción las reprograma desde la agenda (9.3).
export default async function PaginaHorariosDelMedico({ params }: { params: Promise<{ medicoId: string }> }) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const { medicoId } = await params;
  if (!esUuid(medicoId)) notFound();

  const [medicos, tramos, ausencias, fuera] = await Promise.all([
    medicosConHorarios(ejecutorAutenticado),
    plantillaDelMedico(ejecutorAutenticado, medicoId),
    bloqueosDelMedico(ejecutorAutenticado, medicoId),
    citasFueraDeLaPlantilla(ejecutorAutenticado, medicoId),
  ]);
  const medico = medicos.find((m) => m.id === medicoId);
  if (!medico) notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/administrativo/horarios">
            <ArrowLeft aria-hidden="true" />
            Volver a Horarios
          </Link>
        </Button>
        <h1 className="font-display text-headline-lg text-ink">{medico.nombre}</h1>
        <p className="text-body-sm text-muted-foreground">
          {medico.especialidad} · {medico.activo ? "Activo" : "De baja"} · Horas en hora de Lima
        </p>
      </div>

      {fuera.length > 0 ? (
        <section aria-labelledby="titulo-fuera" className="flex flex-col gap-3">
          <Alerta tono="aviso" titulo={`${fuera.length} ${fuera.length === 1 ? "cita vigente" : "citas vigentes"} fuera del horario`}>
            <span id="titulo-fuera">
              El horario actual ya no cubre estas citas. No se cancelaron: reprográmelas desde la agenda o vuelva a abrir el horario.
            </span>
          </Alerta>
          <div className="overflow-auto rounded-lg border border-border bg-surface">
            <Table>
              <caption className="sr-only">Citas vigentes fuera del horario del médico</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">Fecha y hora</TableHead>
                  <TableHead scope="col">Paciente</TableHead>
                  <TableHead scope="col">Documento</TableHead>
                  <TableHead scope="col">Estado</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fuera.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="tabular-nums">{fechaHoraLima(c.inicio)}</TableCell>
                    <TableCell className="whitespace-normal">{c.paciente}</TableCell>
                    <TableCell className="tabular-nums">{c.documento}</TableCell>
                    <TableCell>
                      <InsigniaEstado estado={c.estado} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/administrativo/agenda/nueva?reprogramar=${c.id}`}>
                          Reprogramar<span className="sr-only"> la cita de {c.paciente}</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <GestorHorarios medicoId={medicoId} tramos={tramos} ausencias={ausencias} activo={medico.activo} />
    </div>
  );
}
