---
status: accepted
date: 2026-08-04
---

# Studio vive en web y el renderer en Node

La primera versión de Resona ofrece Studio como aplicación web servida localmente y el
render offline mediante una API programática y una CLI de Node. Esta combinación acerca la
experiencia de desarrollo a Remotion, encaja con el usuario inicial de TypeScript y evita
que una aplicación desktop o un servicio cloud se conviertan en prerrequisitos del núcleo.

## Opciones consideradas

- Studio web local y renderer en Node.
- Una aplicación desktop que aloje tanto Studio como el motor.
- Un servicio web con preview y render en la nube.

Se eligió la primera opción porque permite validar autoría, preview y automatización con
menos infraestructura y sin decidir todavía el empaquetado desktop ni la operación cloud.

## Consecuencias

- Studio y renderer pueden usar adaptadores de ejecución diferentes, pero deben consumir el
  mismo modelo musical resuelto y respetar un contrato explícito de equivalencia.
- El backend concreto del motor de audio sigue siendo una decisión separada.
- Una aplicación desktop podrá alojar Studio más adelante sin convertirse en la fuente de
  verdad de la composición.
- El render distribuido y los servicios cloud quedan fuera del primer alcance.
