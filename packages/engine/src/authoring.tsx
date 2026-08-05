import { createContext, Fragment, useContext, type ComponentType, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  emptyInputSchema,
  cloneJsonObject,
  resolveCompositionInputs,
  type DeepReadonly,
  type InputSchema,
} from "./input-schema.js";
import type {
  AbsoluteDurationIR,
  AudioClipIR,
  AudioTrackIR,
  CompositionIR,
  DurationIR,
  EventClipIR,
  EffectIR,
  InstrumentTrackIR,
  AutomationLaneIR,
  JsonObject,
  NodePath,
  NoteIR,
  PitchIR,
  PolySynthIR,
  PositionIR,
  RationalIR,
  SequenceIR,
} from "./model.js";
import {
  resolvePreparation,
  type PreparationResourceResolver,
  type PrepareComposition,
  type ResolvedVariant,
  type PreparedAudioRuntimeResource,
  type StaticAudioReference,
} from "./preparation.js";
import { deterministicRandom } from "./random.js";
import { duration } from "./time/rational.js";

type CompositionDescriptor = Readonly<{
  id: string;
  component: (inputs: JsonObject) => ReactElement | null;
  schema: InputSchema;
  defaultInputs: JsonObject;
  duration: DurationIR;
  bpm: RationalIR;
  timeSignature: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  metadata: JsonObject;
  prepare?: PrepareComposition<JsonObject>;
}>;

type MutableSequence = {
  type: "sequence";
  id: string;
  path: NodePath;
  from: PositionIR;
  duration?: DurationIR;
  children: (MutableSequence | MutableInstrumentTrack | MutableAudioTrack)[];
};

type MutableInstrumentTrack = {
  type: "instrument-track";
  id: string;
  path: NodePath;
  clips: EventClipIR[];
  instrument?: PolySynthIR;
  effects: InstrumentTrackIR["effects"];
  automation: AutomationLaneIR[];
};

type MutableAudioTrack = {
  type: "audio-track";
  id: string;
  path: NodePath;
  clips: AudioClipIR[];
  effects: AudioTrackIR["effects"];
  automation: AutomationLaneIR[];
};

type EvaluationSession = {
  compositionId: string;
  compositionDuration: DurationIR;
  seed: string;
  root?: MutableSequence;
};

type EvaluationContextValue = Readonly<{
  session: EvaluationSession;
  parent?: MutableSequence;
}>;

const RegistrationContext = createContext<CompositionDescriptor[] | null>(null);
const EvaluationContext = createContext<EvaluationContextValue | null>(null);
const TrackContext = createContext<(MutableInstrumentTrack | MutableAudioTrack) | null>(null);

let registeredRoot: ComponentType | undefined;

export const useRandom = (key: string): number => {
  const context = useContext(EvaluationContext);
  if (context === null) throw new Error("useRandom() must run while evaluating a composition.");
  return deterministicRandom(
    context.session.seed,
    context.parent?.path ?? [context.session.compositionId],
    key,
  );
};

const assertPublicId = (id: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) {
    throw new Error(`Invalid public ID: ${id}`);
  }
};

const cloneNote = (value: NoteIR): NoteIR => ({
  type: "note",
  at: value.at,
  duration: value.duration,
  pitch: value.pitch,
  velocity: value.velocity,
});

export const registerRoot = (root: ComponentType): void => {
  if (registeredRoot !== undefined && registeredRoot !== root) {
    throw new Error("A different Resona project root is already registered.");
  }

  registeredRoot = root;
};

type CompositionProps<TInputs extends JsonObject> = Readonly<{
  id: string;
  component: (inputs: DeepReadonly<TInputs>) => ReactElement | null;
  schema?: InputSchema<TInputs>;
  defaultInputs?: TInputs;
  duration: DurationIR;
  bpm: RationalIR;
  timeSignature: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  metadata?: JsonObject;
  prepare?: PrepareComposition<TInputs>;
}>;

export const Composition = <TInputs extends JsonObject = JsonObject>({
  id,
  component,
  schema,
  defaultInputs,
  duration: compositionDuration,
  bpm,
  timeSignature,
  metadata = {},
  prepare,
}: CompositionProps<TInputs>): null => {
  const registry = useContext(RegistrationContext);
  if (registry === null) {
    throw new Error("Composition must be rendered by a registered Resona project root.");
  }

  assertPublicId(id);
  if ((schema === undefined) !== (defaultInputs === undefined)) {
    throw new Error("Composition schema and defaultInputs must be declared together.");
  }
  registry.push({
    id,
    component: component as (inputs: JsonObject) => ReactElement | null,
    schema: schema ?? emptyInputSchema,
    defaultInputs: defaultInputs === undefined ? {} : cloneJsonObject(defaultInputs),
    duration: compositionDuration,
    bpm,
    timeSignature: { ...timeSignature },
    metadata: cloneJsonObject(metadata),
    ...(prepare === undefined ? {} : { prepare: prepare as PrepareComposition<JsonObject> }),
  });
  return null;
};

type SequenceProps = Readonly<{
  id: string;
  from: PositionIR;
  duration?: DurationIR;
  children?: ReactElement | readonly ReactElement[];
}>;

export const Sequence = ({
  id,
  from,
  duration: sequenceDuration,
  children,
}: SequenceProps): ReactElement => {
  const context = useContext(EvaluationContext);
  if (context === null) {
    throw new Error("Sequence must be rendered while evaluating a composition.");
  }

  assertPublicId(id);
  const isRoot = context.parent === undefined;
  const path = (
    isRoot ? [context.session.compositionId, id] : [...context.parent.path, id]
  ) as NodePath;
  const sequence: MutableSequence = {
    type: "sequence",
    id,
    path,
    from,
    ...(isRoot
      ? { duration: context.session.compositionDuration }
      : sequenceDuration === undefined
        ? {}
        : { duration: sequenceDuration }),
    children: [],
  };

  if (isRoot) {
    if (context.session.root !== undefined) {
      throw new Error("A composition must have exactly one root Sequence.");
    }
    context.session.root = sequence;
  } else {
    context.parent.children.push(sequence);
  }

  return (
    <EvaluationContext.Provider value={{ session: context.session, parent: sequence }}>
      {children}
    </EvaluationContext.Provider>
  );
};

type TrackBaseProps = Readonly<{
  id: string;
  source: ReactElement;
  gain?: number;
  automation?: readonly AutomationLaneIR[];
  effects?: readonly EffectIR[];
}>;

type TrackProps =
  | (TrackBaseProps & Readonly<{ instrument: ReactElement }>)
  | (TrackBaseProps & Readonly<{ instrument?: never }>);

export const Track = ({
  id,
  source,
  instrument,
  gain,
  automation = [],
  effects,
}: TrackProps): ReactElement => {
  if (effects !== undefined && gain !== undefined) {
    throw new Error("Track cannot combine the gain shorthand with an explicit effect chain.");
  }
  if (instrument === undefined) {
    return (
      <AudioTrack
        id={id}
        source={source}
        {...(gain === undefined ? {} : { gain })}
        {...(automation.length === 0 ? {} : { automation })}
        {...(effects === undefined ? {} : { effects })}
      />
    );
  }
  const context = useContext(EvaluationContext);
  if (context?.parent === undefined) {
    throw new Error("Track must be a child of Sequence.");
  }

  assertPublicId(id);
  const track: MutableInstrumentTrack = {
    type: "instrument-track",
    id,
    path: [...context.parent.path, id] as NodePath,
    clips: [],
    effects:
      effects !== undefined
        ? effects.map((effect) => ({ ...effect }))
        : gain === undefined && automation.length === 0
          ? []
          : [
              {
                type: "gain",
                id: `${id}-gain`,
                path: [...context.parent.path, id, `${id}-gain`] as NodePath,
                gain: gain ?? 1,
              },
            ],
    automation: automation.map((lane) => ({
      ...lane,
      points: lane.points.map((point) => ({ ...point })),
    })),
  };
  context.parent.children.push(track);

  return (
    <TrackContext.Provider value={track}>
      <Fragment>
        {source}
        {instrument}
      </Fragment>
    </TrackContext.Provider>
  );
};

type AudioTrackProps = Readonly<{
  id: string;
  source: ReactElement;
  gain?: number;
  automation?: readonly AutomationLaneIR[];
  effects?: readonly EffectIR[];
}>;

export const AudioTrack = ({
  id,
  source,
  gain,
  automation = [],
  effects,
}: AudioTrackProps): ReactElement => {
  if (effects !== undefined && gain !== undefined) {
    throw new Error("Track cannot combine the gain shorthand with an explicit effect chain.");
  }
  const context = useContext(EvaluationContext);
  if (context?.parent === undefined) {
    throw new Error("AudioTrack must be a child of Sequence.");
  }
  assertPublicId(id);
  const track: MutableAudioTrack = {
    type: "audio-track",
    id,
    path: [...context.parent.path, id] as NodePath,
    clips: [],
    effects:
      effects !== undefined
        ? effects.map((effect) => ({ ...effect }))
        : gain === undefined && automation.length === 0
          ? []
          : [
              {
                type: "gain",
                id: `${id}-gain`,
                path: [...context.parent.path, id, `${id}-gain`] as NodePath,
                gain: gain ?? 1,
              },
            ],
    automation: automation.map((lane) => ({
      ...lane,
      points: lane.points.map((point) => ({ ...point })),
    })),
  };
  context.parent.children.push(track);
  return <TrackContext.Provider value={track}>{source}</TrackContext.Provider>;
};

type EventClipProps = Readonly<{
  id: string;
  from: PositionIR;
  events: readonly NoteIR[];
}>;

export const EventClip = ({ id, from, events }: EventClipProps): null => {
  const track = useContext(TrackContext);
  if (track === null || track.type !== "instrument-track") {
    throw new Error("EventClip must be rendered in a Track source slot.");
  }

  assertPublicId(id);
  track.clips.push({
    type: "event-clip",
    id,
    path: [...track.path, id] as NodePath,
    from,
    events: events.map(cloneNote),
  });
  return null;
};

type AudioClipProps = Readonly<{
  id: string;
  src: StaticAudioReference;
  from: PositionIR;
  offset?: AbsoluteDurationIR;
  duration?: DurationIR;
  loop?: boolean;
}>;

export const AudioClip = ({
  id,
  src,
  from,
  offset = duration.seconds(0n),
  duration: clipDuration,
  loop = false,
}: AudioClipProps): null => {
  const track = useContext(TrackContext);
  if (track === null || track.type !== "audio-track") {
    throw new Error("AudioClip must be rendered in an AudioTrack source slot.");
  }
  assertPublicId(id);
  track.clips.push({
    type: "audio-clip",
    id,
    path: [...track.path, id] as NodePath,
    from,
    resource:
      src !== null &&
      typeof src === "object" &&
      src.type === "resona/static-audio" &&
      src.version === 1
        ? staticAudio(src.path)
        : (() => {
            throw new Error("AudioClip src must be a versioned static audio reference.");
          })(),
    offset,
    ...(clipDuration === undefined ? {} : { duration: clipDuration }),
    loop,
  });
  return null;
};

export const staticAudio = (path: string): StaticAudioReference => {
  const normalizedPath = typeof path === "string" ? path.replaceAll("\\", "/") : path;
  if (
    typeof normalizedPath !== "string" ||
    normalizedPath.length === 0 ||
    normalizedPath.startsWith("/") ||
    /^[A-Za-z]:/.test(normalizedPath) ||
    (() => {
      let depth = 0;
      for (const segment of normalizedPath.split(/[\\/]+/)) {
        if (segment === "..") {
          depth -= 1;
          if (depth < 0) return true;
        } else if (segment !== "" && segment !== ".") {
          depth += 1;
        }
      }
      return false;
    })()
  ) {
    throw new Error("Static audio paths must be non-empty relative paths.");
  }
  return Object.freeze({ type: "resona/static-audio", version: 1, path: normalizedPath });
};

export const chain = (...effects: readonly EffectIR[]): readonly EffectIR[] =>
  effects.map((effect) => ({ ...effect }));

type PolySynthProps = Readonly<{
  id: string;
  oscillator: "saw" | "sine" | "square";
  maxVoices?: number;
  attack?: AbsoluteDurationIR;
  decay?: AbsoluteDurationIR;
  sustain?: number;
  release?: AbsoluteDurationIR;
}>;

export const PolySynth = ({
  id,
  oscillator,
  maxVoices = 32,
  attack = duration.seconds(1n, 100n),
  decay = duration.seconds(1n, 10n),
  sustain = 0.8,
  release = duration.seconds(1n, 5n),
}: PolySynthProps): null => {
  const track = useContext(TrackContext);
  if (track === null || track.type !== "instrument-track") {
    throw new Error("PolySynth must be rendered in a Track instrument slot.");
  }

  if (track.instrument !== undefined) {
    throw new Error("An instrument Track must contain exactly one PolySynth.");
  }

  assertPublicId(id);
  track.instrument = {
    type: "poly-synth",
    id,
    path: [...track.path, id] as NodePath,
    maxVoices,
    oscillator,
    envelope: { attack, decay, sustain, release },
  };
  return null;
};

export const pitch = Object.freeze({
  semitonesFromA4: (semitonesFromA4: number): PitchIR =>
    Object.freeze({ type: "twelve-tet", semitonesFromA4 }),
});

type NoteInput = Readonly<{
  at: PositionIR;
  duration: DurationIR;
  pitch: PitchIR;
  velocity?: number;
}>;

export const note = ({
  at,
  duration: noteDuration,
  pitch: notePitch,
  velocity = 1,
}: NoteInput): NoteIR =>
  Object.freeze({
    type: "note",
    at,
    duration: noteDuration,
    pitch: notePitch,
    velocity,
  });

const finalizeTrack = (track: MutableInstrumentTrack): InstrumentTrackIR => {
  if (track.instrument === undefined) {
    throw new Error(`Instrument Track ${track.id} must contain exactly one PolySynth.`);
  }

  const childIds = new Set<string>();
  for (const childId of [
    ...track.clips.map((clip) => clip.id),
    track.instrument.id,
    ...track.effects.map((effect) => effect.id),
  ]) {
    if (childIds.has(childId)) {
      throw new Error(`Duplicate child ID ${childId} in Track ${track.id}.`);
    }
    childIds.add(childId);
  }

  return {
    type: "instrument-track",
    id: track.id,
    path: track.path,
    clips: track.clips,
    instrument: track.instrument,
    effects: track.effects,
    automation: track.automation,
  };
};

const finalizeAudioTrack = (track: MutableAudioTrack): AudioTrackIR => {
  const childIds = new Set<string>();
  for (const child of [...track.clips, ...track.effects]) {
    if (childIds.has(child.id)) {
      throw new Error(`Duplicate child ID ${child.id} in Track ${track.id}.`);
    }
    childIds.add(child.id);
  }
  return {
    type: "audio-track",
    id: track.id,
    path: track.path,
    clips: track.clips,
    effects: track.effects,
    automation: track.automation,
  };
};

const finalizeSequence = (sequence: MutableSequence): SequenceIR => {
  const childIds = new Set<string>();
  for (const child of sequence.children) {
    if (childIds.has(child.id)) {
      throw new Error(`Duplicate child ID ${child.id} in Sequence ${sequence.id}.`);
    }
    childIds.add(child.id);
  }

  return {
    type: "sequence",
    id: sequence.id,
    path: sequence.path,
    from: sequence.from,
    ...(sequence.duration === undefined ? {} : { duration: sequence.duration }),
    children: sequence.children.map((child) =>
      child.type === "sequence"
        ? finalizeSequence(child)
        : child.type === "instrument-track"
          ? finalizeTrack(child)
          : finalizeAudioTrack(child),
    ),
  };
};

const discoverCompositions = (): readonly CompositionDescriptor[] => {
  if (registeredRoot === undefined) {
    throw new Error("No Resona project root has been registered.");
  }

  const compositions: CompositionDescriptor[] = [];
  renderToStaticMarkup(
    <RegistrationContext.Provider value={compositions}>
      {(() => {
        const Root = registeredRoot;
        return <Root />;
      })()}
    </RegistrationContext.Provider>,
  );

  const compositionIds = new Set<string>();
  for (const composition of compositions) {
    if (compositionIds.has(composition.id)) {
      throw new Error(`Duplicate composition ID: ${composition.id}`);
    }
    compositionIds.add(composition.id);
  }

  return compositions;
};

type ResolvedRegisteredComposition = Readonly<{
  composition: CompositionIR;
  variant: ResolvedVariant;
  runtimeResources: readonly PreparedAudioRuntimeResource[];
}>;

export const resolveRegisteredComposition = async (
  compositionId: string,
  overrides?: JsonObject,
  signal: AbortSignal = new AbortController().signal,
  seed = "resona-default",
  resources: PreparationResourceResolver = Object.freeze({
    audio: async () => {
      throw new Error("Preparation resource resolution requires a project context.");
    },
  }),
): Promise<ResolvedRegisteredComposition> => {
  const descriptions = discoverCompositions();
  const descriptor = descriptions.find((candidate) => candidate.id === compositionId);
  if (descriptor === undefined) {
    throw new Error(`Unknown composition: ${compositionId}`);
  }

  const resolved = resolveCompositionInputs({
    compositionId,
    schema: descriptor.schema,
    defaultInputs: descriptor.defaultInputs,
    ...(overrides === undefined ? {} : { overrides }),
  });
  const preparation = await resolvePreparation({
    compositionId,
    inputs: resolved.inputs,
    duration: descriptor.duration,
    tempo: { bpm: descriptor.bpm, timeSignature: descriptor.timeSignature },
    metadata: descriptor.metadata,
    ...(descriptor.prepare === undefined ? {} : { prepare: descriptor.prepare }),
    signal,
    resources,
  });
  const variant: ResolvedVariant = {
    compositionId,
    inputs: resolved.inputs,
    inputSchema: resolved.inputSchema,
    seed,
    duration: preparation.duration,
    tempo: preparation.tempo,
    metadata: preparation.metadata,
    resources: preparation.resources,
    provenance: preparation.provenance,
  };

  const session: EvaluationSession = {
    compositionId: descriptor.id,
    compositionDuration: preparation.duration,
    seed,
  };
  const Component = descriptor.component;
  const EvaluateComponent = (): ReactElement | null => Component(resolved.inputs);
  renderToStaticMarkup(
    <EvaluationContext.Provider value={{ session }}>
      <EvaluateComponent />
    </EvaluationContext.Provider>,
  );

  if (session.root === undefined) {
    throw new Error(`Composition ${compositionId} must render one root Sequence.`);
  }

  return {
    composition: {
      format: "resona/composition-ir",
      schemaVersion: 1,
      compositionId: descriptor.id,
      duration: preparation.duration,
      tempo: {
        type: "constant-tempo",
        bpm: preparation.tempo.bpm,
        timeSignature: preparation.tempo.timeSignature,
      },
      metadata: preparation.metadata,
      root: finalizeSequence(session.root),
    },
    variant,
    runtimeResources: preparation.runtimeResources,
  };
};

export const evaluateRegisteredComposition = async (
  compositionId: string,
  inputs?: JsonObject,
): Promise<CompositionIR> =>
  (await resolveRegisteredComposition(compositionId, inputs)).composition;
