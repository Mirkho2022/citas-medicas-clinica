import { redirect } from "next/navigation";
import { tieneMfaActivo } from "./mfa.ts";
import { exigirRol } from "./rol.ts";

// Guarda de las páginas de la consola del administrativo: rol correcto y segundo factor (MFA) activo. La sesión
// (`await auth.protect()`) se comprueba en el cuerpo de cada página, porque la regla de ESLint de Clerk la exige a nivel de
// recurso y no la reconoce dentro de una función ajena. Un rol distinto va a su propia área y sin MFA se redirige a configurarlo
// (el mismo orden que `/administrativo`). Es la comprobación de usabilidad y de defensa en profundidad de la página: la
// autoridad real sobre los datos es la RLS, y cada Server Action vuelve a comprobar con `exigirPersonal`.
export async function exigirPaginaAdministrativo(): Promise<void> {
  await exigirRol("administrativo");
  if (!(await tieneMfaActivo())) redirect("/configurar-mfa");
}
