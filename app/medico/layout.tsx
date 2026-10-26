import { auth } from "@clerk/nextjs/server";
import { Alerta } from "@/components/clinica/alerta";
import { ConsolaLayout } from "@/components/clinica/consola-layout";

// Estructura de la consola del personal (H2b). Es presentación: la autorización por rol y MFA sigue en cada página
// (exigirRol, tieneMfaActivo). auth.protect() aquí lo exige la regla de ESLint de Clerk para cualquier archivo de un
// área protegida.
//
// Aviso de demostración (P-1): el bloqueo técnico de datos clínicos reales (grupo 1 de historias-clinicas) todavía no existe, así que
// mientras tanto el módulo clínico solo debe usarse con datos ficticios y la pantalla lo dice en cada página del médico.
export default async function LayoutMedico({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return (
    <ConsolaLayout rol="medico">
      <div className="flex flex-col gap-4">
        <Alerta tono="aviso">
          Entorno de demostración: use solo datos ficticios. Los datos clínicos de pacientes reales no se pueden registrar aquí.
        </Alerta>
        {children}
      </div>
    </ConsolaLayout>
  );
}
