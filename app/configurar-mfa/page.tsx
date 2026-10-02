import { auth } from "@clerk/nextjs/server";
import { ConfigurarMfaCliente } from "./configurar-mfa-cliente";

export default async function PaginaConfigurarMfa() {
  await auth.protect();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-medium">
        Configura tu autenticación de múltiple factor
      </h1>
      <p className="max-w-md text-center text-sm text-gray-600">
        Tu rol requiere un segundo factor de autenticación antes de continuar.
      </p>
      <ConfigurarMfaCliente />
    </main>
  );
}
