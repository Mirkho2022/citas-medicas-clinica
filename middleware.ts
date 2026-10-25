import { clerkMiddleware } from "@clerk/nextjs/server";
import { limitadorReal } from "@/lib/seguridad/limitador-real";
import { esEntornoVercel, ipDelCliente, mensajeDeEspera, reglaDeRutaDeAutenticacion } from "@/lib/seguridad/limites";

// SIN lógica de autorización (decisión de H1: la protección es por recurso con `auth.protect()`, no por un `matcher` del middleware).
// Lo único que hace aquí es el límite de peticiones de las rutas de autenticación (ADR-0026; portal-del-paciente, D9): 5 / 15 min por IP
// para lo que no es lectura y 60 / 1 min para las lecturas. Con el almacén caído deja pasar (fallo abierto, ver lib/seguridad/limites.ts).
export default clerkMiddleware(async (_auth, req) => {
  const regla = reglaDeRutaDeAutenticacion(req.method, req.nextUrl.pathname);
  if (!regla) return;

  const ip = ipDelCliente(req.headers, esEntornoVercel());
  const decision = await limitadorReal().limitar(regla, `ip:${ip}`);
  if (decision.permitido) return;

  return new Response(mensajeDeEspera(decision.reintentarEnSegundos), {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": String(decision.reintentarEnSegundos),
      "Cache-Control": "no-store",
    },
  });
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
