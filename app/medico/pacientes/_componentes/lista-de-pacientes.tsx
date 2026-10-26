import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import { fechaDeCalendario, textoEdad } from "@/lib/historia/formato";
import { LIMITE_LISTA_PACIENTES, listarPacientesACargo } from "@/lib/historia/repositorio";

// Lista de «Mis pacientes»: lee con la identidad del médico y deja que `medico_tiene_paciente()` y la RLS decidan qué
// pacientes existen para él. Lo monta la página DESPUÉS de su guardia (sesión, rol y MFA). Un error de lectura sube al límite de
// error de la ruta (app/medico/pacientes/error.tsx), que no muestra detalle.
export async function ListaDePacientes({ busqueda }: { busqueda: string }) {
  const { pacientes, hayMas } = await listarPacientesACargo(ejecutorAutenticado, { busqueda });
  const hoy = hoyLima();

  const resumen = hayMas
    ? `Se muestran ${LIMITE_LISTA_PACIENTES} pacientes: afine la búsqueda.`
    : `${pacientes.length} ${pacientes.length === 1 ? "paciente" : "pacientes"}${busqueda ? " encontrados" : " a su cargo"}.`;

  if (pacientes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-6">
        <p role="status" className="text-title-md text-ink">
          {busqueda ? `Sin resultados para «${busqueda}»` : "Aún no tiene pacientes a su cargo"}
        </p>
        <p className="text-body-md text-muted-foreground">
          {busqueda
            ? "Revise el apellido o el documento. Solo se buscan los pacientes que tiene a su cargo."
            : "Un paciente aparece aquí cuando recepción confirma su cita con usted o le concede acceso."}
        </p>
        {busqueda ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/medico/pacientes">Limpiar búsqueda</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-body-sm text-muted-foreground">
        {resumen}
      </p>
      {/* `prefetch={false}`: abrir una historia deja un registro de acceso; una precarga lo dejaría sin que el médico la abra. */}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface" aria-label="Pacientes a su cargo">
        {pacientes.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0">
              <p className="break-words font-semibold text-ink">
                {p.apellidos}, {p.nombres}
              </p>
              <p className="text-body-sm text-muted-foreground tabular-nums">
                {p.tipoDocumento} {p.numeroDocumento} · {textoEdad(p.fechaNacimiento, hoy) || "edad no disponible"} · nació el{" "}
                {fechaDeCalendario(p.fechaNacimiento)}
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/medico/pacientes/${p.id}`} prefetch={false}>
                Abrir historia
                <span className="sr-only">
                  {" "}
                  de {p.nombres} {p.apellidos}
                </span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
