import type {
  CompositionIR,
  Diagnostic,
  ExecutionPlan,
  InstrumentEventPlan,
  InstrumentTrackIR,
  NodePath,
  ProcessorPlan,
  SequenceIR,
  SignalRoute,
  RationalIR,
} from "./model.js";
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
  track: InstrumentTrackIR;
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
    } else if (child.type === "instrument-track") {
      placements.push({ track: child, start, end });
    } else {
      throw new Error("Audio tracks are not implemented by the T01 planner slice.");
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

export const compileExecutionPlan = (composition: CompositionIR): PlanCompilation => {
  const bpm = validateHeader(composition);
  const compositionDuration = durationToSeconds(composition.duration, bpm);
  const zero = fraction(0n);
  const placements: TrackPlacement[] = [];
  collectTracks(composition.root, zero, compositionDuration, bpm, placements);
  validateBeforePruning(composition, placements, bpm);

  const processors: ProcessorPlan[] = [];
  const routes: SignalRoute[] = [];
  const candidates: NoteCandidate[] = [];

  for (const placement of placements) {
    const instrumentIndex = processors.length;
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

    for (const clip of placement.track.clips) {
      const clipStart = addFractions(placement.start, positionToSeconds(clip.from, bpm));
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
    routes.push({ from: processorIndex, to: masterProcessor });
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
    resources: [],
    audioRegions: [],
    events,
    automation: [],
  };
  const diagnostics = [...roundedAwayByClip.values()].map(({ path, count }) => ({
    code: "plan.note-rounded-to-zero-frames",
    phase: "planning" as const,
    severity: "warning" as const,
    message: "One or more positive notes rounded to no executable frames.",
    compositionId: composition.compositionId,
    nodePath: path,
    cause: { count },
  }));

  return { plan, diagnostics };
};
