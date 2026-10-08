import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

export function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta la variable ${nombre} (ver .env.example y docs/verificacion-h1.md)`,
    );
  }
  return valor;
}

// Header de bypass para el fixture `request`: prepararPagina solo cubre la página, y una petición directa a un
// preview protegido recibiría 401 de Vercel antes de llegar a la ruta bajo prueba.
export function cabecerasBypass(): Record<string, string> {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return bypass ? { "x-vercel-protection-bypass": bypass } : {};
}

// Prepara la página: testing token de Clerk y, si el preview de Vercel está
// protegido, el bypass de automatización. El header solo se agrega a las peticiones
// al origen de la app: en otros orígenes (Clerk) rompería CORS.
export async function prepararPagina(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    const origen = new URL(
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    ).origin;
    await page.route(`${origen}/**`, (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-vercel-protection-bypass": bypass,
          "x-vercel-set-bypass-cookie": "true",
        },
      }),
    );
  }
}

// Código fijo de Clerk para correos `+clerk_test` en instancias de desarrollo.
const CODIGO_CLERK_TEST = "424242";

// Escribe el correo y la contraseña en el formulario de Clerk y los envía.
export async function enviarCredenciales(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/iniciar-sesion");
  await page.locator('input[name="identifier"]').fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

// Inicia sesión y atraviesa los pasos intermedios que Clerk pueda pedir: verificación
// de dispositivo nuevo (client trust) y segundo factor TOTP. Termina cuando la página
// sale de /iniciar-sesion.
export async function iniciarSesion(
  page: Page,
  email: string,
  password: string,
  opciones: { totpSecret?: string } = {},
): Promise<void> {
  await enviarCredenciales(page, email, password);

  const campoCodigo = page.getByRole("textbox", {
    name: "Enter verification code",
  });
  const pasoIntermedioOFin = (u: URL) =>
    u.pathname.includes("client-trust") ||
    u.pathname.includes("factor-two") ||
    !u.pathname.startsWith("/iniciar-sesion");

  for (let paso = 0; paso < 3; paso++) {
    await page.waitForURL(pasoIntermedioOFin, {
      timeout: 30_000,
      waitUntil: "commit",
    });
    const urlAntes = page.url(); // antes de escribir: al enviar el código la página navega enseguida
    const { pathname } = new URL(urlAntes);
    if (pathname.includes("client-trust") || pathname.includes("factor-two")) {
      // La interfaz de Clerk se monta en el cliente: teclear antes pierde los dígitos.
      await campoCodigo.waitFor({ state: "visible", timeout: 30_000 });
    }
    if (pathname.includes("client-trust")) {
      // Clerk monta la pantalla antes de terminar de "enviar" el código; si se teclea
      // entonces responde "You need to send a verification code before attempting to
      // verify". Se reintenta hasta que la página navegue.
      await expect(async () => {
        await campoCodigo.fill("");
        await campoCodigo.pressSequentially(CODIGO_CLERK_TEST);
        await page.waitForURL((u) => u.href !== urlAntes, {
          timeout: 4_000,
          waitUntil: "commit",
        });
      }).toPass({ timeout: 30_000, intervals: [500, 1_000] });
    } else if (pathname.includes("factor-two")) {
      if (!opciones.totpSecret) {
        throw new Error("La cuenta pide TOTP y no se pasó totpSecret");
      }
      await campoCodigo.pressSequentially(codigoTotp(opciones.totpSecret));
    } else {
      return;
    }
    if (!pathname.includes("client-trust")) {
      await page.waitForURL((u) => u.href !== urlAntes, {
        timeout: 30_000,
        waitUntil: "commit",
      });
    }
  }
}

// TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 dígitos) a partir de la clave en base32.
export function codigoTotp(secretoBase32: string, ahora = Date.now()): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretoBase32.replace(/=+$/, "").toUpperCase()) {
    bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  }
  const clave = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(ahora / 30_000)));
  const h = createHmac("sha1", clave).update(contador).digest();
  const o = h[h.length - 1] & 15;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function esperarArea(
  page: Page,
  ruta: string,
  titulo: string,
): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`${ruta}$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
}
