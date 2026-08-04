---
status: accepted
date: 2026-08-04
---

# CompositionIR v1 usa un vocabulario cerrado

La cabecera de `CompositionIR` v1 contiene `format`, `schemaVersion`, `compositionId`,
`duration`, `tempo`, `metadata` y una raíz `SequenceIR`. Todo nodo público implementa
`IRNodeBase` con ID, ruta canónica y ubicación fuente opcional.

```ts
type IRNodeBase = Readonly<{
  id: string;
  path: NodePath;
  source?: SourceLocation;
}>;

type SequenceChildIR = SequenceIR | TrackIR;
type TrackIR = AudioTrackIR | InstrumentTrackIR;
type InstrumentIR = PolySynthIR;
type EffectIR = GainIR | DelayIR;
```

## Opciones consideradas

- Representar toda entidad, incluida cada nota, como un nodo público extensible.
- Admitir nodos genéricos con payloads arbitrarios desde v1.
- Cerrar el vocabulario inicial y mantener los eventos densos como datos tipados dentro de
  clips estructurales.

Se eligió la tercera opción porque mantiene inspeccionable la estructura sin inflar el árbol
con una entidad por evento ni permitir payloads que Studio y el planificador no puedan
validar exhaustivamente.

## Consecuencias

- `SequenceIR` contiene otras secuencias o pistas.
- `AudioTrackIR` contiene `AudioClipIR` y no admite instrumento.
- `InstrumentTrackIR` contiene `EventClipIR` y exactamente un `PolySynthIR`.
- Ambas pistas pueden contener una cadena ordenada de `GainIR | DelayIR` y lanes de
  automatización.
- Una lane apunta a un parámetro mediante `{nodePath, parameterId}`.
- Las notas viven como datos dentro de `EventClipIR` y no tienen ID ni ubicación fuente
  pública individual.
- `AudioClipIR` conserva una `StaticAudioReference`; el hash pertenece al plan resuelto.
- No existe un discriminante genérico de extensión. Agregar nodos exige otra versión del
  schema y una migración explícita.
- La representación temporal se fija en el
  [ADR 0064](0064-canonical-rational-time-in-composition-ir.md); los demás payloads se fijarán
  por separado.
- Los payloads de secuencias, pistas, clips y notas se fijan en el
  [ADR 0065](0065-composition-ir-v1-structural-payloads.md).
- `NodePath` y `SourceLocation` se fijan en el
  [ADR 0077](0077-canonical-node-paths-and-source-locations.md).
