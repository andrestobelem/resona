---
status: accepted
date: 2026-08-04
---

# La autoría React es declarativa y pura

Una variante de Resona evalúa una vez un árbol finito de componentes funcionales. La autoría
admite composición, fragments, condiciones, listas y hooks de solo lectura provistos por
Resona; no usa React como runtime con estado para producir audio.

## Opciones consideradas

- Admitir cualquier semántica de una aplicación React, incluidos estado y efectos.
- Definir una DSL TSX propia que no evalúe componentes React.
- Usar un subconjunto React puro y trasladar I/O a la fase de preparación.

Se eligió la tercera opción para conservar composición idiomática sin introducir renders
dependientes del scheduler, side effects o estado oculto en la `CompositionIR`.

## Consecuencias

- Se admiten componentes funcionales, fragments, condiciones y listas finitas.
- Los hooks públicos son de solo lectura y exponen inputs o contexto musical de Resona.
- `useState`, `useEffect`, DOM, refs y componentes async no forman parte del contrato.
- Preparación concentra I/O y trabajo asíncrono antes de evaluar TSX.
- Lint y diagnósticos de runtime explican las construcciones no admitidas.
