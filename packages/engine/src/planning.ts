import type {
  CompositionIR,
  Diagnostic,
  ExecutionPlan,
  InstrumentEventPlan,
  InstrumentTrackIR,
  AudioTrackIR,
  AudioRegionPlan,
  NodePath,
  ProcessorPlan,
  SequenceIR,
  SignalRoute,
  RationalIR,
  ResolvedResourcePlan,
} from "./model.js";
import type { PreparedAudioRuntimeResource } from "./preparation.js";
import { ResonaError } from "./resona-error.js";
import {
  addFractions,
  compareFractions,
  durationToSeconds,
  fraction,
  fractionFromIR,
  minimumFraction,
  multiplyFractions,
  positionToSeconds,
  type Fraction,
} from "./time/rational.js";
import { roundRationalToNearestEven } from "./time/round-rational-to-nearest-even.js";

const SAMPLE_RATE = 48_000;
const MAX_SAFE_FRAME = BigInt(Number.MAX_SAFE_INTEGER);

const roundedFrameFromSeconds = (seconds: Fraction): bigint => {
  const frames = multiplyFractions(seconds, fraction(BigInt(SAMPLE_RATE)));
  return roundRationalToNearestEven(frames.numerator, frames.denominator);
};

const frameFromSeconds = (seconds: Fraction): number => {
  const rounded = roundedFrameFromSeconds(seconds);
  if (rounded > MAX_SAFE_FRAME) {
    throw new RangeError("A planned frame is outside the safe integer range.");
  }
  return Number(rounded);
};

const canonicalF32 = (value: number): number => {
  const rounded = Math.fround(value);
  return Object.is(rounded, -0) ? 0 : rounded;
};

const diagnosticFor = (
  composition: CompositionIR,
  code: string,
  message: string,
  node?: Readonly<{ path: NodePath; source?: { file: string; line: number; column: number } }>,
): Diagnostic => ({
  code,
  phase: "planning",
  severity: "error",
  message,
  compositionId: composition.compositionId,
  ...(node === undefined ? {} : { nodePath: node.path }),
  ...(node?.source === undefined ? {} : { source: node.source }),
});

const isCanonicalNonNegativeRational = (value: RationalIR): boolean => {
  if (!/^(0|[1-9][0-9]*)$/.test(value.numerator) || !/^[1-9][0-9]*$/.test(value.denominator)) {
    return false;
  }

  try {
    const parsed = fraction(BigInt(value.numerator), BigInt(value.denominator));
    return (
      parsed.numerator.toString() === value.numerator &&
      parsed.denominator.toString() === value.denominator
    );
  } catch {
    return false;
  }
};

const validateHeader = (composition: CompositionIR): Fraction => {
  const diagnostics: Diagnostic[] = [];
  const bpm = composition.tempo.bpm;

  if (!isCanonicalNonNegativeRational(bpm) || bpm.numerator === "0") {
    diagnostics.push(
      diagnosticFor(
        composition,
        "plan.tempo-bpm-invalid",
        "BPM must be a positive canonical rational.",
      ),
    );
  }

  const { beatsPerBar, beatUnit } = composition.tempo.timeSignature;
  if (!Number.isSafeInteger(beatsPerBar) || beatsPerBar <= 0) {
    diagnostics.push(
      diagnosticFor(
        composition,
        "plan.time-signature-beats-invalid",
        "beatsPerBar must be a positive safe integer.",
      ),
    );
  }
  if (!Number.isSafeInteger(beatUnit) || beatUnit <= 0 || (beatUnit & (beatUnit - 1)) !== 0) {
    diagnostics.push(
      diagnosticFor(
        composition,
        "plan.time-signature-unit-invalid",
        "beatUnit must be a positive power-of-two safe integer.",
      ),
    );
  }

  if (
    composition.root.from.type !== "absolute-position" ||
    !isCanonicalNonNegativeRational(composition.root.from.seconds) ||
    composition.root.from.seconds.numerator !== "0"
  ) {
    diagnostics.push(
      diagnosticFor(
        composition,
        "plan.root-origin-invalid",
        "The root Sequence must begin at absolute zero.",
        composition.root,
      ),
    );
  }

  if (diagnostics.length > 0) {
    throw new ResonaError("The composition header cannot be planned.", diagnostics);
  }

  return fractionFromIR(bpm);
};

type TrackPlacement = Readonly<{
  track: InstrumentTrackIR | AudioTrackIR;
  start: Fraction;
  end: Fraction;
}>;

const collectTracks = (
  sequence: SequenceIR,
  parentStart: Fraction,
  parentEnd: Fraction,
  bpm: Fraction,
  placements: TrackPlacement[],
): void => {
  const start = addFractions(parentStart, positionToSeconds(sequence.from, bpm));
  const end =
    sequence.duration === undefined
      ? parentEnd
      : minimumFraction(parentEnd, addFractions(start, durationToSeconds(sequence.duration, bpm)));

  for (const child of sequence.children) {
    if (child.type === "sequence") {
      collectTracks(child, start, end, bpm, placements);
    } else if (child.type === "instrument-track" || child.type === "audio-track") {
      placements.push({ track: child, start, end });
    }
  }
};

const comparePaths = (left: NodePath, right: NodePath): number => {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftSegment = left[index]!;
    const rightSegment = right[index]!;
    if (leftSegment !== rightSegment) {
      return leftSegment < rightSegment ? -1 : 1;
    }
  }
  return left.length - right.length;
};

type NoteCandidate = Readonly<{
  clipPath: NodePath;
  eventIndex: number;
  instrument: number;
  start: Fraction;
  end: Fraction;
  activeStart: Fraction;
  activeEnd: Fraction;
  semitonesFromA4: number;
  velocity: number;
}>;

export type PlanCompilation = Readonly<{
  plan: ExecutionPlan;
  diagnostics: readonly Diagnostic[];
}>;

const validateBeforePruning = (
  composition: CompositionIR,
  placements: readonly TrackPlacement[],
  bpm: Fraction,
): void => {
  const diagnostics: Diagnostic[] = [];

  for (const { track, start: trackStart } of placements) {
    if (track.type !== "instrument-track") continue;
    const instrument = track.instrument;
    if (!Number.isSafeInteger(instrument.maxVoices) || instrument.maxVoices <= 0) {
      diagnostics.push(
        diagnosticFor(
          composition,
          "plan.poly-synth-max-voices-invalid",
          "PolySynth maxVoices must be a positive safe integer.",
          instrument,
        ),
      );
    }
    if (!["sine", "saw", "square"].includes(instrument.oscillator)) {
      diagnostics.push(
        diagnosticFor(
          composition,
          "plan.poly-synth-oscillator-invalid",
          "PolySynth oscillator must be sine, saw, or square.",
          instrument,
        ),
      );
    }
    if (
      !Number.isFinite(instrument.envelope.sustain) ||
      instrument.envelope.sustain < 0 ||
      instrument.envelope.sustain > 1 ||
      !Number.isFinite(canonicalF32(instrument.envelope.sustain)) ||
      canonicalF32(instrument.envelope.sustain) < 0 ||
      canonicalF32(instrument.envelope.sustain) > 1
    ) {
      diagnostics.push(
        diagnosticFor(
          composition,
          "plan.poly-synth-sustain-invalid",
          "PolySynth sustain must remain finite and within zero to one after Float32 conversion.",
          instrument,
        ),
      );
    }
    for (const [name, envelopeDuration] of Object.entries({
      attack: instrument.envelope.attack,
      decay: instrument.envelope.decay,
      release: instrument.envelope.release,
    })) {
      if (
        envelopeDuration.type !== "absolute-duration" ||
        !isCanonicalNonNegativeRational(envelopeDuration.seconds)
      ) {
        diagnostics.push(
          diagnosticFor(
            composition,
            "plan.poly-synth-envelope-invalid",
            `PolySynth ${name} must be a canonical non-negative absolute duration.`,
            instrument,
          ),
        );
      }
    }

    for (const clip of track.clips) {
      const clipStart = addFractions(trackStart, positionToSeconds(clip.from, bpm));

      clip.events.forEach((event, eventIndex) => {
        const noteDuration = durationToSeconds(event.duration, bpm);
        const noteStart = addFractions(clipStart, positionToSeconds(event.at, bpm));
        const noteEnd = addFractions(noteStart, noteDuration);

        if (noteDuration.numerator === 0n) {
          diagnostics.push({
            code: "plan.note-duration-non-positive",
            phase: "planning",
            severity: "error",
            message: "A note duration must be strictly positive.",
            compositionId: composition.compositionId,
            nodePath: clip.path,
            ...(clip.source === undefined ? {} : { source: clip.source }),
            cause: { eventIndex },
            suggestion: "Give the note a duration greater than zero.",
          });
        }

        const semitonesFromA4 = event.pitch.semitonesFromA4;
        const frequencyHz = 440 * 2 ** (semitonesFromA4 / 12);
        if (
          !Number.isSafeInteger(semitonesFromA4) ||
          !Number.isFinite(frequencyHz) ||
          frequencyHz <= 0 ||
          frequencyHz >= SAMPLE_RATE / 2
        ) {
          diagnostics.push({
            code: "plan.pitch-outside-executable-range",
            phase: "planning",
            severity: "error",
            message: "The note pitch is outside the executable frequency range.",
            compositionId: composition.compositionId,
            nodePath: clip.path,
            ...(clip.source === undefined ? {} : { source: clip.source }),
            cause: { eventIndex },
            suggestion: "Choose a pitch whose frequency is finite, positive, and below Nyquist.",
          });
        }

        if (!Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 1) {
          diagnostics.push({
            code: "plan.note-velocity-out-of-range",
            phase: "planning",
            severity: "error",
            message: "A note velocity must be finite and between zero and one.",
            compositionId: composition.compositionId,
            nodePath: clip.path,
            ...(clip.source === undefined ? {} : { source: clip.source }),
            cause: { eventIndex },
            suggestion: "Choose a velocity in the inclusive range from zero to one.",
          });
        }

        if (
          roundedFrameFromSeconds(noteStart) > MAX_SAFE_FRAME ||
          roundedFrameFromSeconds(noteEnd) > MAX_SAFE_FRAME
        ) {
          diagnostics.push({
            code: "plan.frame-out-of-safe-range",
            phase: "planning",
            severity: "error",
            message: "A note resolves to a frame outside the safe integer range.",
            compositionId: composition.compositionId,
            nodePath: clip.path,
            ...(clip.source === undefined ? {} : { source: clip.source }),
            cause: { eventIndex },
            suggestion: "Move the note into the supported frame range.",
          });
        }
      });
    }
  }

  if (diagnostics.length > 0) {
    throw new ResonaError("The composition cannot be planned.", diagnostics);
  }
};

export const compileExecutionPlan = (
  composition: CompositionIR,
  resolvedResources: readonly PreparedAudioRuntimeResource[] = [],
): PlanCompilation => {
  const bpm = validateHeader(composition);
  const compositionDuration = durationToSeconds(composition.duration, bpm);
  const zero = fraction(0n);
  const placements: TrackPlacement[] = [];
  collectTracks(composition.root, zero, compositionDuration, bpm, placements);
  validateBeforePruning(composition, placements, bpm);

  const processors: ProcessorPlan[] = [];
  const routes: SignalRoute[] = [];
  const candidates: NoteCandidate[] = [];
  const gainByNodePath = new Map<string, number>();
  const gainOwnerByNodePath = new Map<string, string>();
  const resources: ResolvedResourcePlan[] = [];
  const resourceIndices = new Map<string, number>();
  const audioRegions: AudioRegionPlan[] = [];
  const audioDiagnostics: Diagnostic[] = [];
  const automationKeys = new Set<string>();

  for (const placement of placements) {
    const instrumentIndex = processors.length;
    if (placement.track.type === "instrument-track") {
      const instrument = placement.track.instrument;
      processors.push({
        type: "poly-synth",
        maxVoices: instrument.maxVoices,
        oscillator: instrument.oscillator,
        attackFrames: frameFromSeconds(durationToSeconds(instrument.envelope.attack, bpm)),
        decayFrames: frameFromSeconds(durationToSeconds(instrument.envelope.decay, bpm)),
        sustain: canonicalF32(instrument.envelope.sustain),
        releaseFrames: frameFromSeconds(durationToSeconds(instrument.envelope.release, bpm)),
      });
    } else {
      processors.push({ type: "sum" });
    }

    let effectInput = instrumentIndex;
    for (const effect of placement.track.effects) {
      const effectIndex = processors.length;
      if (effect.type === "gain") {
        const canonicalGain = canonicalF32(effect.gain);
        if (!Number.isFinite(effect.gain) || effect.gain < 0 || !Number.isFinite(canonicalGain)) {
          throw new ResonaError("Gain must be a finite non-negative multiplier.", [
            diagnosticFor(
              composition,
              "plan.gain-invalid",
              "Gain must be finite and non-negative.",
              effect,
            ),
          ]);
        }
        processors.push({ type: "gain", gain: canonicalGain });
        gainByNodePath.set(JSON.stringify(effect.path), effectIndex);
        gainOwnerByNodePath.set(JSON.stringify(effect.path), JSON.stringify(placement.track.path));
      } else {
        const delayFrames = frameFromSeconds(fractionFromIR(effect.time.seconds));
        if (delayFrames <= 0 || !Number.isSafeInteger(delayFrames)) {
          throw new ResonaError("Delay time must resolve to at least one frame.", [
            diagnosticFor(
              composition,
              "plan.delay-time-invalid",
              "Delay time must resolve to a positive frame count.",
              effect,
            ),
          ]);
        }
        const canonicalFeedback = canonicalF32(effect.feedback);
        const canonicalMix = canonicalF32(effect.mix);
        if (
          !Number.isFinite(effect.feedback) ||
          effect.feedback < 0 ||
          effect.feedback >= 1 ||
          !Number.isFinite(canonicalFeedback) ||
          canonicalFeedback >= 1
        ) {
          throw new ResonaError("Delay feedback must be finite and less than one.", [
            diagnosticFor(
              composition,
              "plan.delay-feedback-invalid",
              "Delay feedback must be in [0, 1).",
              effect,
            ),
          ]);
        }
        if (
          !Number.isFinite(effect.mix) ||
          effect.mix < 0 ||
          effect.mix > 1 ||
          !Number.isFinite(canonicalMix)
        ) {
          throw new ResonaError("Delay mix must be finite and within [0, 1].", [
            diagnosticFor(
              composition,
              "plan.delay-mix-invalid",
              "Delay mix must be in [0, 1].",
              effect,
            ),
          ]);
        }
        processors.push({
          type: "delay",
          delayFrames,
          feedback: canonicalFeedback,
          mix: canonicalMix,
        });
      }
      routes.push({ from: effectInput, to: effectIndex });
      effectInput = effectIndex;
    }

    for (const clip of placement.track.clips) {
      const clipStart = addFractions(placement.start, positionToSeconds(clip.from, bpm));
      if (clip.type === "audio-clip") {
        const resource = resolvedResources.find((candidate) =>
          candidate.sourcePaths.includes(clip.resource.path),
        );
        if (resource === undefined) {
          throw new ResonaError("AudioClip resource was not prepared.", [
            diagnosticFor(
              composition,
              "plan.audio-resource-missing",
              "AudioClip requires a prepared WAV resource.",
              clip,
            ),
          ]);
        }
        const resourceIndex =
          resourceIndices.get(resource.hash) ??
          (() => {
            const index = resources.length;
            resources.push({
              type: resource.type,
              hash: resource.hash,
              channels: resource.channels,
              sampleRate: resource.sampleRate,
              frameCount: resource.frameCount,
            });
            resourceIndices.set(resource.hash, index);
            return index;
          })();
        const sourceOffsetFrame = frameFromSeconds(fractionFromIR(clip.offset.seconds));
        if (sourceOffsetFrame < 0 || sourceOffsetFrame >= resource.frameCount) {
          throw new ResonaError("AudioClip offset is outside the resource.", [
            diagnosticFor(
              composition,
              "plan.audio-offset-invalid",
              "AudioClip offset must reference an existing resource frame.",
              clip,
            ),
          ]);
        }
        if (clip.loop && clip.duration === undefined) {
          throw new ResonaError("Looped AudioClip requires a duration.", [
            diagnosticFor(
              composition,
              "plan.audio-loop-duration-required",
              "A looped AudioClip must declare a duration.",
              clip,
            ),
          ]);
        }
        const requestedDuration =
          clip.duration === undefined
            ? resource.frameCount - sourceOffsetFrame
            : frameFromSeconds(durationToSeconds(clip.duration, bpm));
        if (requestedDuration <= 0) {
          throw new ResonaError("AudioClip duration must be positive.", [
            diagnosticFor(
              composition,
              "plan.audio-duration-invalid",
              "AudioClip duration must be positive.",
              clip,
            ),
          ]);
        }
        if (!clip.loop && requestedDuration > resource.frameCount - sourceOffsetFrame) {
          audioDiagnostics.push({
            code: "plan.audio-duration-exceeds-resource",
            phase: "planning",
            severity: "warning",
            message:
              "AudioClip duration exceeds the available resource frames; the remainder is silence.",
            compositionId: composition.compositionId,
            nodePath: clip.path,
          });
        }
        const startFrame = frameFromSeconds(clipStart);
        if (startFrame < 0) {
          throw new ResonaError("AudioClip cannot begin before frame zero.", [
            diagnosticFor(
              composition,
              "plan.audio-start-invalid",
              "AudioClip start must be non-negative.",
              clip,
            ),
          ]);
        }
        const activeEndFrame = Math.min(
          frameFromSeconds(compositionDuration),
          frameFromSeconds(placement.end),
        );
        if (startFrame >= activeEndFrame) continue;
        const durationFrames = Math.min(requestedDuration, activeEndFrame - startFrame);
        audioRegions.push({
          type: "audio-region",
          resource: resourceIndex,
          destination: instrumentIndex,
          startFrame,
          durationFrames,
          sourceOffsetFrame,
          loop: clip.loop,
        });
        continue;
      }
      clip.events.forEach((event, eventIndex) => {
        const noteStart = addFractions(clipStart, positionToSeconds(event.at, bpm));
        const naturalEnd = addFractions(noteStart, durationToSeconds(event.duration, bpm));
        candidates.push({
          clipPath: clip.path,
          eventIndex,
          instrument: instrumentIndex,
          start: noteStart,
          end: minimumFraction(naturalEnd, placement.end),
          activeStart: placement.start,
          activeEnd: placement.end,
          semitonesFromA4: event.pitch.semitonesFromA4,
          velocity: event.velocity,
        });
      });
    }
  }

  const masterProcessor = processors.length;
  processors.push({ type: "sum" });
  for (let processorIndex = 0; processorIndex < masterProcessor; processorIndex += 1) {
    if (routes.some((route) => route.to === processorIndex)) continue;
    let sink = processorIndex;
    while (true) {
      const next = routes.find((route) => route.from === sink);
      if (next === undefined) break;
      sink = next.to;
    }
    if (!routes.some((route) => route.from === sink && route.to === masterProcessor)) {
      routes.push({ from: sink, to: masterProcessor });
    }
  }

  candidates.sort((left, right) => {
    const pathOrder = comparePaths(left.clipPath, right.clipPath);
    return pathOrder === 0 ? left.eventIndex - right.eventIndex : pathOrder;
  });

  const events: InstrumentEventPlan[] = [];
  const roundedAwayByClip = new Map<string, Readonly<{ path: NodePath; count: number }>>();
  let occurrence = 0;
  for (const candidate of candidates) {
    if (
      compareFractions(candidate.start, candidate.activeStart) < 0 ||
      compareFractions(candidate.start, candidate.activeEnd) >= 0 ||
      compareFractions(candidate.start, compositionDuration) >= 0
    ) {
      continue;
    }

    const attackFrame = frameFromSeconds(candidate.start);
    const releaseFrame = frameFromSeconds(minimumFraction(candidate.end, compositionDuration));
    if (attackFrame >= releaseFrame) {
      const key = JSON.stringify(candidate.clipPath);
      const previous = roundedAwayByClip.get(key);
      roundedAwayByClip.set(key, {
        path: candidate.clipPath,
        count: (previous?.count ?? 0) + 1,
      });
      continue;
    }

    events.push({
      type: "note-attack",
      frame: attackFrame,
      instrument: candidate.instrument,
      occurrence,
      semitonesFromA4: candidate.semitonesFromA4,
      velocity: canonicalF32(candidate.velocity),
    });
    events.push({
      type: "note-release",
      frame: releaseFrame,
      instrument: candidate.instrument,
      occurrence,
    });
    occurrence += 1;
  }

  events.sort((left, right) => {
    if (left.frame !== right.frame) {
      return left.frame - right.frame;
    }
    if (left.type !== right.type) {
      return left.type === "note-release" ? -1 : 1;
    }
    return left.occurrence - right.occurrence;
  });

  const usedResourceHashes = new Set(
    audioRegions.map((region) => resources[region.resource]!.hash),
  );
  const sortedResources = resources
    .filter((resource) => usedResourceHashes.has(resource.hash))
    .sort((left, right) => left.hash.localeCompare(right.hash));
  const resourceRemap = new Map(sortedResources.map((resource, index) => [resource.hash, index]));
  const sortedAudioRegions = audioRegions
    .map((region, encounter) => ({
      ...region,
      resource: resourceRemap.get(resources[region.resource]!.hash)!,
      encounter,
    }))
    .sort(
      (left, right) =>
        left.destination - right.destination ||
        left.startFrame - right.startFrame ||
        left.encounter - right.encounter,
    )
    .map((entry) => {
      const { encounter, ...region } = entry;
      void encounter;
      return region;
    });

  const plan: ExecutionPlan = {
    format: "resona/execution-plan",
    schemaVersion: 1,
    compositionId: composition.compositionId,
    sampleRate: SAMPLE_RATE,
    channels: 2,
    nominalDurationFrames: frameFromSeconds(compositionDuration),
    masterProcessor,
    processors,
    routes,
    resources: sortedResources,
    audioRegions: sortedAudioRegions,
    events,
    automation: placements.flatMap((placement) =>
      placement.track.automation.map((lane) => {
        const automationKey = `${JSON.stringify(lane.target.nodePath)}:${lane.target.parameterId}`;
        if (automationKeys.has(automationKey)) {
          throw new ResonaError("Duplicate automation lanes target the same parameter.", [
            diagnosticFor(
              composition,
              "plan.automation-target-duplicate",
              "Only one automation lane may target a parameter.",
              lane,
            ),
          ]);
        }
        automationKeys.add(automationKey);
        if (lane.points.length === 0) {
          throw new ResonaError("Automation lanes require at least one point.", [
            diagnosticFor(
              composition,
              "plan.automation-empty",
              "Automation lane must contain a point.",
              lane,
            ),
          ]);
        }
        const targetPath = JSON.stringify(lane.target.nodePath);
        const target =
          lane.target.parameterId === "gain" &&
          gainOwnerByNodePath.get(targetPath) === JSON.stringify(placement.track.path)
            ? gainByNodePath.get(targetPath)
            : undefined;
        if (target === undefined) {
          throw new ResonaError("Automation target has no Gain processor.", [
            diagnosticFor(
              composition,
              "plan.automation-target-missing",
              "Gain automation requires a Gain effect.",
              placement.track,
            ),
          ]);
        }
        const points = lane.points.map((point) => ({
          frame: frameFromSeconds(addFractions(placement.start, positionToSeconds(point.at, bpm))),
          value: canonicalF32(point.value),
          interpolation: point.interpolation,
        }));
        if (points.some((point) => !Number.isFinite(point.value) || point.value < 0)) {
          throw new ResonaError("Automation values must be finite non-negative multipliers.", [
            diagnosticFor(
              composition,
              "plan.automation-value-invalid",
              "Automation values must be finite and non-negative.",
              lane,
            ),
          ]);
        }
        const sorted = [...points].sort((a, b) => a.frame - b.frame);
        const collision = sorted.some(
          (point, index) => index > 0 && point.frame === sorted[index - 1]!.frame,
        );
        if (collision)
          throw new ResonaError("Automation points collide after frame conversion.", [
            diagnosticFor(
              composition,
              "plan.automation-frame-collision",
              "Automation points must occupy distinct frames.",
              placement.track,
            ),
          ]);
        return { type: "gain" as const, target, points: sorted };
      }),
    ),
  };
  const diagnostics = [
    ...audioDiagnostics,
    ...[...roundedAwayByClip.values()].map(({ path, count }) => ({
      code: "plan.note-rounded-to-zero-frames",
      phase: "planning" as const,
      severity: "warning" as const,
      message: "One or more positive notes rounded to no executable frames.",
      compositionId: composition.compositionId,
      nodePath: path,
      cause: { count },
    })),
  ];

  return { plan, diagnostics };
};
