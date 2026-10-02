import { auth } from "@clerk/nextjs/server";

export default async function PaginaMedico() {
  await auth.protect();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-xl font-medium">Panel del médico</h1>
    </main>
  );
}
