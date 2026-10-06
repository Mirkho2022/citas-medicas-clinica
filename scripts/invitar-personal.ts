// Invita a una persona del personal (administrativo, médico o enfermera) vía la
// API de invitaciones de Clerk. Es el ÚNICO camino para crear esos roles: no
// existe autorregistro de personal (spec autenticacion-roles).
//
// Uso (Node 24 ejecuta TypeScript directamente):
//   node --env-file=.env.local scripts/invitar-personal.ts <email> <rol> [--sin-correo]
//
// --sin-correo: no envía el email; imprime el enlace de la invitación (para cuentas
// de prueba, p. ej. usuario+clerk_test@example.com, sin bandeja real).
//
// Variables: CLERK_SECRET_KEY (obligatoria), APP_URL (opcional, por defecto
// http://localhost:3000; a donde Clerk redirige para aceptar la invitación).
import { createClerkClient } from "@clerk/backend";
import { z } from "zod";

const ROLES_PERSONAL = ["administrativo", "medico", "enfermera"] as const;

const entrada = z.object({
  email: z.string().email(),
  rol: z.enum(ROLES_PERSONAL, {
    errorMap: () => ({
      message: `El rol debe ser uno de: ${ROLES_PERSONAL.join(", ")} (paciente se autorregistra)`,
    }),
  }),
});

const args = process.argv.slice(2);
const sinCorreo = args.includes("--sin-correo");
const [email, rol] = args.filter((a) => !a.startsWith("--"));
const parsed = entrada.safeParse({ email, rol });
if (!parsed.success) {
  console.error(
    parsed.error.issues.map((i) => i.message).join("\n") +
      "\nUso: node --env-file=.env.local scripts/invitar-personal.ts <email> <rol> [--sin-correo]",
  );
  process.exit(1);
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error("Falta CLERK_SECRET_KEY (¿corriste con --env-file=.env.local?)");
  process.exit(1);
}

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const clerk = createClerkClient({ secretKey });

// Sin ignoreExisting: si el email ya tiene cuenta o invitación pendiente, Clerk
// falla en vez de reasignar el rol de una cuenta existente (p. ej. un paciente).
const invitacion = await clerk.invitations.createInvitation({
  emailAddress: parsed.data.email,
  publicMetadata: { rol: parsed.data.rol },
  redirectUrl: `${appUrl}/registro`,
  notify: !sinCorreo,
});

console.log(
  `Invitación ${invitacion.id} ${sinCorreo ? "creada (sin correo)" : "enviada"} a ${invitacion.emailAddress} con rol ${parsed.data.rol}.`,
);
if (sinCorreo) console.log(`Enlace: ${invitacion.url}`);
