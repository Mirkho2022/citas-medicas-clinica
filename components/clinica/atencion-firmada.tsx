import { Lock } from "lucide-react";
import { Campo } from "@/components/clinica/campo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fechaHoraLima, type Instante } from "@/lib/ui/formato";

export interface DatosAtencionFirmada {
  fechaFirma: Instante;
  autor: string;
  motivo: string;
  diagnostico: string;
  indicaciones: string;
  paciente: {
    nombres: string;
    apellidos: string;
    tipoDocumento: "DNI" | "CE";
    documento: string;
  };
}

// Una atención firmada (DESIGN.md): inmutable y se ve como tal. Lleva el sello «Firmada» con candado, la fecha y el autor, la
// ficha del paciente en solo lectura y NINGÚN botón de editar: la única corrección es «Agregar addenda». La firma de verdad
// y la addenda las implementa H6; `accionAddenda` es la pantalla quien la aporta (por defecto, el botón sin comportamiento).
export function AtencionFirmada({
  id,
  atencion,
  accionAddenda,
}: {
  id: string;
  atencion: DatosAtencionFirmada;
  accionAddenda?: React.ReactNode;
}) {
  const { paciente } = atencion;
  return (
    <Card data-slot="atencion-firmada">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Atención clínica</CardTitle>
          <Badge variant="neutral">
            <Lock aria-hidden="true" />
            Firmada
          </Badge>
        </div>
        <p className="text-body-sm text-muted-foreground tabular-nums">
          {fechaHoraLima(atencion.fechaFirma)} · {atencion.autor}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section aria-labelledby={`${id}-paciente`} className="flex flex-col gap-3">
          <h3 id={`${id}-paciente`} className="font-heading text-label-lg text-foreground">
            Datos del paciente
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id={`${id}-nombres`}
              etiqueta="Nombres y apellidos"
              value={`${paciente.nombres} ${paciente.apellidos}`}
              soloLectura
            />
            <Campo
              id={`${id}-documento`}
              etiqueta="Documento de identidad"
              value={`${paciente.tipoDocumento} ${paciente.documento}`}
              soloLectura
            />
          </div>
        </section>
        <dl className="flex flex-col gap-4 text-body-md">
          <div>
            <dt className="text-label-md text-muted-foreground">Motivo de consulta</dt>
            <dd>{atencion.motivo}</dd>
          </div>
          <div>
            <dt className="text-label-md text-muted-foreground">Diagnóstico</dt>
            <dd>{atencion.diagnostico}</dd>
          </div>
          <div>
            <dt className="text-label-md text-muted-foreground">Indicaciones</dt>
            <dd>{atencion.indicaciones}</dd>
          </div>
        </dl>
        <div className="border-t border-border pt-4">
          {accionAddenda ?? <Button variant="secondary">Agregar addenda</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
