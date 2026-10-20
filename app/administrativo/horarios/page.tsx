import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { medicosConHorarios } from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";

// Horarios de los médicos (specs/disponibilidad-y-slots; design.md, D11): la lista de médicos con su especialidad, cuántos tramos
// semanales tienen y cuántas ausencias vigentes o futuras. Cada fila lleva a la plantilla y las ausencias del médico.
export default async function PaginaHorarios() {
  await auth.protect();
  await exigirPaginaAdministrativo();
  const medicos = await medicosConHorarios(ejecutorAutenticado);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-headline-lg text-ink">Horarios</h1>
        <p className="text-body-sm text-muted-foreground">
          La plantilla semanal de cada médico y sus ausencias. Los horarios libres de la agenda salen de aquí.
        </p>
      </div>

      {medicos.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-body-md text-muted-foreground">
          Todavía no hay médicos registrados.
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border bg-surface">
          <Table>
            <caption className="sr-only">Médicos y sus horarios</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Médico</TableHead>
                <TableHead scope="col" className="hidden md:table-cell">Servicio</TableHead>
                <TableHead scope="col" className="text-right whitespace-normal md:whitespace-nowrap">Horarios semanales</TableHead>
                <TableHead scope="col" className="text-right whitespace-normal md:whitespace-nowrap">Ausencias vigentes</TableHead>
                <TableHead scope="col" className="hidden md:table-cell">Estado</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-normal font-semibold">{m.nombre}</TableCell>
                  <TableCell className="hidden md:table-cell whitespace-normal">{m.especialidad}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.tramos}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.ausencias}</TableCell>
                  <TableCell className={m.activo ? "hidden md:table-cell" : "hidden md:table-cell text-muted-foreground"}>{m.activo ? "Activo" : "De baja"}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/administrativo/horarios/${m.id}`}>
                        Ver<span className="max-md:sr-only"> horarios</span>
                        <span className="sr-only"> de {m.nombre}</span>
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
