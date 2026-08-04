---
status: accepted
date: 2026-08-04
---

# El cursor de muestras es el reloj autoritativo de playback

Durante playback, la posición autoritativa es el cursor de frames de muestras que avanza el
núcleo DSP dentro del `AudioWorklet`. Studio observa esa posición para dibujar, pero su ciclo
de render no gobierna tiempo musical.

## Opciones consideradas

- Programar eventos desde el ciclo de render de React.
- Usar `requestAnimationFrame` como reloj y corregir drift contra el audio.
- Hacer que el motor de audio gobierne y que la UI siga sus snapshots.

Se eligió la tercera opción porque solo el callback de audio conoce qué frames se entregaron
realmente al dispositivo y no se suspende bajo las mismas condiciones que la UI.

## Consecuencias

- `requestAnimationFrame` solo actualiza presentación.
- Eventos, automatización y DSP se programan contra frames de muestras.
- Playhead y medidores pueden refrescarse a menor frecuencia sin cambiar el sonido.
- Seek y loop se expresan como comandos al transporte y se aplican en la seam del motor.
