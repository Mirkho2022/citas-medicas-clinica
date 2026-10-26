// Esquemas Zod de la atención (specs/registro-de-atencion, «Validación en el servidor de campos obligatorios y datos válidos»).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addendaSchema, atencionNuevaSchema, borradorSchema, firmarAtencionSchema } from "../../lib/schemas/atencion.ts";

const PACIENTE = "11111111-1111-4111-8111-111111111111";
const ATENCION = "22222222-2222-4222-8222-222222222222";

const valida = {
  paciente_id: PACIENTE,
  motivo_consulta: "Dolor de cabeza desde hace tres días",
  anamnesis: "Cefalea holocraneana, sin fiebre.",
  examen_fisico: "Paciente estable, sin signos de alarma.",
  diagnosticos: [{ cie10: "R51", tipo: "definitivo" }],
  plan_tratamiento: "Paracetamol 500 mg cada 8 horas por 3 días.",
};

function errores(entrada: unknown): Record<string, string> {
  const r = atencionNuevaSchema.safeParse(entrada);
  assert.equal(r.success, false, "se esperaba un rechazo");
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("atencionNuevaSchema", () => {
  it("acepta una atención completa y por defecto no firma", () => {
    const r = atencionNuevaSchema.parse(valida);
    assert.equal(r.firmar, false);
    assert.equal(r.cita_id, null);
    assert.deepEqual(r.diagnosticos, [{ cie10: "R51", tipo: "definitivo" }]);
  });

  it("campo vacío: no se guarda y el mensaje dice qué falta", () => {
    assert.equal(errores({ ...valida, anamnesis: "" }).anamnesis, "La anamnesis es obligatoria");
    assert.equal(errores({ ...valida, motivo_consulta: "" }).motivo_consulta, "El motivo de consulta es obligatorio");
    assert.equal(errores({ ...valida, examen_fisico: "" }).examen_fisico, "El examen físico es obligatorio");
    assert.equal(errores({ ...valida, plan_tratamiento: "" }).plan_tratamiento, "El plan de tratamiento es obligatorio");
  });

  it("campo ausente o de otro tipo se trata como vacío, en español", () => {
    const sinAnamnesis: Record<string, unknown> = { ...valida };
    delete sinAnamnesis.anamnesis;
    assert.equal(errores(sinAnamnesis).anamnesis, "La anamnesis es obligatoria");
    assert.equal(errores({ ...valida, anamnesis: 42 }).anamnesis, "La anamnesis es obligatoria");
    assert.equal(errores({ ...valida, anamnesis: null }).anamnesis, "La anamnesis es obligatoria");
  });

  it("solo espacios, tabuladores y saltos de línea se rechazan como vacío", () => {
    for (const texto of ["   ", "\t", "\n\n", " \t\r\n ", " "]) {
      assert.equal(errores({ ...valida, anamnesis: texto }).anamnesis, "La anamnesis es obligatoria", JSON.stringify(texto));
    }
  });

  it("solo caracteres invisibles de ancho cero se rechazan como vacío", () => {
    for (const texto of ["\u200B", "\u200C\u200D", "\u2060", "\uFEFF", "\u00AD", " \u200B \t\u2060"]) {
      assert.equal(errores({ ...valida, anamnesis: texto }).anamnesis, "La anamnesis es obligatoria", JSON.stringify(texto));
    }
  });

  it("un texto con contenido real y un invisible en medio se acepta", () => {
    assert.equal(atencionNuevaSchema.safeParse({ ...valida, anamnesis: "Tos\u200B seca" }).success, true);
  });

  it("rechaza U+0000, que PostgreSQL no puede guardar", () => {
    assert.match(errores({ ...valida, anamnesis: "Tos\u0000 seca" }).anamnesis ?? "", /caracteres que no se pueden guardar/);
  });

  it("normaliza a NFC y recorta solo los extremos", () => {
    const r = atencionNuevaSchema.parse({ ...valida, anamnesis: "  Café con  leche \n" });
    assert.equal(r.anamnesis, "Café con  leche");
  });

  it("respeta la longitud máxima (motivo 500, textos 5000) contando caracteres, no unidades UTF-16", () => {
    assert.equal(atencionNuevaSchema.safeParse({ ...valida, motivo_consulta: "a".repeat(500) }).success, true);
    assert.match(errores({ ...valida, motivo_consulta: "a".repeat(501) }).motivo_consulta ?? "", /no puede superar los 500 caracteres/);
    assert.equal(atencionNuevaSchema.safeParse({ ...valida, anamnesis: "😀".repeat(5000) }).success, true);
    assert.match(errores({ ...valida, plan_tratamiento: "a".repeat(5001) }).plan_tratamiento ?? "", /no puede superar/);
  });

  it("exige al menos un diagnóstico", () => {
    assert.equal(errores({ ...valida, diagnosticos: [] }).diagnosticos, "Registre al menos un diagnóstico");
    const sin: Record<string, unknown> = { ...valida };
    delete sin.diagnosticos;
    assert.equal(errores(sin).diagnosticos, "Registre al menos un diagnóstico");
  });

  it("admite como máximo 10 diagnósticos", () => {
    const codigos = ["A00", "A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "B00"];
    const lista = codigos.map((cie10) => ({ cie10, tipo: "presuntivo" }));
    assert.equal(lista.length, 11);
    assert.equal(atencionNuevaSchema.safeParse({ ...valida, diagnosticos: lista.slice(0, 10) }).success, true);
    assert.match(errores({ ...valida, diagnosticos: lista }).diagnosticos ?? "", /hasta 10 diagnósticos/);
  });

  it("rechaza un diagnóstico repetido indicando cuál y en qué posición", () => {
    const e = errores({ ...valida, diagnosticos: [{ cie10: "R51", tipo: "definitivo" }, { cie10: "r51 ", tipo: "presuntivo" }] });
    assert.equal(e["diagnosticos.1.cie10"], "El diagnóstico R51 está repetido");
  });

  it("rechaza un tipo de diagnóstico no permitido o ausente", () => {
    assert.match(errores({ ...valida, diagnosticos: [{ cie10: "R51", tipo: "sospechoso" }] })["diagnosticos.0.tipo"] ?? "", /Elija el tipo/);
    assert.match(errores({ ...valida, diagnosticos: [{ cie10: "R51" }] })["diagnosticos.0.tipo"] ?? "", /Elija el tipo/);
  });

  it("rechaza un código CIE-10 con forma inválida y normaliza mayúsculas", () => {
    assert.equal(errores({ ...valida, diagnosticos: [{ cie10: "no es un codigo", tipo: "definitivo" }] })["diagnosticos.0.cie10"], "El código CIE-10 no es válido");
    const r = atencionNuevaSchema.parse({ ...valida, diagnosticos: [{ cie10: " j06.9 ", tipo: "definitivo" }] });
    assert.equal(r.diagnosticos[0]?.cie10, "J06.9");
  });

  it("el cliente no envía la descripción: una clave ajena en el diagnóstico rechaza la solicitud", () => {
    const r = atencionNuevaSchema.safeParse({ ...valida, diagnosticos: [{ cie10: "R51", tipo: "definitivo", descripcion: "Inventada" }] });
    assert.equal(r.success, false);
  });

  it("clave ajena a nivel de atención se rechaza (el médico, el autor y la hora no los decide el cliente)", () => {
    for (const ajena of [
      { medico_id: "33333333-3333-4333-8333-333333333333" },
      { historia_id: ATENCION },
      { firmada_en: "2020-01-01T00:00:00Z" },
      { creado_en: "2020-01-01T00:00:00Z" },
      { nombres: "Otro" },
      { numero_documento: "12345678" },
      { firma_huella: "v1:x" },
    ]) {
      assert.equal(atencionNuevaSchema.safeParse({ ...valida, ...ajena }).success, false, JSON.stringify(ajena));
    }
  });

  it("el paciente debe ser un uuid; la cita es opcional pero, si viene, también", () => {
    assert.equal(errores({ ...valida, paciente_id: "no-uuid" }).paciente_id, "El paciente no es válido");
    assert.equal(atencionNuevaSchema.parse({ ...valida, cita_id: "" }).cita_id, null);
    assert.equal(atencionNuevaSchema.parse({ ...valida, cita_id: null }).cita_id, null);
    assert.equal(atencionNuevaSchema.parse({ ...valida, cita_id: ATENCION }).cita_id, ATENCION);
    assert.equal(atencionNuevaSchema.safeParse({ ...valida, cita_id: "x" }).success, false);
  });

  it("rechaza una entrada que no es un objeto", () => {
    for (const entrada of [null, undefined, "texto", 7, []]) assert.equal(atencionNuevaSchema.safeParse(entrada).success, false);
  });
});

describe("borradorSchema, firmarAtencionSchema y addendaSchema", () => {
  const contenido = { ...valida } as Partial<typeof valida>;
  delete contenido.paciente_id;
  it("el borrador exige la atención y el mismo contenido, y rechaza paciente y cita (no se cambian)", () => {
    assert.equal(borradorSchema.safeParse({ atencion_id: ATENCION, ...contenido }).success, true);
    assert.equal(borradorSchema.safeParse({ atencion_id: ATENCION, ...contenido, paciente_id: PACIENTE }).success, false);
    assert.equal(borradorSchema.safeParse({ atencion_id: ATENCION, ...contenido, anamnesis: " \u200B" }).success, false);
    assert.equal(borradorSchema.safeParse({ ...contenido }).success, false);
  });

  it("firmar solo recibe el identificador de la atención", () => {
    assert.equal(firmarAtencionSchema.safeParse({ atencion_id: ATENCION }).success, true);
    assert.equal(firmarAtencionSchema.safeParse({ atencion_id: ATENCION, firmada_en: "2020-01-01" }).success, false);
    assert.equal(firmarAtencionSchema.safeParse({ atencion_id: "x" }).success, false);
  });

  it("la addenda exige texto con contenido real y no acepta autor ni fecha", () => {
    assert.equal(addendaSchema.safeParse({ atencion_id: ATENCION, texto: "Se corrige la dosis." }).success, true);
    for (const texto of ["", "  ", "\u200B", "\n\t"]) {
      assert.equal(addendaSchema.safeParse({ atencion_id: ATENCION, texto }).success, false, JSON.stringify(texto));
    }
    assert.equal(addendaSchema.safeParse({ atencion_id: ATENCION, texto: "x", medico_id: PACIENTE }).success, false);
    assert.equal(addendaSchema.safeParse({ atencion_id: ATENCION, texto: "x", creado_en: "2020-01-01" }).success, false);
  });
});
