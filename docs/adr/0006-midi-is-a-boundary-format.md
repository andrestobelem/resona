---
status: accepted
date: 2026-08-04
---

# MIDI es un formato de borde, no el modelo musical interno

Resona representa internamente la música mediante eventos musicales propios. MIDI es una
capacidad de primera clase para clips e interoperabilidad, pero sus mensajes se normalizan
antes de llegar al motor.

## Opciones consideradas

- Usar mensajes MIDI como representación musical interna universal.
- Definir eventos musicales propios y adaptar MIDI en los bordes.
- Exponer solamente un modelo musical de alto nivel sin soporte MIDI explícito.

Se eligió la segunda opción para conservar interoperabilidad sin imponer al motor y a las
APIs futuras los canales, resoluciones y límites expresivos de MIDI.

## Consecuencias

- Un adaptador MIDI puede ser parte de la API pública, pero no entrega mensajes MIDI crudos
  a un instrumento interno.
- Los instrumentos consumen eventos musicales normalizados y producen señal de audio.
- El orden de eventos simultáneos forma parte del contrato cuando afecta el resultado.
- Importar y exportar archivos `.mid`, enviar MIDI a hardware y recibirlo en tiempo real son
  capacidades separadas que pueden incorporarse en alcances distintos.
- La granularidad de autoría se define en el
  [ADR 0028](0028-tsx-structures-typed-musical-event-data.md); la nota mínima se define en el
  [ADR 0029](0029-public-notes-are-interval-events.md).
