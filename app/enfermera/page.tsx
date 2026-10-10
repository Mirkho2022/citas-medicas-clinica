import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Alerta } from "@/components/clinica/alerta";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { exigirRol } from "@/lib/auth/rol";

export default async function PaginaEnfermera() {
  await auth.protect();
  await exigirRol("enfermera");
  if (!(await tieneMfaActivo())) {
    redirect("/configurar-mfa");
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-headline-lg text-ink">Panel de enfermería</h1>
      <Alerta tono="informacion">Su turno y el médico con quien trabaja estarán disponibles en las próximas versiones.</Alerta>
    </div>
  );
}
