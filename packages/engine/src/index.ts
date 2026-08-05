export {
  Composition,
  AudioClip,
  chain,
  EventClip,
  PolySynth,
  Sequence,
  Track,
  note,
  pitch,
  registerRoot,
  staticAudio,
  useRandom,
} from "./authoring.js";
export { createRenderJob, type CreateRenderJobOptions } from "./create-render-job.js";
export {
  defineConfig,
  type ProjectConfig,
  type ResolvedProject,
  type ResolvedProjectConfiguration,
} from "./project-config.js";
export {
  type ConstantTempo,
  type MaybePromise,
  type PreparationResourceResolver,
  type PrepareComposition,
  type PrepareCompositionResult,
  type PreparedAudioRuntimeResource,
  type PreparedAudioMetadata,
  type ResolvedPreparation,
  type ResolvedVariant,
  type StaticAudioReference,
} from "./preparation.js";
export { type RenderSpec } from "./render-spec.js";
export {
  type DeepReadonly,
  type InferInputs,
  type InputSchema,
  type InputSchemaIR,
  type InputValidationIssue,
  type InputValidationResult,
} from "./input-schema.js";
export { ResonaError } from "./resona-error.js";
export type {
  CompositionIR,
  CreateRenderJobResult,
  Diagnostic,
  DurationIR,
  ExecutionPlan,
  JsonObject,
  NoteIR,
  PositionIR,
  RationalIR,
} from "./model.js";
export { duration, position, rational } from "./time/rational.js";
