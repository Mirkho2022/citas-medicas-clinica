// Reconocer una sesión vencida a mitad de una operación del portal (specs/busqueda-y-reserva-de-cita, «Una sesión vencida no hace perder
// la reserva»). `transaccionAutenticada` (lib/db/cliente-autenticado.ts) lanza `SesionRequerida` cuando Clerk ya no entrega un token.
// Se reconoce por el nombre y no con `instanceof` para que este módulo no importe el cliente de la base de datos (necesita Clerk): así
// la lógica del portal se prueba sin red, con un ejecutor inyectado.
export function esSesionVencida(error: unknown): boolean {
  return error instanceof Error && error.name === "SesionRequerida";
}
