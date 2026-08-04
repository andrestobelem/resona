---
status: accepted
date: 2026-08-04
---

# CompositionIR v1 usa lanes explícitas para automatizar Gain

La automatización usa estas formas:

```ts
type AutomationLaneIR = IRNodeBase & Readonly<{
  type: "automation-lane";
  target: Readonly<{
    nodePath: NodePath;
    parameterId: "gain";
  }>;
  points: readonly AutomationPointIR[];
}>;

type AutomationPointIR = Readonly<{
  at: PositionIR;
  value: number;
  interpolation: "hold" | "linear";
}>;
```

## Opciones consideradas

- Permitir funciones o expresiones arbitrarias evaluadas durante el procesamiento.
- Guardar curvas genéricas sin restringir target ni semántica.
- Definir lanes cerradas, con target explícito y puntos serializables que el planificador
  compila.

Se eligió la tercera opción porque hace inspeccionable la automatización, permite validarla
antes del motor y conserva semántica independiente del tamaño de bloque.

## Consecuencias

- Una lane solo apunta al parámetro `"gain"` de un `GainIR` de su propia pista.
- Existe como máximo una lane por `{nodePath, parameterId}`.
- Una lane contiene al menos un punto.
- Los puntos conservan el orden declarado en la IR y el planificador los ordena por tiempo
  exacto.
- Tiempos exactos duplicados son inválidos; tiempos distintos que producen el mismo frame
  también fallan al compilar.
- Antes del primer punto se usa el gain base y después del último se conserva su valor.
- `interpolation` describe el segmento desde un punto hacia el siguiente y solo admite
  `hold` o `linear`.
- Los valores son finitos, no negativos y su conversión a `Float32` debe ser finita.
- Callbacks, expresiones y curvas arbitrarias quedan fuera de la IR.
- La compilación a puntos por frame e índice de procesador se fija en el
  [ADR 0075](0075-frame-resolved-gain-automation-points.md).
- La canonización numérica durante esa compilación se fija en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
