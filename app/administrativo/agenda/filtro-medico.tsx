"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import type { MedicoListado } from "@/lib/citas/consultas";

// Selector de médico de la consola. Cambia la URL (`?medico=`) conservando el resto de parámetros (`parametros`: la fecha, el
// paciente…) y la página se vuelve a leer en el servidor. En la agenda ofrece «Todos los médicos»; al agendar el médico es
// obligatorio (`todos={false}`). Es un <select> nativo: accesible por defecto y cómodo en móvil.
export function FiltroMedico({
  medicos,
  medicoId,
  ruta,
  parametros = {},
  todos = true,
  etiqueta = "Médico",
}: {
  medicos: MedicoListado[];
  medicoId: string | null;
  ruta: string;
  parametros?: Record<string, string | undefined>;
  todos?: boolean;
  etiqueta?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="filtro-medico" className="sr-only">
        {etiqueta}
      </Label>
      <select
        id="filtro-medico"
        value={medicoId ?? ""}
        onChange={(e) => {
          const consulta = new URLSearchParams();
          for (const [clave, valor] of Object.entries(parametros)) if (valor) consulta.set(clave, valor);
          if (e.target.value) consulta.set("medico", e.target.value);
          router.push(`${ruta}?${consulta.toString()}`);
        }}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-body-sm text-foreground sm:w-[16.25rem]"
      >
        {todos ? <option value="">Todos los médicos</option> : <option value="">Elija un médico</option>}
        {medicos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre} · {m.especialidad}
          </option>
        ))}
      </select>
    </div>
  );
}
