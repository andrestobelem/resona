---
status: accepted
date: 2026-08-04
---

# CompositionIR v1 fija cabecera, tempo y pitch

La cabecera y los valores musicales escalares usan estas formas:

```ts
type CompositionIR = Readonly<{
  format: "resona/composition-ir";
  schemaVersion: 1;
  compositionId: string;
  duration: DurationIR;
  tempo: TempoIR;
  metadata: JsonObject;
  root: SequenceIR;
}>;

type TempoIR = Readonly<{
  type: "constant-tempo";
  bpm: RationalIR;
  timeSignature: Readonly<{
    beatsPerBar: number;
    beatUnit: number;
  }>;
}>;

type PitchIR = Readonly<{
  type: "twelve-tet";
  semitonesFromA4: number;
}>;
```

## Opciones consideradas

- Conservar BPM de punto flotante, métrica como tupla y pitch como nota MIDI.
- Incorporar desde v1 un mapa de tempo y afinaciones extensibles.
- Usar valores semánticos explícitos, exactos y cerrados para el alcance inicial.

Se eligió la tercera opción porque evita ambigüedad posicional en la métrica y acoplamiento a
MIDI, conserva exactitud temporal y deja visibles las extensiones que exigirán evolución del
schema.

## Consecuencias

- `bpm` es una fracción racional positiva y distinta de cero.
- `beatsPerBar` es un entero seguro positivo.
- `beatUnit` es un entero seguro positivo y potencia de dos.
- `semitonesFromA4` es un entero seguro con signo y no adopta el rango MIDI.
- El límite dependiente del sample rate se valida al planificar según el
  [ADR 0074](0074-pitch-frequency-must-be-below-nyquist.md).
- `metadata` siempre es un objeto JSON, aunque no contenga claves.
- La raíz comienza en cero y su duración coincide con `CompositionIR.duration`.
- Cambios de tempo, cambios de métrica y afinaciones distintas de 12-TET requieren otra
  versión del schema.
- Los payloads de instrumento y efectos se fijan en el
  [ADR 0067](0067-closed-composition-ir-v1-processor-payloads.md).
