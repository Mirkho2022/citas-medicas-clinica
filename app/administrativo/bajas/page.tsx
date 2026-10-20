import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { bajasVigentes } from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { fechaHoraLima } from "@/lib/ui/formato";

// Bajas médicas (specs/reasignacion-por-baja-medica; ADR-0011): las ausencias vigentes o futuras de los médicos, con cuántas citas
// quedan por reasignar a un sustituto y cuántas por contactar al paciente (no hay sustituto libre). Se calcula al leer: una cita
// sale sola de la cuenta al reasignarla, cancelarla o terminar. Una baja se registra como ausencia en Horarios.
export default async function PaginaBajas() {
  await auth.protect();
  await exigirPaginaAdministrativo();
  const bajas = await bajasVigentes(ejecutorAutenticado);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-headline-lg text-ink">Bajas médicas</h1>
        <p className="text-body-sm text-muted-foreground">
          Ausencias de los médicos con citas que reasignar. Durante una baja no aplica la ventana de 1 hora.
        </p>
      </div>

      {bajas.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-6">
          <p className="text-title-md text-ink">No hay bajas vigentes ni futuras</p>
          <p className="text-body-md text-muted-foreground">Para registrar una baja, agregue una ausencia al médico en Horarios.</p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/administrativo/horarios">Ir a Horarios</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border bg-surface">
          <Table>
            <caption className="sr-only">Bajas vigentes y futuras de los médicos</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Médico</TableHead>
                <TableHead scope="col" className="hidden md:table-cell">Periodo (hora de Lima)</TableHead>
                <TableHead scope="col" className="hidden md:table-cell">Motivo</TableHead>
                <TableHead scope="col" className="text-right whitespace-normal md:whitespace-nowrap">Por reasignar</TableHead>
                <TableHead scope="col" className="text-right whitespace-normal md:whitespace-nowrap">Por contactar</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bajas.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-normal">
                    <span className="font-semibold">{b.medico}</span>
                    <span className="block text-muted-foreground">{b.especialidad}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell tabular-nums">
                    {fechaHoraLima(b.desde)} → {fechaHoraLima(b.hasta)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell whitespace-normal">{b.motivo}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.porReasignar - b.porContactar}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.porContactar}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant={b.porReasignar > 0 ? "secondary" : "ghost"} size="sm">
                      <Link href={`/administrativo/bajas/${b.id}`}>
                        {b.porReasignar > 0 ? "Reasignar" : "Ver"}
                        <span className="sr-only"> citas de {b.medico}</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
