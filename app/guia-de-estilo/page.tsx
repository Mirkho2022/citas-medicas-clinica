import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { galeriaVisible } from "@/lib/ui/galeria";

// Galería de componentes (H2b): revisión visual y objetivo de las pruebas de accesibilidad. Solo con sesión y nunca en
// producción. Usa únicamente datos sintéticos de lib/ui/ejemplos.ts.
export default async function PaginaGuiaDeEstilo() {
  await auth.protect();
  if (!galeriaVisible(process.env)) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-headline-lg text-ink">Guía de estilo</h1>
        <p className="text-body-md text-muted-foreground">
          Componentes del sistema de diseño con datos de ejemplo. Solo disponible en desarrollo y en los previews.
        </p>
      </header>
    </main>
  );
}
