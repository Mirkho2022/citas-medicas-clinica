import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { esEstadoActivo, type EstadoCita } from "@/lib/ui/estados-cita";
import { fechaHoraLima, type Instante } from "@/lib/ui/formato";

export interface FilaAgenda {
  id: string;
  inicio: Instante;
  estado: EstadoCita;
  servicio: string;
  medico: string;
  paciente: {
    nombres: string;
    apellidos: string;
    tipoDocumento: "DNI" | "CE";
    documento: string;
  };
}

// Tabla de la agenda para la consola del personal (DESIGN.md): filas de 40 px, cifras tabulares, estado con insignia. Las
// acciones (`acciones`) se piden solo para citas activas (reservada o confirmada): una cita cancelada, atendida o
// que no asistió no ofrece reprogramar ni cancelar. Si hay más columnas de las que caben, la tabla se desplaza dentro de
// su contenedor y la página no desborda.
export function TablaAgenda({
  titulo,
  citas,
  acciones,
  vacio,
}: {
  titulo: string;
  citas: FilaAgenda[];
  acciones?: (cita: FilaAgenda) => React.ReactNode;
  vacio?: React.ReactNode;
}) {
  if (citas.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-body-md text-muted-foreground">
        {vacio ?? "No hay citas para mostrar."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <Table>
        <caption className="sr-only">{titulo}</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Fecha y hora</TableHead>
            <TableHead scope="col">Paciente</TableHead>
            <TableHead scope="col">Documento</TableHead>
            <TableHead scope="col">Médico y servicio</TableHead>
            <TableHead scope="col">Estado</TableHead>
            {acciones ? <TableHead scope="col">Acciones</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {citas.map((cita) => (
            <TableRow key={cita.id}>
              <TableCell>{fechaHoraLima(cita.inicio)}</TableCell>
              <TableCell className="whitespace-normal">
                {cita.paciente.nombres} {cita.paciente.apellidos}
              </TableCell>
              <TableCell>
                {cita.paciente.tipoDocumento} {cita.paciente.documento}
              </TableCell>
              <TableCell className="whitespace-normal">
                {cita.medico} · {cita.servicio}
              </TableCell>
              <TableCell>
                <InsigniaEstado estado={cita.estado} />
              </TableCell>
              {acciones ? (
                <TableCell>
                  <div className="flex gap-2">
                    {esEstadoActivo(cita.estado) ? acciones(cita) : null}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
