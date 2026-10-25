import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Alerta } from "@/components/clinica/alerta";
import { obtenerRolSesion, rutaParaRol } from "@/lib/auth/rol";
import { transaccionAutenticada } from "@/lib/db/cliente-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import { MENSAJE_SESION_NO_CONFIRMADA } from "@/lib/portal/mensajes";
import { EsperarCuenta } from "./esperar-cuenta";
import { FormularioRegistro } from "./formulario-registro";

// «Complete su registro» (specs/registro-del-paciente; design.md, D2). El servidor decide qué mostrar:
//  - otro rol (personal) → a su propia área;
//  - ficha ya vinculada → «Inicio» (no se vuelve a pedir nada);
//  - sin rol todavía, o con rol pero sin perfil sincronizado → la espera, que se resuelve sola;
//  - rol paciente, perfil y sin ficha → el formulario.
// Nunca redirige a la portada de visitantes.
interface Estado {
  perfil: string | null;
  paciente: string | null;
  correo: string | null;
  nombres: string | null;
  apellidos: string | null;
}

// Lo que la base de datos ve de esta sesión. Si la consulta falla (p. ej. el token aún no lleva el rol), se trata como «la cuenta
// todavía no está lista»: la espera vuelve a preguntar.
async function leerEstado(): Promise<Estado | null> {
  try {
    const [filas] = await transaccionAutenticada((tx) => [
      tx`select public.perfil_actual() as perfil,
                public.paciente_actual() as paciente,
                public.correo_actual() as correo,
                (select pf.nombres from public.perfiles pf where pf.id = public.perfil_actual()) as nombres,
                (select pf.apellidos from public.perfiles pf where pf.id = public.perfil_actual()) as apellidos`,
    ]);
    return (filas?.[0] as unknown as Estado | undefined) ?? null;
  } catch {
    return null;
  }
}

export default async function PaginaCompletarRegistro() {
  await auth.protect();
  const rol = await obtenerRolSesion();
  if (rol && rol !== "paciente") redirect(rutaParaRol(rol));

  const estado = rol === "paciente" ? await leerEstado() : null;
  if (estado?.paciente) redirect("/paciente");

  return (
    <>
      <h1 className="font-display text-headline-lg text-ink sm:text-display-lg" tabIndex={-1}>
        Complete su registro
      </h1>
      {!estado || !estado.perfil ? (
        <EsperarCuenta />
      ) : !estado.correo ? (
        <Alerta tono="error">{MENSAJE_SESION_NO_CONFIRMADA}</Alerta>
      ) : (
        <>
          <p>Necesitamos unos datos para reservar sus citas. Solo se los pedimos esta vez.</p>
          <FormularioRegistro
            correo={estado.correo}
            nombres={estado.nombres ?? ""}
            apellidos={estado.apellidos ?? ""}
            hoy={hoyLima()}
          />
        </>
      )}
    </>
  );
}
