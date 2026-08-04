---
status: accepted
date: 2026-08-04
---

# ExecutionPlan v1 fija su cabecera y la frontera de sus tablas

`ExecutionPlan` describe la composición nominal completa en una forma ejecutable,
serializable e inmutable. Studio y render offline consumen el mismo plan a 48&nbsp;kHz estéreo;
las diferencias operativas de cada ejecución no modifican este contrato.

La cabecera v1 es:

```ts
type ProcessorIndex = number;

type ExecutionPlan = Readonly<{
  format: "resona/execution-plan";
  schemaVersion: 1;
  compositionId: string;
  sampleRate: 48_000;
  channels: 2;
  nominalDurationFrames: number;
  masterProcessor: ProcessorIndex;

  processors: readonly ProcessorPlan[];
  routes: readonly SignalRoute[];
  resources: readonly ResolvedResourcePlan[];
  audioRegions: readonly AudioRegionPlan[];
  events: readonly InstrumentEventPlan[];
  automation: readonly AutomationLanePlan[];

  trace?: readonly PlanTrace[];
}>;
```

## Opciones consideradas

- Incluir en el plan el rango solicitado, colas, encoding, callbacks y tamaño de bloque para
  convertirlo en una descripción completa de cada trabajo de render.
- Conservar sample rate y canales configurables dentro del plan, aunque el primer motor solo
  admita una combinación.
- Fijar un contrato nominal a 48&nbsp;kHz estéreo y dejar las decisiones de cada trabajo en
  `RenderSpec`, el adaptador y el motor.

Se eligió la tercera opción. Un plan nominal único evita recompilar la semántica musical por
cada rango o destino, mantiene la paridad entre Studio y render y no confunde datos
ejecutables con estado operativo.

## Consecuencias

- `format`, `schemaVersion` y `compositionId` identifican el contrato y su composición.
- `sampleRate` vale `48_000` y `channels` vale `2` en v1.
- `nominalDurationFrames`, todos los demás frames y todos los índices son enteros seguros no
  negativos.
- Los arrays ejecutables siempre están presentes, aunque estén vacíos.
- Un `ProcessorIndex` es la posición en `processors`; el payload no duplica ese índice y no
  puede usarlo como identidad estable entre planes.
- `masterProcessor` referencia el sumador terminal del grafo.
- `trace` es una tabla diagnóstica opcional y queda fuera de la identidad musical.
- El plan no conserva tempo, posiciones musicales, componentes React, metadata editorial,
  rutas físicas, buffers, handles ni estado DSP vivo.
- El rango solicitado, la política de colas, el formato de salida y los callbacks pertenecen
  a `RenderSpec` o al trabajo que lo envuelve.
- El tamaño de bloque y el estado mutable de ejecución pertenecen al adaptador o al motor.
- Los procesadores y las rutas se fijan en el
  [ADR 0070](0070-closed-execution-plan-v1-processors-and-routing.md), y los recursos y
  regiones de audio en el
  [ADR 0071](0071-content-addressed-resources-and-audio-regions.md). Los eventos de
  instrumento se fijan en el
  [ADR 0073](0073-dense-instrument-attack-release-events.md), y la automatización en el
  [ADR 0075](0075-frame-resolved-gain-automation-points.md). `trace` se fija en el
  [ADR 0076](0076-complete-non-operational-execution-plan-trace.md).
