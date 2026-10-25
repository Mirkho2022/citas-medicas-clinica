import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// BotID (ADR-0026, portal-del-paciente D9): reescrituras para que un bloqueador de anuncios no estorbe la verificación.
export default withBotId(nextConfig);
