---
status: accepted
date: 2026-08-04
---

# TSX estructura colecciones tipadas de eventos musicales

TSX declara composiciones, secuencias, pistas y clips. Las notas y otros eventos densos son
datos musicales tipados, serializables e inmutables entregados a un `EventClip`, no un
componente React por evento.

## Opciones consideradas

- Representar cada nota y control como un nodo JSX.
- Mantener formatos distintos para eventos generados e importados desde MIDI.
- Usar JSX para estructura y un único modelo de datos para eventos densos.

Se eligió la tercera opción para mantener pequeño el árbol React y hacer que composición
algorítmica, importación, planificación y tests compartan una representación.

## Consecuencias

- Un generador devuelve una colección de eventos sin necesitar React.
- Un importador MIDI normaliza al mismo modelo antes de llegar al planificador.
- `EventClip` ubica temporalmente la colección dentro de la estructura TSX.
- `CompositionIR` captura los eventos normalizados y no mensajes MIDI crudos.
- Instrumentos internos solo consumen eventos musicales.
- El primer evento público, una nota expresada como intervalo, se define en el
  [ADR 0029](0029-public-notes-are-interval-events.md).
- Los nombres concretos del clip y los helpers se validarán durante el prototipo.
