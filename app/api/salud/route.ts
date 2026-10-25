import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

// Ruta pública de salud. Usa la URL del rol `authenticator` (sin privilegios sobre ninguna tabla), no la del dueño: lo único que hace es
// `select 1`, y una credencial con más alcance no debe vivir en código que sirve tráfico abierto (SECURITY-REPORT.md, SEC-03).
// El límite de peticiones por IP lo aplica `middleware.ts` (`REGLAS.salud`).
export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_AUTHENTICATED_URL!);
    await sql`select 1`;
    return NextResponse.json({ estado: "ok" });
  } catch {
    return NextResponse.json({ estado: "error" }, { status: 500 });
  }
}
