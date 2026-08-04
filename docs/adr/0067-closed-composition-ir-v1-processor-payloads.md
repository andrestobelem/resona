---
status: accepted
date: 2026-08-04
---

# CompositionIR v1 fija payloads cerrados de procesadores

Instrumento y efectos usan estas formas:

```ts
type PolySynthIR = IRNodeBase & Readonly<{
  type: "poly-synth";
  maxVoices: number;
  oscillator: "sine" | "saw" | "square";
  envelope: Readonly<{
    attack: AbsoluteDurationIR;
    decay: AbsoluteDurationIR;
    sustain: number;
    release: AbsoluteDurationIR;
  }>;
}>;

type GainIR = IRNodeBase & Readonly<{
  type: "gain";
  gain: number;
}>;

type DelayIR = IRNodeBase & Readonly<{
  type: "delay";
  time: AbsoluteDurationIR;
  feedback: number;
  mix: number;
}>;
```

## Opciones consideradas

- Usar un nodo genérico de procesador con `params: Record<string, unknown>`.
- Omitir defaults y resolverlos recién al compilar el plan.
- Definir una unión exhaustiva cuyos valores ya estén completos y validados.

Se eligió la tercera opción para que Studio y el planificador puedan inspeccionar y validar
cada procesador exhaustivamente sin un registro dinámico ni otra fase de defaults ocultos.

## Consecuencias

- Todos los defaults del sintetizador, envolvente y efectos están materializados en la IR.
- `maxVoices` es un entero seguro positivo.
- Attack, decay y release son duraciones absolutas no negativas; sustain pertenece a
  `[0, 1]`.
- `gain` es finito, no negativo y su conversión a `Float32` también debe ser finita.
- Delay exige tiempo positivo, `feedback` en `[0, 1)` y `mix` en `[0, 1]`.
- El parámetro automatizable de `GainIR` se identifica como `"gain"`.
- Delay no admite automatización en v1.
- No existen parámetros desconocidos: agregar campos o procesadores requiere evolucionar el
  schema.
- La forma de automatizar `GainIR.gain` se fija en el
  [ADR 0068](0068-explicit-gain-automation-lanes-in-composition-ir.md).
- La canonización de parámetros al compilar el plan se fija en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
