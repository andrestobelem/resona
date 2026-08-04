---
status: accepted
date: 2026-08-04
---

# SHA-256 identifica los bytes fuente de un asset

Un recurso resuelto usa SHA-256 sobre los bytes exactos del WAV y expresa su identidad como
`sha256:<hex minúsculo>`. Un trabajo conserva los buffers decodificados que verificó durante
su preparación.

## Opciones consideradas

- Identificar por path, tamaño y fecha de modificación.
- Hashear el PCM decodificado para identificar equivalencia audible.
- Hashear los bytes fuente y versionar por separado la decodificación.

Se eligió la tercera opción porque detecta toda mutación del archivo con una implementación
estándar y permite que cambios del decoder se expresen sin redefinir el contenido fuente.

## Consecuencias

- Dos WAV byte a byte distintos tienen hashes distintos aunque decodifiquen al mismo PCM.
- Tamaño y `mtime` son optimizaciones de invalidación, no identidad.
- El caché decodificado usa hash, versión del decoder y formato interno.
- `RenderJob` retiene buffers ya verificados y no vuelve a leer el path durante ejecución.
- Modificar un archivo no cambia un trabajo existente; una nueva preparación obtiene otro
  hash.
- El fingerprint de render incluye estos hashes mediante `RenderSpec`.
- El descriptor direccionado por contenido del plan se fija en el
  [ADR 0071](0071-content-addressed-resources-and-audio-regions.md).
