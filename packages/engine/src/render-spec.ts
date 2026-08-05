import { createHash } from "node:crypto";

import { deepFreeze } from "./deep-freeze.js";
import type { CompositionIR, ExecutionPlan, JsonValue } from "./model.js";
import type { ResolvedProject } from "./project-config.js";
import type { ResolvedVariant } from "./preparation.js";
import { RANDOM_ALGORITHM_VERSION } from "./random.js";

export type RenderSpec = Readonly<{
  format: "resona/render-spec";
  schemaVersion: 1;
  engineVersion: "0.0.0";
  buildId: string;
  compositionId: string;
  compositionIrVersion: 1;
  executionPlanVersion: 1;
  randomAlgorithmVersion: 1;
  inputs: ResolvedVariant["inputs"];
  seed: ResolvedProject["configuration"]["seed"];
  metadata: ResolvedVariant["metadata"];
  provenance: ResolvedVariant["provenance"];
  configuration: Readonly<{
    entry: ResolvedProject["configuration"]["entry"];
    staticDir: ResolvedProject["configuration"]["staticDir"];
  }>;
  resourceHashes: readonly string[];
  hashes: Readonly<{ compositionIr: string; executionPlan: string }>;
  range: Readonly<{ startFrame: 0; endFrame: number; source: "resona-default" }>;
  tail: Readonly<{ type: "cut"; source: "resona-default" }>;
  options: Readonly<{
    sampleRate: Readonly<{ value: 48_000; source: "resona-default" }>;
    channels: Readonly<{ value: 2; source: "resona-default" }>;
    encoding: Readonly<{ value: "wav-float32"; source: "resona-default" }>;
  }>;
  runtime: Readonly<{
    platform: string;
    architecture: string;
    node: string;
    backend: "typescript";
  }>;
}>;

const canonicalJson = (value: JsonValue): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`)
    .join(",")}}`;
};

export const hashCanonicalJson = (value: JsonValue): string =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

export const createRenderIdentity = ({
  project,
  variant,
  composition,
  plan,
}: Readonly<{
  project: ResolvedProject;
  variant: ResolvedVariant;
  composition: CompositionIR;
  plan: ExecutionPlan;
}>): Readonly<{ spec: RenderSpec; fingerprint: string }> => {
  const spec: RenderSpec = deepFreeze({
    format: "resona/render-spec",
    schemaVersion: 1,
    engineVersion: "0.0.0",
    buildId: project.buildId,
    compositionId: variant.compositionId,
    compositionIrVersion: composition.schemaVersion,
    executionPlanVersion: plan.schemaVersion,
    randomAlgorithmVersion: RANDOM_ALGORITHM_VERSION,
    inputs: variant.inputs,
    seed: project.configuration.seed,
    metadata: variant.metadata,
    provenance: variant.provenance,
    configuration: {
      entry: project.configuration.entry,
      staticDir: project.configuration.staticDir,
    },
    resourceHashes: variant.resources.map((resource) => resource.hash).sort(),
    hashes: {
      compositionIr: hashCanonicalJson(composition),
      executionPlan: hashCanonicalJson(plan),
    },
    range: { startFrame: 0, endFrame: plan.nominalDurationFrames, source: "resona-default" },
    tail: { type: "cut", source: "resona-default" },
    options: {
      sampleRate: { value: 48_000, source: "resona-default" },
      channels: { value: 2, source: "resona-default" },
      encoding: { value: "wav-float32", source: "resona-default" },
    },
    runtime: {
      platform: process.platform,
      architecture: process.arch,
      node: process.versions.node,
      backend: "typescript",
    },
  });
  return deepFreeze({ spec, fingerprint: hashCanonicalJson(spec) });
};
