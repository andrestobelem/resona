import { rm, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  DocumentationManifestError,
  documentationManifestRelativePath,
  hashFile,
  readDocumentationManifest,
  type DocumentationManifest,
} from "./manifest.js";

export type CleanDocumentationSiteOptions = Readonly<{
  dryRun?: boolean;
  projectRoot: string;
}>;

export type CleanDocumentationSiteResult = Readonly<{
  dryRun: boolean;
  removedFiles: readonly string[];
}>;

export const cleanDocumentationSite = async (
  options: CleanDocumentationSiteOptions,
): Promise<CleanDocumentationSiteResult> => {
  const projectRoot = resolve(options.projectRoot);
  const manifest = await readDocumentationManifest(projectRoot);
  if (manifest === undefined) {
    throw new DocumentationManifestError(
      "cannot clean documentation without .resona-docs/manifest.json",
    );
  }
  await validateManifestFiles(projectRoot, manifest);

  const files = [
    ...manifest.outputs.map((entry) => entry.path),
    ...manifest.orphanedOutputs.map((entry) => entry.path),
  ].sort(compareDeterministically);
  files.push(documentationManifestRelativePath);
  if (options.dryRun === true) return { dryRun: true, removedFiles: files };

  for (const path of files) await rm(safeProjectPath(projectRoot, path), { force: false });
  return { dryRun: false, removedFiles: files };
};

const validateManifestFiles = async (
  projectRoot: string,
  manifest: DocumentationManifest,
): Promise<void> => {
  for (const entry of [...manifest.outputs, ...manifest.orphanedOutputs]) {
    const target = safeProjectPath(projectRoot, entry.path);
    let metadata;
    try {
      metadata = await stat(target);
    } catch (error) {
      throw new DocumentationManifestError(
        `manifest entry is missing: ${entry.path}${isNodeError(error) && error.code === "ENOENT" ? "" : ` (${error instanceof Error ? error.message : String(error)})`}`,
      );
    }
    if (!metadata.isFile()) {
      throw new DocumentationManifestError(`manifest entry is not a file: ${entry.path}`);
    }
    const actualHash = await hashFile(target);
    if (actualHash !== entry.sha256) {
      throw new DocumentationManifestError(`manifest hash mismatch: ${entry.path}`);
    }
  }
};

const safeProjectPath = (projectRoot: string, path: string): string => {
  const target = resolve(projectRoot, path);
  const relativePath = relative(projectRoot, target);
  if (
    isAbsolute(path) ||
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new DocumentationManifestError(`manifest path escapes project root: ${path}`);
  }
  return target;
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;

const compareDeterministically = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
