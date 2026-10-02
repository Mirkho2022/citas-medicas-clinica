import { clerkClient } from "@clerk/nextjs/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

// eslint-disable-next-line @clerk/next/require-auth-protection -- Verificado por firma Svix (verifyWebhook), no por sesión: lo llama Clerk, no un usuario logueado.
export async function POST(req: NextRequest) {
  let evento;
  try {
    evento = await verifyWebhook(req);
  } catch {
    return new Response("Firma de webhook inválida", { status: 400 });
  }

  if (evento.type === "user.created") {
    // El registro público (/registro) nunca puede producir public_metadata.rol
    // (Clerk no permite a un cliente escribirlo). Si ya viene con un rol —
    // asignado por la invitación de personal de la tarea 5.1— se respeta; si
    // no, es autorregistro y se fuerza "paciente" (ver design.md - Decisions).
    const rolExistente = (
      evento.data.public_metadata as { rol?: string } | undefined
    )?.rol;

    if (!rolExistente) {
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(evento.data.id, {
        publicMetadata: { rol: "paciente" },
      });
    }
  }

  return new Response("OK", { status: 200 });
}
