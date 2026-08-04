---
status: accepted
date: 2026-08-04
---

# Las Agent Skills usan una distribución estándar con fuente canónica en el monorepo

Las Agent Skills de Resona tienen una única fuente canónica dentro del monorepo. El proceso
de release las sincroniza a un repositorio oficial consumible por instaladores compatibles
con el estándar Agent Skills.

La vía interoperable es `npx skills add <repositorio-oficial-de-resona>`. El CLI ofrece
`resona skills add` y `resona skills update` como wrappers de conveniencia que delegan en
una versión fijada del instalador estándar y escriben la representación canónica en
`.agents/skills`.

## Opciones consideradas

- Publicar instrucciones para copiar manualmente desde el monorepo.
- Mantener las skills solo en un repositorio separado.
- Mantenerlas canónicas en el monorepo, sincronizarlas para distribución y ofrecer tanto el
  instalador estándar como wrappers del CLI.

Se eligió la tercera opción porque mantiene instrucciones y producto en la misma revisión,
preserva interoperabilidad entre agentes y ofrece una experiencia directa a quienes ya usan
el CLI de Resona.

## Consecuencias

- El repositorio de distribución es un artefacto publicado, no una segunda fuente de verdad.
- Los wrappers no definen otro formato ni contienen lógica propia de instalación.
- Cada skill usa exactamente la versión del release de Resona que documenta, sin un ciclo de
  versiones independiente.
- La versión del instalador subyacente queda fijada para que un release sea reproducible.
- La instalación principal vive en `.agents/skills`; integraciones específicas usan
  adaptadores o symlinks sin duplicar el contenido canónico.
- `resona skills status` compara las versiones instalada y esperada y expone un resultado
  estructurado reutilizable por Studio.
- Una instalación ausente no genera advertencias; una versión diferente produce una
  advertencia no bloqueante con el comando de actualización.
- La detección nunca modifica el proyecto y las actualizaciones solo ocurren ante un
  `resona skills update` explícito.
- El hash calculado del lockfile permite distinguir una skill desactualizada de una skill
  modificada localmente sin crear un formato de estado paralelo.
- `update` rechaza sobrescribir modificaciones locales; `update --force` permite hacerlo de
  forma explícita.
- Las personalizaciones durables usan otra identidad de skill en lugar de modificar la copia
  oficial administrada.
- Los comandos de mantenimiento se entregan con la primera versión utilizable y no bloquean
  el primer corte vertical del motor.
- La coordenada concreta del repositorio oficial se elegirá cuando exista la organización de
  publicación.
- La validación previa a sincronizar el artefacto se define en el
  [ADR 0056](0056-deterministic-quality-gate-for-agent-skills.md).
