export {};

declare global {
  interface CustomJwtSessionClaims {
    publicMetadata?: {
      rol?: "administrativo" | "medico" | "enfermera" | "paciente";
    };
  }
}
