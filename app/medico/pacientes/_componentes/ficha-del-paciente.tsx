import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_SEXO, fechaDeCalendario, textoEdad } from "@/lib/historia/formato";
import type { FichaPaciente } from "@/lib/historia/tipos";

// Ficha del paciente en la historia clínica (specs/acceso-a-historia-clinica, «La ficha del paciente es de solo lectura»): los
// datos del registro se muestran como TEXTO, sin ningún control de edición; solo el administrativo los corrige, desde su área.
// No lleva dirección: no hace falta para atender (se muestra lo mínimo necesario).
export function FichaDelPaciente({ ficha, hoy }: { ficha: FichaPaciente; hoy: string }) {
  const edad = textoEdad(ficha.fechaNacimiento, hoy);
  const datos: Array<[string, string]> = [
    ["Nombres y apellidos", `${ficha.nombres} ${ficha.apellidos}`],
    ["Documento de identidad", `${ficha.tipoDocumento} ${ficha.numeroDocumento}`],
    ["Fecha de nacimiento", `${fechaDeCalendario(ficha.fechaNacimiento)}${edad ? ` (${edad})` : ""}`],
    ["Sexo", ETIQUETA_SEXO[ficha.sexo] ?? ficha.sexo],
    ["Teléfono", ficha.telefono ?? "No registrado"],
    ["Correo electrónico", ficha.email],
  ];
  return (
    <Card size="sm" data-slot="ficha-del-paciente">
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-title-md text-ink">Datos del paciente</h2>
        </CardTitle>
        <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" />
          Solo lectura: vienen del registro del paciente.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-body-md">
          {ficha.numeroHistoria ? (
            <div>
              <dt className="text-label-md text-muted-foreground">Historia clínica N.º</dt>
              <dd className="tabular-nums">{ficha.numeroHistoria}</dd>
            </div>
          ) : null}
          {datos.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-label-md text-muted-foreground">{etiqueta}</dt>
              <dd className="break-words">{valor}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
