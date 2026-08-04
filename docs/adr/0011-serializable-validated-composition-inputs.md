---
status: accepted
date: 2026-08-04
---

# Los inputs de composición son serializables y validados

Los inputs que cruzan entre autoría, Studio y renderer se limitan a valores JSON
serializables y referencias explícitas a recursos. Toda composición parametrizada declara
un schema de runtime que valida defaults y valores provistos para cada ejecución.

## Opciones consideradas

- Permitir cualquier valor de JavaScript y conservarlo dentro del mismo proceso.
- Aceptar valores serializables sin un contrato de validación de runtime.
- Exigir valores serializables y un schema para composiciones parametrizadas.

Se eligió la tercera opción para que una variante pueda viajar entre procesos, reproducirse
desde CLI y representarse en Studio sin depender de objetos ocultos del proceso de autoría.

## Consecuencias

- Funciones, instancias de clases y estado global no forman parte de los inputs.
- Los defaults deben satisfacer el mismo schema que los valores de una ejecución.
- Los valores provistos reemplazan defaults mediante merge superficial por clave; objetos y
  arrays no se combinan recursivamente y el resultado completo se valida otra vez.
- Una clave ausente conserva su default, `null` es explícito si el schema lo permite y
  `undefined` no cruza la frontera.
- Studio puede derivar controles y mensajes de validación del mismo contrato.
- Las referencias a audio usan la representación serializable explícita del
  [ADR 0047](0047-versioned-static-audio-input-reference.md).
- La frontera y el primer adaptador se definen en el
  [ADR 0045](0045-resona-owned-input-schema-boundary.md).
- La validación no transformadora se define en el
  [ADR 0046](0046-input-schemas-validate-without-transforming.md).
