---
status: accepted
date: 2026-08-04
---

# Velocity es un escalar normalizado y lineal

La velocity pública de una nota pertenece al intervalo cerrado `[0, 1]`, tiene default `1`
y escala linealmente la amplitud de la envolvente del sintetizador mínimo.

## Opciones consideradas

- Exponer directamente la escala MIDI `0…127`.
- Usar un escalar normalizado y dejar su curva indefinida.
- Usar un escalar normalizado con semántica lineal explícita en el instrumento inicial.

Se eligió la tercera opción para desacoplar el dominio de MIDI y hacer reproducible el
efecto audible del parámetro sin introducir todavía curvas configurables.

## Consecuencias

- Una nota sin velocity declara implícitamente `1`.
- Los valores fuera de `[0, 1]` fallan durante validación.
- MIDI `1…127` se convierte mediante `n / 127`.
- MIDI `note-on` con velocity `0` se interpreta como `note-off` durante importación.
- El `PolySynth` del MVP multiplica linealmente la envolvente por velocity.
- Curvas perceptuales o específicas de instrumento quedan fuera del primer hito.
