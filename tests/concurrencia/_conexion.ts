// Conexiones directas al branch de pruebas para las pruebas de concurrencia (node --test).
// pgTAP corre en una sola sesión y no puede demostrar nada bajo concurrencia real: estas pruebas
// abren varios clientes `pg` independientes. Misma convención de entorno que scripts/ejecutar-pgtap.ts:
// DATABASE_URL_PRUEBAS (o DATABASE_URL), URL directa del rol dueño de un branch de desarrollo o
// efímero — nunca production. ENV_FILE (por defecto .env.local) y DATABASE_URL_PRODUCCION opcionales.
import pg from "pg";

try {
  process.loadEnvFile(process.env.ENV_FILE ?? ".env.local");
} catch {
  // sin .env.local (CI): se usa el entorno del proceso
}

export function urlDePruebas(): string {
  const url = process.env.DATABASE_URL_PRUEBAS ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta DATABASE_URL_PRUEBAS (o DATABASE_URL): URL directa del branch de pruebas.");
  }
  const { host } = new URL(url);
  if (host.includes("-pooler")) {
    throw new Error("La URL es del pooler: las pruebas de concurrencia usan la conexión directa.");
  }
  const produccion = process.env.DATABASE_URL_PRODUCCION;
  if (produccion && new URL(produccion).host === host) {
    throw new Error("El destino es producción: las pruebas nunca corren contra production.");
  }
  return url;
}

export async function conectar(): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: urlDePruebas() });
  await cliente.connect();
  return cliente;
}

// Ejecuta `fn` con n clientes independientes y los cierra siempre.
export async function conVariosClientes<T>(
  n: number,
  fn: (clientes: pg.Client[]) => Promise<T>,
): Promise<T> {
  const clientes = await Promise.all(Array.from({ length: n }, () => conectar()));
  try {
    return await fn(clientes);
  } finally {
    await Promise.all(clientes.map((c) => c.end().catch(() => undefined)));
  }
}
