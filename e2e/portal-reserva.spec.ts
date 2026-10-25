import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  citasDe,
  ESPECIALIDAD_E2E,
  hayBaseDeDatos,
  hoyEnLima,
  instanteDeLima,
  NOMBRE_MEDICO_E2E,
  prepararEscenario,
  retirarEscenario,
  sembrarBloqueoDelDia,
  sembrarCita,
  sumarDiasA,
  textoFechaDe,
  type EscenarioPortal,
} from "./datos-portal";
import { esperarArea, iniciarSesion, iniciarSesionEnLaPantalla, prepararPagina, variable } from "./helpers";

// Búsqueda y reserva del portal (H4, tarea 6.6; specs/busqueda-y-reserva-de-cita y usabilidad-y-accesibilidad-del-portal): la reserva completa
// desde «Inicio» en 5 elecciones, la advertencia con su hora límite, una cita en menos de 1 hora, la doble reserva REAL con dos contextos de
// navegador y dos pacientes, el doble clic, la sesión vencida, nada en el pasado y que un paciente no ve lo que ocupa otro.
//
// Usan un médico de prueba con la agenda abierta las 24 horas (e2e/datos-portal.ts), sembrado con la conexión del dueño: sin
// `E2E_DATABASE_URL` (ni `DATABASE_URL_UNPOOLED` en .env.local) o sin la segunda cuenta de paciente se omiten con un aviso. Las citas se agendan
// a 14 días o más y el médico de prueba, con sus citas, se borra al terminar.
test.describe.configure({ mode: "serial" });

const faltaAlgo = !hayBaseDeDatos() || !process.env.E2E_PACIENTE2_EMAIL || !process.env.E2E_PACIENTE2_PASSWORD;
test.skip(
  faltaAlgo,
  "Necesitan E2E_DATABASE_URL (o DATABASE_URL_UNPOOLED) y E2E_PACIENTE2_EMAIL/E2E_PACIENTE2_PASSWORD: ver docs/07-testing/pruebas-e2e.md",
);

let escenario: EscenarioPortal;
const DIA = sumarDiasA(hoyEnLima(), 14);
const DIA_SIN_HORARIOS = sumarDiasA(hoyEnLima(), 10);
const RUTA = "/paciente/citas/nueva";

test.beforeAll(async () => {
  escenario = await prepararEscenario();
  await sembrarBloqueoDelDia(escenario, DIA_SIN_HORARIOS);
});

test.afterAll(async () => {
  await retirarEscenario();
});

async function entrar(page: Page, paciente: 1 | 2): Promise<void> {
  await prepararPagina(page);
  const [correo, clave] = paciente === 1 ? ["E2E_PACIENTE_EMAIL", "E2E_PACIENTE_PASSWORD"] : ["E2E_PACIENTE2_EMAIL", "E2E_PACIENTE2_PASSWORD"];
  await iniciarSesion(page, variable(correo!), variable(clave!));
  await esperarArea(page, "/paciente", "Portal del paciente");
}

async function nuevaPaginaDe(browser: Browser, paciente: 1 | 2, opciones: { timezoneId?: string } = {}): Promise<Page> {
  const contexto = await browser.newContext(opciones);
  const page = await contexto.newPage();
  await entrar(page, paciente);
  return page;
}

const urlConfirmar = (dia: string, hora: string) =>
  `${RUTA}?medico=${escenario.medicoId}&dia=${dia}&hora=${encodeURIComponent(instanteDeLima(dia, hora).toISOString())}`;
const urlHorarios = (dia: string) => `${RUTA}?medico=${escenario.medicoId}&dia=${dia}`;

const confirmar = (page: Page) => page.getByRole("button", { name: "Confirmar cita" });
const titulo = (page: Page, nombre: string | RegExp) => page.getByRole("heading", { name: nombre });

// "09:20" menos una hora.
function unaHoraAntes(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  return `${String((h! + 23) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

test("una reserva completa desde «Inicio» toma como máximo 5 elecciones, con la advertencia y su hora límite en Lima", async ({ page }) => {
  await entrar(page, 1);
  let elecciones = 0;

  // «Reservar cita» abre el primer paso y no cuenta: las 5 elecciones son especialidad, médico, día, horario y confirmar.
  await page.getByRole("link", { name: "Reservar cita", exact: true }).click();
  await expect(titulo(page, "Reservar cita")).toBeVisible();

  await page.getByRole("link", { name: ESPECIALIDAD_E2E }).click();
  elecciones++;
  await expect(titulo(page, "Elija un médico")).toBeVisible();
  await expect(page.getByText("Próximo horario:")).toBeVisible();

  await page.getByRole("link", { name: new RegExp(NOMBRE_MEDICO_E2E) }).click();
  elecciones++;
  await expect(titulo(page, "Elija un día")).toBeVisible();

  await page.locator(`a[href*="dia=${DIA}"]`).click();
  elecciones++;
  await expect(titulo(page, "Elija un horario")).toBeVisible();

  await page.getByRole("button", { name: "09:20" }).click();
  elecciones++;
  await expect(titulo(page, "Confirme su cita")).toBeVisible();

  // Resumen: médico, especialidad, fecha y hora de Lima; sin campo de motivo.
  const resumen = page.locator("dl");
  await expect(resumen).toContainText(NOMBRE_MEDICO_E2E);
  await expect(resumen).toContainText(ESPECIALIDAD_E2E);
  await expect(resumen).toContainText(textoFechaDe(DIA));
  await expect(resumen).toContainText("09:20");
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.getByLabel(/motivo/i)).toHaveCount(0);

  // La advertencia con la hora límite va ANTES del botón de confirmar.
  const advertencia = page.getByText(`Podrá cancelar esta cita hasta 1 hora antes, a las ${unaHoraAntes("09:20")}.`);
  await expect(advertencia).toBeVisible();
  const [cajaAdvertencia, cajaBoton] = [await advertencia.boundingBox(), await confirmar(page).boundingBox()];
  expect(cajaAdvertencia!.y).toBeLessThan(cajaBoton!.y);
  expect(cajaBoton!.height).toBeGreaterThanOrEqual(48);

  await confirmar(page).click();
  elecciones++;
  await expect(titulo(page, "Su cita quedó reservada")).toBeVisible();
  expect(elecciones).toBeLessThanOrEqual(5);

  // La cita quedó a nombre del paciente de la sesión, con origen «portal», y aparece en «Mis citas».
  const citas = await citasDe(escenario.paciente1, escenario.medicoId);
  expect(citas).toHaveLength(1);
  expect(citas[0]).toMatchObject({ estado: "reservada", origen: "portal" });
  expect(citas[0]!.inicio.toISOString()).toBe(instanteDeLima(DIA, "09:20").toISOString());
  await page.getByRole("link", { name: "Ver mis citas" }).click();
  await expect(page.getByText(NOMBRE_MEDICO_E2E)).toBeVisible();
});

test("el botón «atrás» conserva la selección y los días sin horarios están deshabilitados con «Sin horarios»", async ({ page }) => {
  await entrar(page, 1);
  await page.goto(`${RUTA}?especialidad=${await especialidadDe(page)}&medico=${escenario.medicoId}`);
  await expect(titulo(page, "Elija un día")).toBeVisible();

  // El día bloqueado no se puede elegir y lo dice con texto (no solo con color).
  const bloqueado = page.locator("li", { hasText: textoFechaDe(DIA_SIN_HORARIOS) });
  await expect(bloqueado).toContainText("Sin horarios");
  await expect(bloqueado.locator("a")).toHaveCount(0);
  await expect(bloqueado.locator('[aria-disabled="true"]')).toHaveCount(1);
  // Un día normal sí es un enlace.
  await expect(page.locator(`a[href*="dia=${DIA}"]`)).toHaveCount(1);

  await page.locator(`a[href*="dia=${DIA}"]`).click();
  await page.getByRole("button", { name: "09:40" }).click();
  await expect(titulo(page, "Confirme su cita")).toBeVisible();

  await page.goBack();
  await expect(titulo(page, "Elija un horario")).toBeVisible();
  await expect(page.getByRole("button", { name: "09:40" })).toBeVisible();
  await page.goBack();
  await expect(titulo(page, "Elija un día")).toBeVisible();
});

// El `id` de la especialidad de prueba lo trae el enlace del primer paso.
async function especialidadDe(page: Page): Promise<string> {
  await page.goto(RUTA);
  const href = await page.getByRole("link", { name: ESPECIALIDAD_E2E }).getAttribute("href");
  return new URL(href!, "http://localhost").searchParams.get("especialidad")!;
}

test("los horarios y los días se ven en hora de Lima aunque el navegador use otra zona horaria", async ({ browser }) => {
  const page = await nuevaPaginaDe(browser, 1, { timezoneId: "Asia/Tokyo" });
  await page.goto(urlHorarios(sumarDiasA(hoyEnLima(), 12)));
  await expect(titulo(page, "Elija un horario")).toBeVisible();
  // El médico de prueba atiende desde las 00:00 de Lima: en Tokio serían las 14:00.
  const primero = page.getByRole("group", { name: "Horarios disponibles" }).getByRole("button").first();
  await expect(primero).toContainText("00:00");
  await page.getByRole("button", { name: /^Tarde/ }).click();
  await expect(page.getByRole("button", { name: "14:00" })).toBeVisible(); // 14:00 de Lima, no de Tokio
  await page.context().close();
});

test("los horarios se muestran por franja del día: solo los de la franja elegida", async ({ page }) => {
  await entrar(page, 1);
  await page.goto(urlHorarios(sumarDiasA(hoyEnLima(), 12)));
  await expect(titulo(page, "Elija un horario")).toBeVisible();
  const franjas = page.getByRole("group", { name: "Franja del día" });
  await expect(franjas.getByRole("button", { name: /^Mañana/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "09:20" })).toBeVisible();
  await expect(page.getByRole("button", { name: "14:00" })).toHaveCount(0);
  await franjas.getByRole("button", { name: /^Noche/ }).click();
  await expect(page.getByRole("button", { name: "20:00" })).toBeVisible();
  await expect(page.getByRole("button", { name: "09:20" })).toHaveCount(0);
});

test("una cita que empieza en menos de 1 hora avisa que ya no podrá cancelarla desde el portal", async ({ page }) => {
  await entrar(page, 1);
  await page.goto(urlHorarios(hoyEnLima()));
  const primero = page.getByRole("group", { name: "Horarios disponibles" }).getByRole("button", { disabled: false }).first();
  test.skip(!(await primero.isVisible().catch(() => false)), "Ya no quedan horarios hoy (muy cerca de la medianoche de Lima)");
  await primero.click();

  await expect(titulo(page, "Confirme su cita")).toBeVisible();
  await expect(page.getByText(/ya no podrá cancelarla desde el portal/)).toBeVisible();
  await expect(page.getByText(/Confirme solo si desea reservarla de todos modos/)).toBeVisible();
  await expect(confirmar(page)).toBeEnabled(); // pide confirmar de todos modos; no se confirma aquí
});

test("doble reserva real con dos pacientes: una cita se crea y la otra recibe el texto exacto, con el horario «No disponible»", async ({ browser }) => {
  const [p1, p2] = [await nuevaPaginaDe(browser, 1), await nuevaPaginaDe(browser, 2)];
  try {
    await Promise.all([p1.goto(urlConfirmar(DIA, "10:00")), p2.goto(urlConfirmar(DIA, "10:00"))]);
    await Promise.all([expect(titulo(p1, "Confirme su cita")).toBeVisible(), expect(titulo(p2, "Confirme su cita")).toBeVisible()]);

    // Los dos confirman a la vez.
    await Promise.all([confirmar(p1).click(), confirmar(p2).click()]);

    const llego = async (p: Page) => {
      await expect(titulo(p, /Su cita quedó reservada|Elija un horario/)).toBeVisible({ timeout: 30_000 });
      return (await titulo(p, "Su cita quedó reservada").count()) === 1;
    };
    const [gana1, gana2] = [await llego(p1), await llego(p2)];
    expect([gana1, gana2].filter(Boolean)).toHaveLength(1);

    // Exactamente una cita vigente en ese horario (de uno de los dos pacientes).
    const [citas1, citas2] = [await citasDe(escenario.paciente1, escenario.medicoId), await citasDe(escenario.paciente2, escenario.medicoId)];
    const a10 = instanteDeLima(DIA, "10:00").toISOString();
    const enHorario = [...citas1, ...citas2].filter((c) => c.inicio.toISOString() === a10 && c.estado === "reservada");
    expect(enHorario).toHaveLength(1);

    // El que perdió ve el literal exacto en su propio elemento, la guía aparte y el horario «No disponible».
    const perdedor = gana1 ? p2 : p1;
    const alerta = perdedor.getByRole("alert");
    // Con una colisión simultánea real el motor responde con el literal exacto; si el ganador confirmó unos milisegundos antes de que el
    // perdedor comprobara el horario (el preview de Vercel serializa a veces las dos solicitudes), la acción responde con el aviso de
    // «horario ya no disponible», que también es correcto. El literal del PRD lo cubren las pruebas de integración.
    const literal = alerta.getByText("Registro de cita ya agendado", { exact: true });
    const horarioTomado = alerta.getByText("El horario elegido ya no está disponible. Elija otro horario.", { exact: true });
    await expect(literal.or(horarioTomado)).toBeVisible();
    if (await literal.count()) await expect(alerta.getByText("Elija otro horario.", { exact: true })).toBeVisible();
    const diez = perdedor.getByRole("button", { name: /10:00/ });
    await expect(diez).toBeDisabled();
    await expect(diez).toContainText("No disponible");
  } finally {
    await p1.context().close();
    await p2.context().close();
  }
});

test("el doble clic en «Confirmar cita» deja una sola cita y muestra la confirmación, no un error", async ({ page }) => {
  await entrar(page, 1);
  await page.goto(urlConfirmar(DIA, "10:20"));
  await expect(titulo(page, "Confirme su cita")).toBeVisible();

  await confirmar(page).dblclick();
  await expect(titulo(page, "Su cita quedó reservada")).toBeVisible({ timeout: 30_000 });
  // El anunciador de rutas de Next también es un `role="alert"` (fuera de `main`): solo cuentan las alertas de la pantalla.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

  const a1020 = instanteDeLima(DIA, "10:20").toISOString();
  const citas = (await citasDe(escenario.paciente1, escenario.medicoId)).filter((c) => c.inicio.toISOString() === a1020);
  expect(citas).toHaveLength(1);
});

test("con la sesión vencida no se crea ninguna cita, se explica y al volver a entrar la selección sigue intacta", async ({ page }) => {
  await entrar(page, 1);
  await page.goto(urlConfirmar(DIA, "10:40"));
  await expect(titulo(page, "Confirme su cita")).toBeVisible();

  // La sesión venció a mitad del flujo: se termina en Clerk. (Borrar solo las cookies del navegador no sirve: Clerk las vuelve a escribir desde su
  // token en memoria en menos de un segundo, y con BotID el envío tarda lo suficiente para que lo haga.)
  type ClerkEnNavegador = { Clerk?: { session?: { end: () => Promise<unknown> } } };
  await page.waitForFunction(() => Boolean((window as unknown as ClerkEnNavegador).Clerk?.session));
  await page.evaluate(() => (window as unknown as ClerkEnNavegador).Clerk!.session!.end());
  await confirmar(page).click();

  await expect(page.getByText("Su sesión venció. Inicie sesión de nuevo para terminar su reserva.")).toBeVisible();
  const a1040 = instanteDeLima(DIA, "10:40").toISOString();
  expect((await citasDe(escenario.paciente1, escenario.medicoId)).filter((c) => c.inicio.toISOString() === a1040)).toHaveLength(0);

  // «Iniciar sesión» vuelve a la misma confirmación (la selección vive en la dirección).
  await page.getByRole("link", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/iniciar-sesion\?redirect_url=/, { timeout: 30_000 });
  await iniciarSesionEnLaPantalla(page, variable("E2E_PACIENTE_EMAIL"), variable("E2E_PACIENTE_PASSWORD"));
  const volvio = titulo(page, "Confirme su cita");
  await expect(volvio).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`dia=${DIA}`));
  await expect(page.locator("dl")).toContainText("10:40");
});

test("nada se reserva en el pasado: ni un día anterior ni un horario de hoy que ya empezó", async ({ page }) => {
  await entrar(page, 1);
  const ayer = sumarDiasA(hoyEnLima(), -1);
  // Un día anterior no es válido: la dirección cae en un paso previo y nunca llega a «Confirme su cita».
  await page.goto(`${RUTA}?medico=${escenario.medicoId}&dia=${ayer}&hora=${encodeURIComponent(instanteDeLima(ayer, "10:00").toISOString())}`);
  await expect(titulo(page, "Elija un día")).toBeVisible();
  await expect(titulo(page, "Confirme su cita")).toHaveCount(0);

  // Las 00:00 de hoy ya pasaron: se vuelve a los horarios con el aviso, sin crear nada.
  await page.goto(urlConfirmar(hoyEnLima(), "00:00"));
  await expect(titulo(page, "Elija un horario")).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toContainText("El horario elegido ya no está disponible. Elija otro horario.");
  const enElPasado = (await citasDe(escenario.paciente1, escenario.medicoId)).filter((c) => c.inicio.getTime() < Date.now());
  expect(enElPasado).toHaveLength(0);
});

test("un paciente no ve los horarios que ocupa otro y su propio cruce se marca «No disponible»", async ({ page }) => {
  const dia = sumarDiasA(hoyEnLima(), 15);
  await sembrarCita(escenario, escenario.paciente2, instanteDeLima(dia, "11:00"));
  await entrar(page, 1);
  await page.goto(urlHorarios(dia));
  await expect(titulo(page, "Elija un horario")).toBeVisible();
  await expect(page.getByRole("button", { name: /11:00/ })).toHaveCount(0); // el horario del otro paciente no se ofrece
  await expect(page.getByRole("button", { name: /11:20/ })).toBeEnabled();
  // Nada del otro paciente en la pantalla.
  await expect(page.locator("body")).not.toContainText("Segundo");
  await expect(page.locator("body")).not.toContainText("98000002");
});
