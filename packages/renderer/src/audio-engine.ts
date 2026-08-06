import type { ExecutionPlan } from "@resona/engine";

const TAU = Math.PI * 2;
const seekBlockFrames = 1024;

export type AudioRuntimeResource = Readonly<{
  type: "wav";
  hash: `sha256:${string}`;
  channels: 1 | 2;
  sampleRate: 48_000;
  frameCount: number;
  samples: ArrayLike<number>;
}>;

export type AudioEngineDiagnostic = Readonly<{
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

export type AudioEngine = Readonly<{
  readonly cursorFrame: number;
  process(output: Float32Array, frames?: number): number;
  reset(): void;
  seek(frame: number): void;
  diagnostics(): readonly AudioEngineDiagnostic[];
}>;

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

type DelayState = {
  left: Float32Array;
  right: Float32Array;
  position: number;
};

const canonicalF32 = (value: number): number => {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded)) throw new RangeError("DSP produced a non-finite sample.");
  return Object.is(rounded, -0) ? 0 : rounded;
};

const isCanonicalF32 = (value: number): boolean =>
  Number.isFinite(value) && !Object.is(value, -0) && Object.is(Math.fround(value), value);

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
  if (oscillator === "sine") return Math.sin(TAU * phase);
  if (oscillator === "saw") return 2 * phase - 1 - polyBlep(phase, phaseDelta);
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

  if (voice.releaseFrame === undefined || frame < voice.releaseFrame) return heldLevel;
  const releaseStart = voice.releaseLevel ?? heldLevel;
  const elapsed = frame - voice.releaseFrame;
  return releaseFrames === 0 ? 0 : Math.max(0, releaseStart * (1 - elapsed / releaseFrames));
};

const createVoice = (): Voice => ({
  active: false,
  occurrence: -1,
  phase: 0,
  frequencyHz: 0,
  velocity: 0,
  attackFrame: 0,
});

const validatePlan = (plan: ExecutionPlan): void => {
  if (plan.sampleRate !== 48_000 || plan.channels !== 2) {
    throw new RangeError("The audio engine only supports the fixed 48 kHz stereo profile.");
  }
  if (!Number.isSafeInteger(plan.nominalDurationFrames) || plan.nominalDurationFrames <= 0) {
    throw new RangeError("The audio plan must have a positive nominal duration.");
  }
  if (
    !Number.isSafeInteger(plan.masterProcessor) ||
    plan.masterProcessor !== plan.processors.length - 1 ||
    plan.processors[plan.masterProcessor]?.type !== "sum"
  ) {
    throw new RangeError("The audio plan must terminate at its master processor.");
  }
  for (const processor of plan.processors) {
    if (processor.type === "poly-synth") {
      if (
        !["sine", "saw", "square"].includes(processor.oscillator) ||
        !Number.isSafeInteger(processor.maxVoices) ||
        processor.maxVoices <= 0 ||
        !Number.isSafeInteger(processor.attackFrames) ||
        processor.attackFrames < 0 ||
        !Number.isSafeInteger(processor.decayFrames) ||
        processor.decayFrames < 0 ||
        !Number.isSafeInteger(processor.releaseFrames) ||
        processor.releaseFrames < 0 ||
        !isCanonicalF32(processor.sustain) ||
        processor.sustain < 0 ||
        processor.sustain > 1
      ) {
        throw new RangeError("PolySynth processor parameters are invalid.");
      }
    }
    if (processor.type === "gain" && !isCanonicalF32(processor.gain)) {
      throw new RangeError("Gain processor parameters are invalid.");
    }
    if (processor.type === "delay") {
      if (
        !Number.isSafeInteger(processor.delayFrames) ||
        processor.delayFrames <= 0 ||
        !Number.isFinite(processor.feedback) ||
        !isCanonicalF32(processor.feedback) ||
        processor.feedback < 0 ||
        processor.feedback >= 1 ||
        !Number.isFinite(processor.mix) ||
        !isCanonicalF32(processor.mix) ||
        processor.mix < 0 ||
        processor.mix > 1
      ) {
        throw new RangeError("Delay processor parameters are invalid.");
      }
    }
  }
  for (const route of plan.routes) {
    if (
      !Number.isSafeInteger(route.from) ||
      !Number.isSafeInteger(route.to) ||
      route.from < 0 ||
      route.from >= plan.processors.length ||
      route.to <= route.from ||
      route.to > plan.masterProcessor
    ) {
      throw new RangeError("Audio routes reference invalid processors.");
    }
  }
  for (const event of plan.events) {
    if (
      !Number.isSafeInteger(event.frame) ||
      event.frame < 0 ||
      event.instrument < 0 ||
      event.instrument >= plan.masterProcessor
    ) {
      throw new RangeError("Audio events must use non-negative integer frames.");
    }
  }
  for (const region of plan.audioRegions) {
    if (
      !Number.isSafeInteger(region.resource) ||
      region.resource < 0 ||
      region.resource >= plan.resources.length ||
      !Number.isSafeInteger(region.destination) ||
      region.destination < 0 ||
      region.destination >= plan.masterProcessor ||
      !Number.isSafeInteger(region.startFrame) ||
      region.startFrame < 0 ||
      !Number.isSafeInteger(region.durationFrames) ||
      region.durationFrames <= 0 ||
      !Number.isSafeInteger(region.sourceOffsetFrame) ||
      region.sourceOffsetFrame < 0
    ) {
      throw new RangeError("Audio regions reference invalid frames or processors.");
    }
  }
  for (const lane of plan.automation) {
    if (
      !Number.isSafeInteger(lane.target) ||
      lane.target < 0 ||
      lane.target >= plan.masterProcessor ||
      plan.processors[lane.target]?.type !== "gain"
    ) {
      throw new RangeError("Gain automation references an invalid processor.");
    }
    for (const point of lane.points) {
      if (!Number.isSafeInteger(point.frame) || point.frame < 0 || !isCanonicalF32(point.value)) {
        throw new RangeError("Gain automation contains invalid points.");
      }
    }
  }
};

const validateResources = (
  plan: ExecutionPlan,
  resources: readonly AudioRuntimeResource[],
): readonly (AudioRuntimeResource | undefined)[] => {
  const byHash = new Map(resources.map((resource) => [resource.hash, resource]));
  return plan.resources.map((expected) => {
    const resource = byHash.get(expected.hash);
    if (
      resource === undefined ||
      resource.type !== expected.type ||
      resource.channels !== expected.channels ||
      resource.sampleRate !== expected.sampleRate ||
      resource.frameCount !== expected.frameCount ||
      resource.samples.length !== resource.frameCount * resource.channels
    ) {
      throw new RangeError("The audio plan contains an invalid or unavailable resource.");
    }
    for (let index = 0; index < resource.samples.length; index += 1) {
      if (!Number.isFinite(resource.samples[index])) {
        throw new RangeError("The audio resource contains a non-finite sample.");
      }
    }
    return resource;
  });
};

export const createAudioEngine = (
  plan: ExecutionPlan,
  resources: readonly AudioRuntimeResource[],
): AudioEngine => {
  validatePlan(plan);
  const resourcesByPlanIndex = validateResources(plan, resources);
  const instruments: InstrumentState[] = plan.processors
    .map((processor, index) => ({ processor, index }))
    .filter(
      (
        entry,
      ): entry is Readonly<{
        processor: PolySynthProcessor;
        index: number;
      }> => entry.processor.type === "poly-synth",
    )
    .map(({ processor, index }) => ({
      processorIndex: index,
      processor,
      voices: Array.from({ length: processor.maxVoices }, createVoice),
      voiceSteals: 0,
    }));
  const instrumentsByProcessor: (InstrumentState | undefined)[] = Array.from({
    length: plan.processors.length,
  });
  for (const instrument of instruments)
    instrumentsByProcessor[instrument.processorIndex] = instrument;
  const sourceLeft = new Float32Array(plan.processors.length);
  const sourceRight = new Float32Array(plan.processors.length);
  const inputRouteFrom = new Int32Array(plan.processors.length);
  inputRouteFrom.fill(-1);
  for (const route of plan.routes) {
    if (inputRouteFrom[route.to] === -1) inputRouteFrom[route.to] = route.from;
  }
  const gainLanes: ((typeof plan.automation)[number] | undefined)[] = Array.from({
    length: plan.processors.length,
  });
  for (const lane of plan.automation) gainLanes[lane.target] = lane;
  const delayStates = new Map<number, DelayState>();
  for (const [index, processor] of plan.processors.entries()) {
    if (processor.type === "delay") {
      delayStates.set(index, {
        left: new Float32Array(processor.delayFrames),
        right: new Float32Array(processor.delayFrames),
        position: 0,
      });
    }
  }
  const scratch = new Float32Array(seekBlockFrames * plan.channels);
  let cursorFrame = 0;
  let eventCursor = 0;

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

  let selectedVoiceStolen = false;
  const selectVoice = (instrument: InstrumentState, frame: number): Voice => {
    selectedVoiceStolen = false;
    for (const voice of instrument.voices) {
      if (!voice.active) return voice;
    }
    let releasingVoice: Voice | undefined;
    let releasingIndex = -1;
    let releasingAmplitude = Number.POSITIVE_INFINITY;
    for (let index = 0; index < instrument.voices.length; index += 1) {
      const voice = instrument.voices[index];
      if (voice === undefined || voice.releaseFrame === undefined) continue;
      const amplitude = instantaneousAmplitude(voice, frame, instrument.processor);
      if (
        amplitude < releasingAmplitude ||
        (amplitude === releasingAmplitude && (releasingIndex === -1 || index < releasingIndex))
      ) {
        releasingVoice = voice;
        releasingIndex = index;
        releasingAmplitude = amplitude;
      }
    }
    if (releasingVoice !== undefined) {
      selectedVoiceStolen = true;
      return releasingVoice;
    }
    let oldest = instrument.voices[0];
    let oldestIndex = 0;
    for (let index = 1; index < instrument.voices.length; index += 1) {
      const candidate = instrument.voices[index];
      if (
        candidate !== undefined &&
        oldest !== undefined &&
        (candidate.attackFrame < oldest.attackFrame ||
          (candidate.attackFrame === oldest.attackFrame && index < oldestIndex))
      ) {
        oldest = candidate;
        oldestIndex = index;
      }
    }
    if (oldest === undefined) throw new RangeError("PolySynth must contain at least one voice.");
    selectedVoiceStolen = true;
    return oldest;
  };

  const gainAt = (target: number, frame: number): number => {
    const processor = plan.processors[target];
    if (processor?.type !== "gain") return 1;
    const lane = gainLanes[target];
    if (lane === undefined || lane.points.length === 0) return processor.gain;
    let previousFrame = 0;
    let previousValue = processor.gain;
    let previousInterpolation: "hold" | "linear" = "hold";
    for (const point of lane.points) {
      if (frame < point.frame) {
        if (previousInterpolation === "linear") {
          const span = point.frame - previousFrame;
          return canonicalF32(
            span <= 0
              ? point.value
              : previousValue + (point.value - previousValue) * ((frame - previousFrame) / span),
          );
        }
        return previousValue;
      }
      previousFrame = point.frame;
      previousValue = point.value;
      previousInterpolation = point.interpolation;
    }
    return previousValue;
  };

  const processFrame = (frame: number, output: Float32Array, outputOffset: number): void => {
    sourceLeft.fill(0);
    sourceRight.fill(0);
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
    while (eventCursor < plan.events.length) {
      const event = plan.events[eventCursor];
      if (event === undefined || event.frame > frame) break;
      eventCursor += 1;
      if (event.frame < frame) continue;
      const instrument = instrumentsByProcessor[event.instrument];
      if (instrument === undefined)
        throw new RangeError("The plan references an unknown instrument.");
      if (event.type === "note-attack") {
        const frequencyHz = frequencyFromSemitones(event.semitonesFromA4);
        if (
          !Number.isFinite(frequencyHz) ||
          frequencyHz <= 0 ||
          frequencyHz >= plan.sampleRate / 2
        ) {
          throw new RangeError("A note frequency is outside the executable range.");
        }
        const voice = selectVoice(instrument, frame);
        if (selectedVoiceStolen) instrument.voiceSteals += 1;
        voice.active = true;
        voice.occurrence = event.occurrence;
        voice.phase = 0;
        voice.frequencyHz = frequencyHz;
        voice.velocity = event.velocity;
        voice.attackFrame = frame;
        delete voice.releaseFrame;
        delete voice.releaseLevel;
      } else {
        let voice: Voice | undefined;
        for (const candidate of instrument.voices) {
          if (candidate.active && candidate.occurrence === event.occurrence) {
            voice = candidate;
            break;
          }
        }
        if (voice !== undefined) {
          voice.releaseFrame = frame;
          voice.releaseLevel = envelopeLevelAt(voice, frame, instrument.processor);
          if (instrument.processor.releaseFrames === 0) voice.active = false;
        }
      }
    }

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
      sourceLeft[instrument.processorIndex] = canonicalF32(instrumentSample);
      sourceRight[instrument.processorIndex] = sourceLeft[instrument.processorIndex] ?? 0;
    }
    for (const region of plan.audioRegions) {
      if (frame < region.startFrame || frame >= region.startFrame + region.durationFrames) continue;
      const resourcePlan = plan.resources[region.resource];
      const resource = resourcesByPlanIndex[region.resource];
      if (resourcePlan === undefined || resource === undefined) {
        throw new RangeError("Audio region references an unknown resource.");
      }
      const elapsed = frame - region.startFrame;
      const available = resourcePlan.frameCount - region.sourceOffsetFrame;
      const sourceFrame = region.loop
        ? region.sourceOffsetFrame + (elapsed % available)
        : region.sourceOffsetFrame + elapsed;
      if (sourceFrame >= resourcePlan.frameCount) continue;
      const sourceIndex = sourceFrame * resourcePlan.channels;
      const sourceSample = resource.samples[sourceIndex] ?? 0;
      const sourceLeftSample = canonicalF32(sourceSample);
      const sourceRightSample =
        resourcePlan.channels === 1
          ? sourceLeftSample
          : canonicalF32(resource.samples[sourceIndex + 1] ?? 0);
      const destination = region.destination;
      sourceLeft[destination] = canonicalF32((sourceLeft[destination] ?? 0) + sourceLeftSample);
      sourceRight[destination] = canonicalF32((sourceRight[destination] ?? 0) + sourceRightSample);
    }
    for (let processorIndex = 0; processorIndex < plan.masterProcessor; processorIndex += 1) {
      const processor = plan.processors[processorIndex];
      if (processor?.type !== "gain" && processor?.type !== "delay") continue;
      const inputIndex = inputRouteFrom[processorIndex] ?? -1;
      const inputLeft = inputIndex < 0 ? 0 : (sourceLeft[inputIndex] ?? 0);
      const inputRight = inputIndex < 0 ? 0 : (sourceRight[inputIndex] ?? 0);
      if (processor.type === "gain") {
        const gain = gainAt(processorIndex, frame);
        sourceLeft[processorIndex] = canonicalF32(inputLeft * gain);
        sourceRight[processorIndex] = canonicalF32(inputRight * gain);
      } else {
        const state = delayStates.get(processorIndex);
        if (state === undefined) throw new RangeError("Delay processor state is unavailable.");
        const delayedLeft = state.left[state.position] ?? 0;
        const delayedRight = state.right[state.position] ?? 0;
        sourceLeft[processorIndex] = canonicalF32(
          inputLeft * (1 - processor.mix) + delayedLeft * processor.mix,
        );
        sourceRight[processorIndex] = canonicalF32(
          inputRight * (1 - processor.mix) + delayedRight * processor.mix,
        );
        state.left[state.position] = canonicalF32(inputLeft + delayedLeft * processor.feedback);
        state.right[state.position] = canonicalF32(inputRight + delayedRight * processor.feedback);
        state.position = (state.position + 1) % processor.delayFrames;
      }
    }
    let left = 0;
    let right = 0;
    for (const route of plan.routes) {
      if (route.to !== plan.masterProcessor) continue;
      left = canonicalF32(left + (sourceLeft[route.from] ?? 0));
      right = canonicalF32(right + (sourceRight[route.from] ?? 0));
    }
    output[outputOffset] = left;
    output[outputOffset + 1] = right;
  };

  const reset = (): void => {
    cursorFrame = 0;
    eventCursor = 0;
    for (const instrument of instruments) {
      instrument.voiceSteals = 0;
      for (const voice of instrument.voices) {
        voice.active = false;
        voice.occurrence = -1;
        voice.phase = 0;
        voice.frequencyHz = 0;
        voice.velocity = 0;
        voice.attackFrame = 0;
        delete voice.releaseFrame;
        delete voice.releaseLevel;
      }
    }
    for (const state of delayStates.values()) {
      state.left.fill(0);
      state.right.fill(0);
      state.position = 0;
    }
  };

  const process = (output: Float32Array, frames = output.length / plan.channels): number => {
    if (!Number.isSafeInteger(frames) || frames < 0 || output.length < frames * plan.channels) {
      throw new RangeError("Audio output must contain enough interleaved stereo frames.");
    }
    for (let index = 0; index < frames; index += 1) {
      processFrame(cursorFrame, output, index * plan.channels);
      cursorFrame += 1;
    }
    return frames;
  };

  const seek = (frame: number): void => {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame > plan.nominalDurationFrames) {
      throw new RangeError("Audio seek frame must be within the nominal duration.");
    }
    reset();
    while (cursorFrame < frame) {
      process(scratch, Math.min(seekBlockFrames, frame - cursorFrame));
    }
  };

  const diagnostics = (): readonly AudioEngineDiagnostic[] =>
    instruments
      .filter((instrument) => instrument.voiceSteals > 0)
      .map((instrument) => ({
        code: "render.poly-synth-voice-stealing" as const,
        phase: "render" as const,
        severity: "warning" as const,
        message: `PolySynth stole ${instrument.voiceSteals === 1 ? "one voice" : `${instrument.voiceSteals} voices`} while rendering.`,
        compositionId: plan.compositionId,
        cause: Object.freeze({
          instrument: instrument.processorIndex,
          voiceSteals: instrument.voiceSteals,
        }),
      }));

  reset();
  return {
    get cursorFrame() {
      return cursorFrame;
    },
    process,
    reset,
    seek,
    diagnostics,
  };
};
