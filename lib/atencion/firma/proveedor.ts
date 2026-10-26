// Interfaz del proveedor de firma (openspec/changes/historias-clinicas/design.md, D5; riesgo P-5). Aísla el acto de firmar de
// la atención y de su flujo: sustituir la firma lógica por una certificada no debe cambiar el formulario, las pantallas ni el
// modelo de la atención. Este archivo NO importa ninguna implementación.
//
// Hoy solo existe la firma LÓGICA (`firma-logica.ts`): el servidor sella la hora y la base guarda una huella del contenido. No se
// afirma que cumpla la normativa peruana mientras la decisión legal P-1 siga abierta.

export type MetodoFirma = "logica";

export interface SolicitudFirma {
  atencionId: string;
}

export interface ConstanciaDeFirma {
  metodo: MetodoFirma;
}

export interface ProveedorFirma {
  readonly metodo: MetodoFirma;
  // Prepara la firma (una firma certificada llamaría aquí a su servicio). Si lanza, la atención no se firma.
  firmar(solicitud: SolicitudFirma): Promise<ConstanciaDeFirma>;
}
