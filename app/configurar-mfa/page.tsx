import { auth } from "@clerk/nextjs/server";
import { Marca } from "@/components/clinica/marca";
import { ConfigurarMfaCliente } from "./configurar-mfa-cliente";

export default async function PaginaConfigurarMfa() {
  await auth.protect();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-4 py-10">
      <Marca />
      <h1 className="text-center font-display text-headline-md text-ink">
        Configure su autenticación de múltiple factor
      </h1>
      <p className="max-w-md text-center text-body-md text-muted-foreground">
        Su rol requiere un segundo factor de autenticación antes de continuar.
      </p>
      <ConfigurarMfaCliente />
    </main>
  );
}
