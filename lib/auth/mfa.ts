import { currentUser } from "@clerk/nextjs/server";

export async function tieneMfaActivo(): Promise<boolean> {
  const usuario = await currentUser();
  if (!usuario) return false;
  return (
    usuario.twoFactorEnabled || usuario.totpEnabled || usuario.backupCodeEnabled
  );
}
