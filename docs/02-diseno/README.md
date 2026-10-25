# Diseño aprobado de la interfaz

Material de la revisión visual aprobada el 2026-10-18. Se lee en este orden:

1. [BRIEF-DISENO.md](BRIEF-DISENO.md): qué se aprobó, las pantallas, las reglas visibles, los componentes nuevos y el
   movimiento. **Empiece aquí.**
2. [../DESIGN.md](DESIGN.md): el sistema de diseño (colores, tipografía, formas). Fuente de verdad de lo visual.
3. [lienzo/](lienzo/): los archivos fuente de las nueve láminas interactivas.

## El lienzo

| Archivo (`lienzo/project/`) | Contenido |
|---|---|
| `Main.dc.html` | Fundamentos: colores, tipografía, formas y profundidad |
| `Componentes.dc.html` | Botones, campos, alertas, insignias, selector de horario, navegación, estados de carga |
| `Movimiento.dc.html` | Laboratorio de transiciones (cámara lenta y «Reducir movimiento») |
| `Portal-Inicio.dc.html`, `Portal-Reservar.dc.html`, `Portal-MisCitas.dc.html` | Portal del paciente, móvil 390 px |
| `Consola-Agenda.dc.html`, `Consola-Pacientes.dc.html` | Consola del personal, escritorio 1280 px |
| `Medico-Atencion.dc.html` | Atención del médico (contenido clínico provisional) |
| `clinica.css` | Hoja compartida del lienzo: tokens de DESIGN.md y el movimiento aprobado |
| `canvas.json` | Índice del lienzo: posición y tamaño de cada lámina y notas |
| `ds/clinica/tokens.json` | Copia de los tokens del «Sistema de diseño Clínica» usado en el lienzo |

### Cómo verlo

Los archivos `.dc.html` **no se abren sueltos en un navegador**: necesitan el motor de Claude Design (`support.js`), que no va
en el repositorio. Las opciones son:

- **Lienzo publicado** (privado, solo su dueño): <https://claude.ai/artifact/RhWLjNkZwT2Qiz9aW2nKSs>. Es la versión de referencia
  para revisar y comentar.
- **Restaurarlo** en otra cuenta o si se pierde: crear un lienzo nuevo de tipo Design en Claude Design y publicar en él los
  archivos de `lienzo/project/` con las mismas rutas (la misma estructura que el lienzo original).

### Cómo actualizarlo

Los cambios de diseño se hacen **primero en el lienzo** y se vuelven a copiar aquí, para que el repositorio y el lienzo no se
separen. Una pantalla ya implementada se considera fuente de verdad solo para su comportamiento: si cambia el aspecto en la
aplicación, se actualiza DESIGN.md y se regenera con `npm run tema` (no al revés).

### Qué NO es

- No es código de la aplicación: `clinica.css` y los `.dc.html` no se importan desde `app/` ni `components/`. La aplicación usa
  Tailwind, shadcn/ui y los tokens de `app/tema.generado.css`.
- No contiene datos reales: todo es ficticio (documentos `99…`, correos `@demo.invalid`).
