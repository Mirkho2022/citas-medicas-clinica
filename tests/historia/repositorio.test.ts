// Pruebas de lib/historia/repositorio.ts con un `Ejecutor` doble (sin Clerk, sin red y sin base de datos): el ORDEN de las
// sentencias (acceso antes de leer), que un fallo del registro no entrega contenido, el 404 uniforme y que ningún error crudo ni
// dato clínico llega al registro del servidor. Lo que toca la base real (RLS, SQL) está en tests/integracion/historia-lectura.test.ts.
// Ejecutar con: npm run test:historia.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import {
  abrirAtencion,
  abrirHistoria,
  diagnosticosRegistrados,
  ErrorDeLecturaClinica,
  LIMITE_LISTA_PACIENTES,
  listarPacientesACargo,
  sentenciaDeAcceso,
  sentenciaDeLista,
} from "../../lib/historia/repositorio.ts";

const PACIENTE = "8f14e45f-ceea-467a-9575-1c9a3e3a0a11";
const ATENCION = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

const FICHA: Fila = {
  id: PACIENTE,
  tipo_documento: "DNI",
  numero_documento: "99000001",
  nombres: "Rosa",
  apellidos: "Quispe Rojas",
  fecha_nacimiento: "1990-05-17",
  sexo: "F",
  telefono: null,
  email: "rosa@demo.invalid",
  numero_historia: "HC-000001",
};

const ATENCION_FILA: Fila = {
  id: ATENCION,
  firmada_en: "2026-10-01T15:30:00.000Z",
  creado_en: "2026-10-01T15:00:00.000Z",
  autor: "Mario Demo",
  propia: true,
  motivo_consulta: "Dolor de cabeza",
  anamnesis: "Tres días de evolución",
  examen_fisico: "Sin hallazgos",
  diagnosticos: [{ cie10: "R51", descripcion: "Cefalea", tipo: "definitivo" }],
  plan_tratamiento: "Reposo",
  addendas: [{ id: "a1", texto: "Aclaración", creado_en: "2026-10-02T10:00:00.000Z", autor: "Mario Demo" }],
};

// Ejecutor de prueba: registra cada llamada (sus sentencias) y responde con `respuestas` en orden; si la respuesta es un error,
// lo lanza. Una llamada sin respuesta devuelve un resultado vacío por sentencia.
function ejecutorDe(respuestas: Array<Fila[][] | Error> = []) {
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    const respuesta = respuestas.shift();
    if (respuesta instanceof Error) throw respuesta;
    return respuesta ?? sentencias.map(() => []);
  };
  return { ejecutar, llamadas };
}

const errorSql = (code: string) => Object.assign(new Error("permission denied for table (texto de postgres)"), { code });

const esAcceso = (s: Sentencia) => /insert into public\.accesos_historia/.test(s.texto);
const esLectura = (s: Sentencia) => /^\s*select\b/.test(s.texto);

// Respuestas de abrirHistoria: acceso, ficha, antecedentes, atenciones, conteo, diagnósticos, borradores.
const RESPUESTA_HISTORIA: Fila[][] = [
  [],
  [FICHA],
  [{ id: "an1", tipo: "alergico", descripcion: "Penicilina", registrado_en: "2026-09-01T00:00:00.000Z" }],
  [ATENCION_FILA],
  [{ total: 1 }],
  [{ firmada_en: "2026-10-01T15:30:00.000Z", diagnosticos: ATENCION_FILA.diagnosticos }],
  [{ id: "b1", creado_en: "2026-10-03T00:00:00.000Z", autor: "Marta Demo", propia: false }],
];

test("abrirHistoria: el acceso se registra ANTES de cualquier lectura y todo va en una sola transacción", async () => {
  const { ejecutar, llamadas } = ejecutorDe([RESPUESTA_HISTORIA]);
  const resultado = await abrirHistoria(ejecutar, { pacienteId: PACIENTE.toUpperCase() });

  assert.equal(llamadas.length, 1, "una sola llamada al ejecutor = una sola transacción");
  const sentencias = llamadas[0]!;
  assert.ok(esAcceso(sentencias[0]!), "la primera sentencia es el registro del acceso");
  assert.deepEqual(
    sentencias.filter(esAcceso).length,
    1,
    "exactamente un registro de acceso por apertura",
  );
  assert.ok(sentencias.slice(1).every(esLectura), "después del acceso solo hay lecturas");
  assert.match(sentencias[0]!.texto, /tipo_acceso\)\s*values \(\(select public\.perfil_actual\(\)\)/, "el actor sale de la sesión de la base");
  assert.deepEqual(sentencias[0]!.parametros, [PACIENTE], "el identificador se normaliza a minúsculas");
  assert.equal(resultado.estado, "ok");
});

test("abrirHistoria: arma la historia con ficha, antecedentes, atenciones con addendas, diagnósticos y borradores sin contenido", async () => {
  const { ejecutar } = ejecutorDe([RESPUESTA_HISTORIA]);
  const resultado = await abrirHistoria(ejecutar, { pacienteId: PACIENTE, pagina: 1 });
  assert.equal(resultado.estado, "ok");
  if (resultado.estado !== "ok") return;
  const { datos } = resultado;
  assert.equal(datos.ficha.numeroDocumento, "99000001");
  assert.equal(datos.ficha.numeroHistoria, "HC-000001");
  assert.equal(datos.antecedentes[0]?.tipo, "alergico");
  assert.equal(datos.atenciones.total, 1);
  assert.equal(datos.atenciones.items[0]?.addendas[0]?.texto, "Aclaración");
  assert.equal(datos.atenciones.items[0]?.diagnosticos[0]?.cie10, "R51");
  assert.equal(datos.diagnosticosRegistrados[0]?.descripcion, "Cefalea");
  assert.deepEqual(Object.keys(datos.borradores[0]!).sort(), ["autor", "creadoEn", "id", "propio"], "un borrador no trae contenido");
});

test("abrirHistoria: si el registro del acceso falla NO se devuelve contenido (42501 -> no_encontrada) y nada se lee aparte", async () => {
  const { ejecutar, llamadas } = ejecutorDe([
    errorSql("42501"), // la transacción de la historia: el INSERT del acceso fue rechazado
    [[{ a_cargo: false, visible: false }]], // la consulta que clasifica el rechazo
  ]);
  const resultado = await abrirHistoria(ejecutar, { pacienteId: PACIENTE });
  assert.deepEqual(resultado, { estado: "no_encontrada" });
  assert.equal(llamadas.length, 2);
  // La segunda llamada solo comprueba el rechazo: ninguna lectura de contenido clínico.
  assert.equal(llamadas[1]!.length, 1);
  assert.doesNotMatch(llamadas[1]![0]!.texto, /atenciones|addendas|antecedentes|historias_clinicas/);
});

test("abrirHistoria: paciente visible por una cita reservada pero sin asignación -> no_habilitada", async () => {
  const { ejecutar } = ejecutorDe([errorSql("42501"), [[{ a_cargo: false, visible: true }]]]);
  assert.deepEqual(await abrirHistoria(ejecutar, { pacienteId: PACIENTE }), { estado: "no_habilitada" });
});

test("abrirHistoria: inexistente, ajeno y con asignación vencida dan EXACTAMENTE la misma respuesta", async () => {
  const inexistente = await abrirHistoria(ejecutorDe([errorSql("42501"), [[{ a_cargo: false, visible: false }]]]).ejecutar, { pacienteId: PACIENTE });
  const deOtroMedico = await abrirHistoria(ejecutorDe([errorSql("42501"), [[{ a_cargo: false, visible: false }]]]).ejecutar, { pacienteId: PACIENTE });
  const sinFicha = await abrirHistoria(ejecutorDe([[[], [], [], [], [{ total: 0 }], [], []]]).ejecutar, { pacienteId: PACIENTE });
  assert.deepEqual(inexistente, deOtroMedico);
  assert.deepEqual(inexistente, sinFicha);
  assert.deepEqual(inexistente, { estado: "no_encontrada" });
});

test("abrirHistoria: un identificador que no es uuid no llega a la base de datos", async () => {
  for (const malo of ["", "abc", "1; drop table pacientes", null, undefined, 42, `${PACIENTE}x`]) {
    const { ejecutar, llamadas } = ejecutorDe();
    assert.deepEqual(await abrirHistoria(ejecutar, { pacienteId: malo }), { estado: "no_encontrada" });
    assert.equal(llamadas.length, 0, `«${String(malo)}» no debe consultar la base`);
  }
});

test("un error inesperado se relanza genérico, sin causa, y solo se registra la operación y el SQLSTATE", async () => {
  const mensajes: string[] = [];
  const original = console.error;
  console.error = (...partes: unknown[]) => {
    mensajes.push(partes.join(" "));
  };
  try {
    const error = Object.assign(new Error("Failing row contains (Rosa Quispe, Anamnesis secreta)"), { code: "XX000" });
    await assert.rejects(
      abrirHistoria(ejecutorDe([error]).ejecutar, { pacienteId: PACIENTE }),
      (e: unknown) => {
        assert.ok(e instanceof ErrorDeLecturaClinica);
        assert.equal((e as Error).cause, undefined, "sin causa encadenada");
        assert.doesNotMatch((e as Error).message, /Rosa|secreta|Failing/);
        return true;
      },
    );
  } finally {
    console.error = original;
  }
  assert.equal(mensajes.length, 1);
  assert.match(mensajes[0]!, /\[historia:abrir_historia\].*sqlstate=XX000/);
  assert.doesNotMatch(mensajes[0]!, /Rosa|Quispe|secreta|Failing/, "el registro no contiene datos del paciente ni de la base");
});

test("abrirAtencion: acceso de tipo atención con el identificador de la atención, antes de leer, en una transacción", async () => {
  const { ejecutar, llamadas } = ejecutorDe([[[], [FICHA], [], [ATENCION_FILA]]]);
  const resultado = await abrirAtencion(ejecutar, { pacienteId: PACIENTE, atencionId: ATENCION });
  assert.equal(llamadas.length, 1);
  const sentencias = llamadas[0]!;
  assert.ok(esAcceso(sentencias[0]!));
  assert.match(sentencias[0]!.texto, /'atencion'/);
  assert.deepEqual(sentencias[0]!.parametros, [PACIENTE, ATENCION]);
  assert.ok(sentencias.slice(1).every(esLectura));
  // La lectura de la atención exige que sea del paciente de la URL, no solo el identificador de la atención.
  const lectura = sentencias.find((s) => /a\.id = \$2::uuid and a\.paciente_id = \$1::uuid/.test(s.texto));
  assert.ok(lectura, "la atención se lee con su paciente");
  assert.equal(resultado.estado, "ok");
  if (resultado.estado === "ok") assert.equal(resultado.datos.atencion.motivoConsulta, "Dolor de cabeza");
});

test("abrirAtencion: atención ajena, inexistente o de otro paciente -> no_encontrada aunque el paciente esté a cargo", async () => {
  const { ejecutar } = ejecutorDe([errorSql("42501"), [[{ a_cargo: true, visible: true }]]]);
  assert.deepEqual(await abrirAtencion(ejecutar, { pacienteId: PACIENTE, atencionId: ATENCION }), { estado: "no_encontrada" });
  const sinUuid = ejecutorDe();
  assert.deepEqual(await abrirAtencion(sinUuid.ejecutar, { pacienteId: PACIENTE, atencionId: "no-es-uuid" }), { estado: "no_encontrada" });
  assert.equal(sinUuid.llamadas.length, 0);
});

test("sentenciaDeAcceso: el actor y la hora salen de la base, no de un parámetro del cliente", () => {
  for (const s of [sentenciaDeAcceso(PACIENTE), sentenciaDeAcceso(PACIENTE, ATENCION)]) {
    assert.match(s.texto, /perfil_actual\(\)/);
    assert.doesNotMatch(s.texto, /creado_en|actor_id\)\s*values\s*\(\$/);
    assert.ok(!s.parametros?.some((p) => typeof p === "string" && p.includes("actor")));
  }
});

test("listarPacientesACargo: solo pacientes a cargo (medico_tiene_paciente), búsqueda parametrizada y sin acceso registrado", async () => {
  const { ejecutar, llamadas } = ejecutorDe([[[{ id: PACIENTE, tipo_documento: "DNI", numero_documento: "99000001", nombres: "Rosa", apellidos: "Quispe", fecha_nacimiento: "1990-05-17" }]]]);
  const lista = await listarPacientesACargo(ejecutar, { busqueda: "  QUISPE rosa " });
  assert.equal(lista.pacientes.length, 1);
  assert.equal(lista.hayMas, false);
  const [sentencia] = llamadas[0]!;
  assert.match(sentencia!.texto, /where public\.medico_tiene_paciente\(p\.id\)/);
  assert.deepEqual(sentencia!.parametros, ["%quispe%", "%rosa%"]);
  assert.ok(!esAcceso(sentencia!), "la lista no registra acceso: no entrega contenido clínico");
  assert.doesNotMatch(sentencia!.texto, /quispe|rosa/i, "el texto buscado nunca se concatena al SQL");
});

test("listarPacientesACargo: sin búsqueda no agrega condiciones; con más de 50 resultados avisa que hay más", async () => {
  assert.doesNotMatch(sentenciaDeLista([]).texto, /like/);
  const filas = Array.from({ length: LIMITE_LISTA_PACIENTES + 1 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    tipo_documento: "DNI",
    numero_documento: `9900${String(i).padStart(4, "0")}`,
    nombres: "N",
    apellidos: "A",
    fecha_nacimiento: "1990-01-01",
  }));
  const lista = await listarPacientesACargo(ejecutorDe([[filas]]).ejecutar);
  assert.equal(lista.pacientes.length, LIMITE_LISTA_PACIENTES);
  assert.equal(lista.hayMas, true);
});

test("diagnosticosRegistrados: del más reciente al más antiguo y un código una sola vez", () => {
  const filas: Fila[] = [
    { firmada_en: "2026-10-02T00:00:00.000Z", diagnosticos: [{ cie10: "I10", descripcion: "Hipertensión", tipo: "definitivo" }, { cie10: "R51", descripcion: "Cefalea", tipo: "presuntivo" }] },
    { firmada_en: "2026-09-01T00:00:00.000Z", diagnosticos: [{ cie10: "R51", descripcion: "Cefalea antigua", tipo: "definitivo" }] },
  ];
  const resultado = diagnosticosRegistrados(filas);
  assert.deepEqual(resultado.map((d) => d.cie10), ["I10", "R51"]);
  assert.equal(resultado[1]?.tipo, "presuntivo", "se conserva el registro más reciente del código");
});
