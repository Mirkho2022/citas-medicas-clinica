// Validación en el servidor de lo que llega por la dirección (la ruta y la búsqueda). Nada de esto es autoridad: la autoridad
// sobre qué filas existen es la RLS. Es una barrera de forma para que un texto cualquiera nunca llegue como `uuid` a la base de
// datos y para que una entrada inválida responda igual que un paciente que no existe.
import { z } from "zod";

export const TAMANO_PAGINA_ATENCIONES = 10;
export const MAXIMO_PAGINA = 1000;

const uuid = z.string().uuid();

// Devuelve el `uuid` en minúsculas o `null` si el texto no lo es.
export function identificadorValido(valor: unknown): string | null {
  const analizado = uuid.safeParse(valor);
  return analizado.success ? analizado.data.toLowerCase() : null;
}

// Número de página de las atenciones (`?pagina=`). Un valor ausente, no numérico, menor que 1 o absurdo cae en la página 1.
export function paginaDe(valor: unknown): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof texto !== "string" || !/^\d{1,4}$/.test(texto)) return 1;
  const pagina = Number(texto);
  return pagina >= 1 && pagina <= MAXIMO_PAGINA ? pagina : 1;
}

// Texto de la búsqueda (`?q=`): el primero si viene repetido, vacío si no es texto.
export function busquedaDe(valor: unknown): string {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return typeof texto === "string" ? texto.trim() : "";
}
