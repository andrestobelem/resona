---
status: accepted
date: 2026-08-04
---

# Las coordenadas temporales públicas tienen unidad explícita

La API pública de Resona admite tanto posiciones musicales —barras, pulsos y
subdivisiones— como posiciones absolutas —segundos o frames de muestras— mediante tipos con
unidad explícita. Antes de ejecutar, todas se resuelven a frames de muestras enteros.

## Opciones consideradas

- Expresar todo únicamente en posiciones musicales.
- Expresar todo únicamente en segundos o frames de muestras.
- Admitir ambas familias mediante tipos explícitos y normalizarlas antes de ejecutar.

Se eligió la tercera opción porque la estructura musical necesita seguir el mapa de tempo,
mientras que offsets y operaciones sobre audio necesitan coordenadas absolutas precisas.

## Consecuencias

- Un número sin unidad no representa una posición ni una duración temporal pública.
- Cambiar el mapa de tempo desplaza posiciones musicales, pero no posiciones absolutas.
- El plan de ejecución usa frames de muestras enteros como coordenada canónica.
- Las posiciones musicales comienzan en `1:1:0`: barras y pulsos se indexan desde 1 y
  subdivisiones desde 0; los frames de muestras absolutos comienzan en 0.
- La representación pública se define en el
  [ADR 0027](0027-typed-temporal-values-at-the-public-api.md); el redondeo está definido en el
  [ADR 0009](0009-rational-musical-time.md).
