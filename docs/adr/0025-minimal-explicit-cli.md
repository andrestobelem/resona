---
status: accepted
date: 2026-08-04
---

# El primer corte vertical del CLI tiene cuatro comandos explícitos

El primer corte vertical del CLI expone `studio`, `compositions`, `validate` y `render` como
operaciones de producto. Cada comando adapta una capacidad programática compartida; ninguno
implementa lógica de dominio propia.

## Opciones consideradas

- Replicar desde el inicio toda la superficie de herramientas de Remotion.
- Ofrecer un único comando implícito cuyo comportamiento dependa de sus argumentos.
- Cubrir los cuatro recorridos iniciales con subcomandos pequeños y explícitos.

Se eligió la tercera opción porque alcanza desarrollo interactivo, descubrimiento,
validación y automatización del render sin estabilizar capacidades que todavía no existen.

## Consecuencias

- `resona studio [entry]` inicia Studio local.
- `resona compositions [entry]` enumera el registro compartido.
- `resona validate [entry] --composition <id>` prepara y valida sin renderizar.
- `resona render <entry> <composition-id> <output.wav>` construye y ejecuta un trabajo.
- Flags y archivos JSON usan los descriptores y schemas compartidos con la API.
- Bundle, caché, plugins, benchmark y cloud quedan fuera del CLI del MVP.
- Los comandos futuros deben justificarse por un recorrido nuevo, no por simetría nominal.
- `resona skills add`, `status` y `update` llegan después como mantenimiento de Agent Skills,
  no como operaciones de dominio del corte vertical.
