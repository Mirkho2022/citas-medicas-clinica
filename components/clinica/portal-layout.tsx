import { UserButton } from "@clerk/nextjs";
import { Marca } from "@/components/clinica/marca";
import { NavegacionInferior } from "@/components/clinica/navegacion";

// Estructura del portal del paciente (DESIGN.md): una sola columna de hasta 640 px, pensada primero para móvil, con
// navegación inferior de tres destinos. Es solo presentación: la protección por sesión y rol sigue en cada página.
export function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas pb-24">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[40rem] items-center justify-between px-4">
          <Marca />
          <UserButton />
        </div>
      </header>
      <main className="mx-auto flex max-w-[40rem] flex-col gap-6 px-4 py-6 text-body-lg">{children}</main>
      <NavegacionInferior rol="paciente" />
    </div>
  );
}
