import { expect, test } from "@playwright/test";

// Webhook de Clerk (H2, tarea 8.3): la firma se verifica ANTES de tocar la base. El camino con firma válida
// (idempotencia, cambio de rol, 5xx si falla la base) lo cubre tests/integracion/sincronizar-perfil.test.ts con
// el SQL real; aquí solo lo que no depende de qué base consulta el entorno bajo prueba.

test("un webhook con firma inválida se rechaza con 400", async ({ request }) => {
  const cuerpo = JSON.stringify({
    type: "user.updated",
    object: "event",
    data: { object: "user", id: "user_firma_invalida", public_metadata: { rol: "administrativo" } },
  });
  const respuesta = await request.post("/api/webhooks/clerk", {
    data: cuerpo,
    headers: {
      "content-type": "application/json",
      "svix-id": "msg_prueba",
      "svix-timestamp": Math.floor(Date.now() / 1000).toString(),
      "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    },
  });
  expect(respuesta.status()).toBe(400);
});

test("un webhook sin cabeceras de firma se rechaza con 400", async ({ request }) => {
  const respuesta = await request.post("/api/webhooks/clerk", {
    data: JSON.stringify({ type: "user.created", data: { id: "user_sin_firma" } }),
    headers: { "content-type": "application/json" },
  });
  expect(respuesta.status()).toBe(400);
});
