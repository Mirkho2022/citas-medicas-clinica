// Regla de la guardia de las pantallas clínicas del médico, sin dependencias de Clerk ni de Next para poder probarla
// (tests/historia/guardia.test.ts). Orden: rol de médico y, después, segundo factor (MFA) activo; sin MFA se dirige a
// configurarlo ANTES de que la página lea ningún dato clínico (specs/acceso-a-historia-clinica, «Acceso condicionado a rol de
// médico y a MFA»). La sesión (`auth.protect()`) se comprueba en el cuerpo de cada página: la regla de ESLint de Clerk la exige
// a nivel de recurso y no la reconoce dentro de una función ajena.
import type { Rol } from "../auth/rutas.ts";

export const RUTA_CONFIGURAR_MFA = "/configurar-mfa";

export interface DependenciasDeGuardia {
  // Redirige a la propia área si el rol de la sesión no es el pedido (lib/auth/rol.ts).
  exigirRol: (rol: Rol) => Promise<void>;
  tieneMfaActivo: () => Promise<boolean>;
  redirigir: (ruta: string) => never;
}

export async function exigirMedicoConMfa(dependencias: DependenciasDeGuardia): Promise<void> {
  await dependencias.exigirRol("medico");
  if (!(await dependencias.tieneMfaActivo())) dependencias.redirigir(RUTA_CONFIGURAR_MFA);
}
