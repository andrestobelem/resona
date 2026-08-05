# Renderer context

The renderer consumes an immutable `CreateRenderJobResult`; it never evaluates TSX or
replans musical time. It renders `PolySynth` plans through a stateful Float32 DSP loop and
emits an in-memory 48 kHz, stereo, IEEE-float32 WAV.

The DSP loop is intentionally block-size independent. Parameters, accumulated samples and
WAV payloads cross explicit Float32 boundaries; oscillator phase and envelope calculations
remain Float64 locally. No normalization, limiting or implicit clipping occurs.

Each instrument owns stable voice slots. Attacks use the lowest free slot; exhaustion steals
the releasing voice with the lowest envelope-scaled amplitude, or otherwise the oldest
active voice, with slot index as the final tie-breaker. Releases address occurrences, so a
stale release cannot affect a reassigned slot. Voice-steal diagnostics are aggregated once
per instrument and render execution.

Sine, saw and square reset phase at attack. Saw and square use the same deterministic
PolyBLEP correction around their discontinuities.

`renderAudioToFile()` is the filesystem adapter over the same renderer. It writes a validated
float32 WAV to a same-directory temporary, publishes it atomically, refuses existing outputs
unless `overwrite: true`, and removes temporary state on cancellation or failure. It never
introduces a second interpretation of the execution plan.
