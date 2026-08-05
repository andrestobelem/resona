import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import type { CompositionIR, Diagnostic, ExecutionPlan, JsonObject } from "./model.js";
import type { ResolvedVariant } from "./preparation.js";
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
}>;

type ProjectCompilation = VariantCompilation & Readonly<{ project: ResolvedProject }>;

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
  return [
    `import ${JSON.stringify(entryPoint)};`,
    `import {resolveRegisteredComposition} from ${JSON.stringify(authoringPath)};`,
    `import {compileExecutionPlan} from ${JSON.stringify(planningPath)};`,
    "export const compileVariant = async (compositionId, providedInputs, signal, seed) => {",
    "  const resolved = await resolveRegisteredComposition(compositionId, providedInputs, signal, seed);",
    "  const compilation = compileExecutionPlan(resolved.composition);",
    "  return {",
    "    composition: resolved.composition,",
    "    variant: resolved.variant,",
    "    plan: compilation.plan,",
    "    diagnostics: compilation.diagnostics,",
    "  };",
    "};",
  ].join("\n");
};

const workerSource = [
  'import { parentPort, workerData } from "node:worker_threads";',
  "try {",
  "  const project = await import(workerData.moduleUrl);",
  "  const controller = new AbortController();",
  "  const compilation = await project.compileVariant(workerData.compositionId, workerData.inputs, controller.signal, workerData.seed);",
  '  parentPort.postMessage({ type: "success", compilation: {',
  "    composition: compilation.composition,",
  "    variant: compilation.variant,",
  "    plan: compilation.plan,",
  "    diagnostics: compilation.diagnostics,",
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
  inputs?: JsonObject,
  seed = "resona-default",
): Promise<VariantCompilation> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`), {
      workerData: { moduleUrl, compositionId, inputs: inputs ?? {}, seed },
    });

    worker.once("message", (message: unknown) => {
      void worker.terminate();
      if (
        message !== null &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "success" &&
        "compilation" in message
      ) {
        resolve(message.compilation as VariantCompilation);
        return;
      }

      const failure = message as Readonly<{
        error?: Readonly<{ name?: string; message?: string; diagnostics?: Diagnostic[] }>;
      }>;
      if (failure.error?.name === "ResonaError" && failure.error.diagnostics !== undefined) {
        reject(
          new ResonaError(
            failure.error.message ?? "Project evaluation failed.",
            failure.error.diagnostics,
          ),
        );
        return;
      }
      reject(new Error(failure.error?.message ?? "The project worker failed."));
    });
    worker.once("error", reject);
  });

const loadConfigValue = (moduleUrl: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(`data:text/javascript,${encodeURIComponent(configWorkerSource)}`),
      { workerData: { moduleUrl } },
    );
    worker.once("message", (message: unknown) => {
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
): Promise<Readonly<{ entryPoint: string; configuration: ResolvedProjectConfiguration }>> => {
  const configPath = join(projectRoot, "resona.config.ts");
  const configValue = existsSync(configPath)
    ? await (async () => {
        const outputFile = join(directory, "config.mjs");
        await build({
          bundle: true,
          entryPoints: [configPath],
          format: "esm",
          outfile: outputFile,
          packages: "external",
          platform: "node",
          target: "node24",
        });
        return loadConfigValue(pathToFileURL(outputFile).href);
      })()
    : {};
  const resolved = resolveProjectConfiguration(projectRoot, configValue);
  return {
    entryPoint: assertEntryPoint(resolved.entryPoint),
    configuration: resolved.configuration,
  };
};

export const loadProjectCompilation = async (
  projectRoot: string,
  compositionId: string,
  inputs?: JsonObject,
  invocationSeed?: string,
): Promise<ProjectCompilation> => {
  const directory = await mkdtemp(join(projectRoot, ".resona-project-"));
  const outputFile = join(directory, "project.mjs");

  try {
    let resolvedProject: Awaited<ReturnType<typeof loadProjectConfiguration>>;
    try {
      resolvedProject = await loadProjectConfiguration(projectRoot, directory);
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
      bundle: true,
      format: "esm",
      jsx: "automatic",
      outfile: outputFile,
      packages: "external",
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
      inputs,
      effectiveConfiguration.seed.value,
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
