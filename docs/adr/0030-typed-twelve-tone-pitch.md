---
status: accepted
date: 2026-08-04
---

# Pitch es un valor tipado de doce tonos

El MVP representa pitch mediante un valor discriminado cuya forma canónica es una cantidad
entera de semitonos respecto de `A4 = 440 Hz`. Usa afinación temperada de doce tonos.

## Opciones consideradas

- Usar directamente números de nota MIDI.
- Usar strings con nombres de notas como representación interna.
- Usar un valor propio de pitch y adaptar nombres científicos y MIDI en el borde.
- Diseñar desde el inicio un sistema general de afinaciones y microtonalidad.

Se eligió la tercera opción para no acoplar el dominio a MIDI ni al parsing de strings, sin
incorporar todavía la complejidad de afinaciones arbitrarias.

## Consecuencias

- `pitch.note("C4")` y `pitch.midi(60)` producen el mismo `Pitch`.
- La notación textual usa el convenio científico en el borde.
- El motor convierte semitonos a frecuencia bajo `A4 = 440 Hz`.
- La representación rechaza fracciones de semitono en el MVP.
- Frecuencias arbitrarias, detune y afinaciones microtonales quedan fuera de alcance.
- Incorporar otra afinación exigirá un contrato explícito y no reinterpretará valores
  existentes silenciosamente.
- La validación de la frecuencia ejecutable se fija en el
  [ADR 0074](0074-pitch-frequency-must-be-below-nyquist.md).
