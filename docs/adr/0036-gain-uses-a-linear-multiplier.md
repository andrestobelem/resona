---
status: accepted
date: 2026-08-04
---

# Gain usa un multiplicador lineal

El parámetro semántico de `Gain` es un multiplicador lineal finito y no negativo cuya
conversión a `Float32` también debe ser finita. Su default es `1`; cero silencia y los
valores mayores que uno amplifican.

## Opciones consideradas

- Usar dB como dominio canónico del procesador y la automatización.
- Admitir valores lineales y dB sin fijar dónde se interpola.
- Normalizar toda entrada a un multiplicador lineal antes de planificar.

Se eligió la tercera opción para que el DSP y la interpolación tengan una única semántica,
manteniendo dB como una comodidad explícita de autoría.

## Consecuencias

- `gain.db()` convierte a un multiplicador durante la planificación.
- La automatización interpola en el dominio lineal aun cuando use helpers de dB.
- Valores negativos, no finitos o cuya conversión a `Float32` no sea finita fallan la
  validación de IR.
- `Gain` multiplica cada canal de forma independiente con el mismo valor.
- El procesador no aplica clipping ni limiting.
- Clipping, saturación y limiting requieren procesadores separados.
- La canonización del multiplicador y el redondeo de la salida se fijan en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
