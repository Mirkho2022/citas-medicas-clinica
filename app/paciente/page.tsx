import { auth } from "@clerk/nextjs/server";
import { exigirRol } from "@/lib/auth/rol";

export default async function PaginaPaciente() {
  await auth.protect();
  await exigirRol("paciente");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-xl font-medium">Portal del paciente</h1>
    </main>
  );
}
