---
status: accepted
date: 2026-08-04
---

# El proyecto admite configuración TypeScript opcional

Un proyecto puede exportar un objeto mediante `defineConfig()` desde `resona.config.ts`. El
resultado debe ser plano, síncrono y validable, y puede definir entry point, directorio
estático y defaults de render.

## Opciones consideradas

- Exigir todos los valores mediante flags o llamadas de API.
- Usar un archivo JSON sin composición TypeScript.
- Permitir una configuración TypeScript cuyo resultado cruce como datos validados.
- Permitir callbacks y resolución asíncrona dentro del contrato de configuración.

Se eligió la tercera opción por ergonomía y tipado sin convertir la configuración resuelta
en otra fase de preparación con comportamiento oculto.

## Consecuencias

- Sin archivo se usan `src/index.tsx`, `public/` y defaults de Resona.
- El objeto exportado no contiene funciones, promesas ni instancias opacas.
- CLI y API pueden sobrescribir sus valores con mayor precedencia.
- El `RenderJob` conserva valores efectivos y procedencia.
- La ejecución del módulo ocurre antes de validar y congelar la configuración.
- La raíz y el descubrimiento se definen en el
  [ADR 0044](0044-explicit-stable-project-root.md).
