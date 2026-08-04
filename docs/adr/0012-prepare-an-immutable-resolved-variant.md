---
status: accepted
date: 2026-08-04
---

# La preparación produce una variante resuelta inmutable

Antes de evaluar la composición TSX, una función opcional recibe los inputs ya validados y
resuelve metadata de recursos, duración, tempo y configuración final. Su resultado es una
variante resuelta inmutable consumida por Studio, API, CLI y renderer.

## Opciones consideradas

- Evaluar el TSX directamente con defaults e inputs provistos.
- Recalcular metadata de forma independiente en cada superficie y etapa.
- Preparar una vez una variante resuelta y conservarla durante la ejecución.

Se eligió la tercera opción para admitir composiciones parametrizadas y metadata derivada
sin que selección, preview y render puedan observar configuraciones distintas.

## Consecuencias

- La preparación recibe inputs validados, ID de composición, `AbortSignal` y un resolver
  restringido de recursos.
- Solo puede consultar recursos explícitos mediante el resolver de Resona; red, reloj, estado
  global y aleatoriedad sin seed no alteran la variante.
- El modo de ejecución no forma parte del contrato público, como precisa el
  [ADR 0059](0059-mode-agnostic-public-preparation.md).
- La preparación no procesa audio ni participa del callback de tiempo real.
- La variante resuelta contiene los inputs concretos y la metadata, recursos y configuración
  finales.
- Una superficie no vuelve a preparar silenciosamente la variante entre selección y
  ejecución.
- El nombre y la firma pública se definen en el
  [ADR 0060](0060-prepare-composition-public-contract.md).
