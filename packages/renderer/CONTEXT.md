# Renderer context

The renderer consumes an immutable `CreateRenderJobResult`; it never evaluates TSX or
replans musical time. Its T02 slice renders the existing `sine` `PolySynth` plan through a
stateful Float32 DSP loop and emits an in-memory 48 kHz, stereo, IEEE-float32 WAV.

The DSP loop is intentionally block-size independent. Parameters, accumulated samples and
WAV payloads cross explicit Float32 boundaries; oscillator phase and envelope calculations
remain Float64 locally. No normalization, limiting or implicit clipping occurs.

Future tickets add polyphony, audio resources, effects, automation and filesystem publication
without introducing a second interpretation of the execution plan.
