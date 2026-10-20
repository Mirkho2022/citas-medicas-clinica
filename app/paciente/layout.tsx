import { auth } from "@clerk/nextjs/server";
import { PortalLayout } from "@/components/clinica/portal-layout";

// Estructura del portal del paciente (H2b). Es presentación: la autorización por rol y MFA sigue en cada página
// (exigirRol). auth.protect() aquí lo exige la regla de ESLint de Clerk para cualquier archivo de un área protegida.
export default async function LayoutPaciente({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return <PortalLayout>{children}</PortalLayout>;
}
