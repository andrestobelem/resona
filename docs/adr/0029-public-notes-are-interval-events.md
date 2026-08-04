---
status: accepted
date: 2026-08-04
---

# Las notas públicas son eventos de intervalo

Una nota pública declara inicio, duración, pitch y velocity como una sola entidad. El
planificador la convierte en un ataque y una liberación vinculados por una identidad de
ocurrencia interna.

## Opciones consideradas

- Exponer mensajes separados de inicio y fin como unidad básica de autoría.
- Mantener notas como intervalos y expandirlas durante la planificación.
- Permitir ambas representaciones dentro de una misma colección.

Se eligió la segunda opción porque impide pares huérfanos en la autoría y permite validar,
recortar y transformar una nota como una unidad musical.

## Consecuencias

- La duración de una nota es obligatoria, estrictamente positiva y lleva unidad explícita.
- El planificador produce los eventos que consume el instrumento.
- Una identidad de ocurrencia distingue notas iguales que se superponen.
- El importador MIDI empareja mensajes antes de construir notas públicas.
- Mensajes MIDI incompletos producen diagnósticos según una política aún por definir.
- Pitch se define en el [ADR 0030](0030-typed-twelve-tone-pitch.md).
- Velocity se define en el [ADR 0031](0031-normalized-linear-note-velocity.md).
- La identidad de ocurrencia y el orden simultáneo se definen en el
  [ADR 0032](0032-deterministic-note-occurrence-and-ordering.md).
- La forma ejecutable de attack y release se fija en el
  [ADR 0073](0073-dense-instrument-attack-release-events.md).
