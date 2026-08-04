---
status: accepted
date: 2026-08-04
---

# La API pública usa valores temporales tipados

Posiciones y duraciones se representan como tipos distintos, inmutables, discriminados y
serializables. La API TypeScript los construye mediante helpers y no acepta números ni
strings crudos en props temporales.

## Opciones consideradas

- Usar números y documentar una unidad implícita por prop.
- Usar strings musicales o absolutos directamente en toda la API.
- Construir valores tipados en TypeScript y parsear strings solo en adaptadores de borde.

Se eligió la tercera opción porque mantiene una autoría legible sin permitir que posición,
duración o unidad se confundan silenciosamente dentro del modelo.

## Consecuencias

- Helpers separados construyen posiciones y duraciones.
- Ambos tipos conservan su unidad y admiten serialización sin perder significado.
- TSX rechaza números y strings crudos para valores temporales.
- CLI y configuración pueden parsear formas como `5:1:0` antes de invocar el dominio.
- Los nombres exactos de los helpers se ajustarán con pruebas de uso del prototipo.
- El planificador continúa normalizando una sola vez a frames de muestras enteros.
