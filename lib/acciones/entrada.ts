// Entrada de una Server Action: un formulario HTML llega como `FormData` y una llamada programática como objeto. Se convierte
// el primero en un objeto plano de textos para validarlo con Zod; todo lo demás pasa tal cual y lo rechaza el esquema.
// Se descartan los archivos (ninguna acción de la consola los recibe) y los campos internos de Next (`$ACTION_…`).
export function entradaDeFormulario(entrada: unknown): unknown {
  if (typeof FormData === "undefined" || !(entrada instanceof FormData)) return entrada;
  const datos: Record<string, string> = {};
  for (const [clave, valor] of entrada.entries()) {
    if (clave.startsWith("$ACTION_") || typeof valor !== "string") continue;
    datos[clave] = valor;
  }
  return datos;
}
