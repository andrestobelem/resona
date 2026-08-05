import { deepFreeze } from "./deep-freeze.js";
import { cloneJsonObject, type DeepReadonly, type InputSchemaIR } from "./input-schema.js";
import type { DurationIR, JsonObject, RationalIR } from "./model.js";
import { ResonaError } from "./resona-error.js";
import { durationToSeconds, fractionFromIR } from "./time/rational.js";

export type MaybePromise<Value> = Value | PromiseLike<Value>;

export type StaticAudioReference = Readonly<{
  type: "resona/static-audio";
  version: 1;
  path: string;
}>;

export type PreparedAudioMetadata = Readonly<{
  reference: StaticAudioReference;
  hash: string;
  sampleRate: 48_000;
  channels: 1 | 2;
  frames: number;
}>;

export type PreparationResourceResolver = Readonly<{
  audio(reference: StaticAudioReference): Promise<PreparedAudioMetadata>;
}>;

export type ConstantTempo = Readonly<{
  bpm: RationalIR;
  timeSignature: Readonly<{ beatsPerBar: number; beatUnit: number }>;
}>;

export type PrepareCompositionResult = Readonly<{
  duration?: DurationIR;
  tempo?: ConstantTempo;
  metadata?: JsonObject;
}>;

export type PrepareComposition<TInputs extends JsonObject> = (
  context: Readonly<{
    compositionId: string;
    inputs: DeepReadonly<TInputs>;
    signal: AbortSignal;
    resources: PreparationResourceResolver;
  }>,
) => MaybePromise<PrepareCompositionResult>;

export type PreparationProvenance = "prepare" | "static-declaration";

export type ResolvedPreparation = Readonly<{
  duration: DurationIR;
  tempo: ConstantTempo;
  metadata: JsonObject;
  provenance: Readonly<{
    duration: PreparationProvenance;
    tempo: PreparationProvenance;
    metadata: Readonly<Record<string, PreparationProvenance>>;
  }>;
}>;

export type ResolvedVariant = Readonly<{
  compositionId: string;
  inputs: JsonObject;
  inputSchema: InputSchemaIR;
  duration: DurationIR;
  tempo: ConstantTempo;
  metadata: JsonObject;
  resources: readonly PreparedAudioMetadata[];
  provenance: ResolvedPreparation["provenance"];
}>;

type ResolvePreparationOptions = Readonly<{
  compositionId: string;
  inputs: JsonObject;
  duration: DurationIR;
  tempo: ConstantTempo;
  metadata: JsonObject;
  prepare?: PrepareComposition<JsonObject>;
  signal: AbortSignal;
}>;

const unsupportedResources: PreparationResourceResolver = Object.freeze({
  audio: async (): Promise<PreparedAudioMetadata> => {
    throw new Error(
      "Static audio resources are not available until the audio resource adapter runs.",
    );
  },
});

const preparationError = (compositionId: string, error: unknown): ResonaError => {
  const message = error instanceof Error ? error.message : "Composition preparation failed.";
  return new ResonaError(message, [
    {
      code: "preparation.failed",
      phase: "preparation",
      severity: "error",
      message,
      compositionId,
    },
  ]);
};

const validateTiming = (duration: DurationIR, tempo: ConstantTempo): void => {
  const bpm = fractionFromIR(tempo.bpm);
  if (bpm.numerator <= 0n) throw new Error("Prepared BPM must be positive.");
  const { beatsPerBar, beatUnit } = tempo.timeSignature;
  if (!Number.isSafeInteger(beatsPerBar) || beatsPerBar <= 0) {
    throw new Error("Prepared beatsPerBar must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(beatUnit) || beatUnit <= 0 || (beatUnit & (beatUnit - 1)) !== 0) {
    throw new Error("Prepared beatUnit must be a positive power of two.");
  }
  durationToSeconds(duration, bpm);
};

export const resolvePreparation = async ({
  compositionId,
  inputs,
  duration,
  tempo,
  metadata,
  prepare,
  signal,
}: ResolvePreparationOptions): Promise<ResolvedPreparation> => {
  try {
    if (signal.aborted) throw new Error("Composition preparation was cancelled.");
    const prepared =
      prepare === undefined
        ? {}
        : await prepare({ compositionId, inputs, signal, resources: unsupportedResources });
    if (prepared === null || typeof prepared !== "object" || Array.isArray(prepared)) {
      throw new Error("Composition prepare() must return an object.");
    }
    const unknownKeys = Object.keys(prepared).filter(
      (key) => key !== "duration" && key !== "tempo" && key !== "metadata",
    );
    if (unknownKeys.length > 0) throw new Error(`Unknown prepare() field: ${unknownKeys[0]}.`);
    for (const field of ["duration", "tempo", "metadata"] as const) {
      if (field in prepared && prepared[field] === undefined) {
        throw new Error(`prepare() cannot return undefined for ${field}.`);
      }
    }

    const preparedMetadata =
      prepared.metadata === undefined ? undefined : cloneJsonObject(prepared.metadata);
    const resolvedDuration = structuredClone(prepared.duration ?? duration);
    const resolvedTempo = structuredClone(prepared.tempo ?? tempo);
    validateTiming(resolvedDuration, resolvedTempo);
    const metadataKeys = new Set([
      ...Object.keys(metadata),
      ...Object.keys(preparedMetadata ?? {}),
    ]);
    return deepFreeze({
      duration: resolvedDuration,
      tempo: resolvedTempo,
      metadata: { ...cloneJsonObject(metadata), ...preparedMetadata },
      provenance: {
        duration: prepared.duration === undefined ? "static-declaration" : "prepare",
        tempo: prepared.tempo === undefined ? "static-declaration" : "prepare",
        metadata: Object.fromEntries(
          [...metadataKeys].map((key) => [
            key,
            preparedMetadata !== undefined && key in preparedMetadata
              ? "prepare"
              : "static-declaration",
          ]),
        ),
      },
    });
  } catch (error) {
    if (error instanceof ResonaError) throw error;
    throw preparationError(compositionId, error);
  }
};
