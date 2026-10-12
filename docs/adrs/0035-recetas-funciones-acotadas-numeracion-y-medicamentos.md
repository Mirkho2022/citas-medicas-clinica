# ADR 0035: Recetas: escritura por funciones acotadas, numeración correlativa y lectura de medicamentos

## Estado

**Propuesto** — pendiente de aceptación del usuario. Detalle en `openspec/changes/recetas-medicas/design.md` (D1, D2, D4, D6). Toca
el acceso a contenido clínico: revisión explícita con `code-review`.

## Contexto

El PRD define una receta común impresa, con plantilla, numerada y guardada como datos estructurados, que solo emite el profesional
autorizado, que no se edita una vez emitida, y de la que salen los **medicamentos** que ven todos los profesionales a cargo
(Psicología no receta: [ADR-0031](0031-aislamiento-de-la-informacion-de-psicologia.md)). Quedan fuera la receta electrónica y
especial y las alertas de interacción.

## Decisión propuesta

- **Quién receta:** un catálogo `profesiones_que_recetan` gestionado por migración, sin permisos para ningún rol de usuario. Médico
  sí, psicólogo no; odontólogo, fisioterapeuta y podólogo quedan en «no, sin confirmar» hasta que el cliente y el asesor decidan. La
  profesión sale de `profesion_actual()` ([ADR-0030](0030-profesional-de-la-salud.md)), nunca del cliente.
- **Escritura solo por funciones acotadas** (`emitir_receta`, `anular_receta`, `registrar_impresion_receta`): ningún `INSERT`,
  `UPDATE` ni `DELETE` directo. El formulario genera el identificador al abrirse, para que un reintento no emita dos recetas.
- **Numeración** correlativa, única y sin huecos, a prueba de concurrencia (bloqueo asesor de transacción). **Inmutabilidad**: solo
  se permite `emitida → anulada`; corregir es anular y emitir otra. Huella del contenido, como las atenciones.
- **Medicamentos del paciente:** una vista `security_invoker` sobre las recetas vigentes, que lee todo profesional a cargo
  (psicólogo incluido) y nadie más, y que no toca nada de Psicología.
- **Impresión:** hoja HTML con CSS de impresión; el botón «Imprimir» registra la impresión (original o duplicado) antes de
  imprimir. El medicamento se guarda con DCI obligatoria; un catálogo oficial queda como decisión abierta.

## Alternativas consideradas

- **Políticas `INSERT` más disparadores:** exigen exponer columnas a los roles; descartada.
- **Numeración con secuencia:** deja huecos; **tabla contador** y **`max+1` con reintento:** más frágiles que el bloqueo.
- **Vista con `SECURITY DEFINER`:** obliga a duplicar la regla de acceso; queda como alternativa si se quiere que solo el emisor lea
  la receta completa.
- **PDF en servidor o en navegador:** más dependencias para el mismo resultado.

## Consecuencias

- Tres tablas nuevas (`recetas`, `receta_items`, `impresiones_receta`) y un catálogo, con RLS y pruebas pgTAP negativas.
- Hay que fijar el orden de las migraciones que amplían los tipos de `accesos_historia`.
- Preguntas abiertas: qué profesiones recetan, catálogo de medicamentos, datos del establecimiento y plazo de validez, impresora en
  cada consultorio, y si cada profesional ve la receta completa de sus colegas.
- El contenido mínimo según el DS 014-2011-SA, art. 56, solo se conoce por una guía comercial: se valida con el asesor.
