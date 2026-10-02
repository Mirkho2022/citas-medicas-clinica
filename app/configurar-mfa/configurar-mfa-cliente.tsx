"use client";

import { UserProfile } from "@clerk/nextjs";

export function ConfigurarMfaCliente() {
  return <UserProfile routing="hash" />;
}
