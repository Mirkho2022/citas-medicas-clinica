import { expect, test } from "@playwright/test";
import { prepararPagina } from "./helpers";

// H2b, tarea 2.2: la interfaz siempre se muestra en tema claro, aunque el sistema operativo prefiera el oscuro.
test.use({ colorScheme: "dark" });

test("con preferencia de modo oscuro, la portada usa el fondo canvas y el texto ink", async ({
  page,
}) => {
  await prepararPagina(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toBeVisible();

  const colores = await page.evaluate(() => {
    const estilo = getComputedStyle(document.body);
    return {
      fondo: estilo.backgroundColor,
      texto: estilo.color,
      esquema: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  expect(colores.fondo).toBe("rgb(244, 247, 247)"); // canvas #F4F7F7
  expect(colores.texto).toBe("rgb(20, 38, 43)"); // ink #14262B
  expect(colores.esquema).toBe("light");
});

// Las fuentes del sistema (DESIGN.md): títulos en Plus Jakarta Sans y cuerpo en Inter. Una variable de next/font mal
// colocada no rompe el build ni los colores, pero deja todo en la fuente serif por defecto: se comprueba aparte.
test("la portada usa Plus Jakarta Sans en los títulos e Inter en el cuerpo", async ({ page }) => {
  await prepararPagina(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fuentes = await page.evaluate(() => ({
    cuerpo: getComputedStyle(document.body).fontFamily,
    titulo: getComputedStyle(document.querySelector("h1")!).fontFamily,
  }));
  expect(fuentes.cuerpo).toMatch(/Inter/);
  expect(fuentes.titulo).toMatch(/Jakarta/);
});
