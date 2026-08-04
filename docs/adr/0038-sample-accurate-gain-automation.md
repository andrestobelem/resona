---
status: accepted
date: 2026-08-04
---

# La automatización de Gain tiene semántica por frame

Cada punto de automatización declara posición, valor e interpolación `hold` o `linear` hacia
el siguiente punto. La curva se evalúa por frame absoluto y no depende de la partición en
bloques.

## Opciones consideradas

- Evaluar y suavizar cambios una vez por bloque.
- Dejar implícitos los valores fuera del rango de puntos y resolver empates por orden.
- Definir la curva completa y rechazar posiciones que colisionen al convertirlas a frames.

Se eligió la tercera opción para que Studio y render compartan exactamente los mismos
límites y para que cambiar el tamaño de bloque no modifique una rampa.

## Consecuencias

- Antes del primer punto se usa el valor base de `Gain`.
- El valor de un punto comienza en su frame exacto.
- `hold` conserva el valor izquierdo y `linear` interpola hasta el siguiente.
- Después del último punto se conserva su valor.
- Los puntos se ordenan por tiempo durante la planificación.
- Dos posiciones que redondean al mismo frame producen un diagnóstico de error.
- El valor evaluado se calcula desde el frame absoluto, no acumulando pasos por bloque.
- La forma ejecutable de lanes y puntos se fija en el
  [ADR 0075](0075-frame-resolved-gain-automation-points.md).
- La interpolación y su conversión antes de aplicar `Gain` se fijan en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
