---
status: accepted
date: 2026-08-04
---

# La preparación aplica reemplazo por campo y merge superficial de metadata

La declaración estática de una composición es la base. Los campos `duration` y `tempo`
devueltos por `prepare` reemplazan sus valores estáticos; un campo omitido conserva la
declaración original. La metadata estática y dinámica se combina por claves de primer nivel,
con precedencia para las claves devueltas por `prepare`.

Objetos anidados y arrays se reemplazan completos. No hay merge profundo, valores
`undefined` ni sentinels especiales para borrar campos.

## Opciones consideradas

- Reemplazar toda la declaración estática cuando existe un resultado dinámico.
- Aplicar merge profundo recursivo.
- Resolver campos explícitos y combinar solo la metadata por claves de primer nivel.

Se eligió la tercera opción porque permite complementar metadata editorial sin repetirla,
pero evita reglas recursivas sorprendentes y conserva una precedencia fácil de explicar,
serializar y reproducir.

## Consecuencias

- `duration` y `tempo` usan reemplazo completo cuando aparecen en el retorno.
- Una clave de metadata dinámica reemplaza por completo el valor estático de la misma clave.
- Claves estáticas no mencionadas permanecen en el resultado.
- El resultado debe ser JSON serializable donde corresponda y no puede contener `undefined`.
- Resona valida y congela la configuración final antes de evaluar TSX.
- Cada campo resuelto conserva procedencia estática o dinámica para diagnóstico e identidad.
