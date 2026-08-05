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

export type RenderAudioOptions = Readonly<{
  blockFrames?: number;
}>;

export type RenderedAudio = Readonly<{
  wav: Uint8Array;
  samples: Float32Array;
  frames: number;
  sampleRate: number;
  channels: number;
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
    throw new RangeError("The T02 renderer only supports the fixed 48 kHz stereo profile.");
  }
  if (
    plan.processors.some((processor) => processor.type !== "poly-synth" && processor.type !== "sum")
  ) {
    throw new RangeError("The T02 renderer only supports PolySynth and sum processors.");
  }
  if (
    plan.processors.some(
      (processor) => processor.type === "poly-synth" && processor.oscillator !== "sine",
    )
  ) {
    throw new RangeError("The T02 renderer only supports the sine oscillator.");
  }
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

  const instruments = plan.processors
    .map((processor, index) => ({ processor, index }))
    .filter(
      (
        entry,
      ): entry is Readonly<{
        processor: Extract<ExecutionPlan["processors"][number], { type: "poly-synth" }>;
        index: number;
      }> => entry.processor.type === "poly-synth",
    );
  const voices: Voice[] = instruments.map(() => ({
    active: false,
    occurrence: -1,
    phase: 0,
    frequencyHz: 0,
    velocity: 0,
    attackFrame: 0,
  }));
  const samples = new Float32Array(plan.nominalDurationFrames * plan.channels);

  for (let blockStart = 0; blockStart < plan.nominalDurationFrames; blockStart += blockFrames) {
    const blockEnd = Math.min(plan.nominalDurationFrames, blockStart + blockFrames);
    for (let frame = blockStart; frame < blockEnd; frame += 1) {
      for (const event of plan.events) {
        if (event.frame !== frame) continue;
        const voice = voices[event.instrument];
        const instrument = instruments[event.instrument]?.processor;
        if (voice === undefined || instrument === undefined) {
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
        } else if (voice.active && voice.occurrence === event.occurrence) {
          voice.releaseFrame = frame;
          voice.releaseLevel = envelopeAt(
            voice,
            frame,
            instrument.attackFrames,
            instrument.decayFrames,
            instrument.sustain,
            instrument.releaseFrames,
          );
        }
      }

      let mono = 0;
      for (const [instrumentIndex, { processor }] of instruments.entries()) {
        const voice = voices[instrumentIndex]!;
        if (!voice.active) continue;
        const envelope = envelopeAt(
          voice,
          frame,
          processor.attackFrames,
          processor.decayFrames,
          processor.sustain,
          processor.releaseFrames,
        );
        if (voice.releaseFrame !== undefined && envelope === 0) {
          voice.active = false;
          continue;
        }
        mono = canonicalF32(
          mono + canonicalF32(Math.sin(TAU * voice.phase) * envelope * voice.velocity),
        );
        voice.phase += voice.frequencyHz / plan.sampleRate;
        voice.phase -= Math.floor(voice.phase);
      }
      const sample = canonicalF32(mono);
      samples[frame * plan.channels] = sample;
      samples[frame * plan.channels + 1] = sample;
    }
  }

  return Object.freeze({
    wav: encodeWav(samples, plan.sampleRate, plan.channels),
    samples,
    frames: plan.nominalDurationFrames,
    sampleRate: plan.sampleRate,
    channels: plan.channels,
  });
};
