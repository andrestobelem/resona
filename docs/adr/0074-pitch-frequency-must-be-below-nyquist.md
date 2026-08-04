---
status: accepted
date: 2026-08-04
---

# La frecuencia de un pitch debe ser menor que Nyquist

`PitchIR` conserva cualquier entero seguro de semitonos respecto de A4 y no adopta el rango
MIDI. Al planificar, Resona exige que ese valor produzca una frecuencia representable por el
perfil de ejecución.

La conversión canónica es:

```ts
const frequencyHz = 440 * 2 ** (semitonesFromA4 / 12);
```

## Opciones consideradas

- Permitir cualquier resultado finito y aceptar aliasing por encima de Nyquist.
- Limitar, plegar o transponer automáticamente frecuencias fuera del rango ejecutable.
- Rechazar resultados no positivos, no finitos o iguales o superiores a Nyquist.

Se eligió la tercera opción. Evita reinterpretaciones silenciosas y mantiene al oscilador y
su corrección PolyBLEP dentro del dominio representable por el sample rate elegido.

## Consecuencias

- La frecuencia debe ser finita, estrictamente positiva y menor que `sampleRate / 2`.
- Con `sampleRate: 48_000`, debe ser menor que `24_000 Hz`.
- El mayor `semitonesFromA4` entero aceptado es `+69`; `+70` ya supera Nyquist.
- No existe un límite musical inferior arbitrario. Las frecuencias subaudibles son válidas
  mientras el cálculo siga produciendo un número finito y positivo.
- Un resultado inválido produce un diagnóstico; no se aplica clamp, folding, wrapping ni
  transposición.
- La validación ocurre antes de podar notas, incluso si una nota no sobrevivirá al plan.
- Una única función compartida implementa la fórmula para el planificador y el núcleo DSP.
- Esta restricción depende del perfil de ejecución, no cambia la representación de
  `PitchIR` ni introduce identidad MIDI.
