import { build } from "esbuild";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CompositionIR, Diagnostic, ExecutionPlan } from "./model.js";

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

export const loadProjectCompilation = async (
  projectRoot: string,
  compositionId: string,
): Promise<ProjectCompilation> => {
  const directory = await mkdtemp(join(tmpdir(), "resona-project-"));
  const outputFile = join(directory, "project.mjs");

  try {
    await build({
      bundle: true,
      format: "esm",
      jsx: "automatic",
      outfile: outputFile,
      platform: "node",
      stdin: {
        contents: compileProjectEntry(join(projectRoot, "index.tsx"), compositionId),
        resolveDir: projectRoot,
        sourcefile: "resona-project-entry.ts",
      },
      target: "node24",
    });

    return (await import(pathToFileURL(outputFile).href)) as ProjectCompilation;
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
