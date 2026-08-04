---
status: accepted
date: 2026-08-04
---

# PolySynth limita y roba voces de forma determinista

`PolySynth` expone `maxVoices`, con default `32`. Cuando un ataque supera ese límite, el
instrumento roba primero la voz en release de menor amplitud y, si no existe, la voz activa
más antigua. Todo empate se resuelve por índice de voz.

## Opciones consideradas

- Permitir una cantidad de voces sin límite práctico en el modelo.
- Fallar el render cuando se alcance el máximo.
- Aplicar una política de robo explícita e idéntica en Studio y render offline.

Se eligió la tercera opción para acotar CPU y memoria manteniendo continuidad de playback y
un resultado reproducible ante la misma secuencia de eventos.

## Consecuencias

- Un ataque usa primero la voz libre de menor índice.
- Los slots mantienen índices estables y sus contribuciones audibles se suman por índice
  ascendente; liberar, atacar o robar una voz no los reordena.
- Entre voces en release se elige la de menor amplitud instantánea.
- Sin voces en release se elige el ataque activo más antiguo.
- El índice interno resuelve empates y no se expone como identidad musical.
- Una voz robada se reinicializa en el frame del nuevo ataque.
- La liberación posterior de la ocurrencia robada no afecta a la voz reasignada.
- Cada ejecución emite una advertencia agregada si hubo uno o más robos de voz.
- El redondeo de cada aporte a la suma se fija en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
