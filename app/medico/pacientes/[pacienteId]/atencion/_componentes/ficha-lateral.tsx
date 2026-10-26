import { Lock } from "lucide-react";
import type { AntecedenteVigente, FichaPaciente } from "@/lib/atencion/consultas";

const ETIQUETA_ANTECEDENTE: Record<string, string> = {
  personal_patologico: "Personal patológico",
  quirurgico: "Quirúrgico",
  alergico: "Alérgico",
  familiar: "Familiar",
  habito_nocivo: "Hábito nocivo",
};

// «YYYY-MM-DD» → «dd/MM/yyyy» sin pasar por zonas horarias (es una fecha de calendario, no un instante).
function fechaCalendario(valor: string): string {
  const [a, m, d] = valor.split("-");
  return a && m && d ? `${d}/${m}/${a}` : valor;
}

// Ficha del paciente (DESIGN.md) y antecedentes vigentes, siempre a la vista junto al formulario. Es TEXTO, sin ningún control: los
// datos que vienen del registro del paciente son de solo lectura desde la historia clínica (PRD; CLAUDE.md).
export function FichaLateral({ paciente, antecedentes }: { paciente: FichaPaciente; antecedentes: AntecedenteVigente[] }) {
  const porTipo = new Map<string, AntecedenteVigente[]>();
  for (const a of antecedentes) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a]);

  return (
    <aside aria-label="Paciente y antecedentes" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
      <section aria-labelledby="ficha-paciente" className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="ficha-paciente" className="font-heading text-label-lg text-foreground">
            Datos del paciente
          </h2>
          <span className="inline-flex items-center gap-1 text-label-sm text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Solo lectura
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-body-md">
          <div>
            <dt className="text-label-md text-muted-foreground">Nombres y apellidos</dt>
            <dd data-testid="ficha-nombre">
              {paciente.nombres} {paciente.apellidos}
            </dd>
          </div>
          <div>
            <dt className="text-label-md text-muted-foreground">Documento de identidad</dt>
            <dd className="tabular-nums">
              {paciente.tipoDocumento} {paciente.numeroDocumento}
            </dd>
          </div>
          <div>
            <dt className="text-label-md text-muted-foreground">Fecha de nacimiento</dt>
            <dd className="tabular-nums">{fechaCalendario(paciente.fechaNacimiento)}</dd>
          </div>
          <div>
            <dt className="text-label-md text-muted-foreground">Sexo</dt>
            <dd>{paciente.sexo}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="ficha-antecedentes" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="ficha-antecedentes" className="font-heading text-label-lg text-foreground">
          Antecedentes vigentes
        </h2>
        {antecedentes.length === 0 ? (
          <p className="mt-2 text-body-sm text-muted-foreground">No hay antecedentes vigentes registrados.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {[...porTipo.entries()].map(([tipo, lista]) => (
              <div key={tipo}>
                <h3 className="text-label-md text-muted-foreground">{ETIQUETA_ANTECEDENTE[tipo] ?? tipo}</h3>
                <ul className="list-disc pl-5 text-body-md">
                  {lista.map((a) => (
                    <li key={a.id} className="whitespace-pre-line">
                      {a.descripcion}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

