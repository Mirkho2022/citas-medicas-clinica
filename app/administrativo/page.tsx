import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { tieneMfaActivo } from "@/lib/auth/mfa";

export default async function PaginaAdministrativo() {
  await auth.protect();
  if (!(await tieneMfaActivo())) {
    redirect("/configurar-mfa");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-xl font-medium">Panel administrativo</h1>
    </main>
  );
}
