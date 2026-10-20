import { UserButton } from "@clerk/nextjs";
import { ProveedorAvisos } from "@/components/clinica/aviso-temporal";
import { Marca } from "@/components/clinica/marca";
import { NavegacionLateral } from "@/components/clinica/navegacion";
import type { Rol } from "@/lib/auth/rol";
import { TITULO_AREA } from "@/lib/ui/navegacion";

// Estructura de la consola del personal (DESIGN.md): barra lateral de 240 px y contenido de hasta 1280 px, densidad
// compacta. Es solo presentación: la protección por sesión, rol y MFA sigue en cada página.
export function ConsolaLayout({ rol, children }: { rol: Exclude<Rol, "paciente">; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas md:grid md:grid-cols-[15rem_1fr]">
      <aside className="flex flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 md:flex-col md:items-start md:gap-1 md:pb-2">
          <Marca />
          <span className="text-body-sm text-muted-foreground">{TITULO_AREA[rol]}</span>
        </div>
        <NavegacionLateral rol={rol} />
        <div className="px-4 pb-3 md:mt-auto md:pb-4">
          <UserButton showName />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[80rem] px-4 py-6 text-body-sm md:px-8">
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </main>
    </div>
  );
}
