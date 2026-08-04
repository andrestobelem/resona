---
status: accepted
date: 2026-08-04
---

# Publicar un render es atómico y sobrescribir es explícito

El renderer falla si el destino existe salvo `overwrite` explícito. Escribe un temporal en
el mismo directorio y solo lo renombra después de cerrar y validar el WAV; recién entonces
informa éxito.

## Opciones consideradas

- Sobrescribir siempre el destino a medida que se renderiza.
- Elegir automáticamente otro nombre cuando el destino existe.
- Exigir autorización de overwrite y publicar desde un temporal validado.

Se eligió la tercera opción para proteger artefactos existentes y asegurar que un path final
nunca represente por accidente un render parcial.

## Consecuencias

- API usa `overwrite: true` y CLI usa `--overwrite`.
- El temporal vive en el directorio del destino para permitir rename local.
- Header, longitud y tamaño se validan antes de publicar.
- Cancelación y falla eliminan el temporal después de cerrarlo.
- El resultado exitoso se emite después del rename, no al terminar el último bloque DSP.
- La implementación debe documentar límites de atomicidad del filesystem y plataforma.
