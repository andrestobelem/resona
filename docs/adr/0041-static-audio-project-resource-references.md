---
status: accepted
date: 2026-08-04
---

# staticAudio referencia el directorio estático del proyecto

`staticAudio()` crea una referencia serializable a un WAV dentro del directorio estático del
proyecto, cuyo default es `public/`. La ruta lógica no depende del directorio de trabajo y
no constituye la identidad de los bytes.

## Opciones consideradas

- Aceptar cualquier path del filesystem y resolverlo contra el `cwd`.
- Resolver paths relativos al archivo TypeScript que invoca el helper.
- Usar una raíz estática explícita al estilo de Remotion.
- Incorporar desde el inicio imports de assets y resolvers extensibles.

Se eligió la tercera opción por su portabilidad entre Studio y Node, su representación
serializable y su frontera de seguridad simple para el primer proyecto local.

## Consecuencias

- `staticAudio("drums/loop.wav")` no carga ni decodifica bytes.
- La raíz estática tiene default `public/` y se resuelve desde el proyecto, nunca desde `cwd`.
- Paths absolutos, vacíos o que escapen mediante `..` fallan la validación.
- Studio y renderer resuelven la misma referencia mediante adaptadores locales.
- La variante resuelta reemplaza identidad por path por un hash de contenido verificado.
- Assets de paquetes y resolvers personalizados quedan fuera del MVP.
- La forma versionada usada también en inputs se define en el
  [ADR 0047](0047-versioned-static-audio-input-reference.md).
- Toda referencia se resuelve antes de podar contenido fuera de rango según el
  [ADR 0072](0072-validate-before-pruning-execution-plan.md).
