// La galería de componentes (/guia-de-estilo) existe en desarrollo y en los previews de Vercel, nunca en producción.
// En local con `next start` no hay VERCEL_ENV y la galería se muestra: es lo que necesitan las pruebas E2E.
export function galeriaVisible(env: Record<string, string | undefined>): boolean {
  return env.VERCEL_ENV !== "production";
}
