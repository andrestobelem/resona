---
status: accepted
date: 2026-08-04
---

# Resona publica Agent Skills para agentes de código

Agentes de código externos como Codex y Claude Code operan Resona mediante sus archivos,
CLI, Studio y APIs normales. Resona mantiene Agent Skills de primera parte, versionadas con
el producto, para enseñar esos workflows sin incorporar IA al runtime musical.

## Opciones consideradas

- Confiar en que los agentes deduzcan el producto solo desde el código y documentación web.
- Crear una API o un agente de IA embebido específicamente para Resona.
- Publicar instrucciones versionadas para que agentes externos usen las superficies normales.

Se eligió la tercera opción porque convierte buenas prácticas y comandos en contexto
instalable, preserva el código como fuente de verdad y no acopla el producto a un proveedor
o modelo de IA.

## Consecuencias

- Las skills viven junto al código fuente y usan exactamente la versión del release de
  Resona que documentan; no tienen un ciclo de versiones independiente.
- Una skill router puede dirigir a instrucciones especializadas de autoría, Studio y render.
- La distribución usa el estándar Agent Skills y prioriza `.agents/skills` por proyecto.
- Compatibilidad con herramientas concretas se resuelve mediante plugins, adaptadores o
  symlinks, no duplicando el contenido canónico.
- Los agentes consumen las mismas APIs que otras herramientas; no existe una fuente paralela.
- Modelos, prompts y generación musical automática no forman parte del runtime.
- Las primeras skills se publican con la primera versión utilizable, después de comprobar
  sus workflows de punta a punta; no bloquean el primer corte vertical del motor.
- El conjunto inicial es `resona-best-practices` como router, `resona-compositions`,
  `resona-audio-midi`, `resona-studio` y `resona-rendering`.
- Su instalación y actualización siguen el contrato definido en el
  [ADR 0055](0055-standard-agent-skills-distribution.md).
