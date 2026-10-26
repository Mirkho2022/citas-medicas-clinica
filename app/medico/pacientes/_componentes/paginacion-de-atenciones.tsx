import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PaginaDeAtenciones } from "@/lib/historia/tipos";

// Paginación de las atenciones firmadas. Los enlaces NO se precargan (`prefetch={false}`): cada solicitud que devuelve contenido
// clínico deja su propio registro de acceso, y una precarga dejaría un rastro de una página que el médico nunca abrió.
export function PaginacionDeAtenciones({ pacienteId, paginas }: { pacienteId: string; paginas: PaginaDeAtenciones }) {
  const total = Math.max(1, Math.ceil(paginas.total / paginas.tamanoPagina));
  if (total <= 1) return null;
  const direccion = (pagina: number) => (pagina <= 1 ? `/medico/pacientes/${pacienteId}` : `/medico/pacientes/${pacienteId}?pagina=${pagina}`);
  return (
    <nav aria-label="Paginación de atenciones" className="flex flex-wrap items-center justify-between gap-3">
      {paginas.pagina > 1 ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={direccion(paginas.pagina - 1)} prefetch={false}>
            <ChevronLeft aria-hidden="true" />
            Más recientes
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <p className="text-body-sm text-muted-foreground tabular-nums">
        Página {Math.min(paginas.pagina, total)} de {total}
      </p>
      {paginas.pagina < total ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={direccion(paginas.pagina + 1)} prefetch={false}>
            Más antiguas
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
