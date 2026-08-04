---
status: accepted
date: 2026-08-04
---

# Las composiciones se descubren mediante un root explícito

Un entry point de Resona llama a `registerRoot()` y el root declara una o más composiciones.
Studio, API y CLI evalúan ese mismo registro, en lugar de escanear archivos o consumir un
manifest mantenido por separado.

## Opciones consideradas

- Descubrir composiciones por convención y escaneo del filesystem.
- Mantener un manifest declarativo separado del código de autoría.
- Registrar explícitamente un root ejecutable que declare las composiciones.

Se eligió la tercera opción porque ofrece descubrimiento determinista, conserva una sola
fuente de verdad y permite que abstracciones de TypeScript produzcan composiciones sin
ocultarlas a las herramientas.

## Consecuencias

- Cada composición tiene un ID estable y único dentro del proyecto.
- Cada declaración asocia el ID con un componente TSX, schema, inputs por defecto y metadata
  musical.
- Evaluar el root registra descripciones; no ejecuta DSP.
- Todas las superficies deben consumir el mismo resultado de registro.
- La firma TypeScript exacta de `registerRoot()` y `Composition` todavía debe diseñarse.
