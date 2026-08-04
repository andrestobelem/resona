---
status: accepted
date: 2026-08-04
---

# Los rangos de render son finitos y semiabiertos

Todo render de Resona emite un rango finito `[inicio, fin)`. Por defecto, ese rango va desde
cero hasta la duración nominal de la composición; un trabajo puede solicitar otro rango de
forma explícita.

## Opciones consideradas

- Renderizar siempre toda la duración nominal.
- Aceptar rangos sin fijar una convención inclusiva o exclusiva.
- Usar rangos finitos semiabiertos con preroll y cola definidos por separado.

Se eligió la tercera opción porque permite renders parciales sin ambigüedad en los límites y
preserva el estado previo necesario para instrumentos y efectos.

## Consecuencias

- La muestra correspondiente al inicio se incluye y la correspondiente al fin no.
- Un rango que comienza después de cero reconstruye estado mediante preroll silencioso desde
  el inicio de la composición.
- La duración emitida por el rango no incluye el preroll.
- Una cola explícita se procesa y agrega después del fin solicitado.
- Una composición sin final intrínseco también puede renderizarse si el trabajo proporciona
  un rango finito.
