import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Alerta } from "@/components/clinica/alerta";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { exigirRol } from "@/lib/auth/rol";

export default async function PaginaMedico() {
  await auth.protect();
  await exigirRol("medico");
  if (!(await tieneMfaActivo())) {
    redirect("/configurar-mfa");
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-headline-lg text-ink">Panel del médico</h1>
      <Alerta tono="informacion">
        Su jornada, sus citas y las historias clínicas de sus pacientes estarán disponibles en las próximas versiones.
      </Alerta>
    </div>
  );
}
