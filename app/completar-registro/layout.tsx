import { auth } from "@clerk/nextjs/server";
import { PortalLayout } from "@/components/clinica/portal-layout";

// Estructura de «Complete su registro»: la del portal, sin la navegación inferior (quien aún no tiene ficha no tiene a dónde ir).
// Es presentación: la decisión de qué mostrar está en la página. auth.protect() aquí lo exige la regla de ESLint de Clerk.
export default async function LayoutCompletarRegistro({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return <PortalLayout conNavegacion={false}>{children}</PortalLayout>;
}
