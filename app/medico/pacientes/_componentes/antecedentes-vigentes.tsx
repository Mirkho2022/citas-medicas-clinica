import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_TIPO_ANTECEDENTE } from "@/lib/historia/formato";
import { TIPOS_ANTECEDENTE, type Antecedente } from "@/lib/historia/tipos";

// Antecedentes vigentes del paciente (ADR-0015), agrupados por tipo en un orden fijo. Solo se muestran los vigentes: lo que se
// marcó como no vigente sigue guardado en la base, pero no forma parte de la historia que se lee de corrido.
export function AntecedentesVigentes({ antecedentes }: { antecedentes: Antecedente[] }) {
  const grupos = TIPOS_ANTECEDENTE.map((tipo) => ({
    tipo,
    items: antecedentes.filter((a) => a.tipo === tipo),
  })).filter((g) => g.items.length > 0);

  return (
    <Card size="sm" data-slot="antecedentes-vigentes">
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-title-md text-ink">Antecedentes vigentes</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {grupos.length === 0 ? (
          <p className="text-body-md text-muted-foreground">Sin antecedentes vigentes registrados.</p>
        ) : (
          grupos.map(({ tipo, items }) => (
            <section key={tipo} aria-labelledby={`antecedentes-${tipo}`} className="flex flex-col gap-1.5">
              <h3 id={`antecedentes-${tipo}`} className="text-label-md text-muted-foreground">
                {ETIQUETA_TIPO_ANTECEDENTE[tipo]}
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-body-md marker:text-muted-foreground">
                {items.map((a) => (
                  <li key={a.id} className="whitespace-pre-line break-words">
                    {a.descripcion}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
