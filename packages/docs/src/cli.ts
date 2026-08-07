import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanDocumentationSite } from "./clean.js";
import { buildDocumentationSite, type BuildDocumentationSiteResult } from "./index.js";
import type { CleanDocumentationSiteResult } from "./clean.js";

export const runDocumentationBuild = async (
  projectRoot: string,
): Promise<BuildDocumentationSiteResult> => buildDocumentationSite({ projectRoot });

export class DocumentationCheckError extends Error {}

export const runDocumentationCheck = async (
  projectRoot: string,
): Promise<BuildDocumentationSiteResult> => {
  const result = await buildDocumentationSite({ projectRoot, publish: false });
  if (result.outOfDateFiles.length > 0) {
    throw new DocumentationCheckError(
      "Generated documentation is out of date: " +
        result.outOfDateFiles.join(", ") +
        ". Run pnpm docs:build.",
    );
  }
  return result;
};

export const runDocumentationClean = async (
  projectRoot: string,
  dryRun = false,
): Promise<CleanDocumentationSiteResult> => cleanDocumentationSite({ dryRun, projectRoot });

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const args = process.argv.slice(2);
  const clean = args[0] === "clean";
  const check = args[0] === "check";
  const dryRun = args.includes("--dry-run");
  const projectRoot =
    args.find((arg) => !["check", "clean", "--dry-run"].includes(arg)) ?? process.cwd();
  if (clean) {
    const result = await runDocumentationClean(projectRoot, dryRun);
    const action = result.dryRun ? "Would remove" : "Removed";
    for (const path of result.removedFiles) process.stdout.write(`${action} ${path}\n`);
    process.stdout.write(
      `${result.dryRun ? "Would clean" : "Cleaned"} ${result.removedFiles.length} files.\n`,
    );
  } else if (check) {
    const result = await runDocumentationCheck(projectRoot);
    process.stdout.write(
      `Documentation artifacts are current (${result.sourceCount} Markdown sources, ${result.generatedFiles.length} generated files).\n`,
    );
  } else {
    const result = await runDocumentationBuild(projectRoot);
    process.stdout.write(
      `Generated ${result.generatedFiles.length} files from ${result.sourceCount} Markdown files.\n`,
    );
    if (result.orphanedFiles.length > 0) {
      process.stdout.write(
        `Orphaned generated files (not removed): ${result.orphanedFiles.join(", ")}\n`,
      );
    }
  }
}
