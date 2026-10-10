import { UserButton } from "@clerk/nextjs";
import { HeartPulse } from "lucide-react";
import { NavegacionInferior } from "@/components/clinica/navegacion";

// Estructura del portal del paciente (DESIGN.md): una sola columna de hasta 640 px, pensada primero para móvil, con
// navegación inferior de tres destinos. Es solo presentación: la protección por sesión y rol sigue en cada página.
export function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas pb-24">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[40rem] items-center justify-between px-4">
          <span className="flex items-center gap-2 font-display text-title-md text-primary-text">
            <HeartPulse className="size-6" aria-hidden="true" />
            Citas Médicas
          </span>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto flex max-w-[40rem] flex-col gap-6 px-4 py-6 text-body-lg">{children}</main>
      <NavegacionInferior rol="paciente" />
    </div>
  );
}
