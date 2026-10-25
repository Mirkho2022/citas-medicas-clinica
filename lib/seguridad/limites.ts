// Límite de peticiones del portal (openspec/changes/portal-del-paciente/design.md, D9; ADR-0026). Todo lo de este archivo es puro:
// la tabla única de reglas, el almacén en memoria (para las pruebas y para quien corre sin Redis), el envoltorio de FALLO ABIERTO y los
// textos de espera. El almacén real (Upstash) está en `upstash.ts` y se elige en `limitador-real.ts`.
//
// Fallo abierto a propósito: si el almacén de contadores no responde, el portal sigue funcionando y el fallo se registra sin datos
// personales. Las barreras reales (RLS, EXCLUDE, disparadores) no dependen de este componente.
import { MENSAJE_DEMASIADOS_INTENTOS } from "../portal/mensajes.ts";

export interface Regla {
  nombre: string;
  maximo: number;
  ventanaSegundos: number;
}

// Tabla única. Solo `autenticacionEscritura` es el valor del ADR-0026 (5 / 15 min por IP); el resto son valores propuestos de D9.
export const REGLAS = {
  registro: { nombre: "registro", maximo: 5, ventanaSegundos: 15 * 60 },
  reserva: { nombre: "reserva", maximo: 10, ventanaSegundos: 10 * 60 },
  cancelacion: { nombre: "cancelacion", maximo: 10, ventanaSegundos: 10 * 60 },
  busqueda: { nombre: "busqueda", maximo: 60, ventanaSegundos: 60 },
  // Rutas de autenticación: solo lo que no es lectura cuenta contra 5 / 15 min; las lecturas tienen un límite holgado para que una
  // sala de espera que comparte la misma IP no se bloquee (D9, Q5).
  autenticacionEscritura: { nombre: "autenticacion-escritura", maximo: 5, ventanaSegundos: 15 * 60 },
  autenticacionLectura: { nombre: "autenticacion-lectura", maximo: 60, ventanaSegundos: 60 },
} as const satisfies Record<string, Regla>;

export interface Decision {
  permitido: boolean;
  // Segundos hasta que se libera un cupo (0 si está permitido).
  reintentarEnSegundos: number;
}

export interface Limitador {
  limitar(regla: Regla, clave: string): Promise<Decision>;
}

export const PERMITIDO: Decision = { permitido: true, reintentarEnSegundos: 0 };

// Ventana deslizante con registro de instantes. Solo para pruebas y para quien corre sin Redis: en la nube cada instancia tiene su propia
// memoria, así que no limita de verdad (por eso producción usa Upstash).
export function limitadorEnMemoria(reloj: () => number = Date.now): Limitador {
  const intentos = new Map<string, number[]>();
  return {
    async limitar(regla, clave) {
      const ahora = reloj();
      const ventanaMs = regla.ventanaSegundos * 1000;
      const llave = `${regla.nombre}:${clave}`;
      const vigentes = (intentos.get(llave) ?? []).filter((t) => ahora - t < ventanaMs);
      if (vigentes.length >= regla.maximo) {
        intentos.set(llave, vigentes);
        const liberaEn = vigentes[0]! + ventanaMs - ahora;
        return { permitido: false, reintentarEnSegundos: Math.max(1, Math.ceil(liberaEn / 1000)) };
      }
      vigentes.push(ahora);
      intentos.set(llave, vigentes);
      return PERMITIDO;
    },
  };
}

export const ESPERA_MAXIMA_ALMACEN_MS = 1500;

// Si el almacén lanza o tarda más de `esperaMaximaMs`, deja pasar y registra la CLASE del error (nunca su texto, que podría llevar la
// clave con la IP o el identificador del usuario).
export function conFalloAbierto(
  base: Limitador,
  registrar: (clase: string) => void,
  esperaMaximaMs: number = ESPERA_MAXIMA_ALMACEN_MS,
): Limitador {
  return {
    async limitar(regla, clave) {
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      try {
        const agotado = new Promise<never>((_, rechazar) => {
          temporizador = setTimeout(() => rechazar(new Error("tiempo agotado")), esperaMaximaMs);
        });
        return await Promise.race([base.limitar(regla, clave), agotado]);
      } catch (error) {
        registrar(error instanceof Error ? error.name : typeof error);
        return PERMITIDO;
      } finally {
        clearTimeout(temporizador);
      }
    },
  };
}

// Dirección del cliente para la clave del contador. Solo se confía en las cabeceras de reenvío cuando detrás hay un proxy que las
// establece él mismo (Vercel): fuera de ahí las manda el cliente y cualquiera podría cambiar su clave a voluntad, así que se ignoran.
// En Vercel, `x-vercel-forwarded-for` y `x-real-ip` las fija la plataforma y `x-forwarded-for` se sobrescribe con la dirección real.
export function ipDelCliente(cabeceras: { get(nombre: string): string | null }, confiarEnElProxy: boolean): string {
  if (!confiarEnElProxy) return "sin-proxy";
  const candidata =
    cabeceras.get("x-vercel-forwarded-for") ?? cabeceras.get("x-real-ip") ?? cabeceras.get("x-forwarded-for")?.split(",")[0];
  const ip = candidata?.trim() ?? "";
  return ip.length > 0 && ip.length <= 64 ? ip : "desconocida";
}

// Credenciales de Upstash Redis. El nombre documentado es `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; la integración de Vercel con Upstash crea
// las suyas con el prefijo que se elija al conectarla (`<PREFIJO>_REST_API_URL` y `<PREFIJO>_REST_API_TOKEN`, por defecto `KV`), así que se aceptan
// también. Nunca el token de solo lectura (`…_READ_ONLY_TOKEN`): el límite escribe contadores.
const NOMBRES_URL_UPSTASH = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_API_URL", "KV_REST_API_URL"];
const NOMBRES_TOKEN_UPSTASH = ["UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_API_TOKEN", "KV_REST_API_TOKEN"];

export function credencialesDeUpstash(entorno: Record<string, string | undefined>): { url: string; token: string } | null {
  const url = NOMBRES_URL_UPSTASH.map((n) => entorno[n]).find((v) => v);
  const token = NOMBRES_TOKEN_UPSTASH.map((n) => entorno[n]).find((v) => v);
  return url && token ? { url, token } : null;
}

export const esEntornoVercel = (entorno: Record<string, string | undefined> = process.env): boolean => entorno.VERCEL === "1";

// «Espere N minutos» redondeado hacia arriba, mínimo 1.
export const minutosDeEspera = (segundos: number): number => Math.max(1, Math.ceil(segundos / 60));

export function mensajeDeEspera(segundos: number): string {
  const minutos = minutosDeEspera(segundos);
  return `Demasiados intentos. Espere ${minutos} ${minutos === 1 ? "minuto" : "minutos"} e intente de nuevo.`;
}

export { MENSAJE_DEMASIADOS_INTENTOS };

// Qué regla corresponde a una petición a las rutas de autenticación de Clerk (`/iniciar-sesion`, `/registro`). `null` si no es una de ellas.
// Los componentes de Clerk envían las credenciales a la API de Clerk, no a este origen: aquí solo llegan cargas de página y retornos. Por eso
// solo lo que NO es lectura cuenta contra el 5 / 15 min.
const RUTAS_DE_AUTENTICACION = ["/iniciar-sesion", "/registro"];

export function reglaDeRutaDeAutenticacion(metodo: string, ruta: string): Regla | null {
  const esAutenticacion = RUTAS_DE_AUTENTICACION.some((r) => ruta === r || ruta.startsWith(`${r}/`));
  if (!esAutenticacion) return null;
  const esLectura = ["GET", "HEAD", "OPTIONS"].includes(metodo.toUpperCase());
  return esLectura ? REGLAS.autenticacionLectura : REGLAS.autenticacionEscritura;
}
