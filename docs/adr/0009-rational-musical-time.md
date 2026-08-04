---
status: accepted
date: 2026-08-04
---

# El tiempo musical normalizado es racional

Después de resolver barras y pulsos, Resona representa internamente cada posición musical
como una fracción exacta de notas negras. La conversión a frames de muestras enteros ocurre
una sola vez al compilar el plan de ejecución.

## Opciones consideradas

- Convertir temprano a segundos en punto flotante.
- Usar una grilla fija de ticks por nota negra.
- Conservar una fracción exacta hasta la frontera del plan de ejecución.

Se eligió la tercera opción para evitar error acumulado, representar tuplets sin depender de
una resolución fija y mantener el núcleo independiente del PPQ de archivos MIDI.

## Consecuencias

- Barras, pulsos y subdivisiones se resuelven contra la métrica antes de obtener la fracción
  normalizada.
- Cada adaptador MIDI convierte desde su propia resolución hacia el tiempo racional.
- El plan de ejecución no recibe posiciones musicales ambiguas: recibe frames de muestras
  enteros.
- Una fracción de muestra se redondea al entero más cercano y un empate exacto elige el
  frame par; todas las fronteras temporales usan la misma función.
- La forma serializable concreta de la IR se define en el
  [ADR 0064](0064-canonical-rational-time-in-composition-ir.md).
