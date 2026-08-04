---
status: accepted
date: 2026-08-04
---

# ExecutionPlan v1 expande notas a attacks y releases densos

Cada `NoteIR` válida se convierte en un par de eventos internos dirigido a `PolySynth`. Los
nombres attack y release distinguen este stream ejecutable de los mensajes MIDI de borde.

```ts
type NoteOccurrenceIndex = number;

type InstrumentEventPlan =
  | Readonly<{
      type: "note-release";
      frame: number;
      instrument: ProcessorIndex;
      occurrence: NoteOccurrenceIndex;
    }>
  | Readonly<{
      type: "note-attack";
      frame: number;
      instrument: ProcessorIndex;
      occurrence: NoteOccurrenceIndex;
      semitonesFromA4: number;
      velocity: number;
    }>;
```

## Opciones consideradas

- Conservar notas como intervalos y hacer que cada motor las expanda durante la ejecución.
- Publicar mensajes MIDI `note-on` y `note-off` como eventos internos.
- Compilar un stream propio y totalmente ordenado de attacks y releases.

Se eligió la tercera opción. El planificador resuelve una sola vez clipping, redondeo,
identidad y orden, mientras que todos los motores consumen exactamente el mismo stream sin
incorporar semántica MIDI.

## Consecuencias

- Toda `NoteIR` tiene duración exacta estrictamente positiva y se valida antes de podarla.
- Cada evento referencia un `instrument` válido cuyo procesador es `poly-synth`.
- Frame, instrumento y ocurrencia son enteros seguros no negativos.
- Cada ocurrencia conservada tiene exactamente un attack y un release dirigidos al mismo
  instrumento, con `attack.frame < release.frame`.
- Los índices de ocurrencia son densos desde cero, locales al plan y se asignan según ruta
  canónica de `EventClipIR` y ordinal original entre notas sobrevivientes.
- `semitonesFromA4` es un entero seguro con signo. `velocity` es finita y pertenece a
  `[0, 1]`; en el plan también es `Float32` canónico. Cero representa un attack musical
  silencioso, no un mensaje MIDI especial.
- Cada pitch debe producir una frecuencia ejecutable válida según el
  [ADR 0074](0074-pitch-frequency-must-be-below-nyquist.md).
- El final efectivo de una nota es el menor entre su final natural, sus secuencias activas y
  `nominalDurationFrames`.
- Un attack siempre ocurre antes de `nominalDurationFrames`; un release puede ocurrir
  exactamente allí para iniciar una cola audible.
- Una nota cuyo inicio exacto queda fuera del intervalo activo se omite.
- Si un intervalo exacto positivo sobrevive pero sus extremos redondean al mismo frame, se
  omite el par y se emite una advertencia agregada por clip.
- `events` se ordena por frame, release antes de attack y ocurrencia ascendente. Los motores
  no reordenan la tabla.
- Todos los eventos de un frame se aplican antes de generar su muestra.
- Al robar una voz, el sintetizador elimina la asociación anterior. El release posterior de
  esa ocurrencia no afecta la voz reutilizada.
- El rango particular de render no poda `events`; seek y rangos parciales reconstruyen el
  estado mediante preroll.
