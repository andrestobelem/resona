---
status: accepted
date: 2026-08-04
---

# La composición se valida antes de podar el plan

El planificador valida la `CompositionIR` completa y resuelve todas sus referencias antes de
recortar u omitir filas ejecutables. Un clip inválido no se vuelve válido por quedar fuera de
una secuencia o de la duración nominal.

## Opciones consideradas

- Validar y resolver únicamente el contenido que sobrevive al recorte.
- Validar invariantes estructurales de todo el árbol, pero resolver solo los recursos que
  sobreviven.
- Validar y resolver toda la composición antes de podar el plan.

Se eligió la tercera opción. Mantiene los diagnósticos independientes de límites temporales
y evita que extender una secuencia o la duración nominal revele defectos previamente
ocultos. El costo de inspeccionar recursos que finalmente no suenan se acepta y se amortiza
mediante la caché de preparación.

## Consecuencias

- Primero se validan todos los nodos, referencias y valores de la `CompositionIR`.
- Toda referencia de audio debe existir, cumplir el perfil WAV y producir hash y metadata
  válidos, aunque luego no aparezca en `ExecutionPlan.resources`.
- Todo offset debe señalar un frame existente del recurso antes de aplicar recortes.
- Todo loop debe declarar una duración positiva y una región de origen no vacía antes de
  aplicar recortes.
- Toda nota debe declarar una duración estrictamente positiva antes de aplicar recortes.
- Todos los targets y puntos de automatización se validan antes de aplicar recortes.
- Los errores se informan con la ruta y procedencia del nodo original.
- Solo después de una validación completa se intersectan clips con secuencias y duración
  nominal, se omiten regiones de cero frames y se eliminan recursos no utilizados del plan.
- Cambiar un límite temporal puede cambiar las filas ejecutables, pero no la validez del
  código que describe la composición.
- La expansión y poda de notas se fijan en el
  [ADR 0073](0073-dense-instrument-attack-release-events.md).
- La compilación y poda de automatización se fija en el
  [ADR 0075](0075-frame-resolved-gain-automation-points.md).
