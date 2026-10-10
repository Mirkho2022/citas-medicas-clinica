import { auth } from "@clerk/nextjs/server";
import { ConsolaLayout } from "@/components/clinica/consola-layout";

// Estructura de la consola del personal (H2b). Es presentación: la autorización por rol y MFA sigue en cada página
// (exigirRol, tieneMfaActivo). auth.protect() aquí lo exige la regla de ESLint de Clerk para cualquier archivo de un
// área protegida.
export default async function LayoutAdministrativo({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return <ConsolaLayout rol="administrativo">{children}</ConsolaLayout>;
}
