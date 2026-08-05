import { isAbsolute, relative, resolve } from "node:path";

import { deepFreeze } from "./deep-freeze.js";

export type ProjectConfig = Readonly<{
  entry?: string;
  staticDir?: string;
  seed?: string;
}>;

export type ConfigurationSource = "invocation" | "project-config" | "resona-default";

export type ResolvedProjectConfiguration = Readonly<{
  entry: Readonly<{ value: string; source: ConfigurationSource }>;
  staticDir: Readonly<{ value: string; source: ConfigurationSource }>;
  seed: Readonly<{ value: string; source: ConfigurationSource }>;
}>;

export type ResolvedProject = Readonly<{
  root: string;
  buildId: string;
  configuration: ResolvedProjectConfiguration;
}>;

export const defineConfig = (config: ProjectConfig): ProjectConfig => deepFreeze({ ...config });

type ResolvedProjectPaths = Readonly<{
  entryPoint: string;
  staticDirectory: string;
  seed: Readonly<{ value: string; source: ConfigurationSource }>;
  configuration: ResolvedProjectConfiguration;
}>;

const configuredPath = (
  projectRoot: string,
  field: "entry" | "staticDir",
  value: unknown,
  fallback: string,
): Readonly<{ absolute: string; configured: string; source: ConfigurationSource }> => {
  const configured = value === undefined ? fallback : value;
  if (typeof configured !== "string" || configured.length === 0 || isAbsolute(configured)) {
    throw new Error(`Project config ${field} must be a non-empty relative path.`);
  }
  const absolute = resolve(projectRoot, configured);
  const fromRoot = relative(projectRoot, absolute);
  if (fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error(`Project config ${field} must remain inside the project root.`);
  }
  return {
    absolute,
    configured,
    source: value === undefined ? "resona-default" : "project-config",
  };
};

export const resolveProjectConfiguration = (
  projectRoot: string,
  config: unknown,
): ResolvedProjectPaths => {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Project config must export a plain object.");
  }
  const record = config as Readonly<Record<string, unknown>>;
  const unknownKeys = Object.keys(record).filter(
    (key) => key !== "entry" && key !== "staticDir" && key !== "seed",
  );
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown project config field: ${unknownKeys[0]}.`);
  }
  const entry = configuredPath(projectRoot, "entry", record.entry, "src/index.tsx");
  const staticDir = configuredPath(projectRoot, "staticDir", record.staticDir, "public");
  if (record.seed !== undefined && (typeof record.seed !== "string" || record.seed.length === 0)) {
    throw new Error("Project config seed must be a non-empty string.");
  }
  const seed = {
    value: record.seed ?? "resona-default",
    source: record.seed === undefined ? ("resona-default" as const) : ("project-config" as const),
  };
  return deepFreeze({
    entryPoint: entry.absolute,
    staticDirectory: staticDir.absolute,
    seed,
    configuration: {
      entry: { value: entry.configured, source: entry.source },
      staticDir: { value: staticDir.configured, source: staticDir.source },
      seed,
    },
  });
};
