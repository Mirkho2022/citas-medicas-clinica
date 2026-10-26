// Repositorio y casos de uso de la atención con un ejecutor simulado (sin Clerk, sin red, sin base de datos): una entrada inválida
// no llega a la base, «guardar y firmar» va en UNA sola llamada (una transacción), una clave ajena se rechaza y ningún error crudo
// escapa. El comportamiento contra la base real lo prueban los pgTAP 90 a 94.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallo, exito, type ResultadoAccion } from "../../lib/acciones/resultado.ts";
import type { SesionPersonal } from "../../lib/auth/accion-personal.ts";
import {
  casoActualizarBorrador,
  casoAgregarAddenda,
  casoFirmarAtencion,
  casoRegistrarAtencion,
  type EntornoAtencion,
} from "../../lib/atencion/casos-de-uso.ts";
import { firmaLogica } from "../../lib/atencion/firma/firma-logica.ts";
import type { ProveedorFirma } from "../../lib/atencion/firma/proveedor.ts";
import { MENSAJE_ATENCION_FIRMADA, MENSAJE_ES_BORRADOR, MENSAJE_NO_ES_AUTOR, MENSAJE_SIN_ACCESO } from "../../lib/atencion/errores.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";

const PACIENTE = "11111111-1111-4111-8111-111111111111";
const ATENCION = "22222222-2222-4222-8222-222222222222";
const NUEVO_ID = "33333333-3333-4333-8333-333333333333";

const contenido = {
  motivo_consulta: "Dolor de cabeza",
  anamnesis: "Tres días de evolución.",
  examen_fisico: "Sin hallazgos.",
  diagnosticos: [{ cie10: "R51", tipo: "definitivo" }],
  plan_tratamiento: "Analgésico.",
};

interface Simulacion {
  llamadas: Sentencia[][];
  refrescos: (readonly string[])[];
  entorno: EntornoAtencion;
}

function simular(
  respuesta: (sentencias: readonly Sentencia[]) => Fila[][] | Error,
  opciones: { guarda?: ResultadoAccion<SesionPersonal>; proveedor?: ProveedorFirma } = {},
): Simulacion {
  const llamadas: Sentencia[][] = [];
  const refrescos: (readonly string[])[] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    const r = respuesta(sentencias);
    if (r instanceof Error) throw r;
    return r;
  };
  return {
    llamadas,
    refrescos,
    entorno: {
      guarda: async () => opciones.guarda ?? exito({ usuarioId: "user_x", rol: "medico" as const }),
      ejecutar,
      proveedorFirma: opciones.proveedor ?? firmaLogica,
      refrescar: (rutas) => refrescos.push(rutas),
      generarId: () => NUEVO_ID,
    },
  };
}

const errorSql = (code: string, message = "texto interno") => Object.assign(new Error(message), { code });

describe("registrarAtencion", () => {
  it("guarda como borrador con una sola sentencia y devuelve el id generado por el servidor", async () => {
    const s = simular(() => [[{ id: NUEVO_ID }]]);
    const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido });
    assert.deepEqual(r, { ok: true, datos: { id: NUEVO_ID, firmadaEn: null } });
    assert.equal(s.llamadas.length, 1);
    assert.equal(s.llamadas[0]?.length, 1);
    assert.deepEqual(s.refrescos.length, 1);
  });

  it("la identidad, la historia y la hora no vienen del cliente: se toman de la sesión, de la RLS y del servidor", async () => {
    const s = simular(() => [[{ id: NUEVO_ID }]]);
    await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido });
    const sql = s.llamadas[0]![0]!.texto;
    assert.match(sql, /public\.medico_actual\(\)/);
    assert.match(sql, /from public\.historias_clinicas h/);
    assert.doesNotMatch(sql, /firmada_en|creado_en|firma_/);
    // Los parámetros no incluyen ningún identificador de médico: solo id nuevo, paciente, cita, textos y diagnósticos.
    const parametros = s.llamadas[0]![0]!.parametros!;
    assert.equal(parametros.length, 8);
    assert.equal(parametros[0], NUEVO_ID);
    assert.equal(parametros[1], PACIENTE);
    assert.equal(parametros[2], null);
    assert.equal(parametros[6], JSON.stringify([{ cie10: "R51", tipo: "definitivo" }]));
  });

  it("una entrada inválida no llega a la base de datos y devuelve el error por campo", async () => {
    const s = simular(() => [[{ id: NUEVO_ID }]]);
    const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido, anamnesis: " \u200B\n" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.codigo, "DATOS_INVALIDOS");
      assert.equal(r.campos?.anamnesis, "La anamnesis es obligatoria");
    }
    assert.equal(s.llamadas.length, 0);
    assert.equal(s.refrescos.length, 0);
  });

  it("una clave ajena (médico, historia, fecha) se rechaza sin tocar la base", async () => {
    const s = simular(() => [[{ id: NUEVO_ID }]]);
    for (const ajena of [{ medico_id: PACIENTE }, { historia_id: ATENCION }, { firmada_en: "2020-01-01T00:00:00Z" }, { nombres: "X" }]) {
      const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido, ...ajena });
      assert.equal(r.ok, false, JSON.stringify(ajena));
    }
    assert.equal(s.llamadas.length, 0);
  });

  it("paciente sin acceso: cero filas insertadas → «sin acceso», sin confirmar si existe", async () => {
    const s = simular(() => [[]]);
    const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.mensaje, MENSAJE_SIN_ACCESO);
      assert.equal(r.codigo, "NO_AUTORIZADO");
    }
    assert.equal(s.refrescos.length, 0);
  });

  it("guardar y firmar: insertar y firmar van en UNA llamada (una transacción) y el segundo paso es firmar_atencion", async () => {
    const hora = "2026-10-25T15:00:00.000Z";
    const s = simular(() => [[{ id: NUEVO_ID }], [{ firmada_en: hora }]]);
    const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido, firmar: true });
    assert.deepEqual(r, { ok: true, datos: { id: NUEVO_ID, firmadaEn: hora } });
    assert.equal(s.llamadas.length, 1, "una sola llamada = una sola transacción");
    assert.equal(s.llamadas[0]?.length, 2);
    assert.match(s.llamadas[0]![1]!.texto, /public\.firmar_atencion\(\$1::uuid\)/);
    assert.deepEqual(s.llamadas[0]![1]!.parametros, [NUEVO_ID]);
  });

  it("si firmar falla, el error es de toda la transacción y no queda atención (el ejecutor la revierte)", async () => {
    const s = simular(() => errorSql("42501", "No tiene acceso a esta atención"));
    const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido, firmar: true });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.mensaje, MENSAJE_SIN_ACCESO);
    assert.equal(s.llamadas.length, 1);
    assert.equal(s.refrescos.length, 0);
  });

  it("traduce los errores de la base y nunca deja escapar el texto crudo", async () => {
    for (const [code, esperado] of [
      ["HC001", "Revise los diagnósticos"],
      ["HC003", "La cita indicada no corresponde"],
      ["23505", "Ya existe una atención registrada para esa cita."],
      ["23514", "Hay campos vacíos o inválidos"],
      ["XX000", "No se pudo completar la operación"],
    ] as const) {
      const s = simular(() => errorSql(code, "secreto: Juan Pérez, anamnesis"));
      const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido });
      assert.equal(r.ok, false, code);
      if (!r.ok) {
        assert.ok(r.mensaje.startsWith(esperado), `${code}: ${r.mensaje}`);
        assert.ok(!JSON.stringify(r).includes("Juan"), code);
      }
    }
  });

  it("un proveedor que devuelve un método que la base no soporta no firma ni guarda", async () => {
    const raro: ProveedorFirma = { metodo: "logica", firmar: async () => ({ metodo: "certificada" as unknown as "logica" }) };
    const s = simular(() => [[{ id: NUEVO_ID }], [{ firmada_en: "x" }]], { proveedor: raro });
    const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido, firmar: true });
    assert.equal(r.ok, false);
    assert.equal(s.llamadas.length, 0);
  });

  it("la guarda: sin rol médico o sin MFA no se ejecuta ninguna consulta", async () => {
    const s = simular(() => [[{ id: NUEVO_ID }]], { guarda: fallo("NO_AUTORIZADO", "No tiene permiso para realizar esta operación") });
    const r = await casoRegistrarAtencion(s.entorno, { paciente_id: PACIENTE, ...contenido });
    assert.equal(r.ok, false);
    assert.equal(s.llamadas.length, 0);
    assert.equal(s.refrescos.length, 0);
  });
});

describe("actualizarBorrador", () => {
  const entrada = { atencion_id: ATENCION, ...contenido };

  it("el autor edita su borrador: una sentencia de UPDATE por id y una de comprobación, sin paciente ni cita", async () => {
    const s = simular(() => [[{ id: ATENCION }], [{ firmada: false, es_autor: true }]]);
    const r = await casoActualizarBorrador(s.entorno, entrada);
    assert.deepEqual(r, { ok: true, datos: { id: ATENCION, firmadaEn: null } });
    assert.match(s.llamadas[0]![0]!.texto, /^update public\.atenciones/);
    assert.doesNotMatch(s.llamadas[0]![0]!.texto, /paciente_id|medico_id|cita_id|firmada_en/);
  });

  it("una edición con un campo vacío no llega a la base", async () => {
    const s = simular(() => [[{ id: ATENCION }]]);
    const r = await casoActualizarBorrador(s.entorno, { ...entrada, motivo_consulta: "  " });
    assert.equal(r.ok, false);
    assert.equal(s.llamadas.length, 0);
  });

  it("cero filas sobre una atención firmada: «ya está firmada, use una addenda»", async () => {
    const s = simular(() => [[], [{ firmada: true, es_autor: true }]]);
    const r = await casoActualizarBorrador(s.entorno, entrada);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.mensaje, MENSAJE_ATENCION_FIRMADA);
      assert.equal((r as { causa?: string }).causa, "firmada");
    }
  });

  it("cero filas sobre el borrador de otro médico a cargo: solo el autor edita", async () => {
    const s = simular(() => [[], [{ firmada: false, es_autor: false }]]);
    const r = await casoActualizarBorrador(s.entorno, entrada);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.mensaje, MENSAJE_NO_ES_AUTOR);
  });

  it("cero filas y atención no visible: sin acceso (igual que una inexistente)", async () => {
    const s = simular(() => [[], []]);
    const r = await casoActualizarBorrador(s.entorno, entrada);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.mensaje, MENSAJE_SIN_ACCESO);
  });

  it("guardar y firmar el borrador: UPDATE, comprobación y firmar_atencion en una sola llamada", async () => {
    const s = simular(() => [[{ id: ATENCION }], [{ firmada: false, es_autor: true }], [{ firmada_en: "2026-10-25T15:00:00.000Z" }]]);
    const r = await casoActualizarBorrador(s.entorno, { ...entrada, firmar: true });
    assert.equal(r.ok, true);
    assert.equal(s.llamadas.length, 1);
    assert.equal(s.llamadas[0]?.length, 3);
    assert.match(s.llamadas[0]![2]!.texto, /firmar_atencion/);
  });
});

describe("firmarAtencion", () => {
  it("firma con una sola sentencia que falla si no firma; la hora la devuelve la base", async () => {
    const hora = new Date("2026-10-25T15:00:00.000Z");
    const s = simular(() => [[{ firmada_en: hora }]]);
    const r = await casoFirmarAtencion(s.entorno, { atencion_id: ATENCION });
    assert.deepEqual(r, { ok: true, datos: { id: ATENCION, firmadaEn: hora.toISOString() } });
    assert.equal(s.llamadas[0]?.length, 1);
  });

  it("rechaza una hora de firma enviada por el cliente (clave ajena)", async () => {
    const s = simular(() => [[{ firmada_en: "x" }]]);
    const r = await casoFirmarAtencion(s.entorno, { atencion_id: ATENCION, firmada_en: "2000-01-01T00:00:00Z" });
    assert.equal(r.ok, false);
    assert.equal(s.llamadas.length, 0);
  });

  it("una atención ya firmada devuelve el mensaje de la regla; otra ajena, sin acceso", async () => {
    const firmada = simular(() => errorSql("42501", "Atención firmada: use una addenda para corregir"));
    const r1 = await casoFirmarAtencion(firmada.entorno, { atencion_id: ATENCION });
    assert.equal(r1.ok === false && r1.mensaje, MENSAJE_ATENCION_FIRMADA);
    const ajena = simular(() => errorSql("42501", "No tiene acceso a esta atención"));
    const r2 = await casoFirmarAtencion(ajena.entorno, { atencion_id: ATENCION });
    assert.equal(r2.ok === false && r2.mensaje, MENSAJE_SIN_ACCESO);
  });
});

describe("agregarAddenda", () => {
  it("inserta a nombre del médico de la sesión y no envía autor ni hora", async () => {
    const s = simular(() => [[{ id: "44444444-4444-4444-8444-444444444444" }], [{ firmada: true }]]);
    const r = await casoAgregarAddenda(s.entorno, { atencion_id: ATENCION, texto: "Se corrige la dosis." });
    assert.equal(r.ok, true);
    const sql = s.llamadas[0]![0]!.texto;
    assert.match(sql, /public\.medico_actual\(\)/);
    assert.doesNotMatch(sql, /creado_en/);
    assert.deepEqual(s.llamadas[0]![0]!.parametros, [ATENCION, "Se corrige la dosis."]);
  });

  it("una addenda vacía o de caracteres invisibles se rechaza sin tocar la base", async () => {
    const s = simular(() => [[{ id: "x" }]]);
    for (const texto of ["", "   ", "\u200B\u2060"]) {
      const r = await casoAgregarAddenda(s.entorno, { atencion_id: ATENCION, texto });
      assert.equal(r.ok, false);
    }
    assert.equal(s.llamadas.length, 0);
  });

  it("una addenda sobre un borrador se rechaza indicando que se edita directamente", async () => {
    const s = simular(() => [[], [{ firmada: false }]]);
    const r = await casoAgregarAddenda(s.entorno, { atencion_id: ATENCION, texto: "x" });
    assert.equal(r.ok === false && r.mensaje, MENSAJE_ES_BORRADOR);
  });

  it("una addenda sobre una atención que no se ve: sin acceso, sin revelar existencia", async () => {
    const s = simular(() => [[], []]);
    const r = await casoAgregarAddenda(s.entorno, { atencion_id: ATENCION, texto: "x" });
    assert.equal(r.ok === false && r.mensaje, MENSAJE_SIN_ACCESO);
  });

  it("una clave ajena (medico_id, creado_en) se rechaza", async () => {
    const s = simular(() => [[{ id: "x" }]]);
    const r = await casoAgregarAddenda(s.entorno, { atencion_id: ATENCION, texto: "x", medico_id: PACIENTE });
    assert.equal(r.ok, false);
    assert.equal(s.llamadas.length, 0);
  });
});
