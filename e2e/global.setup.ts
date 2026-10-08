import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Pide un testing token a Clerk (instancia de desarrollo) para que las pruebas
// pasen la detección de bots sin desactivar la protección.
setup("configurar Clerk testing", async () => {
  await clerkSetup({
    publishableKey:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
      process.env.CLERK_PUBLISHABLE_KEY,
  });
});
