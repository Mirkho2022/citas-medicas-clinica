// Búsqueda dentro de «Mis pacientes» (specs/acceso-a-historia-clinica, «Lista de pacientes a cargo»): por apellidos, nombres o
// documento, sin distinguir mayúsculas ni tildes. El texto se normaliza aquí y la base normaliza la columna con la MISMA
// transformación (`translate(lower(...))` en el repositorio), de modo que «PEREZ» encuentra a «Pérez» y «peña» a «Peña».
//
// El texto del médico se parte en palabras y TODAS deben aparecer (en cualquier orden): «juan perez» y «perez juan» dan lo mismo.
// Cada palabra es un parámetro con sus comodines de `like` escapados: nunca se concatena al SQL.

export const MAXIMO_PALABRAS_BUSQUEDA = 5;
export const MAXIMO_LARGO_BUSQUEDA = 100;

// Pares tilde -> letra base. La misma lista, en el mismo orden, se pasa a `translate` en el SQL del repositorio.
export const ORIGEN_TILDES = "áéíóúüñ";
export const DESTINO_TILDES = "aeiouun";

export function normalizarTexto(texto: string): string {
  let resultado = "";
  for (const caracter of texto.toLowerCase()) {
    const posicion = ORIGEN_TILDES.indexOf(caracter);
    resultado += posicion >= 0 ? DESTINO_TILDES[posicion] : caracter;
  }
  return resultado;
}

// `like` da significado especial a `%`, `_` y `\`: se escapan para que el texto sea literal (la consulta declara `escape '\'`).
export function escaparComodines(texto: string): string {
  return texto.replace(/[\\%_]/g, "\\$&");
}

// Patrones `like` (`%palabra%`) de la búsqueda, ya normalizados y escapados. Vacío si no hay nada que buscar.
export function patronesDeBusqueda(busqueda: string | undefined): string[] {
  const texto = (busqueda ?? "").normalize("NFC").slice(0, MAXIMO_LARGO_BUSQUEDA);
  return normalizarTexto(texto)
    .split(/\s+/)
    .filter((palabra) => palabra.length > 0)
    .slice(0, MAXIMO_PALABRAS_BUSQUEDA)
    .map((palabra) => `%${escaparComodines(palabra)}%`);
}
