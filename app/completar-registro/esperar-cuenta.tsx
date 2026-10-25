"use client";

import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";
import { MENSAJE_CUENTA_TARDA, MENSAJE_PREPARANDO_CUENTA } from "@/lib/portal/mensajes";

// Espera de la cuenta recién creada (specs/registro-del-paciente, «La cuenta nueva se prepara sin dejar al paciente perdido»; design.md,
// D2). El rol lo asigna un webhook de Clerk unos instantes después del alta, y Neon decide con el JWT: hasta que el token lleve el rol,
// la base de datos lo niega todo. Por eso se pide un token NUEVO (`skipCache`) y se pide al servidor que vuelva a decidir qué mostrar
// (`router.refresh()`), cada 2 s durante 30 s. Pasado ese tiempo se ofrece «Reintentar»; nunca se redirige a la portada.
const CADA_MS = 2000;
const MAXIMO_MS = 30_000;

export function EsperarCuenta() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [agotado, setAgotado] = useState(false);
  const [intento, setIntento] = useState(0);
  const inicio = useRef(Date.now());

  useEffect(() => {
    inicio.current = Date.now();
    let activo = true;

    async function refrescar() {
      if (!activo) return;
      if (Date.now() - inicio.current >= MAXIMO_MS) {
        clearInterval(temporizador);
        setAgotado(true);
        return;
      }
      try {
        await getToken({ skipCache: true });
      } catch {
        // Un fallo de red no corta la espera: el siguiente intento lo reintenta.
      }
      if (activo) router.refresh();
    }

    const temporizador = setInterval(() => void refrescar(), CADA_MS);
    void refrescar();
    return () => {
      activo = false;
      clearInterval(temporizador);
    };
  }, [getToken, router, intento]);

  const reintentar = useCallback(() => {
    setAgotado(false);
    setIntento((n) => n + 1);
  }, []);

  if (agotado) {
    return (
      <div className="flex flex-col gap-4">
        <Alerta tono="aviso" titulo="Su cuenta todavía no está lista">
          {MENSAJE_CUENTA_TARDA}
        </Alerta>
        <Button size="lg" onClick={reintentar} className="w-full">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-border bg-surface p-5">
      <Loader2 className="size-6 shrink-0 animate-spin text-primary" aria-hidden="true" />
      <p className="text-body-lg">{MENSAJE_PREPARANDO_CUENTA}</p>
    </div>
  );
}
