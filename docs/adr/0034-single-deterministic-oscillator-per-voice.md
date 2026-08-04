---
status: accepted
date: 2026-08-04
---

# Cada voz usa un oscilador determinista único

Cada voz de `PolySynth` contiene un oscilador cuya fase se reinicia en cero al atacar. El
MVP ofrece `sine`, `saw` y `square`; saw y square usan una corrección PolyBLEP implementada
en el núcleo DSP compartido.

## Opciones consideradas

- Comenzar con una onda sinusoidal sin selector.
- Ofrecer formas ingenuas sin corrección de aliasing.
- Ofrecer tres formas básicas con antialiasing determinista para las discontinuas.
- Diseñar desde el inicio un sintetizador con múltiples osciladores y modulación.

Se eligió la tercera opción porque permite timbres básicos útiles sin aceptar el aliasing
más evidente ni ampliar el primer instrumento a una arquitectura completa de síntesis.

## Consecuencias

- Cada ataque comienza desde fase cero.
- No existe fase libre o global entre ocurrencias.
- La señal nominal previa a velocity y envolvente pertenece a `[-1, 1]`.
- PolyBLEP forma parte de la semántica compartida por Studio y render.
- Unison, pulse width, ruido, modulación y fase configurable quedan fuera del MVP.
- `triangle` queda fuera hasta definir su integración y estado.
