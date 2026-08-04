---
status: accepted
date: 2026-08-04
---

# ExecutionPlan trace es completo, opcional y no operativo

`ExecutionPlan.trace` relaciona las filas densas del plan con sus orígenes semánticos para
Studio y diagnósticos. Puede omitirse sin cambiar la validación ni la ejecución.

```ts
type PlanTrace =
  | Readonly<{
      type: "processor";
      index: ProcessorIndex;
      origin: NodePath;
    }>
  | Readonly<{
      type: "route";
      index: number;
      from: NodePath;
      to: NodePath;
    }>
  | Readonly<{
      type: "resource";
      index: ResourceIndex;
      origins: readonly NodePath[];
    }>
  | Readonly<{
      type: "audio-region";
      index: number;
      origin: NodePath;
    }>
  | Readonly<{
      type: "instrument-event";
      index: number;
      origin: Readonly<{
        clipPath: NodePath;
        eventIndex: number;
      }>;
    }>
  | Readonly<{
      type: "automation-lane";
      index: number;
      origin: NodePath;
    }>;
```

## Opciones consideradas

- Incluir IDs y procedencia directamente en cada payload ejecutable.
- Usar un diccionario genérico y parcial de índices a metadata arbitraria.
- Mantener una unión diagnóstica separada, opcional pero completa cuando existe.

Se eligió la tercera opción. Preserva payloads ejecutables densos, permite validar la
cobertura del trace y evita que una optimización o superficie dependa accidentalmente de
metadata que producción puede omitir.

## Consecuencias

- Ausencia de `trace` es válida y no cambia ningún comportamiento.
- Cuando existe, hay exactamente una entrada por fila de `processors`, `routes`, `resources`,
  `audioRegions`, `events` y `automation`.
- Cada índice es válido y único dentro de su discriminante.
- Las entradas se ordenan por el orden de tablas anterior y luego por índice ascendente.
- El master se origina en la secuencia raíz; cada sumador de pista se origina en esa pista.
- Una ruta conserva los paths de los procesadores conectados.
- Un recurso deduplicado conserva una lista no vacía, canónica y sin duplicados de los clips
  que originaron su hash.
- Una región de audio apunta a su `AudioClipIR`.
- Attack y release de la misma ocurrencia apuntan al mismo `EventClipIR.path` y al mismo
  `eventIndex` original.
- Una entrada de automatización apunta a `AutomationLaneIR`; los puntos sintéticos no crean
  un origen ficticio.
- `SourceLocation` permanece en `CompositionIR` y se obtiene por join con `NodePath`.
- La forma canónica de ambos valores se fija en el
  [ADR 0077](0077-canonical-node-paths-and-source-locations.md).
- `trace` queda fuera de hashes, fingerprints e identidad musical.
- El motor, el routing y los medidores no pueden depender de esta tabla. Un mapping operativo
  futuro deberá tener un contrato obligatorio separado.
