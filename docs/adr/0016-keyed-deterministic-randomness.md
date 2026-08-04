---
status: accepted
date: 2026-08-04
---

# La aleatoriedad es determinista y direccionada por claves

Cada valor aleatorio de Resona deriva de la seed de composición, la ruta estable del nodo y
una clave explícita. No existe un generador global mutable cuyo estado dependa del orden de
evaluación.

## Opciones consideradas

- Permitir `Math.random()` y documentar que el resultado no es reproducible.
- Usar un único generador con seed que avance secuencialmente.
- Derivar valores y streams explícitos mediante claves jerárquicas.

Se eligió la tercera opción para que insertar o eliminar una llamada no cambie valores
aleatorios no relacionados y para que React, Studio y renderer no dependan del orden de
evaluación.

## Consecuencias

- La ruta pública del nodo forma parte de su dominio de aleatoriedad.
- Cada uso declara una clave estable; los streams secuenciales se crean explícitamente con
  una clave propia.
- El algoritmo de derivación se versiona para detectar cambios de resultado.
- Una regla de lint prohíbe `Math.random()` en código que afecta una composición.
