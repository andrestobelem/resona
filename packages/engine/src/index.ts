export {
  Composition,
  EventClip,
  PolySynth,
  Sequence,
  Track,
  note,
  pitch,
  registerRoot,
} from "./authoring.js";
export { createRenderJob, type CreateRenderJobOptions } from "./create-render-job.js";
export { ResonaError } from "./resona-error.js";
export type {
  CompositionIR,
  CreateRenderJobResult,
  Diagnostic,
  DurationIR,
  ExecutionPlan,
  NoteIR,
  PositionIR,
  RationalIR,
} from "./model.js";
export { duration, position, rational } from "./time/rational.js";
