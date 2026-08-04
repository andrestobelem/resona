---
status: accepted
date: 2026-08-04
---

# Una IR versionada se compila a un plan de ejecución inmutable

Evaluar una variante en TSX produce una `CompositionIR` serializable y versionada. Un módulo
planificador transforma esa IR en un `ExecutionPlan` serializable e inmutable que los
motores de tiempo real y offline consumen sin conocer React.

## Opciones consideradas

- Permitir que cada motor evalúe directamente la composición React.
- Compilar TSX directamente a estructuras internas de cada motor.
- Conservar una IR inspeccionable y compilarla a un plan compartido por adaptadores.

Se eligió la tercera opción porque crea una seam clara para Studio, concentra normalización
y validación en un módulo profundo y evita que los motores reinterpreten la autoría.

## Consecuencias

- `CompositionIR` tiene versión de schema, IDs estables y referencias opcionales al código
  fuente capturadas automáticamente en desarrollo; esa procedencia no afecta la música.
- Studio inspecciona `CompositionIR`; no infiere la estructura desde el audio ni depende del
  estado interno de un motor.
- El planificador resuelve recursos, tiempo, eventos y enrutamiento y devuelve un
  `ExecutionPlan` serializable e inmutable.
- Los adaptadores de tiempo real y offline consumen el mismo contrato de plan.
- React no cruza ninguna de estas seams ni participa del procesamiento de audio.
- El bundle del autor se evalúa solo en Node, como define el
  [ADR 0049](0049-author-code-evaluates-only-in-node.md).
- La forma jerárquica de la IR y densa del plan se define en el
  [ADR 0062](0062-hierarchical-ir-and-dense-execution-plan.md).
