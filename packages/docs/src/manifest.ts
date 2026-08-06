import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

export const documentationManifestRelativePath = ".resona-docs/manifest.json";
export const documentationManifestVersion = 1 as const;

export type DocumentationManifestEntry = Readonly<{
  path: string;
  sha256: string;
}>;

export type DocumentationManifest = Readonly<{
  version: typeof documentationManifestVersion;
  sources: readonly DocumentationManifestEntry[];
  outputs: readonly DocumentationManifestEntry[];
  orphanedOutputs: readonly DocumentationManifestEntry[];
}>;

export class DocumentationManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentationManifestError";
  }
}

export const hashContent = (content: string | Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

export const hashFile = async (path: string): Promise<string> => hashContent(await readFile(path));

export const readDocumentationManifest = async (
  projectRoot: string,
): Promise<DocumentationManifest | undefined> => {
  try {
    return parseDocumentationManifest(
      await readFile(join(projectRoot, documentationManifestRelativePath), "utf8"),
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
};

export const parseDocumentationManifest = (source: string): DocumentationManifest => {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new DocumentationManifestError("invalid JSON in .resona-docs/manifest.json");
  }
  if (!isRecord(value) || value.version !== documentationManifestVersion) {
    throw new DocumentationManifestError(".resona-docs/manifest.json has an unsupported version");
  }

  const sources = parseEntries(value.sources, "sources");
  const outputs = parseEntries(value.outputs, "outputs");
  const orphanedOutputs = parseEntries(value.orphanedOutputs, "orphanedOutputs");
  const paths = new Set<string>();
  for (const entry of [...sources, ...outputs, ...orphanedOutputs]) {
    if (paths.has(entry.path)) {
      throw new DocumentationManifestError(
        `.resona-docs/manifest.json contains duplicate path ${entry.path}`,
      );
    }
    paths.add(entry.path);
  }
  if (paths.has(documentationManifestRelativePath)) {
    throw new DocumentationManifestError(
      ".resona-docs/manifest.json cannot register itself as an output",
    );
  }

  return { orphanedOutputs, outputs, sources, version: documentationManifestVersion };
};

export const serializeDocumentationManifest = (manifest: DocumentationManifest): string =>
  `${JSON.stringify(
    {
      version: manifest.version,
      sources: sortEntries(manifest.sources),
      outputs: sortEntries(manifest.outputs),
      orphanedOutputs: sortEntries(manifest.orphanedOutputs),
    },
    null,
    2,
  )}\n`;

const parseEntries = (value: unknown, field: string): DocumentationManifestEntry[] => {
  if (!Array.isArray(value)) {
    throw new DocumentationManifestError(
      `.resona-docs/manifest.json field ${field} must be an array`,
    );
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new DocumentationManifestError(
        `.resona-docs/manifest.json ${field}[${index}] must be an object`,
      );
    }
    if (typeof entry.path !== "string" || !isSafeRelativePath(entry.path)) {
      throw new DocumentationManifestError(
        `.resona-docs/manifest.json ${field}[${index}] has an unsafe path`,
      );
    }
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      throw new DocumentationManifestError(
        `.resona-docs/manifest.json ${field}[${index}] has an invalid sha256`,
      );
    }
    return { path: entry.path, sha256: entry.sha256 };
  });
};

const sortEntries = (
  entries: readonly DocumentationManifestEntry[],
): DocumentationManifestEntry[] =>
  [...entries].sort((left, right) => compareDeterministically(left.path, right.path));

const isSafeRelativePath = (value: string): boolean => {
  if (value === "" || value.includes("\\") || value.includes("\0")) return false;
  if (posix.isAbsolute(value)) return false;
  const normalized = posix.normalize(value);
  return normalized === value && normalized !== "." && !normalized.startsWith("../");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;

const compareDeterministically = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
