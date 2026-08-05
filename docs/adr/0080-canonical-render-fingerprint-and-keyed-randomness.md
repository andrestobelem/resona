---
status: accepted
date: 2026-08-05
---

# Fingerprint y aleatoriedad usan SHA-256 sobre JSON canónico

`RenderSpec` versión 1 se serializa recursivamente como JSON sin espacios: las claves de
objetos se ordenan lexicográficamente, el orden de arrays se conserva y los primitivos usan
la representación de `JSON.stringify`. El fingerprint es SHA-256 sobre esos bytes UTF-8 y
se expresa como `sha256:<hex minúsculo>`.

La aleatoriedad direccionada versión 1 calcula SHA-256 sobre el array JSON
`["resona/random", 1, seed, path, key]`. Los primeros 53 bits del digest forman un entero
sin signo que se divide por `2^53`, produciendo un valor en `[0, 1)`.

## Opciones consideradas

- Depender del orden de inserción de objetos y del PRNG global de JavaScript.
- Adoptar una serialización binaria propia y un generador secuencial con estado.
- Usar JSON canónico explícito, SHA-256 y valores aleatorios puros por dirección.

Se eligió la tercera opción porque los artefactos siguen siendo inspeccionables, el hash es
portable y agregar una consulta aleatoria no desplaza resultados con otras claves.

## Consecuencias

- `RenderSpec` incluye build, versiones, inputs, seed, configuración y metadata resueltas,
  hashes de recursos, IR y plan, rango, cola, opciones efectivas, plataforma y backend.
- Ruta de salida, callbacks, progreso, cancelación y tamaño de bloque no cruzan a la spec.
- Cambiar el formato canónico, el dominio del hash o la extracción de bits exige aumentar
  la versión correspondiente.
- Las claves aleatorias son explícitas y no vacías; seed, path o clave distintos producen
  direcciones independientes.
- El lint rechaza `Math.random()` dentro de los paquetes de Resona.
