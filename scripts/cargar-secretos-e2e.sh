#!/usr/bin/env bash
# Carga en GitHub (Actions) los secretos y la variable que necesita el workflow e2e.yml,
# leyendo los valores de .env.local. Imprime solo los nombres, nunca los valores.
#
# Uso:  bash scripts/cargar-secretos-e2e.sh
# Requisitos: `gh` autenticado con permiso sobre el repo, y .env.local con los valores
# (incluida VERCEL_AUTOMATION_BYPASS_SECRET: Vercel > Settings > Deployment Protection >
# Protection Bypass for Automation).
set -euo pipefail

REPO="${REPO:-Mirkho2022/citas-medicas-clinica}"
ENV_FILE="${ENV_FILE:-.env.local}"

valor() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"\r'
}

SECRETOS=(
  CLERK_SECRET_KEY
  VERCEL_AUTOMATION_BYPASS_SECRET
  E2E_PACIENTE_EMAIL
  E2E_PACIENTE_PASSWORD
  E2E_ADMINISTRATIVO_EMAIL
  E2E_ADMINISTRATIVO_PASSWORD
  E2E_ADMINISTRATIVO_TOTP_SECRET
)

for nombre in "${SECRETOS[@]}"; do
  v="$(valor "$nombre" || true)"
  if [ -z "$v" ]; then
    echo "OMITIDO  $nombre (no está en $ENV_FILE)"
    continue
  fi
  printf '%s' "$v" | gh secret set "$nombre" --repo "$REPO" > /dev/null
  echo "secreto  $nombre"
done

# La clave publicable de Clerk es pública: va como variable, no como secreto.
v="$(valor NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || true)"
if [ -n "$v" ]; then
  gh variable set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --repo "$REPO" --body "$v" > /dev/null
  echo "variable NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
fi
