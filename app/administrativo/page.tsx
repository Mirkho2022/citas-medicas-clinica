import { auth } from "@clerk/nextjs/server";
import { CalendarDays, Clock, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alerta } from "@/components/clinica/alerta";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { mfaExigidoPara } from "@/lib/auth/mfa-requerido";
import { exigirRol } from "@/lib/auth/rol";

const ATAJOS: Array<{ ruta: string; titulo: string; texto: string; icono: LucideIcon }> = [
  { ruta: "/administrativo/agenda", titulo: "Agenda del día", texto: "Citas y horarios libres: agendar, confirmar, reprogramar y cancelar.", icono: CalendarDays },
  { ruta: "/administrativo/pacientes", titulo: "Pacientes", texto: "Buscar por documento o apellidos y registrar pacientes nuevos.", icono: Users },
  { ruta: "/administrativo/horarios", titulo: "Horarios", texto: "La plantilla semanal de cada médico y sus ausencias.", icono: Clock },
  { ruta: "/administrativo/bajas", titulo: "Bajas médicas", texto: "Reasignar las citas de un médico que no podrá atender.", icono: TriangleAlert },
];

export default async function PaginaAdministrativo() {
  await auth.protect();
  await exigirRol("administrativo");
  if (mfaExigidoPara("administrativo") && !(await tieneMfaActivo())) {
    redirect("/configurar-mfa");
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-headline-lg text-ink">Panel administrativo</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ATAJOS.map(({ ruta, titulo, texto, icono: Icono }) => (
          <li key={ruta}>
            <Link
              href={ruta}
              className="flex h-full gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-primary-soft focus-visible:shadow-focus-ring"
            >
              <Icono className="mt-0.5 size-6 shrink-0 text-primary-text" aria-hidden="true" />
              <span>
                <span className="block text-title-md text-ink">{titulo}</span>
                <span className="block text-body-sm text-muted-foreground">{texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Alerta tono="informacion">Las notificaciones a los pacientes estarán disponibles en las próximas versiones.</Alerta>
    </div>
  );
}
