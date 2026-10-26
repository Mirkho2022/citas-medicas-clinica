// Lectura de historias clínicas (historias-clinicas, grupos 4 y 6): `lib/historia/repositorio.ts` ejecutado COMO `authenticated`
// con la identidad y el rol de cada usuario sobre un branch de pruebas, con la RLS real. Todo ocurre dentro de UNA transacción que
// se revierte al terminar (tests/historia/_sesiones.ts): las historias, atenciones y accesos no se pueden borrar por diseño, así
// que nada de esto se confirma ni deja rastro. Complementa a tests/historia/repositorio.test.ts (doble del ejecutor) y a
// tests/pgtap/85_accesos_historia_tipo.test.sql. Nunca corre contra production (tests/concurrencia/_conexion.ts).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Ejecutor } from "../../lib/db/ejecutor.ts";
import { abrirAtencion, abrirHistoria, ErrorDeLecturaClinica, listarPacientesACargo } from "../../lib/historia/repositorio.ts";
import { SesionTransaccional, type IdentidadDePrueba } from "../historia/_sesiones.ts";

const MEDICO_A: IdentidadDePrueba = { sub: "user_hl_medico_a", rol: "medico" };
const MEDICO_B: IdentidadDePrueba = { sub: "user_hl_medico_b", rol: "medico" };
const ADMIN: IdentidadDePrueba = { sub: "user_hl_admin", rol: "administrativo" };
const ENFERMERA: IdentidadDePrueba = { sub: "user_hl_enfermera", rol: "enfermera" };
const PACIENTE: IdentidadDePrueba = { sub: "user_hl_paciente", rol: "paciente" };
const SIN_ROL: IdentidadDePrueba = { sub: "user_hl_sinrol", rol: null };

const INEXISTENTE = "00000000-0000-4000-8000-00000000dead";

let sesion: SesionTransaccional;
const ids: Record<string, string> = {};

async function insertar(texto: string, parametros: unknown[] = []): Promise<string> {
  const filas = await sesion.comoDueno<{ id: string }>(`${texto} returning id`, parametros);
  return filas[0]!.id;
}

async function accesos(pacienteId: string): Promise<{ tipo_acceso: string; actor_id: string; atencion_id: string | null }[]> {
  return sesion.comoDueno(
    `select tipo_acceso, actor_id, atencion_id from public.accesos_historia where paciente_id = $1 order by id`,
    [pacienteId],
  );
}

before(async () => {
  sesion = await SesionTransaccional.abrir();
  const especialidad = await insertar(`insert into public.especialidades (nombre) values ('Esp integracion historia')`);
  for (const [clave, identidad] of Object.entries({ medico_a: MEDICO_A, medico_b: MEDICO_B, admin: ADMIN, enfermera: ENFERMERA, paciente: PACIENTE })) {
    ids[`perfil_${clave}`] = await insertar(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, $3, 'Prueba')`,
      [identidad.sub, identidad.rol, clave === "medico_a" ? "Mario" : clave === "medico_b" ? "Marta" : "Otro"],
    );
  }
  ids.medico_a = await insertar(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, 'CMP-HL-A', $2)`, [ids.perfil_medico_a, especialidad]);
  ids.medico_b = await insertar(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, 'CMP-HL-B', $2)`, [ids.perfil_medico_b, especialidad]);

  // p1: a cargo de A (con la ficha, antecedentes, atenciones y addenda). p2: a cargo de B. p3: A solo tiene una cita reservada.
  // p4: la asignación de A venció ayer. p5: de nadie. Documentos `8610000n`; correos `@demo.invalid`.
  const pacientes: Array<[string, string, string]> = [
    ["p1", "Quispe Ñañez", "Rosa María"],
    ["p2", "Torres Vega", "Luis"],
    ["p3", "Mamani Ccori", "Ana"],
    ["p4", "Rojas Díaz", "Pedro"],
    ["p5", "Huamán Lazo", "Elena"],
  ];
  for (const [i, [clave, apellidos, nombres]] of pacientes.entries()) {
    ids[clave] = await insertar(
      `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, telefono)
       values ('DNI', $1, $2, $3, '1990-05-17', 'F', $4, '999111222')`,
      [`8610000${i + 1}`, nombres, apellidos, `hl${i + 1}@demo.invalid`],
    );
  }
  // El paciente de la cuenta de paciente: p5 (para probar que ni el titular lee su historia).
  await sesion.comoDueno(`update public.pacientes set perfil_id = $1 where id = $2`, [ids.perfil_paciente, ids.p5]);

  const asignar = (paciente: string, medico: string, hasta: string | null, motivo: string) =>
    sesion.comoDueno(
      `insert into public.asignaciones_paciente_medico (paciente_id, medico_id, vigente_desde, vigente_hasta, motivo)
       values ($1, $2, public.hoy_lima() - 30, ${hasta}, $3)`,
      [paciente, medico, motivo],
    );
  await asignar(ids.p1!, ids.medico_a!, "null", "manual");
  await asignar(ids.p2!, ids.medico_b!, "null", "manual");
  await asignar(ids.p4!, ids.medico_a!, "public.hoy_lima() - 1", "manual: vencida");
  await sesion.comoDueno(
    `insert into public.citas (paciente_id, medico_id, inicio, fin, origen)
     values ($1, $2, '2032-03-01 09:00:00-05', '2032-03-01 09:20:00-05', 'administrativo')`,
    [ids.p3, ids.medico_a],
  );

  const atencion = (clave: string, paciente: string, medico: string, firmada: boolean, motivo: string) =>
    insertar(
      `insert into public.atenciones (historia_id, paciente_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
       values ((select id from public.historias_clinicas where paciente_id = $1), $1, $2, $3, 'Anamnesis ' || $3, 'Examen', '[{"cie10": "R51", "descripcion": "Cefalea", "tipo": "definitivo"}]', 'Plan', ${firmada ? "now() - interval '1 day'" : "null"})`,
      [paciente, medico, motivo],
    ).then((id) => {
      ids[clave] = id;
    });
  await atencion("at1", ids.p1!, ids.medico_a!, true, "Motivo firmado de p1");
  await atencion("at1_borrador_a", ids.p1!, ids.medico_a!, false, "Borrador propio de p1");
  await atencion("at1_borrador_b", ids.p1!, ids.medico_b!, false, "Borrador AJENO de p1");
  await atencion("at2", ids.p2!, ids.medico_b!, true, "Motivo firmado de p2");
  await sesion.comoDueno(`insert into public.addendas (atencion_id, medico_id, texto) values ($1, $2, 'Addenda de p1')`, [ids.at1, ids.medico_a]);

  await sesion.comoDueno(
    `insert into public.antecedentes (paciente_id, tipo, descripcion, vigente, registrado_por)
     values ($1, 'alergico', 'Alergia vigente a la penicilina', true, $2), ($1, 'quirurgico', 'Cirugía ya corregida', false, $2)`,
    [ids.p1, ids.medico_a],
  );
});

after(async () => {
  await sesion?.revertirYCerrar();
});

async function comoMedico(identidad: IdentidadDePrueba): Promise<Ejecutor> {
  await sesion.como(identidad);
  return sesion.ejecutor();
}

test("el médico a cargo abre la historia: ficha, antecedentes vigentes, atenciones firmadas con addendas y borradores sin contenido", async () => {
  const ejecutar = await comoMedico(MEDICO_A);
  const resultado = await abrirHistoria(ejecutar, { pacienteId: ids.p1 });
  assert.equal(resultado.estado, "ok");
  if (resultado.estado !== "ok") return;
  const { datos } = resultado;

  assert.equal(datos.ficha.numeroDocumento, "86100001");
  assert.equal(datos.ficha.apellidos, "Quispe Ñañez");
  assert.equal(datos.ficha.fechaNacimiento, "1990-05-17", "la fecha de nacimiento no cambia de día");
  assert.match(datos.ficha.numeroHistoria ?? "", /\S/);
  assert.equal(datos.ficha.telefono, "999111222");
  assert.ok(!("direccion" in datos.ficha), "no se entrega la dirección");

  assert.deepEqual(datos.antecedentes.map((a) => a.descripcion), ["Alergia vigente a la penicilina"], "solo los vigentes");

  assert.equal(datos.atenciones.total, 1);
  assert.equal(datos.atenciones.items.length, 1, "solo atenciones firmadas");
  const atencion = datos.atenciones.items[0]!;
  assert.equal(atencion.id, ids.at1);
  assert.equal(atencion.motivoConsulta, "Motivo firmado de p1");
  assert.equal(atencion.autor, "Mario Prueba");
  assert.equal(atencion.propia, true);
  assert.deepEqual(atencion.addendas.map((a) => [a.texto, a.autor]), [["Addenda de p1", "Mario Prueba"]]);
  assert.equal(atencion.diagnosticos[0]?.cie10, "R51");
  assert.match(atencion.firmadaEn ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  assert.deepEqual(datos.diagnosticosRegistrados.map((d) => d.cie10), ["R51"]);
  assert.equal(datos.borradores.length, 2);
  assert.deepEqual(datos.borradores.map((b) => b.propio).sort(), [false, true]);
  const serializado = JSON.stringify(datos.borradores);
  assert.doesNotMatch(serializado, /Borrador propio|Borrador AJENO|Anamnesis/, "un borrador no trae su contenido");
});

test("cada apertura deja su propio acceso de tipo historia, a nombre del médico, en la misma transacción", async () => {
  const antes = (await accesos(ids.p1!)).length;
  const ejecutar = await comoMedico(MEDICO_A);
  await abrirHistoria(ejecutar, { pacienteId: ids.p1 });
  await abrirHistoria(ejecutar, { pacienteId: ids.p1, pagina: 2 });
  const despues = await accesos(ids.p1!);
  assert.equal(despues.length - antes, 2, "cada solicitud cuenta, también el cambio de página");
  const ultimo = despues.at(-1)!;
  assert.equal(ultimo.tipo_acceso, "historia");
  assert.equal(ultimo.actor_id, ids.perfil_medico_a);
  assert.equal(ultimo.atencion_id, null);
});

test("si algo falla DESPUÉS del registro, el acceso tampoco queda: la transacción es una sola", async () => {
  const antes = (await accesos(ids.p1!)).length;
  const ejecutar = await comoMedico(MEDICO_A);
  const conFalloAlFinal: Ejecutor = (sentencias) => ejecutar([...sentencias, { texto: "select 1 / 0" }]);
  await assert.rejects(abrirHistoria(conFalloAlFinal, { pacienteId: ids.p1 }), (e) => e instanceof ErrorDeLecturaClinica);
  assert.equal((await accesos(ids.p1!)).length, antes, "sin lectura entregada no hay registro de acceso");
});

test("un paciente que tiene otro médico, sin nadie a cargo, con asignación vencida o inexistente: misma respuesta y NINGÚN acceso registrado", async () => {
  const ejecutar = await comoMedico(MEDICO_A);
  const respuestas = new Map<string, unknown>();
  for (const [clave, id] of [["de_otro_medico", ids.p2], ["de_nadie", ids.p5], ["vencida", ids.p4], ["inexistente", INEXISTENTE], ["sin_uuid", "no-es-uuid"]] as const) {
    respuestas.set(clave, await abrirHistoria(ejecutar, { pacienteId: id }));
  }
  for (const [clave, respuesta] of respuestas) {
    assert.deepEqual(respuesta, { estado: "no_encontrada" }, `«${clave}» debe ser indistinguible de un paciente inexistente`);
  }
  for (const id of [ids.p2!, ids.p4!, ids.p5!]) {
    assert.equal((await accesos(id)).length, 0, "un intento rechazado no deja acceso ni entrega contenido");
  }
});

test("un paciente con cita solo reservada: «historia aún no habilitada», sin contenido ni acceso", async () => {
  const ejecutar = await comoMedico(MEDICO_A);
  assert.deepEqual(await abrirHistoria(ejecutar, { pacienteId: ids.p3 }), { estado: "no_habilitada" });
  assert.equal((await accesos(ids.p3!)).length, 0);
});

test("el otro médico no abre la historia del paciente de A", async () => {
  const ejecutar = await comoMedico(MEDICO_B);
  assert.deepEqual(await abrirHistoria(ejecutar, { pacienteId: ids.p1 }), { estado: "no_encontrada" });
});

test("administrativo, enfermera, paciente (incluso sobre su propia ficha) y sin rol no abren ninguna historia", async () => {
  for (const [nombre, identidad, paciente] of [
    ["administrativo", ADMIN, ids.p1],
    ["enfermera", ENFERMERA, ids.p1],
    ["paciente sobre otra historia", PACIENTE, ids.p1],
    ["paciente sobre su propia historia", PACIENTE, ids.p5],
    ["sin rol", SIN_ROL, ids.p1],
  ] as const) {
    const antes = (await accesos(paciente!)).length;
    const ejecutar = await comoMedico(identidad);
    assert.deepEqual(await abrirHistoria(ejecutar, { pacienteId: paciente }), { estado: "no_encontrada" }, nombre);
    assert.equal((await accesos(paciente!)).length, antes, `${nombre}: no deja acceso`);
  }
});

test("abrirAtencion: deja un acceso de tipo atención con su identificador y entrega la atención con sus addendas", async () => {
  const ejecutar = await comoMedico(MEDICO_A);
  const resultado = await abrirAtencion(ejecutar, { pacienteId: ids.p1, atencionId: ids.at1 });
  assert.equal(resultado.estado, "ok");
  if (resultado.estado === "ok") {
    assert.equal(resultado.datos.atencion.id, ids.at1);
    assert.equal(resultado.datos.atencion.addendas.length, 1);
    assert.equal(resultado.datos.antecedentes.length, 1);
  }
  const ultimo = (await accesos(ids.p1!)).at(-1)!;
  assert.deepEqual([ultimo.tipo_acceso, ultimo.atencion_id], ["atencion", ids.at1]);

  // Un borrador propio también se abre (para editarlo); lo firmado de otro paciente, no.
  const borrador = await abrirAtencion(ejecutar, { pacienteId: ids.p1, atencionId: ids.at1_borrador_a });
  assert.equal(borrador.estado, "ok");
  if (borrador.estado === "ok") assert.equal(borrador.datos.atencion.firmadaEn, null);
});

test("abrirAtencion: la atención de otro paciente, la de un paciente ajeno o una inexistente no se abren ni dejan acceso", async () => {
  const antes = (await accesos(ids.p1!)).length;
  const ejecutar = await comoMedico(MEDICO_A);
  // at2 es de p2 (a cargo de B): usarla con p1 (a cargo de A) sería un acceso falso al nombre de p1.
  assert.deepEqual(await abrirAtencion(ejecutar, { pacienteId: ids.p1, atencionId: ids.at2 }), { estado: "no_encontrada" });
  assert.deepEqual(await abrirAtencion(ejecutar, { pacienteId: ids.p2, atencionId: ids.at2 }), { estado: "no_encontrada" });
  assert.deepEqual(await abrirAtencion(ejecutar, { pacienteId: ids.p1, atencionId: INEXISTENTE }), { estado: "no_encontrada" });
  assert.equal((await accesos(ids.p1!)).length, antes);
  assert.equal((await accesos(ids.p2!)).length, 0);
});

test("«Mis pacientes»: solo los que el médico tiene a cargo (no la cita reservada, no la asignación vencida, no los de otro médico)", async () => {
  const ejecutar = await comoMedico(MEDICO_A);
  const mios = await listarPacientesACargo(ejecutar, {});
  const documentos = mios.pacientes.map((p) => p.numeroDocumento).filter((d) => d.startsWith("8610000"));
  assert.deepEqual(documentos, ["86100001"]);

  const deB = await listarPacientesACargo(await comoMedico(MEDICO_B), {});
  assert.deepEqual(deB.pacientes.map((p) => p.numeroDocumento).filter((d) => d.startsWith("8610000")), ["86100002"]);
});

test("«Mis pacientes»: la búsqueda filtra dentro de la lista, sin tildes ni mayúsculas, y el paciente de otro médico no aparece por nombre ni documento", async () => {
  const ejecutar = await comoMedico(MEDICO_A);
  const encontrar = async (busqueda: string) =>
    (await listarPacientesACargo(ejecutar, { busqueda })).pacientes.map((p) => p.numeroDocumento).filter((d) => d.startsWith("8610000"));
  assert.deepEqual(await encontrar("quispe"), ["86100001"]);
  assert.deepEqual(await encontrar("ÑAÑEZ"), ["86100001"], "ñ y mayúsculas");
  assert.deepEqual(await encontrar("nanez"), ["86100001"], "sin tildes ni ñ");
  assert.deepEqual(await encontrar("rosa quispe"), ["86100001"], "nombre y apellido en cualquier orden");
  assert.deepEqual(await encontrar("86100001"), ["86100001"], "por documento");
  assert.deepEqual(await encontrar("torres"), [], "paciente de otro médico, por apellido");
  assert.deepEqual(await encontrar("86100002"), [], "paciente de otro médico, por documento");
  assert.deepEqual(await encontrar("mamani"), [], "paciente con solo una cita reservada");
  assert.deepEqual(await encontrar("%"), [], "los comodines no son comodines");
  assert.deepEqual(await encontrar("' or 1=1 --"), []);
});

test("«Mis pacientes»: administrativo, enfermera, paciente y sin rol reciben la lista vacía", async () => {
  for (const identidad of [ADMIN, ENFERMERA, PACIENTE, SIN_ROL]) {
    const lista = await listarPacientesACargo(await comoMedico(identidad), {});
    assert.deepEqual(lista.pacientes.filter((p) => p.numeroDocumento.startsWith("8610000")), [], `${identidad.rol ?? "sin rol"}`);
  }
});

test("listar pacientes no deja registro de acceso (no entrega contenido clínico)", async () => {
  const antes = (await sesion.comoDueno(`select count(*)::int as n from public.accesos_historia`))[0] as { n: number };
  await listarPacientesACargo(await comoMedico(MEDICO_A), { busqueda: "quispe" });
  const despues = (await sesion.comoDueno(`select count(*)::int as n from public.accesos_historia`))[0] as { n: number };
  assert.equal(despues.n, antes.n);
});
