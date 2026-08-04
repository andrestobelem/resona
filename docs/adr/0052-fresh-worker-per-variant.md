---
status: accepted
date: 2026-08-04
---

# Cada variante se evalúa en un worker nuevo

Cada build exitoso produce un bundle Node inmutable con `buildId`. Cada variante carga ese
bundle en un worker nuevo, devuelve solo artefactos serializables y destruye el worker al
terminar o cancelar.

## Opciones consideradas

- Mantener un módulo cargado y reevaluar componentes dentro del mismo proceso.
- Reiniciar el proceso completo de Studio para cada cambio.
- Reutilizar el build pero aislar cada evaluación en un worker efímero.

Se eligió la tercera opción para evitar globals filtrados entre variantes sin recompilar por
cada cambio de inputs ni reiniciar la aplicación de desarrollo.

## Consecuencias

- Registro, preparación, TSX y planificación empiezan desde un módulo limpio.
- Cancelar una variante termina su worker y libera sus recursos.
- El servicio valida que el resultado del worker sea serializable.
- Un build fallido no reemplaza el último bundle válido.
- Studio marca ese bundle anterior como obsoleto y no permite reproducirlo como actual.
- El worker es aislamiento de ciclo de vida, no una frontera de seguridad.
- Pooling futuro solo será válido si conserva la misma semántica observable de estado limpio.
