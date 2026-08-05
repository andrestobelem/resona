import { createContext, Fragment, useContext, type ComponentType, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  emptyInputSchema,
  resolveCompositionInputs,
  type InputSchema,
  type InputSchemaIR,
} from "./input-schema.js";
import type {
  AbsoluteDurationIR,
  CompositionIR,
  DurationIR,
  EventClipIR,
  InstrumentTrackIR,
  JsonObject,
  JsonValue,
  NodePath,
  NoteIR,
  PitchIR,
  PolySynthIR,
  PositionIR,
  RationalIR,
  SequenceIR,
} from "./model.js";
import { duration } from "./time/rational.js";

type CompositionDescriptor = Readonly<{
  id: string;
  component: ComponentType<JsonObject>;
  schema: InputSchema;
  defaultInputs: JsonObject;
  duration: DurationIR;
  bpm: RationalIR;
  timeSignature: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  metadata: JsonObject;
}>;

type MutableSequence = {
  type: "sequence";
  id: string;
  path: NodePath;
  from: PositionIR;
  duration?: DurationIR;
  children: (MutableSequence | MutableInstrumentTrack)[];
};

type MutableInstrumentTrack = {
  type: "instrument-track";
  id: string;
  path: NodePath;
  clips: EventClipIR[];
  instrument?: PolySynthIR;
  effects: [];
  automation: [];
};

type EvaluationSession = {
  compositionId: string;
  compositionDuration: DurationIR;
  root?: MutableSequence;
};

type EvaluationContextValue = Readonly<{
  session: EvaluationSession;
  parent?: MutableSequence;
}>;

const RegistrationContext = createContext<CompositionDescriptor[] | null>(null);
const EvaluationContext = createContext<EvaluationContextValue | null>(null);
const TrackContext = createContext<MutableInstrumentTrack | null>(null);

let registeredRoot: ComponentType | undefined;

const assertPublicId = (id: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) {
    throw new Error(`Invalid public ID: ${id}`);
  }
};

const cloneJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]),
    );
  }

  return value;
};

const cloneJsonObject = (value: JsonObject): JsonObject => cloneJsonValue(value) as JsonObject;

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
  component: ComponentType<TInputs>;
  schema?: InputSchema<TInputs>;
  defaultInputs?: TInputs;
  duration: DurationIR;
  bpm: RationalIR;
  timeSignature: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  metadata?: JsonObject;
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
    component: component as ComponentType<JsonObject>,
    schema: schema ?? emptyInputSchema,
    defaultInputs: defaultInputs === undefined ? {} : cloneJsonObject(defaultInputs),
    duration: compositionDuration,
    bpm,
    timeSignature: { ...timeSignature },
    metadata: cloneJsonObject(metadata),
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

type TrackProps = Readonly<{
  id: string;
  source: ReactElement;
  instrument: ReactElement;
}>;

export const Track = ({ id, source, instrument }: TrackProps): ReactElement => {
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
    effects: [],
    automation: [],
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

type EventClipProps = Readonly<{
  id: string;
  from: PositionIR;
  events: readonly NoteIR[];
}>;

export const EventClip = ({ id, from, events }: EventClipProps): null => {
  const track = useContext(TrackContext);
  if (track === null) {
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
  if (track === null) {
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
  for (const childId of [...track.clips.map((clip) => clip.id), track.instrument.id]) {
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
    effects: [],
    automation: [],
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
      child.type === "sequence" ? finalizeSequence(child) : finalizeTrack(child),
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
  inputs: JsonObject;
  inputSchema: InputSchemaIR;
}>;

export const resolveRegisteredComposition = (
  compositionId: string,
  overrides?: JsonObject,
): ResolvedRegisteredComposition => {
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

  const session: EvaluationSession = {
    compositionId: descriptor.id,
    compositionDuration: descriptor.duration,
  };
  const Component = descriptor.component;
  renderToStaticMarkup(
    <EvaluationContext.Provider value={{ session }}>
      <Component {...resolved.inputs} />
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
      duration: descriptor.duration,
      tempo: {
        type: "constant-tempo",
        bpm: descriptor.bpm,
        timeSignature: descriptor.timeSignature,
      },
      metadata: descriptor.metadata,
      root: finalizeSequence(session.root),
    },
    inputs: resolved.inputs,
    inputSchema: resolved.inputSchema,
  };
};

export const evaluateRegisteredComposition = (
  compositionId: string,
  inputs?: JsonObject,
): CompositionIR => resolveRegisteredComposition(compositionId, inputs).composition;
