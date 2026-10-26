import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { conDueno, hayBaseDeDatos } from "./datos-portal";
import { iniciarSesion, prepararPagina } from "./helpers";

// Registro y firma de atención (historias-clinicas, grupos 7 y 8; specs/registro-de-atencion y firma-y-addendas). Con el médico de
// demostración (CMP-DEMO-001, la cuenta E2E_MEDICO_*): validación del servidor y del formulario con campos vacíos, diagnóstico elegido
// por teclado y sin repetir, nada clínico en el almacenamiento del navegador, ficha del paciente sin controles editables, guardar
// borrador, editarlo, firmarlo con confirmación, ver «Firmada» sin controles de edición y agregar una addenda (vacía rechazada), y los
// negativos de otros roles. Axe sobre el formulario.
//
// Necesita: la cuenta del médico con su TOTP (`E2E_MEDICO_EMAIL`, `E2E_MEDICO_PASSWORD`, `E2E_MEDICO_TOTP_SECRET`), la base de datos con los
// datos de demostración (docs/07-testing/datos-demo.md) y la URL del dueño (`E2E_DATABASE_URL` o `DATABASE_URL_UNPOOLED`) para localizar
// al paciente a cargo y comprobar lo guardado. Sin eso se omite con un aviso. Las atenciones firmadas NO se pueden borrar (por diseño):
// cada corrida deja una atención firmada con una addenda en la historia de un paciente de demostración; no es dato real.
test.describe.configure({ mode: "serial" });

const faltan = ["E2E_MEDICO_EMAIL", "E2E_MEDICO_PASSWORD", "E2E_MEDICO_TOTP_SECRET"].filter((v) => !process.env[v]);
test.skip(
  faltan.length > 0 || !hayBaseDeDatos(),
  `Sin ${faltan.join(", ") || "E2E_DATABASE_URL"}: ver docs/07-testing/pruebas-e2e.md y docs/07-testing/datos-demo.md`,
);

const marca = `E2E atención ${Date.now()}`;
let pacienteId = "";
let nombrePaciente = "";

async function entrarComoMedico(page: Page) {
  await prepararPagina(page);
  await iniciarSesion(page, process.env.E2E_MEDICO_EMAIL!, process.env.E2E_MEDICO_PASSWORD!, {
    totpSecret: process.env.E2E_MEDICO_TOTP_SECRET!,
  });
}

test.beforeAll(async () => {
  const fila = await conDueno(async (c) => {
    const r = await c.query(
      `select p.id, p.nombres || ' ' || p.apellidos as nombre
         from public.asignaciones_paciente_medico a
         join public.medicos m on m.id = a.medico_id
         join public.pacientes p on p.id = a.paciente_id
        where m.cmp = 'CMP-DEMO-001' and p.numero_documento like '99%'
          and a.vigente_desde <= public.hoy_lima() and (a.vigente_hasta is null or a.vigente_hasta >= public.hoy_lima())
        order by p.numero_documento limit 1`,
    );
    return r.rows[0] as { id: string; nombre: string } | undefined;
  });
  test.skip(!fila, "Sin datos de demostración (el médico CMP-DEMO-001 no tiene pacientes a cargo): ver docs/07-testing/datos-demo.md");
  pacienteId = fila!.id;
  nombrePaciente = fila!.nombre;
});

async function llenarContenido(page: Page) {
  await page.getByLabel("Motivo de consulta").fill(`${marca}: dolor de cabeza`);
  await page.getByLabel("Anamnesis").fill("Tres días de evolución, sin fiebre.");
  await page.getByLabel("Examen físico").fill("Paciente estable, sin signos de alarma.");
  await page.getByLabel("Plan de tratamiento").fill("Analgésico y control en una semana.");
}

async function agregarDiagnosticoPorTeclado(page: Page, texto: string) {
  const combo = page.getByRole("combobox", { name: /Buscar diagnóstico/ });
  await combo.click();
  await combo.fill(texto);
  await expect(page.getByRole("option").first()).toBeVisible();
  await combo.press("ArrowDown");
  await combo.press("ArrowUp");
  await combo.press("Enter");
}

test("el formulario con campos vacíos muestra errores por campo y no guarda nada", async ({ page }) => {
  await entrarComoMedico(page);
  await page.goto(`/medico/pacientes/${pacienteId}/atencion/nueva`);
  await expect(page.getByRole("heading", { name: "Nueva atención", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("Historia clínica");

  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("La anamnesis es obligatoria").first()).toBeVisible();
  await expect(page.getByText("El motivo de consulta es obligatorio").first()).toBeVisible();
  await expect(page.getByText("El examen físico es obligatorio").first()).toBeVisible();
  await expect(page.getByText("El plan de tratamiento es obligatorio").first()).toBeVisible();
  await expect(page.getByText("Registre al menos un diagnóstico").first()).toBeVisible();
  await expect(page).toHaveURL(/\/atencion\/nueva$/);

  // Solo espacios y un invisible de ancho cero también cuentan como vacío.
  await page.getByLabel("Anamnesis").fill(" \u200B\n ");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("La anamnesis es obligatoria").first()).toBeVisible();
  await expect(page).toHaveURL(/\/atencion\/nueva$/);
});

test("la ficha del paciente es de solo lectura, el diagnóstico se elige por teclado sin repetirse y nada clínico queda en el navegador", async ({ page }) => {
  await entrarComoMedico(page);
  await page.goto(`/medico/pacientes/${pacienteId}/atencion/nueva`);
  await expect(page.getByTestId("ficha-nombre")).toHaveText(nombrePaciente);
  // Ningún control editable en la ficha lateral (nombres, documento, etc. son texto).
  await expect(page.locator("aside input, aside textarea, aside select")).toHaveCount(0);

  await llenarContenido(page);
  await agregarDiagnosticoPorTeclado(page, "cefal");
  await expect(page.getByRole("list", { name: "Diagnósticos elegidos" }).getByText("R51")).toBeVisible();

  // El mismo diagnóstico no se agrega dos veces.
  await agregarDiagnosticoPorTeclado(page, "cefal");
  await expect(page.getByRole("list", { name: "Diagnósticos elegidos" }).getByRole("listitem")).toHaveCount(1);

  const almacenado = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  expect(almacenado).not.toContain("dolor de cabeza");
  expect(almacenado).not.toContain("Tres días");

  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
});

test("guardar borrador, editarlo, firmarlo con confirmación y agregar una addenda", async ({ page }) => {
  test.setTimeout(240_000);
  await entrarComoMedico(page);
  await page.goto(`/medico/pacientes/${pacienteId}/atencion/nueva`);
  await llenarContenido(page);
  await agregarDiagnosticoPorTeclado(page, "cefal");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page).toHaveURL(new RegExp(`/medico/pacientes/${pacienteId}$`), { timeout: 30_000 });

  const atencion = await conDueno(async (c) => {
    const r = await c.query(
      "select id, firmada_en, diagnosticos -> 0 ->> 'descripcion' as diagnostico from public.atenciones where paciente_id = $1 and motivo_consulta like $2",
      [pacienteId, `${marca}%`],
    );
    return r.rows[0] as { id: string; firmada_en: Date | null; diagnostico: string };
  });
  expect(atencion.firmada_en).toBeNull();
  expect(atencion.diagnostico).toBe("Cefalea"); // la descripción la puso el catálogo

  // Editar el borrador y firmarlo desde el formulario, con confirmación.
  await page.goto(`/medico/pacientes/${pacienteId}/atencion/${atencion.id}`);
  await expect(page.getByLabel("Anamnesis")).toHaveValue("Tres días de evolución, sin fiebre.");
  await page.getByLabel("Anamnesis").fill("Cuatro días de evolución, sin fiebre.");
  await page.getByRole("button", { name: "Firmar atención" }).first().click();
  const dialogo = page.getByRole("alertdialog", { name: "¿Firmar esta atención?" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("ya no podrá editarse");
  await expect(dialogo).toContainText("addenda");
  await dialogo.getByRole("button", { name: "Firmar atención" }).click();
  await expect(page).toHaveURL(new RegExp(`/medico/pacientes/${pacienteId}$`), { timeout: 30_000 });

  const firmada = await conDueno(async (c) => {
    const r = await c.query(
      "select firmada_en, firma_metodo, firma_huella, anamnesis, public.huella_atencion(id) = firma_huella as huella_ok from public.atenciones where id = $1",
      [atencion.id],
    );
    return r.rows[0] as { firmada_en: Date | null; firma_metodo: string; firma_huella: string; anamnesis: string; huella_ok: boolean };
  });
  expect(firmada.firmada_en).not.toBeNull();
  expect(firmada.firma_metodo).toBe("logica");
  expect(firmada.huella_ok).toBe(true);
  expect(firmada.anamnesis).toBe("Cuatro días de evolución, sin fiebre.");

  // La atención firmada: «Firmada», sin controles de edición, con «Agregar addenda».
  await page.goto(`/medico/pacientes/${pacienteId}/atencion/${atencion.id}`);
  await expect(page.getByText("Firmada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar borrador" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Firmar atención" })).toHaveCount(0);
  await expect(page.locator("main textarea:not([name])")).toHaveCount(0);

  await page.getByRole("button", { name: "Agregar addenda" }).click();
  await page.getByRole("button", { name: "Guardar addenda" }).click();
  await expect(page.getByText("El texto de la addenda es obligatorio").first()).toBeVisible();
  await page.getByLabel("Texto de la addenda").fill(`${marca}: se aclara la dosis.`);
  await page.getByRole("button", { name: "Guardar addenda" }).click();
  await expect(page.getByText(`${marca}: se aclara la dosis.`)).toBeVisible();
  // El texto original no cambió.
  await expect(page.getByText("Cuatro días de evolución, sin fiebre.")).toBeVisible();
});

test("administrativo y paciente son llevados fuera de la pantalla de atención", async ({ browser }) => {
  for (const [email, password, totp, area] of [
    [process.env.E2E_ADMINISTRATIVO_EMAIL, process.env.E2E_ADMINISTRATIVO_PASSWORD, process.env.E2E_ADMINISTRATIVO_TOTP_SECRET, /\/administrativo$/],
    [process.env.E2E_PACIENTE_EMAIL, process.env.E2E_PACIENTE_PASSWORD, undefined, /\/paciente$/],
  ] as const) {
    test.skip(!email || !password, "Faltan las cuentas de administrativo y paciente (E2E_*)");
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await prepararPagina(page);
    await iniciarSesion(page, email!, password!, totp ? { totpSecret: totp } : {});
    await page.goto(`/medico/pacientes/${pacienteId}/atencion/nueva`);
    await expect(page).toHaveURL(area, { timeout: 30_000 });
    await expect(page.getByLabel("Anamnesis")).toHaveCount(0);
    await contexto.close();
  }
});
