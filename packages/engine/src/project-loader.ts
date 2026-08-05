import { build } from "esbuild";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import type { CompositionIR, Diagnostic, ExecutionPlan } from "./model.js";
import { ResonaError } from "./resona-error.js";

type ProjectCompilation = Readonly<{
  composition: CompositionIR;
  plan: ExecutionPlan;
  diagnostics: readonly Diagnostic[];
}>;

const engineModulePath = (name: string, sourceExtension: string): string => {
  const runtimeDirectory = fileURLToPath(new URL(".", import.meta.url));
  const compiledPath = join(runtimeDirectory, `${name}.js`);
  return existsSync(compiledPath)
    ? compiledPath
    : join(runtimeDirectory, `${name}.${sourceExtension}`);
};

const compileProjectEntry = (entryPoint: string, compositionId: string): string => {
  const authoringPath = engineModulePath("authoring", "tsx");
  const planningPath = engineModulePath("planning", "ts");
  return [
    `import ${JSON.stringify(entryPoint)};`,
    `import {evaluateRegisteredComposition} from ${JSON.stringify(authoringPath)};`,
    `import {compileExecutionPlan} from ${JSON.stringify(planningPath)};`,
    `export const composition = evaluateRegisteredComposition(${JSON.stringify(compositionId)});`,
    "const compilation = compileExecutionPlan(composition);",
    "export const plan = compilation.plan;",
    "export const diagnostics = compilation.diagnostics;",
  ].join("\n");
};

const workerSource = [
  'import { parentPort, workerData } from "node:worker_threads";',
  "try {",
  "  const compilation = await import(workerData.moduleUrl);",
  '  parentPort.postMessage({ type: "success", compilation: {',
  "    composition: compilation.composition,",
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

const runInFreshWorker = (moduleUrl: string): Promise<ProjectCompilation> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`), {
      workerData: { moduleUrl },
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
        resolve(message.compilation as ProjectCompilation);
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

const resolveEntryPoint = (projectRoot: string): string => {
  const entryPoint = join(projectRoot, "src", "index.tsx");
  if (!existsSync(entryPoint)) {
    throw new Error(`No Resona entry point found at ${entryPoint}.`);
  }
  return entryPoint;
};

export const loadProjectCompilation = async (
  projectRoot: string,
  compositionId: string,
): Promise<ProjectCompilation> => {
  const directory = await mkdtemp(join(projectRoot, ".resona-project-"));
  const outputFile = join(directory, "project.mjs");

  try {
    await build({
      bundle: true,
      format: "esm",
      jsx: "automatic",
      outfile: outputFile,
      packages: "external",
      platform: "node",
      stdin: {
        contents: compileProjectEntry(resolveEntryPoint(projectRoot), compositionId),
        resolveDir: projectRoot,
        sourcefile: "resona-project-entry.ts",
      },
      target: "node24",
    });

    return await runInFreshWorker(pathToFileURL(outputFile).href);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
