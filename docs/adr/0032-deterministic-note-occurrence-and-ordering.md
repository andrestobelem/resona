---
status: accepted
date: 2026-08-04
---

# Las ocurrencias y el orden de notas son deterministas

Cada nota recibe una identidad interna derivada de la ruta canónica de su `EventClip` y de
su ordinal original en la colección. En un mismo frame, el planificador ordena primero las
liberaciones y después los ataques; cada grupo se desempata por ruta y ordinal.

## Opciones consideradas

- Exigir un ID público y manual para cada nota.
- Depender del orden en que React, objetos o estructuras internas entreguen los eventos.
- Derivar una identidad interna y definir un orden total durante la planificación.

Se eligió la tercera opción porque distingue notas iguales superpuestas sin volver verbosa
la autoría ni permitir que detalles accidentales de implementación cambien el resultado.

## Consecuencias

- El autor no declara IDs por nota en el MVP.
- La identidad de ocurrencia no es una referencia pública estable entre ediciones.
- Reordenar deliberadamente la colección puede cambiar su orden de ejecución.
- Una liberación ocurre antes que un ataque ubicado en el mismo frame.
- Ruta canónica y ordinal original resuelven cualquier empate restante.
- Instrumentos reciben un stream totalmente ordenado y pueden asociar voces por ocurrencia.
- El stream denso que materializa estas reglas se fija en el
  [ADR 0073](0073-dense-instrument-attack-release-events.md).
- La comparación canónica de rutas se fija en el
  [ADR 0077](0077-canonical-node-paths-and-source-locations.md).
