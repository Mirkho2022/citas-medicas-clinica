import Link from "next/link";
import { Button } from "@/components/ui/button";

// «No encontrado» de las pantallas clínicas del médico. Es la MISMA pantalla para un paciente que no existe, que otro médico tiene a
// cargo, con asignación vencida o con un identificador mal formado: no dice cuál de los casos es (specs/acceso-a-historia-clinica,
// «Médico sin asignación»). No lleva ningún dato del paciente ni de la dirección pedida.
export default function NoEncontrado() {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-3">
      <h1 className="font-display text-headline-lg text-ink">No se encontró la página</h1>
      <p className="text-body-md text-muted-foreground">
        La historia clínica que busca no existe o usted no tiene acceso a ella. Revise la lista de sus pacientes.
      </p>
      <Button asChild variant="secondary" size="sm">
        <Link href="/medico/pacientes">Ir a Mis pacientes</Link>
      </Button>
    </div>
  );
}
