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
  startFrame?: number;
  endFrame?: number;
  tailFrames?: number;
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
    plan.processors.some(
      (processor) => !["poly-synth", "sum", "gain", "delay"].includes(processor.type),
    )
  ) {
    throw new RangeError("The renderer only supports PolySynth, Gain, Delay, and sum processors.");
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
  for (const processor of plan.processors) {
    if (
      processor.type === "delay" &&
      (!Number.isSafeInteger(processor.delayFrames) ||
        processor.delayFrames <= 0 ||
        !Number.isFinite(processor.feedback) ||
        processor.feedback < 0 ||
        processor.feedback >= 1 ||
        !Number.isFinite(processor.mix) ||
        processor.mix < 0 ||
        processor.mix > 1)
    ) {
      throw new RangeError("Delay processor parameters are invalid.");
    }
  }
};

const validateRuntimeResources = (job: CreateRenderJobResult): void => {
  for (const resource of job.plan.resources) {
    const runtime = job.runtimeResources.find((candidate) => candidate.hash === resource.hash);
    if (
      runtime === undefined ||
      runtime.channels !== resource.channels ||
      runtime.sampleRate !== resource.sampleRate ||
      runtime.frameCount !== resource.frameCount ||
      runtime.samples.length !== runtime.frameCount * runtime.channels ||
      runtime.samples.some((sample) => !Number.isFinite(sample))
    ) {
      throw new RangeError("The render job contains an invalid or unavailable audio resource.");
    }
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
  {
    blockFrames = 128,
    startFrame = 0,
    endFrame = job.plan.nominalDurationFrames,
    tailFrames = 0,
  }: RenderAudioOptions = {},
): RenderedAudio => {
  if (!Number.isSafeInteger(blockFrames) || blockFrames <= 0) {
    throw new RangeError("blockFrames must be a positive safe integer.");
  }
  const { plan } = job;
  if (
    !Number.isSafeInteger(startFrame) ||
    !Number.isSafeInteger(endFrame) ||
    !Number.isSafeInteger(tailFrames) ||
    startFrame < 0 ||
    endFrame <= startFrame ||
    endFrame > plan.nominalDurationFrames ||
    tailFrames < 0 ||
    !Number.isSafeInteger(endFrame + tailFrames) ||
    !Number.isSafeInteger(endFrame - startFrame + tailFrames)
  ) {
    throw new RangeError(
      "Render range must be a finite half-open interval with a non-negative tail.",
    );
  }
  validatePlan(plan);
  validateRuntimeResources(job);

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
  const gainAt = (target: number, frame: number): number => {
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
          return canonicalF32(
            span <= 0
              ? point.value
              : previous.value + (point.value - previous.value) * ((frame - previous.frame) / span),
          );
        }
        return previous.value;
      }
      previous = point;
    }
    return previous.value;
  };
  const delayStates = new Map<
    number,
    { left: Float32Array; right: Float32Array; position: number }
  >();
  for (const [index, processor] of plan.processors.entries()) {
    if (processor.type === "delay") {
      delayStates.set(index, {
        left: new Float32Array(processor.delayFrames),
        right: new Float32Array(processor.delayFrames),
        position: 0,
      });
    }
  }
  const outputFrames = endFrame - startFrame + tailFrames;
  const processEnd = endFrame + tailFrames;
  const samples = new Float32Array(outputFrames * plan.channels);

  for (let blockStart = 0; blockStart < processEnd; blockStart += blockFrames) {
    const blockEnd = Math.min(processEnd, blockStart + blockFrames);
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

      const sourceOutputs = new Map<number, Readonly<{ left: number; right: number }>>();
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
        const sample = canonicalF32(instrumentSample);
        sourceOutputs.set(instrument.processorIndex, { left: sample, right: sample });
      }
      for (const region of plan.audioRegions) {
        if (frame < region.startFrame || frame >= region.startFrame + region.durationFrames)
          continue;
        const resourcePlan = plan.resources[region.resource];
        if (resourcePlan === undefined) {
          throw new RangeError("Audio region references an unknown resource.");
        }
        const resource = job.runtimeResources.find(
          (candidate) => candidate.hash === resourcePlan.hash,
        );
        if (resource?.samples === undefined) {
          throw new RangeError("Audio region resource PCM is unavailable.");
        }
        const elapsed = frame - region.startFrame;
        const available = resourcePlan.frameCount - region.sourceOffsetFrame;
        const sourceFrame = region.loop
          ? region.sourceOffsetFrame + (elapsed % available)
          : region.sourceOffsetFrame + elapsed;
        if (sourceFrame >= resourcePlan.frameCount) continue;
        const sourceIndex = sourceFrame * resourcePlan.channels;
        const sourceLeft = resource.samples[sourceIndex] ?? 0;
        const sourceRight =
          resourcePlan.channels === 1 ? sourceLeft : (resource.samples[sourceIndex + 1] ?? 0);
        const previous = sourceOutputs.get(region.destination) ?? { left: 0, right: 0 };
        sourceOutputs.set(region.destination, {
          left: canonicalF32(previous.left + sourceLeft),
          right: canonicalF32(previous.right + sourceRight),
        });
      }
      for (let processorIndex = 0; processorIndex < plan.masterProcessor; processorIndex += 1) {
        const processor = plan.processors[processorIndex];
        if (processor?.type !== "gain" && processor?.type !== "delay") continue;
        const inputRoute = plan.routes.find((route) => route.to === processorIndex);
        const input =
          inputRoute === undefined
            ? { left: 0, right: 0 }
            : (sourceOutputs.get(inputRoute.from) ?? { left: 0, right: 0 });
        if (processor.type === "gain") {
          const gain = gainAt(processorIndex, frame);
          sourceOutputs.set(processorIndex, {
            left: canonicalF32(input.left * gain),
            right: canonicalF32(input.right * gain),
          });
        } else {
          const state = delayStates.get(processorIndex)!;
          const delayedLeft = state.left[state.position] ?? 0;
          const delayedRight = state.right[state.position] ?? 0;
          sourceOutputs.set(processorIndex, {
            left: canonicalF32(input.left * (1 - processor.mix) + delayedLeft * processor.mix),
            right: canonicalF32(input.right * (1 - processor.mix) + delayedRight * processor.mix),
          });
          state.left[state.position] = canonicalF32(input.left + delayedLeft * processor.feedback);
          state.right[state.position] = canonicalF32(
            input.right + delayedRight * processor.feedback,
          );
          state.position = (state.position + 1) % processor.delayFrames;
        }
      }
      let left = 0;
      let right = 0;
      for (const route of plan.routes) {
        if (route.to !== plan.masterProcessor) continue;
        const output = sourceOutputs.get(route.from) ?? { left: 0, right: 0 };
        left = canonicalF32(left + output.left);
        right = canonicalF32(right + output.right);
      }
      if (frame >= startFrame) {
        const outputFrame = frame - startFrame;
        samples[outputFrame * plan.channels] = canonicalF32(left);
        samples[outputFrame * plan.channels + 1] = canonicalF32(right);
      }
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
    frames: outputFrames,
    sampleRate: plan.sampleRate,
    channels: plan.channels,
    diagnostics: Object.freeze(diagnostics),
  });
};
