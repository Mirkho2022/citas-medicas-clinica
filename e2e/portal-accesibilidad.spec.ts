import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { hayBaseDeDatos, prepararEscenario, restaurarPaciente2, retirarEscenario, type EscenarioPortal } from "./datos-portal";
import { recorrerPacienteSinCitas, recorrerPortalConCitas, recorrerRegistro } from "./portal-pantallas";
import { iniciarSesion, prepararPagina, variable } from "./helpers";

// Accesibilidad del portal del paciente (H4, tarea 9.1; specs/usabilidad-y-accesibilidad-del-portal): axe (WCAG 2.1 A y AA) sobre cada pantalla y
// estado del portal, a 390 px (el uso real del paciente) y a 1280 px. Falla ante CUALQUIER violación. axe no mide todo (orden lógico del foco,
// lector de pantalla…): la revisión manual está en docs/pruebas-e2e.md. Las pantallas de Clerk quedan fuera: su marcado no es nuestro.
//
// Usa el escenario de e2e/datos-portal.ts: sin `E2E_DATABASE_URL` (ni `DATABASE_URL_UNPOOLED` en .env.local) o sin la segunda cuenta se omite con aviso.
test.describe.configure({ mode: "serial" });

const faltaAlgo = !hayBaseDeDatos() || !process.env.E2E_PACIENTE2_EMAIL || !process.env.E2E_PACIENTE2_PASSWORD;
test.skip(faltaAlgo, "Necesitan E2E_DATABASE_URL (o DATABASE_URL_UNPOOLED) y E2E_PACIENTE2_EMAIL/E2E_PACIENTE2_PASSWORD: ver docs/pruebas-e2e.md");

const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const PANTALLAS = [
  { nombre: "390 px", ancho: 390, alto: 800 },
  { nombre: "1280 px", ancho: 1280, alto: 800 },
];

let escenario: EscenarioPortal;

test.beforeAll(async () => {
  escenario = await prepararEscenario();
});

test.afterAll(async () => {
  await restaurarPaciente2();
  await retirarEscenario();
});

async function revisar(page: Page, nombre: string): Promise<void> {
  // Las transiciones de entrada alteran el contraste que mide axe: se espera a que no quede ninguna animación finita en curso (las infinitas,
  // como el brillo del esqueleto, no terminan nunca y no cuentan).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().endTime) !== Infinity).length,
      ),
    )
    .toBe(0);
  const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  const resumen = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .slice(0, 4)
        .map((n) => n.target.join(" "))
        .join("\n    ")}`,
  );
  expect(violations, `Violaciones de accesibilidad en «${nombre}»:\n${resumen.join("\n")}`).toEqual([]);
}

async function entrar(page: Page, paciente: 1 | 2, ancho: number, alto: number): Promise<void> {
  await page.setViewportSize({ width: ancho, height: alto });
  await prepararPagina(page);
  const [correo, clave] = paciente === 1 ? ["E2E_PACIENTE_EMAIL", "E2E_PACIENTE_PASSWORD"] : ["E2E_PACIENTE2_EMAIL", "E2E_PACIENTE2_PASSWORD"];
  await iniciarSesion(page, variable(correo!), variable(clave!));
}

for (const pantalla of PANTALLAS) {
  test(`registro del paciente sin violaciones WCAG A/AA (${pantalla.nombre})`, async ({ page }) => {
    test.setTimeout(180_000);
    await entrar(page, 2, pantalla.ancho, pantalla.alto);
    await recorrerRegistro(page, (nombre) => revisar(page, `${nombre} (${pantalla.nombre})`));
  });

  test(`«Inicio» y «Mis citas» sin citas sin violaciones WCAG A/AA (${pantalla.nombre})`, async ({ page }) => {
    test.setTimeout(180_000);
    await entrar(page, 2, pantalla.ancho, pantalla.alto);
    await recorrerPacienteSinCitas(page, (nombre) => revisar(page, `${nombre} (${pantalla.nombre})`));
  });

  test(`«Mis citas», cancelación y cada paso de «Reservar» sin violaciones WCAG A/AA (${pantalla.nombre})`, async ({ page }) => {
    test.setTimeout(240_000);
    await entrar(page, 1, pantalla.ancho, pantalla.alto);
    await recorrerPortalConCitas(page, escenario, (nombre) => revisar(page, `${nombre} (${pantalla.nombre})`));
  });
}
