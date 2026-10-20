"use client";

import { useRouter } from "next/navigation";
import { ElegirPaciente } from "../elegir-paciente";

// Paso 1 de agendar: el paciente elegido pasa a la URL (`?paciente=`) y la página se vuelve a leer en el servidor con el
// resto de parámetros (médico, fecha) intactos.
export function ElegirPacienteUrl({ ruta, parametros }: { ruta: string; parametros: Record<string, string | undefined> }) {
  const router = useRouter();
  return (
    <ElegirPaciente
      elegido={null}
      alElegir={(paciente) => {
        if (!paciente) return;
        const consulta = new URLSearchParams();
        for (const [clave, valor] of Object.entries(parametros)) if (valor) consulta.set(clave, valor);
        consulta.set("paciente", paciente.id);
        router.push(`${ruta}?${consulta.toString()}`);
      }}
    />
  );
}
