---
status: accepted
date: 2026-08-04
---

# El código del autor se evalúa únicamente en Node

El servicio local de Node es la única autoridad que carga el bundle del proyecto, registra
composiciones, valida inputs, prepara variantes, evalúa TSX y compila `ExecutionPlan`.
Studio recibe artefactos serializables y no importa el bundle del autor en el navegador.

## Opciones consideradas

- Evaluar el proyecto en el navegador para Studio y volver a evaluarlo en Node al renderizar.
- Ejecutar autoría solamente en Node y transferir IR y planes al navegador.
- Diseñar un runtime aislado distinto para cada superficie.

Se eligió la segunda opción porque elimina dos evaluaciones en runtimes diferentes, mantiene
schema y filesystem del lado servidor y aprovecha las seams serializables ya definidas.

## Consecuencias

- `ExecutionPlan` debe ser serializable además de inmutable.
- El bundle web de Studio no contiene código ni dependencias del proyecto del autor.
- Cambios de código o inputs solicitan una nueva variante al servicio local.
- `AudioWorklet` recibe el plan y ejecuta el mismo núcleo DSP que Node.
- Render offline usa la misma ruta de registro, preparación, evaluación y planificación.
- APIs exclusivas del navegador no están disponibles para la autoría.
- El protocolo y la entrega de recursos se definen en el
  [ADR 0050](0050-versioned-local-studio-protocol.md).
