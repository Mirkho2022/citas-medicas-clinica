import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerRolSesion, rutaParaRol } from "@/lib/auth/rol";

export default async function Home() {
  const rol = await obtenerRolSesion();
  if (rol) {
    redirect(rutaParaRol(rol));
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-medium">
        Sistema de Gestión de Citas e Historias Clínicas
      </h1>
      <div className="flex gap-4">
        <Link className="underline" href="/iniciar-sesion">
          Iniciar sesión
        </Link>
        <Link className="underline" href="/registro">
          Registrarme
        </Link>
      </div>
    </main>
  );
}
