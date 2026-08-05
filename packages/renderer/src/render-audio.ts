import type { CreateRenderJobResult, ExecutionPlan } from "@resona/engine";

const TAU = Math.PI * 2;

type Voice = {
  active: boolean;
  occurrence: number;
  phase: number;
  frequencyHz: number;
  velocity: number;
  attackFrame: number;
  releaseFrame?: number;
  releaseLevel?: number;
};

type PolySynthProcessor = Extract<ExecutionPlan["processors"][number], { type: "poly-synth" }>;

type InstrumentState = {
  processorIndex: number;
  processor: PolySynthProcessor;
  voices: Voice[];
  voiceSteals: number;
};

export type RenderAudioOptions = Readonly<{
  blockFrames?: number;
}>;

export type RenderedAudio = Readonly<{
  wav: Uint8Array;
  samples: Float32Array;
  frames: number;
  sampleRate: number;
  channels: number;
  diagnostics: readonly RenderDiagnostic[];
}>;

export type RenderDiagnostic = Readonly<{
  code: "render.poly-synth-voice-stealing";
  phase: "render";
  severity: "warning";
  message: string;
  compositionId: string;
  cause: Readonly<{
    instrument: number;
    voiceSteals: number;
  }>;
}>;

const canonicalF32 = (value: number): number => {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded)) {
    throw new RangeError("DSP produced a non-finite sample.");
  }
  return Object.is(rounded, -0) ? 0 : rounded;
};

const frequencyFromSemitones = (semitonesFromA4: number): number =>
  440 * 2 ** (semitonesFromA4 / 12);

const polyBlep = (phase: number, phaseDelta: number): number => {
  if (phase < phaseDelta) {
    const normalized = phase / phaseDelta;
    return normalized + normalized - normalized * normalized - 1;
  }
  if (phase > 1 - phaseDelta) {
    const normalized = (phase - 1) / phaseDelta;
    return normalized * normalized + normalized + normalized + 1;
  }
  return 0;
};

const oscillatorAt = (
  oscillator: PolySynthProcessor["oscillator"],
  phase: number,
  phaseDelta: number,
): number => {
  if (oscillator === "sine") {
    return Math.sin(TAU * phase);
  }
  if (oscillator === "saw") {
    return 2 * phase - 1 - polyBlep(phase, phaseDelta);
  }

  const shiftedPhase = (phase + 0.5) % 1;
  return (phase < 0.5 ? 1 : -1) + polyBlep(phase, phaseDelta) - polyBlep(shiftedPhase, phaseDelta);
};

const envelopeAt = (
  voice: Voice,
  frame: number,
  attackFrames: number,
  decayFrames: number,
  sustain: number,
  releaseFrames: number,
): number => {
  const fromAttack = frame - voice.attackFrame;
  const attackLevel =
    attackFrames === 0 ? 1 : fromAttack < attackFrames ? fromAttack / attackFrames : 1;
  const afterAttack = fromAttack - attackFrames;
  const heldLevel =
    afterAttack <= 0 || decayFrames === 0
      ? attackLevel
      : afterAttack < decayFrames
        ? 1 + (sustain - 1) * (afterAttack / decayFrames)
        : sustain;

  if (voice.releaseFrame === undefined || frame < voice.releaseFrame) {
    return heldLevel;
  }

  const releaseStart = voice.releaseLevel ?? heldLevel;
  const elapsed = frame - voice.releaseFrame;
  return releaseFrames === 0 ? 0 : Math.max(0, releaseStart * (1 - elapsed / releaseFrames));
};

const encodeWav = (samples: Float32Array, sampleRate: number, channels: number): Uint8Array => {
  const bytesPerSample = 4;
  const bytesPerFrame = channels * bytesPerSample;
  const dataBytes = samples.byteLength;
  const output = new Uint8Array(44 + dataBytes);
  const view = new DataView(output.buffer);
  const writeFourCc = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeFourCc(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeFourCc(8, "WAVE");
  writeFourCc(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 32, true);
  writeFourCc(36, "data");
  view.setUint32(40, dataBytes, true);
  new Float32Array(output.buffer, 44, samples.length).set(samples);
  return output;
};

const validatePlan = (plan: ExecutionPlan): void => {
  if (plan.sampleRate !== 48_000 || plan.channels !== 2) {
    throw new RangeError("The renderer only supports the fixed 48 kHz stereo profile.");
  }
  if (
    plan.processors.some((processor) => !["poly-synth", "sum", "gain"].includes(processor.type))
  ) {
    throw new RangeError("The renderer only supports PolySynth, Gain, and sum processors.");
  }
  if (
    plan.processors.some(
      (processor) =>
        processor.type === "poly-synth" &&
        !["sine", "saw", "square"].includes(processor.oscillator),
    )
  ) {
    throw new RangeError("PolySynth oscillator must be sine, saw, or square.");
  }
};

const createVoice = (): Voice => ({
  active: false,
  occurrence: -1,
  phase: 0,
  frequencyHz: 0,
  velocity: 0,
  attackFrame: 0,
});

const envelopeLevelAt = (voice: Voice, frame: number, processor: PolySynthProcessor): number =>
  envelopeAt(
    voice,
    frame,
    processor.attackFrames,
    processor.decayFrames,
    processor.sustain,
    processor.releaseFrames,
  );

const instantaneousAmplitude = (
  voice: Voice,
  frame: number,
  processor: PolySynthProcessor,
): number => envelopeLevelAt(voice, frame, processor) * voice.velocity;

const selectVoice = (
  instrument: InstrumentState,
  frame: number,
): Readonly<{ voice: Voice; stolen: boolean }> => {
  const free = instrument.voices.find((voice) => !voice.active);
  if (free !== undefined) {
    return { voice: free, stolen: false };
  }

  const releasing = instrument.voices
    .map((voice, index) => ({
      voice,
      index,
      amplitude: instantaneousAmplitude(voice, frame, instrument.processor),
    }))
    .filter(({ voice }) => voice.releaseFrame !== undefined)
    .sort((left, right) => left.amplitude - right.amplitude || left.index - right.index)[0];
  if (releasing !== undefined) {
    return { voice: releasing.voice, stolen: true };
  }

  const oldest = instrument.voices
    .map((voice, index) => ({ voice, index }))
    .sort(
      (left, right) => left.voice.attackFrame - right.voice.attackFrame || left.index - right.index,
    )[0];
  if (oldest === undefined) {
    throw new RangeError("PolySynth must contain at least one voice.");
  }
  return { voice: oldest.voice, stolen: true };
};

export const renderAudio = (
  job: CreateRenderJobResult,
  { blockFrames = 128 }: RenderAudioOptions = {},
): RenderedAudio => {
  if (!Number.isSafeInteger(blockFrames) || blockFrames <= 0) {
    throw new RangeError("blockFrames must be a positive safe integer.");
  }
  const { plan } = job;
  validatePlan(plan);

  const instruments: InstrumentState[] = plan.processors
    .map((processor, index) => ({ processor, index }))
    .filter(
      (
        entry,
      ): entry is Readonly<{
        processor: Extract<ExecutionPlan["processors"][number], { type: "poly-synth" }>;
        index: number;
      }> => entry.processor.type === "poly-synth",
    )
    .map(({ processor, index }) => ({
      processorIndex: index,
      processor,
      voices: Array.from({ length: processor.maxVoices }, createVoice),
      voiceSteals: 0,
    }));
  const instrumentsByProcessor = new Map(
    instruments.map((instrument) => [instrument.processorIndex, instrument]),
  );
  const gainByInstrument = new Map<number, number>();
  for (const route of plan.routes) {
    if (
      plan.processors[route.from]?.type === "poly-synth" &&
      plan.processors[route.to]?.type === "gain"
    ) {
      gainByInstrument.set(route.from, route.to);
    }
  }
  const gainAt = (instrument: number, frame: number): number => {
    const target = gainByInstrument.get(instrument);
    if (target === undefined) return 1;
    const processor = plan.processors[target];
    if (processor?.type !== "gain") return 1;
    const lane = plan.automation.find((candidate) => candidate.target === target);
    if (lane === undefined || lane.points.length === 0) return processor.gain;
    let previous: { frame: number; value: number; interpolation: "hold" | "linear" } = {
      frame: 0,
      value: processor.gain,
      interpolation: "hold",
    };
    for (const point of lane.points) {
      if (frame < point.frame) {
        if (previous.interpolation === "linear") {
          const span = point.frame - previous.frame;
          return span <= 0
            ? point.value
            : previous.value + (point.value - previous.value) * ((frame - previous.frame) / span);
        }
        return previous.value;
      }
      previous = point;
    }
    return previous.value;
  };
  const samples = new Float32Array(plan.nominalDurationFrames * plan.channels);

  for (let blockStart = 0; blockStart < plan.nominalDurationFrames; blockStart += blockFrames) {
    const blockEnd = Math.min(plan.nominalDurationFrames, blockStart + blockFrames);
    for (let frame = blockStart; frame < blockEnd; frame += 1) {
      for (const instrument of instruments) {
        for (const voice of instrument.voices) {
          if (
            voice.active &&
            voice.releaseFrame !== undefined &&
            envelopeLevelAt(voice, frame, instrument.processor) === 0
          ) {
            voice.active = false;
          }
        }
      }

      for (const event of plan.events) {
        if (event.frame !== frame) continue;
        const instrument = instrumentsByProcessor.get(event.instrument);
        if (instrument === undefined) {
          throw new RangeError("The plan references an unknown instrument.");
        }
        if (event.type === "note-attack") {
          const frequencyHz = frequencyFromSemitones(event.semitonesFromA4);
          if (
            !Number.isFinite(frequencyHz) ||
            frequencyHz <= 0 ||
            frequencyHz >= plan.sampleRate / 2
          ) {
            throw new RangeError("A note frequency is outside the executable range.");
          }
          const { voice, stolen } = selectVoice(instrument, frame);
          if (stolen) {
            instrument.voiceSteals += 1;
          }
          Object.assign(voice, {
            active: true,
            occurrence: event.occurrence,
            phase: 0,
            frequencyHz,
            velocity: event.velocity,
            attackFrame: frame,
            releaseFrame: undefined,
            releaseLevel: undefined,
          });
        } else {
          const voice = instrument.voices.find(
            (candidate) => candidate.active && candidate.occurrence === event.occurrence,
          );
          if (voice !== undefined) {
            voice.releaseFrame = frame;
            voice.releaseLevel = envelopeLevelAt(voice, frame, instrument.processor);
            if (instrument.processor.releaseFrames === 0) {
              voice.active = false;
            }
          }
        }
      }

      let mono = 0;
      for (const instrument of instruments) {
        let instrumentSample = 0;
        for (const voice of instrument.voices) {
          if (!voice.active) continue;
          const envelope = envelopeLevelAt(voice, frame, instrument.processor);
          const phaseDelta = voice.frequencyHz / plan.sampleRate;
          const contribution = canonicalF32(
            oscillatorAt(instrument.processor.oscillator, voice.phase, phaseDelta) *
              envelope *
              voice.velocity,
          );
          instrumentSample = canonicalF32(instrumentSample + contribution);
          voice.phase += phaseDelta;
          voice.phase -= Math.floor(voice.phase);
        }
        mono = canonicalF32(mono + instrumentSample * gainAt(instrument.processorIndex, frame));
      }
      const sample = canonicalF32(mono);
      samples[frame * plan.channels] = sample;
      samples[frame * plan.channels + 1] = sample;
    }
  }

  const diagnostics: RenderDiagnostic[] = instruments
    .filter((instrument) => instrument.voiceSteals > 0)
    .map((instrument) => ({
      code: "render.poly-synth-voice-stealing",
      phase: "render",
      severity: "warning",
      message: `PolySynth stole ${instrument.voiceSteals === 1 ? "one voice" : `${instrument.voiceSteals} voices`} while rendering.`,
      compositionId: plan.compositionId,
      cause: Object.freeze({
        instrument: instrument.processorIndex,
        voiceSteals: instrument.voiceSteals,
      }),
    }));

  return Object.freeze({
    wav: encodeWav(samples, plan.sampleRate, plan.channels),
    samples,
    frames: plan.nominalDurationFrames,
    sampleRate: plan.sampleRate,
    channels: plan.channels,
    diagnostics: Object.freeze(diagnostics),
  });
};
