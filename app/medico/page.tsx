import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { exigirRol } from "@/lib/auth/rol";

export default async function PaginaMedico() {
  await auth.protect();
  await exigirRol("medico");
  if (!(await tieneMfaActivo())) {
    redirect("/configurar-mfa");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-xl font-medium">Panel del médico</h1>
    </main>
  );
}
