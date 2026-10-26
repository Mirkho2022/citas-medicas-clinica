import { Lock, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AtencionDetalle } from "@/lib/atencion/consultas";
import { ETIQUETA_TIPO_DIAGNOSTICO, type TipoDiagnostico } from "@/lib/schemas/atencion";
import { fechaHoraLima } from "@/lib/ui/formato";

function Texto({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <dt className="text-label-md text-muted-foreground">{titulo}</dt>
      {/* Texto clínico: se muestra tal como se escribió (saltos de línea conservados) y SIEMPRE como texto, nunca como marcado. */}
      <dd className="whitespace-pre-wrap break-words text-body-md">{texto}</dd>
    </div>
  );
}

// Presentación de una atención (specs/firma-y-addendas, «Presentación de la atención firmada»): firmada = etiqueta «Firmada» con
// candado, fecha y hora de Lima, autor, addendas en orden cronológico y NINGÚN botón de editar (la única corrección es agregar una
// addenda, que aporta la pantalla en `accionAddenda`). Un borrador se ve como «Borrador sin firmar». No declara validez legal.
export function VistaAtencion({ atencion, accionAddenda }: { atencion: AtencionDetalle; accionAddenda?: React.ReactNode }) {
  const firmada = atencion.firmadaEn !== null;
  return (
    <Card data-slot="atencion" data-estado={firmada ? "firmada" : "borrador"}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Atención clínica</CardTitle>
          {firmada ? (
            <Badge variant="neutral">
              <Lock aria-hidden="true" />
              Firmada
            </Badge>
          ) : (
            <Badge variant="warning">
              <PencilLine aria-hidden="true" />
              Borrador sin firmar
            </Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground tabular-nums">
          {firmada ? `Firmada el ${fechaHoraLima(atencion.firmadaEn!)}` : `Creada el ${fechaHoraLima(atencion.creadaEn)}`} · {atencion.autor}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="flex flex-col gap-4">
          <Texto titulo="Motivo de consulta" texto={atencion.motivoConsulta} />
          <Texto titulo="Anamnesis" texto={atencion.anamnesis} />
          <Texto titulo="Examen físico" texto={atencion.examenFisico} />
          <div>
            <dt className="text-label-md text-muted-foreground">Diagnósticos</dt>
            <dd>
              <ul className="list-disc pl-5 text-body-md">
                {atencion.diagnosticos.map((d) => (
                  <li key={d.cie10}>
                    <span className="tabular-nums">{d.cie10}</span> · {d.descripcion}
                    {d.tipo && d.tipo in ETIQUETA_TIPO_DIAGNOSTICO ? ` (${ETIQUETA_TIPO_DIAGNOSTICO[d.tipo as TipoDiagnostico].toLowerCase()})` : ""}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <Texto titulo="Plan de tratamiento" texto={atencion.planTratamiento} />
        </dl>

        {firmada ? (
          <section aria-labelledby="addendas-titulo" className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 id="addendas-titulo" className="font-heading text-label-lg text-foreground">
              Addendas
            </h3>
            {atencion.addendas.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">Esta atención no tiene addendas.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {atencion.addendas.map((a) => (
                  <li key={a.id} className="rounded-md border border-border bg-muted px-3.5 py-2.5">
                    <p className="text-body-sm text-muted-foreground tabular-nums">
                      {fechaHoraLima(a.creadaEn)} · {a.autor}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-body-md">{a.texto}</p>
                  </li>
                ))}
              </ol>
            )}
            {accionAddenda}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
