# ADR 0034: Emisión de la copia de la historia clínica

## Estado

**Propuesto** — pendiente de aceptación del usuario. Detalle en `openspec/changes/copia-de-historia-clinica/design.md` (D2). Toca el
acceso a contenido clínico: revisión explícita con `code-review`.

## Contexto

La NTS 139 exige entregar, a solicitud del paciente o de su representante legal, una copia autenticada de la historia clínica en un
máximo de 5 días. El PRD añade tres decisiones del usuario: la copia incluye la información de Psicología; un profesional que no es
psicólogo no la ve «de ninguna otra forma» ([ADR-0031](0031-aislamiento-de-la-informacion-de-psicologia.md)); y recepción y
enfermera no ven contenido clínico. Combinadas, **nadie del personal puede leer la copia completa**, y el paciente puede no tener
a ningún profesional con acceso vigente.

## Decisión propuesta

- La copia la arma **el servidor** a partir de una función `SECURITY DEFINER` acotada que entrega el contenido solo a él, nunca a
  una pantalla. El resultado es un **documento cerrado** que recepción imprime frente al solicitante y entrega; las pantallas
  muestran solo metadatos (folio, paciente, solicitante, páginas, huella).
- Una **solicitud** (`solicitudes_copia_historia`) con identidad del solicitante verificada y representación acreditada, plazo de
  5 días (regla propuesta: calendario, hora de Lima, pendiente del asesor), y estados cerrados. Generar es una lectura auditada
  (tipo de acceso `copia`); confirmar la entrega es un paso aparte.
- Toda generación queda atribuida a quien la pidió y se señala la solicitud generada sin confirmar y la verificada y entregada por
  la misma persona. Tope de 3 generaciones por solicitud.
- El compilado cubre **toda** tabla clínica: una prueba falla si una tabla nueva no está clasificada, así que cada change clínico
  aporta su sección.

## Alternativas consideradas

- **Un profesional a cargo la genera:** descartada, porque puede no haber nadie con acceso vigente y un no psicólogo no ve Psicología.
- **Un perfil con lectura total («responsable de historias»):** descartada salvo decisión expresa del usuario; reabre la tabla de
  roles y crea la cuenta más sensible del sistema.
- **Un rol de Postgres dedicado:** descartada; rompe la regla de CLAUDE.md sobre credenciales amplias en tráfico de usuario.
- **Guardar el PDF en Blob para que lo recoja otra persona:** descartada; deja un expediente completo esperando en un almacén.

## Consecuencias y decisión del usuario

- **Límite declarado:** ninguna pantalla ni consulta entrega contenido, pero el PDF y el papel pasan por el navegador y la
  impresora de recepción y quien los tenga en la mano puede leerlos. Si el usuario no lo acepta, la única salida es entregar al
  dispositivo del solicitante, lo que exige cuenta de portal y enmendar el PRD.
- No declara validez legal; qué hace «autenticada» a la copia lo decide el asesor.
- Endurecimientos opcionales no incluidos: doble control (impide operar con un solo administrativo), reverificación de sesión y aviso
  al paciente por correo.
