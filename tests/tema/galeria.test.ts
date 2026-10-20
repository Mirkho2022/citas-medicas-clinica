// Regla que decide si la galería /guia-de-estilo se muestra (H2b, tarea 3.2). Ejecutar con: npm run test:tema
import assert from "node:assert/strict";
import { test } from "node:test";
import { galeriaVisible } from "../../lib/ui/galeria.ts";

test("en producción la galería no se muestra", () => {
  assert.equal(galeriaVisible({ VERCEL_ENV: "production" }), false);
});

test("en preview y en desarrollo la galería se muestra", () => {
  assert.equal(galeriaVisible({ VERCEL_ENV: "preview" }), true);
  assert.equal(galeriaVisible({ VERCEL_ENV: "development" }), true);
});

test("sin VERCEL_ENV (next start local, las E2E) la galería se muestra", () => {
  assert.equal(galeriaVisible({}), true);
});
