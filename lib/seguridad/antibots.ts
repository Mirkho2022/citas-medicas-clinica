// Verificación anti-bots con Vercel BotID, nivel «basic» (openspec/changes/portal-del-paciente/design.md, D9; ADR-0026).
//
// `checkLevel` debe ser idéntico en el cliente (`instrumentation-client.ts`) y en el servidor (aquí), o la verificación falla. El nivel
// básico es gratuito en todos los planes (docs de Vercel, «BotID → Pricing»); el análisis profundo cuesta por llamada y no se usa.
//
// Modo de excepción para las pruebas E2E (specs/proteccion-del-portal-publico, «Pruebas automáticas legítimas»): con
// `BOTID_EXCEPCION_E2E=1` no se verifica NADA, pero solo si `VERCEL_ENV` no es `production`. Playwright es justo lo que BotID detecta como
// bot, así que las E2E contra el preview y contra una build local lo necesitan; en producción la variable se ignora aunque alguien la ponga.
//
// Si BotID falla al responder (excepción), se deja pasar y se registra la clase del error: es defensa en profundidad y las reglas de la
// base de datos no dependen de ella.
export interface DependenciasAntibots {
  checkBotId: () => Promise<{ isBot: boolean }>;
  entorno: Record<string, string | undefined>;
  registrar?: (clase: string) => void;
}

const dependenciasReales: DependenciasAntibots = {
  async checkBotId() {
    const { checkBotId } = await import("botid/server");
    return checkBotId({ advancedOptions: { checkLevel: "basic" } });
  },
  get entorno() {
    return process.env;
  },
};

function registrarPorDefecto(clase: string): void {
  console.error(`[antibots] BotID no respondió; se deja pasar (clase=${clase})`);
}

export function excepcionDePruebasActiva(entorno: Record<string, string | undefined>): boolean {
  return entorno.BOTID_EXCEPCION_E2E === "1" && entorno.VERCEL_ENV !== "production";
}

// `true` si la solicitud se clasifica como automatizada.
export async function esSolicitudAutomatizada(dependencias: DependenciasAntibots = dependenciasReales): Promise<boolean> {
  if (excepcionDePruebasActiva(dependencias.entorno)) return false;
  try {
    return (await dependencias.checkBotId()).isBot === true;
  } catch (error) {
    (dependencias.registrar ?? registrarPorDefecto)(error instanceof Error ? error.name : typeof error);
    return false;
  }
}
