import { UserButton } from "@clerk/nextjs";
import { Marca } from "@/components/clinica/marca";
import { NavegacionInferior } from "@/components/clinica/navegacion";

// El botón del avatar de Clerk mide 28 × 28 px por defecto y el portal exige objetivos táctiles de al menos 44 × 44 px (specs/usabilidad-y-accesibilidad-del-portal;
// e2e/portal-responsive.spec.ts). Los estilos de Clerk no van en una capa de CSS, así que se sobrescriben como objeto de estilo.
const AVATAR_TACTIL = {
  elements: {
    userButtonTrigger: { minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" },
  },
};

// Estructura del portal del paciente (DESIGN.md): una sola columna de hasta 640 px, pensada primero para móvil, con
// navegación inferior de tres destinos. Es solo presentación: la protección por sesión y rol sigue en cada página.
// `conNavegacion={false}` es para «Complete su registro»: quien aún no tiene ficha no tiene a dónde ir.
export function PortalLayout({
  children,
  conNavegacion = true,
}: {
  children: React.ReactNode;
  conNavegacion?: boolean;
}) {
  return (
    <div className={conNavegacion ? "min-h-screen bg-canvas pb-24" : "min-h-screen bg-canvas pb-10"}>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[40rem] items-center justify-between px-4">
          <Marca />
          <UserButton appearance={AVATAR_TACTIL} />
        </div>
      </header>
      <main className="mx-auto flex max-w-[40rem] flex-col gap-6 px-4 py-6 text-body-lg">{children}</main>
      {conNavegacion ? <NavegacionInferior rol="paciente" /> : null}
    </div>
  );
}
