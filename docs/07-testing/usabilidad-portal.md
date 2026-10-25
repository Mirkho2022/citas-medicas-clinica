# Prueba de usabilidad del portal del paciente

Protocolo de la prueba que exige la spec `usabilidad-y-accesibilidad-del-portal` del change `portal-del-paciente` («La usabilidad con personas mayores
se prueba antes de dar el portal por listo») y registro de sus resultados. El portal es lo que mueve la métrica del PRD de 75 % de citas reservadas o
canceladas por el propio paciente: si una persona mayor no lo usa sin ayuda, la métrica no se cumple.

## Estado

| | |
|---|---|
| **Prueba con personas** | ⏳ **PENDIENTE: no se ha ejecutado.** Hay que reclutar al menos cinco personas de 60 años o más (ver «Reclutamiento»). |
| **Bloquea** | Abrir el portal a **pacientes reales**. No bloquea el desarrollo ni los datos sintéticos de demostración. |
| **Alternativa usada mientras tanto** | Evidencia automática de los pasos y del uso con teclado (más abajo). **No sustituye** a la prueba: mide cuántos toques, no si una persona entiende qué hacer. |

### Evidencia automática disponible (no es la prueba)

| Criterio de la spec | Cómo se comprueba hoy | Dónde |
|---|---|---|
| Reservar desde «Inicio» en 5 elecciones como máximo | E2E que cuenta las elecciones (especialidad, médico, día, horario y confirmar) | `e2e/portal-reserva.spec.ts` |
| Cancelar desde «Mis citas» en 2 toques como máximo (cancelar y confirmar) | E2E de cancelación | `e2e/portal-cancelacion.spec.ts` |
| Sin desplazamiento horizontal a 320 y 390 px; objetivos táctiles de 44 px (48 px la acción principal) | E2E de diseño adaptable | `e2e/portal-responsive.spec.ts` |
| Reserva completa solo con teclado, con el foco visible y en el título de cada paso | E2E de diseño adaptable | `e2e/portal-responsive.spec.ts` |
| Sin violaciones WCAG 2.1 A y AA en cada pantalla y estado | axe | `e2e/portal-accesibilidad.spec.ts` |

## Qué se prueba

Tres tareas, cada una **sin ayuda** de quien modera:

1. **Registrarse:** crear la cuenta, completar «Complete su registro» con su documento y llegar a «Inicio».
2. **Reservar una cita:** desde «Inicio», reservar una cita con un médico de una especialidad a elección, a 14 días o más.
3. **Cancelar una cita:** desde «Mis citas», cancelar la cita que acaba de reservar.

### Criterio de éxito

Cada tarea la completan **sin ayuda al menos 4 de cada 5 personas**. Una tarea cuenta como completada sin ayuda si la persona llega al estado final
(ficha creada y «Inicio» a la vista; «Su cita quedó reservada»; «Su cita fue cancelada») sin que quien modera diga qué tocar, qué escribir ni dónde está algo.
Una pista general («¿qué haría usted ahora?») no cuenta como ayuda; señalar un botón sí.

### Reclutamiento

- Al menos **cinco** personas de 60 años o más, que usen un teléfono propio y **no** sean parte del equipo ni conozcan el sistema. Conviene que haya
  variedad: quien usa el teléfono todos los días y quien solo lo usa para llamar y para mensajes; quien lleva anteojos; quien no escribe con comodidad.
- Cada persona usa **su propio teléfono** (o uno de la clínica con el que se sienta cómoda), con el navegador que use habitualmente.
- Se explica que se prueba el sistema y no a la persona, y se pide su consentimiento para tomar notas y, si lo permite, grabar la pantalla. No se
  registra su nombre, DNI ni teléfono en este documento: solo un código (P1 a P5), edad aproximada y la experiencia con el teléfono.
- **Datos:** solo sintéticos. La prueba se hace en el preview con una cuenta de prueba por persona o con un correo que la persona crea al momento; el
  documento que escriba es uno de la lista de documentos de prueba (rango `98…`), **nunca el suyo**.

## Guion

Quien modera lee el texto de cada tarea tal cual, no explica la pantalla y anota con un cronómetro.

> «Imagine que quiere sacar una cita en la clínica por el teléfono, sin llamar. Voy a pedirle que lo intente. Piense en voz alta: diga qué ve, qué
> espera que pase y qué le confunde. No hay respuestas buenas ni malas; si algo no se entiende, es culpa del sistema, no suya.»

| Tarea | Lo que se le dice | Estado final |
|---|---|---|
| Registrarse | «Abra esta dirección y cree una cuenta para usted.» | «Inicio» con su nombre |
| Reservar | «Quiere una cita de [especialidad] dentro de dos semanas. Resérvela.» | «Su cita quedó reservada» |
| Cancelar | «Ahora no podrá asistir a esa cita. Cancélela.» | «Su cita fue cancelada» |

Si pasan **3 minutos** en una pantalla sin avanzar, o piden ayuda dos veces, se anota «con ayuda» y se muestra el siguiente paso para poder seguir con
la tarea siguiente.

Al final, tres preguntas: *¿qué fue lo más difícil?*, *¿qué cambiaría?*, *¿lo usaría para sacar su próxima cita?*

### Qué se anota por persona y tarea

Completó sin ayuda (sí / no / con ayuda), tiempo, errores (toques equivocados, mensajes de error que vio), dudas dichas en voz alta, pantalla donde se
detuvo y gravedad de cada hallazgo.

**Gravedad:** *alta* = no pudo completar la tarea o se equivocó sin darse cuenta (por ejemplo, reservar con el médico que no era);
*media* = completó con dudas o con un error recuperable; *baja* = molestia o sugerencia. Los hallazgos de gravedad alta se corrigen antes de abrir
el portal; los demás se registran y se priorizan.

## Plantilla de registro

Copiar una tabla por persona.

**P_ — edad aproximada: __ — uso del teléfono: __ — fecha: __**

| Tarea | ¿Sin ayuda? | Tiempo | Errores y dudas | Pantalla donde se detuvo | Gravedad |
|---|---|---|---|---|---|
| Registrarse | | | | | |
| Reservar | | | | | |
| Cancelar | | | | | |

Respuestas finales: ____

## Resultados

| Tarea | Sin ayuda (de 5) | Criterio (4 de 5) | Hallazgos de gravedad alta | Corrección |
|---|---|---|---|---|
| Registrarse | — | ⏳ pendiente | — | — |
| Reservar | — | ⏳ pendiente | — | — |
| Cancelar | — | ⏳ pendiente | — | — |

*Sin resultados todavía.* Cuando se ejecute: rellenar esta tabla, registrar cada hallazgo con su gravedad y enlazar el commit o PR que lo corrige, y
cambiar el estado de arriba. Si una tarea no llega a 4 de 5, queda con un plan de corrección y se repite la prueba con otras personas.
