---
status: accepted
date: 2026-08-04
---

# Studio y render comparten un presupuesto numérico explícito

La paridad entre Studio y render offline se mide sobre muestras `Float32` alineadas antes de
codificar un archivo. Ambos resultados deben tener la misma cantidad de canales y frames,
ubicar eventos y transiciones en el mismo frame, y no contener `NaN` ni infinitos.

Para las muestras de Studio `s[i]` y las offline `r[i]`, el contrato inicial exige:

```text
max(abs(s[i] - r[i])) <= 1e-5
rms(s - r)             <= 1e-6
```

## Opciones consideradas

- Exigir igualdad bit a bit entre navegador y Node.
- Validar solamente equivalencia perceptual.
- Exigir igualdad estructural y temporal exacta con un presupuesto numérico pequeño y
  medible para las muestras.

Se eligió la tercera opción porque detecta drift, errores de planificación y divergencias
audibles sin convertir diferencias mínimas entre runtimes en fallas falsas.

## Consecuencias

- La suite de paridad compara buffers anteriores al encoder para no mezclar diferencias de
  contenedor o cuantización.
- Una diferencia en canales, longitud, frame de un evento o frame de una transición falla
  aunque los valores de las muestras respeten el presupuesto.
- Cualquier `NaN` o infinito falla inmediatamente.
- Las fixtures con instrumentos, efectos con estado, automatización, seek y loop deben
  cumplir ambos límites numéricos.
- Los límites pueden endurecerse con evidencia del prototipo; relajarlos requiere una nueva
  decisión explícita y documentada.
- Las fronteras numéricas canónicas compartidas por ambos motores se fijan en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md); la igualdad bit a bit solo se exige
  entre particiones en bloques dentro de un mismo runtime.
