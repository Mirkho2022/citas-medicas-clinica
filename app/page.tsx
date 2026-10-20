import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/clinica/marca";
import { Button } from "@/components/ui/button";
import { obtenerRolSesion, rutaParaRol } from "@/lib/auth/rol";
import { RUTA_COMPLETAR_REGISTRO } from "@/lib/auth/rutas";

export default async function Home() {
  const rol = await obtenerRolSesion();
  if (rol) {
    redirect(rutaParaRol(rol));
  }
  // Sesión iniciada pero sin rol todavía: la cuenta recién creada espera el alta del rol. Nunca se le muestra la portada de
  // visitantes (con «Registrarme»): «Complete su registro» sabe esperar y no redirige de vuelta aquí.
  const { userId } = await auth();
  if (userId) {
    redirect(RUTA_COMPLETAR_REGISTRO);
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
