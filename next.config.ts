import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

// Cabeceras de seguridad (SECURITY-REPORT.md, SEC-04). `frame-ancestors 'none'` impide que otra página incruste el portal (clickjacking sobre
// «Confirmar cita» o «Cancelar cita»); `X-Frame-Options` es lo mismo para navegadores que no leen CSP. Todavía no se fija un `script-src`: Clerk y
// BotID cargan scripts propios y esa política necesita su propia prueba (queda como siguiente paso del informe).
const cabecerasDeSeguridad = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: cabecerasDeSeguridad },
      // Contenido clínico (historias-clinicas, 6.3): ninguna caché, ni del navegador ni compartida, guarda una respuesta de historia
      // clínica, atención o adjunto (specs/acceso-a-historia-clinica, «El contenido clínico no se escapa por canales laterales»).
      { source: "/medico/pacientes/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/historias/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

// BotID (ADR-0026, portal-del-paciente D9): reescrituras para que un bloqueador de anuncios no estorbe la verificación.
export default withBotId(nextConfig);
