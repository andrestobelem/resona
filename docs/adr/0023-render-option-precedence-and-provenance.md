---
status: accepted
date: 2026-08-04
---

# Las opciones de render tienen precedencia y procedencia explícitas

Cada opción de render se resuelve una sola vez al construir el `RenderJob`, con la
precedencia `invocación explícita > configuración del proyecto > default de Resona`. El
resultado conserva el valor efectivo y la capa que lo aportó.

## Opciones consideradas

- Dejar que cada superficie combine opciones según sus propias reglas.
- Resolver valores efectivos sin conservar de dónde provienen.
- Compartir descriptores y resolver valores con una precedencia y procedencia explícitas.

Se eligió la tercera opción para que API, CLI y Studio produzcan el mismo trabajo, y para
que una diferencia de configuración pueda explicarse sin reconstruir implícitamente la
ejecución.

## Consecuencias

- Un descriptor compartido define tipo, validación y default de cada opción.
- Los adaptadores de CLI y Studio no redefinen las reglas de resolución.
- El `RenderJob` contiene opciones efectivas junto con su procedencia.
- La metadata musical no puede sobrescribir silenciosamente una opción de render.
- Una contradicción entre una opción y un invariante musical produce un diagnóstico.
- Agregar una nueva capa de configuración exige otra decisión explícita de precedencia.
