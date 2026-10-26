import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ordenarPorFranja, type EnfermeraListada, type TurnoDeSemana } from "@/lib/turnos/consultas";
import { etiquetaFranja } from "@/lib/turnos/franjas";
import { diasDeLaSemana, encabezadoDeDia } from "@/lib/turnos/semana";

const RUTA = "/administrativo/turnos";

function textoDestino(t: TurnoDeSemana): string {
  const partes: string[] = [];
  if (t.medico) partes.push(`${t.medico.nombre} · ${t.medico.especialidad}`);
  if (t.servicio) partes.push(`Servicio: ${t.servicio}`);
  return partes.join(" · ");
}

// Semana de turnos de enfermería (specs/turnos-de-enfermeria; design.md, D5): una TABLA con encabezados de fila (la enfermera) y de
// columna (el día), la semana empieza el lunes. Cada celda lista los turnos de esa enfermera ese día (franja con su nombre, SIN horas, y
// el médico con su especialidad o el servicio) con «Modificar», y un «Asignar» para añadir otro. De hoy hacia atrás no hay enlaces: los
// turnos de fechas pasadas se conservan como registro y no se modifican. Si no cabe, la tabla se desplaza DENTRO de su contenedor y la
// página no desborda (la regla del cuerpo de la consola).
export function SemanaDeTurnos({
  lunes,
  hoy,
  enfermeras,
  turnos,
}: {
  lunes: string;
  hoy: string;
  enfermeras: EnfermeraListada[];
  turnos: TurnoDeSemana[];
}) {
  const dias = diasDeLaSemana(lunes);

  if (enfermeras.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-body-md text-muted-foreground">
        Todavía no hay enfermeras registradas.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <Table>
        <caption className="sr-only">
          Turnos de enfermería de la semana del {encabezadoDeDia(dias[0]!).fecha} al {encabezadoDeDia(dias[6]!).fecha}: una fila por enfermera y una
          columna por día
        </caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="min-w-36">
              Enfermera
            </TableHead>
            {dias.map((fecha) => {
              const { dia, fecha: corta } = encabezadoDeDia(fecha);
              return (
                <TableHead key={fecha} scope="col" className="min-w-40" aria-current={fecha === hoy ? "date" : undefined}>
                  <span className="block">{dia}</span>
                  <span className="block font-normal tabular-nums">
                    {corta}
                    {fecha === hoy ? " · Hoy" : ""}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {enfermeras.map((enfermera) => (
            <TableRow key={enfermera.id} className="align-top">
              <TableHead scope="row" className="h-auto whitespace-normal py-3 font-semibold text-foreground">
                {enfermera.nombre}
                {enfermera.activa ? null : <span className="block font-normal text-muted-foreground">De baja</span>}
              </TableHead>
              {dias.map((fecha) => {
                const delDia = ordenarPorFranja(turnos.filter((t) => t.enfermeraId === enfermera.id && t.fecha === fecha));
                const editable = fecha >= hoy;
                return (
                  <TableCell key={fecha} className="h-auto whitespace-normal py-2 align-top">
                    <div className="flex flex-col gap-2">
                      {delDia.map((t) => (
                        <div key={t.id} className="flex flex-col gap-0.5">
                          <span className="font-semibold">{etiquetaFranja(t.franja)}</span>
                          <span className="text-muted-foreground">{textoDestino(t)}</span>
                          {editable ? (
                            <Button asChild variant="ghost" size="xs" className="self-start">
                              <Link href={`${RUTA}/${t.id}`}>
                                Modificar<span className="sr-only"> turno de {etiquetaFranja(t.franja)} de {enfermera.nombre} del {encabezadoDeDia(fecha).fecha}</span>
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      ))}
                      {editable && enfermera.activa ? (
                        <Button asChild variant="ghost" size="xs" className="self-start">
                          <Link href={`${RUTA}/nuevo?enfermera=${enfermera.id}&fecha=${fecha}`}>
                            Asignar<span className="sr-only"> turno a {enfermera.nombre} el {encabezadoDeDia(fecha).fecha}</span>
                          </Link>
                        </Button>
                      ) : null}
                      {delDia.length === 0 && !(editable && enfermera.activa) ? (
                        <span className="text-muted-foreground">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Sin turno</span>
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
