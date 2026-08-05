import type { InputSchemaIR } from "./input-schema.js";
import type { ResolvedProject } from "./project-config.js";
import type { ResolvedVariant } from "./preparation.js";

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type RationalIR = Readonly<{
  numerator: string;
  denominator: string;
}>;

export type AbsolutePositionIR = Readonly<{
  type: "absolute-position";
  seconds: RationalIR;
}>;

export type MusicalPositionIR = Readonly<{
  type: "musical-position";
  quarterNotes: RationalIR;
}>;

export type PositionIR = AbsolutePositionIR | MusicalPositionIR;

export type AbsoluteDurationIR = Readonly<{
  type: "absolute-duration";
  seconds: RationalIR;
}>;

export type MusicalDurationIR = Readonly<{
  type: "musical-duration";
  quarterNotes: RationalIR;
}>;

export type DurationIR = AbsoluteDurationIR | MusicalDurationIR;

export type NodePath = readonly [compositionId: string, rootNodeId: string, ...nodeIds: string[]];

export type SourceLocation = Readonly<{
  file: string;
  line: number;
  column: number;
}>;

export type StaticAudioReference = Readonly<{
  type: "resona/static-audio";
  version: 1;
  path: string;
}>;

export type PitchIR = Readonly<{
  type: "twelve-tet";
  semitonesFromA4: number;
}>;

export type NoteIR = Readonly<{
  type: "note";
  at: PositionIR;
  duration: DurationIR;
  pitch: PitchIR;
  velocity: number;
}>;

export type EventClipIR = Readonly<{
  type: "event-clip";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  from: PositionIR;
  events: readonly NoteIR[];
}>;

export type AudioClipIR = Readonly<{
  type: "audio-clip";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  from: PositionIR;
  resource: StaticAudioReference;
  offset: AbsoluteDurationIR;
  duration?: DurationIR;
  loop: boolean;
}>;

export type PolySynthIR = Readonly<{
  type: "poly-synth";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  maxVoices: number;
  oscillator: "saw" | "sine" | "square";
  envelope: Readonly<{
    attack: AbsoluteDurationIR;
    decay: AbsoluteDurationIR;
    sustain: number;
    release: AbsoluteDurationIR;
  }>;
}>;

export type GainIR = Readonly<{
  type: "gain";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  gain: number;
}>;

export type DelayIR = Readonly<{
  type: "delay";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  time: AbsoluteDurationIR;
  feedback: number;
  mix: number;
}>;

export type EffectIR = GainIR | DelayIR;

export type AutomationPointIR = Readonly<{
  at: PositionIR;
  value: number;
  interpolation: "hold" | "linear";
}>;

export type AutomationLaneIR = Readonly<{
  type: "automation-lane";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  target: Readonly<{
    nodePath: NodePath;
    parameterId: "gain";
  }>;
  points: readonly AutomationPointIR[];
}>;

export type InstrumentTrackIR = Readonly<{
  type: "instrument-track";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  clips: readonly EventClipIR[];
  instrument: PolySynthIR;
  effects: readonly EffectIR[];
  automation: readonly AutomationLaneIR[];
}>;

export type AudioTrackIR = Readonly<{
  type: "audio-track";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  clips: readonly AudioClipIR[];
  effects: readonly EffectIR[];
  automation: readonly AutomationLaneIR[];
}>;

export type TrackIR = AudioTrackIR | InstrumentTrackIR;

export type SequenceIR = Readonly<{
  type: "sequence";
  id: string;
  path: NodePath;
  source?: SourceLocation;
  from: PositionIR;
  duration?: DurationIR;
  children: readonly (SequenceIR | TrackIR)[];
}>;

export type CompositionIR = Readonly<{
  format: "resona/composition-ir";
  schemaVersion: 1;
  compositionId: string;
  duration: DurationIR;
  tempo: Readonly<{
    type: "constant-tempo";
    bpm: RationalIR;
    timeSignature: Readonly<{
      beatsPerBar: number;
      beatUnit: number;
    }>;
  }>;
  metadata: JsonObject;
  root: SequenceIR;
}>;

export type ProcessorPlan =
  | Readonly<{ type: "sum" }>
  | Readonly<{
      type: "poly-synth";
      maxVoices: number;
      oscillator: "saw" | "sine" | "square";
      attackFrames: number;
      decayFrames: number;
      sustain: number;
      releaseFrames: number;
    }>
  | Readonly<{ type: "gain"; gain: number }>
  | Readonly<{
      type: "delay";
      delayFrames: number;
      feedback: number;
      mix: number;
    }>;

export type SignalRoute = Readonly<{
  from: number;
  to: number;
}>;

export type InstrumentEventPlan =
  | Readonly<{
      type: "note-release";
      frame: number;
      instrument: number;
      occurrence: number;
    }>
  | Readonly<{
      type: "note-attack";
      frame: number;
      instrument: number;
      occurrence: number;
      semitonesFromA4: number;
      velocity: number;
    }>;

export type ResolvedResourcePlan = Readonly<{
  type: "wav";
  hash: `sha256:${string}`;
  channels: 1 | 2;
  sampleRate: 48_000;
  frameCount: number;
}>;

export type AudioRegionPlan = Readonly<{
  type: "audio-region";
  resource: number;
  destination: number;
  startFrame: number;
  durationFrames: number;
  sourceOffsetFrame: number;
  loop: boolean;
}>;

export type AutomationPointPlan = Readonly<{
  frame: number;
  value: number;
  interpolation: "hold" | "linear";
}>;

export type AutomationLanePlan = Readonly<{
  type: "gain";
  target: number;
  points: readonly AutomationPointPlan[];
}>;

export type PlanTrace =
  | Readonly<{ type: "processor"; index: number; origin: NodePath }>
  | Readonly<{ type: "route"; index: number; from: NodePath; to: NodePath }>
  | Readonly<{ type: "resource"; index: number; origins: readonly NodePath[] }>
  | Readonly<{ type: "audio-region"; index: number; origin: NodePath }>
  | Readonly<{
      type: "instrument-event";
      index: number;
      origin: Readonly<{ clipPath: NodePath; eventIndex: number }>;
    }>
  | Readonly<{ type: "automation-lane"; index: number; origin: NodePath }>;

export type ExecutionPlan = Readonly<{
  format: "resona/execution-plan";
  schemaVersion: 1;
  compositionId: string;
  sampleRate: 48_000;
  channels: 2;
  nominalDurationFrames: number;
  masterProcessor: number;
  processors: readonly ProcessorPlan[];
  routes: readonly SignalRoute[];
  resources: readonly ResolvedResourcePlan[];
  audioRegions: readonly AudioRegionPlan[];
  events: readonly InstrumentEventPlan[];
  automation: readonly AutomationLanePlan[];
  trace?: readonly PlanTrace[];
}>;

export type Diagnostic = Readonly<{
  code: string;
  phase:
    | "configuration"
    | "input-validation"
    | "planning"
    | "preparation"
    | "registration"
    | "tsx-evaluation";
  severity: "error" | "warning";
  message: string;
  compositionId: string;
  nodePath?: NodePath;
  source?: SourceLocation;
  cause?: JsonObject;
  suggestion?: string;
}>;

export type CreateRenderJobResult = Readonly<{
  project: ResolvedProject;
  variant: ResolvedVariant;
  composition: CompositionIR;
  inputs: JsonObject;
  inputSchema: InputSchemaIR;
  plan: ExecutionPlan;
  diagnostics: readonly Diagnostic[];
}>;
