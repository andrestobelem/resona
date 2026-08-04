---
status: accepted
date: 2026-08-04
---

# Una sola Track expone slots de señal tipados

La interfaz TSX de Resona usa una sola `Track` con una fuente, un instrumento opcional según
el tipo de fuente y una cadena ordenada de efectos. Sus props forman una unión discriminada
que representa las dos rutas de señal del MVP.

## Opciones consideradas

- Interpretar todos los hijos de `Track` como un pipeline posicional.
- Publicar componentes separados `AudioTrack` e `InstrumentTrack`.
- Mantener una sola `Track` con slots tipados y una cadena explícita.

Se eligió la tercera opción porque conserva el concepto profundo de pista, hace visible el
routing y permite rechazar estáticamente las combinaciones inválidas más importantes.

## Consecuencias

- Una fuente de audio prohíbe el slot `instrument`.
- Una fuente de eventos exige un instrumento que produzca señal de audio.
- El slot de fuente contiene uno o más clips de un único dominio.
- Los clips de audio superpuestos se mezclan y los eventos superpuestos se ordenan de forma
  determinista antes de continuar la cadena.
- Mezclar directamente fuentes de audio y eventos en una misma pista queda fuera del MVP.
- `chain()` construye la cadena de efectos y conserva su orden declarado.
- La automatización referencia el ID de un parámetro perteneciente a un nodo identificado.
- La compilación valida nuevamente los árboles dinámicos y produce diagnósticos con ruta y
  ubicación fuente.
- La sintaxis concreta para agrupar múltiples clips todavía debe definirse.
