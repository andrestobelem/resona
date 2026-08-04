---
status: accepted
date: 2026-08-04
---

# Studio deriva un conjunto mínimo de controles explícitos

Studio representa boolean, number, string, enum, audio-resource y objetos anidados mediante
controles conocidos. Arrays, unions y formas no soportadas conservan edición JSON validada.

## Opciones consideradas

- Generar controles heurísticamente para toda forma y nombre de campo.
- Ofrecer únicamente un editor JSON.
- Renderizar un subconjunto explícito y usar JSON como fallback completo.

Se eligió la tercera opción para que los inputs comunes sean cómodos sin convertir Studio en
un intérprete incompleto y sorpresivo de cualquier schema.

## Consecuencias

- Boolean usa checkbox y enum usa selector.
- Number respeta min, max y step cuando están declarados.
- String usa texto o textarea solo mediante un hint explícito.
- Audio-resource usa un selector limitado a `staticDir`.
- Objetos agrupan recursivamente controles soportados.
- Arrays, unions y formas desconocidas usan el editor JSON.
- Los nombres de campos no tienen semántica visual implícita.
