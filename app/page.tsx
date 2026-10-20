import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/clinica/marca";
import { Button } from "@/components/ui/button";
import { obtenerRolSesion, rutaParaRol } from "@/lib/auth/rol";

export default async function Home() {
  const rol = await obtenerRolSesion();
  if (rol) {
    redirect(rutaParaRol(rol));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[40rem] flex-col items-center justify-center gap-8 px-4 py-10 text-center">
      <Marca />
      <h1 className="font-display text-headline-lg text-ink sm:text-display-lg">
        Sistema de Gestión de Citas e Historias Clínicas
      </h1>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild size="lg">
          <Link href="/iniciar-sesion">Iniciar sesión</Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/registro">Registrarme</Link>
        </Button>
      </div>
    </main>
  );
}
