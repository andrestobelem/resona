---
status: accepted
date: 2026-08-04
---

# El DSP redondea en fronteras Float32 explícitas

El plan y el motor comparten una operación canónica para convertir valores de audio a
`Float32` y eliminar la representación de cero negativo:

```ts
const canonicalF32 = (value: number): number => {
  const rounded = Math.fround(value);
  return Object.is(rounded, -0) ? 0 : rounded;
};

const isCanonicalF32 = (value: number): boolean =>
  Number.isFinite(value) && Object.is(value, canonicalF32(value));
```

Después de validar la `CompositionIR`, la planificación usa esta operación para `gain`,
`sustain`, `feedback`, `mix`, velocity y valores de automatización. Después de redondear
vuelve a validar finitud y rango; un valor que solo deja de ser válido por el redondeo
también falla.

## Opciones consideradas

- Mantener todo en `Float64` y convertir a `Float32` únicamente antes del encoder.
- Aplicar `Math.fround()` después de cada operación aritmética y a todo estado de control.
- Usar `Float64` para fórmulas locales y estado de control, con fronteras `Float32`
  explícitas para el plan, las señales, el estado de audio y cada aporte a una suma.

Se eligió la tercera opción. Hace observable y comprobable dónde ocurre cada redondeo sin
cuantizar innecesariamente fase, envolventes o cálculos intermedios, y mantiene la semántica
independiente de cómo un adaptador divida el audio en bloques.

## Consecuencias

- El `ExecutionPlan` contiene parámetros que satisfacen `isCanonicalF32()` y vuelve a
  comprobar sus invariantes después del redondeo. Esto excluye `-0`; por ejemplo, un
  `feedback` que redondee a `1` es inválido.
- Las entradas y salidas de procesadores, los buffers de audio de `Delay` y las muestras
  finales anteriores al encoder se escriben como `Float32` canónicos.
- Cada fórmula DSP usa operaciones `Float64` de JavaScript para sus términos locales y
  redondea una vez al escribir una salida o estado de audio.
- La fase del oscilador y el cálculo de la envolvente permanecen en `Float64`; esto evita,
  entre otros problemas, que una frecuencia subaudible deje de avanzar por cuantización.
- Cada voz, región o ruta aporta en su orden canónico mediante
  `acc = canonicalF32(acc + sample)`. `PolySynth` recorre sus slots de voz de cero a
  `maxVoices - 1`; reutilizar un slot no lo reordena. El orden y cada frontera de redondeo
  forman parte del resultado.
- La automatización lineal se evalúa desde el frame absoluto en `Float64` y se convierte a
  `Float32` antes de aplicar `Gain`.
- Toda escritura canónica normaliza `-0` a `+0`.
- La preparación convierte cada muestra WAV decodificada a `Float32` canónico y rechaza
  `NaN` o infinitos.
- El motor valida el resultado antes de cada escritura canónica. Un valor no finito detiene
  la ejecución en el primer frame absoluto afectado; los empates se resuelven por índice de
  procesador, canal y ordinal de escritura dentro del procesador. El valor no finito no se
  almacena: el motor descarta su estado y el bloque pendiente, no permite reanudar esa
  ejecución y el render no publica un artefacto parcial. No se reemplaza ni se limita.
- Las muestras finitas fuera de `[-1, 1]` son válidas y no reciben clamp implícito.
- En un mismo runtime, procesar el mismo plan con particiones de bloques distintas debe
  producir los mismos bits.
- Navegador y Node aplican estas mismas fronteras, pero su paridad se evalúa con el
  presupuesto del [ADR 0058](0058-studio-render-numeric-parity-budget.md), no mediante
  igualdad bit a bit.
