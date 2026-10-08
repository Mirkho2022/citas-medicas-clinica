import { clerkClient } from "@clerk/nextjs/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";
import { rolDesdeMetadata, sincronizarPerfil } from "@/lib/identidad/sincronizar-perfil";

// eslint-disable-next-line @clerk/next/require-auth-protection -- Verificado por firma Svix (verifyWebhook), no por sesión: lo llama Clerk, no un usuario logueado.
export async function POST(req: NextRequest) {
  let evento;
  try {
    evento = await verifyWebhook(req);
  } catch {
    return new Response("Firma de webhook inválida", { status: 400 });
  }

  if (evento.type !== "user.created" && evento.type !== "user.updated") {
    return new Response("OK", { status: 200 });
  }

  try {
    let rol = rolDesdeMetadata(evento.data.public_metadata);

    if (evento.type === "user.created") {
      // El registro público (/registro) nunca puede producir public_metadata.rol (Clerk no permite a un cliente
      // escribirlo). Si ya viene con un rol —asignado por la invitación de personal— se respeta; si no, es
      // autorregistro y se fuerza "paciente" (ver design.md de H1).
      const rolExistente = (evento.data.public_metadata as { rol?: string } | undefined)?.rol;
      if (!rolExistente) {
        const clerk = await clerkClient();
        await clerk.users.updateUserMetadata(evento.data.id, {
          publicMetadata: { rol: "paciente" },
        });
        rol = "paciente";
      }
    }

    if (!evento.data.first_name || !evento.data.last_name) {
      console.warn(`Clerk envió el usuario ${evento.data.id} sin nombres o apellidos; el registro debe exigirlos`);
    }

    // Conexión del rol sync_identidad (solo perfiles). Si falla, responder 5xx para que Svix reintente.
    const sql = neon(process.env.DATABASE_SYNC_URL!);
    await sincronizarPerfil(sql, {
      clerkUserId: evento.data.id,
      rol,
      nombres: evento.data.first_name,
      apellidos: evento.data.last_name,
    });
  } catch (error) {
    console.error("Error al sincronizar el usuario de Clerk con perfiles", error);
    return new Response("Error al sincronizar", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
