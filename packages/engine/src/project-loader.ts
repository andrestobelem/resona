import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import type { CompositionIR, Diagnostic, ExecutionPlan, JsonObject } from "./model.js";
import type { CompositionSummary } from "./authoring.js";
import { deepFreeze } from "./deep-freeze.js";
import type { PreparedAudioRuntimeResource, ResolvedVariant } from "./preparation.js";
import {
  resolveProjectConfiguration,
  type ResolvedProject,
  type ResolvedProjectConfiguration,
} from "./project-config.js";
import { ResonaError } from "./resona-error.js";

type VariantCompilation = Readonly<{
  composition: CompositionIR;
  variant: ResolvedVariant;
  plan: ExecutionPlan;
  diagnostics: readonly Diagnostic[];
  runtimeResources: readonly PreparedAudioRuntimeResource[];
}>;

type ProjectCompilation = VariantCompilation & Readonly<{ project: ResolvedProject }>;

export type ProjectCompositions = Readonly<{
  project: ResolvedProject;
  compositions: readonly CompositionSummary[];
}>;

export type ProjectSourceOptions = Readonly<{
  configPath?: string;
  entryPoint?: string;
}>;

const engineModulePath = (name: string, sourceExtension: string): string => {
  const runtimeDirectory = fileURLToPath(new URL(".", import.meta.url));
  const compiledPath = join(runtimeDirectory, `${name}.js`);
  return existsSync(compiledPath)
    ? compiledPath
    : join(runtimeDirectory, `${name}.${sourceExtension}`);
};

const compileProjectEntry = (entryPoint: string): string => {
  const authoringPath = engineModulePath("authoring", "tsx");
  const planningPath = engineModulePath("planning", "ts");
  const resourceResolverPath = engineModulePath("static-audio-resolver", "ts");
  return [
    `import ${JSON.stringify(entryPoint)};`,
    `import {resolveRegisteredComposition} from ${JSON.stringify(authoringPath)};`,
    `import {listRegisteredCompositions} from ${JSON.stringify(authoringPath)};`,
    `import {compileExecutionPlan} from ${JSON.stringify(planningPath)};`,
    `import {createStaticAudioPreparationResolver} from ${JSON.stringify(resourceResolverPath)};`,
    "export const compileVariant = async (compositionId, providedInputs, signal, seed, staticDirectory) => {",
    "  const resources = createStaticAudioPreparationResolver(staticDirectory, signal);",
    "  const resolved = await resolveRegisteredComposition(compositionId, providedInputs, signal, seed, resources);",
    "  const compilation = compileExecutionPlan(resolved.composition, resolved.runtimeResources);",
    "  return {",
    "    composition: resolved.composition,",
    "    variant: resolved.variant,",
    "    plan: compilation.plan,",
    "    diagnostics: compilation.diagnostics,",
    "    runtimeResources: resolved.runtimeResources,",
    "  };",
    "};",
    "export const listCompositions = () => listRegisteredCompositions();",
  ].join("\n");
};

const workerSource = [
  'import { parentPort, workerData } from "node:worker_threads";',
  "try {",
  '  const forwardLog = (...args) => parentPort.postMessage({ type: "log", message: args.map(String).join(" ") });',
  "  console.log = forwardLog;",
  "  console.info = forwardLog;",
  "  const project = await import(workerData.moduleUrl);",
  "  const controller = new AbortController();",
  '  parentPort.on("message", (message) => { if (message?.type === "abort") controller.abort(); });',
  "  const compilation = await project.compileVariant(workerData.compositionId, workerData.inputs, controller.signal, workerData.seed, workerData.staticDirectory);",
  '  parentPort.postMessage({ type: "success", compilation: {',
  "    composition: compilation.composition,",
  "    variant: compilation.variant,",
  "    plan: compilation.plan,",
  "    diagnostics: compilation.diagnostics,",
  "    runtimeResources: compilation.runtimeResources,",
  "  } });",
  "} catch (error) {",
  '  const details = error !== null && typeof error === "object" ? error : {};',
  '  parentPort.postMessage({ type: "failure", error: {',
  '    name: typeof details.name === "string" ? details.name : "Error",',
  '    message: typeof details.message === "string" ? details.message : "The project could not be evaluated.",',
  "    diagnostics: Array.isArray(details.diagnostics) ? details.diagnostics : undefined,",
  "  } });",
  "}",
].join("\n");

const discoveryWorkerSource = [
  'import { parentPort, workerData } from "node:worker_threads";',
  "try {",
  '  const forwardLog = (...args) => parentPort.postMessage({ type: "log", message: args.map(String).join(" ") });',
  "  console.log = forwardLog;",
  "  console.info = forwardLog;",
  "  const project = await import(workerData.moduleUrl);",
  '  parentPort.postMessage({ type: "success", compositions: project.listCompositions() });',
  "} catch (error) {",
  '  parentPort.postMessage({ type: "failure", message: error instanceof Error ? error.message : "The project could not be inspected." });',
  "}",
].join("\n");

const runCompositionDiscovery = (moduleUrl: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(`data:text/javascript,${encodeURIComponent(discoveryWorkerSource)}`),
      { workerData: { moduleUrl } },
    );
    worker.on("message", (message: unknown) => {
      if (
        message !== null &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "log" &&
        "message" in message
      ) {
        process.stderr.write(`[resona] ${String(message.message)}\n`);
        return;
      }
      void worker.terminate();
      if (
        message !== null &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "success" &&
        "compositions" in message
      ) {
        resolve(message.compositions);
      } else {
        reject(
          new Error(
            (message as { message?: string }).message ?? "The project could not be inspected.",
          ),
        );
      }
    });
    worker.once("error", (error) => {
      void worker.terminate();
      reject(error);
    });
  });

const engineNodePath = resolve(fileURLToPath(new URL(".", import.meta.url)), "../node_modules");

const configWorkerSource = [
  'import { parentPort, workerData } from "node:worker_threads";',
  "try {",
  "  const configuration = await import(workerData.moduleUrl);",
  '  parentPort.postMessage({ type: "success", config: configuration.default });',
  "} catch (error) {",
  '  parentPort.postMessage({ type: "failure", message: error instanceof Error ? error.message : "Project config failed." });',
  "}",
].join("\n");

const runInFreshWorker = (
  moduleUrl: string,
  compositionId: string,
  staticDirectory: string,
  inputs?: JsonObject,
  seed = "resona-default",
  signal?: AbortSignal,
): Promise<VariantCompilation> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`), {
      workerData: { moduleUrl, compositionId, staticDirectory, inputs: inputs ?? {}, seed },
    });

    let settled = false;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    const cancellationError = (): ResonaError =>
      new ResonaError("Composition preparation was cancelled.", [
        {
          code: "preparation.cancelled",
          phase: "preparation",
          severity: "error",
          message: "Composition preparation was cancelled.",
          compositionId,
        },
      ]);
    const cleanup = (): void => {
      if (terminationTimer !== undefined) clearTimeout(terminationTimer);
      signal?.removeEventListener("abort", abort);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      void worker.terminate();
      callback();
    };
    const abort = (): void => {
      if (settled) return;
      worker.postMessage({ type: "abort" });
      terminationTimer = setTimeout(() => finish(() => reject(cancellationError())), 100);
    };
    if (signal?.aborted === true) {
      finish(() => reject(cancellationError()));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    worker.on("message", (message: unknown) => {
      if (
        message !== null &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "log" &&
        "message" in message
      ) {
        process.stderr.write(`[resona] ${String(message.message)}\n`);
        return;
      }
      if (
        message !== null &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "success" &&
        "compilation" in message
      ) {
        finish(() => resolve(message.compilation as VariantCompilation));
        return;
      }

      const failure = message as Readonly<{
        error?: Readonly<{ name?: string; message?: string; diagnostics?: Diagnostic[] }>;
      }>;
      const failureError = failure.error;
      const failureDiagnostics = failureError?.diagnostics;
      if (failureError?.name === "ResonaError" && failureDiagnostics !== undefined) {
        finish(() =>
          reject(
            new ResonaError(
              failureError.message ?? "Project evaluation failed.",
              failureDiagnostics,
            ),
          ),
        );
        return;
      }
      finish(() => reject(new Error(failure.error?.message ?? "The project worker failed.")));
    });
    worker.once("error", (error) => finish(() => reject(error)));
  });

const loadConfigValue = (moduleUrl: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(`data:text/javascript,${encodeURIComponent(configWorkerSource)}`),
      { workerData: { moduleUrl } },
    );
    worker.on("message", (message: unknown) => {
      if (
        message !== null &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "log" &&
        "message" in message
      ) {
        process.stderr.write(`[resona] ${String(message.message)}\n`);
        return;
      }
      void worker.terminate();
      if (message !== null && typeof message === "object" && "type" in message) {
        if (message.type === "success" && "config" in message) {
          resolve(message.config);
          return;
        }
        if (message.type === "failure" && "message" in message) {
          reject(new Error(String(message.message)));
          return;
        }
      }
      reject(new Error("Project config worker returned an invalid result."));
    });
    worker.once("error", reject);
  });

const assertEntryPoint = (entryPoint: string): string => {
  if (!existsSync(entryPoint)) {
    throw new Error(`No Resona entry point found at ${entryPoint}.`);
  }
  return entryPoint;
};

const loadProjectConfiguration = async (
  projectRoot: string,
  directory: string,
  sourceOptions: ProjectSourceOptions = {},
): Promise<
  Readonly<{
    entryPoint: string;
    staticDirectory: string;
    configuration: ResolvedProjectConfiguration;
  }>
> => {
  const configPath = sourceOptions.configPath ?? join(projectRoot, "resona.config.ts");
  const configValue = existsSync(configPath)
    ? await (async () => {
        try {
          const outputFile = join(directory, "config.mjs");
          await build({
            banner: {
              js: 'import { createRequire as __resonaCreateRequire } from "node:module"; const require = __resonaCreateRequire(import.meta.url);',
            },
            bundle: true,
            entryPoints: [configPath],
            format: "esm",
            outfile: outputFile,
            nodePaths: [engineNodePath],
            platform: "node",
            supported: { "top-level-await": false },
            target: "node24",
          });
          return await loadConfigValue(pathToFileURL(outputFile).href);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Project config failed.";
          throw new Error(`Project config could not be loaded: ${message}`);
        }
      })()
    : {};
  const resolved = resolveProjectConfiguration(projectRoot, configValue);
  const entryPoint =
    sourceOptions.entryPoint === undefined
      ? resolved.entryPoint
      : resolve(projectRoot, sourceOptions.entryPoint);
  const entryFromRoot = relative(projectRoot, entryPoint);
  if (
    entryFromRoot === ".." ||
    entryFromRoot.startsWith("../") ||
    entryFromRoot.startsWith("..\\")
  ) {
    throw new Error("Project entry must remain inside the project root.");
  }
  return {
    entryPoint: assertEntryPoint(entryPoint),
    staticDirectory: resolved.staticDirectory,
    configuration:
      sourceOptions.entryPoint === undefined
        ? resolved.configuration
        : deepFreeze({
            ...resolved.configuration,
            entry: { value: entryFromRoot, source: "invocation" as const },
          }),
  };
};

export const loadProjectCompilation = async (
  projectRoot: string,
  compositionId: string,
  inputs?: JsonObject,
  invocationSeed?: string,
  signal?: AbortSignal,
  sourceOptions: ProjectSourceOptions = {},
): Promise<ProjectCompilation> => {
  const directory = await mkdtemp(join(projectRoot, ".resona-project-"));
  const outputFile = join(directory, "project.mjs");

  try {
    if (signal?.aborted === true) {
      throw new ResonaError("Composition preparation was cancelled.", [
        {
          code: "preparation.cancelled",
          phase: "preparation",
          severity: "error",
          message: "Composition preparation was cancelled.",
          compositionId,
        },
      ]);
    }
    let resolvedProject: Awaited<ReturnType<typeof loadProjectConfiguration>>;
    try {
      resolvedProject = await loadProjectConfiguration(projectRoot, directory, sourceOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project configuration failed.";
      throw new ResonaError(message, [
        {
          code: "configuration.invalid",
          phase: "configuration",
          severity: "error",
          message,
          compositionId,
        },
      ]);
    }
    if (invocationSeed !== undefined && invocationSeed.length === 0) {
      throw new ResonaError("Render seed must be a non-empty string.", [
        {
          code: "configuration.seed-invalid",
          phase: "configuration",
          severity: "error",
          message: "Render seed must be a non-empty string.",
          compositionId,
        },
      ]);
    }
    const effectiveConfiguration = {
      ...resolvedProject.configuration,
      seed:
        invocationSeed === undefined
          ? resolvedProject.configuration.seed
          : { value: invocationSeed, source: "invocation" as const },
    };
    await build({
      banner: {
        js: 'import { createRequire as __resonaCreateRequire } from "node:module"; const require = __resonaCreateRequire(import.meta.url);',
      },
      bundle: true,
      format: "esm",
      jsx: "automatic",
      outfile: outputFile,
      nodePaths: [engineNodePath],
      platform: "node",
      stdin: {
        contents: compileProjectEntry(resolvedProject.entryPoint),
        resolveDir: projectRoot,
        sourcefile: "resona-project-entry.ts",
      },
      target: "node24",
    });
    const buildId = `sha256:${createHash("sha256")
      .update(await readFile(outputFile))
      .digest("hex")}`;
    const compilation = await runInFreshWorker(
      pathToFileURL(outputFile).href,
      compositionId,
      resolvedProject.staticDirectory,
      inputs,
      effectiveConfiguration.seed.value,
      signal,
    );
    return {
      ...compilation,
      project: {
        root: projectRoot,
        buildId,
        configuration: effectiveConfiguration,
      },
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

export const loadProjectCompositions = async (
  projectRoot: string,
  sourceOptions: ProjectSourceOptions = {},
): Promise<ProjectCompositions> => {
  if (!isAbsolute(projectRoot)) {
    throw new Error("projectRoot must be an absolute path.");
  }

  const canonicalProjectRoot = await realpath(projectRoot);
  const directory = await mkdtemp(join(canonicalProjectRoot, ".resona-project-"));
  const outputFile = join(directory, "project.mjs");

  try {
    const resolvedProject = await loadProjectConfiguration(
      canonicalProjectRoot,
      directory,
      sourceOptions,
    );
    await build({
      banner: {
        js: 'import { createRequire as __resonaCreateRequire } from "node:module"; const require = __resonaCreateRequire(import.meta.url);',
      },
      bundle: true,
      format: "esm",
      jsx: "automatic",
      outfile: outputFile,
      nodePaths: [engineNodePath],
      platform: "node",
      stdin: {
        contents: compileProjectEntry(resolvedProject.entryPoint),
        resolveDir: canonicalProjectRoot,
        sourcefile: "resona-project-entry.ts",
      },
      target: "node24",
    });
    const buildId = `sha256:${createHash("sha256")
      .update(await readFile(outputFile))
      .digest("hex")}`;
    const compositions = await runCompositionDiscovery(pathToFileURL(outputFile).href);
    if (!Array.isArray(compositions)) {
      throw new Error("The project discovery result was invalid.");
    }

    return deepFreeze({
      project: {
        root: canonicalProjectRoot,
        buildId,
        configuration: resolvedProject.configuration,
      },
      compositions: compositions as readonly CompositionSummary[],
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
