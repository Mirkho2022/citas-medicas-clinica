// Pruebas de lib/auth/accion-paciente.ts (H4, tarea 3.3; design.md, D5). Ejecutar con: npm run test:portal
// Las guardas se prueban con dependencias inyectadas: sin Clerk, sin red y sin base de datos.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rol } from "../../lib/auth/rutas.ts";
import {
  exigirPaciente,
  exigirPacienteRegistrado,
  type DependenciasAccionPaciente,
  type DependenciasPaginaPaciente,
} from "../../lib/auth/accion-paciente.ts";
import { MENSAJE_ERROR_INTERNO, MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import { MENSAJE_SESION_VENCIDA } from "../../lib/portal/mensajes.ts";

function entornoAccion(opciones: { usuarioId?: string | null; rol: Rol | null; lanza?: boolean }) {
  const registrados: string[] = [];
  const dependencias: DependenciasAccionPaciente = {
    obtenerSesion: async () => {
      if (opciones.lanza) throw new TypeError("Clerk caído: detalle que no debe salir");
      return { usuarioId: opciones.usuarioId === undefined ? "user_1" : opciones.usuarioId, rol: opciones.rol };
    },
    registrar: (clase) => void registrados.push(clase),
  };
  return { dependencias, registrados };
}

test("un paciente con sesión pasa y la identidad sale de la sesión", async () => {
  const { dependencias } = entornoAccion({ usuarioId: "user_paciente_7", rol: "paciente" });
  const r = await exigirPaciente(dependencias);
  assert.deepEqual(r, { ok: true, datos: { usuarioId: "user_paciente_7" } });
});

test("la guarda no recibe ningún identificador de paciente, de perfil ni de rol", () => {
  // Solo acepta las dependencias (el entorno): no hay forma de pasarle una identidad desde la acción.
  assert.equal(exigirPaciente.length, 0, "los parámetros de exigirPaciente son opcionales");
});

test("sin sesión se rechaza como sesión vencida", async () => {
  for (const usuarioId of [null, ""]) {
    const { dependencias } = entornoAccion({ usuarioId, rol: "paciente" });
    const r = await exigirPaciente(dependencias);
    assert.deepEqual(r, { ok: false, codigo: "SESION_VENCIDA", mensaje: MENSAJE_SESION_VENCIDA });
  }
});

test("personal y sesión sin rol no pasan en una acción del paciente", async () => {
  for (const rol of ["administrativo", "medico", "enfermera", null] as const) {
    const { dependencias } = entornoAccion({ rol });
    const r = await exigirPaciente(dependencias);
    assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO }, String(rol));
  }
});

test("si Clerk falla, la acción se rechaza con el mensaje genérico y no filtra el detalle", async () => {
  const { dependencias, registrados } = entornoAccion({ rol: "paciente", lanza: true });
  const r = await exigirPaciente(dependencias);
  assert.deepEqual(r, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
  assert.deepEqual(registrados, ["TypeError"], "se registra la clase del error, nunca su texto");
  assert.ok(!JSON.stringify(r).includes("detalle"));
});

// ---- Guarda de páginas ----
class Redireccion extends Error {
  ruta: string;
  constructor(ruta: string) {
    super(`redirige a ${ruta}`);
    this.ruta = ruta;
  }
}

function entornoPagina(opciones: { rol: Rol | null; paciente: string | null }) {
  const llamadas = { paciente: 0 };
  const dependencias: DependenciasPaginaPaciente = {
    obtenerRol: async () => opciones.rol,
    obtenerPacienteActual: async () => {
      llamadas.paciente++;
      return opciones.paciente;
    },
    redirigir: async (ruta) => {
      throw new Redireccion(ruta);
    },
  };
  return { dependencias, llamadas };
}

const redirigeA = (ruta: string) => (e: unknown) => e instanceof Redireccion && e.ruta === ruta;

test("un paciente con ficha entra y recibe el id de su ficha", async () => {
  const { dependencias } = entornoPagina({ rol: "paciente", paciente: "paciente-uuid-1" });
  assert.deepEqual(await exigirPacienteRegistrado(dependencias), { pacienteId: "paciente-uuid-1" });
});

test("un paciente sin ficha va a «Complete su registro»", async () => {
  const { dependencias } = entornoPagina({ rol: "paciente", paciente: null });
  await assert.rejects(exigirPacienteRegistrado(dependencias), redirigeA("/completar-registro"));
});

test("una cuenta sin rol todavía (en preparación) va a «Complete su registro», que sabe esperar, y no consulta la base", async () => {
  const { dependencias, llamadas } = entornoPagina({ rol: null, paciente: null });
  await assert.rejects(exigirPacienteRegistrado(dependencias), redirigeA("/completar-registro"));
  assert.equal(llamadas.paciente, 0);
});

test("el personal va a su propia área y no consulta la base", async () => {
  const destinos = { administrativo: "/administrativo", medico: "/medico", enfermera: "/enfermera" } as const;
  for (const [rol, ruta] of Object.entries(destinos)) {
    const { dependencias, llamadas } = entornoPagina({ rol: rol as Rol, paciente: "x" });
    await assert.rejects(exigirPacienteRegistrado(dependencias), redirigeA(ruta), rol);
    assert.equal(llamadas.paciente, 0, `${rol}: no se consulta la ficha`);
  }
});
