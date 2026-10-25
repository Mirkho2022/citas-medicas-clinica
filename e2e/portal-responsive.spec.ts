import { expect, test, type Page } from "@playwright/test";
import {
  borrarCitasDelMedico,
  ESPECIALIDAD_E2E,
  hayBaseDeDatos,
  hoyEnLima,
  idPaciente2,
  instanteDeLima,
  NOMBRE_MEDICO_E2E,
  prepararEscenario,
  restaurarPaciente2,
  retirarEscenario,
  sembrarCita,
  sumarDiasA,
  type EscenarioPortal,
} from "./datos-portal";
import { recorrerPacienteSinCitas, recorrerPortalConCitas, recorrerRegistro } from "./portal-pantallas";
import { iniciarSesion, prepararPagina, variable } from "./helpers";

// Diseño adaptable y uso con teclado del portal del paciente (H4, tarea 9.3; specs/usabilidad-y-accesibilidad-del-portal): sin desplazamiento
// horizontal a 320 y 390 px en TODAS las pantallas, objetivos táctiles de al menos 44 × 44 px (48 px en «Reservar cita» y «Confirmar cita»),
// reserva completa solo con teclado con el foco visible, el foco en el <h1> de cada paso y errores con `role="alert"` y confirmaciones con
// `role="status"`.
//
// Usa el escenario de e2e/datos-portal.ts: sin `E2E_DATABASE_URL` (ni `DATABASE_URL_UNPOOLED` en .env.local) o sin la segunda cuenta se omite con aviso.
test.describe.configure({ mode: "serial" });

const faltaAlgo = !hayBaseDeDatos() || !process.env.E2E_PACIENTE2_EMAIL || !process.env.E2E_PACIENTE2_PASSWORD;
test.skip(faltaAlgo, "Necesitan E2E_DATABASE_URL (o DATABASE_URL_UNPOOLED) y E2E_PACIENTE2_EMAIL/E2E_PACIENTE2_PASSWORD: ver docs/pruebas-e2e.md");

const ANCHOS = [320, 390];
const ALTO = 800;
const MINIMO_TACTIL = 44;
const MINIMO_ACCION_PRINCIPAL = 48;

let escenario: EscenarioPortal;

test.beforeAll(async () => {
  escenario = await prepararEscenario();
});

test.afterAll(async () => {
  await restaurarPaciente2();
  await retirarEscenario();
});

async function entrar(page: Page, paciente: 1 | 2, ancho: number): Promise<void> {
  await page.setViewportSize({ width: ancho, height: ALTO });
  await prepararPagina(page);
  const [correo, clave] = paciente === 1 ? ["E2E_PACIENTE_EMAIL", "E2E_PACIENTE_PASSWORD"] : ["E2E_PACIENTE2_EMAIL", "E2E_PACIENTE2_PASSWORD"];
  await iniciarSesion(page, variable(correo!), variable(clave!));
}

// Sin desplazamiento horizontal y con los controles tocables de al menos 44 × 44 px. Los enlaces en línea dentro de un párrafo y los campos de solo
// lectura quedan fuera (no son un objetivo táctil independiente); las acciones principales deben medir 48 px de alto.
async function revisarPantalla(page: Page, nombre: string, ancho: number): Promise<void> {
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(desborde, `«${nombre}» a ${ancho} px no debe desplazarse en horizontal`).toBeLessThanOrEqual(0);

  const pequenos = await page.evaluate((minimo) => {
    const candidatos = [
      ...document.querySelectorAll<HTMLElement>(
        "main button, main select, main a[href], main input:not([type=hidden]):not([type=radio]):not([readonly]), header button, nav a[href]",
      ),
    ];
    return candidatos
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed")
      .filter((el) => !(el.tagName === "A" && el.closest("p, li") && getComputedStyle(el).display === "inline"))
      .filter((el) => !el.closest("dialog:not([open])"))
      .map((el) => ({ el, caja: el.getBoundingClientRect() }))
      .filter(({ caja }) => caja.width > 0 && (caja.width < minimo || caja.height < minimo))
      .map(({ el, caja }) => `${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}» ${Math.round(caja.width)}×${Math.round(caja.height)}`);
  }, MINIMO_TACTIL);
  expect(pequenos, `«${nombre}» a ${ancho} px tiene controles menores de ${MINIMO_TACTIL} × ${MINIMO_TACTIL} px`).toEqual([]);

  for (const principal of [page.getByRole("link", { name: "Reservar cita", exact: true }), page.getByRole("button", { name: "Confirmar cita" })]) {
    for (const boton of await principal.all()) {
      if (!(await boton.isVisible())) continue;
      const caja = await boton.boundingBox();
      expect(caja!.height, `«${nombre}»: la acción principal debe medir ${MINIMO_ACCION_PRINCIPAL} px de alto`).toBeGreaterThanOrEqual(MINIMO_ACCION_PRINCIPAL);
    }
  }
}

for (const ancho of ANCHOS) {
  test(`registro del paciente: sin desplazamiento horizontal y con objetivos táctiles (${ancho} px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await entrar(page, 2, ancho);
    await recorrerRegistro(page, (nombre) => revisarPantalla(page, nombre, ancho));
  });

  test(`«Inicio» y «Mis citas» sin citas: sin desplazamiento horizontal y con objetivos táctiles (${ancho} px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await entrar(page, 2, ancho);
    await recorrerPacienteSinCitas(page, (nombre) => revisarPantalla(page, nombre, ancho));
  });

  test(`«Mis citas», cancelación y «Reservar»: sin desplazamiento horizontal y con objetivos táctiles (${ancho} px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await entrar(page, 1, ancho);
    await recorrerPortalConCitas(page, escenario, (nombre) => revisarPantalla(page, nombre, ancho));
  });
}

// Tabula hasta que el foco llega al elemento y comprueba que se VE (anillo de foco o contorno).
async function tabularHasta(page: Page, destino: ReturnType<Page["getByRole"]>, descripcion: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const enfocado = await destino.evaluate((el) => el === document.activeElement).catch(() => false);
    if (enfocado) {
      const visible = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const estilo = getComputedStyle(el);
        return (estilo.outlineStyle !== "none" && parseFloat(estilo.outlineWidth) > 0) || (estilo.boxShadow !== "none" && estilo.boxShadow !== "");
      });
      expect(visible, `«${descripcion}» recibe el foco pero no se ve el anillo de foco`).toBe(true);
      return;
    }
  }
  throw new Error(`El foco no llegó a «${descripcion}» tabulando`);
}

test("la reserva se completa solo con el teclado, con el foco visible y en el título de cada paso", async ({ page }) => {
  test.setTimeout(240_000);
  await entrar(page, 1, 390);
  await borrarCitasDelMedico(escenario);
  const dia = sumarDiasA(hoyEnLima(), 16);
  const titulo = (nombre: string) => page.getByRole("heading", { name: nombre, level: 1 });

  await page.goto("/paciente/citas/nueva");
  await expect(titulo("Reservar cita")).toBeFocused();

  await tabularHasta(page, page.getByRole("link", { name: ESPECIALIDAD_E2E }), ESPECIALIDAD_E2E);
  await page.keyboard.press("Enter");
  await expect(titulo("Elija un médico")).toBeFocused();

  await tabularHasta(page, page.getByRole("link", { name: new RegExp(NOMBRE_MEDICO_E2E) }), NOMBRE_MEDICO_E2E);
  await page.keyboard.press("Enter");
  await expect(titulo("Elija un día")).toBeFocused();

  await tabularHasta(page, page.locator(`a[href*="dia=${dia}"]`), `día ${dia}`);
  await page.keyboard.press("Enter");
  await expect(titulo("Elija un horario")).toBeFocused();

  await tabularHasta(page, page.getByRole("button", { name: "10:00" }), "10:00");
  await page.keyboard.press("Enter");
  await expect(titulo("Confirme su cita")).toBeFocused();

  await tabularHasta(page, page.getByRole("button", { name: "Confirmar cita" }), "Confirmar cita");
  await page.keyboard.press("Enter");
  await expect(titulo("Su cita quedó reservada")).toBeFocused({ timeout: 30_000 });
  await borrarCitasDelMedico(escenario);
});

test("los errores usan role=alert y las confirmaciones role=status", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await entrar(page, 2, 390);
  await recorrerRegistro(page, async (nombre) => {
    if (nombre.endsWith("en espera")) {
      await expect(page.locator('main [role="status"]').first()).toContainText("Estamos preparando su cuenta");
    }
    if (nombre.endsWith("con errores")) {
      const errores = page.locator('main p[role="alert"]');
      await expect(errores.first()).toBeVisible();
      expect(await errores.count()).toBeGreaterThanOrEqual(1);
    }
  });

  // Segunda persona, en otro contexto: la página anterior sigue con la sesión del segundo paciente.
  await restaurarPaciente2();
  page = await (await browser.newContext()).newPage();
  await entrar(page, 1, 390);
  await borrarCitasDelMedico(escenario);
  const dia = sumarDiasA(hoyEnLima(), 17);
  // Un horario que otra persona acaba de tomar es una alerta y la reserva guardada, un estado.
  await page.goto(`/paciente/citas/nueva?medico=${escenario.medicoId}&dia=${dia}&hora=${encodeURIComponent(instanteDeLima(dia, "11:00").toISOString())}`);
  await expect(page.getByRole("heading", { name: "Confirme su cita", level: 1 })).toBeVisible();
  await sembrarCita(escenario, await idPaciente2(), instanteDeLima(dia, "11:00"));
  await page.getByRole("button", { name: "Confirmar cita" }).click();
  await expect(page.locator('main [role="alert"]').getByText("El horario elegido ya no está disponible. Elija otro horario.")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "11:20" }).click();
  await page.getByRole("button", { name: "Confirmar cita" }).click();
  await expect(page.locator('main [role="status"]').getByText("Guardamos su cita.")).toBeVisible({ timeout: 30_000 });
  await borrarCitasDelMedico(escenario);
});
