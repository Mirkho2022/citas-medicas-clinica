import { auth } from "@clerk/nextjs/server";

export default async function PaginaPaciente() {
  await auth.protect();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-xl font-medium">Portal del paciente</h1>
    </main>
  );
}
