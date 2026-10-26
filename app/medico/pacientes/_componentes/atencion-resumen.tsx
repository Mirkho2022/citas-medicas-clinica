import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AtencionConAddendas } from "@/lib/historia/tipos";
import { fechaHoraLima, fechaLima } from "@/lib/ui/formato";

// Una atención firmada tal como se lee en la historia (DESIGN.md, «Atención firmada»): sello «Firmada» con candado, fecha y hora
// de Lima, autor, contenido y addendas en orden cronológico. NINGÚN control de edición: lo firmado es inmutable y la corrección
// es una addenda (que se agrega desde la pantalla de la atención, no desde esta lectura).
export function AtencionResumen({ atencion }: { atencion: AtencionConAddendas }) {
  const idTitulo = `atencion-${atencion.id}`;
  const firmada = atencion.firmadaEn;
  const camposAntes: Array<[string, string]> = [
    ["Motivo de consulta", atencion.motivoConsulta],
    ["Anamnesis", atencion.anamnesis],
    ["Examen físico", atencion.examenFisico],
  ];
  const camposDespues: Array<[string, string]> = [["Plan de tratamiento", atencion.planTratamiento]];
  return (
    <li>
      <Card size="sm" data-slot="atencion-firmada" role="article" aria-labelledby={idTitulo}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <h3 id={idTitulo} className="font-heading text-title-md text-ink tabular-nums">
                Atención del {fechaLima(firmada ?? atencion.creadoEn)}
              </h3>
            </CardTitle>
            <Badge variant="neutral">
              <Lock aria-hidden="true" />
              Firmada
            </Badge>
          </div>
          <p className="text-body-sm text-muted-foreground tabular-nums">
            {firmada ? fechaHoraLima(firmada) : null} · {atencion.autor}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-3 text-body-md">
            {camposAntes.map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-label-md text-muted-foreground">{etiqueta}</dt>
                <dd className="whitespace-pre-line break-words">{valor}</dd>
              </div>
            ))}
            <div>
              <dt className="text-label-md text-muted-foreground">Diagnósticos</dt>
              <dd>
                <ul className="flex flex-col gap-1">
                  {atencion.diagnosticos.map((d) => (
                    <li key={d.cie10} className="break-words">
                      <span className="tabular-nums font-semibold">{d.cie10}</span> · {d.descripcion || "Sin descripción"}
                      {d.tipo ? <span className="text-muted-foreground"> ({d.tipo})</span> : null}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            {camposDespues.map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-label-md text-muted-foreground">{etiqueta}</dt>
                <dd className="whitespace-pre-line break-words">{valor}</dd>
              </div>
            ))}
          </dl>
          {atencion.addendas.length > 0 ? (
            <section aria-label={`Addendas de la atención del ${fechaLima(firmada ?? atencion.creadoEn)}`} className="flex flex-col gap-2 border-t border-border pt-4">
              <h4 className="text-label-md text-muted-foreground">Addendas</h4>
              <ol className="flex flex-col gap-3">
                {atencion.addendas.map((a) => (
                  <li key={a.id} className="rounded-md bg-muted p-3 text-body-md">
                    <p className="whitespace-pre-line break-words">{a.texto}</p>
                    <p className="mt-1 text-body-sm text-muted-foreground tabular-nums">
                      {fechaHoraLima(a.creadoEn)} · {a.autor}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}
