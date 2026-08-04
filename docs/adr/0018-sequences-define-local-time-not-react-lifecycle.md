---
status: accepted
date: 2026-08-04
---

# Las secuencias definen tiempo local, no ciclos de vida React

Una `Sequence` establece un origen temporal local y, opcionalmente, un rango activo para sus
descendientes. La compilación traslada su contenido a posiciones absolutas; el motor no monta
ni desmonta componentes durante la reproducción.

## Opciones consideradas

- Asociar el rango con mount y unmount de componentes, como en una UI.
- Usar secuencias solamente como agrupación sin semántica temporal.
- Tratar la secuencia como un scope temporal de compilación separado del estado DSP.

Se eligió la tercera opción porque permite reutilizar estructura musical sin confundir el
final de un rango con destruir voces, instrumentos o colas de efectos.

## Consecuencias

- Los descendientes expresan posiciones locales desde `1:1:0` y se normalizan a posiciones
  absolutas.
- El final de la secuencia deja de programar contenido nuevo.
- El rango es semiabierto: los clips dejan de aportar señal en el final y las notas activas
  reciben un release.
- Instrumentos y efectos continúan procesando el release y su cola; su estado no se corta de
  golpe.
- React no se evalúa por frame de muestras ni por bloque de audio.
- Instrumentos y efectos siguen reglas explícitas de estado y cola, no ciclos de vida React.
