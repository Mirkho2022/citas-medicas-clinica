import { initBotId } from "botid/client/core";

// Vercel BotID en el cliente (ADR-0026; openspec/changes/portal-del-paciente, D9): las Server Actions del registro y de la reserva son `POST`
// a la página donde se invocan. `checkLevel` debe ser idéntico al de `lib/seguridad/antibots.ts` («basic»: gratuito en todos los planes).
// La búsqueda y la cancelación no se protegen con BotID (alcance del ADR).
initBotId({
  protect: [
    { path: "/completar-registro", method: "POST", advancedOptions: { checkLevel: "basic" } },
    { path: "/paciente/citas/nueva", method: "POST", advancedOptions: { checkLevel: "basic" } },
  ],
});
