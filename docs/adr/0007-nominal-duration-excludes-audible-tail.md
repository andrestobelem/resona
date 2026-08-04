---
status: accepted
date: 2026-08-04
---

# La duración nominal excluye la cola audible

Resona distingue la duración nominal del contenido y la cola audible que instrumentos o
efectos producen después. La timeline termina en la duración nominal; la política del render
decide cuánto audio posterior incluir en el artefacto.

## Opciones consideradas

- Incorporar siempre las colas dentro de la duración declarada de la composición.
- Terminar todo audio exactamente al final nominal.
- Separar la duración nominal de una política explícita de cola.

Se eligió la tercera opción porque conserva una timeline estable y permite que distintos
artefactos decidan si deben cortar o preservar releases, delays y reverbs.

## Consecuencias

- Una cola audible no desplaza clips ni modifica la duración musical de la composición.
- El rango nominal y el rango efectivamente emitido deben quedar visibles por separado.
- Instrumentos y efectos con estado pueden seguir procesándose después del final nominal.
- La política concreta para cortar o extender la cola se decide por separado.
