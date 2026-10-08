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
  } catch {
    return NextResponse.json({ estado: "error" }, { status: 500 });
  }
}
