import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { transaccionAutenticada } from "@/lib/db/cliente-autenticado";

// Comprobación de extremo a extremo de ADR-0023: devuelve lo que POSTGRES ve de la sesión (el id de Clerk y el rol
// del token, validados por Neon), no lo que la aplicación cree. Solo informa al propio usuario.
export async function GET() {
  await auth.protect();
  try {
    const [filas] = await transaccionAutenticada((tx) => [
      tx`select public.usuario_actual() as clerk_user_id, public.rol_actual() as rol`,
    ]);
    return NextResponse.json({ estado: "ok", ...filas[0] });
  } catch (error) {
    console.error("db-sesion:", error);
    // Fuera de producción se devuelve el motivo (sin cadenas de conexión) para diagnosticar la configuración de un
    // entorno de preview; en producción la respuesta no revela nada.
    const detalle =
      process.env.VERCEL_ENV === "production"
        ? undefined
        : String(error instanceof Error ? error.message : error)
            .replace(/postgres(ql)?:\/\/\S+/gi, "[url]")
            .slice(0, 300);
    return NextResponse.json({ estado: "error", detalle }, { status: 500 });
  }
}
