// Revoca el acceso de un usuario: invalida sus sesiones activas y lo banea para
// que no pueda volver a autenticarse (spec autenticacion-roles, "Revocación de
// acceso"). Con --restaurar levanta el baneo.
//
// Uso (Node 24 ejecuta TypeScript directamente):
//   node --env-file=.env.local scripts/revocar-acceso.ts <email> [--restaurar]
//
// Variables: CLERK_SECRET_KEY (obligatoria).
import { createClerkClient } from "@clerk/backend";
import { z } from "zod";

const args = process.argv.slice(2);
const restaurar = args.includes("--restaurar");
const email = z.string().email().safeParse(args.find((a) => !a.startsWith("--")));
if (!email.success) {
  console.error(
    "Falta un email válido.\nUso: node --env-file=.env.local scripts/revocar-acceso.ts <email> [--restaurar]",
  );
  process.exit(1);
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error("Falta CLERK_SECRET_KEY (¿corriste con --env-file=.env.local?)");
  process.exit(1);
}

const clerk = createClerkClient({ secretKey });

const { data: usuarios } = await clerk.users.getUserList({
  emailAddress: [email.data],
});
if (usuarios.length !== 1) {
  console.error(
    `Se esperaba exactamente 1 usuario con el email ${email.data}, hay ${usuarios.length}.`,
  );
  process.exit(1);
}
const usuario = usuarios[0];

if (restaurar) {
  await clerk.users.unbanUser(usuario.id);
  console.log(`Acceso restaurado para ${email.data} (${usuario.id}).`);
  process.exit(0);
}

// Orden deliberado: primero el baneo (impide nuevos logins y refrescos de sesión)
// y luego revocar las sesiones activas, para que no quede ventana en la que el
// usuario pueda abrir una sesión nueva entre ambos pasos.
await clerk.users.banUser(usuario.id);

const { data: sesiones } = await clerk.sessions.getSessionList({
  userId: usuario.id,
  status: "active",
});
for (const sesion of sesiones) {
  await clerk.sessions.revokeSession(sesion.id);
}

console.log(
  `Acceso revocado para ${email.data} (${usuario.id}): baneado y ${sesiones.length} sesión(es) activa(s) revocada(s).`,
);
