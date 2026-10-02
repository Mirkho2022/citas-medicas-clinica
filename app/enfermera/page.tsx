import { auth } from "@clerk/nextjs/server";

export default async function PaginaEnfermera() {
  await auth.protect();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-xl font-medium">Panel de enfermería</h1>
    </main>
  );
}
