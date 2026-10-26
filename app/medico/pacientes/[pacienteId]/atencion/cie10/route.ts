// Búsqueda de diagnósticos CIE-10 para el selector del formulario de atención (design.md, D4): `GET ?q=texto`. Solo el médico
// con segundo factor; sin sesión, otro rol o sin MFA no se devuelve ningún resultado. El catálogo no es dato de un paciente, pero
// la ruta cuelga de la historia y no se guarda en caché. La consulta usa la identidad del usuario (nunca el rol dueño).
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { exigirPersonal } from "@/lib/auth/accion-personal";
import { buscarDiagnosticos } from "@/lib/atencion/cie10";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";

const CABECERAS = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  await auth.protect();
  const guarda = await exigirPersonal("medico");
  if (!guarda.ok) return NextResponse.json({ resultados: [] }, { status: 403, headers: CABECERAS });

  const q = new URL(request.url).searchParams.get("q");
  try {
    const resultados = await buscarDiagnosticos(ejecutorAutenticado, q);
    return NextResponse.json({ resultados }, { headers: CABECERAS });
  } catch {
    return NextResponse.json({ resultados: [] }, { status: 500, headers: CABECERAS });
  }
}
