import { expect, test, type Page } from "@playwright/test";
import {
  asegurarPerfilCuenta2,
  correoPaciente2,
  dejarCuenta2SinFicha,
  DOCUMENTO_FICHA_DE_LA_CLINICA,
  DOCUMENTO_FICHA_DE_OTRA_CUENTA,
  DOCUMENTO_NUEVO,
  fichaDeLaCuenta2,
  fichasDelDocumento,
  hayBaseDeDatos,
  hoyEnLima,
  instanteDeLima,
  NACIMIENTO_PACIENTE2,
  NOMBRE_MEDICO_E2E,
  prepararEscenario,
  restaurarPaciente2,
  retirarEscenario,
  sembrarCita,
  sembrarFichaDeOtraCuenta,
  sembrarFichaSinCuenta,
  sumarDiasA,
  type EscenarioPortal,
} from "./datos-portal";
import { iniciarSesion, prepararPagina, variable } from "./helpers";

// Registro del paciente (H4, tarea 5.6; specs/registro-del-paciente): la espera de la cuenta en preparación, el formulario y sus validaciones,
// el alta con un documento nuevo, la vinculación de una ficha que la clínica ya tenía, los rechazos (siempre el mismo mensaje), la cuenta
// que ya tiene ficha y que ninguna dirección visitada lleva documento, correo ni nombres.
//
// Se reutiliza la cuenta del segundo paciente (no se crean cuentas nuevas de Clerk: cada alta dispararía el webhook de la instancia compartida,
// también la de producción); lo que cambia entre pruebas es el estado de la base: ver e2e/datos-portal.ts. Sin `E2E_DATABASE_URL` (ni
// `DATABASE_URL_UNPOOLED` en .env.local) o sin la segunda cuenta se omiten con un aviso.
test.describe.configure({ mode: "serial" });

const faltaAlgo = !hayBaseDeDatos() || !process.env.E2E_PACIENTE2_EMAIL || !process.env.E2E_PACIENTE2_PASSWORD;
test.skip(
  faltaAlgo,
  "Necesitan E2E_DATABASE_URL (o DATABASE_URL_UNPOOLED) y E2E_PACIENTE2_EMAIL/E2E_PACIENTE2_PASSWORD: ver docs/07-testing/pruebas-e2e.md",
);

const MENSAJE_RECHAZO =
  "No pudimos completar su registro con estos datos. Si ya se atendió en la clínica, comuníquese con ella para que revisen su ficha.";

let escenario: EscenarioPortal;

test.beforeAll(async () => {
  escenario = await prepararEscenario();
});

test.beforeEach(async () => {
  await dejarCuenta2SinFicha();
});

test.afterAll(async () => {
  await restaurarPaciente2();
  await retirarEscenario();
});

// Inicia sesión como el segundo paciente y recuerda toda dirección que visita el navegador (página, peticiones y redirecciones).
async function entrar(page: Page): Promise<string[]> {
  const direcciones: string[] = [];
  page.on("request", (r) => direcciones.push(r.url()));
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_PACIENTE2_EMAIL"), variable("E2E_PACIENTE2_PASSWORD"));
  return direcciones;
}

const titulo = (page: Page) => page.getByRole("heading", { name: "Complete su registro", level: 1 });
const documento = (page: Page) => page.getByLabel("Número de documento");

async function irAlFormulario(page: Page): Promise<string[]> {
  const direcciones = await entrar(page);
  await page.goto("/completar-registro");
  await expect(titulo(page)).toBeVisible();
  await expect(documento(page)).toBeVisible({ timeout: 30_000 });
  return direcciones;
}

async function llenar(page: Page, datos: { documento: string; nacimiento?: string; sexo?: string }): Promise<void> {
  await documento(page).fill(datos.documento);
  await page.getByLabel(/Fecha de nacimiento/).fill(datos.nacimiento ?? NACIMIENTO_PACIENTE2);
  await page.getByText(datos.sexo ?? "Masculino", { exact: true }).click();
}

const continuar = (page: Page) => page.getByRole("button", { name: "Continuar" });

function sinDatosPersonalesEn(direcciones: string[]): void {
  const prohibidos = [DOCUMENTO_NUEVO, DOCUMENTO_FICHA_DE_LA_CLINICA, correoPaciente2(), encodeURIComponent(correoPaciente2()), "Segundo", "Paciente%20de%20prueba"];
  for (const direccion of direcciones) {
    for (const dato of prohibidos) {
      expect(direccion, `la dirección ${direccion.slice(0, 80)} no debe llevar «${dato}»`).not.toContain(dato);
    }
  }
}

test("una cuenta en preparación ve la espera y, al estar lista, aparece el formulario sin recargar", async ({ page }) => {
  await dejarCuenta2SinFicha({ sinPerfil: true });
  await entrar(page);
  await page.goto("/completar-registro");

  await expect(titulo(page)).toBeVisible();
  await expect(page.getByText("Estamos preparando su cuenta…")).toBeVisible();
  await expect(documento(page)).toHaveCount(0);
  // Nunca se ve la portada de visitantes.
  await expect(page.getByRole("link", { name: "Registrarme" })).toHaveCount(0);

  // Lo que hace el webhook de Clerk: crea el perfil. La pantalla continúa sola.
  await asegurarPerfilCuenta2();
  await expect(documento(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Estamos preparando su cuenta…")).toHaveCount(0);
});

test("una cuenta sin ficha que abre «Mis citas» o «Reservar» es llevada a «Complete su registro»", async ({ page }) => {
  await entrar(page);
  for (const ruta of ["/paciente", "/paciente/citas", "/paciente/citas/nueva"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/completar-registro$/, { timeout: 30_000 });
    await expect(titulo(page)).toBeVisible();
  }
});

test("el formulario muestra el correo de la cuenta de solo lectura y los nombres prellenados", async ({ page }) => {
  await irAlFormulario(page);
  const correo = page.getByLabel("Correo electrónico");
  await expect(correo).toHaveValue(correoPaciente2());
  await expect(correo).toHaveAttribute("readonly", "");
  await expect(page.getByText("Solo lectura")).toBeVisible();
  await expect(page.getByLabel(/Nombres/)).toHaveValue("Segundo");
  await expect(page.getByLabel(/Apellidos/)).toHaveValue("Paciente de prueba");
  // No hay forma de escribir otro correo.
  await expect(page.locator('input[type="email"]:not([readonly])')).toHaveCount(0);
});

test("las validaciones del documento y de los campos obligatorios se muestran por campo, con el foco en el primero", async ({ page }) => {
  await irAlFormulario(page);

  // Campos obligatorios vacíos: cada uno muestra su error y el primero recibe el foco.
  await page.getByLabel(/Nombres/).fill("   ");
  await continuar(page).click();
  await expect(page.getByText("El DNI debe tener 8 dígitos")).toBeVisible();
  await expect(documento(page)).toBeFocused();
  expect(await page.locator('[role="alert"]:has(svg)').count()).toBeGreaterThanOrEqual(2);

  // DNI de siete dígitos.
  await documento(page).fill("7234567");
  await continuar(page).click();
  await expect(page.getByText("El DNI debe tener 8 dígitos")).toBeVisible();

  // Carné de Extranjería fuera de formato: el mensaje explica el formato.
  await page.getByLabel("Tipo de documento").selectOption("CE");
  await expect(page.getByText("De 9 a 12 letras o números, sin espacios.")).toBeVisible();
  await documento(page).fill("CE1234");
  await continuar(page).click();
  await expect(page.getByText("El Carné de Extranjería debe tener entre 9 y 12 caracteres, solo letras y números")).toBeVisible();

  // Nada se guardó.
  expect(await fichaDeLaCuenta2()).toBeNull();
});

test("una fecha de nacimiento futura se rechaza y no se guarda nada", async ({ page }) => {
  await irAlFormulario(page);
  await page.getByLabel(/Nombres/).fill("Segundo");
  await llenar(page, { documento: DOCUMENTO_NUEVO, nacimiento: sumarDiasA(hoyEnLima(), 30) });
  await continuar(page).click();
  await expect(page.getByText(/fecha de nacimiento/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/completar-registro$/);
  expect(await fichaDeLaCuenta2()).toBeNull();
});

test("un documento nuevo crea la ficha vinculada a la cuenta y lleva a «Inicio»", async ({ page }) => {
  const direcciones = await irAlFormulario(page);
  await llenar(page, { documento: DOCUMENTO_NUEVO });
  await page.getByLabel(/Teléfono/).fill("+51 987 654 321");
  await continuar(page).click();

  await expect(page).toHaveURL(/\/paciente$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();

  const ficha = await fichaDeLaCuenta2();
  expect(ficha).toMatchObject({ numero_documento: DOCUMENTO_NUEVO, email: correoPaciente2() });
  expect(await fichasDelDocumento(DOCUMENTO_NUEVO)).toHaveLength(1);
  sinDatosPersonalesEn(direcciones);

  // Una vez vinculada, «Complete su registro» no se vuelve a pedir.
  await page.goto("/completar-registro");
  await expect(page).toHaveURL(/\/paciente$/, { timeout: 30_000 });
});

test("una ficha de la clínica con el mismo correo y fecha de nacimiento se vincula sin crear otra y sus citas aparecen en «Mis citas»", async ({ page }) => {
  const fichaId = await sembrarFichaSinCuenta({
    documento: DOCUMENTO_FICHA_DE_LA_CLINICA,
    correo: correoPaciente2(),
    nacimiento: NACIMIENTO_PACIENTE2,
    nombres: "Nombre de la clínica",
  });
  await sembrarCita(escenario, fichaId, instanteDeLima(sumarDiasA(hoyEnLima(), 14), "15:00"));

  const direcciones = await irAlFormulario(page);
  // Lo escrito en el formulario NO sobrescribe los datos de la ficha existente.
  await page.getByLabel(/Nombres/).fill("Otro nombre escrito");
  await llenar(page, { documento: DOCUMENTO_FICHA_DE_LA_CLINICA });
  await continuar(page).click();

  await expect(page).toHaveURL(/\/paciente$/, { timeout: 30_000 });
  const fichas = await fichasDelDocumento(DOCUMENTO_FICHA_DE_LA_CLINICA);
  expect(fichas).toHaveLength(1);
  expect(fichas[0]).toMatchObject({ id: fichaId, nombres: "Nombre de la clínica" });
  expect(fichas[0]!.perfil_id).not.toBeNull();

  await page.goto("/paciente/citas");
  await expect(page.getByRole("region", { name: "Próximas" })).toContainText(NOMBRE_MEDICO_E2E);
  sinDatosPersonalesEn(direcciones);
});

test("los rechazos de vinculación dan siempre el mismo mensaje y no vinculan nada", async ({ page }) => {
  const casos: Array<{ nombre: string; preparar: () => Promise<void>; nacimiento?: string; documento: string }> = [
    {
      nombre: "fecha de nacimiento distinta",
      documento: DOCUMENTO_FICHA_DE_LA_CLINICA,
      nacimiento: "1990-01-01",
      preparar: async () => {
        await sembrarFichaSinCuenta({ documento: DOCUMENTO_FICHA_DE_LA_CLINICA, correo: correoPaciente2(), nacimiento: NACIMIENTO_PACIENTE2 });
      },
    },
    {
      nombre: "correo distinto",
      documento: DOCUMENTO_FICHA_DE_LA_CLINICA,
      preparar: async () => {
        await sembrarFichaSinCuenta({ documento: DOCUMENTO_FICHA_DE_LA_CLINICA, correo: "otro-correo@demo.invalid", nacimiento: NACIMIENTO_PACIENTE2 });
      },
    },
    {
      nombre: "ficha de otra cuenta",
      documento: DOCUMENTO_FICHA_DE_OTRA_CUENTA,
      preparar: () => sembrarFichaDeOtraCuenta(DOCUMENTO_FICHA_DE_OTRA_CUENTA),
    },
  ];

  await entrar(page);
  for (const caso of casos) {
    await dejarCuenta2SinFicha();
    await caso.preparar();
    await page.goto("/completar-registro");
    await expect(documento(page)).toBeVisible({ timeout: 30_000 });
    await llenar(page, { documento: caso.documento, nacimiento: caso.nacimiento });
    await continuar(page).click();

    await expect(page.getByText(MENSAJE_RECHAZO), caso.nombre).toBeVisible();
    await expect(page, caso.nombre).toHaveURL(/\/completar-registro$/);
    expect(await fichaDeLaCuenta2(), `${caso.nombre}: no se vincula nada`).toBeNull();
    // El mensaje no revela si el documento existe ni qué dato no coincidió.
    await expect(page.locator("main")).not.toContainText(/fecha de nacimiento no|correo no|ya tiene cuenta|ya existe/i);
  }
});

test("una cuenta que ya tiene ficha no vuelve a ver el formulario", async ({ page }) => {
  await restaurarPaciente2();
  await entrar(page);
  await page.goto("/completar-registro");
  await expect(page).toHaveURL(/\/paciente$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();
});
