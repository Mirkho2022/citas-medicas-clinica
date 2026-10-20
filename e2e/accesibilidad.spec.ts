import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { iniciarSesion, prepararPagina, variable } from "./helpers";

// H2b, grupo 7: revisión automática de accesibilidad (WCAG 2.1 A y AA) con axe sobre la galería y las áreas. Falla ante
// cualquier violación. axe no mide todo (orden lógico del foco, lector de pantalla…): la lista de revisión manual está en
// docs/pruebas-e2e.md. Las pantallas de Clerk (/iniciar-sesion, /registro) quedan fuera: su marcado no es nuestro.
const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function revisar(page: Page, nombre: string) {
  // Los diálogos entran con una transición de opacidad y axe mide el contraste con el color ya mezclado (un botón primario a medio
  // aparecer da 4,06 : 1 en vez de 5,47 : 1). Se espera a que no quede ninguna animación finita en curso; las infinitas (el brillo
  // del esqueleto de carga) no terminan nunca y no cuentan.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().endTime) !== Infinity)
            .length,
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
  expect(violations, `Violaciones de accesibilidad en ${nombre}:\n${resumen.join("\n")}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

test("la portada pública y la galería de componentes no tienen violaciones WCAG A/AA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await revisar(page, "la portada pública");

  await iniciarSesion(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    variable("E2E_PACIENTE_PASSWORD"),
  );
  await page.goto("/guia-de-estilo");
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toBeVisible();
  await revisar(page, "la galería (1280 px)");

  // Con el horario elegido (aparece la advertencia) y el selector de documento en Carné de Extranjería.
  await page.getByRole("button", { name: "14:30" }).click();
  await page.locator("#g-doc-dni-tipo").selectOption("CE");
  await revisar(page, "la galería con un horario elegido");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toBeVisible();
  await revisar(page, "la galería (390 px)");

  await page.goto("/paciente");
  await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();
  await revisar(page, "/paciente (390 px)");
});

test("el panel administrativo no tiene violaciones WCAG A/AA", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await iniciarSesion(
    page,
    variable("E2E_ADMINISTRATIVO_EMAIL"),
    variable("E2E_ADMINISTRATIVO_PASSWORD"),
    { totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET") },
  );
  await expect(page.getByRole("heading", { name: "Panel administrativo" })).toBeVisible();
  await revisar(page, "/administrativo (1280 px)");
});

// H3, tarea 12.3: las pantallas de la consola del administrativo (Pacientes, Agenda, Agendar, Horarios, Bajas), a 1280 y a 390 px,
// con los diálogos abiertos, y dos comprobaciones que axe no hace: el foco de un diálogo (entra al abrirlo y vuelve al botón que
// lo abrió con Escape) y el tamaño mínimo de los controles de la consola (24 px, DESIGN.md «Layout»).
test("las pantallas de H3 no tienen violaciones WCAG A/AA, los diálogos manejan el foco y los controles miden 24 px o más", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await iniciarSesion(
    page,
    variable("E2E_ADMINISTRATIVO_EMAIL"),
    variable("E2E_ADMINISTRATIVO_PASSWORD"),
    { totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET") },
  );
  await expect(page.getByRole("heading", { name: "Panel administrativo" })).toBeVisible();
  await revisar(page, "/administrativo con los atajos (1280 px)");

  // Controles de la consola: botones, selectores y campos visibles de `main`, de al menos 24 × 24 px (WCAG 2.2, 2.5.8).
  const pequenos = (p: Page) =>
    p.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main button, main select, main input:not([type=radio]):not([type=hidden])")]
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed")
        .map((el) => ({ el, caja: el.getBoundingClientRect() }))
        .filter(({ caja }) => caja.width > 0 && (caja.width < 24 || caja.height < 24))
        .map(({ el, caja }) => `${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}» ${Math.round(caja.width)}×${Math.round(caja.height)}`),
    );

  await page.goto("/administrativo/pacientes");
  await expect(page.getByRole("heading", { name: "Pacientes", level: 1 })).toBeVisible();
  await revisar(page, "/administrativo/pacientes (1280 px)");
  // con errores de validación y el resumen enlazado
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Revise los datos ingresados" })).toBeVisible();
  await revisar(page, "/administrativo/pacientes con errores (1280 px)");
  expect(await pequenos(page)).toEqual([]);

  await page.goto("/administrativo/agenda");
  await expect(page.getByRole("heading", { name: "Agenda del día" })).toBeVisible();
  const medicos = await page.locator("#filtro-medico option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).map((o) => ({ valor: o.value, texto: o.textContent ?? "" })).filter((o) => o.valor),
  );
  await revisar(page, "/administrativo/agenda (1280 px)");
  expect(await pequenos(page)).toEqual([]);

  if (medicos.length > 0) {
    const dia = new Date(Date.now() - 5 * 3600_000 + 14 * 86_400_000);
    while ([0, 6].includes(dia.getUTCDay())) dia.setUTCDate(dia.getUTCDate() + 1);
    const fecha = dia.toISOString().slice(0, 10);

    // El diálogo de agendar sobre un hueco: foco dentro al abrir y de vuelta al botón con Escape.
    await page.goto(`/administrativo/agenda?fecha=${fecha}&medico=${medicos[0]!.valor}`);
    const agendar = page.getByRole("button", { name: /^Agendar/ }).first();
    await expect(agendar).toBeVisible();
    await agendar.click();
    const dialogo = page.getByRole("dialog", { name: "Agendar cita" });
    await expect(dialogo).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
    await revisar(page, "el diálogo de agendar (1280 px)");
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(agendar).toBeFocused();

    // El selector de fecha: se abre, se revisa y Escape devuelve el foco a su botón.
    const selector = page.getByRole("button", { name: /^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) \d{2}\/\d{2}\/\d{4}$/ });
    await selector.click();
    await expect(page.getByRole("dialog", { name: "Elegir la fecha" })).toBeVisible();
    await revisar(page, "el selector de fecha abierto (1280 px)");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Elegir la fecha" })).toBeHidden();
    await expect(selector).toBeFocused();

    await page.goto(`/administrativo/agenda/nueva?medico=${medicos[0]!.valor}&fecha=${fecha}`);
    await expect(page.getByRole("heading", { name: "Agendar cita", level: 1 })).toBeVisible();
    await revisar(page, "/administrativo/agenda/nueva (1280 px)");

    await page.goto("/administrativo/horarios");
    await expect(page.getByRole("heading", { name: "Horarios", level: 1 })).toBeVisible();
    await revisar(page, "/administrativo/horarios (1280 px)");
    await page.goto(`/administrativo/horarios/${medicos[0]!.valor}`);
    await expect(page.getByRole("heading", { name: "Horario semanal" })).toBeVisible();
    await revisar(page, "/administrativo/horarios/[médico] (1280 px)");
    await page.getByRole("button", { name: "Agregar horario" }).click();
    await expect(page.getByRole("dialog", { name: "Agregar horario" })).toBeVisible();
    await revisar(page, "el diálogo de agregar horario (1280 px)");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Agregar ausencia" }).click();
    await expect(page.getByRole("dialog", { name: "Agregar ausencia" })).toBeVisible();
    await revisar(page, "el diálogo de agregar ausencia (1280 px)");
    await page.keyboard.press("Escape");
    expect(await pequenos(page)).toEqual([]);
  }

  await page.goto("/administrativo/bajas");
  await expect(page.getByRole("heading", { name: "Bajas médicas", level: 1 })).toBeVisible();
  await revisar(page, "/administrativo/bajas (1280 px)");

  // En un teléfono (390 px) las mismas pantallas siguen siendo accesibles y sin desplazamiento horizontal de la página.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [ruta, titulo] of [
    ["/administrativo", "Panel administrativo"],
    ["/administrativo/pacientes", "Pacientes"],
    ["/administrativo/agenda", "Agenda del día"],
    ["/administrativo/horarios", "Horarios"],
    ["/administrativo/bajas", "Bajas médicas"],
  ] as const) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
    await revisar(page, `${ruta} (390 px)`);
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(desborda, `${ruta} desborda a 390 px`).toBe(false);
  }
});
