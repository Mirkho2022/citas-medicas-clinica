import { FilePen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BorradorSinFirmar } from "@/lib/historia/tipos";
import { fechaHoraLima } from "@/lib/ui/formato";

// Borradores sin firmar de la historia: solo quién y cuándo, SIN contenido. Un médico a cargo ve (por la política de H2) los
// borradores de otro médico: aquí se etiquetan «Borrador sin firmar» para que un texto incompleto no se lea como definitivo, y
// no se muestra lo escrito (design.md, D6 H9).
export function BorradoresSinFirmar({ borradores }: { borradores: BorradorSinFirmar[] }) {
  if (borradores.length === 0) return null;
  return (
    <Card size="sm" data-slot="borradores-sin-firmar">
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-title-md text-ink">Borradores sin firmar</h2>
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">
          Atenciones empezadas que todavía no son parte del registro firmado. No se muestra su contenido.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {borradores.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-md">
              <Badge variant="warning">
                <FilePen aria-hidden="true" />
                Borrador sin firmar
              </Badge>
              <span className="tabular-nums">
                {fechaHoraLima(b.creadoEn)} · {b.propio ? "Suyo" : b.autor}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
