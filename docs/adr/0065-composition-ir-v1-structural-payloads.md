---
status: accepted
date: 2026-08-04
---

# CompositionIR v1 fija sus payloads estructurales

Secuencias, pistas, clips y notas usan estas formas:

```ts
type SequenceIR = IRNodeBase & Readonly<{
  type: "sequence";
  from: PositionIR;
  duration?: DurationIR;
  children: readonly (SequenceIR | TrackIR)[];
}>;

type AudioTrackIR = IRNodeBase & Readonly<{
  type: "audio-track";
  clips: readonly AudioClipIR[];
  effects: readonly EffectIR[];
  automation: readonly AutomationLaneIR[];
}>;

type InstrumentTrackIR = IRNodeBase & Readonly<{
  type: "instrument-track";
  clips: readonly EventClipIR[];
  instrument: PolySynthIR;
  effects: readonly EffectIR[];
  automation: readonly AutomationLaneIR[];
}>;

type AudioClipIR = IRNodeBase & Readonly<{
  type: "audio-clip";
  from: PositionIR;
  resource: StaticAudioReference;
  offset: AbsoluteDurationIR;
  duration?: DurationIR;
  loop: boolean;
}>;

type EventClipIR = IRNodeBase & Readonly<{
  type: "event-clip";
  from: PositionIR;
  events: readonly NoteIR[];
}>;

type NoteIR = Readonly<{
  type: "note";
  at: PositionIR;
  duration: DurationIR;
  pitch: PitchIR;
  velocity: number;
}>;
```

## Opciones consideradas

- Omitir arrays vacíos y defaults para reducir el JSON.
- Agregar IDs u ordinales serializados a cada nota.
- Materializar defaults, conservar arrays ordenados y derivar la identidad densa desde el
  clip y el índice del evento.

Se eligió la tercera opción porque produce una sola forma canónica, preserva el orden que
afecta la ejecución y evita duplicar una identidad que ya está determinada por la estructura.

## Consecuencias

- Todos los arrays están presentes aunque estén vacíos y su orden es semántico.
- `offset`, `loop` y `velocity` materializan los defaults cero, `false` y `1`.
- Solo `source` y duraciones semánticamente abiertas pueden omitirse.
- `AudioClipIR.offset` exige una duración absoluta.
- La identidad de nota deriva de la ruta del clip y su índice; `NoteIR` no tiene `id`,
  `path`, `source` ni `ordinal`.
- La raíz empieza en cero y su duración coincide con la cabecera de la composición.
- `AudioTrackIR` no admite instrumento y `InstrumentTrackIR` exige exactamente uno.
- Toda frontera que recibe una IR serializada vuelve a validar estas invariantes.
- Cabecera, tempo y pitch se fijan en el
  [ADR 0066](0066-composition-ir-v1-header-tempo-and-pitch.md).
