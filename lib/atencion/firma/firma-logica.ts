// Firma lógica (design.md, D5): sin servicio externo. El sello de la hora y la huella del contenido los fija la base de datos al
// ejecutar `public.firmar_atencion()` (disparador `atenciones_zz_sello`); aquí solo se declara el método. No afirma validez legal.
import type { ProveedorFirma } from "./proveedor.ts";

export const firmaLogica: ProveedorFirma = {
  metodo: "logica",
  async firmar() {
    return { metodo: "logica" };
  },
};
