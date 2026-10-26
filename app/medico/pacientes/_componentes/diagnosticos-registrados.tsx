import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DiagnosticoRegistrado } from "@/lib/historia/tipos";
import { fechaLima } from "@/lib/ui/formato";

// «Diagnósticos registrados» (design.md D12): los de las atenciones firmadas, del más reciente al más antiguo y cada código una
// vez. Se llaman «registrados», no «activos»: la historia no guarda un estado de resuelto o activo para un diagnóstico.
export function DiagnosticosRegistrados({ diagnosticos }: { diagnosticos: DiagnosticoRegistrado[] }) {
  return (
    <Card size="sm" data-slot="diagnosticos-registrados">
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-title-md text-ink">Diagnósticos registrados</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {diagnosticos.length === 0 ? (
          <p className="text-body-md text-muted-foreground">Aún no hay diagnósticos en atenciones firmadas.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-body-md">
            {diagnosticos.map((d) => (
              <li key={d.cie10} className="break-words">
                <span className="tabular-nums font-semibold">{d.cie10}</span> · {d.descripcion || "Sin descripción"}
                <span className="block text-body-sm text-muted-foreground tabular-nums">
                  {d.tipo ? `${d.tipo.charAt(0).toUpperCase()}${d.tipo.slice(1)} · ` : ""}
                  firmado el {fechaLima(d.firmadoEn)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
